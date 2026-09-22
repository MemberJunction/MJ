#!/usr/bin/env node
/**
 * native-posture.cjs — flips the native tool-calling posture of the metadata catalog and prompts.
 *
 *   node rigs/native-posture.cjs --testing  [--dry-run]   everything on: every LLM model with a tool-capable
 *                                                          driver gets Supports + Default + implicit control
 *                                                          flow + native tool results; vendors whose driver
 *                                                          cannot carry tools get a vendor-level Supports:false;
 *                                                          every prompt gets UseNativeToolCalling: true.
 *   node rigs/native-posture.cjs --shipping [--dry-run]   the merge posture: policy off everywhere
 *                                                          (DefaultToNativeToolCalling: false), no control-flow
 *                                                          or tool-results settings, no prompt preference.
 *                                                          Capability facts (Supports true/false) are kept.
 *
 * Edits metadata/ai-models/.ai-models.json and metadata/prompts/.*.json in place (a JSON round-trip of these
 * files is byte-identical), then prints the `mj sync push` to run. Never touches the DB.
 * Prompts that exist only in the database (the IT: fixtures, anything created at runtime) are out of its reach.
 *
 * Driver capability is the driver's own `SupportsTools` getter (packages/AI/Core baseLLM.ts) — a class not in
 * CAPABLE below inherits BaseLLM's `false` and ignores any tools it is handed, so declaring native on such a
 * vendor would silently degrade to "prompt says tools are native, model never saw them".
 */
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '../../../..');
const MODELS = path.join(REPO, 'metadata/ai-models/.ai-models.json');
const PROMPTS_DIR = path.join(REPO, 'metadata/prompts');
const LLM_TYPE = '@lookup:MJ: AI Model Types.Name=LLM';

/** Driver classes whose `SupportsTools` is true, directly or by inheritance (OpenAILLM, GeminiLLM subclasses). */
const CAPABLE = new Set([
    'AnthropicLLM',
    'OpenAILLM', 'OpenRouterLLM', 'xAILLM', 'ZhipuLLM', 'MiniMaxLLM', 'LlamaCppLLM',
    'GeminiLLM', 'VertexLLM',
    'CerebrasLLM', 'GroqLLM',
]);
// InceptionLLM extends OpenAILLM but overrides SupportsTools to false; Azure, Bedrock, Fireworks, LM Studio,
// Mistral, Ollama, BettyBot and every class not found in this repo inherit BaseLLM's false.

const mode = process.argv.includes('--testing') ? 'testing' : process.argv.includes('--shipping') ? 'shipping' : null;
const dryRun = process.argv.includes('--dry-run');
if (!mode) { console.error('usage: native-posture.cjs --testing|--shipping [--dry-run]'); process.exit(1); }

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJson = (p, v) => { if (!dryRun) fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n'); };
const fieldsOf = (rec) => rec.fields ?? rec;

// ---------------------------------------------------------------- models
const models = readJson(MODELS);
const stats = { llm: 0, flagged: 0, vendorOff: 0, noCapableVendor: [], policyOff: 0, cfRemoved: 0 };
for (const rec of models) {
    const f = fieldsOf(rec);
    if (f.AIModelTypeID !== LLM_TYPE) continue;
    stats.llm++;
    const vendors = (rec.relatedEntities?.['MJ: AI Model Vendors'] ?? []).map(fieldsOf).filter((v) => v.DriverClass);
    const capable = vendors.filter((v) => CAPABLE.has(v.DriverClass));
    const llm = () => ((f.ModelConfiguration ??= {}).LLM ??= {});
    if (mode === 'testing') {
        if (capable.length === 0) { stats.noCapableVendor.push(`${f.Name} [${vendors.map((v) => v.DriverClass).join(', ') || 'no inference vendor'}]`); continue; }
        Object.assign(llm(), { SupportsNativeToolCalling: true, DefaultToNativeToolCalling: true, NativeControlFlow: 'implicit', NativeToolResults: true });
        stats.flagged++;
        for (const v of vendors.filter((x) => !CAPABLE.has(x.DriverClass))) {
            ((v.ModelConfiguration ??= {}).LLM ??= {}).SupportsNativeToolCalling = false;
            stats.vendorOff++;
        }
    } else {
        const cfg = f.ModelConfiguration?.LLM;
        if (!cfg) continue;
        if (cfg.DefaultToNativeToolCalling !== undefined && cfg.DefaultToNativeToolCalling !== false) { cfg.DefaultToNativeToolCalling = false; stats.policyOff++; }
        if ('NativeControlFlow' in cfg) { delete cfg.NativeControlFlow; stats.cfRemoved++; }
        if ('NativeToolResults' in cfg) { delete cfg.NativeToolResults; stats.cfRemoved++; }
    }
}
writeJson(MODELS, models);

// ---------------------------------------------------------------- prompts
let promptFiles = 0, promptsSet = 0, promptsCleared = 0;
for (const name of fs.readdirSync(PROMPTS_DIR)) {
    if (!name.startsWith('.') || !name.endsWith('.json') || name === '.mj-sync.json') continue;
    const p = path.join(PROMPTS_DIR, name);
    const data = readJson(p);
    const recs = Array.isArray(data) ? data : [data];
    let touched = false;
    for (const rec of recs) {
        const f = fieldsOf(rec);
        if (!('Name' in f)) continue;
        if (mode === 'testing') {
            const cfg = (f.PromptConfiguration && typeof f.PromptConfiguration === 'object') ? f.PromptConfiguration : {};
            (cfg.LLM ??= {}).UseNativeToolCalling = true;
            f.PromptConfiguration = cfg; promptsSet++; touched = true;
        } else if (f.PromptConfiguration && typeof f.PromptConfiguration === 'object' && f.PromptConfiguration.LLM && 'UseNativeToolCalling' in f.PromptConfiguration.LLM) {
            delete f.PromptConfiguration.LLM.UseNativeToolCalling;
            if (Object.keys(f.PromptConfiguration.LLM).length === 0) delete f.PromptConfiguration.LLM;
            if (Object.keys(f.PromptConfiguration).length === 0) f.PromptConfiguration = null;
            promptsCleared++; touched = true;
        }
    }
    if (touched) { promptFiles++; writeJson(p, data); }
}

console.log(`${dryRun ? '[dry run] ' : ''}posture: ${mode}`);
console.log(`  LLM models in catalog: ${stats.llm}`);
if (mode === 'testing') {
    console.log(`  flagged native (Supports + Default + implicit + results): ${stats.flagged}`);
    console.log(`  vendor rows set Supports:false (driver cannot carry tools): ${stats.vendorOff}`);
    console.log(`  left alone — no tool-capable inference vendor (${stats.noCapableVendor.length}):`);
    for (const n of stats.noCapableVendor) console.log(`    - ${n}`);
    console.log(`  prompts set UseNativeToolCalling: true: ${promptsSet} in ${promptFiles} files`);
} else {
    console.log(`  models: policy turned off ${stats.policyOff}; control-flow / results settings removed ${stats.cfRemoved}`);
    console.log(`  prompts cleared of UseNativeToolCalling: ${promptsCleared} in ${promptFiles} files`);
}
console.log(`\n  next: node packages/MJCLI/bin/run.js sync push --dir=metadata --include="ai-models,prompts" --ci`);
