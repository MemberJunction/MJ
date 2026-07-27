import { describe, it, expect } from 'vitest';
import {
    findSupersededCreates,
    supersessionViolation,
    shapeDrift,
    EXPECTED,
} from '../../../scripts/generate-v545-metadata-reseed.mjs';

const AGENT = '4A7B4F1D-C536-409F-9206-F36FDEE64EDF';
const later = (file, verb = 'Update', fields = ['ID', 'Name']) => ({ file, verb, fields: new Set(fields) });

describe('findSupersededCreates — a reseeded row must still carry the newest values', () => {
    // WHY THIS MATTERS: PostgreSQL's generated spUpdateX silently no-ops when the row is
    // absent (GET DIAGNOSTICS ROW_COUNT = 0 -> RETURN). So on a gapped database every
    // v5.46-v5.49 update aimed at a v5.45-created row already did nothing, without a trace.
    // If the reseed then CREATES that row from v5.45's values, the newer state is lost
    // permanently and nothing anywhere reports it. The update path is guarded by
    // assertSupersessionSafe; the create path must be guarded too.
    it('reports a create whose row a later release also touched', () => {
        const blocks = [{ verb: 'Create', entity: 'AIAgent', id: AGENT }];
        const supersededByLater = new Map([
            [`AIAgent:${AGENT}`, later('V202607221340__v5.49.x__Metadata_Sync.sql')],
        ]);
        expect(findSupersededCreates(blocks, supersededByLater)).toEqual([
            { entity: 'AIAgent', id: AGENT, file: 'V202607221340__v5.49.x__Metadata_Sync.sql', verb: 'Update' },
        ]);
    });

    it('reports a create whose row a later release DELETED', () => {
        // Resurrection is the mirror of supersession and just as invisible. If a release
        // after v5.45 deleted one of these rows, that delete no-opped silently on a gapped
        // PG database (nothing was there to remove), so re-creating the row here would put
        // back something SQL Server no longer has, with nothing anywhere reporting it.
        const blocks = [{ verb: 'Create', entity: 'AIAgent', id: AGENT }];
        const laterTouches = new Map([
            [`AIAgent:${AGENT}`, later('V202608010000__v5.51.x__Metadata_Sync.sql', 'Delete', [])],
        ]);
        expect(findSupersededCreates(blocks, laterTouches)).toEqual([
            { entity: 'AIAgent', id: AGENT, file: 'V202608010000__v5.51.x__Metadata_Sync.sql', verb: 'Delete' },
        ]);
    });

    it('leaves superseded UPDATES alone — those are dropped, not a blocking conflict', () => {
        // An update to a row a later sync re-updated is handled by assertSupersessionSafe +
        // the drop list. Only creates are unresolvable, so only creates may block.
        const blocks = [{ verb: 'Update', entity: 'AIAgent', id: AGENT }];
        const supersededByLater = new Map([[`AIAgent:${AGENT}`, later('V202607221340__v5.49.x__Metadata_Sync.sql')]]);
        expect(findSupersededCreates(blocks, supersededByLater)).toEqual([]);
    });

    it('matches on entity AND id, not id alone', () => {
        // Two entities can legitimately hold the same UUID in different tables; keying on
        // the id alone would block a create that no later sync actually touched.
        const blocks = [{ verb: 'Create', entity: 'AISkill', id: AGENT }];
        const supersededByLater = new Map([[`AIAgent:${AGENT}`, later('V202607221340__v5.49.x__Metadata_Sync.sql')]]);
        expect(findSupersededCreates(blocks, supersededByLater)).toEqual([]);
    });
});

describe('supersessionViolation — dropping an update must be provably lossless', () => {
    // Dropping a v5.45 update is only safe when the later release rewrote every field
    // v5.45 set. If it did not, the dropped fields are simply lost on gapped databases
    // and nothing would report it, so this is the guard that stands between the reseed
    // and silent data loss.
    const block = { entity: 'AIAgent', id: '4A7B4F1D-C536-409F-9206-F36FDEE64EDF' };
    const v45Fields = (...f) => new Map([[`${block.entity}:${block.id}`, new Set(f)]]);

    it('permits the drop when the later sync rewrote a superset of the fields', () => {
        const later = { file: 'V…v5.49…sql', fields: new Set(['ID', 'Name', 'Status', 'Extra']) };
        expect(supersessionViolation(block, v45Fields('ID', 'Name', 'Status'), later)).toBeNull();
    });

    it('refuses the drop and names the fields the later sync never wrote', () => {
        const later = { file: 'V…v5.49…sql', fields: new Set(['ID', 'Name']) };
        const violation = supersessionViolation(block, v45Fields('ID', 'Name', 'Status', 'IconClass'), later);
        expect(violation).not.toBeNull();
        expect(violation.missing).toEqual(['Status', 'IconClass']);
    });

    it('refuses when the update is absent from the v5.45 source entirely', () => {
        // Means the converted output and the SS source disagree about what v5.45 did, so
        // the supersession analysis is being run against something it does not describe.
        const later = { file: 'V…v5.49…sql', fields: new Set(['ID']) };
        expect(supersessionViolation(block, new Map(), later)).not.toBeNull();
    });
});

describe('shapeDrift — the committed migration must not change silently', () => {
    it('pins the shape this migration shipped with', () => {
        expect(EXPECTED).toEqual({ creates: 161, updatesKept: 13, updatesDropped: 20, deletes: 1 });
    });

    it('is silent when a regeneration reproduces the pinned shape', () => {
        expect(shapeDrift({ ...EXPECTED })).toEqual([]);
    });

    it('reports every count that moved, with expected and actual', () => {
        const drift = shapeDrift({ ...EXPECTED, creates: 160, updatesDropped: 21 });
        expect(drift).toHaveLength(2);
        expect(drift.join(' ')).toMatch(/creates: expected 161, got 160/);
        expect(drift.join(' ')).toMatch(/updatesDropped: expected 20, got 21/);
    });
});
