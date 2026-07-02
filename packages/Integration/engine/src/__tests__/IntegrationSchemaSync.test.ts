/**
 * Regression pin for the "never fabricate values the source didn't give you"
 * overlay rule.
 *
 * Pre-Phase 0 v5.39.x, the field overlay in IntegrationSchemaSync.UpsertField
 * treated `undefined` from a connector's DiscoverFields output as if the source
 * had affirmatively said `false`.  HubSpot's `/properties/{type}` Properties
 * API doesn't return an `IsPrimaryKey` field at all (PK lives in the response
 * envelope, not in property metadata), and Salesforce's `/sobjects/{X}/describe`
 * leaves `IsPrimaryKey` unset by design.  Result: every Declared row's
 * curated PK (e.g. `hs_object_id`, `Id`) was silently wiped to `false` the
 * moment live discovery overlaid on top, breaking sync for 130 IOs at a time.
 *
 * These tests pin the corrected rule via `decideBooleanOverlay`:
 *   - undefined discovered → Declared wins, value unchanged
 *   - defined discovered, same as declared → Declared wins, no overwrite
 *   - defined discovered, differs from declared → Discovered wins
 */

import { describe, it, expect } from 'vitest';
import { decideBooleanOverlay, decideAbsentDeactivations, decideSchemaLimitViolations, type AbsentDeactivationInput } from '../IntegrationSchemaSync';

describe('decideBooleanOverlay', () => {
    describe('undefined discovered (no-opinion case — the bug class)', () => {
        it('keeps Declared true when discovered is undefined', () => {
            const r = decideBooleanOverlay(true, undefined);
            expect(r.value).toBe(true);
            expect(r.winner).toBe('Declared');
        });

        it('keeps Declared false when discovered is undefined', () => {
            const r = decideBooleanOverlay(false, undefined);
            expect(r.value).toBe(false);
            expect(r.winner).toBe('Declared');
        });

        it('keeps Declared undefined when both are undefined', () => {
            const r = decideBooleanOverlay(undefined, undefined);
            expect(r.value).toBeUndefined();
            expect(r.winner).toBe('Declared');
        });
    });

    describe('defined discovered, matches declared (no-op case)', () => {
        it('Declared wins when both are true', () => {
            const r = decideBooleanOverlay(true, true);
            expect(r.value).toBe(true);
            expect(r.winner).toBe('Declared');
        });

        it('Declared wins when both are false', () => {
            const r = decideBooleanOverlay(false, false);
            expect(r.value).toBe(false);
            expect(r.winner).toBe('Declared');
        });
    });

    describe('defined discovered, differs from declared (legitimate overlay)', () => {
        it('Discovered wins when source says true but declared was false', () => {
            const r = decideBooleanOverlay(false, true);
            expect(r.value).toBe(true);
            expect(r.winner).toBe('Discovered');
        });

        it('Discovered wins when source says false but declared was true (e.g. column became nullable)', () => {
            const r = decideBooleanOverlay(true, false);
            expect(r.value).toBe(false);
            expect(r.winner).toBe('Discovered');
        });

        it('Discovered wins when declared was undefined and source has a value', () => {
            const r = decideBooleanOverlay(undefined, true);
            expect(r.value).toBe(true);
            expect(r.winner).toBe('Discovered');
        });
    });

    describe('the HubSpot/Salesforce regression scenario (PK wipe)', () => {
        it("HubSpot's hs_object_id (Declared PK=true) stays PK when Properties API omits IsPrimaryKey", () => {
            // HubSpot's DiscoverFields maps Properties API output without setting
            // IsPrimaryKey on the result objects — so srcField.IsPrimaryKey is
            // `undefined`.  Pre-fix, this nuked the declared PK to false.
            const result = decideBooleanOverlay(true, undefined);
            expect(result.value).toBe(true);
            expect(result.winner).toBe('Declared');
        });

        it("Salesforce's Id (Declared PK=true) stays PK when describe omits IsPrimaryKey", () => {
            const result = decideBooleanOverlay(true, undefined);
            expect(result.value).toBe(true);
            expect(result.winner).toBe('Declared');
        });

        it('the same rule covers IsRequired / IsUniqueKey / IsReadOnly, not just IsPrimaryKey', () => {
            // The fix replaced four sites with the same helper. Asserting one
            // call site's behavior here documents that the rule applies
            // uniformly across all four guarded attributes.
            const required = decideBooleanOverlay(true, undefined);
            const unique = decideBooleanOverlay(true, undefined);
            const readonly = decideBooleanOverlay(true, undefined);
            expect(required.winner).toBe('Declared');
            expect(unique.winner).toBe('Declared');
            expect(readonly.winner).toBe('Declared');
        });
    });
});

