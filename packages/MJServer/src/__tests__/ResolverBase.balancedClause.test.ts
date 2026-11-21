// ResolverBase transitively pulls in type-graphql decorators, which need the
// Reflect.metadata polyfill at import time.
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import type { DatabaseProviderBase, IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { PubSubEngine } from 'type-graphql';
import { ResolverBase } from '../generic/ResolverBase.js';
import type { RunDynamicViewInput } from '../generic/RunViewResolver.js';
import type { UserPayload } from '../types.js';

/**
 * The provider splices a client ExtraFilter as `(<ExtraFilter>) AND (<row-level security>)` and the
 * tenant hook as `(<ExtraFilter>) AND (<tenant>)`. A fragment that closes a parenthesis it did not
 * open, such as `1=1) OR (1=1`, turns that into `(1=1) OR (1=1) AND (<rls>)`. AND binds tighter than
 * OR, so the server filter then narrows only one side of an OR the caller controls.
 *
 * The boundary screen parsed each fragment inside the parentheses it adds itself, which hides exactly
 * that imbalance. These tests pin that the screen requires every fragment to be balanced on its own.
 */

const ENTITY_NAME = 'MJ: Conversations';

/** Captures what the resolver asked `RunView` for. */
type Captured = { params: RunViewParams | null };

function fakeProvider(captured: Captured): DatabaseProviderBase {
    return {
        Entities: [
            {
                ID: 'E1',
                Name: ENTITY_NAME,
                SchemaName: '__mj',
                BaseView: 'vwConversations',
                BaseTable: 'Conversation',
                Fields: [{ Name: 'Name', NeedsQuotes: true }],
                GetUserPermisions: () => ({ CanRead: true }),
            },
        ],
        RunView: async (params: RunViewParams): Promise<RunViewResult> => {
            captured.params = params;
            return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ErrorMessage: '' } as RunViewResult;
        },
    } as unknown as DatabaseProviderBase;
}

const fakeUser = () => ({ Email: 'tester@example.com' } as UserInfo);
const fakePayload = () => ({ email: 'tester@example.com', userRecord: fakeUser() } as UserPayload);

/** Reaches the protected boundary screen and the dynamic-view entry point. */
class Probe extends ResolverBase {
    public ScreenClause(clause: string, label: string, provider: DatabaseProviderBase): void {
        this.assertClientClauseUsesEntityBaseViews(clause, label, provider as unknown as IMetadataProvider);
    }

    public RunDynamic(input: RunDynamicViewInput, provider: DatabaseProviderBase) {
        return this.RunDynamicViewGeneric(input, provider, fakePayload(), undefined as unknown as PubSubEngine);
    }
}

