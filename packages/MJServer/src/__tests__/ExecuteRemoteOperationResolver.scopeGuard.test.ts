/**
 * `ExecuteRemoteOperation` refuses scope-limited sessions (anonymous magic-link guests and
 * resource-scoped magic-link sessions) unless the operation sets `AllowScopeLimitedPrincipals`.
 * A session's scope is enforced by row-level security on entity reads, which does not bound
 * what an operation does, so an operation serves such sessions only when it opts in (and then
 * checks the scope itself in `Authorize`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// As in RunDecisionResolver.test.ts: vitest's esbuild transform does not apply
// `emitDecoratorMetadata`, so the decorators are no-ops and the resolver runs as a plain class.
vi.mock('type-graphql', () => {
    const noopDecorator = () => () => undefined;
    return {
        Resolver: noopDecorator, Mutation: noopDecorator, Query: noopDecorator, Subscription: noopDecorator,
        ObjectType: noopDecorator, InputType: noopDecorator, Field: noopDecorator, Arg: noopDecorator,
        Ctx: noopDecorator, PubSub: noopDecorator, Root: noopDecorator, Directive: noopDecorator,
        UseMiddleware: noopDecorator, ID: class {}, Int: class {}, Float: class {},
        AuthorizationError: class AuthorizationError extends Error {},
    };
});

import { BaseRemotableOperation, UserInfo } from '@memberjunction/core';
import { RemoteOperationEngineBase } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import type { PubSubEngine } from 'type-graphql';
import { ExecuteRemoteOperationResolver } from '../resolvers/ExecuteRemoteOperationResolver.js';
import type { AppContext, UserPayload } from '../types.js';

@RegisterClass(BaseRemotableOperation, 'ScopeGuardTest.Ordinary')
class OrdinaryOperation extends BaseRemotableOperation<Record<string, never>, string> {
    public readonly OperationKey = 'ScopeGuardTest.Ordinary';
}

@RegisterClass(BaseRemotableOperation, 'ScopeGuardTest.GuestSafe')
class GuestSafeOperation extends BaseRemotableOperation<Record<string, never>, string> {
    public readonly OperationKey = 'ScopeGuardTest.GuestSafe';
    public override readonly AllowScopeLimitedPrincipals = true;
}

/** Stops each call at the metadata gate, which runs after the scope gate — so reaching it proves the scope gate let the call through. */
const PAST_SCOPE_GATE = 'STUB_PAST_SCOPE_GATE';

function user(kind: 'ordinary' | 'anonymous' | 'scoped'): UserInfo {
    const u = new UserInfo();
    u.ID = 'D1F1A0C4-0000-4000-8000-000000000001';
    u.Email = 'user@example.com';
    if (kind === 'anonymous') {
        u.IsMagicLinkAnonymous = true;
    }
    if (kind === 'scoped') {
        u.MagicLinkScope = { ResourceID: 'A0000000-0000-4000-8000-000000000009' };
    }
    return u;
}

function context(userRecord: UserInfo, isSystemUser = false): AppContext {
    const userPayload: UserPayload = { email: userRecord.Email, userRecord, sessionId: 's-1', isSystemUser };
    return { userPayload, providers: [{ provider: {}, type: 'Read-Write' }] } as unknown as AppContext;
}

async function execute(operationKey: string, ctx: AppContext) {
    const resolver = new ExecuteRemoteOperationResolver();
    const pubSub = { publish: vi.fn() } as unknown as PubSubEngine;
    return resolver.ExecuteRemoteOperation({ operationKey, inputJSON: '{}', invokeMode: 'Sync' }, ctx, pubSub);
}

describe('ExecuteRemoteOperation — scope-limited sessions', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(RemoteOperationEngineBase.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(RemoteOperationEngineBase.Instance, 'IsInvokable').mockReturnValue({
            Invokable: false, ResultCode: PAST_SCOPE_GATE, Reason: 'stopped by the test',
        });
    });

    it.each(['anonymous', 'scoped'] as const)('refuses a %s session an operation that does not opt in', async (kind) => {
        const result = await execute('ScopeGuardTest.Ordinary', context(user(kind)));
        expect(result.success).toBe(false);
        expect(result.resultCode).toBe('FORBIDDEN');
        expect(result.errorMessage).toContain('not available to scope-limited sessions');
        expect(RemoteOperationEngineBase.Instance.IsInvokable).not.toHaveBeenCalled();
    });

    it.each(['anonymous', 'scoped'] as const)('lets a %s session reach an operation that opts in', async (kind) => {
        const result = await execute('ScopeGuardTest.GuestSafe', context(user(kind)));
        expect(result.resultCode).toBe(PAST_SCOPE_GATE);
    });

    it('does not affect an ordinary authenticated user', async () => {
        const result = await execute('ScopeGuardTest.Ordinary', context(user('ordinary')));
        expect(result.resultCode).toBe(PAST_SCOPE_GATE);
    });

    it('does not affect the system user', async () => {
        const result = await execute('ScopeGuardTest.Ordinary', context(user('anonymous'), true));
        expect(result.resultCode).toBe(PAST_SCOPE_GATE);
    });

    it('the opt-in defaults to off on the base class', () => {
        expect(new OrdinaryOperation().AllowScopeLimitedPrincipals).toBeUndefined();
        expect(new GuestSafeOperation().AllowScopeLimitedPrincipals).toBe(true);
    });
});
