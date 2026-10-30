/**
 * Reads a `@theme` token at runtime. xterm takes its theme as values, not
 * classes, so this is how the terminal stays on the same five colors as the
 * chrome without a literal hex in a component.
 */
export type ThemeToken =
  | '--color-ground' | '--color-surface' | '--color-raised' | '--color-hover'
  | '--color-border' | '--color-text' | '--color-muted' | '--color-accent'
  | '--color-on-accent' | '--color-accent-tint' | '--color-brand-violet'
  | '--color-brand-blue' | '--color-success' | '--color-warning'
  | '--color-error' | '--color-terminal' | '--font-ui' | '--font-mono';

/**
 * The union is the point. This is the only place a `@theme` token name lives
 * as runtime data rather than as a Tailwind class, so it is the only place a
 * rename can miss: getPropertyValue returns '' for a token that no longer
 * exists, xterm falls back, and the terminal ships a quietly wrong colour
 * with nothing failing. The guards in tests/ sweep class strings; they cannot
 * see this. Widening it back to `string` removes the only check there is.
 */
export function token(name: ThemeToken): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