describe('ResolverBase boundary screen — a client filter must be one balanced expression', () => {
    const provider = () => fakeProvider({ params: null });

    // Each of these closes the parentheses the provider wraps the fragment in. All of them parse
    // once the screen adds its own `(` … `)`, which is why the screen must check them standalone.
    const escapes = [
        '1=1) OR (1=1',
        "Name = 'a') OR (Name = 'b'",
        "[Name] = 'a') OR ([Name] = 'b'",
        '(1=1)) OR ((1=1)',
    ];

    it.each(escapes)('rejects the ExtraFilter %j', (clause) => {
        expect(() => new Probe().ScreenClause(clause, 'ExtraFilter', provider())).toThrow(/parenthesis/);
    });

    it.each(escapes)('rejects the OverrideExcludeFilter %j', (clause) => {
        expect(() => new Probe().ScreenClause(clause, 'OverrideExcludeFilter', provider())).toThrow(/parenthesis/);
    });

    it('rejects a fragment that leaves a parenthesis open', () => {
        expect(() => new Probe().ScreenClause('(1=1', 'ExtraFilter', provider())).toThrow();
    });

    it('allows a balanced filter, including parentheses inside string literals', () => {
        const p = new Probe();
        const md = provider();
        expect(() => p.ScreenClause("(Name = 'a' OR Name = 'b') AND (Name <> 'c')", 'ExtraFilter', md)).not.toThrow();
        expect(() => p.ScreenClause("Name = 'a) OR (b'", 'ExtraFilter', md)).not.toThrow();
        expect(() => p.ScreenClause("Name LIKE '%(%'", 'OverrideExcludeFilter', md)).not.toThrow();
    });

    it('RunDynamicViewGeneric never reaches RunView with an ExtraFilter that closes the wrapper', async () => {
        const captured: Captured = { params: null };
        const input = { EntityName: ENTITY_NAME, ExtraFilter: '1=1) OR (1=1' } as RunDynamicViewInput;

        await expect(new Probe().RunDynamic(input, fakeProvider(captured))).rejects.toThrow(/parenthesis/);
        expect(captured.params).toBeNull();
    });

    it('RunDynamicViewGeneric passes a balanced ExtraFilter through unchanged', async () => {
        const captured: Captured = { params: null };
        const input = { EntityName: ENTITY_NAME, ExtraFilter: "Name = 'a' OR Name = 'b'" } as RunDynamicViewInput;

        await new Probe().RunDynamic(input, fakeProvider(captured));

        expect(captured.params?.ExtraFilter).toBe("Name = 'a' OR Name = 'b'");
    });

    it('rejects a comment', () => {
        expect(() => new Probe().ScreenClause("Name = 'a' -- note\n", 'ExtraFilter', provider())).toThrow(/comment/);
        expect(() => new Probe().ScreenClause("Name = 'a' /* note */", 'OrderBy', provider())).toThrow(/comment/);
    });
});

describe('ResolverBase boundary screen — backslashes inside quotes', () => {
    // The screen's parser reads a backslash before a quote inside a plain literal as an escaped
    // quote; SQL Server and PostgreSQL read the quote as the end of the literal. Text after it can
    // then be code the engine runs while the parser saw a string, so it escapes the screen's checks.
    const provider = () => fakeProvider({ params: null });

    it('rejects a filter whose hidden part the parser reads as a string constant', () => {
        const hidesSelect = "Name = 'a\\' AND 1 = (SELECT 1) AND Name = ' + [b' + [c]";
        expect(() => new Probe().ScreenClause(hidesSelect, 'ExtraFilter', provider())).toThrow(/backslash/);
        expect(() => new Probe().ScreenClause(hidesSelect, 'OverrideExcludeFilter', provider())).toThrow(/backslash/);
    });

    it.each(["Path = 'C:\\temp'", '[a\\b] = 1', '"a\\b" = 1'])('rejects a backslash inside a quoted string or identifier (%#)', (clause) => {
        expect(() => new Probe().ScreenClause(clause, 'ExtraFilter', provider())).toThrow(/backslash/);
    });

    it('allows a filter with no backslash inside quotes', () => {
        expect(() => new Probe().ScreenClause("Path LIKE 'C:/temp%'", 'ExtraFilter', provider())).not.toThrow();
    });
});

/** Named so the screen reads clauses with the PostgreSQL dialect, as it does for the real provider. */
class PostgreSQLDataProviderFake {
    public Entities = [];
}

describe('ResolverBase boundary screen — PostgreSQL', () => {
    const pgProvider = () => new PostgreSQLDataProviderFake() as unknown as DatabaseProviderBase;

    it.each([
        ['Name = $$x$$', /dollar/],
        ['Café = 1', /outside ASCII/],
        ["Name = E'x'\n'y'", /escape string/],
    ])('rejects what the lexer cannot read the way PostgreSQL does (%#)', (clause, reason) => {
        expect(() => new Probe().ScreenClause(clause, 'ExtraFilter', pgProvider())).toThrow(reason);
    });

    it('allows text outside ASCII inside a string literal', () => {
        expect(() => new Probe().ScreenClause("Name = 'Café'", 'ExtraFilter', pgProvider())).not.toThrow();
    });
});
