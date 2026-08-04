/**
 * Active-status enforcement tests.
 *
 * Verifies the contract that deprecated-field warnings (and disabled-field exceptions) are raised at
 * the BaseEntity field-access boundary — Get() / Set() / SetMany(), which the generated strongly-typed
 * accessors flow through — and NOT by the low-level EntityField.Value accessor or any framework-internal
 * value machinery (Dirty / Validate / GetAll / hydration). This is what keeps loading or saving a record
 * that merely contains a deprecated column (e.g. "MJ: AI Agent Runs".AgentState) from false-warning.
 *
 * Also covers the EntityInfo.HasInactiveFields fast-path gate that lets all-Active entities skip the
 * per-field status check entirely.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { WarningManager } from '@memberjunction/global';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';

class MJTestEntity extends BaseEntity {}

// Entity with a mix of Active / Deprecated / Disabled fields.
function makeMixedEntityInfo(): EntityInfo {
    return new EntityInfo({
        ID: 'ent-mixed',
        Name: 'Mixed Things',
        SchemaName: 'app',
        BaseTable: 'MixedThing',
        EntityFields: [
            { ID: 'f1', EntityID: 'ent-mixed', Entity: 'Mixed Things', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, IsUnique: true, Sequence: 1, Status: 'Active', AllowsNull: false },
            { ID: 'f2', EntityID: 'ent-mixed', Entity: 'Mixed Things', Name: 'Name', Type: 'nvarchar', Sequence: 2, Status: 'Active', AllowsNull: true },
            { ID: 'f3', EntityID: 'ent-mixed', Entity: 'Mixed Things', Name: 'OldState', Type: 'nvarchar', Sequence: 3, Status: 'Deprecated', AllowsNull: true },
            { ID: 'f4', EntityID: 'ent-mixed', Entity: 'Mixed Things', Name: 'DeadField', Type: 'nvarchar', Sequence: 4, Status: 'Disabled', AllowsNull: true },
        ],
    });
}

// Entity with only Active fields — exercises the HasInactiveFields=false fast path.
function makeActiveEntityInfo(): EntityInfo {
    return new EntityInfo({
        ID: 'ent-active',
        Name: 'Active Things',
        SchemaName: 'app',
        BaseTable: 'ActiveThing',
        EntityFields: [
            { ID: 'a1', EntityID: 'ent-active', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, IsUnique: true, Sequence: 1, Status: 'Active', AllowsNull: false },
            { ID: 'a2', EntityID: 'ent-active', Name: 'Name', Type: 'nvarchar', Sequence: 2, Status: 'Active', AllowsNull: true },
        ],
    });
}

describe('EntityInfo.HasInactiveFields', () => {
    it('is true when any field is Deprecated or Disabled', () => {
        expect(makeMixedEntityInfo().HasInactiveFields).toBe(true);
    });

    it('is false when every field is Active', () => {
        expect(makeActiveEntityInfo().HasInactiveFields).toBe(false);
    });

    it('memoizes the result (computed once, stable thereafter)', () => {
        const e = makeMixedEntityInfo();
        const first = e.HasInactiveFields;
        // Mutate the underlying field status after first access — memoized value must not change.
        e.Fields[2].Status = 'Active';
        expect(e.HasInactiveFields).toBe(first);
    });
});

describe('BaseEntity active-status enforcement at Get/Set/SetMany', () => {
    let mixedEntityInfo: EntityInfo;
    let activeEntityInfo: EntityInfo;
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeAll(() => {
        mixedEntityInfo = makeMixedEntityInfo();
        activeEntityInfo = makeActiveEntityInfo();
        Metadata.Provider = {
            Entities: [mixedEntityInfo, activeEntityInfo],
            CurrentUser: null,
        } as unknown as ProviderBase;
    });

    afterAll(() => {
        Metadata.Provider = null as unknown as ProviderBase;
    });

    beforeEach(() => {
        // mockReturnValue keeps the real WarningManager from accumulating/flushing console output.
        warnSpy = vi.spyOn(WarningManager.Instance, 'RecordFieldDeprecationWarning').mockReturnValue(true);
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    it('warns when reading a deprecated field via Get()', () => {
        const e = new MJTestEntity(mixedEntityInfo);
        e.Get('OldState');
        expect(warnSpy).toHaveBeenCalledWith('Mixed Things', 'OldState', 'BaseEntity.Get');
    });

    it('warns when writing a deprecated field via Set()', () => {
        const e = new MJTestEntity(mixedEntityInfo);
        e.Set('OldState', 'x');
        expect(warnSpy).toHaveBeenCalledWith('Mixed Things', 'OldState', 'BaseEntity.Set');
    });

    it('warns when a user SetMany() touches a deprecated field', () => {
        const e = new MJTestEntity(mixedEntityInfo);
        e.SetMany({ Name: 'hi', OldState: 'x' });
        expect(warnSpy).toHaveBeenCalledWith('Mixed Things', 'OldState', 'BaseEntity.SetMany');
    });

    it('does NOT warn when SetMany() opts out (load/hydration path)', () => {
        const e = new MJTestEntity(mixedEntityInfo);
        // ignoreActiveStatusAssertions=true — what InnerLoad/Hydrate pass when populating from the DB.
        e.SetMany({ OldState: 'x' }, false, true, true);
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('throws when accessing a disabled field via Get()', () => {
        const e = new MJTestEntity(mixedEntityInfo);
        expect(() => e.Get('DeadField')).toThrow(/disabled/i);
    });

    it('does not warn on Active-field access', () => {
        const e = new MJTestEntity(mixedEntityInfo);
        e.Set('Name', 'hello');
        e.Get('Name');
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('does not warn for an all-Active entity (HasInactiveFields fast path)', () => {
        const e = new MJTestEntity(activeEntityInfo);
        e.Set('Name', 'hello');
        e.Get('Name');
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('does NOT warn for framework-internal machinery (Dirty / Validate / GetAll) over a deprecated field', () => {
        const e = new MJTestEntity(mixedEntityInfo);
        // Populate via the load path (no warning), then exercise the internal machinery the agent-run
        // Save() runs — none of which should warn for the deprecated OldState column.
        e.SetMany({ ID: '00000000-0000-0000-0000-000000000001', Name: 'n', OldState: 'legacy' }, false, true, true);
        warnSpy.mockClear();

        void e.Dirty;
        e.Validate();
        e.GetAll();

        expect(warnSpy).not.toHaveBeenCalled();
    });
});
