let refCounter = 0;

export function resetRefs(): void {
  refCounter = 0;
}

export function nextRef(): string {
  return `e${++refCounter}`;
}
