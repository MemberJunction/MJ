/**
 * An apply whose selected objects all drop out of buildTargetConfigs must fail, not run RSU on
 * nothing (PropFuel, 2026-10-29). A selection that produces even one table must still apply.
 */
// type-graphql decorators call `Reflect.getMetadata`, which only exists once this polyfill is
// loaded. MUST precede any import that pulls in the resolver file.
import 'reflect-metadata';

import { describe, it, expect, vi } from 'vitest';

vi.mock('type-graphql', () => {
    const noopDecorator = () => () => undefined;
    return {
        Resolver: noopDecorator, Mutation: noopDecorator, Query: noopDecorator, Subscription: noopDecorator,
        ObjectType: noopDecorator, InputType: noopDecorator, Field: noopDecorator, Arg: noopDecorator,
        Args: noopDecorator, Ctx: noopDecorator, PubSub: noopDecorator, Root: noopDecorator,
        Directive: noopDecorator, Authorized: noopDecorator, UseMiddleware: noopDecorator,
        createUnionType: () => class {}, registerEnumType: () => undefined,
        AuthorizationError: class AuthorizationError extends Error {},
        Float: class {}, Int: class {}, ID: class {},
    };
});

vi.mock('../config.js', () => ({ configInfo: { databaseSettings: { requestTimeout: 120_000 } } }));

const { IntegrationDiscoveryResolver } = await import('../resolvers/IntegrationDiscoveryResolver.js');

type Assert = (objects: Array<{ SourceObjectName: string }>, targetConfigs: unknown[], sourceType: string) => void;
const assertTargetConfigs = (IntegrationDiscoveryResolver.prototype as unknown as { assertTargetConfigs: Assert }).assertTargetConfigs;

describe('assertTargetConfigs', () => {
    const selected = [{ SourceObjectName: 'clicks' }, { SourceObjectName: 'sends' }, { SourceObjectName: 'opens' }];

    it('refuses a selection none of whose objects produced a table, naming what was asked for', () => {
        expect(() => assertTargetConfigs(selected, [], 'PropFuel')).toThrow(
            /NO_TARGET_TABLES: none of the 3 selected object\(s\) for PropFuel produced a target table \(clicks, sends, opens\)/
        );
    });

    it('lets a selection through when at least one object produced a table', () => {
        expect(() => assertTargetConfigs(selected, [{ SourceObjectName: 'clicks' }], 'PropFuel')).not.toThrow();
    });

    it('lets an empty selection through — there was nothing to refuse', () => {
        expect(() => assertTargetConfigs([], [], 'PropFuel')).not.toThrow();
    });
});
