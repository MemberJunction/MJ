import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    ActionGenerationRunner,
    deriveFileName,
    mergeActionRecords,
    mergeCategories,
    type MjSyncRecord,
} from '../ActionGenerationRunner.js';
import { BaseIntegrationConnector } from '../BaseIntegrationConnector.js';
import type {
    IntegrationObjectInfo,
    ActionGeneratorConfig,
} from '../ActionMetadataGenerator.js';

/** Minimal connector that returns a single contacts object — for runner tests. */
class TestConnector extends BaseIntegrationConnector {
    public override get IntegrationName(): string {
        return 'TestCRM';
    }

    public override GetIntegrationObjects(): IntegrationObjectInfo[] {
        return [{
            Name: 'contacts',
            DisplayName: 'Contact',
            SupportsWrite: true,
            Fields: [
                { Name: 'email', DisplayName: 'Email', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false },
                { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true },
            ],
        }];
    }
}

/** Connector that returns no objects — runner should skip it. */
class EmptyConnector extends BaseIntegrationConnector {
    public override get IntegrationName(): string {
        return 'EmptyCRM';
    }
}

/** Second connector for multi-connector tests. */
class OtherConnector extends BaseIntegrationConnector {
    public override get IntegrationName(): string {
        return 'OtherCRM';
    }

    public override GetIntegrationObjects(): IntegrationObjectInfo[] {
        return [{
            Name: 'accounts',
            DisplayName: 'Account',
            SupportsWrite: false,
            Fields: [
                { Name: 'id', DisplayName: 'ID', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true },
            ],
        }];
    }
}

describe('ActionGenerationRunner', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agr-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('Run', () => {
        it('writes action and category files on a fresh run', async () => {
            const runner = new ActionGenerationRunner();
            const result = await runner.Run({
                Connectors: [{ Connector: new TestConnector() }],
                OutputDir: tmpDir,
            });

            expect(result.TotalActions).toBeGreaterThan(0);
            expect(result.Connectors).toHaveLength(1);
            expect(result.Connectors[0].Skipped).toBe(false);
            expect(result.Connectors[0].IntegrationName).toBe('TestCRM');

            const actionsPath = path.join(tmpDir, 'actions/integrations-auto-generated/.testcrm-actions.json');
            expect(fs.existsSync(actionsPath)).toBe(true);

            const actions = JSON.parse(fs.readFileSync(actionsPath, 'utf-8')) as MjSyncRecord[];
            expect(actions.length).toBeGreaterThan(0);

            const syncConfigPath = path.join(tmpDir, 'actions/integrations-auto-generated/.mj-sync.json');
            expect(fs.existsSync(syncConfigPath)).toBe(true);
        });

        it('skips connectors that return no action config', async () => {
            const runner = new ActionGenerationRunner();
            const result = await runner.Run({
                Connectors: [{ Connector: new EmptyConnector() }],
                OutputDir: tmpDir,
            });

            expect(result.TotalActions).toBe(0);
            expect(result.Connectors).toHaveLength(1);
            expect(result.Connectors[0].Skipped).toBe(true);
            expect(result.Connectors[0].Reason).toContain('null');
        });

        it('respects an explicit FileName override', async () => {
            const runner = new ActionGenerationRunner();
            await runner.Run({
                Connectors: [{ Connector: new TestConnector(), FileName: '.custom-name.json' }],
                OutputDir: tmpDir,
            });

            const customPath = path.join(tmpDir, 'actions/integrations-auto-generated/.custom-name.json');
            expect(fs.existsSync(customPath)).toBe(true);
        });

        it('preserves primaryKey/sync from an existing file on re-run', async () => {
            const runner = new ActionGenerationRunner();
            const actionsDir = path.join(tmpDir, 'actions/integrations-auto-generated');
            fs.mkdirSync(actionsDir, { recursive: true });

            // First run to populate the file
            await runner.Run({ Connectors: [{ Connector: new TestConnector() }], OutputDir: tmpDir });

            // Inject primaryKey/sync into the first action as if mj sync pull had populated them
            const actionsPath = path.join(actionsDir, '.testcrm-actions.json');
            const actions = JSON.parse(fs.readFileSync(actionsPath, 'utf-8')) as MjSyncRecord[];
            actions[0].primaryKey = { ID: 'F7B2A4C0-1234-4321-AAAA-BBBBCCCCDDDD' };
            actions[0].sync = { lastModified: '2026-01-01T00:00:00Z', checksum: 'abc123' };
            fs.writeFileSync(actionsPath, JSON.stringify(actions, null, 2) + '\n');

            // Second run — primaryKey/sync should survive
            await runner.Run({ Connectors: [{ Connector: new TestConnector() }], OutputDir: tmpDir });

            const reread = JSON.parse(fs.readFileSync(actionsPath, 'utf-8')) as MjSyncRecord[];
            expect(reread[0].primaryKey?.ID).toBe('F7B2A4C0-1234-4321-AAAA-BBBBCCCCDDDD');
            expect(reread[0].sync?.checksum).toBe('abc123');
        });

        it('aggregates categories across multiple connectors', async () => {
            const runner = new ActionGenerationRunner();
            const result = await runner.Run({
                Connectors: [
                    { Connector: new TestConnector() },
                    { Connector: new OtherConnector() },
                ],
                OutputDir: tmpDir,
            });

            expect(result.Connectors).toHaveLength(2);
            expect(result.TotalCategories).toBeGreaterThan(0);

            const catPath = path.join(tmpDir, 'action-categories/.integration-categories.json');
            expect(fs.existsSync(catPath)).toBe(true);
            const cats = JSON.parse(fs.readFileSync(catPath, 'utf-8')) as MjSyncRecord[];
            expect(cats.length).toBeGreaterThanOrEqual(2);
        });

        it('calls OnProgress with per-connector messages', async () => {
            const messages: string[] = [];
            const runner = new ActionGenerationRunner();
            await runner.Run({
                Connectors: [{ Connector: new TestConnector() }],
                OutputDir: tmpDir,
                OnProgress: (m) => messages.push(m),
            });

            expect(messages.some(m => m.includes('TestCRM'))).toBe(true);
        });
    });
});

