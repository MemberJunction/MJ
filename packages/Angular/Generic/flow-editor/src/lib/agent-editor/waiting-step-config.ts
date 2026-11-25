/**
 * @fileoverview Reading and writing the configuration of the three steps no runner executes —
 * Human, External and Wait — as a flow editor stores it on `AIAgentStep.Configuration`.
 *
 * Deliberately holds no rules about what is VALID. The flow's run check compiles and validates with
 * the runtime itself (see `flow-run-check.ts`), so "set exactly one of until and durationSeconds"
 * reaches the author in the runtime's own words. This module only turns a field edit into the JSON
 * the compiler reads, and the JSON back into something a field can show.
 */

/** The step types this module covers. */
export type WaitingStepType = 'Human' | 'External' | 'Wait';

/** True for the step types that finish without a runner. */
export function IsWaitingStepType(stepType: string | null | undefined): stepType is WaitingStepType {
  return stepType === 'Human' || stepType === 'External' || stepType === 'Wait';
}

/** A configuration bag, tolerant of a missing or malformed value. */
export type StepConfigBag = Record<string, unknown>;

/** Parses `Configuration`, yielding `{}` for anything that is not a JSON object. */
export function ReadStepConfigBag(raw: string | null | undefined): StepConfigBag {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as StepConfigBag) : {};
  } catch {
    return {};
  }
}

/**
 * Sets (or, for `undefined` / an empty string, removes) one field and returns the new JSON.
 *
 * Every other field is kept, including ones this editor does not show — `providerConfiguration`, or
 * whatever a later runtime adds — so editing one field never silently drops another.
 */
export function WithStepConfigField(raw: string | null | undefined, field: string, value: unknown): string {
  const bag = { ...ReadStepConfigBag(raw) };
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    delete bag[field];
  } else {
    bag[field] = typeof value === 'string' ? value.trim() : value;
  }
  return JSON.stringify(bag, null, 2);
}

/** A text field's value as a positive number, or `undefined` for empty / unusable input. */
export function ParsePositiveNumber(text: string): number | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

/** What a step of this type starts with when it is dropped onto the canvas. */
export function DefaultWaitingStepConfiguration(stepType: WaitingStepType): string {
  switch (stepType) {
    case 'Wait':
      return JSON.stringify({ durationSeconds: 3600 }, null, 2);
    case 'External':
      return JSON.stringify({ domain: 'external' }, null, 2);
    case 'Human':
      return JSON.stringify({}, null, 2);
  }
}

/** A Wait's `until` / `durationSeconds`, as the two fields show them. */
export type WaitFieldValues = { Mode: 'duration' | 'until'; DurationSeconds: number | null; Until: string };

export function ReadWaitFields(raw: string | null | undefined): WaitFieldValues {
  const bag = ReadStepConfigBag(raw);
  const until = typeof bag['until'] === 'string' ? bag['until'] : '';
  const duration = typeof bag['durationSeconds'] === 'number' ? bag['durationSeconds'] : null;
  return { Mode: until && duration === null ? 'until' : 'duration', DurationSeconds: duration, Until: until };
}

/**
 * Switches a Wait between counting a duration and waiting for a moment. Clears the other field, so
 * the step never holds both — the one shape the runtime refuses outright.
 */
export function WithWaitMode(raw: string | null | undefined, mode: 'duration' | 'until'): string {
  const bag = { ...ReadStepConfigBag(raw) };
  if (mode === 'duration') {
    delete bag['until'];
    if (typeof bag['durationSeconds'] !== 'number') bag['durationSeconds'] = 3600;
  } else {
    delete bag['durationSeconds'];
    if (typeof bag['until'] !== 'string') bag['until'] = '';
  }
  return JSON.stringify(bag, null, 2);
}

/** "2 hours", "1 day", "90 seconds". */
export function DescribeDuration(seconds: number): string {
  const units: [number, string][] = [[86400, 'day'], [3600, 'hour'], [60, 'minute']];
  for (const [size, name] of units) {
    if (seconds >= size && seconds % size === 0) {
      const n = seconds / size;
      return `${n} ${name}${n === 1 ? '' : 's'}`;
    }
  }
  return `${seconds} second${seconds === 1 ? '' : 's'}`;
}

/** The one line under a waiting step's name on the canvas. */
export function WaitingStepSubtitle(stepType: WaitingStepType, raw: string | null | undefined): string {
  const bag = ReadStepConfigBag(raw);
  switch (stepType) {
    case 'Wait': {
      const w = ReadWaitFields(raw);
      if (w.Mode === 'until') return w.Until ? `Waits until ${w.Until}` : 'Waits for a moment in time';
      return w.DurationSeconds !== null ? `Waits ${DescribeDuration(w.DurationSeconds)}` : 'Waits for a moment in time';
    }
    case 'External': {
      const key = typeof bag['correlationKey'] === 'string' ? bag['correlationKey'] : '';
      const domain = typeof bag['domain'] === 'string' && bag['domain'] ? bag['domain'] : 'external';
      return key ? `Waits on ${domain}: ${key}` : `Waits on ${domain}`;
    }
    case 'Human': {
      const provider = typeof bag['provider'] === 'string' ? bag['provider'].trim() : '';
      return provider && provider.toLowerCase() !== 'agentrequest' ? `Person, via ${provider}` : 'Waits on a person';
    }
  }
}
