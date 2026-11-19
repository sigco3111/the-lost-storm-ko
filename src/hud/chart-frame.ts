import { toScreen } from './atlas-view.ts';
import type { AtlasFrame, AtlasView, ScreenPoint } from './atlas-view.ts';
import { labelsOverlap, pinLabel, spreadLabels } from './chart-view.ts';
import type { LabelBox, PinnedLabel } from './chart-view.ts';

export interface FrameLabel {
  readonly at: ScreenPoint;
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly pins: boolean;
  place(transform: string, pinned: boolean): void;
}

export interface FrameTargets {
  readonly labels: readonly FrameLabel[];
  moveBoard(transform: string): void;
}

export function boardTransform(view: AtlasView, frame: AtlasFrame): string {
  const corner: ScreenPoint = toScreen(view, frame, { x: 0, y: 0 });
  return `translate(${corner.x}px, ${corner.y}px) scale(${view.scale})`;
}

export function labelTransform(box: LabelBox): string {
  return `translate(${Math.round(box.x)}px, ${Math.round(box.y)}px) translate(-50%, -50%)`;
}

export function writeView(targets: FrameTargets, view: AtlasView, frame: AtlasFrame, foot: number): LabelBox[] {
  targets.moveBoard(boardTransform(view, frame));
  const pinning: readonly FrameLabel[] = targets.labels.filter((label: FrameLabel): boolean => label.pins);
  const pins: readonly PinnedLabel[] = pinning.map((label: FrameLabel): PinnedLabel => pinLabel(toScreen(view, frame, label.at), label.halfWidth, label.halfHeight, frame, foot));
  const shown: LabelBox[] = spreadLabels(
    pins.map((pin: PinnedLabel, index: number): LabelBox => ({ x: pin.x, y: pin.y, halfWidth: pinning[index]?.halfWidth ?? 0, halfHeight: pinning[index]?.halfHeight ?? 0 })),
    frame,
  );
  pinning.forEach((label: FrameLabel, index: number): void => {
    const box: LabelBox | undefined = shown[index];
    if (box === undefined) return;
    label.place(labelTransform(box), pins[index]?.pinned ?? false);
  });
  for (const label of targets.labels) {
    if (label.pins) continue;
    const at: ScreenPoint = toScreen(view, frame, label.at);
    const box: LabelBox = { x: at.x, y: at.y, halfWidth: label.halfWidth, halfHeight: label.halfHeight };
    const hidden: boolean = pinLabel(at, label.halfWidth, label.halfHeight, frame, foot).pinned || shown.some((other: LabelBox): boolean => labelsOverlap(box, other));
    label.place(labelTransform(box), hidden);
    if (!hidden) shown.push(box);
  }
  return shown;
}