describe('deriveFileName', () => {
    it('lowercases and slugifies', () => {
        expect(deriveFileName('HubSpot')).toBe('.hubspot-actions.json');
        expect(deriveFileName('Sage Intacct')).toBe('.sage-intacct-actions.json');
        expect(deriveFileName('Rasa.io')).toBe('.rasa-io-actions.json');
    });

    it('strips leading/trailing non-alphanumeric runs', () => {
        expect(deriveFileName('--My CRM!!')).toBe('.my-crm-actions.json');
    });
});

describe('mergeActionRecords', () => {
    it('returns incoming records unchanged when no existing matches', () => {
        const incoming: MjSyncRecord[] = [{ fields: { Name: 'New Action' } }];
        const result = mergeActionRecords([], incoming);
        expect(result).toEqual(incoming);
    });

    it('preserves primaryKey/sync from existing record on Name match', () => {
        const existing: MjSyncRecord[] = [{
            fields: { Name: 'My Action' },
            primaryKey: { ID: 'pk-1' },
            sync: { lastModified: '2026-01-01', checksum: 'sum' },
        }];
        const incoming: MjSyncRecord[] = [{ fields: { Name: 'My Action', UpdatedField: 'new value' } }];

        const result = mergeActionRecords(existing, incoming);
        expect(result[0].fields['UpdatedField']).toBe('new value');
        expect(result[0].primaryKey?.ID).toBe('pk-1');
        expect(result[0].sync?.checksum).toBe('sum');
    });

    it('matches case-insensitively on Name', () => {
        const existing: MjSyncRecord[] = [{ fields: { Name: 'My Action' }, primaryKey: { ID: 'pk-1' } }];
        const incoming: MjSyncRecord[] = [{ fields: { Name: 'MY ACTION' } }];
        const result = mergeActionRecords(existing, incoming);
        expect(result[0].primaryKey?.ID).toBe('pk-1');
    });

    it('preserves primaryKey on nested relatedEntities by Name match', () => {
        const existing: MjSyncRecord[] = [{
            fields: { Name: 'Parent' },
            primaryKey: { ID: 'parent-pk' },
            relatedEntities: {
                'Action Params': [{ fields: { Name: 'Child' }, primaryKey: { ID: 'child-pk' } }],
            },
        }];
        const incoming: MjSyncRecord[] = [{
            fields: { Name: 'Parent' },
            relatedEntities: {
                'Action Params': [{ fields: { Name: 'Child', UpdatedDescription: 'changed' } }],
            },
        }];

        const result = mergeActionRecords(existing, incoming);
        expect(result[0].relatedEntities?.['Action Params'][0].primaryKey?.ID).toBe('child-pk');
        expect(result[0].relatedEntities?.['Action Params'][0].fields['UpdatedDescription']).toBe('changed');
    });
});

describe('mergeCategories', () => {
    it('keeps existing primaryKey when category name matches', () => {
        const existing: MjSyncRecord[] = [{ fields: { Name: 'CRM' }, primaryKey: { ID: 'cat-1' } }];
        const incoming: MjSyncRecord[] = [{ fields: { Name: 'CRM', Description: 'updated' } }];

        const result = mergeCategories(existing, incoming);
        expect(result).toHaveLength(1);
        expect(result[0].primaryKey?.ID).toBe('cat-1');
        expect(result[0].fields['Description']).toBe('updated');
    });

    it('appends new categories without dropping existing ones', () => {
        const existing: MjSyncRecord[] = [{ fields: { Name: 'CRM' }, primaryKey: { ID: 'cat-1' } }];
        const incoming: MjSyncRecord[] = [{ fields: { Name: 'Marketing' } }];

        const result = mergeCategories(existing, incoming);
        expect(result).toHaveLength(2);
        const names = result.map(r => r.fields['Name']);
        expect(names).toContain('CRM');
        expect(names).toContain('Marketing');
    });
});

function _typecheck(_c: ActionGeneratorConfig): void { /* unused — keeps the type import alive */ }
void _typecheck;
