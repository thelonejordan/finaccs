/**
 * Simple logger utility for error handling.
 * In development, logs to console. Can be extended to send to external services.
 */

const isDev = import.meta.env.DEV

export function logError(message: string, error?: unknown): void {
  if (isDev) {
    // In development, log to console for debugging
    // eslint-disable-next-line no-console
    console.error(`[Error] ${message}`, error)
  }
  // In production, errors are silently handled
  // TODO: Add external error reporting service (e.g., Sentry) in production
}

export function logWarning(message: string, data?: unknown): void {
  if (isDev) {
    // eslint-disable-next-line no-console
    console.warn(`[Warning] ${message}`, data)
  }
}
