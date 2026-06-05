#!/usr/bin/env node
// Workspace + runID provisioner.
//
// Run BEFORE the build-connector skill dispatches the planner.  Creates the
// per-vendor workspace directory, generates a fresh runID, writes the initial
// manifest.json that the IntegrationProgressEmitter expects, and prints a JSON
// blob the skill consumes to drive the rest of the orchestration.
//
// Usage:
//   node packages/Integration/connector-builder-workshop/scripts/start-run.mjs \
//     --vendor hubspot \
//     [--credential-reference /opaque/path] \
//     [--budget 250000] \
//     [--max-tier T4]
//
// stdout (JSON, one line):
//   {
//     "runID": "connector-...",
//     "workspaceDir": "packages/Integration/connectors-registry/<vendor>/runs/<runID>",
//     "outputDir": "<workspaceDir>/output",
//     "connectorTargetDir": "packages/Integration/connectors/src",
//     "planPath": "packages/Integration/connector-builder-workshop/plans/<vendor>.workflow.js",
//     "manifestPath": "<workspaceDir>/manifest.json",
//     "specDigestPath": "packages/Integration/connector-builder-workshop/planner/spec-digest.json",
//     "slotsPath": "packages/Integration/connector-builder-workshop/floor/phase0-slots.json",
//     "corpusEntries": [],
//     "vendor": "...",
//     "credentialReference": null | "<opaque>",
//     "budget": null | number,
//     "maxTier": "T0..T12"
//   }
//
// stderr: diagnostic messages

import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const WORKSHOP = resolve(__dirname, '..');
const REGISTRY = resolve(REPO_ROOT, 'packages', 'Integration', 'connectors-registry');

function parseArgs(argv) {
    const out = { vendor: null, credentialReference: null, budget: null, maxTier: 'T9' };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--vendor') out.vendor = argv[++i];
        else if (a === '--credential-reference') out.credentialReference = argv[++i];
        else if (a === '--budget') out.budget = Number(argv[++i]);
        else if (a === '--max-tier') out.maxTier = argv[++i];
    }
    if (!out.vendor) {
        console.error('FATAL: --vendor is required');
        process.exit(2);
    }
    return out;
}

function newRunID(vendor) {
    // Deterministic-ish run ID — based on epoch ms + 8 hex chars from a process
    // entropy source.  Used for workspace path + checkpoint resumption keys.
    const hi = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
    return `connector-${vendor}-${Date.now()}-${hi}`;
}

function loadCorpusEntries(workshop, vendorShapeHint) {
    // Best-effort corpus lookup.  Returns whatever entries exist for the
    // hinted vendor shape.  If no shape is provided we return the entire
    // corpus root index (planner uses it as background).
    const corpusRoot = join(workshop, 'corpus');
    if (!existsSync(corpusRoot)) return [];
    const entries = [];
    try {
        for (const f of readdirSync(corpusRoot)) {
            const p = join(corpusRoot, f);
            if (!statSync(p).isDirectory()) continue;
            if (f === 'quarantine') continue;
            const failuresFile = join(p, 'failures.json');
            const lessonsFile = join(p, 'lessons.json');
            entries.push({
                shape: f,
                failures: existsSync(failuresFile) ? JSON.parse(readFileSync(failuresFile, 'utf-8')) : null,
                lessons: existsSync(lessonsFile) ? JSON.parse(readFileSync(lessonsFile, 'utf-8')) : null,
            });
        }
    } catch (err) {
        console.error(`[start-run] corpus load warning: ${err.message}`);
    }
    return entries;
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const runID = newRunID(args.vendor);
    const vendorRegistry = join(REGISTRY, args.vendor);
    const workspaceDir = join(vendorRegistry, 'runs', runID);
    mkdirSync(workspaceDir, { recursive: true });
    mkdirSync(join(workspaceDir, 'test-data'), { recursive: true });
    mkdirSync(join(workspaceDir, 'output'), { recursive: true });

    const planPath = join(WORKSHOP, 'plans', `${args.vendor}.workflow.js`);
    const manifestPath = join(workspaceDir, 'manifest.json');
    const outputDir = join(workspaceDir, 'output');
    const specDigestPath = join(WORKSHOP, 'planner', 'spec-digest.json');
    const slotsPath = join(WORKSHOP, 'floor', 'phase0-slots.json');
    // Where the built connector + its index.ts registration live. The connector
    // class is emitted to <connectorTargetDir>/<ClassName>.ts and exported from
    // <connectorTargetDir>/index.ts — we build in the connectors package directly
    // (tsc/vitest run there), so no per-run scaffold is required.
    const connectorTargetDir = 'packages/Integration/connectors/src';

    // Initial manifest — the IntegrationProgressEmitter will append events to
    // progress.jsonl alongside this manifest as the run proceeds.
    const manifest = {
        runID,
        runKind: 'ConnectorCreation',
        vendor: args.vendor,
        triggerType: 'Manual',
        startedAt: new Date().toISOString(),
        expectedStages: ['Plan', 'Review', 'Execute'],
        context: {
            credentialReference: args.credentialReference,
            budget: args.budget,
            maxTier: args.maxTier,
            workshopVersion: 'v5.39.x-phase0',
        },
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    const handoff = {
        runID,
        workspaceDir,
        outputDir,
        connectorTargetDir,
        planPath,
        manifestPath,
        specDigestPath,
        slotsPath,
        corpusEntries: loadCorpusEntries(WORKSHOP),
        vendor: args.vendor,
        credentialReference: args.credentialReference,
        budget: args.budget,
        maxTier: args.maxTier,
    };
    process.stdout.write(JSON.stringify(handoff) + '\n');
}

main();
