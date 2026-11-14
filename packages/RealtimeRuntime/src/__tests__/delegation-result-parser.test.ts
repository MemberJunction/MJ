import { describe, it, expect } from 'vitest';
import { ParseDelegationResultJson } from '../session/delegation-result-parser';

describe('ParseDelegationResultJson ArtifactTypeName & DriverClass', () => {
    it('parses optional artifactTypeName and driverClass while tolerating legacy entries without them', () => {
        const json = JSON.stringify({
            success: true,
            output: 'Created sheet and component',
            runId: 'run-1',
            artifacts: [
                {
                    artifactId: 'art-sheet',
                    artifactVersionId: 'ver-1',
                    name: 'Revenue Analysis',
                    artifactTypeName: 'Excel Spreadsheet',
                    driverClass: 'SpreadsheetArtifactViewerPlugin',
                },
                {
                    artifactId: 'art-legacy',
                    artifactVersionId: 'ver-2',
                    name: 'Legacy Widget',
                },
                {
                    artifactId: '',
                    artifactVersionId: 'ver-3',
                    name: 'Invalid',
                },
            ],
        });

        const parsed = ParseDelegationResultJson(json);
        expect(parsed.Success).toBe(true);
        expect(parsed.RunID).toBe('run-1');
        expect(parsed.Artifacts).toEqual([
            {
                ArtifactID: 'art-sheet',
                ArtifactVersionID: 'ver-1',
                Name: 'Revenue Analysis',
                ArtifactTypeName: 'Excel Spreadsheet',
                DriverClass: 'SpreadsheetArtifactViewerPlugin',
            },
            {
                ArtifactID: 'art-legacy',
                ArtifactVersionID: 'ver-2',
                Name: 'Legacy Widget',
            },
        ]);
    });
});
