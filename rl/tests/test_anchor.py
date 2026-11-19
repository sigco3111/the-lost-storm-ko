from __future__ import annotations

import numpy as np
import torch

from lost_storm_rl.anchor import BotBuffer, LevelCurriculum, bot_weight, imitation_loss, paired
from lost_storm_rl.bridge import Demonstrations, _shares
from lost_storm_rl.model import Policy

from test_bridge import contract


def test_the_curriculum_leans_toward_the_levels_the_model_loses() -> None:
    curriculum = LevelCurriculum(1, 3, mix=0.5, rate=1.0)
    curriculum.note([{"situation": "arena", "level": 1, "outcome": "won"}, {"situation": "arena", "level": 3, "outcome": "died"}, {"situation": "duel", "level": 2, "outcome": "died"}])
    assert curriculum.wins == [1.0, 0.5, 0.0]
    weights = curriculum.weights()
    assert abs(sum(weights) - 1) < 1e-5
    assert weights[2] > weights[1] > weights[0] > 0
    assert curriculum.win_between(1, 2) == 0.75


def test_no_curriculum_sends_no_weights() -> None:
    assert LevelCurriculum(1, 12, mix=0.0).weights() == []


def test_the_bot_weight_fades_to_its_floor() -> None:
    assert bot_weight(0.5, 0.05, 100, 1) == 0.5
    assert abs(bot_weight(0.5, 0.05, 100, 51) - 0.25) < 1e-9
    assert bot_weight(0.5, 0.05, 100, 500) == 0.05
    assert bot_weight(0.0, 0.05, 100, 1) == 0.0
    assert bot_weight(0.3, 0.05, 0, 900) == 0.3
    assert bot_weight(0.03, 0.05, 100, 1) == 0.03
    assert bot_weight(0.03, 0.05, 100, 500) == 0.03


def test_the_buffer_keeps_only_the_latest_runs() -> None:
    buffer = BotBuffer(2)
    for value in (1, 2, 3):
        buffer.add(Demonstrations(np.full((2, 3), value, dtype=np.float32), np.ones((2, 4), dtype=np.uint8), np.zeros((2, 4), dtype=np.int32), []))
    assert len(buffer) == 4
    obs, _, _ = buffer.sample(np.random.default_rng(1), 50)
    assert set(obs[:, 0].tolist()) == {2.0, 3.0}


def test_imitation_loss_skips_the_target_when_no_skill_is_used() -> None:
    shape = contract()
    policy = Policy(shape, width=16)
    size = shape["layout"]["size"]
    mask = torch.ones((2, shape["layout"]["mask"]), dtype=torch.uint8)
    actions = torch.tensor([[1, 0, 1, 0], [0, 1, 1, 0]])
    stats = imitation_loss(policy, torch.zeros((2, size)), mask, actions)
    assert stats.seen.tolist() == [2, 2, 1, 2]
    assert float(stats.loss) > 0


def test_paired_compares_the_model_and_the_bot_on_the_same_arenas() -> None:
    model = [{"seed": 1, "outcome": "won"}, {"seed": 2, "outcome": "died"}, {"seed": 3, "outcome": "died"}]
    bot = [{"seed": 1, "level": 2, "outcome": "won"}, {"seed": 2, "level": 10, "outcome": "won"}, {"seed": 3, "level": 11, "outcome": "died"}]
    result = paired(model, bot)
    assert result["paired"] == 3
    assert result["bot_only"] == 1
    assert result["model_only"] == 0
    assert result["by_level"]["levels 9-12"] == {"episodes": 2, "model_won": 0.0, "bot_won": 0.5}


def test_work_is_shared_across_workers_without_empty_shares() -> None:
    assert _shares(5, 2) == [(0, 3), (3, 2)]
    assert _shares(2, 2) == [(0, 1), (1, 1)]
