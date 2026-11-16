#!/usr/bin/env node
/**
 * Incremental DBAutoDoc — Parity & Ablation Harness
 *
 * Modes:
 *   1. Generate non-destructive holdout/ablation configs from a base DBAutoDoc config:
 *      node incremental-ablation.mjs --generate-configs ./config.json \
 *        --holdout SalesOrderHeader,SalesOrderDetail,Vendor,ProductCategory \
 *        --out ./ablation-suite
 *
 *   2. Score an incremental state.json against a full cold state.json (and optional ground-truth state.json):
 *      node incremental-ablation.mjs --compare \
 *        --full ./full-run/state.json \
 *        --incremental ./inc-run/state.json \
 *        [--truth ./aw-truth/state.json]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function collectEffectivePKs(state) {
  const pks = new Set();
  for (const schema of state.schemas ?? []) {
    for (const table of schema.tables ?? []) {
      const pkCols = (table.columns ?? [])
        .filter((c) => c.isPrimaryKey)
        .map((c) => c.name.toLowerCase())
        .sort();
      if (pkCols.length > 0) {
        pks.add(`${schema.name.toLowerCase()}.${table.name.toLowerCase()}:[${pkCols.join(',')}]`);
      }
    }
  }
  return pks;
}

function collectEffectiveFKs(state) {
  const fks = new Map();
  const discovered = state.phases?.keyDetection?.discovered?.foreignKeys ?? [];
  for (const fk of discovered) {
    if (fk.status === 'rejected') continue;
    const src = `${fk.schemaName.toLowerCase()}.${fk.sourceTable.toLowerCase()}`;
    const tgt = `${fk.targetSchema.toLowerCase()}.${fk.targetTable.toLowerCase()}`;
    const key = `${src}.${fk.sourceColumn.toLowerCase()}->${tgt}.${fk.targetColumn.toLowerCase()}`;
    fks.set(key, { SourceTable: src, TargetTable: tgt });
  }
  for (const schema of state.schemas ?? []) {
    for (const table of schema.tables ?? []) {
      const src = `${schema.name.toLowerCase()}.${table.name.toLowerCase()}`;
      for (const dep of table.dependsOn ?? []) {
        const tgt = `${dep.schema.toLowerCase()}.${dep.table.toLowerCase()}`;
        const key = `${src}.${dep.column.toLowerCase()}->${tgt}.${dep.referencedColumn.toLowerCase()}`;
        if (!fks.has(key)) fks.set(key, { SourceTable: src, TargetTable: tgt });
      }
      for (const col of table.columns ?? []) {
        const ref = col.foreignKeyReferences;
        if (!col.isForeignKey || !ref) continue;
        const tgt = `${ref.schema.toLowerCase()}.${ref.table.toLowerCase()}`;
        const refCol = (ref.referencedColumn ?? ref.column).toLowerCase();
        const key = `${src}.${col.name.toLowerCase()}->${tgt}.${refCol}`;
        if (!fks.has(key)) fks.set(key, { SourceTable: src, TargetTable: tgt });
      }
    }
  }
  return fks;
}

function computeF1(referenceSet, candidateSet) {
  let tp = 0;
  for (const item of candidateSet) {
    if (referenceSet.has(item)) tp++;
  }
  const precision = candidateSet.size > 0 ? tp / candidateSet.size : referenceSet.size === 0 ? 1 : 0;
  const recall = referenceSet.size > 0 ? tp / referenceSet.size : 1;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { TP: tp, Ref: referenceSet.size, Cand: candidateSet.size, Precision: precision, Recall: recall, F1: f1 };
}

function formatPct(val) {
  return `${(val * 100).toFixed(1)}%`;
}

function extractLastRunMetrics(state) {
  const runs = state.phases?.descriptionGeneration ?? [];
  const lastRun = runs[runs.length - 1];
  const discTokens = state.phases?.keyDetection?.tokenBudget?.used ?? 0;
  const okTokens = state.phases?.organicKeyDetection?.tokensUsed ?? 0;
  const descTokens = lastRun?.totalTokensUsed ?? 0;
  return {
    DescTokens: descTokens,
    DiscoveryTokens: discTokens,
    OrganicKeyTokens: okTokens,
    TotalRunTokens: descTokens + discTokens + okTokens,
    EstimatedCost: (lastRun?.estimatedCost ?? 0) + (state.phases?.organicKeyDetection?.estimatedCost ?? 0),
    Iterations: lastRun?.iterationsPerformed ?? 0,
  };
}

function runCompare(fullPath, incPath, truthPath) {
  const fullState = readJson(fullPath);
  const incState = readJson(incPath);

  const fullPKs = collectEffectivePKs(fullState);
  const incPKs = collectEffectivePKs(incState);
  const pkScore = computeF1(fullPKs, incPKs);

  const fullFKMap = collectEffectiveFKs(fullState);
  const incFKMap = collectEffectiveFKs(incState);
  const fkOverall = computeF1(new Set(fullFKMap.keys()), new Set(incFKMap.keys()));

  const truthState = truthPath ? readJson(truthPath) : null;
  const truthPKs = truthState ? collectEffectivePKs(truthState) : null;
  const truthFKSet = truthState ? new Set(collectEffectiveFKs(truthState).keys()) : null;

  const report = incState.phases?.incremental;
  const addedLower = new Set((report?.Diff?.AddedTables ?? []).map((t) => t.toLowerCase()));
  const modLower = new Set((report?.Diff?.ModifiedTables ?? []).map((t) => t.TableKey.toLowerCase()));
  const deltaTables = new Set([...addedLower, ...modLower]);

  const filterBoundary = (fkMap, predicate) =>
    new Set(Array.from(fkMap.entries()).filter(([, v]) => predicate(v)).map(([k]) => k));

  // Outgoing: S_delta -> T
  const outgoingScore = computeF1(
    filterBoundary(fullFKMap, (v) => deltaTables.has(v.SourceTable)),
    filterBoundary(incFKMap, (v) => deltaTables.has(v.SourceTable)),
  );
  // Incoming: S_old -> T_delta (unchanged table referencing newly added/modified table!)
  const incomingScore = computeF1(
    filterBoundary(fullFKMap, (v) => !deltaTables.has(v.SourceTable) && deltaTables.has(v.TargetTable)),
    filterBoundary(incFKMap, (v) => !deltaTables.has(v.SourceTable) && deltaTables.has(v.TargetTable)),
  );

  const fullMetrics = extractLastRunMetrics(fullState);
  const incMetrics = extractLastRunMetrics(incState);
  const tokenSavings =
    fullMetrics.TotalRunTokens > 0
      ? 1 - incMetrics.TotalRunTokens / fullMetrics.TotalRunTokens
      : 0;

  console.log('='.repeat(78));
  console.log('Incremental DBAutoDoc — Parity & Ablation Scorecard');
  console.log('='.repeat(78));
  console.log(`Full Cold Baseline : ${fullPath}`);
  console.log(`Incremental Run    : ${incPath}`);
  console.log('-'.repeat(78));
  console.log(
    `PK Parity vs Full  : P=${formatPct(pkScore.Precision)} R=${formatPct(pkScore.Recall)} F1=${formatPct(pkScore.F1)} (${pkScore.TP}/${pkScore.Ref})`,
  );
  console.log(
    `FK Parity (All)    : P=${formatPct(fkOverall.Precision)} R=${formatPct(fkOverall.Recall)} F1=${formatPct(fkOverall.F1)} (${fkOverall.TP}/${fkOverall.Ref})`,
  );
  console.log(
    `FK Outgoing (S_d→T): P=${formatPct(outgoingScore.Precision)} R=${formatPct(outgoingScore.Recall)} F1=${formatPct(outgoingScore.F1)} (${outgoingScore.TP}/${outgoingScore.Ref})`,
  );
  console.log(
    `FK Incoming (S_0→T_d): P=${formatPct(incomingScore.Precision)} R=${formatPct(incomingScore.Recall)} F1=${formatPct(incomingScore.F1)} (${incomingScore.TP}/${incomingScore.Ref})`,
  );
  if (truthPKs && truthFKSet) {
    const fullTruthPK = computeF1(truthPKs, fullPKs);
    const incTruthPK = computeF1(truthPKs, incPKs);
    const fullTruthFK = computeF1(truthFKSet, new Set(fullFKMap.keys()));
    const incTruthFK = computeF1(truthFKSet, new Set(incFKMap.keys()));
    console.log('-'.repeat(78));
    console.log(
      `vs Ground Truth PK : Full F1=${formatPct(fullTruthPK.F1)} | Incremental F1=${formatPct(incTruthPK.F1)}`,
    );
    console.log(
      `vs Ground Truth FK : Full F1=${formatPct(fullTruthFK.F1)} | Incremental F1=${formatPct(incTruthFK.F1)}`,
    );
  }
  console.log('-'.repeat(78));
  console.log(
    `Tokens (Full → Inc): ${fullMetrics.TotalRunTokens.toLocaleString()} → ${incMetrics.TotalRunTokens.toLocaleString()} (${formatPct(tokenSavings)} saved)`,
  );
  if (report) {
    console.log(
      `Subgraph Execution : ${report.TablesAnalyzedCount} analyzed, ${report.TablesSkippedUnchangedCount} skipped unchanged, ${report.PropagatedTablesCount} propagated`,
    );
    console.log(
      `Delta Sampling     : ${report.SampledColumnsCount} column(s) sampled (${report.ReusedTablesCount} unchanged table(s) reused)`,
    );
  }
  console.log('='.repeat(78));
}

function generateConfigs(baseConfigPath, holdoutRaw, outDir) {
  const base = readJson(baseConfigPath);
  const holdout = holdoutRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  fs.mkdirSync(outDir, { recursive: true });

  const writeVariant = (name, mutator) => {
    const copy = structuredClone(base);
    copy.output = {
      ...copy.output,
      outputDir: path.resolve(outDir, name),
      stateFile: path.resolve(outDir, name, 'state.json'),
    };
    mutator(copy);
    const outPath = path.join(outDir, `${name}.config.json`);
    fs.writeFileSync(outPath, JSON.stringify(copy, null, 2));
    return outPath;
  };

  const existingExcludes = base.tables?.exclude ?? [];
  const t0 = writeVariant('01-t0-holdout-baseline', (c) => {
    c.tables = { ...c.tables, exclude: [...existingExcludes, ...holdout] };
  });
  const t1Full = writeVariant('02-t1-full-cold-oracle', () => {});
  const t1Inc = writeVariant('03-t1-incremental-default', (c) => {
    c.analysis = {
      ...c.analysis,
      incremental: { reanalyzePopulatedTables: true, propagateParentDescriptionChanges: true, maxPropagationDepth: 1 },
    };
  });
  const t1NoProp = writeVariant('04-t1-ablate-no-parent-prop', (c) => {
    c.analysis = {
      ...c.analysis,
      incremental: { reanalyzePopulatedTables: true, propagateParentDescriptionChanges: false, maxPropagationDepth: 0 },
    };
  });
  const t1NoBackprop = writeVariant('05-t1-ablate-no-backprop', (c) => {
    c.analysis = {
      ...c.analysis,
      backpropagation: { ...c.analysis?.backpropagation, enabled: false },
    };
  });

  console.log(`Generated 5 ablation configs in ${outDir}:`);
  for (const p of [t0, t1Full, t1Inc, t1NoProp, t1NoBackprop]) {
    console.log(`  - ${p}`);
  }
}

const flags = parseArgs(process.argv);
if (flags['generate-configs']) {
  if (!flags.holdout || !flags.out) {
    console.error('Usage: --generate-configs <config.json> --holdout TableA,TableB --out <dir>');
    process.exit(1);
  }
  generateConfigs(String(flags['generate-configs']), String(flags.holdout), String(flags.out));
} else if (flags.compare) {
  if (!flags.full || !flags.incremental) {
    console.error('Usage: --compare --full <full-state.json> --incremental <inc-state.json> [--truth <truth-state.json>]');
    process.exit(1);
  }
  runCompare(String(flags.full), String(flags.incremental), flags.truth ? String(flags.truth) : undefined);
} else {
  console.log('Pass --generate-configs or --compare. Run with invalid args to see usage.');
}
