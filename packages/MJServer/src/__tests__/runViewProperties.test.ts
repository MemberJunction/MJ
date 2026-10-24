// ResolverBase / RunViewResolver pull in type-graphql decorators, which need the Reflect.metadata
// polyfill at import time.
import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

// The decorators are irrelevant to what the resolvers pass on, so they become no-ops.
vi.mock('type-graphql', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    const noopDecorator = () => () => undefined;
    return {
        ...actual,
        Resolver: noopDecorator, Query: noopDecorator, Mutation: noopDecorator, Subscription: noopDecorator,
        ObjectType: noopDecorator, InputType: noopDecorator, Field: noopDecorator, Arg: noopDecorator,
        Args: noopDecorator, Ctx: noopDecorator, Root: noopDecorator, PubSub: noopDecorator,
    };
});
import type { DatabaseProviderBase, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';
import { RunViewResolver, type RunDynamicViewInput, type RunViewByIDInput, type RunViewByNameInput } from '../generic/RunViewResolver.js';
import type { AppContext, UserPayload } from '../types.js';

/**
 * The GraphQL view resolvers pass a client's `Properties` on to the provider and never
 * `ServerProperties`, whatever the input object carries; and a refusal the provider returns
 * reaches the client with its message.
 */

const ENTITY_NAME = 'MJ: Things';
const VIEW_ID = '33333333-3333-4333-8333-333333333333';
const CHAPTER = '11111111-1111-4111-8111-111111111111';
const REFUSAL = 'View property "Chapter" is set by the server; a client value for it is refused.';

function payload(): UserPayload {
    return { email: 'tester@example.com', userRecord: { Email: 'tester@example.com' } as UserInfo } as UserPayload;
}

function entityStub() {
    return { ID: 'ent-1', Name: ENTITY_NAME, BaseView: 'vwThings', PrimaryKeys: [{ Name: 'ID' }], Fields: [{ Name: 'ID', CodeName: 'ID', NeedsQuotes: true }], EncryptedFields: [] };
}

function userViewsEntityStub() {
    return { ...entityStub(), ID: 'ent-views', Name: 'MJ: User Views' };
}

const viewRow = { ID: VIEW_ID, Name: 'Chapter Things', Entity: ENTITY_NAME, EntityID: 'ent-1' };

/** Records the run params each resolver hands the provider; a run carrying Properties is refused like the provider would. */
function recordingProvider() {
    const views: RunViewParams[] = [];
    const answer = (p: RunViewParams): RunViewResult => {
        if (p.EntityName === 'MJ: User Views') {
            return { Success: true, Results: [viewRow], RowCount: 1, TotalRowCount: 1, ErrorMessage: '' } as RunViewResult;
        }
        views.push(p);
        return p.Properties
            ? ({ Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ErrorMessage: REFUSAL } as RunViewResult)
            : ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ErrorMessage: '' } as RunViewResult);
    };
    const provider = {
        Entities: [entityStub(), userViewsEntityStub()],
        EntityByName: (name: string) => (name === ENTITY_NAME ? entityStub() : undefined),
        EntityByID: () => entityStub(),
        GetEntityObject: async () => ({ ...viewRow, Load: async () => true }),
        RunView: async (params: RunViewParams) => answer(params),
        RunViews: async (params: RunViewParams[]) => params.map(answer),
    } as unknown as DatabaseProviderBase;
    return { provider, views };
}

function appContext(provider: DatabaseProviderBase): AppContext {
    return { providers: [{ provider, type: 'Read-Write' }], userPayload: payload() } as unknown as AppContext;
}

class Probe extends ResolverBase {
    protected override async ArrayFilterEncryptedFieldsForAPI(_entityName: string, rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
        return rows;
    }
}

/** An input as a client might shape it, with a ServerProperties field smuggled in. */
function smuggled<T>(input: T): T {
    return { ...input, Properties: { Chapter: CHAPTER }, ServerProperties: { Chapter: 'forged' } } as T;
}

describe('GraphQL view resolvers and view properties', () => {
    it('RunViewByID and RunViewByName pass Properties on, never ServerProperties', async () => {
        const { provider, views } = recordingProvider();
        await new Probe().RunViewByIDGeneric(smuggled({ ViewID: VIEW_ID } as RunViewByIDInput), provider, payload(), undefined as never);
        await new Probe().RunViewByNameGeneric(smuggled({ ViewName: viewRow.Name } as RunViewByNameInput), provider, payload(), undefined as never);
        expect(views.map((v) => v.Properties)).toEqual([{ Chapter: CHAPTER }, { Chapter: CHAPTER }]);
        expect(views.map((v) => v.ServerProperties)).toEqual([undefined, undefined]);
        expect(views[0].ViewID).toBe(VIEW_ID);
    });

    it('RunViews passes Properties on for each view, never ServerProperties', async () => {
        const { provider, views } = recordingProvider();
        const inputs = [smuggled({ ViewID: VIEW_ID }), { EntityName: ENTITY_NAME }] as (RunViewByNameInput & RunViewByIDInput & RunDynamicViewInput)[];
        await new Probe().RunViewsGeneric(inputs, provider, payload());
        expect(views.map((v) => v.Properties)).toEqual([{ Chapter: CHAPTER }, undefined]);
        expect(views.every((v) => v.ServerProperties === undefined)).toBe(true);
    });

    it('a run without Properties carries none', async () => {
        const { provider, views } = recordingProvider();
        await new Probe().RunViewByIDGeneric({ ViewID: VIEW_ID } as RunViewByIDInput, provider, payload(), undefined as never);
        expect(views[0].Properties).toBeUndefined();
    });

    it('RunViewByID returns the provider refusal, naming the property', async () => {
        const { provider } = recordingProvider();
        const result = await new RunViewResolver().RunViewByID(smuggled({ ViewID: VIEW_ID } as RunViewByIDInput), appContext(provider), undefined as never);
        expect(result).toMatchObject({ Success: false, ErrorMessage: REFUSAL });
    });
});
