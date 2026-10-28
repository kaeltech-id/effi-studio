/**
 * Reads a `@theme` token at runtime. xterm takes its theme as values, not
 * classes, so this is how the terminal stays on the same five colors as the
 * chrome without a literal hex in a component.
 */
export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
