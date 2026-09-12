import { describe, it, expect } from 'vitest';
import {
  BuildRealtimeConfigOverridesJson,
  BuildRealtimeModelOptions,
  VoiceModelCandidate,
} from '../lib/services/realtime-pairing';

/**
 * The "Voice model" option builder the picker applies to {@link AIEngineBase}'s cached
 * `Models` — the pure replacement for the previous narrow RunView
 * (`IsActive = 1 AND AIModelType = 'Realtime'`, `OrderBy: 'Name'`). Filter parity with the
 * SQL it replaced is the contract under test: active-only, Realtime-type-only
 * (trim + case-insensitive, matching SQL collation), Name-sorted, ID+Name projection.
 */

function model(overrides: Partial<VoiceModelCandidate> & { ID: string; Name: string }): VoiceModelCandidate {
  return {
    AIModelType: 'Realtime',
    IsActive: true,
    ...overrides,
  };
}

describe('BuildRealtimeModelOptions', () => {
  it('keeps only ACTIVE models of type Realtime, projected to {ID, Name}', () => {
    const options = BuildRealtimeModelOptions([
      model({ ID: 'm1', Name: 'Realtime One' }),
      model({ ID: 'm2', Name: 'Inactive Realtime', IsActive: false }),
      model({ ID: 'm3', Name: 'Some LLM', AIModelType: 'LLM' }),
      model({ ID: 'm4', Name: 'Untyped', AIModelType: null }),
    ]);
    expect(options).toEqual([{ ID: 'm1', Name: 'Realtime One' }]);
  });

  it('matches the Realtime type trim + case-insensitively (SQL-collation parity)', () => {
    const options = BuildRealtimeModelOptions([
      model({ ID: 'm1', Name: 'A', AIModelType: ' realtime ' }),
      model({ ID: 'm2', Name: 'B', AIModelType: 'REALTIME' }),
    ]);
    expect(options.map(o => o.ID)).toEqual(['m1', 'm2']);
  });

  it('sorts by Name ascending (parity with the previous OrderBy)', () => {
    const options = BuildRealtimeModelOptions([
      model({ ID: 'm2', Name: 'Zeta Voice' }),
      model({ ID: 'm1', Name: 'Alpha Voice' }),
      model({ ID: 'm3', Name: 'Mid Voice' }),
    ]);
    expect(options.map(o => o.Name)).toEqual(['Alpha Voice', 'Mid Voice', 'Zeta Voice']);
  });

  it('returns an empty list for an empty cache and never mutates the input', () => {
    expect(BuildRealtimeModelOptions([])).toEqual([]);
    const input = [model({ ID: 'm2', Name: 'B' }), model({ ID: 'm1', Name: 'A' })];
    BuildRealtimeModelOptions(input);
    expect(input.map(m => m.ID)).toEqual(['m2', 'm1']); // input order untouched
  });
});

describe('BuildRealtimeConfigOverridesJson', () => {
  it('returns null when neither model nor voice is specified', () => {
    expect(BuildRealtimeConfigOverridesJson(null, null)).toBeNull();
    expect(BuildRealtimeConfigOverridesJson('', '')).toBeNull();
    expect(BuildRealtimeConfigOverridesJson(undefined, undefined)).toBeNull();
  });

  it('builds valid JSON payload when model preference is set', () => {
    const json = BuildRealtimeConfigOverridesJson('51F8EF42-316F-41CB-81E9-A63996AD90F7', null);
    expect(json).toBe('{"realtime":{"modelPreference":"51F8EF42-316F-41CB-81E9-A63996AD90F7"}}');
  });

  it('builds valid JSON payload when both model and voice are set', () => {
    const json = BuildRealtimeConfigOverridesJson('51F8EF42-316F-41CB-81E9-A63996AD90F7', 'alloy');
    expect(json).toBe('{"realtime":{"modelPreference":"51F8EF42-316F-41CB-81E9-A63996AD90F7","voice":{"default":{"voice":"alloy"}}}}');
  });
});

describe('Model-to-Voice Join and Picker Selection', () => {
  const voiceModels = [
    {
      ModelID: '51F8EF42-316F-41CB-81E9-A63996AD90F7',
      ModelName: 'GPT-Live 1',
      Voices: [
        { ID: 'cedar', Name: 'Cedar' },
        { ID: 'marin', Name: 'Marin' },
        { ID: 'alloy', Name: 'Alloy' },
        { ID: 'echo', Name: 'Echo' },
      ],
    },
    {
      ModelID: 'F1AEF71E-9E93-4C27-870E-620E75FA5552',
      ModelName: 'Gemini 3.1 Flash Live',
      Voices: [
        { ID: 'Puck', Name: 'Puck' },
        { ID: 'Charon', Name: 'Charon' },
        { ID: 'Kore', Name: 'Kore' },
        { ID: 'Fenrir', Name: 'Fenrir' },
        { ID: 'Aoede', Name: 'Aoede' },
      ],
    },
    {
      ModelID: 'E934CE9A-93DB-4FE3-B806-4144F108E930',
      ModelName: 'AssemblyAI Voice Agent',
      Voices: [
        { ID: 'ivy', Name: 'Ivy' },
        { ID: 'james', Name: 'James' },
      ],
    },
  ];

  it('returns empty voices when no model is selected (Auto mode)', () => {
    const selectedModelId: string | null = null;
    const voices = voiceModels.find(m => m.ModelID === selectedModelId)?.Voices ?? [];
    expect(voices).toEqual([]);
  });

  it('resolves the correct personas/voices for a selected model', () => {
    const selectedModelId = '51F8EF42-316F-41CB-81E9-A63996AD90F7';
    const voices = voiceModels.find(m => m.ModelID === selectedModelId)?.Voices ?? [];
    expect(voices).toHaveLength(4);
    expect(voices.map(v => v.Name)).toEqual(['Cedar', 'Marin', 'Alloy', 'Echo']);
    expect(voices.map(v => v.ID)).toEqual(['cedar', 'marin', 'alloy', 'echo']);
  });

  it('updates voices when changing from one model to another', () => {
    let selectedModelId: string | null = '51F8EF42-316F-41CB-81E9-A63996AD90F7';
    let voices = voiceModels.find(m => m.ModelID === selectedModelId)?.Voices ?? [];
    expect(voices.map(v => v.Name)).toEqual(['Cedar', 'Marin', 'Alloy', 'Echo']);

    // User selects Gemini 3.1 Flash Live
    selectedModelId = 'F1AEF71E-9E93-4C27-870E-620E75FA5552';
    voices = voiceModels.find(m => m.ModelID === selectedModelId)?.Voices ?? [];
    expect(voices).toHaveLength(5);
    expect(voices.map(v => v.Name)).toEqual(['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede']);
    expect(voices.map(v => v.ID)).toEqual(['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede']);
  });

  it('threads selected model and voice through BuildRealtimeConfigOverridesJson for startRealtimeWithAgent', () => {
    const preferredModelId = 'F1AEF71E-9E93-4C27-870E-620E75FA5552';
    const preferredVoice = 'Aoede';

    const overridesJson = BuildRealtimeConfigOverridesJson(preferredModelId, preferredVoice);
    expect(overridesJson).not.toBeNull();

    const parsed = JSON.parse(overridesJson!);
    expect(parsed).toEqual({
      realtime: {
        modelPreference: 'F1AEF71E-9E93-4C27-870E-620E75FA5552',
        voice: {
          default: {
            voice: 'Aoede',
          },
        },
      },
    });
  });
});

