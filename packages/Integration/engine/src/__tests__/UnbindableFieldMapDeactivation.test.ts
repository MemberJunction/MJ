/**
 * A field map that names a column the entity does not have must not stay Active.
 *
 * `BaseEntity.Set` no-ops on an unknown field, so such a map drops its value for every record while
 * the save succeeds and the run reports the rows as written — hollow rows on a sync that says it
 * worked (ACR dev: 306 such maps on one object). Warning about it was step one; leaving the map Active
 * meant every later run repeated the same silent drop and the same warning forever, because nothing
 * anywhere reconciles a map's Status against the physical column.
 *
 * The engine is the one place that knows both halves at a moment when no DDL is pending, so it flips
 * the row. These tests drive that seam directly (as IntegrationEngine.orphan-sweep.test.ts does with
 * its own), because the surrounding method is a whole pull sync.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { IntegrationEngine } from '../IntegrationEngine.js';
import type { ICompanyIntegrationEntityMap, ICompanyIntegrationFieldMap } from '../entity-types.js';

type FieldMapStub = ICompanyIntegrationFieldMap & {
    Set: ReturnType<typeof vi.fn>;
    Save: ReturnType<typeof vi.fn>;
};

function fieldMap(
    SourceFieldName: string,
    DestinationFieldName: string,
    opts: { saves?: boolean; IsKeyField?: boolean } = {},
): FieldMapStub {
    const data: Record<string, unknown> = { Status: 'Active' };
    return {
        ID: `fm-${SourceFieldName}`,
        EntityMapID: 'em-1',
        SourceFieldName,
        SourceFieldLabel: null,
        DestinationFieldName,
        DestinationFieldLabel: null,
        Direction: 'SourceToDest',
        TransformPipeline: null,
        IsKeyField: opts.IsKeyField ?? false,
        IsRequired: false,
        DefaultValue: null,
        Priority: 0,
        get Status() { return data.Status as 'Active' | 'Inactive'; },
        Get: (f: string) => data[f],
        Set: vi.fn((f: string, v: unknown) => { data[f] = v; }),
        Save: vi.fn().mockResolvedValue(opts.saves ?? true),
    } as unknown as FieldMapStub;
}

const entityMap = {
    ID: 'em-1',
    ExternalObjectName: 'contacts',
    Entity: 'Contacts',
} as unknown as ICompanyIntegrationEntityMap;

const contextUser = { ID: 'user-1' } as UserInfo;

type Warning = { stage: string; code: string; message: string; data?: Record<string, unknown> };

/** The engine with only the two collaborators this decision touches stubbed. */
function harness(entityFields: string[] | null) {
    const engine = Object.create(IntegrationEngine.prototype) as IntegrationEngine;
    // One provider OBJECT, not one per access: the engine's write serializer is keyed on the
    // provider identity in a WeakMap, so a getter that minted a new object each time would hand every
    // write its own lock and quietly stop testing the ordering the real engine has.
    const provider = {
        EntityByName: (name: string) =>
            entityFields === null ? undefined : { Name: name, Fields: entityFields.map(Name => ({ Name })) },
    };
    Object.defineProperty(engine, 'ProviderToUse', { get: () => provider });
    const warnings: Warning[] = [];
    const logger = {
        warning: (stage: string, code: string, message: string, data?: Record<string, unknown>) =>
            warnings.push({ stage, code, message, data }),
    };
    const run = (fieldMaps: ICompanyIntegrationFieldMap[]) =>
        (engine as unknown as {
            ReconcileUnbindableFieldMaps: (
                em: ICompanyIntegrationEntityMap,
                fms: ICompanyIntegrationFieldMap[],
                u: UserInfo,
                l: unknown,
            ) => Promise<void>;
        }).ReconcileUnbindableFieldMaps(entityMap, fieldMaps, contextUser, logger);
    return { run, warnings };
}

describe('IntegrationEngine — an unbindable field map is reported AND deactivated', () => {
    beforeEach(() => vi.clearAllMocks());

    it('flips the unbindable map to Inactive and leaves the bindable ones alone', async () => {
        const bindable = fieldMap('email', 'Email');
        const unbindable = fieldMap('middle', 'MiddleName');
        const h = harness(['ID', 'Email']);

        await h.run([bindable, unbindable]);

        expect(unbindable.Set).toHaveBeenCalledWith('Status', 'Inactive');
        expect(unbindable.Save).toHaveBeenCalledTimes(1);
        expect(unbindable.Status).toBe('Inactive');
        expect(bindable.Set).not.toHaveBeenCalled();
        expect(bindable.Save).not.toHaveBeenCalled();
        expect(bindable.Status).toBe('Active');
    });

    it('warns once for the map set, naming the pair and the deactivation', async () => {
        const h = harness(['ID', 'Email']);
        await h.run([fieldMap('middle', 'MiddleName'), fieldMap('nick', 'Nickname')]);

        expect(h.warnings).toHaveLength(1);
        const [w] = h.warnings;
        expect(w.code).toBe('FIELD_MAP_DESTINATION_MISSING');
        expect(w.stage).toBe('contacts');
        expect(w.message).toContain('middle -> MiddleName');
        expect(w.message).toContain('nick -> Nickname');
        expect(w.message).toContain('DEACTIVATED');
        expect(w.data?.deactivated).toBe(2);
        expect(w.data?.deactivationFailed).toBe(0);
    });

    it('does not claim a deactivation the write did not achieve', async () => {
        const stubborn = fieldMap('middle', 'MiddleName', { saves: false });
        const h = harness(['ID', 'Email']);

        await h.run([stubborn]);

        const [w] = h.warnings;
        expect(w.data?.deactivated).toBe(0);
        expect(w.data?.deactivationFailed).toBe(1);
        expect(w.message).toContain('could NOT be deactivated');
        expect(w.message).not.toContain('has been DEACTIVATED');
    });

    it('says and does nothing when every map binds', async () => {
        const bindable = fieldMap('email', 'Email');
        const h = harness(['ID', 'Email']);

        await h.run([bindable]);

        expect(h.warnings).toEqual([]);
        expect(bindable.Save).not.toHaveBeenCalled();
    });

    it('touches nothing when the entity cannot be resolved — unknown is not "column missing"', async () => {
        // A workspace whose metadata failed to load would otherwise have every map deactivated.
        const anyMap = fieldMap('email', 'Email');
        const h = harness(null);

        await h.run([anyMap]);

        expect(h.warnings).toEqual([]);
        expect(anyMap.Save).not.toHaveBeenCalled();
    });

    it('deactivates an unbindable KEY map too, and still explains the re-creation', async () => {
        const key = fieldMap('id', 'ExternalID', { IsKeyField: true });
        const h = harness(['ID', 'Email']);

        await h.run([key]);

        expect(key.Status).toBe('Inactive');
        expect(h.warnings[0].message).toContain('(KEY)');
        expect(h.warnings[0].message).toContain('re-created');
    });
});
