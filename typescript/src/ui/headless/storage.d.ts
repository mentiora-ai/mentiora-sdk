/**
 * Minimal Storage interface for localStorage access.
 *
 * Declared here instead of using the full DOM lib so that headless code
 * is type-checked without DOM globals — any accidental use of browser-only
 * APIs (window, document, navigator, etc.) will be caught at compile time.
 */

interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

declare var localStorage: Storage | undefined;
