import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRecords, findRouteViolations, compareToBaseline } from '../check-prompt-model-routes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, '..', 'check-prompt-model-routes.mjs');
const REPO_METADATA = resolve(HERE, '..', '..', '..', 'metadata');
const INFERENCE = '@lookup:MJ: AI Vendor Type Definitions.Name=Inference Provider';
const DEVELOPER = '@lookup:MJ: AI Vendor Type Definitions.Name=Model Developer';

const route = (vendor, { type = INFERENCE, status = 'Active' } = {}) => ({
    fields: { ModelID: '@parent:ID', VendorID: `@lookup:MJ: AI Vendors.Name=${vendor}`, TypeID: type, Status: status },
});
const model = (name, routes, { active = true } = {}) => ({
    fields: { Name: name, IsActive: active },
    relatedEntities: { 'MJ: AI Model Vendors': routes },
});
const promptModel = (modelName, vendor, { id, status } = {}) => ({
    fields: {
        PromptID: '@parent:ID',
        ModelID: modelName.startsWith('@') || /^[0-9A-F-]{36}$/i.test(modelName) ? modelName : `@lookup:MJ: AI Models.Name=${modelName}`,
        VendorID: `@lookup:MJ: AI Vendors.Name=${vendor}`,
        ...(status ? { Status: status } : {}),
    },
    ...(id ? { primaryKey: { ID: id } } : {}),
});
const prompt = (name, rows) => ({ fields: { Name: name }, relatedEntities: { 'MJ: AI Prompt Models': rows } });

const dirs = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true }); });

/** Write a metadata tree: ai-models, ai-vendors, prompts — each with its .mj-sync.json. */
function tree({ models, vendors = ['OpenAI', 'Groq', 'Cerebras'], prompts, baseline }) {
    const root = mkdtempSync(join(tmpdir(), 'pm-routes-'));
    dirs.push(root);
    const put = (sub, entity, records) => {
        mkdirSync(join(root, sub), { recursive: true });
        writeFileSync(join(root, sub, '.mj-sync.json'), JSON.stringify({ entity }));
        writeFileSync(join(root, sub, '.records.json'), JSON.stringify(records));
    };
    put('ai-models', 'MJ: AI Models', models);
    put('ai-vendors', 'MJ: AI Vendors', vendors.map((n) => ({ fields: { Name: n } })));
    put('prompts', 'MJ: AI Prompts', prompts);
    const baselinePath = join(root, 'baseline.json');
    writeFileSync(baselinePath, JSON.stringify({ entries: baseline ?? [] }));
    return { root, baselinePath };
}
const check = (t) => findRouteViolations(loadRecords(t.root));
const run = (t) => spawnSync(process.execPath, [SCRIPT, t.root, t.baselinePath], { encoding: 'utf8' });

