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
    const meeting = { input: { turn_detection: { type: 'server_vad', create_response: false, interrupt_response: true } } } as const;
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

  describe('meeting-mode floor cannot be bypassed', () => {
    const meetingBuilt = { input: { transcription: { model: 'm' },
      turn_detection: { type: 'server_vad', create_response: false, interrupt_response: true } } } as const;
    const bypasses: Array<[string, unknown]> = [
      ['turn_detection null', { input: { turn_detection: null } }],
      ['input null', { input: null }],
      ['input string', { input: 'x' }],
      ['turn_detection string', { input: { turn_detection: 'off' } }],
    ];
    for (const [name, bag] of bypasses) {
      it(`restores the floor for ${name}`, () => {
        const out = MergeAudioOverride(meetingBuilt, bag, true);
        expect(out?.input?.turn_detection).toEqual(meetingBuilt.input.turn_detection);
      });
    }
    it('uses a default server_vad block when nothing was built', () => {
      const out = MergeAudioOverride(undefined, { input: { turn_detection: null } }, true);
      expect(out?.input?.turn_detection).toEqual({ type: 'server_vad', create_response: false, interrupt_response: true });
    });
    it('does not restore outside meeting mode', () => {
      const out = MergeAudioOverride(built, { input: { turn_detection: null } }, false);
      expect(out?.input?.turn_detection).toBeUndefined();
    });
    it('applies the floor after a cross-type replace', () => {
      const out = MergeAudioOverride(meetingBuilt, { input: { turn_detection: { type: 'semantic_vad', create_response: true } } }, true);
      expect(out?.input?.turn_detection).toEqual({ type: 'semantic_vad', create_response: false });
    });
  });
  it('does not mutate built or override', () => {
    const b = structuredClone(built);
    const o = { input: { turn_detection: { idle_timeout_ms: 1, type: 'semantic_vad' }, transcription: null } };
    const oCopy = structuredClone(o);
    MergeAudioOverride(b, o, true);
    expect(b).toEqual(built);
    expect(o).toEqual(oCopy);
  });
  it('ignores prototype-polluting keys', () => {
    const o = JSON.parse('{"__proto__":{"polluted":1},"input":{"constructor":{"x":1}}}');
    const out = MergeAudioOverride(built, o, false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(out, 'polluted')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(out?.input, 'constructor')).toBe(false);
  });
});
