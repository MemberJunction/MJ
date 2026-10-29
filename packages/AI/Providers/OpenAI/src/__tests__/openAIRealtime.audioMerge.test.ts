import { describe, it, expect } from 'vitest';
import { MergeAudioOverride } from '../models/openAIRealtime.js';

const built = {
  input: { transcription: { model: 'gpt-4o-mini-transcribe' },
           turn_detection: { type: 'server_vad', silence_duration_ms: 700, create_response: true, interrupt_response: true } },
  output: { voice: 'alloy' },
} as const;

describe('MergeAudioOverride', () => {
  it('merges a leaf into the built turn_detection and keeps transcription', () => {
    const out = MergeAudioOverride(built, { input: { turn_detection: { idle_timeout_ms: 8000 } } }, false);
    expect(out?.input?.transcription).toEqual({ model: 'gpt-4o-mini-transcribe' });
    expect(out?.input?.turn_detection).toEqual({ ...built.input.turn_detection, idle_timeout_ms: 8000 });
    expect(out?.output).toEqual({ voice: 'alloy' });
  });
  it('replaces turn_detection when the override changes its type', () => {
    const out = MergeAudioOverride(built, { input: { turn_detection: { type: 'semantic_vad', eagerness: 'low' } } }, false);
    expect(out?.input?.turn_detection).toEqual({ type: 'semantic_vad', eagerness: 'low' });
    expect(out?.input?.transcription).toEqual({ model: 'gpt-4o-mini-transcribe' });
  });
  it('keeps the meeting-mode floor create_response:false', () => {
    const meeting = { input: { turn_detection: { type: 'server_vad', create_response: false, interrupt_response: true } } };
    const out = MergeAudioOverride(meeting, { input: { turn_detection: { create_response: true } } }, true);
    expect(out?.input?.turn_detection?.create_response).toBe(false);
  });
  it('lets the bag set create_response outside meeting mode', () => {
    const out = MergeAudioOverride(built, { input: { turn_detection: { create_response: false } } }, false);
    expect(out?.input?.turn_detection?.create_response).toBe(false);
  });
  it('ignores a non-object override', () => {
    expect(MergeAudioOverride(built, 'off', false)).toEqual(built);
    expect(MergeAudioOverride(built, null, false)).toEqual(built);
    expect(MergeAudioOverride(built, [], false)).toEqual(built);
  });
  it('a null leaf removes the built key', () => {
    const out = MergeAudioOverride(built, { input: { transcription: null } }, false);
    expect(out?.input?.transcription).toBeUndefined();
    expect(out?.input?.turn_detection).toEqual(built.input.turn_detection);
  });
  it('returns the override alone when nothing was built', () => {
    expect(MergeAudioOverride(undefined, { input: { turn_detection: { type: 'server_vad' } } }, false))
      .toEqual({ input: { turn_detection: { type: 'server_vad' } } });
  });
});
