/**
 * Shared utilities for Mentiora SDK plugins.
 */

import type { MentioraClient } from '../client';
import type { TraceEvent } from '../types';

/**
 * Send trace event (non-blocking, errors are logged but don't throw).
 */
export async function sendTraceSafely(
  mentioraClient: MentioraClient,
  event: TraceEvent,
  pluginName: string
): Promise<void> {
  try {
    await mentioraClient.tracing.sendTrace(event);
  } catch (err) {
    if (mentioraClient.debug) {
      console.error(
        `[Mentiora SDK - ${pluginName} Plugin] Failed to send trace: traceId=${event.traceId} spanId=${event.spanId} operation=${event.name}`,
        err
      );
    }
  }
}