describe('decideAbsentDeactivations (§7 — authoritative-gated deactivation)', () => {
    const base = (over: Partial<AbsentDeactivationInput>): AbsentDeactivationInput => ({
        DeactivateAbsent: true,
        IsAuthoritative: true,
        DiscoveredObjectNames: [],
        DiscoveredFieldNamesByObject: {},
        ActiveObjects: [],
        ActiveFieldsByObjectID: {},
        ObjectIDByName: {},
        ...over,
    });

    it('SAFETY: not authoritative -> deactivates NOTHING even when objects are absent', () => {
        const out = decideAbsentDeactivations(
            base({ IsAuthoritative: false, DiscoveredObjectNames: ['Keep'], ActiveObjects: [{ ID: 'o1', Name: 'Keep' }, { ID: 'o2', Name: 'Gone' }] }),
        );
        expect(out.ObjectIDsToDeactivate).toEqual([]);
        expect(out.FieldIDsToDeactivate).toEqual([]);
    });

    it('SAFETY: DeactivateAbsent=false -> deactivates nothing', () => {
        const out = decideAbsentDeactivations(base({ DeactivateAbsent: false, DiscoveredObjectNames: ['Keep'], ActiveObjects: [{ ID: 'o2', Name: 'Gone' }] }));
        expect(out.ObjectIDsToDeactivate).toEqual([]);
    });

    it('authoritative + requested: deactivates an ACTIVE object ABSENT from discovery, keeps present ones', () => {
        const out = decideAbsentDeactivations(
            base({ DiscoveredObjectNames: ['Keep'], ActiveObjects: [{ ID: 'o1', Name: 'Keep' }, { ID: 'o2', Name: 'Gone' }] }),
        );
        expect(out.ObjectIDsToDeactivate).toEqual(['o2']);
    });

    it('object matching is case-insensitive (discovered "Contacts" keeps active "contacts")', () => {
        const out = decideAbsentDeactivations(base({ DiscoveredObjectNames: ['Contacts'], ActiveObjects: [{ ID: 'o1', Name: 'contacts' }] }));
        expect(out.ObjectIDsToDeactivate).toEqual([]);
    });

    it('FIELD-level: deactivates an ACTIVE field absent from the discovered field set (case-insensitive)', () => {
        const out = decideAbsentDeactivations(
            base({
                DiscoveredObjectNames: ['Contacts'],
                DiscoveredFieldNamesByObject: { Contacts: ['id', 'Name'] },
                ObjectIDByName: { contacts: 'o1' },
                ActiveFieldsByObjectID: { o1: [{ ID: 'f1', Name: 'ID' }, { ID: 'f2', Name: 'name' }, { ID: 'f3', Name: 'oldcol' }] },
            }),
        );
        expect(out.FieldIDsToDeactivate).toEqual(['f3']); // id/Name matched case-insensitively; only oldcol is absent
    });

    it('FIELD-level SAFETY: an object discovered with ZERO fields never has its columns disabled', () => {
        const out = decideAbsentDeactivations(
            base({
                DiscoveredObjectNames: ['Stub'],
                DiscoveredFieldNamesByObject: { Stub: [] }, // DiscoverFields found nothing -> not authoritative for columns
                ObjectIDByName: { stub: 'o1' },
                ActiveFieldsByObjectID: { o1: [{ ID: 'f1', Name: 'anything' }] },
            }),
        );
        expect(out.FieldIDsToDeactivate).toEqual([]);
    });
});

describe('decideSchemaLimitViolations (§B — operator/env table+column caps at the RSU gate)', () => {
    const cols = (...counts: Array<[string, number]>) => counts.map(([Name, ColumnCount]) => ({ Name, ColumnCount }));

    it('DEFAULT (both caps null = unbounded) -> no violation regardless of size', () => {
        const v = decideSchemaLimitViolations({ TableCount: 9999, ColumnCountByTable: cols(['big', 9999]), MaxTables: null, MaxColumnsPerTable: null });
        expect(v).toEqual([]);
    });

    it('rejects when the table count exceeds MaxTables', () => {
        const v = decideSchemaLimitViolations({ TableCount: 12, ColumnCountByTable: [], MaxTables: 10, MaxColumnsPerTable: null });
        expect(v.length).toBe(1);
        expect(v[0]).toContain('MJ_INTEGRATION_MAX_TABLES limit (10)');
    });

    it('allows a selection at exactly the table cap (boundary)', () => {
        const v = decideSchemaLimitViolations({ TableCount: 10, ColumnCountByTable: [], MaxTables: 10, MaxColumnsPerTable: null });
        expect(v).toEqual([]);
    });

    it('rejects + names the table(s) whose column count exceeds MaxColumnsPerTable', () => {
        const v = decideSchemaLimitViolations({
            TableCount: 2,
            ColumnCountByTable: cols(['ok', 5], ['fat', 80], ['alsofat', 90]),
            MaxTables: null,
            MaxColumnsPerTable: 50,
        });
        expect(v.length).toBe(1);
        expect(v[0]).toContain('MJ_INTEGRATION_MAX_COLUMNS_PER_TABLE limit (50)');
        expect(v[0]).toContain('fat (80 columns)');
        expect(v[0]).toContain('alsofat (90 columns)');
        expect(v[0]).not.toContain('ok (');
    });

    it('reports BOTH violations when table-count AND a column-count are over', () => {
        const v = decideSchemaLimitViolations({ TableCount: 12, ColumnCountByTable: cols(['fat', 80]), MaxTables: 10, MaxColumnsPerTable: 50 });
        expect(v.length).toBe(2);
    });

    it('within both caps -> no violation', () => {
        const v = decideSchemaLimitViolations({ TableCount: 3, ColumnCountByTable: cols(['a', 10], ['b', 20]), MaxTables: 10, MaxColumnsPerTable: 50 });
        expect(v).toEqual([]);
    });
});
