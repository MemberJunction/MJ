import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import type { MJAIAgentNoteEntity, MJAIPersonaEntity } from '@memberjunction/core-entities';
import type { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import type { EffectiveAgentPersona } from '@memberjunction/ai-engine-base';

const COS_ID = '11111111-0000-4000-8000-000000000001';
const PEPPER_ID = '11111111-0000-4000-8000-000000000002';
const CATO_ID = '11111111-0000-4000-8000-000000000003';
const QB_ROOT_ID = '11111111-0000-4000-8000-000000000004';
const QB_DERIVED_ID = '11111111-0000-4000-8000-000000000005';
const USER_ALICE_ID = '22222222-0000-4000-8000-000000000001';
const USER_BOB_ID = '22222222-0000-4000-8000-000000000002';

interface FakeAgentRow {
    ID: string;
    Name: string;
    BaseAgentID: string | null;
    OwnerUserID: string | null;
    IsPrimaryInstance: boolean;
    Status: string;
    DriverClass: string | null;
    TypeID: string;
}

interface FakeNoteRow {
    ID: string;
    AgentID: string | null;
    UserID: string | null;
    CompanyID: string | null;
    Status: string;
    Note: string;
    Type: string;
    __mj_UpdatedAt: Date;
}

const mockEngine = {
    Agents: [] as FakeAgentRow[],
    AgentNotes: [] as FakeNoteRow[],
    Config: vi.fn(async () => true),
    GetAgentInheritanceChain: vi.fn((agentId: string): FakeAgentRow[] => {
        const byId = new Map(mockEngine.Agents.map((a) => [a.ID.toLowerCase(), a]));
        const leaf = byId.get(agentId.toLowerCase());
        if (!leaf) return [];
        const rev: FakeAgentRow[] = [leaf];
        let baseId = leaf.BaseAgentID;
        while (baseId) {
            const parent = byId.get(baseId.toLowerCase());
            if (!parent) break;
            rev.push(parent);
            baseId = parent.BaseAgentID;
        }
        return rev.reverse();
    }),
    ResolveEffectiveAgentProperties: vi.fn((agentOrId: string | FakeAgentRow) => {
        const id = typeof agentOrId === 'string' ? agentOrId : agentOrId.ID;
        const chain = mockEngine.GetAgentInheritanceChain(id);
        let driverClass: string | null = null;
        let typeId = '';
        for (const member of chain) {
            if (member.DriverClass?.trim()) driverClass = member.DriverClass.trim();
            if (member.TypeID) typeId = member.TypeID;
        }
        return {
            DriverClass: driverClass,
            TypeID: typeId,
        };
    }),
    ResolvePrimaryUserAgentInstance: vi.fn((baseAgentId: string, userId: string): FakeAgentRow | undefined => {
        const derived = mockEngine.Agents.filter(
            (a) =>
                a.Status === 'Active' &&
                a.BaseAgentID?.toLowerCase() === baseAgentId.toLowerCase() &&
                a.OwnerUserID?.toLowerCase() === userId.toLowerCase()
        );
        if (derived.length === 0) {
            return mockEngine.Agents.find((a) => a.ID.toLowerCase() === baseAgentId.toLowerCase());
        }
        return derived.find((a) => a.IsPrimaryInstance) ?? derived[0];
    }),
};

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return mockEngine;
        },
    },
}));

import { BuildAgentPersonaAndInstructionsBlock } from '../agent-persona-prompt';
import { AgentContextInjector } from '../agent-context-injector';
import { AgentWakeTriggerService } from '../AgentWakeTriggerService';
import { CreateAgentInstance } from '../agent-instance';
import { BaseAgent } from '../base-agent';

@RegisterClass(BaseAgent, 'TestInheritedDriverAgent')
class TestInheritedDriverAgent extends BaseAgent {}

class TestableAgentContextInjector extends AgentContextInjector {
    public FilterNotes(notes: MJAIAgentNoteEntity[], params: { agentId: string; userId: string }): MJAIAgentNoteEntity[] {
        return this.filterNotesByScoping(notes, params);
    }
}

