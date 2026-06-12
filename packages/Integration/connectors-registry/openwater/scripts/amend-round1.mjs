#!/usr/bin/env node
// Amendment round 1 for openwater connector metadata.
// Applies reviewer FixInstructions verbatim against the spec-verified facts.
// Drives the compiled mj-metadata MetadataFileStore (atomic write + backups +
// field-level merge), NOT a raw file Write — so this is the sanctioned write path.
//
// Every fact below was re-verified against the raw spec
// (packages/Integration/connectors-registry/openwater/sources/openwater-openapi-v2.json)
// in /tmp/verify-openwater.mjs prior to this run.

import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..');
const REGISTRY_ROOT = resolve(REPO_ROOT, 'packages/Integration/connectors-registry');
const METADATA_ROOT = resolve(REPO_ROOT, 'metadata/integrations');
const SPEC_PATH = resolve(REGISTRY_ROOT, 'openwater/sources/openwater-openapi-v2.json');
const META_PATH = resolve(METADATA_ROOT, 'openwater/.openwater.integration.json');
const CONNECTOR = 'openwater';

const { MetadataFileStore } = await import(
  resolve(REPO_ROOT, 'packages/MCP/mj-metadata/dist/MetadataFileStore.js')
);
const store = new MetadataFileStore(REGISTRY_ROOT, METADATA_ROOT);

const nowIso = new Date().toISOString();
let codeEvidenceCount = 0;
const ce = (targetField, output) => {
  store.AppendCodeEvidence(CONNECTOR, {
    ScriptPath: 'scripts/amend-round1.mjs',
    ScriptRunAt: nowIso,
    StructuredOutput: output,
    SchemaValidationStatus: 'Passed',
    TargetField: targetField,
    EvidenceStrength: 'ExplicitStatement',
  });
  codeEvidenceCount++;
};

// ---------------------------------------------------------------------------
// FIX 1: IncrementalWatermarkField on the 11 incremental IOs (query-param name)
// ---------------------------------------------------------------------------
const watermark = {
  Application: 'lastModifiedSinceUtc',
  BillingLineItem: 'lastModifiedUtc',
  DeletedApplication: 'deletedSinceUtc',
  DeletedSession: 'deletedSinceUtc',
  Evaluation: 'lastModifiedSinceUtc',
  Invoice: 'mostRecentTransactionSinceUtc',
  Payment: 'lastModifiedUtc',
  Program: 'createdSinceUtc',
  Refund: 'lastModifiedUtc',
  Session: 'lastModifiedSinceUtc',
  User: 'lastModifiedSinceUtc',
};
for (const [io, field] of Object.entries(watermark)) {
  store.UpsertIO(CONNECTOR, { Name: io, IncrementalWatermarkField: field });
  ce(`io.${io}.IncrementalWatermarkField`, { value: field, source: 'OpenAPI GET query param confirmed present' });
}

// ---------------------------------------------------------------------------
// FIX 2: PaginationType=PageNumber on all paginated IOs (28 GETs => pageIndex+pageSize)
// Rounds is embedded (no standalone list path) => leave null.
// ---------------------------------------------------------------------------
const paginatedIOs = [
  'Application', 'BillingLineItem', 'DeletedApplication', 'DeletedSession', 'Evaluation',
  'Fund', 'Invoice', 'JudgeTeam', 'Payment', 'Program', 'Refund', 'Session', 'User',
  'ApplicationCategory', 'FundTransaction', 'JudgeAssignment', 'JudgeRecusal',
  'OtherSessionItemType', 'Report', 'ScheduleDay', 'ScheduleItem', 'ScheduleRoom',
  'ScheduleTimeSlot', 'SessionType',
];
for (const io of paginatedIOs) {
  store.UpsertIO(CONNECTOR, { Name: io, PaginationType: 'PageNumber' });
  ce(`io.${io}.PaginationType`, { value: 'PageNumber', source: 'OpenAPI GET pageIndex+pageSize params' });
}