describe('findRouteViolations', () => {
    it('passes a row whose model is active and has an active Inference Provider route for the vendor', () => {
        const r = check(tree({ models: [model('M', [route('OpenAI')])], prompts: [prompt('P', [promptModel('M', 'OpenAI')])] }));
        expect(r.failures).toEqual([]);
        expect(r.checked).toBe(1);
    });

    it('flags an inactive model', () => {
        const r = check(tree({ models: [model('M', [route('OpenAI')], { active: false })], prompts: [prompt('P', [promptModel('M', 'OpenAI', { id: 'a-1' })])] }));
        expect(r.failures).toEqual([{ key: 'A-1', file: join('prompts', '.records.json'), prompt: 'P', model: 'M', vendor: 'OpenAI', reason: 'model is inactive' }]);
    });

    it('flags a vendor the model has no route for, and a Model Developer-only route', () => {
        const r = check(tree({
            models: [model('M', [route('OpenAI'), route('Groq', { type: DEVELOPER })])],
            prompts: [prompt('P', [promptModel('M', 'Cerebras'), promptModel('M', 'Groq')])],
        }));
        expect(r.failures.map((f) => f.reason)).toEqual([
            'model has no route for this vendor',
            'vendor has no Inference Provider route (Model Developer only)',
        ]);
    });

    it('flags a Deprecated or Inactive Inference Provider route', () => {
        const r = check(tree({
            models: [model('M', [route('Groq', { status: 'Deprecated' }), route('Cerebras', { status: 'Inactive' })])],
            prompts: [prompt('P', [promptModel('M', 'Groq'), promptModel('M', 'Cerebras')])],
        }));
        expect(r.failures.map((f) => f.reason)).toEqual(['Inference Provider route is Deprecated', 'Inference Provider route is Inactive']);
    });

    it('flags a model or vendor missing from metadata', () => {
        const r = check(tree({
            models: [model('M', [route('Nope')])],
            prompts: [prompt('P', [promptModel('Ghost', 'OpenAI'), promptModel('M', 'Nope')])],
        }));
        expect(r.failures.map((f) => f.reason)).toEqual(['model not found in metadata', 'vendor not found in metadata']);
    });

    it('exempts rows whose own Status is not Active', () => {
        const r = check(tree({
            models: [model('M', [], { active: false })],
            prompts: [prompt('P', ['Inactive', 'Deprecated', 'Preview'].map((status) => promptModel('M', 'OpenAI', { status })))],
        }));
        expect(r.failures).toEqual([]);
        expect(r.exempt).toBe(3);
    });

    it('skips and counts rows whose ModelID is not a Name @lookup', () => {
        const r = check(tree({ models: [model('M', [])], prompts: [prompt('P', [promptModel('52B79053-6E59-44E9-B7D0-DA96C4EA3CF1', 'OpenAI')])] }));
        expect(r.failures).toEqual([]);
        expect(r.skipped).toHaveLength(1);
        expect(r.checked).toBe(0);
    });

    it('finds rows nested deeper than the prompt, and top-level prompt-model files', () => {
        const nested = { fields: { Name: 'Outer' }, relatedEntities: { 'MJ: AI Prompts': [prompt('Inner', [promptModel('M', 'Groq')])] } };
        const t = tree({ models: [model('M', [route('OpenAI')])], prompts: [nested] });
        mkdirSync(join(t.root, 'prompt-models'));
        writeFileSync(join(t.root, 'prompt-models', '.mj-sync.json'), JSON.stringify({ entity: 'MJ: AI Prompt Models' }));
        writeFileSync(join(t.root, 'prompt-models', '.rows.json'), JSON.stringify([promptModel('M', 'Cerebras')]));
        const r = check(t);
        expect(r.failures.map((f) => `${f.prompt}/${f.vendor}`).sort()).toEqual(['@parent:ID/Cerebras', 'Inner/Groq']);
    });

    it('matches model and vendor names case-insensitively, as MetadataSync does', () => {
        const r = check(tree({ models: [model('GPT X', [route('OpenAI')])], prompts: [prompt('P', [promptModel('gpt x', 'openai')])] }));
        expect(r.failures).toEqual([]);
    });
});

describe('compareToBaseline', () => {
    it('separates new failures, baselined ones and stale entries', () => {
        const failures = [{ key: 'A' }, { key: 'b' }];
        const r = compareToBaseline(failures, [{ key: 'B' }, { key: 'C' }]);
        expect(r.unexpected.map((f) => f.key)).toEqual(['A']);
        expect(r.known.map((f) => f.key)).toEqual(['b']);
        expect(r.stale.map((b) => b.key)).toEqual(['C']);
    });
});

describe('CLI', () => {
    const failing = { models: [model('M', [route('Groq', { status: 'Deprecated' })])], prompts: [prompt('P', [promptModel('M', 'Groq', { id: 'K-1' })])] };

    it('exits 1 and names file, prompt, model and vendor on a failure outside the baseline', () => {
        const res = run(tree(failing));
        expect(res.status).toBe(1);
        expect(res.stdout).toContain('prompt "P" → model "M" @ vendor "Groq"');
        expect(res.stdout).toContain('.records.json');
    });

    it('exits 0 when every failure is baselined', () => {
        const res = run(tree({ ...failing, baseline: [{ key: 'K-1', prompt: 'P', model: 'M', vendor: 'Groq' }] }));
        expect(res.status).toBe(0);
        expect(res.stdout).toContain('1 baselined');
    });

    it('exits 1 on a baseline entry that no longer fails', () => {
        const res = run(tree({
            models: [model('M', [route('Groq')])],
            prompts: [prompt('P', [promptModel('M', 'Groq', { id: 'K-1' })])],
            baseline: [{ key: 'K-1', prompt: 'P', model: 'M', vendor: 'Groq' }],
        }));
        expect(res.status).toBe(1);
        expect(res.stdout).toContain('no longer fails');
    });

    it('passes on the real metadata with the committed baseline', () => {
        const res = spawnSync(process.execPath, [SCRIPT, REPO_METADATA], { encoding: 'utf8' });
        expect(res.stdout).toMatch(/no new route failures/);
        expect(res.status).toBe(0);
    });
});
