/**
 * Shared micro-interactions for MCP Apps UIs
 *
 * @module lib/sim/src/ui/shared/interactions
 */

export const interactive = {
  scaleOnHover: "transition-transform duration-150 ease-out cursor-pointer hover:scale-[1.02] active:scale-[0.98]",
  focusRing: "focus:outline-none focus:ring-2 focus:ring-blue-500/30",
  rowHover: "transition-colors duration-150 cursor-pointer hover:bg-bg-subtle",
  cardHover: "transition-all duration-200 hover:shadow-lg hover:-translate-y-px",
  clickable: "cursor-pointer select-none transition-opacity duration-150 hover:opacity-80 active:opacity-60",
};

export const statusStyles = {
  pass: "text-green-600 bg-green-500/15 dark:text-green-400 dark:bg-green-500/20",
  fail: "text-red-600 bg-red-500/15 dark:text-red-400 dark:bg-red-500/20",
  error: "text-yellow-600 bg-yellow-500/15 dark:text-yellow-400 dark:bg-yellow-500/20",
  unresolved: "text-gray-600 bg-gray-500/10 dark:text-gray-400 dark:bg-gray-500/15",
};

export const typography = {
  sectionTitle: "text-lg font-semibold text-fg-default",
  label: "text-sm font-medium text-fg-default",
  value: "text-2xl font-bold font-mono tabular-nums",
  valueSmall: "text-lg font-semibold font-mono tabular-nums",
  muted: "text-xs text-fg-muted",
};

export const containers = {
  root: "p-4 font-sans text-sm text-fg-default bg-bg-canvas",
  card: "p-4 bg-bg-subtle rounded-lg border border-border-default",
  centered: "flex items-center justify-center p-10 text-fg-muted",
};

export function cx(...classes: unknown[]): string {
  return classes
    .filter((c): c is string => typeof c === "string" && c.length > 0)
    .join(" ");
}
