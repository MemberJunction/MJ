/**
 * @fileoverview Tests for the assignment strategy resolution chain in BaseAgent.
 *
 * Since resolveAssignmentStrategy, resolveCategoryAssignmentStrategy, and
 * resolveUserFromStrategy are private methods on BaseAgent, we test them
 * as standalone helper functions that mirror the class method logic.
 * This approach is consistent with the existing test patterns in this package
 * (see action-changes.test.ts).
 */
import { describe, it, expect } from 'vitest';
import {
    AgentRequestAssignmentStrategy,
    parseAssignmentStrategy,
} from '@memberjunction/ai-core-plus';

// ---------------------------------------------------------------------------
// Stand-alone mirrors of BaseAgent private methods for unit testing
// ---------------------------------------------------------------------------

interface CategoryRow {
    ID: string;
    ParentID: string | null;
    AssignmentStrategy: string | null;
}

interface MinimalContextUser {
    ID: string;
}

interface MinimalAgent {
    Name: string;
    OwnerUserID?: string | null;
    TypeID: string;
    CategoryID?: string | null;
}

interface MinimalAgentRun {
    UserID?: string | null;
}

interface MinimalAgentType {
    ID: string;
    AssignmentStrategy: string | null;
}

interface MinimalRequestType {
    ID: string;
    DefaultAssignmentStrategy: string | null;
}

interface ResolveParams {
    assignmentStrategy?: AgentRequestAssignmentStrategy;
    contextUser?: MinimalContextUser | null;
    agent: MinimalAgent;
}

/**
 * Mirrors BaseAgent.resolveAssignmentStrategy — walks the chain bottom-up.
 */
function resolveAssignmentStrategy(
    params: ResolveParams,
    requestTypeId: string | null,
    agentTypes: MinimalAgentType[],
    categories: CategoryRow[],
    requestTypes: MinimalRequestType[]
): AgentRequestAssignmentStrategy | null {
    // 1. Per-invocation
    if (params.assignmentStrategy) return params.assignmentStrategy;

    // 2. Agent Type
    const agentType = agentTypes.find(at => at.ID === params.agent.TypeID);
    const typeStrategy = parseAssignmentStrategy(agentType?.AssignmentStrategy ?? null);
    if (typeStrategy) return typeStrategy;

    // 3. Category tree walk
    const catStrategy = resolveCategoryStrategy(params.agent.CategoryID ?? null, categories);
    if (catStrategy) return catStrategy;

    // 4. Request Type
    if (requestTypeId) {
        const rt = requestTypes.find(t => t.ID === requestTypeId);
        if (rt) {
            const rtStrategy = parseAssignmentStrategy(rt.DefaultAssignmentStrategy);
            if (rtStrategy) return rtStrategy;
        }
    }

    return null;
}

/**
 * Mirrors BaseAgent.resolveCategoryAssignmentStrategy — walks ParentID tree.
 */
function resolveCategoryStrategy(
    categoryId: string | null,
    categories: CategoryRow[]
): AgentRequestAssignmentStrategy | null {
    if (!categoryId) return null;

    let currentId: string | null = categoryId;
    const visited = new Set<string>();
    while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        const cat = categories.find(c => c.ID === currentId);
        if (!cat) break;

        const strategy = parseAssignmentStrategy(cat.AssignmentStrategy);
        if (strategy) return strategy;

        currentId = cat.ParentID;
    }
    return null;
}

/**
 * Mirrors BaseAgent.resolveUserFromStrategy — resolves user from strategy.
 */
function resolveUserFromStrategy(
    strategy: AgentRequestAssignmentStrategy | null,
    params: ResolveParams,
    agentRun: MinimalAgentRun | null
): string | null {
    if (!strategy) {
        return params.contextUser?.ID ?? null;
    }

    switch (strategy.type) {
        case 'RunUser':
            return params.contextUser?.ID ?? agentRun?.UserID ?? null;

        case 'AgentOwner':
            return params.agent.OwnerUserID ?? null;

        case 'SpecificUser':
            return strategy.userID ?? null;

        case 'List':
            // List-based resolution not yet implemented — fallback to contextUser
            return params.contextUser?.ID ?? null;

        case 'SharedInbox':
            return null;

        default:
            return params.contextUser?.ID ?? null;
    }
}

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

const USER_A = 'AAAA-1111';
const USER_B = 'BBBB-2222';
const USER_C = 'CCCC-3333';

const AGENT_TYPE_LOOP: MinimalAgentType = { ID: 'type-loop', AssignmentStrategy: null };
const AGENT_TYPE_FLOW: MinimalAgentType = {
    ID: 'type-flow',
    AssignmentStrategy: JSON.stringify({ type: 'AgentOwner' }),
};