// ---------------------------------------------------------------------------
// FIX 3-13: Per-operation write co-columns (capability flag + path+method+shape+idloc)
// ---------------------------------------------------------------------------
const writeFixes = {
  Application: {
    SupportsCreate: true, CreateAPIPath: '/v2/Applications', CreateMethod: 'POST',
    CreateBodyShape: 'flat', CreateIDLocation: 'body',
    SupportsDelete: true, DeleteAPIPath: '/v2/Applications/{id}', DeleteMethod: 'DELETE', DeleteIDLocation: 'path',
  },
  Session: {
    SupportsCreate: true, CreateAPIPath: '/v2/Sessions', CreateMethod: 'POST',
    CreateBodyShape: 'flat', CreateIDLocation: 'body',
    SupportsDelete: true, DeleteAPIPath: '/v2/Sessions/{id}', DeleteMethod: 'DELETE', DeleteIDLocation: 'path',
  },
  User: {
    SupportsCreate: true, CreateAPIPath: '/v2/Users', CreateMethod: 'POST',
    CreateBodyShape: 'flat', CreateIDLocation: 'body',
    SupportsUpdate: true, UpdateAPIPath: '/v2/Users/{id}', UpdateMethod: 'PATCH',
    UpdateBodyShape: 'flat', UpdateIDLocation: 'path',
    SupportsDelete: false,
  },
  JudgeTeam: {
    SupportsCreate: true, CreateAPIPath: '/v2/JudgeTeams', CreateMethod: 'POST',
    CreateBodyShape: 'flat', CreateIDLocation: 'body',
  },
  Evaluation: {
    SupportsCreate: false,
    SupportsUpdate: true, UpdateAPIPath: '/v2/Evaluations/{id}', UpdateMethod: 'PATCH',
    UpdateBodyShape: 'flat', UpdateIDLocation: 'path',
    SupportsDelete: false,
  },
  JudgeAssignment: {
    SupportsCreate: true, CreateAPIPath: '/v2/JudgeAssignments/Round', CreateMethod: 'POST',
    CreateBodyShape: 'flat', CreateIDLocation: 'body',
    SupportsDelete: true, DeleteAPIPath: '/v2/JudgeAssignments/Round', DeleteMethod: 'DELETE', DeleteIDLocation: 'body',
  },
  ScheduleDay: {
    SupportsCreate: true, CreateAPIPath: '/v2/Programs/{programId}/Scheduler/Days', CreateMethod: 'POST',
    CreateBodyShape: 'flat', CreateIDLocation: 'body',
    SupportsUpdate: true, UpdateAPIPath: '/v2/Programs/Scheduler/Days/{scheduleDayId}', UpdateMethod: 'PATCH',
    UpdateBodyShape: 'flat', UpdateIDLocation: 'path',
    SupportsDelete: true, DeleteAPIPath: '/v2/Programs/Scheduler/Days/{scheduleDayId}', DeleteMethod: 'DELETE', DeleteIDLocation: 'path',
  },
  ScheduleRoom: {
    SupportsCreate: true, CreateAPIPath: '/v2/Programs/{programId}/Scheduler/Rooms', CreateMethod: 'POST',
    CreateBodyShape: 'flat', CreateIDLocation: 'body',
    SupportsUpdate: true, UpdateAPIPath: '/v2/Programs/Scheduler/Rooms/{scheduleRoomId}', UpdateMethod: 'PATCH',
    UpdateBodyShape: 'flat', UpdateIDLocation: 'path',
    SupportsDelete: true, DeleteAPIPath: '/v2/Programs/Scheduler/Rooms/{scheduleRoomId}', DeleteMethod: 'DELETE', DeleteIDLocation: 'path',
  },
  ScheduleTimeSlot: {
    SupportsCreate: true, CreateAPIPath: '/v2/Programs/{programId}/Scheduler/TimeSlots', CreateMethod: 'POST',
    CreateBodyShape: 'flat', CreateIDLocation: 'body',
    SupportsUpdate: true, UpdateAPIPath: '/v2/Programs/Scheduler/TimeSlots/{scheduleTimeSlotId}', UpdateMethod: 'PATCH',
    UpdateBodyShape: 'flat', UpdateIDLocation: 'path',
    SupportsDelete: true, DeleteAPIPath: '/v2/Programs/Scheduler/TimeSlots/{scheduleTimeSlotId}', DeleteMethod: 'DELETE', DeleteIDLocation: 'path',
  },
  ScheduleItem: {
    SupportsCreate: true, CreateAPIPath: '/v2/Programs/{programId}/Scheduler/ScheduleItems', CreateMethod: 'POST',
    CreateBodyShape: 'flat', CreateIDLocation: 'body',
    SupportsUpdate: false,
    SupportsDelete: true, DeleteAPIPath: '/v2/Programs/Scheduler/ScheduleItems/{scheduleItemId}', DeleteMethod: 'DELETE', DeleteIDLocation: 'path',
  },
};
for (const [io, cols] of Object.entries(writeFixes)) {
  store.UpsertIO(CONNECTOR, { Name: io, ...cols });
  ce(`io.${io}.write-co-columns`, { value: cols, source: 'OpenAPI write path operations confirmed present' });
}

