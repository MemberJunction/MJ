#!/usr/bin/env node
/**
 * enumerate-catalog.mjs — OpenWater OpenAPI 3.0.1 taxonomy-leaf enumerator
 *
 * Programmatically scans the saved spec for COVERABLE objects:
 *   DOOR objects  — top-level paginated collection GET with NO required parent-scoping param
 *                   (auth headers don't count; roundId/programId/fundId etc. DO count)
 *   NESTED objects — paginated collection GETs that require a parent-scoping param
 *                    (either as a required path param OR as a required query param that scopes
 *                     the collection to a parent entity, e.g. roundId=req on AssignedToRound)
 *
 * Exclusions (per source-audit instructions):
 *   - Media: GET-by-id only, no collection GET
 *   - SessionChairs: POST+PATCH+DELETE only, zero GET
 *   - Export paths: POST-only actions
 *   - Account: auth action
 *   - Singleton/template/config GETs (return one doc, not a record set)
 *
 * Output (stdout): JSON { taxonomyLeaves, doors, nested, informational, stats }
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = join(__dirname, '../sources/openwater-openapi-v2.json');

const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8'));
const paths = spec.paths || {};

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------
function refName(ref) {
  return ref ? ref.replace('#/components/schemas/', '') : null;
}

function isPaginatedList(op) {
  const resp200 = op.responses?.['200'];
  if (!resp200?.content) return false;
  const ct = resp200.content['application/json']
    || resp200.content['text/json']
    || Object.values(resp200.content)[0];
  if (!ct?.schema?.$ref) return false;
  return refName(ct.schema.$ref).startsWith('Pagination.PagingResponse');
}

function paginatedResourceName(op) {
  const resp200 = op.responses?.['200'];
  if (!resp200?.content) return null;
  const ct = resp200.content['application/json']
    || resp200.content['text/json']
    || Object.values(resp200.content)[0];
  if (!ct?.schema?.$ref) return null;
  const name = refName(ct.schema.$ref);
  // Strip Pagination.PagingResponse prefix and optional ListItemModel suffix
  const m = name.match(/^Pagination\.PagingResponse(.+?)(?:ListItemModel)?$/);
  return m ? m[1] : null;
}

// Parent-scoping param names (any required param with one of these names = scoped to a parent)
const PARENT_SCOPING_PARAMS = new Set([
  'programId', 'roundId', 'fundId', 'judgeTeamId', 'applicationId',
  'judgeUserId', 'organizationId', 'sessionId', 'scheduleRoomId',
  'scheduleDayId', 'scheduleTimeSlotId', 'scheduleItemId', 'invoiceId',
  'reportId',
]);

// Auth header names to ignore
const AUTH_HEADERS = new Set(['X-ClientKey', 'X-ApiKey', 'X-OrganizationCode', 'X-SuppressEmails']);

function hasRequiredParentScopingParam(op, pathStr) {
  // Check required PATH params (from the path template, always required)
  const templateParams = (pathStr.match(/\{([^}]+)\}/g) || []).map(s => s.slice(1, -1));
  for (const p of templateParams) {
    if (PARENT_SCOPING_PARAMS.has(p)) return { paramName: p, in: 'path' };
  }
  // Check required QUERY params declared in the operation
  for (const param of (op.parameters || [])) {
    if (param.required && param.in === 'query' && PARENT_SCOPING_PARAMS.has(param.name)) {
      return { paramName: param.name, in: 'query' };
    }
  }
  return null;
}

// --------------------------------------------------------------------------
// Exclusion sets
// --------------------------------------------------------------------------
const EXCLUDED_PRIMARY_RESOURCES = new Set(['Media', 'SessionChairs', 'Export', 'Account']);

// --------------------------------------------------------------------------
// Classify all GET paths
// --------------------------------------------------------------------------

// We deduplicate by resource name — first-encounter wins for accessPath
const doorMap = {};   // resourceName -> { paths[] }
const nestedMap = {}; // resourceName -> { paths[], accessPath }
const informationalList = [];

for (const [pathStr, methods] of Object.entries(paths)) {
  if (!methods.get) continue;
  const op = methods.get;

  const segments = pathStr.split('/').filter(Boolean); // ['v2', 'Applications', ...]
  const primaryResource = segments[1];

  if (EXCLUDED_PRIMARY_RESOURCES.has(primaryResource)) continue;

  // Jobs: only GET-by-id, no list — will fall into informational naturally
  // Organizations: only singleton — same

  if (!isPaginatedList(op)) {
    // Singleton / template / config / get-by-id
    informationalList.push({ path: pathStr, resource: primaryResource });
    continue;
  }

  const resourceName = paginatedResourceName(op) || primaryResource;
  const parentParam = hasRequiredParentScopingParam(op, pathStr);

  if (parentParam) {
    // NESTED — compute a human-readable access path
    let accessPath = '';
    const pp = parentParam.paramName;
    if (pp === 'fundId') {
      accessPath = 'Funds -> fundId -> Transactions';
    } else if (pp === 'programId') {
      // Distinguish sub-resources under a program
      if (pathStr.includes('ApplicationCategories')) accessPath = 'Programs -> programId -> ApplicationCategories';
      else if (pathStr.includes('OtherSessionItemTypes')) accessPath = 'Programs -> programId -> OtherSessionItemTypes';
      else if (pathStr.includes('SessionTypes')) accessPath = 'Programs -> programId -> SessionTypes';
      else if (pathStr.includes('SessionReports')) accessPath = 'Programs -> programId -> SessionReports';
      else if (pathStr.includes('Scheduler/Days')) accessPath = 'Programs -> programId -> Scheduler.Days';
      else if (pathStr.includes('Scheduler/ScheduleItems')) accessPath = 'Programs -> programId -> Scheduler.ScheduleItems';
      else if (pathStr.includes('Scheduler/Rooms')) accessPath = 'Programs -> programId -> Scheduler.Rooms';
      else if (pathStr.includes('Scheduler/TimeSlots')) accessPath = 'Programs -> programId -> Scheduler.TimeSlots';
      else accessPath = `Programs -> programId -> ${resourceName}`;
    } else if (pp === 'roundId') {
      if (pathStr.includes('ApplicationReports')) accessPath = 'Programs -> rounds[] -> roundId -> ApplicationReports';
      else if (pathStr.includes('JudgeReports')) accessPath = 'Programs -> rounds[] -> roundId -> JudgeReports';
      else if (pathStr.includes('AssignedToRound')) accessPath = 'Programs -> rounds[] -> roundId -> JudgeAssignments';
      else if (pathStr.includes('Recusals')) accessPath = 'Programs -> rounds[] -> roundId -> Recusals';
      else if (pathStr.includes('AssignedToApplication')) accessPath = 'Programs -> rounds[] -> roundId + Applications -> applicationId -> JudgeAssignments';
      else accessPath = `Programs -> rounds[] -> roundId -> ${resourceName}`;
    } else if (pp === 'judgeTeamId') {
      accessPath = 'JudgeTeams -> judgeTeamId -> JudgeAssignments';
    } else {
      accessPath = `${pp} -> ${resourceName}`;
    }

    if (!nestedMap[resourceName]) {
      nestedMap[resourceName] = { paths: [], accessPath };
    }
    nestedMap[resourceName].paths.push(pathStr);
    // Keep the first (most canonical) accessPath; append additional entry paths
  } else {
    // DOOR
    if (!doorMap[resourceName]) {
      doorMap[resourceName] = { paths: [] };
    }
    doorMap[resourceName].paths.push(pathStr);
  }
}

// --------------------------------------------------------------------------
// Add Rounds as NESTED (embedded in Programs response — no standalone list GET)
// --------------------------------------------------------------------------
if (!nestedMap['Rounds']) {
  nestedMap['Rounds'] = {
    paths: ['(embedded in Models.Program.ProgramListItemModel.rounds[])'],
    accessPath: 'Programs -> rounds[] (embedded array in ProgramListItemModel; no /v2/Rounds list GET)',
  };
}

// --------------------------------------------------------------------------
// Consolidate Judge: all three JudgeAssignment GETs return JudgeListItemModel
// They are all NESTED (require roundId or judgeTeamId or roundId+applicationId).
// The AssignedToRound endpoint uses roundId as a required QUERY param — NESTED.
// Merge under a single "JudgeAssignment" leaf name to avoid duplication.
// --------------------------------------------------------------------------
// "Judge" appears as both door (AssignedToRound w/ required query roundId — should be nested)
// and nested. Let's check what doorMap has for "Judge":
if (doorMap['Judge']) {
  // AssignedToRound was wrongly classified as door? Let's re-check.
  // Actually our fix above handles it: roundId is PARENT_SCOPING_PARAMS + required query param.
  // So it should land in nestedMap. If it still ended up in doorMap, merge it.
  const existingPaths = doorMap['Judge'].paths;
  if (!nestedMap['Judge']) {
    nestedMap['Judge'] = { paths: existingPaths, accessPath: 'Programs -> rounds[] -> roundId -> JudgeAssignments' };
  } else {
    nestedMap['Judge'].paths.push(...existingPaths);
  }
  delete doorMap['Judge'];
}

// Rename "Judge" to "JudgeAssignment" for clarity (it comes from JudgeAssignment endpoints)
if (nestedMap['Judge']) {
  nestedMap['JudgeAssignment'] = {
    paths: nestedMap['Judge'].paths,
    accessPath: nestedMap['Judge'].accessPath,
  };
  delete nestedMap['Judge'];
}

// --------------------------------------------------------------------------
// Build ordered arrays
// --------------------------------------------------------------------------
const doors = Object.keys(doorMap).sort();
const nested = Object.keys(nestedMap).sort();
const taxonomyLeaves = [...doors, ...nested];

// --------------------------------------------------------------------------
// Output
// --------------------------------------------------------------------------
const result = {
  taxonomyLeaves,
  doorCount: doors.length,
  nestedCount: nested.length,
  totalCoverable: taxonomyLeaves.length,
  doors: doors.map(d => ({
    name: d,
    paths: doorMap[d].paths,
    note: 'Top-level paginated collection GET, no required parent-scoping param',
  })),
  nested: nested.map(n => ({
    name: n,
    paths: nestedMap[n].paths,
    accessPath: nestedMap[n].accessPath,
  })),
  informational: informationalList,
  informationalCount: informationalList.length,
};

// Emit to stdout as structured JSON
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
