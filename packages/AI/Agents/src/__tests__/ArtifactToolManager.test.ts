import { describe, it, expect, beforeEach } from 'vitest';
import { ArtifactToolManager, InputArtifact } from '../ArtifactToolManager';

function makeArtifact(name: string, typeName: string, content: string): InputArtifact {
    return { name, typeName, content };
}

describe('ArtifactToolManager', () => {
    let manager: ArtifactToolManager;

    beforeEach(() => {
        manager = new ArtifactToolManager();
    });

    describe('Initialize and Clear', () => {
        it('starts empty', () => {
            expect(manager.HasArtifacts()).toBe(false);
        });

        it('has artifacts after initialization', () => {
            manager.Initialize([
                makeArtifact('Sales Report', 'Data Snapshot', '{}'),
            ]);
            expect(manager.HasArtifacts()).toBe(true);
        });

        it('assigns alpha IDs: A, B, C...', () => {
            manager.Initialize([
                makeArtifact('First', 'JSON', '{}'),
                makeArtifact('Second', 'JSON', '{}'),
                makeArtifact('Third', 'JSON', '{}'),
            ]);
            const manifest = manager.ToManifestString();
            expect(manifest).toContain('**A**');
            expect(manifest).toContain('**B**');
            expect(manifest).toContain('**C**');
        });

        it('clears all state', () => {
            manager.Initialize([makeArtifact('X', 'JSON', '{}')]);
            manager.Clear();
            expect(manager.HasArtifacts()).toBe(false);
        });
    });

    describe('RegisterArtifact', () => {
        it('adds a mid-run artifact and returns its alpha ID', () => {
            manager.Initialize([makeArtifact('A1', 'JSON', '{}')]);
            const id = manager.RegisterArtifact(makeArtifact('New', 'Text', 'hello'));

            expect(id).toBe('B');
            expect(manager.HasArtifacts()).toBe(true);
            expect(manager.ToManifestString()).toContain('**B**');
        });
    });

    describe('Alpha ID generation', () => {
        it('wraps to AA, AB after Z', () => {
            const artifacts = Array.from({ length: 28 }, (_, i) =>
                makeArtifact(`Art${i}`, 'JSON', '{}')
            );
            manager.Initialize(artifacts);
            const manifest = manager.ToManifestString();

            expect(manifest).toContain('**Z**');
            expect(manifest).toContain('**AA**');
            expect(manifest).toContain('**AB**');
        });
    });

    describe('ToManifestString', () => {
        it('produces markdown with artifact names and types', () => {
            manager.Initialize([
                makeArtifact('Sales Dashboard', 'Data Snapshot', '{"tables":[]}'),
                makeArtifact('Config File', 'JSON', '{"key":"value"}'),
            ]);
            const manifest = manager.ToManifestString();

            expect(manifest).toContain('**A** — Data Snapshot: "Sales Dashboard"');
            expect(manifest).toContain('**B** — JSON: "Config File"');
        });

        it('returns empty string when no artifacts', () => {
            expect(manager.ToManifestString()).toBe('');
        });
    });

    describe('ExecuteToolCalls', () => {
        it('executes a tool call and stores results', async () => {
            manager.Initialize([
                makeArtifact('My Text', 'Text', 'line one\nline two\nline three'),
            ]);

            await manager.ExecuteToolCalls([
                { artifactId: 'A', tool: 'get_lines', input: { start: 0, count: 2 } },
            ]);

            const results = manager.GetPendingResults();
            expect(results).toContain('get_lines');
            expect(results).toContain('line one');
        });

        it('returns error for unknown artifact ID', async () => {
            manager.Initialize([
                makeArtifact('X', 'JSON', '{}'),
                makeArtifact('Y', 'JSON', '{}'),
            ]);

            await manager.ExecuteToolCalls([
                { artifactId: 'Z', tool: 'json_keys', input: {} },
            ]);

            const results = manager.GetPendingResults();
            expect(results).toContain('Unknown artifact ID');
        });
    });

    describe('GetPendingResults', () => {
        it('returns empty string when no results', () => {
            expect(manager.GetPendingResults()).toBe('');
        });
    });

    describe('ToJSON', () => {
        it('serializes current state', () => {
            manager.Initialize([
                makeArtifact('Test', 'JSON', '{"a":1}'),
            ]);
            const snapshot = manager.ToJSON();

            expect(snapshot.artifacts).toHaveLength(1);
            expect(snapshot.artifacts[0].alphaId).toBe('A');
            expect(snapshot.artifacts[0].name).toBe('Test');
        });
    });

    describe('GetSummary', () => {
        it('returns a one-line summary', () => {
            manager.Initialize([
                makeArtifact('Report', 'Data Snapshot', '{}'),
                makeArtifact('Config', 'JSON', '{}'),
            ]);
            const summary = manager.GetSummary();
            expect(summary).toContain('2');
            expect(summary).toContain('artifact');
        });

        it('returns empty string when no artifacts', () => {
            expect(manager.GetSummary()).toBe('');
        });
    });
});
