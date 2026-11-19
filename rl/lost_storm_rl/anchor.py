from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import torch
from torch.distributions import Categorical

from .bridge import Demonstrations
from .model import Policy, head_masks

FAIL_FLOOR = 0.05
HEAD_NAMES = ("move", "skill", "target", "use")


@dataclass
class LevelCurriculum:
    low: int
    high: int
    mix: float
    rate: float = 0.05
    wins: list[float] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.wins:
            self.wins = [0.5] * (self.high - self.low + 1)

    def note(self, episodes: list[dict[str, Any]]) -> None:
        for episode in episodes:
            level = episode.get("level")
            if episode.get("situation", "arena") != "arena" or not isinstance(level, int) or not self.low <= level <= self.high:
                continue
            index = level - self.low
            won = 1.0 if episode["outcome"] == "won" else 0.0
            self.wins[index] += self.rate * (won - self.wins[index])

    def weights(self) -> list[float]:
        if self.mix <= 0:
            return []
        failing = [1.0 - win + FAIL_FLOOR for win in self.wins]
        total = sum(failing)
        even = 1.0 / len(self.wins)
        return [round((1 - self.mix) * even + self.mix * fail / total, 6) for fail in failing]

    def win_between(self, low: int, high: int) -> float:
        picked = [win for level, win in enumerate(self.wins, start=self.low) if low <= level <= high]
        return float(np.mean(picked)) if picked else float("nan")


@dataclass
class ImitationStats:
    loss: torch.Tensor
    totals: np.ndarray
    correct: np.ndarray
    seen: np.ndarray


def imitation_loss(policy: Policy, obs: torch.Tensor, mask: torch.Tensor, actions: torch.Tensor) -> ImitationStats:
    logits, _ = policy.logits(obs, mask)
    loss = torch.zeros((), device=obs.device)
    allowed = head_masks(policy.shape, mask)
    totals = np.zeros(4)
    correct = np.zeros(4)
    seen = np.zeros(4)
    for head, logit in enumerate(logits):
        label = actions[:, head]
        valid = allowed[head].gather(1, label.unsqueeze(1)).squeeze(1)
        if head == 2:
            valid = valid & (actions[:, 1] > 0)
        if not bool(valid.any()):
            continue
        part = -Categorical(logits=logit[valid]).log_prob(label[valid]).mean()
        loss = loss + part
        count = int(valid.sum())
        totals[head] += part.item() * count
        correct[head] += float((logit[valid].argmax(dim=1) == label[valid]).float().sum())
        seen[head] += count
    return ImitationStats(loss, totals, correct, seen)


class BotBuffer:
    def __init__(self, keep: int) -> None:
        self.parts: deque[Demonstrations] = deque(maxlen=max(1, keep))
        self.obs = np.zeros((0, 0), dtype=np.float32)
        self.mask = np.zeros((0, 0), dtype=np.uint8)
        self.actions = np.zeros((0, 4), dtype=np.int32)

    def add(self, part: Demonstrations) -> None:
        if len(part.actions) == 0:
            return
        self.parts.append(part)
        self.obs = np.concatenate([held.obs for held in self.parts])
        self.mask = np.concatenate([held.mask for held in self.parts])
        self.actions = np.concatenate([held.actions for held in self.parts])

    def __len__(self) -> int:
        return len(self.actions)

    def sample(self, rng: np.random.Generator, size: int) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        index = rng.integers(0, len(self.actions), size=size)
        return torch.from_numpy(self.obs[index]), torch.from_numpy(self.mask[index]), torch.from_numpy(self.actions[index]).long()


def bot_weight(start: float, floor: float, decay: int, update: int) -> float:
    if start <= 0:
        return 0.0
    if decay <= 0:
        return start
    left = max(0.0, 1.0 - (update - 1) / decay)
    return max(min(floor, start), start * left)


def paired(model: list[dict[str, Any]], bot: list[dict[str, Any]]) -> dict[str, Any]:
    by_seed = {episode["seed"]: episode for episode in bot}
    pairs = [(episode, by_seed[episode["seed"]]) for episode in model if episode["seed"] in by_seed]
    bands = ((1, 4), (5, 8), (9, 12))
    table: dict[str, Any] = {}
    for low, high in bands:
        picked = [(mine, theirs) for mine, theirs in pairs if low <= theirs["level"] <= high]
        if picked:
            table[f"levels {low}-{high}"] = {"episodes": len(picked), "model_won": round(sum(mine["outcome"] == "won" for mine, _ in picked) / len(picked), 3), "bot_won": round(sum(theirs["outcome"] == "won" for _, theirs in picked) / len(picked), 3)}
    return {
        "paired": len(pairs),
        "model_won": round(sum(mine["outcome"] == "won" for mine, _ in pairs) / max(1, len(pairs)), 3),
        "bot_won": round(sum(theirs["outcome"] == "won" for _, theirs in pairs) / max(1, len(pairs)), 3),
        "bot_only": sum(1 for mine, theirs in pairs if theirs["outcome"] == "won" and mine["outcome"] != "won"),
        "model_only": sum(1 for mine, theirs in pairs if mine["outcome"] == "won" and theirs["outcome"] != "won"),
        "by_level": table,
    }
