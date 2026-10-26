// The resolver module pulls in type-graphql decorators, which need the Reflect.metadata polyfill.
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import type { EntityCommunicationParams } from '@memberjunction/entity-communications-base';

/**
 * `RunEntityCommunicationByViewID` with `previewOnly` + `includeProcessedMessages` returns the rows
 * it read. It must hand the engine the authenticated caller as the acting user, and screen the
 * view's client-supplied clauses the way a RunView request is screened, because this entry point
 * does not pass through the RunView resolvers.
 */

const { captured } = vi.hoisted(() => ({ captured: { params: [] as EntityCommunicationParams[] } }));

// The resolver's input types declare fields without explicit GraphQL types; the test runner emits no
// decorator metadata, so the decorators are stubbed out.
vi.mock('type-graphql', () => {
    const noopDecorator = () => () => undefined;
    return {
        Resolver: noopDecorator, Mutation: noopDecorator, Query: noopDecorator, Subscription: noopDecorator,
        ObjectType: noopDecorator, InputType: noopDecorator, Field: noopDecorator, Arg: noopDecorator,
        Args: noopDecorator, Ctx: noopDecorator, PubSub: noopDecorator, Root: noopDecorator,
        Directive: noopDecorator, Authorized: noopDecorator, UseMiddleware: noopDecorator,
        createUnionType: () => class {},
        AuthorizationError: class AuthorizationError extends Error {},
        Float: class {}, Int: class {}, ID: class {},
    };
});

vi.mock('@memberjunction/entity-communications-server', () => ({
    EntityCommunicationsEngine: {
        Instance: {
            Config: vi.fn(),
            RunEntityCommunication: vi.fn(async (params: EntityCommunicationParams) => {
                captured.params.push(params);
                return { Success: true, Results: [] };
            }),
        },
    },
}));

vi.mock('@memberjunction/templates', () => ({
    TemplateEngineServer: { Instance: { Config: vi.fn(), FindTemplate: vi.fn() } },
}));

import { ReportResolver } from '../resolvers/EntityCommunicationsResolver.js';
import type { AppContext } from '../types.js';
import type { RunViewByIDInput } from '../generic/RunViewResolver.js';
import type { CommunicationMessageInput } from '../resolvers/EntityCommunicationsResolver.js';

const SENDER = { ID: 'sender', Email: 'sender@example.com' } as UserInfo;

/** Entity metadata the clause screen reads: one entity the sender can read, one it cannot. */
function fakeProvider(): DatabaseProviderBase {
    const entity = (name: string, view: string, canRead: boolean) => ({
        ID: name,
        Name: name,
        SchemaName: '__mj',
        BaseView: view,
        BaseTable: view.replace(/^vw/, ''),
        Fields: [{ Name: 'ID', NeedsQuotes: true }, { Name: 'Email', NeedsQuotes: true }],
        GetUserPermisions: () => ({ CanRead: canRead }),
        GetEffectiveRowFilterWhereClause: () => '',
        GetDeniedReadFields: () => new Set<string>(),
    });
    return {
        Entities: [entity('Customers', 'vwCustomers', true), entity('Salaries', 'vwSalaries', false)],
        GetEntityObject: async () => fakeView(),
    } as unknown as DatabaseProviderBase;
}

/** Saved views by ID, as the caller can load them: `view-1` is a Customers view, `view-salaries` is not. */
const VIEWS: Record<string, { ID: string; EntityID: string }> = {
    'view-1': { ID: 'view-1', EntityID: 'Customers' },
    'view-salaries': { ID: 'view-salaries', EntityID: 'Salaries' },
};

function fakeView() {
    const view = {
        ID: undefined as string | undefined,
        EntityID: undefined as string | undefined,
        async Load(id: string) {
            const found = VIEWS[id];
            if (!found) return false;
            Object.assign(view, found);
            return true;
        },
    };
    return view;
}

function context(): AppContext {
    return {
        userPayload: { email: SENDER.Email, userRecord: SENDER },
        providers: [{ provider: fakeProvider(), type: 'Read-Write' }],
    } as unknown as AppContext;
}

function run(extraFilter?: string, viewID = 'view-1') {
    const viewInput = { ViewID: viewID, ExtraFilter: extraFilter } as RunViewByIDInput;
    const message = { MessageType: {}, From: 'a@example.com', To: '' } as unknown as CommunicationMessageInput;
    return new ReportResolver().RunEntityCommunicationByViewID('Customers', viewInput, 'SendGrid', 'Email', message, true, true, context());
}

describe('RunEntityCommunicationByViewID — runs as the caller', () => {
    beforeEach(() => {
        captured.params = [];
    });

    it('passes the authenticated caller to the engine as the acting user', async () => {
        const result = await run();
        expect(result.Success).toBe(true);
        expect(captured.params).toHaveLength(1);
        expect(captured.params[0].ContextUser).toBe(SENDER);
    });

    it('refuses an ExtraFilter whose subquery reads an entity the caller cannot read, before the engine runs', async () => {
        const result = await run("ID IN (SELECT ID FROM __mj.vwSalaries WHERE Amount > 100000)");
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/ExtraFilter/);
        expect(captured.params).toHaveLength(0);
    });

    it('refuses an ExtraFilter that carries a second statement', async () => {
        const result = await run("1=1; SELECT 1");
        expect(result.Success).toBe(false);
        expect(captured.params).toHaveLength(0);
    });
});

describe('RunEntityCommunicationByViewID — the view must belong to the entity', () => {
    beforeEach(() => {
        captured.params = [];
    });

    it('refuses a view of a different entity, before the engine runs', async () => {
        const result = await run(undefined, 'view-salaries');
        expect(result.Success).toBe(false);
        expect(captured.params).toHaveLength(0);
    });

    it('gives the same error for a view of another entity as for a view that does not exist', async () => {
        const mismatched = await run(undefined, 'view-salaries');
        const missing = await run(undefined, 'view-missing');
        expect(missing.Success).toBe(false);
        expect(mismatched.ErrorMessage).toBe(missing.ErrorMessage);
        expect(mismatched.ErrorMessage).toMatch(/does not exist or you do not have access/);
        expect(captured.params).toHaveLength(0);
    });
});
