import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LogError, UserInfo } from '@memberjunction/core';
import { MAX_HANDOFF_HOPS } from '@memberjunction/ai-core-plus';
import { AIAgentPermissionHelper } from '@memberjunction/ai-engine-base';
import { DecisionDiscoveryAgent } from '../decision-discovery';
import { MAX_HANDOFF_CANDIDATES, ResolveHandoffTarget } from '../handoff-target';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
    };
});

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIAgentPermissionHelper: {
        HasPermission: vi.fn(),
        IsDirectlyDiscoverable: vi.fn((agent: { InvocationMode?: string | null; ParentID?: string | null }) => {
            return agent.InvocationMode !== 'Sub-Agent' && (agent.ParentID == null || agent.ParentID.trim() === '');
        }),
        FilterRunnableAgents: vi.fn(),
    },
}));

const SOURCE_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';
const PEER_A_ID = '33333333-3333-4333-8333-333333333333';
const PEER_B_ID = '44444444-4444-4444-8444-444444444444';
const SUB_ID = '55555555-5555-4555-8555-555555555555';
const CHILD_ID = '66666666-6666-4666-8666-666666666666';
const INACTIVE_ID = '77777777-7777-4777-8777-777777777777';

const mockUser = { ID: '99999999-9999-4999-8999-999999999999' } as UserInfo;

function makeAgent(overrides: Partial<DecisionDiscoveryAgent> & { ID: string; Name: string }): DecisionDiscoveryAgent {
    return {
        Status: 'Active',
        InvocationMode: 'Any',
        ParentID: null,
        Description: `${overrides.Name} description`,
        ...overrides,
    };
}

