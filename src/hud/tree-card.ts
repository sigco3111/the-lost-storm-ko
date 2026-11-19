export interface CardState {
  readonly open: boolean;
  readonly hovered: string | null;
  readonly pinned: string | null;
}

export type CardEvent =
  | { readonly type: 'open' }
  | { readonly type: 'close' }
  | { readonly type: 'clear' }
  | { readonly type: 'point'; readonly node: string | null }
  | { readonly type: 'settle'; readonly node: string | null }
  | { readonly type: 'pin'; readonly node: string };

export const CLOSED_CARD: CardState = { open: false, hovered: null, pinned: null };

const OPEN_CARD: CardState = { ...CLOSED_CARD, open: true };

function point(state: CardState, node: string | null): CardState {
  if (node === null) return { ...state, hovered: null, pinned: null };
  return { ...state, hovered: node, pinned: node === state.pinned ? state.pinned : null };
}

export function stepCard(state: CardState, event: CardEvent): CardState {
  switch (event.type) {
    case 'open':
      return OPEN_CARD;
    case 'close':
      return CLOSED_CARD;
    case 'clear':
      return state.open ? OPEN_CARD : CLOSED_CARD;
    case 'point':
      return state.open ? point(state, event.node) : state;
    case 'settle':
      return state.open && event.node !== null ? point(state, event.node) : { ...state, hovered: null };
    case 'pin':
      return state.open ? { ...state, hovered: null, pinned: event.node } : state;
  }
  return state;
}

export function cardNode(state: CardState): string | null {
  return state.open ? (state.hovered ?? state.pinned) : null;
}

export const CARD_PRESENCE = {
  stillMs: 280,
  fadeMs: 120,
} as const;

export interface CardPresence {
  readonly node: string | null;
  readonly visible: boolean;
}

export interface CardWish {
  readonly now: number;
  readonly open: boolean;
  readonly wanted: string | null;
  readonly movedAt: number;
}

export const HIDDEN_PRESENCE: CardPresence = { node: null, visible: false };

export function viewIsMoving(now: number, movedAt: number): boolean {
  return now - movedAt < CARD_PRESENCE.stillMs;
}

export function stepPresence(state: CardPresence, wish: CardWish): CardPresence {
  if (!wish.open) return HIDDEN_PRESENCE;
  const moving: boolean = viewIsMoving(wish.now, wish.movedAt);
  if (wish.wanted !== null) {
    if (moving) return { node: state.node ?? wish.wanted, visible: false };
    return { node: wish.wanted, visible: true };
  }
  return { node: state.node, visible: false };
}

export function glidesFrom(before: CardPresence, hiddenAt: number, now: number, movedAt: number): boolean {
  if (viewIsMoving(now, movedAt)) return false;
  return before.visible || now - hiddenAt < CARD_PRESENCE.fadeMs;
}

export interface CardBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PointerSpot {
  readonly x: number;
  readonly y: number;
}

function cross(origin: PointerSpot, a: PointerSpot, b: PointerSpot): number {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

function inBox(spot: PointerSpot, box: CardBox): boolean {
  return spot.x >= box.x && spot.x <= box.x + box.width && spot.y >= box.y && spot.y <= box.y + box.height;
}

function turn(angle: number): number {
  if (angle > Math.PI) return angle - 2 * Math.PI;
  if (angle <= -Math.PI) return angle + 2 * Math.PI;
  return angle;
}

export function headingInto(from: PointerSpot, to: PointerSpot, box: CardBox): boolean {
  if (box.width <= 0 || box.height <= 0 || inBox(from, box)) return false;
  if (from.x === to.x && from.y === to.y) return false;
  const centre: number = Math.atan2(box.y + box.height / 2 - from.y, box.x + box.width / 2 - from.x);
  const corners: readonly PointerSpot[] = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x, y: box.y + box.height },
    { x: box.x + box.width, y: box.y + box.height },
  ];
  let left: PointerSpot = { x: box.x, y: box.y };
  let right: PointerSpot = left;
  let least: number = Number.POSITIVE_INFINITY;
  let most: number = Number.NEGATIVE_INFINITY;
  for (const corner of corners) {
    const angle: number = turn(Math.atan2(corner.y - from.y, corner.x - from.x) - centre);
    if (angle < least) {
      least = angle;
      left = corner;
    }
    if (angle > most) {
      most = angle;
      right = corner;
    }
  }
  const first: number = cross(from, left, to);
  const second: number = cross(left, right, to);
  const third: number = cross(right, from, to);
  return (first >= 0 && second >= 0 && third >= 0) || (first <= 0 && second <= 0 && third <= 0);
}
