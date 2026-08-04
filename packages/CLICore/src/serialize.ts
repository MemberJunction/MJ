import type { MJCLIResult, OutputFormat } from './types';

/**
 * Single source of truth for serializing an {@link MJCLIResult} per format.
 * Both the runtime host's `Emit` and the usage commands call this so JSON/MD
 * envelopes are always rendered identically. Returns the empty string for
 * `text` — in text mode the plugin renders its own human output, not a result
 * blob. No trailing newline; callers add one.
 */
export function SerializeResult(result: MJCLIResult, format: OutputFormat): string {
  if (format === 'json') return JSON.stringify(result, null, 2);
  if (format === 'md') return '```json\n' + JSON.stringify(result, null, 2) + '\n```';
  return '';
}
