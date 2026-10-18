import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRankViolations, loadModels } from '../check-ai-model-ranks.mjs';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'check-ai-model-ranks.mjs');
const REPO_CATALOG = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'metadata', 'ai-models');
const LLM = '@lookup:MJ: AI Model Types.Name=LLM';

/** A catalog entry in MetadataSync's record shape. */
function model(name, powerRank, { prior, active = true, type = LLM, id } = {}) {
    const fields = { Name: name, AIModelTypeID: type, IsActive: active, PowerRank: powerRank };
    if (prior !== undefined) fields.PriorVersionID = prior;
    return { file: '.ai-models.json', record: { fields, ...(id ? { primaryKey: { ID: id } } : {}) } };
}
const byName = (n) => `@lookup:MJ: AI Models.Name=${n}`;

describe('findRankViolations', () => {
    it('flags a model that ranks below the prior version it names', () => {
        const r = findRankViolations([model('X 1', 20), model('X 2', 12, { prior: byName('X 1') })]);
        expect(r.inversions).toEqual([{ file: '.ai-models.json', name: 'X 2', rank: 12, prior: 'X 1', priorRank: 20 }]);
        expect(r.unresolved).toEqual([]);
    });

    it('accepts an equal rank (for true equals — rank-based selection does not break ties toward the newer model)', () => {
        expect(findRankViolations([model('X 1', 20), model('X 2', 20, { prior: byName('X 1') })]).inversions).toEqual([]);
    });

    it('resolves a Name lookup case-insensitively, as MetadataSync does', () => {
        const r = findRankViolations([model('GPT X', 20), model('GPT Y', 12, { prior: byName('gpt x') })]);
        expect(r.unresolved).toEqual([]);
        expect(r.inversions.map((i) => i.name)).toEqual(['GPT Y']);
    });

    it('resolves a raw-UUID PriorVersionID case-insensitively', () => {
        const r = findRankViolations([
            model('X 1', 20, { id: '52B79053-6E59-44E9-B7D0-DA96C4EA3CF1' }),
            model('X 2', 12, { prior: '52b79053-6e59-44e9-b7d0-da96c4ea3cf1' }),
        ]);
        expect(r.inversions.map((i) => i.name)).toEqual(['X 2']);
    });

    it('exempts pairs where either model is inactive, the types differ, or a rank is missing', () => {
        const r = findRankViolations([
            model('Old', 20, { active: false }), model('A', 1, { prior: byName('Old') }),
            model('Base', 20), model('B', 1, { prior: byName('Base'), active: false }),
            model('Voice', 20, { type: '@lookup:MJ: AI Model Types.Name=Realtime' }), model('C', 1, { prior: byName('Voice') }),
            model('Unranked', null), model('D', 1, { prior: byName('Unranked') }),
        ]);
        expect(r.inversions).toEqual([]);
    });

    it('reports a PriorVersionID that matches no model, and ignores an explicit null', () => {
        const r = findRankViolations([model('X 2', 12, { prior: byName('Nope') }), model('Y', 1, { prior: null })]);
        expect(r.unresolved).toEqual([{ file: '.ai-models.json', name: 'X 2', prior: byName('Nope') }]);
        expect(r.inversions).toEqual([]);
    });
});

describe('the committed catalog', () => {
    it('loads every model record file and has no lineage rank inversions', () => {
        const models = loadModels(REPO_CATALOG);
        // Sanity floor: an extractor that silently loads nothing would pass every check.
        expect(models.length).toBeGreaterThan(100);
        expect(models.filter((m) => m.record.fields.PriorVersionID != null).length).toBeGreaterThan(40);
        expect(findRankViolations(models)).toEqual({ unresolved: [], inversions: [] });
    });
});

describe('CLI', () => {
    function runOn(records) {
        const dir = mkdtempSync(join(tmpdir(), 'ai-model-ranks-'));
        try {
            writeFileSync(join(dir, '.ai-models.json'), JSON.stringify(records));
            writeFileSync(join(dir, '.mj-sync.json'), JSON.stringify({ entity: 'MJ: AI Models' }));
            return spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }

    it('exits 1 and names the inverted pair', () => {
        const r = runOn([model('X 1', 20).record, model('X 2', 12, { prior: byName('X 1') }).record]);
        expect(r.status).toBe(1);
        expect(r.stdout).toContain('X 2 (PowerRank 12) ranks below its prior version X 1 (PowerRank 20)');
    });

    it('exits 0 on a consistent catalog and skips .mj-sync.json', () => {
        const r = runOn([model('X 1', 12).record, model('X 2', 20, { prior: byName('X 1') }).record]);
        expect(r.status).toBe(0);
        expect(r.stdout).toContain('1 model lineage links checked across 2 models');
    });

    it('reads record files in subfolders (MetadataSync matches **/.*.json) but not .backups', () => {
        const dir = mkdtempSync(join(tmpdir(), 'ai-model-ranks-'));
        try {
            mkdirSync(join(dir, 'vendor-x'));
            mkdirSync(join(dir, '.backups'));
            writeFileSync(join(dir, '.ai-models.json'), JSON.stringify([model('X 1', 20).record]));
            writeFileSync(join(dir, 'vendor-x', '.x-models.json'), JSON.stringify([model('X 2', 12, { prior: byName('X 1') }).record]));
            writeFileSync(join(dir, '.backups', '.ai-models.json'), JSON.stringify([model('X 1', 99).record]));
            const models = loadModels(dir);
            expect(models.map((m) => m.file)).toEqual(['.ai-models.json', join('vendor-x', '.x-models.json')]);
            expect(findRankViolations(models).inversions.map((i) => i.name)).toEqual(['X 2']);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
