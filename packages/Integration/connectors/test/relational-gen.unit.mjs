// Safe, env-free unit proof of the relational door-embed generator.
// Feeds openwater-shaped rows (flat Program + access-path Rounds/JudgeAssignment/Report) into
// buildFixtureFromRows and asserts the generated fixture is relationally coherent for ALL objects.
import { buildFixtureFromRows } from './gen-fixture.mjs';

const f = (n, t) => ({ fn: n, ft: t });
// Program: a flat door object.
const Program = { name: 'Program', apipath: '/v2/Programs', wm: null, pk: 'id', pkType: 'nvarchar',
  fields: [f('id','nvarchar'), f('name','nvarchar')], accessPath: null };
// Rounds: embedded-array under Program.rounds[].
const Rounds = { name: 'Rounds', apipath: '(embedded)', wm: null, pk: 'roundId', pkType: 'nvarchar',
  fields: [f('roundId','nvarchar'), f('label','nvarchar')],
  accessPath: { door: 'Program', doorPath: '/v2/Programs', nestingSegments: ['rounds[]'], extractionMode: 'embedded-array', parentParamName: 'roundId' } };
// JudgeAssignment: query-injected per roundId.
const JudgeAssignment = { name: 'JudgeAssignment', apipath: '/v2/JudgeAssignments/AssignedToRound', wm: null, pk: 'id', pkType: 'nvarchar',
  fields: [f('id','nvarchar'), f('judgeName','nvarchar')],
  accessPath: { door: 'Program', doorPath: '/v2/Programs', nestingSegments: ['rounds[]'], extractionMode: 'query-param', parentParamName: 'roundId' } };
// Report: path-injected /v2/Rounds/{roundId}/ApplicationReports.
const Report = { name: 'Report', apipath: '/v2/Rounds/{roundId}/ApplicationReports', wm: null, pk: 'id', pkType: 'nvarchar',
  fields: [f('id','nvarchar'), f('title','nvarchar')],
  accessPath: { door: 'Program', doorPath: '/v2/Programs', nestingSegments: ['rounds[]'], extractionMode: 'path-template', parentParamName: 'roundId' } };
// a few extra flat objects to simulate the mixed catalog
const flatExtra = ['Invoice','Payment','User'].map((n) => ({ name: n, apipath: `/v2/${n}s`, wm: null, pk: 'id', pkType: 'nvarchar', fields: [f('id','nvarchar'), f('x','nvarchar')], accessPath: null }));

const rows = [Program, ...flatExtra, Rounds, JudgeAssignment, Report];
const { manifest, objectNames } = buildFixtureFromRows(rows, 'BaseURL');

const objSet = new Set(objectNames);
const routePaths = manifest.Routes.map((r) => r.Path);
const progRoute = manifest.Routes.find((r) => r.Path === '/v2/Programs');
const progBody = Array.isArray(progRoute.Body) ? progRoute.Body : progRoute.Body.value || [];
const progHasRounds = progBody[0] && Array.isArray(progBody[0].rounds) && progBody[0].rounds.length > 0;
const roundHasParentParam = progHasRounds && progBody[0].rounds[0].roundId != null;
const jaRoute = routePaths.includes('/v2/JudgeAssignments/AssignedToRound');
const reportRoute = routePaths.includes('/v2/Rounds/{roundId}/ApplicationReports');
const customField = progBody[0] && progBody[0].mj_e2e_custom_attr != null;

const checks = [
  ['all 7 objects in manifest', objSet.size === 7 && ['Program','Invoice','Payment','User','Rounds','JudgeAssignment','Report'].every((n) => objSet.has(n))],
  ['Program route embeds rounds[]', progHasRounds],
  ['embedded round carries roundId (parent param for children)', roundHasParentParam],
  ['JudgeAssignment has its own query route', jaRoute],
  ['Report has its own path-template route', reportRoute],
  ['custom field present (overflow capture)', customField],
];
let pass = true;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) pass = false; }
console.log(`\nRESULT: ${pass ? 'ALL PASS — relational door-embed generator produces correct all-object fixtures' : 'FAIL'}`);
if (!pass) { console.log('Program body[0]:', JSON.stringify(progBody[0], null, 2)); console.log('routes:', routePaths); }
process.exit(pass ? 0 : 1);