describe('ResolveHandoffTarget', () => {
    const baseAgents: DecisionDiscoveryAgent[] = [
        makeAgent({ ID: SOURCE_ID, Name: 'Sage' }),
        makeAgent({ ID: TARGET_ID, Name: 'Skip' }),
        makeAgent({ ID: PEER_A_ID, Name: 'Research Agent' }),
        makeAgent({ ID: PEER_B_ID, Name: 'Marketing Agent' }),
        makeAgent({ ID: SUB_ID, Name: 'Code Helper', InvocationMode: 'Sub-Agent' }),
        makeAgent({ ID: CHILD_ID, Name: 'Child Specialist', ParentID: TARGET_ID }),
        makeAgent({ ID: INACTIVE_ID, Name: 'Retired Specialist', Status: 'Inactive' }),
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(AIAgentPermissionHelper.HasPermission).mockResolvedValue(true);
        vi.mocked(AIAgentPermissionHelper.FilterRunnableAgents).mockImplementation(async (agents) => {
            return agents.filter((a) => a.Status === 'Active');
        });
    });

    describe('Happy path', () => {
        it('resolves an exact match with empty HandoffChain', async () => {
            const result = await ResolveHandoffTarget({
                AgentName: 'Skip',
                SourceAgentID: SOURCE_ID,
                HandoffChain: [],
                ContextUser: mockUser,
                Agents: baseAgents,
            });

            expect(result.Refusal).toBeUndefined();
            expect(result.Target?.ID).toBe(TARGET_ID);
            expect(result.Target?.Name).toBe('Skip');
            expect(result.Candidates).toEqual([]);
        });

        it('resolves case-insensitive and whitespace-trimmed matches', async () => {
            const result = await ResolveHandoffTarget({
                AgentName: '  sKiP  ',
                SourceAgentID: SOURCE_ID,
                HandoffChain: [],
                ContextUser: mockUser,
                Agents: baseAgents,
            });

            expect(result.Refusal).toBeUndefined();
            expect(result.Target?.ID).toBe(TARGET_ID);
        });

        it('allows hop 1 and hop MAX_HANDOFF_HOPS', async () => {
            const hop1 = await ResolveHandoffTarget({
                AgentName: 'Skip',
                SourceAgentID: SOURCE_ID,
                HandoffChain: [],
                ContextUser: mockUser,
                Agents: baseAgents,
            });
            expect(hop1.Target?.ID).toBe(TARGET_ID);

            const maxMinusOneChain = Array.from(
                { length: MAX_HANDOFF_HOPS - 1 },
                (_, i) => `aaaaaaaa-0000-4000-8000-00000000000${i + 1}`,
            );
            const maxHop = await ResolveHandoffTarget({
                AgentName: 'Skip',
                SourceAgentID: SOURCE_ID,
                HandoffChain: maxMinusOneChain,
                ContextUser: mockUser,
                Agents: baseAgents,
            });
            expect(maxHop.Refusal).toBeUndefined();
            expect(maxHop.Target?.ID).toBe(TARGET_ID);
        });

        it('same-named agents: ParentID child and root agent with same name (different case) resolve to the root in both catalog orders, and an unrunnable match does not shadow a runnable one', async () => {
            const childFormBuilder = makeAgent({
                ID: '00000000-0000-4000-8000-000000000001',
                Name: 'Form Builder',
                ParentID: SOURCE_ID,
            });
            const rootFormBuilder = makeAgent({
                ID: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
                Name: 'form builder',
                ParentID: null,
            });

            const childFirst = await ResolveHandoffTarget({
                AgentName: 'Form Builder',
                SourceAgentID: SOURCE_ID,
                HandoffChain: [],
                ContextUser: mockUser,
                Agents: [makeAgent({ ID: SOURCE_ID, Name: 'Sage' }), childFormBuilder, rootFormBuilder],
            });
            expect(childFirst.Refusal).toBeUndefined();
            expect(childFirst.Target?.ID).toBe(rootFormBuilder.ID);

            const rootFirst = await ResolveHandoffTarget({
                AgentName: 'Form Builder',
                SourceAgentID: SOURCE_ID,
                HandoffChain: [],
                ContextUser: mockUser,
                Agents: [makeAgent({ ID: SOURCE_ID, Name: 'Sage' }), rootFormBuilder, childFormBuilder],
            });
            expect(rootFirst.Refusal).toBeUndefined();
            expect(rootFirst.Target?.ID).toBe(rootFormBuilder.ID);

            const unrunnableDup = makeAgent({
                ID: '00000000-0000-4000-8000-000000000002',
                Name: 'Analyst',
            });
            const runnableDup = makeAgent({
                ID: 'ffffffff-ffff-4fff-8fff-fffffffffff2',
                Name: 'analyst',
            });
            vi.mocked(AIAgentPermissionHelper.HasPermission).mockImplementation(
                async (agentId: string, _user: UserInfo, permission: string) => {
                    if (permission === 'run' && agentId === unrunnableDup.ID) return false;
                    return true;
                },
            );

            const unrunnableFirst = await ResolveHandoffTarget({
                AgentName: 'Analyst',
                SourceAgentID: SOURCE_ID,
                HandoffChain: [],
                ContextUser: mockUser,
                Agents: [makeAgent({ ID: SOURCE_ID, Name: 'Sage' }), unrunnableDup, runnableDup],
            });
            expect(unrunnableFirst.Refusal).toBeUndefined();
            expect(unrunnableFirst.Target?.ID).toBe(runnableDup.ID);
        });
    });

    describe('Refusal reasons in deterministic check order', () => {
        it('1. NotFound when agent does not exist, is Inactive, or user lacks view permission (does not confirm invisible agents)', async () => {
            const missing = await ResolveHandoffTarget({
                AgentName: 'Nonexistent Agent',
                SourceAgentID: SOURCE_ID,
                HandoffChain: [],
                ContextUser: mockUser,
                Agents: baseAgents,
            });
            expect(missing.Target).toBeUndefined();
            expect(missing.Refusal?.Reason).toBe('NotFound');
            expect(missing.Refusal?.Message).toMatch(/not found or not active/i);
            expect(missing.Refusal?.Message).toContain('Marketing Agent, Research Agent, Skip');

            const inactive = await ResolveHandoffTarget({
                AgentName: 'Retired Specialist',
                SourceAgentID: SOURCE_ID,
                HandoffChain: [],
                ContextUser: mockUser,
                Agents: baseAgents,
            });
            expect(inactive.Target).toBeUndefined();
            expect(inactive.Refusal?.Reason).toBe('NotFound');

            // A target the user can't view gives the exact same NotFound result an unknown name gives
            vi.mocked(AIAgentPermissionHelper.HasPermission).mockImplementation(
                async (agentId: string, _user: UserInfo, permission: string) => {
                    if (permission === 'view' && agentId === TARGET_ID) return false;
                    return true;
                },
            );
            vi.mocked(AIAgentPermissionHelper.FilterRunnableAgents).mockImplementation(async (agents) => {
                return agents.filter((a) => a.Status === 'Active' && a.ID !== TARGET_ID);
            });
            const unviewable = await ResolveHandoffTarget({
                AgentName: 'Skip',
                SourceAgentID: SOURCE_ID,
                HandoffChain: [],
                ContextUser: mockUser,
                Agents: baseAgents,
            });
            const unknownWithSameLabel = await ResolveHandoffTarget({
                AgentName: 'Skip',
                SourceAgentID: SOURCE_ID,
                HandoffChain: [],
                ContextUser: mockUser,
                Agents: baseAgents.filter((a) => a.ID !== TARGET_ID),
            });
            expect(unviewable).toEqual(unknownWithSameLabel);
        });

        it('2. Self when target ID matches SourceAgentID (case-insensitive UUID)', async () => {
            const agentsWithUpperSource = [
                makeAgent({ ID: SOURCE_ID.toUpperCase(), Name: 'Sage' }),
                ...baseAgents.slice(1),
            ];
            const result = await ResolveHandoffTarget({
                AgentName: 'Sage',
                SourceAgentID: SOURCE_ID.toLowerCase(),
                HandoffChain: [],
                ContextUser: mockUser,
                Agents: agentsWithUpperSource,
            });

            expect(result.Target).toBeUndefined();
            expect(result.Refusal?.Reason).toBe('Self');
            expect(result.Refusal?.Message).toMatch(/cannot hand off the conversation to yourself/i);
        });

        it('3. NotDiscoverable when InvocationMode is Sub-Agent or ParentID is non-null', async () => {
            const subResult = await ResolveHandoffTarget({
                AgentName: 'Code Helper',
                SourceAgentID: SOURCE_ID,
                HandoffChain: [],
                ContextUser: mockUser,
                Agents: baseAgents,
            });
            expect(subResult.Refusal?.Reason).toBe('NotDiscoverable');
            expect(subResult.Refusal?.Message).toContain("Code Helper can't be reached directly via Handoff");

            const childResult = await ResolveHandoffTarget({
                AgentName: 'Child Specialist',
                SourceAgentID: SOURCE_ID,
                HandoffChain: [],
                ContextUser: mockUser,
                Agents: baseAgents,
            });
            expect(childResult.Refusal?.Reason).toBe('NotDiscoverable');
            expect(childResult.Refusal?.Message).toContain("Child Specialist can't be reached directly via Handoff");
        });

        it('4. NotAllowedHere when HostAllowedIDs is empty or excludes target', async () => {
            const emptyAllowed = await ResolveHandoffTarget({
                AgentName: 'Skip',
                SourceAgentID: SOURCE_ID,
                HandoffChain: [],
                HostAllowedIDs: [],
                ContextUser: mockUser,
                Agents: baseAgents,
            });
            expect(emptyAllowed.Refusal?.Reason).toBe('NotAllowedHere');
            expect(emptyAllowed.Candidates).toEqual([]);
            expect(emptyAllowed.Refusal?.Message).toContain('Call Find Candidate Agents, or answer the user yourself.');

            const excludedAllowed = await ResolveHandoffTarget({
                AgentName: 'Skip',
                SourceAgentID: SOURCE_ID,
                HandoffChain: [],
                HostAllowedIDs: [PEER_A_ID],
                ContextUser: mockUser,
                Agents: baseAgents,
            });
            expect(excludedAllowed.Refusal?.Reason).toBe('NotAllowedHere');
            expect(excludedAllowed.Candidates.map((c) => c.Name)).toEqual(['Research Agent']);
        });

        it('5. NoRunPermission when target is viewable but HasPermission(run) returns false or throws (fail closed + LogError)', async () => {
            vi.mocked(AIAgentPermissionHelper.HasPermission).mockImplementation(
                async (_agentId: string, _user: UserInfo, permission: string) => permission !== 'run',
            );
            const denied = await ResolveHandoffTarget({
                AgentName: 'Skip',
                SourceAgentID: SOURCE_ID,
                HandoffChain: [],
                ContextUser: mockUser,
                Agents: baseAgents,
            });
            expect(denied.Refusal?.Reason).toBe('NoRunPermission');
            expect(denied.Refusal?.Message).toMatch(/does not have permission to run Skip/i);

            vi.mocked(LogError).mockClear();
            vi.mocked(AIAgentPermissionHelper.HasPermission).mockImplementation(
                async (_agentId: string, _user: UserInfo, permission: string) => {
                    if (permission === 'run') {
                        throw new Error('DB connection error');
                    }
                    return true;
                },
            );
            const thrown = await ResolveHandoffTarget({
                AgentName: 'Skip',
                SourceAgentID: SOURCE_ID,
                HandoffChain: [],
                ContextUser: mockUser,
                Agents: baseAgents,
            });
            expect(thrown.Refusal?.Reason).toBe('NoRunPermission');
            expect(LogError).toHaveBeenCalledTimes(1);
            expect(vi.mocked(LogError).mock.calls[0][0]).toContain(TARGET_ID);
            expect(vi.mocked(LogError).mock.calls[0][0]).toContain('DB connection error');
        });

        it('6. AlreadyInThisTurn for direct ping-pong (A -> B -> A) and 3-agent cycle (A -> B -> C -> A)', async () => {
            // Direct ping-pong: Sage handed to Skip, now Skip tries to hand back to Sage
            const pingPong = await ResolveHandoffTarget({
                AgentName: 'Sage',
                SourceAgentID: TARGET_ID,
                HandoffChain: [SOURCE_ID.toUpperCase()],
                ContextUser: mockUser,
                Agents: baseAgents,
            });
            expect(pingPong.Refusal?.Reason).toBe('AlreadyInThisTurn');
            expect(pingPong.Refusal?.Message).toContain('Sage has already participated in this turn');

            // 3-agent cycle: Sage -> Skip -> Research Agent -> Sage
            const cycle3 = await ResolveHandoffTarget({
                AgentName: 'Sage',
                SourceAgentID: PEER_A_ID,
                HandoffChain: [SOURCE_ID, TARGET_ID],
                ContextUser: mockUser,
                Agents: baseAgents,
            });
            expect(cycle3.Refusal?.Reason).toBe('AlreadyInThisTurn');
        });

        it('7. HopLimit when HandoffChain.length === MAX_HANDOFF_HOPS', async () => {
            const fullChain = Array.from(
                { length: MAX_HANDOFF_HOPS },
                (_, i) => `bbbbbbbb-0000-4000-8000-00000000000${i + 1}`,
            );
            const result = await ResolveHandoffTarget({
                AgentName: 'Skip',
                SourceAgentID: SOURCE_ID,
                HandoffChain: fullChain,
                ContextUser: mockUser,
                Agents: baseAgents,
            });

            expect(result.Refusal?.Reason).toBe('HopLimit');
            expect(result.Refusal?.Message).toContain(`maximum handoff limit (${MAX_HANDOFF_HOPS} hops)`);
        });
    });

    describe('Candidates computation on refusal', () => {
        it('excludes source, sub-agents, non-runnable agents, agents outside HostAllowedIDs, and HandoffChain, sorted and capped at 20', async () => {
            const manyAgents: DecisionDiscoveryAgent[] = [
                makeAgent({ ID: SOURCE_ID, Name: 'Sage' }),
                makeAgent({ ID: SUB_ID, Name: 'Sub Only', InvocationMode: 'Sub-Agent' }),
                makeAgent({ ID: CHILD_ID, Name: 'Child Agent', ParentID: SOURCE_ID }),
                makeAgent({ ID: INACTIVE_ID, Name: 'Inactive Agent', Status: 'Inactive' }),
                makeAgent({ ID: '88888888-8888-4888-8888-888888888888', Name: 'Unpermitted Agent' }),
                makeAgent({ ID: '99999999-0000-4000-8000-000000000001', Name: 'Disallowed By Host' }),
                makeAgent({ ID: '99999999-0000-4000-8000-000000000002', Name: 'Already In Chain' }),
            ];

            const allowedIds: string[] = [];
            for (let i = 1; i <= 25; i++) {
                const padded = String(i).padStart(2, '0');
                const id = `cccccccc-0000-4000-8000-0000000000${padded}`;
                // Insert in reverse order to verify alphabetical sorting
                const name = `Agent ${String(26 - i).padStart(2, '0')}`;
                manyAgents.push(makeAgent({ ID: id, Name: name }));
                allowedIds.push(id);
            }
            // Also include Already In Chain and Unpermitted Agent in host allow-list so they are filtered by their own rules
            allowedIds.push('88888888-8888-4888-8888-888888888888');
            allowedIds.push('99999999-0000-4000-8000-000000000002');

            vi.mocked(AIAgentPermissionHelper.FilterRunnableAgents).mockImplementation(async (agents) => {
                return agents.filter(
                    (a) => a.Status === 'Active' && a.ID !== '88888888-8888-4888-8888-888888888888',
                );
            });

            const result = await ResolveHandoffTarget({
                AgentName: 'Missing Target',
                SourceAgentID: SOURCE_ID,
                HandoffChain: ['99999999-0000-4000-8000-000000000002'],
                HostAllowedIDs: allowedIds,
                ContextUser: mockUser,
                Agents: manyAgents,
            });

            expect(result.Refusal?.Reason).toBe('NotFound');
            expect(result.Candidates).toHaveLength(MAX_HANDOFF_CANDIDATES);
            expect(result.Candidates[0].Name).toBe('Agent 01');
            expect(result.Candidates[19].Name).toBe('Agent 20');
            const candidateNames = result.Candidates.map((c) => c.Name);
            expect(candidateNames).not.toContain('Sage');
            expect(candidateNames).not.toContain('Sub Only');
            expect(candidateNames).not.toContain('Child Agent');
            expect(candidateNames).not.toContain('Inactive Agent');
            expect(candidateNames).not.toContain('Unpermitted Agent');
            expect(candidateNames).not.toContain('Disallowed By Host');
            expect(candidateNames).not.toContain('Already In Chain');
        });
    });
});
