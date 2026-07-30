/**
 * Utility functions for MCP Apps UI
 */

/**
 * Combine class names (like clsx/cx)
 */
export function cx(
  ...classes: unknown[]
): string {
  return classes
    .filter((c): c is string => typeof c === "string" && c.length > 0)
    .join(" ");
}