const CATEGORIES: CategoryRow[] = [
    { ID: 'cat-root', ParentID: null, AssignmentStrategy: JSON.stringify({ type: 'RunUser', priority: 25 }) },
    { ID: 'cat-assistant', ParentID: 'cat-root', AssignmentStrategy: null },
    { ID: 'cat-research', ParentID: 'cat-root', AssignmentStrategy: JSON.stringify({ type: 'SpecificUser', userID: USER_C }) },
    { ID: 'cat-deep-research', ParentID: 'cat-research', AssignmentStrategy: null },
];

const RT_APPROVAL: MinimalRequestType = {
    ID: 'rt-approval',
    DefaultAssignmentStrategy: JSON.stringify({ type: 'AgentOwner', priority: 80 }),
};
const RT_CHAT: MinimalRequestType = {
    ID: 'rt-chat',
    DefaultAssignmentStrategy: null,
};

// ---------------------------------------------------------------------------
// Tests: resolveAssignmentStrategy chain
// ---------------------------------------------------------------------------

describe('resolveAssignmentStrategy', () => {
    const baseAgent: MinimalAgent = {
        Name: 'TestAgent',
        OwnerUserID: USER_B,
        TypeID: 'type-loop',
        CategoryID: 'cat-assistant',
    };

    const baseParams: ResolveParams = {
        contextUser: { ID: USER_A },
        agent: baseAgent,
    };

    it('should return per-invocation strategy when provided (highest priority)', () => {
        const perInvocation: AgentRequestAssignmentStrategy = { type: 'SpecificUser', userID: USER_C };
        const params = { ...baseParams, assignmentStrategy: perInvocation };
        const result = resolveAssignmentStrategy(
            params, 'rt-approval', [AGENT_TYPE_LOOP], CATEGORIES, [RT_APPROVAL]
        );
        expect(result).toEqual(perInvocation);
    });

    it('should return agent type strategy when no per-invocation strategy', () => {
        const agent = { ...baseAgent, TypeID: 'type-flow' };
        const result = resolveAssignmentStrategy(
            { ...baseParams, agent }, null, [AGENT_TYPE_LOOP, AGENT_TYPE_FLOW], [], []
        );
        expect(result).toEqual({ type: 'AgentOwner' });
    });

    it('should walk category tree and find strategy on parent', () => {
        // cat-assistant has no strategy, but its parent cat-root does
        const result = resolveAssignmentStrategy(
            baseParams, null, [AGENT_TYPE_LOOP], CATEGORIES, []
        );
        expect(result).toEqual({ type: 'RunUser', priority: 25 });
    });

    it('should find strategy on the direct category (not walk further up)', () => {
        const agent = { ...baseAgent, CategoryID: 'cat-research' };
        const result = resolveAssignmentStrategy(
            { ...baseParams, agent }, null, [AGENT_TYPE_LOOP], CATEGORIES, []
        );
        expect(result).toEqual({ type: 'SpecificUser', userID: USER_C });
    });

    it('should walk up from deep-research to research (skip to first strategy)', () => {
        const agent = { ...baseAgent, CategoryID: 'cat-deep-research' };
        const result = resolveAssignmentStrategy(
            { ...baseParams, agent }, null, [AGENT_TYPE_LOOP], CATEGORIES, []
        );
        expect(result).toEqual({ type: 'SpecificUser', userID: USER_C });
    });

    it('should fall back to request type strategy when category tree is empty', () => {
        const agent = { ...baseAgent, CategoryID: null };
        const result = resolveAssignmentStrategy(
            { ...baseParams, agent }, 'rt-approval', [AGENT_TYPE_LOOP], [], [RT_APPROVAL]
        );
        expect(result).toEqual({ type: 'AgentOwner', priority: 80 });
    });

    it('should return null when no strategy is found anywhere', () => {
        const agent = { ...baseAgent, CategoryID: null };
        const result = resolveAssignmentStrategy(
            { ...baseParams, agent }, 'rt-chat', [AGENT_TYPE_LOOP], [], [RT_CHAT]
        );
        expect(result).toBeNull();
    });

    it('should return null when all lookups miss (no matching type, no category, no RT)', () => {
        const agent = { ...baseAgent, TypeID: 'nonexistent', CategoryID: 'nonexistent' };
        const result = resolveAssignmentStrategy(
            { ...baseParams, agent }, 'nonexistent', [AGENT_TYPE_LOOP], CATEGORIES, [RT_APPROVAL]
        );
        expect(result).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Tests: resolveCategoryStrategy
// ---------------------------------------------------------------------------

describe('resolveCategoryStrategy', () => {
    it('should return null for null categoryId', () => {
        expect(resolveCategoryStrategy(null, CATEGORIES)).toBeNull();
    });

    it('should return null for unknown category', () => {
        expect(resolveCategoryStrategy('unknown', CATEGORIES)).toBeNull();
    });

    it('should return strategy from direct category', () => {
        expect(resolveCategoryStrategy('cat-root', CATEGORIES)).toEqual({
            type: 'RunUser', priority: 25,
        });
    });

    it('should walk up to parent when direct category has no strategy', () => {
        // cat-assistant → null → cat-root → { type: 'RunUser', priority: 25 }
        expect(resolveCategoryStrategy('cat-assistant', CATEGORIES)).toEqual({
            type: 'RunUser', priority: 25,
        });
    });

    it('should stop at the first non-null strategy in the chain', () => {
        // cat-deep-research → null → cat-research → { type: 'SpecificUser', ... }
        // Does NOT continue to cat-root
        expect(resolveCategoryStrategy('cat-deep-research', CATEGORIES)).toEqual({
            type: 'SpecificUser', userID: USER_C,
        });
    });

    it('should handle circular ParentID references without infinite loop', () => {
        const circular: CategoryRow[] = [
            { ID: 'a', ParentID: 'b', AssignmentStrategy: null },
            { ID: 'b', ParentID: 'a', AssignmentStrategy: null },
        ];
        expect(resolveCategoryStrategy('a', circular)).toBeNull();
    });

    it('should handle self-referencing ParentID', () => {
        const selfRef: CategoryRow[] = [
            { ID: 'self', ParentID: 'self', AssignmentStrategy: null },
        ];
        expect(resolveCategoryStrategy('self', selfRef)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Tests: resolveUserFromStrategy
// ---------------------------------------------------------------------------

describe('resolveUserFromStrategy', () => {
    const defaultParams: ResolveParams = {
        contextUser: { ID: USER_A },
        agent: { Name: 'Test', OwnerUserID: USER_B, TypeID: 'type-loop' },
    };
    const defaultRun: MinimalAgentRun = { UserID: USER_C };

    describe('when strategy is null (fallback)', () => {
        it('should return contextUser ID', () => {
            expect(resolveUserFromStrategy(null, defaultParams, defaultRun)).toBe(USER_A);
        });

        it('should return null if no contextUser', () => {
            const params = { ...defaultParams, contextUser: null };
            expect(resolveUserFromStrategy(null, params, null)).toBeNull();
        });
    });

    describe('RunUser strategy', () => {
        const strategy: AgentRequestAssignmentStrategy = { type: 'RunUser' };

        it('should return contextUser ID', () => {
            expect(resolveUserFromStrategy(strategy, defaultParams, defaultRun)).toBe(USER_A);
        });

        it('should fall back to agentRun UserID when no contextUser', () => {
            const params = { ...defaultParams, contextUser: null };
            expect(resolveUserFromStrategy(strategy, params, defaultRun)).toBe(USER_C);
        });

        it('should return null when no contextUser and no agentRun', () => {
            const params = { ...defaultParams, contextUser: null };
            expect(resolveUserFromStrategy(strategy, params, null)).toBeNull();
        });
    });

    describe('AgentOwner strategy', () => {
        const strategy: AgentRequestAssignmentStrategy = { type: 'AgentOwner' };

        it('should return agent OwnerUserID', () => {
            expect(resolveUserFromStrategy(strategy, defaultParams, null)).toBe(USER_B);
        });

        it('should return null when agent has no OwnerUserID', () => {
            const params = { ...defaultParams, agent: { ...defaultParams.agent, OwnerUserID: null } };
            expect(resolveUserFromStrategy(strategy, params, null)).toBeNull();
        });
    });

    describe('SpecificUser strategy', () => {
        it('should return the specified userID', () => {
            const strategy: AgentRequestAssignmentStrategy = { type: 'SpecificUser', userID: 'specific-user' };
            expect(resolveUserFromStrategy(strategy, defaultParams, null)).toBe('specific-user');
        });

        it('should return null when userID is not set', () => {
            const strategy: AgentRequestAssignmentStrategy = { type: 'SpecificUser' };
            expect(resolveUserFromStrategy(strategy, defaultParams, null)).toBeNull();
        });
    });

    describe('List strategy', () => {
        it('should fall back to contextUser (not yet implemented)', () => {
            const strategy: AgentRequestAssignmentStrategy = {
                type: 'List', listID: 'some-list', listStrategy: 'RoundRobin',
            };
            expect(resolveUserFromStrategy(strategy, defaultParams, null)).toBe(USER_A);
        });

        it('should return null when no contextUser available', () => {
            const strategy: AgentRequestAssignmentStrategy = { type: 'List', listID: 'some-list' };
            const params = { ...defaultParams, contextUser: null };
            expect(resolveUserFromStrategy(strategy, params, null)).toBeNull();
        });
    });

    describe('SharedInbox strategy', () => {
        it('should always return null (unassigned)', () => {
            const strategy: AgentRequestAssignmentStrategy = { type: 'SharedInbox', listID: 'inbox' };
            expect(resolveUserFromStrategy(strategy, defaultParams, null)).toBeNull();
        });
    });
});
