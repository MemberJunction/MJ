// Pulls structured facts from /tmp/ym-evidence/openapi.json. Page body never enters reasoning.
import { readFileSync } from 'node:fs';
const spec = JSON.parse(readFileSync('/tmp/ym-evidence/openapi.json', 'utf8'));

const out = {
  swagger: spec.swagger,
  infoVersion: spec.info?.version,
  infoTitle: spec.info?.title,
  host: spec.host,
  basePath: spec.basePath,
  schemes: spec.schemes,
  consumes: spec.consumes,
  produces: spec.produces,
  securityDefinitions: spec.securityDefinitions,
  tagCount: (spec.tags || []).length,
  tags: (spec.tags || []).map(t => t.name),
  pathCount: Object.keys(spec.paths || {}).length,
  definitionCount: Object.keys(spec.definitions || {}).length,
};

// Look for the auth / OAuth / pagination structurals.
const interesting = [
  '/Ams/Authenticate',
  '/auth',
  '/authenticate',
  '/OAuth/GetAccessToken',
  '/OAuth/GetToken',
  '/OAuth/OIDC/GetAccessToken',
  '/.well-known/jwks',
  '/Ams/{ClientID}/CampaignEmailLists',
  '/Ams/{ClientID}/Members',
];
out.interestingPaths = {};
for (const p of interesting) {
  if (spec.paths[p]) {
    const ops = {};
    for (const [m, op] of Object.entries(spec.paths[p])) {
      if (typeof op !== 'object' || !op) continue;
      ops[m] = {
        operationId: op.operationId,
        tags: op.tags,
        summary: op.summary,
        parameters: (op.parameters || []).map(prm => ({
          name: prm.name, in: prm.in, type: prm.type, required: prm.required,
          description: prm.description?.slice(0, 200)
        })).slice(0, 25),
        security: op.security,
        responseKeys: op.responses ? Object.keys(op.responses) : [],
      };
    }
    out.interestingPaths[p] = ops;
  } else {
    out.interestingPaths[p] = null;
  }
}

// Find pagination indicators across paths.
const paginationParamNames = new Set();
let pagedOps = 0;
for (const [pth, methods] of Object.entries(spec.paths || {})) {
  for (const op of Object.values(methods)) {
    if (typeof op !== 'object' || !op?.parameters) continue;
    let hasPagSize = false, hasPageNum = false;
    for (const prm of op.parameters) {
      const n = prm.name?.toLowerCase() || '';
      if (n === 'pagesize') hasPagSize = true;
      if (n === 'pagenumber') hasPageNum = true;
      if (n.match(/^(pagesize|pagenumber|skip|take|offset|cursor|after|before|limit|maxrows)$/i)) {
        paginationParamNames.add(prm.name);
      }
    }
    if (hasPagSize && hasPageNum) pagedOps++;
  }
}
out.paginationParamNames = [...paginationParamNames];
out.opsWithPageSizeAndPageNumber = pagedOps;

// Inspect ResponseStatus and pagination wrapper definitions.
const wantDefs = ['ResponseStatus', 'ResponseError', 'CampaignEmailListsResponse', 'PagedResponse', 'BaseDto'];
out.definitionShapes = {};
for (const d of wantDefs) {
  if (spec.definitions?.[d]) {
    const dd = spec.definitions[d];
    out.definitionShapes[d] = {
      type: dd.type,
      properties: dd.properties ? Object.keys(dd.properties) : null,
      required: dd.required,
    };
  } else {
    out.definitionShapes[d] = null;
  }
}

// Also pick the first 5 definition names matching /Response$/ to see envelope shape.
const respDefs = Object.keys(spec.definitions || {}).filter(n => n.endsWith('Response')).slice(0, 5);
out.sampleResponseEnvelopes = {};
for (const n of respDefs) {
  const dd = spec.definitions[n];
  out.sampleResponseEnvelopes[n] = {
    type: dd.type,
    properties: dd.properties ? Object.keys(dd.properties) : null,
  };
}

// Count operations per top-level /Ams/{ClientID}/<X> family.
const familyCount = {};
for (const pth of Object.keys(spec.paths || {})) {
  const m = pth.match(/^\/Ams\/\{ClientID\}\/([^\/]+)/);
  if (m) familyCount[m[1]] = (familyCount[m[1]] || 0) + 1;
}
out.amsFamilyCount = Object.keys(familyCount).length;
out.amsFamiliesSample = Object.entries(familyCount).sort((a,b)=>b[1]-a[1]).slice(0, 20);

console.log(JSON.stringify(out, null, 2));
