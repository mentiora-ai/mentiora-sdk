/**
 * cn — Minimal className merge utility.
 *
 * Joins class names, filtering out falsy values.
 * No external dependency (no clsx/tailwind-merge needed).
 */

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
