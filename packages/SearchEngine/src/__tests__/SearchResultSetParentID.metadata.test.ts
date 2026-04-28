/**
 * Metadata-validation test (P6.3): asserts that the `Search Result Set` artifact
 * type's `ParentID` stays pointed at `Data Snapshot` after every CodeGen / metadata
 * sync pass.
 *
 * Background: Phase 2B.1 re-parented `Search Result Set` onto `Data Snapshot` so it
 * inherits Data Snapshot's tabular tools (filter, sort, paginate, get-row,
 * project-columns) on top of the search-specific tools added in P2B.2-P2B.7. If
 * a future metadata edit accidentally drops or rewrites that `ParentID`, the
 * agent's tool-chain through `ArtifactToolManager` silently regresses — every
 * Search Result Set artifact would lose Data Snapshot's tools without any test
 * failing. This test is the tripwire.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface ArtifactTypeRow {
    fields: { Name: string; ParentID?: string; DriverClass?: string };
}

const ARTIFACT_TYPES_PATH = resolve(
    __dirname,
    '../../../../metadata/artifact-types/.artifact-types.json',
);

describe('Search Result Set artifact-type metadata (P6.3)', () => {
    const raw = readFileSync(ARTIFACT_TYPES_PATH, 'utf8');
    const rows = JSON.parse(raw) as ArtifactTypeRow[];
    const searchResultSet = rows.find(r => r.fields.Name === 'Search Result Set');

    it('the Search Result Set entry exists in the artifact-types metadata file', () => {
        expect(searchResultSet).toBeDefined();
    });

    it('points ParentID at Data Snapshot via the @lookup form (CodeGen / sync resilient)', () => {
        // The lookup form survives CodeGen runs because metadata-sync resolves it on
        // every push by name — direct UUID values would be brittle if Data Snapshot's
        // ID ever rotated. Phase 2B.1 chose the lookup form for exactly this reason.
        expect(searchResultSet?.fields.ParentID).toBe(
            '@lookup:MJ: Artifact Types.Name=Data Snapshot',
        );
    });

    it('uses the DataArtifactViewerPlugin driver inherited from Data Snapshot', () => {
        // Phase 2B.1 set DriverClass alongside the re-parent so the artifact viewer
        // renders Search Result Sets with the same tabular UI Data Snapshot uses.
        expect(searchResultSet?.fields.DriverClass).toBe('DataArtifactViewerPlugin');
    });
});
