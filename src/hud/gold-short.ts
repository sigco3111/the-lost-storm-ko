export function goldShortText(price: number, gold: number): string {
  return `${Math.max(0, price - gold)} 골드 부족`;
}

export function isShort(price: number, gold: number): boolean {
  return price > gold;
}