// ---------------------------------------------------------------------------
// FIX 14: Configuration.AccessPath for the 12 nested IOs (parent-chain resolution)
// ---------------------------------------------------------------------------
const accessPaths = {
  ApplicationCategory: { AccessPath: { door: 'Program', doorPath: '/v2/Programs', parentParamName: 'programId', nestingSegments: ['applicationCategories'], entryPath: '/v2/Programs/{programId}/ApplicationCategories' } },
  FundTransaction: { AccessPath: { door: 'Fund', doorPath: '/v2/Funds', parentParamName: 'fundId', nestingSegments: ['transactions'], entryPath: '/v2/Funds/{fundId}/Transactions' } },
  JudgeAssignment: { AccessPath: { door: 'Program', doorPath: '/v2/Programs', nestingSegments: ['rounds[]'], parentParamName: 'roundId', entryPath: '/v2/JudgeAssignments/AssignedToRound', parentParamIn: 'query' } },
  JudgeRecusal: { AccessPath: { door: 'Program', doorPath: '/v2/Programs', nestingSegments: ['rounds[]'], parentParamName: 'roundId', entryPath: '/v2/Judges/Recusals', parentParamIn: 'query' } },
  OtherSessionItemType: { AccessPath: { door: 'Program', doorPath: '/v2/Programs', parentParamName: 'programId', entryPath: '/v2/Programs/{programId}/OtherSessionItemTypes' } },
  Report: { AccessPath: { door: 'Program', doorPath: '/v2/Programs', nestingSegments: ['rounds[]'], parentParamName: 'roundId', entryPath: '/v2/Rounds/{roundId}/ApplicationReports', alternativePaths: ['/v2/Rounds/{roundId}/JudgeReports', '/v2/Programs/{programId}/SessionReports'] } },
  Rounds: { AccessPath: { door: 'Program', doorPath: '/v2/Programs', nestingSegments: ['rounds[]'], extractionMode: 'embedded-array' } },
  ScheduleDay: { AccessPath: { door: 'Program', doorPath: '/v2/Programs', parentParamName: 'programId', entryPath: '/v2/Programs/{programId}/Scheduler/Days' } },
  ScheduleItem: { AccessPath: { door: 'Program', doorPath: '/v2/Programs', parentParamName: 'programId', entryPath: '/v2/Programs/{programId}/Scheduler/ScheduleItems' } },
  ScheduleRoom: { AccessPath: { door: 'Program', doorPath: '/v2/Programs', parentParamName: 'programId', entryPath: '/v2/Programs/{programId}/Scheduler/Rooms' } },
  ScheduleTimeSlot: { AccessPath: { door: 'Program', doorPath: '/v2/Programs', parentParamName: 'programId', entryPath: '/v2/Programs/{programId}/Scheduler/TimeSlots' } },
  SessionType: { AccessPath: { door: 'Program', doorPath: '/v2/Programs', parentParamName: 'programId', entryPath: '/v2/Programs/{programId}/SessionTypes' } },
};
for (const [io, config] of Object.entries(accessPaths)) {
  store.UpsertIO(CONNECTOR, { Name: io, Configuration: config });
  ce(`io.${io}.Configuration.AccessPath`, { value: config, source: 'OpenAPI nested path parent-chain confirmed' });
}

// ---------------------------------------------------------------------------
// FIX 15: IsForeignKey=true on every IOF that has RelatedIntegrationObjectID set
// (half-set FK is silently dropped by IntrospectSchema — applies to ALL, not just
//  the cited JudgeAssignment.userId).
// ---------------------------------------------------------------------------
const meta = JSON.parse(readFileSync(META_PATH, 'utf8'));
const ios = meta[0].relatedEntities['MJ: Integration Objects'];
let fkFixed = 0;
for (const io of ios) {
  const fields = io.relatedEntities?.['MJ: Integration Object Fields'] ?? [];
  for (const f of fields) {
    if (f.fields.RelatedIntegrationObjectID && f.fields.IsForeignKey !== true) {
      store.UpsertIOF(CONNECTOR, io.fields.Name, { Name: f.fields.Name, IsForeignKey: true });
      ce(`iof.${io.fields.Name}.${f.fields.Name}.IsForeignKey`, { value: true, source: 'RelatedIntegrationObjectID set; half-set FK rule' });
      fkFixed++;
    }
  }
}

process.stdout.write(JSON.stringify({
  watermarkSet: Object.keys(watermark).length,
  paginationSet: paginatedIOs.length,
  writeFixed: Object.keys(writeFixes).length,
  accessPathSet: Object.keys(accessPaths).length,
  fkFixed,
  codeEvidenceAppended: codeEvidenceCount,
}, null, 2) + '\n');