function makeNote(partial: Partial<FakeNoteRow> & { ID: string; Note: string }): MJAIAgentNoteEntity {
    const row: FakeNoteRow = {
        AgentID: null,
        UserID: null,
        CompanyID: null,
        Status: 'Active',
        Type: 'Preference',
        __mj_UpdatedAt: new Date('2026-11-22T00:00:00Z'),
        ...partial,
    };
    return row as MJAIAgentNoteEntity;
}

describe('Agent Instances & Prototype Inheritance Runtime', () => {
    beforeEach(() => {
        mockEngine.Agents = [
            {
                ID: COS_ID,
                Name: 'Chief of Staff',
                BaseAgentID: null,
                OwnerUserID: null,
                IsPrimaryInstance: false,
                Status: 'Active',
                DriverClass: null,
                TypeID: 'type-loop',
            },
            {
                ID: PEPPER_ID,
                Name: 'Pepper',
                BaseAgentID: COS_ID,
                OwnerUserID: USER_ALICE_ID,
                IsPrimaryInstance: true,
                Status: 'Active',
                DriverClass: null,
                TypeID: 'type-loop',
            },
            {
                ID: CATO_ID,
                Name: 'Cato',
                BaseAgentID: COS_ID,
                OwnerUserID: USER_ALICE_ID,
                IsPrimaryInstance: false,
                Status: 'Active',
                DriverClass: null,
                TypeID: 'type-loop',
            },
            {
                ID: QB_ROOT_ID,
                Name: 'Query Builder',
                BaseAgentID: null,
                OwnerUserID: null,
                IsPrimaryInstance: false,
                Status: 'Active',
                DriverClass: 'TestInheritedDriverAgent',
                TypeID: 'type-loop',
            },
            {
                ID: QB_DERIVED_ID,
                Name: 'Revenue SQL Helper',
                BaseAgentID: QB_ROOT_ID,
                OwnerUserID: USER_ALICE_ID,
                IsPrimaryInstance: true,
                Status: 'Active',
                DriverClass: null,
                TypeID: 'type-loop',
            },
        ];
        mockEngine.AgentNotes = [];
        vi.clearAllMocks();
    });

    describe('BuildAgentPersonaAndInstructionsBlock', () => {
        it('returns null when neither persona style nor instructions are configured', () => {
            const block = BuildAgentPersonaAndInstructionsBlock({
                AgentName: 'Research Agent',
                Persona: null,
                StackedInstructions: [],
            });
            expect(block).toBeNull();
        });

        it('unifies Persona tone/speakingStyle, stacked instructions, and Audience-Aware Tone Guardrail', () => {
            const fakePersona = {
                Name: 'Sage',
                Description: 'Sharp and quick-witted executive assistant',
            } as MJAIPersonaEntity;
            const effectivePersona: EffectiveAgentPersona = {
                Persona: fakePersona,
                Tone: 'Direct, playful, a touch sarcastic and genuinely funny',
                SpeakingStyle: 'Short punchy replies with crisp bullet points',
                AgentPersona: null,
                Voice: null,
                EffectiveVoiceID: null,
                EffectiveModelID: null,
                EffectiveVendorID: null,
                StyleOverride: null,
            };

            const block = BuildAgentPersonaAndInstructionsBlock({
                AgentName: 'Pepper',
                OwnerUserName: 'Alice',
                Persona: effectivePersona,
                StackedInstructions: [
                    {
                        AgentID: COS_ID,
                        AgentName: 'Chief of Staff',
                        Instructions: 'Always summarize calendar conflicts first.',
                        IsRootOrTemplate: true,
                    },
                    {
                        AgentID: PEPPER_ID,
                        AgentName: 'Pepper',
                        Instructions: 'Start Monday briefs with a dry one-liner about Q4.',
                        IsRootOrTemplate: false,
                    },
                ],
            });

            expect(block).not.toBeNull();
            expect(block).toContain('### Persona & Communication Style');
            expect(block).toContain('You are **Pepper** (voice persona: **Sage**)');
            expect(block).toContain('Direct, playful, a touch sarcastic and genuinely funny');
            expect(block).toContain('Short punchy replies with crisp bullet points');
            expect(block).toContain('### Custom & Inherited Instructions');
            expect(block).toContain('Template / Organization (Chief of Staff)');
            expect(block).toContain('Personal Standing Instructions (Pepper)');
            expect(block).toContain('### Audience-Aware Tone Guardrail');
            expect(block).toContain('owner (Alice)');
            expect(block).toContain('external emails, calendar invites, or peer Agent Channel messages');
        });

        it('omits Audience-Aware Tone Guardrail when only template/org instructions exist and no personal tone', () => {
            const block = BuildAgentPersonaAndInstructionsBlock({
                AgentName: 'Chief of Staff',
                Persona: null,
                StackedInstructions: [
                    {
                        AgentID: COS_ID,
                        AgentName: 'Chief of Staff',
                        Instructions: 'Follow company reporting conventions.',
                        IsRootOrTemplate: true,
                    },
                ],
            });
            expect(block).not.toBeNull();
            expect(block).toContain('### Custom & Inherited Instructions');
            expect(block).not.toContain('### Audience-Aware Tone Guardrail');
        });
    });

    describe('AgentContextInjector sibling isolation and org-note inheritance', () => {
        it('inherits org-wide notes from BaseAgentID ancestors while isolating sibling instance notes', () => {
            const injector = new TestableAgentContextInjector();
            const notes: MJAIAgentNoteEntity[] = [
                makeNote({ ID: 'n-org-cos', AgentID: COS_ID, UserID: null, Note: 'Org policy: no Friday deploys' }),
                makeNote({ ID: 'n-user-cos', AgentID: COS_ID, UserID: USER_ALICE_ID, Note: 'Legacy CoS user note' }),
                makeNote({ ID: 'n-pepper', AgentID: PEPPER_ID, UserID: USER_ALICE_ID, Note: 'Pepper private memory' }),
                makeNote({ ID: 'n-cato', AgentID: CATO_ID, UserID: USER_ALICE_ID, Note: 'Cato private memory' }),
                makeNote({ ID: 'n-global', AgentID: null, UserID: USER_ALICE_ID, Note: 'Cross-agent Alice pref' }),
            ];

            const pepperNotes = injector.FilterNotes(notes, { agentId: PEPPER_ID, userId: USER_ALICE_ID }).map((n) => n.ID);
            expect(pepperNotes).toContain('n-org-cos'); // inherited org note from BaseAgentID ancestor
            expect(pepperNotes).toContain('n-pepper'); // Pepper's own private note
            expect(pepperNotes).toContain('n-global'); // cross-agent user note (AgentID == null)
            expect(pepperNotes).not.toContain('n-cato'); // sibling Cato's memory is strictly isolated!
            expect(pepperNotes).not.toContain('n-user-cos'); // parent per-user note does NOT bleed into Pepper!

            const catoNotes = injector.FilterNotes(notes, { agentId: CATO_ID, userId: USER_ALICE_ID }).map((n) => n.ID);
            expect(catoNotes).toContain('n-org-cos');
            expect(catoNotes).toContain('n-cato');
            expect(catoNotes).not.toContain('n-pepper');
        });
    });

    describe('AgentWakeTriggerService.ResolvePrimaryUserAgentInstance', () => {
        it('resolves the user primary derived instance (Pepper) over secondary sibling (Cato)', async () => {
            const resolved = await AgentWakeTriggerService.Instance.ResolvePrimaryUserAgentInstance(
                COS_ID,
                USER_ALICE_ID
            );
            expect(resolved.ID).toBe(PEPPER_ID);
            expect(resolved.Name).toBe('Pepper');
        });

        it('falls back to the base agent when a user has no derived instances', async () => {
            const resolved = await AgentWakeTriggerService.Instance.ResolvePrimaryUserAgentInstance(
                COS_ID,
                USER_BOB_ID
            );
            expect(resolved.ID).toBe(COS_ID);
            expect(resolved.Name).toBe('Chief of Staff');
        });
    });

    describe('CreateAgentInstance inherited DriverClass resolution', () => {
        it('instantiates the ancestor BaseAgent subclass when a derived agent leaves DriverClass null', async () => {
            expect(MJGlobal.Instance.ClassFactory).toBeDefined();
            const derivedRow = mockEngine.Agents.find((a) => a.ID === QB_DERIVED_ID)! as MJAIAgentEntityExtended;
            const instance = await CreateAgentInstance(derivedRow);
            expect(instance).toBeInstanceOf(TestInheritedDriverAgent);
        });
    });
});
