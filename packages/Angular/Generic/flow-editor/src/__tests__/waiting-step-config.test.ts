import { describe, it, expect } from 'vitest';
import {
  DefaultWaitingStepConfiguration,
  DescribeDuration,
  IsWaitingStepType,
  ParsePositiveNumber,
  ReadStepConfigBag,
  ReadWaitFields,
  WaitingStepSubtitle,
  WithStepConfigField,
  WithWaitMode
} from '../lib/agent-editor/waiting-step-config';

describe('waiting-step-config', () => {
  it('knows which step types wait', () => {
    expect(['Human', 'External', 'Wait'].every(IsWaitingStepType)).toBe(true);
    expect(IsWaitingStepType('Action')).toBe(false);
    expect(IsWaitingStepType(null)).toBe(false);
  });

  it('reads a malformed configuration as empty instead of throwing', () => {
    expect(ReadStepConfigBag('{nope')).toEqual({});
    expect(ReadStepConfigBag('[1]')).toEqual({});
    expect(ReadStepConfigBag(null)).toEqual({});
  });

  it('sets one field and keeps every other, including ones the editor does not show', () => {
    const raw = JSON.stringify({ provider: 'X', providerConfiguration: { a: 1 }, futureField: true });
    const next = ReadStepConfigBag(WithStepConfigField(raw, 'expiresInHours', 24));
    expect(next).toEqual({ provider: 'X', providerConfiguration: { a: 1 }, futureField: true, expiresInHours: 24 });
  });

  it('removes a field set to empty, so the runtime reads it as absent', () => {
    const next = ReadStepConfigBag(WithStepConfigField(JSON.stringify({ provider: 'X' }), 'provider', '  '));
    expect(next).toEqual({});
  });

  it('parses a number field, and treats blank or nonsense as unset', () => {
    expect(ParsePositiveNumber(' 12 ')).toBe(12);
    expect(ParsePositiveNumber('')).toBeUndefined();
    expect(ParsePositiveNumber('soon')).toBeUndefined();
  });

  it('switches a Wait between duration and moment without ever holding both', () => {
    const asUntil = ReadStepConfigBag(WithWaitMode(JSON.stringify({ durationSeconds: 60 }), 'until'));
    expect(asUntil).toEqual({ until: '' });
    const back = ReadStepConfigBag(WithWaitMode(JSON.stringify({ until: 'payload.x' }), 'duration'));
    expect(back).toEqual({ durationSeconds: 3600 });
  });

  it('reads a Wait\'s mode from what it holds', () => {
    expect(ReadWaitFields(JSON.stringify({ until: 'payload.x' })).Mode).toBe('until');
    expect(ReadWaitFields(JSON.stringify({ durationSeconds: 5 })).Mode).toBe('duration');
    expect(ReadWaitFields(null).Mode).toBe('duration');
  });

  it('starts each new step with a shape the runtime accepts', () => {
    expect(ReadStepConfigBag(DefaultWaitingStepConfiguration('Wait'))).toEqual({ durationSeconds: 3600 });
    expect(ReadStepConfigBag(DefaultWaitingStepConfiguration('External'))).toEqual({ domain: 'external' });
    expect(ReadStepConfigBag(DefaultWaitingStepConfiguration('Human'))).toEqual({});
  });

  it('describes durations in the largest whole unit', () => {
    expect(DescribeDuration(86400)).toBe('1 day');
    expect(DescribeDuration(7200)).toBe('2 hours');
    expect(DescribeDuration(90)).toBe('90 seconds');
  });

  it('subtitles say what each step waits on', () => {
    expect(WaitingStepSubtitle('Wait', JSON.stringify({ durationSeconds: 3600 }))).toBe('Waits 1 hour');
    expect(WaitingStepSubtitle('Wait', JSON.stringify({ until: 'payload.d' }))).toBe('Waits until payload.d');
    expect(WaitingStepSubtitle('External', JSON.stringify({ domain: 'stripe', correlationKey: 'payload.id' }))).toBe('Waits on stripe: payload.id');
    expect(WaitingStepSubtitle('External', null)).toBe('Waits on external');
    expect(WaitingStepSubtitle('Human', JSON.stringify({ provider: 'BizAppsTasks' }))).toBe('Person, via BizAppsTasks');
    expect(WaitingStepSubtitle('Human', JSON.stringify({ provider: 'AgentRequest' }))).toBe('Waits on a person');
  });
});
