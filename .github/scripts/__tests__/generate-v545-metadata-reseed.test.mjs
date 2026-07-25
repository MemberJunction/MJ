import { describe, it, expect } from 'vitest';
import { findSupersededCreates } from '../../../scripts/generate-v545-metadata-reseed.mjs';

const AGENT = '4A7B4F1D-C536-409F-9206-F36FDEE64EDF';
const later = (file, fields = ['ID', 'Name']) => ({ file, fields: new Set(fields) });

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
            { entity: 'AIAgent', id: AGENT, file: 'V202607221340__v5.49.x__Metadata_Sync.sql' },
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
