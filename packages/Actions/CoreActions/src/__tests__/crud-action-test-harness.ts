/**
 * Shared test doubles for the generic CRUD action tests:
 *   create-record / update-record / delete-record / get-record / get-records.
 *
 * The CRUD actions are thin wrappers over the metadata provider
 * (EntityByName / GetEntityObject) and the BaseEntity lifecycle
 * (NewRecord / InnerLoad / Set / Get / GetAll / Save / Delete / LatestResult),
 * so the fixtures here are plain structural fakes of those collaborators —
 * no live database, mirroring write-entity-fields.action.test.ts.
 *
 * NOTE: `vi.mock(...)` calls CANNOT live here — vi.mock is hoisted per test
 * file. Each test file declares its own module mocks; this module only holds
 * runtime-free type imports and fixture builders.
 */

import { vi } from 'vitest';
import type { ActionParam, RunActionParams } from '@memberjunction/actions-base';

/** Captured shape produced by the CompositeKey mock's FromObject. */
export interface CapturedKeyValuePair {
    FieldName: string;
    Value: unknown;
}

/** What the CompositeKey mock hands to FakeEntity.InnerLoad. */
export interface CapturedCompositeKey {
    KeyValuePairs: CapturedKeyValuePair[];
}

/**
 * Structural fake for a BaseEntity instance. Field values live in `values`;
 * the constructor also defines real accessor properties for each declared
 * field name so the actions' `fieldName in entity` membership checks behave
 * like they do against a generated entity class (typo'd fields are absent).
 */
export class FakeEntity {
    public values: Record<string, unknown> = {};
    public newRecordCalled = false;
    public innerLoadResult = true;
    public saveResult = true;
    public deleteResult = true;
    public saveCallCount = 0;
    public deleteCallCount = 0;
    public loadedKey: CapturedCompositeKey | undefined;
    public latestCompleteMessage: string | undefined;

    constructor(fieldNames: string[] = [], initialValues: Record<string, unknown> = {}) {
        for (const fieldName of fieldNames) {
            Object.defineProperty(this, fieldName, {
                get: () => this.values[fieldName],
                set: (v: unknown) => {
                    this.values[fieldName] = v;
                },
                enumerable: true,
                configurable: true,
            });
        }
        this.values = { ...initialValues };
    }

    public NewRecord(): boolean {
        this.newRecordCalled = true;
        return true;
    }

    public Set(field: string, value: unknown): void {
        this.values[field] = value;
    }

    public Get(field: string): unknown {
        return this.values[field];
    }

    public GetAll(): Record<string, unknown> {
        return { ...this.values };
    }

    public async InnerLoad(key: CapturedCompositeKey): Promise<boolean> {
        this.loadedKey = key;
        return this.innerLoadResult;
    }

    public async Save(): Promise<boolean> {
        this.saveCallCount++;
        return this.saveResult;
    }

    public async Delete(): Promise<boolean> {
        this.deleteCallCount++;
        return this.deleteResult;
    }

    public get LatestResult(): { CompleteMessage: string | undefined } | undefined {
        return this.latestCompleteMessage === undefined
            ? undefined
            : { CompleteMessage: this.latestCompleteMessage };
    }
}

/** Minimal EntityInfo shape the CRUD actions consume. */
export interface FakeEntityInfo {
    PrimaryKeys: Array<{ Name: string }>;
    Fields: Array<{ Name: string }>;
}

export const makeEntityInfo = (fieldNames: string[], pkNames: string[] = ['ID']): FakeEntityInfo => ({
    PrimaryKeys: pkNames.map((Name) => ({ Name })),
    Fields: fieldNames.map((Name) => ({ Name })),
});

export interface FakeProviderOpts {
    entityInfo?: FakeEntityInfo;
    entity?: FakeEntity;
}

/**
 * Fake IMetadataProvider covering the two members the CRUD actions call.
 * Both are vi.fn() so tests can assert entity-name / contextUser threading.
 */
export const makeProvider = (opts: FakeProviderOpts) => ({
    EntityByName: vi.fn((_entityName: string) => opts.entityInfo),
    GetEntityObject: vi.fn(async (_entityName: string, _contextUser: unknown) => opts.entity),
});

export type FakeProvider = ReturnType<typeof makeProvider>;

export interface TestUser {
    ID: string;
    Name: string;
    Email: string;
}

export const makeContextUser = (): TestUser => ({
    ID: 'user-1',
    Name: 'Test User',
    Email: 'test@example.com',
});

export interface TestInput {
    Name: string;
    Value: unknown;
    /** Defaults to 'Input'; override to probe the actions' Type filtering. */
    Type?: 'Input' | 'Output' | 'Both';
}

/**
 * Build a RunActionParams fixture. The single structural cast lives here so
 * the test bodies stay fully typed (same pattern as the other CoreActions
 * suites, e.g. get-entity-schema-for-form.action.test.ts).
 */
export const makeParams = (
    inputs: TestInput[],
    provider?: FakeProvider,
    contextUser: TestUser = makeContextUser()
): RunActionParams =>
    ({
        Params: inputs.map((p) => ({ Name: p.Name, Type: p.Type ?? 'Input', Value: p.Value })),
        Provider: provider,
        ContextUser: contextUser,
    }) as unknown as RunActionParams;

/** Find an Output param by name in either params.Params or result.Params. */
export const findOutput = (list: ActionParam[] | undefined, name: string): ActionParam | undefined =>
    list?.find((p) => p.Name === name && p.Type === 'Output');
