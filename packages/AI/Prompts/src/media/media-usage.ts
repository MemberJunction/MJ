/**
 * @fileoverview Reading media quantities back out of a driver's usage. Internal to the package.
 *
 * @module @memberjunction/ai-prompts
 */

import type { ModelUsage } from '@memberjunction/ai';

/**
 * The seconds of media in a usage record, when it is counted in `Seconds`: the output units for
 * audio or video a model produced, the input units for audio it was given. Undefined otherwise,
 * rather than a guess.
 */
export function SecondsIn(usage: ModelUsage | undefined, side: 'input' | 'output'): number | undefined {
  if (usage?.unitKind !== 'Seconds') {
    return undefined;
  }
  const seconds = side === 'input' ? usage.inputUnits : usage.outputUnits;
  return seconds !== undefined && seconds > 0 ? seconds : undefined;
}
