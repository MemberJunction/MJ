/**
 * @fileoverview MentionAutocomplete under a permission-constrained AI engine (MJ#5240).
 *
 * A user who holds no read on MJ: AI Agents gets an engine whose `Agents` throws. The mention engine must still initialise for
 * them, with no agents to offer, so the composer and the messages of a host that embeds the chat area keep rendering. Before
 * this, `initialize` rethrew and the chat area's `ngOnInit` stopped before its first load.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIEngineBase: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            get Agents(): never {
                throw new Error('PermissionConstrainedError: AIEngineBase data is not available — user lacks read permission on: MJ: AI Agents');
            },
            ReadableAgents: [],
            GetAgentConfigurationPresets: vi.fn().mockReturnValue([]),
        },
    },
    AIAgentPermissionHelper: { HasPermission: vi.fn().mockResolvedValue(true) },
    AISkillPermissionHelper: { HasPermission: vi.fn().mockResolvedValue(true), GetAccessibleSkills: vi.fn().mockResolvedValue([]) },
}));
vi.mock('@memberjunction/core', () => ({
    Metadata: class {
        public static Provider = { Entities: [], Queries: [] };
    },
}));

import { MentionAutocomplete } from '../mentions/MentionAutocomplete';

const CURRENT_USER = { ID: 'user-participant', Name: 'Lena Leader', Email: 'lena@example.com' } as never;

describe('MentionAutocomplete — a permission-constrained engine', () => {
    it('initialises with no agents instead of throwing, so the host keeps rendering', async () => {
        const engine = new MentionAutocomplete();
        await expect(engine.initialize(CURRENT_USER)).resolves.toBeUndefined();
        expect(engine.IsInitialized).toBe(true);
        expect(engine.GetAvailableAgents()).toEqual([]);
        expect(engine.getSuggestions('', false, '@').filter((s) => s.type === 'agent')).toEqual([]);
    });
});
