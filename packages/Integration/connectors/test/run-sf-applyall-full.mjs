#!/usr/bin/env node
// Phase A — FULL ApplyAll over the ENTIRE declared Salesforce catalog (all ~1696 sObjects),
// StartSync:false. This is the taxonomy-DAG test: ApplyAll resolves the selection plan and builds
// every table in dependency order (the 4,914 re-established RelatedIntegrationObjectID FK edges /
// 454 parent objects give the DAG real structure). No vendor data is fetched (StartSync:false).
//
// Long server-side op (in-process RSU CodeGen over ~2039 entities) → default undici 5-min
// headersTimeout would fire mid-build and spuriously retry; we install a NO-TIMEOUT dispatcher.
import { readFileSync, writeFileSync } from 'node:fs';
import { Agent, setGlobalDispatcher } from 'undici';

setGlobalDispatcher(new Agent({ headersTimeout: 0, bodyTimeout: 0, connectTimeout: 30_000 }));

const URL = process.env.SF_GQL ?? 'http://localhost:4014/';
const CIID = process.env.SF_CIID ?? '8ecc0d99-489e-4def-abef-1317de79f9a5';
const KEY = readFileSync('/tmp/sf-mjkey.txt', 'utf8').trim();
const objects = readFileSync('/tmp/sf-all-objects.txt', 'utf8').split('\n').map(s => s.trim()).filter(Boolean);

const MUT = `mutation($input: ApplyAllInput!, $platform: String!, $skipGitCommit: Boolean!, $skipRestart: Boolean!) {
  IntegrationApplyAll(input: $input, platform: $platform, skipGitCommit: $skipGitCommit, skipRestart: $skipRestart) {
    Success Message
    EntityMapsCreated { EntityMapID EntityName SourceObjectName FieldMapCount }
    Warnings Steps { Name Status DurationMs Message }
  }
}`;

const input = {
  CompanyIntegrationID: CIID,
  SourceObjects: objects.map(name => ({ SourceObjectName: name })),
  DefaultSyncDirection: 'Pull',
  StartSync: false,
  FullSync: false,
  SyncScope: 'created',
};

console.log(`[${new Date().toISOString()}] ApplyAll START — ${objects.length} objects, CIID=${CIID}`);
const t0 = Date.now();
try {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-mj-api-key': KEY },
    body: JSON.stringify({ query: MUT, variables: { input, platform: 'sqlserver', skipGitCommit: true, skipRestart: true } }),
  });
  const text = await res.text();
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  let json;
  try { json = JSON.parse(text); } catch { console.log(`HTTP ${res.status} non-JSON (${secs}s):`, text.slice(0, 600)); process.exit(1); }
  if (json.errors?.length) { console.log(`GQL errors (${secs}s):`, JSON.stringify(json.errors).slice(0, 1200)); process.exit(1); }
  const out = json.data.IntegrationApplyAll;
  const summary = {
    Success: out.Success,
    Message: out.Message,
    durationSec: Number(secs),
    entityMapsCreated: (out.EntityMapsCreated ?? []).length,
    warnings: (out.Warnings ?? []).slice(0, 30),
    warningCount: (out.Warnings ?? []).length,
    steps: (out.Steps ?? []).map(s => ({ Name: s.Name, Status: s.Status, DurationMs: s.DurationMs, Message: (s.Message ?? '').slice(0, 200) })),
  };
  writeFileSync('/tmp/sf-applyall-full-result.json', JSON.stringify({ ...summary, entityMapSample: (out.EntityMapsCreated ?? []).slice(0, 10) }, null, 2));
  console.log(`[${new Date().toISOString()}] ApplyAll DONE (${secs}s) Success=${out.Success} maps=${summary.entityMapsCreated} warnings=${summary.warningCount}`);
  console.log('Message:', out.Message);
  console.log('Steps:', JSON.stringify(summary.steps));
} catch (e) {
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`[${new Date().toISOString()}] ApplyAll THREW (${secs}s):`, e?.message ?? e);
  process.exit(1);
}
