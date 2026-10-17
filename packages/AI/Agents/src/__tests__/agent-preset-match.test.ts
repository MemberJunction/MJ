import { describe, expect, it } from 'vitest';
import {
    MatchAgentConfigurationPreset,
    type AgentConfigurationPresetCandidate,
} from '../agent-preset-match';

describe('MatchAgentConfigurationPreset', () => {
    const presets: (AgentConfigurationPresetCandidate & { id: string })[] = [
        {
            id: 'preset-draft',
            Name: 'Draft',
            DisplayName: 'Quick Preview',
            Status: 'Active',
        },
        {
            id: 'preset-standard',
            Name: 'Standard',
            DisplayName: 'Draft',
            Status: 'Active',
        },
        {
            id: 'preset-high',
            Name: 'High',
            DisplayName: 'High Fidelity',
            Status: 'Active',
        },
        {
            id: 'preset-inactive',
            Name: 'Ultra',
            DisplayName: 'Ultra Mode',
            Status: 'Inactive',
        },
    ];

    it('matches by Name before DisplayName when both could match', () => {
        const match = MatchAgentConfigurationPreset(presets, 'Draft');
        expect(match?.id).toBe('preset-draft');
    });

    it('falls back to DisplayName when no Name matches', () => {
        const match = MatchAgentConfigurationPreset(presets, 'High Fidelity');
        expect(match?.id).toBe('preset-high');
    });

    it('matches case-insensitively and trims surrounding whitespace', () => {
        expect(MatchAgentConfigurationPreset(presets, '  sTaNdArD  ')?.id).toBe('preset-standard');
        expect(MatchAgentConfigurationPreset(presets, '  quick preview ')?.id).toBe('preset-draft');
    });

    it('skips presets whose Status is not Active', () => {
        expect(MatchAgentConfigurationPreset(presets, 'Ultra')).toBeUndefined();
        expect(MatchAgentConfigurationPreset(presets, 'Ultra Mode')).toBeUndefined();
    });

    it('returns undefined for empty, whitespace-only, null, or undefined names', () => {
        expect(MatchAgentConfigurationPreset(presets, '')).toBeUndefined();
        expect(MatchAgentConfigurationPreset(presets, '   ')).toBeUndefined();
        expect(MatchAgentConfigurationPreset(presets, null)).toBeUndefined();
        expect(MatchAgentConfigurationPreset(presets, undefined)).toBeUndefined();
    });
});
