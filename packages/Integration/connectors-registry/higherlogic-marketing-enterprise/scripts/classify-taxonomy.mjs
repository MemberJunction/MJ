#!/usr/bin/env node
// Classify the enumerated WSDL universe into COVERABLE record-bearing leaves vs INFORMATIONAL /
// scaffolding types, walking the type graph from each SOAP operation's request/response types.
import fs from 'fs';

const data = JSON.parse(fs.readFileSync(new URL('./output/enumerated-operations.json', import.meta.url), 'utf8'));
const namedTypes = data.namedTypes; // { TypeName: [ {name,type,minOccurs,maxOccurs,nillable}, ... ] }
const operations = data.operations;

const SCALAR_TYPES = new Set(['string','int','long','double','boolean','dateTime','decimal','float','byte','short','base64Binary','anyType']);

function unwrapArrayOf(typeName) {
    if (!typeName) return typeName;
    if (typeName.startsWith('ArrayOf')) {
        const inner = namedTypes[typeName];
        if (inner && inner.length === 1) return inner[0].type;
    }
    return typeName;
}

// ---- 1. Determine entry-point types per operation (request write-payload + response read-payload) ----
const entryTypes = new Set();
const opToType = []; // { op, direction, rawType, resolvedType }
for (const op of operations) {
    // response side: unwrap ArrayOf and *Results wrapper containers (single-field wrappers)
    let respType = op.responseFields[0]?.type;
    let hops = 0;
    while (respType && namedTypes[respType] && namedTypes[respType].length === 1 && hops < 5) {
        const next = unwrapArrayOf(respType);
        if (next === respType) break;
        respType = next;
        hops++;
    }
    if (respType && !SCALAR_TYPES.has(respType)) {
        entryTypes.add(respType);
        opToType.push({ op: op.name, direction: 'response', rawType: op.responseFields[0]?.type, resolvedType: respType });
    }
    // request side: single complex-type body field (Create/Add/Edit/Upload-style ops)
    for (const f of op.requestFields) {
        if (!SCALAR_TYPES.has(f.type) && namedTypes[f.type]) {
            const resolved = unwrapArrayOf(f.type);
            if (SCALAR_TYPES.has(resolved)) continue; // e.g. ArrayOfInt/ArrayOfString unwrap to a scalar
            entryTypes.add(resolved);
            opToType.push({ op: op.name, direction: 'request', rawType: f.type, resolvedType: resolved });
        }
    }
}

// ---- 2. BFS the type graph from entry points to find all reachable named complex types ----
function typeGraphNeighbors(typeName) {
    const fields = namedTypes[typeName] || [];
    const out = [];
    for (const f of fields) {
        if (!SCALAR_TYPES.has(f.type) && namedTypes[f.type]) {
            const resolved = unwrapArrayOf(f.type);
            if (!SCALAR_TYPES.has(resolved)) out.push(resolved); // guard: ArrayOfInt/ArrayOfString unwrap to a scalar
        }
    }
    return out;
}

const reachable = new Set();
// parentPath[type] = { via: parentType, field: fieldName, isList: bool } -- first-discovered path only
const parentPath = {};
const queue = [...entryTypes];
for (const et of entryTypes) parentPath[et] = { via: null, field: null, isList: false };
while (queue.length) {
    const t = queue.shift();
    if (!t || reachable.has(t) || t.startsWith('ArrayOf')) continue;
    reachable.add(t);
    const fields = namedTypes[t] || [];
    for (const f of fields) {
        if (SCALAR_TYPES.has(f.type) || !namedTypes[f.type]) continue;
        const resolved = unwrapArrayOf(f.type);
        if (SCALAR_TYPES.has(resolved)) continue;
        if (!(resolved in parentPath)) {
            parentPath[resolved] = { via: t, field: f.name, isList: f.maxOccurs === 'unbounded' || f.type.startsWith('ArrayOf') };
        }
        if (!reachable.has(resolved)) queue.push(resolved);
    }
}

function accessPathFor(typeName) {
    const segs = [];
    let cur = typeName;
    let guard = 0;
    while (cur && parentPath[cur] && parentPath[cur].via && guard < 20) {
        segs.unshift(parentPath[cur].field + (parentPath[cur].isList ? '[]' : ''));
        cur = parentPath[cur].via;
        guard++;
    }
    // find which operation(s) resolve to the root `cur`
    const doorOps = opToType.filter(e => e.resolvedType === cur).map(e => e.op);
    return { door: cur, doorOps, nestingPath: segs.join(' -> ') || '(direct)' };
}

// ---- 3. Classify each reachable type: COVERABLE (record) vs INFORMATIONAL (scaffolding) ----
const INFORMATIONAL_SUFFIX_RULES = [
    { re: /SearchCriteria$/i, bucket: 'query-criteria-shape' },
    { re: /^SearchCriteria$/i, bucket: 'query-criteria-shape' },
    { re: /^DateRangeSearchCriteria$/i, bucket: 'query-criteria-shape' },
    { re: /^PagedSearchCriteria$/i, bucket: 'query-criteria-shape' },
    { re: /Result$/, bucket: 'operation-outcome-status' },
    { re: /^mmAuthHeader$/, bucket: 'auth-header-mechanics' },
    { re: /^AuthenticationResult$/, bucket: 'auth-session-mechanics' },
];
// Nested WRITE-CONFIGURATION types: singular (non-list) fields embedded in a parent write payload
// that have NO independent get/list operation returning them and NO own identity/PK field. These are
// mechanically detected as: reachable only as a non-list (maxOccurs !== 'unbounded') field of another
// reachable type, AND never themselves the resolved entry type of any operation (i.e. no op returns
// or accepts them directly as the top-level payload — only nested one level+ deep under a parent).
const directEntryTypeNames = new Set(opToType.map(e => e.resolvedType));
function isNestedOnlyNonListField(typeName) {
    if (directEntryTypeNames.has(typeName)) return false; // it IS a direct op entry type -> not nested-only
    let referencedAsListItemSomewhere = false;
    let referencedAtAll = false;
    for (const [parent, fields] of Object.entries(namedTypes)) {
        if (parent === typeName) continue;
        for (const f of fields) {
            if (f.type === typeName) {
                referencedAtAll = true;
                if (f.maxOccurs === 'unbounded') referencedAsListItemSomewhere = true;
            }
        }
    }
    // Only "nested write config" if NEVER reached via a list (unbounded) field anywhere — a type that
    // is a genuine repeated child record (reached via ArrayOfX somewhere) is COVERABLE even if it also
    // happens to appear as a singular echo field in some unrelated validation/status type.
    return referencedAtAll && !referencedAsListItemSomewhere;
}

// *Results (plural) wrapper containers: single-field list wrappers -> fold into their child (already
// unwrapped during entry-type resolution above), so if one still appears reachable & unresolved it's a
// pure pass-through container -> informational bucket 'list-wrapper-container'
function classify(typeName) {
    for (const rule of INFORMATIONAL_SUFFIX_RULES) {
        if (rule.re.test(typeName)) return { role: 'INFORMATIONAL', bucket: rule.bucket };
    }
    if (/Results$/.test(typeName)) {
        const fields = namedTypes[typeName] || [];
        if (fields.length <= 1) return { role: 'INFORMATIONAL', bucket: 'list-wrapper-container' };
    }
    const fields = namedTypes[typeName] || [];
    if (fields.length === 0) return { role: 'INFORMATIONAL', bucket: 'empty-shape' };
    // Single-field wrapper whose one field is itself a list of a reachable named type -> container-fold
    if (fields.length === 1 && fields[0].maxOccurs === 'unbounded' && namedTypes[fields[0].type]) {
        return { role: 'CONTAINER-FOLDED', bucket: 'l1-list-wrapper', foldedInto: fields[0].type };
    }
    if (isNestedOnlyNonListField(typeName)) {
        return { role: 'INFORMATIONAL', bucket: 'nested-write-config' };
    }
    return { role: 'COVERABLE', bucket: 'record-type' };
}

const ledger = [];
for (const t of Array.from(reachable).sort()) {
    const c = classify(t);
    ledger.push({ type: t, fieldCount: (namedTypes[t] || []).length, ...c });
}

// ---- 3b. Alias-fold: mechanical structural-subset / positional-type-sequence match against a
// canonical richer type (used directly by a Create/Edit/Add operation, or simply the larger shape).
// Rule A (name-subset): normalized field-name set of A is a PROPER SUBSET of B's, |A|<|B|.
// Rule B (positional-type-sequence): A's field TYPE sequence exactly matches an in-order PREFIX of
// B's field TYPE sequence, length >= 5 (guards against coincidental short matches).
function normName(n) { return n.toLowerCase().replace(/_/g, ''); }
// Map of normalized-field-name -> declared type (post ArrayOf-unwrap), so a subset match requires
// BOTH the same field name AND the same (unwrapped) field type -- guards against two unrelated types
// coincidentally sharing a generic field name like "recipients" while holding different item types.
function fieldNameTypeMap(t) {
    const m = new Map();
    for (const f of (namedTypes[t] || [])) m.set(normName(f.name), unwrapArrayOf(f.type));
    return m;
}
function fieldTypeSeq(t) { return (namedTypes[t] || []).map(f => f.type); }
function isProperSubset(mapA, mapB) {
    if (mapA.size >= mapB.size) return false;
    for (const [name, type] of mapA) {
        if (mapB.get(name) !== type) return false;
    }
    return true;
}
function isTypeSeqPrefix(a, b) {
    if (a.length < 5 || a.length >= b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

const coverableCandidates = ledger.filter(l => l.role === 'COVERABLE').map(l => l.type);
const aliasFolds = [];
for (const a of coverableCandidates) {
    for (const b of coverableCandidates) {
        if (a === b) continue;
        const nameSubset = isProperSubset(fieldNameTypeMap(a), fieldNameTypeMap(b));
        const typeSeqPrefix = isTypeSeqPrefix(fieldTypeSeq(a), fieldTypeSeq(b));
        if (nameSubset || typeSeqPrefix) {
            aliasFolds.push({ from: a, into: b, rule: nameSubset ? 'name-subset' : 'positional-type-sequence' });
        }
    }
}
// Resolve: keep only the best (largest target) fold per `from`, avoid folding a type that is itself a
// fold target (transitive) into something else in the same pass — take the richest `into` by field count.
const foldMap = new Map();
for (const f of aliasFolds) {
    const existing = foldMap.get(f.from);
    if (!existing || (namedTypes[f.into] || []).length > (namedTypes[existing.into] || []).length) {
        foldMap.set(f.from, f);
    }
}

for (const [from, f] of foldMap.entries()) {
    const entry = ledger.find(l => l.type === from);
    if (entry && entry.role === 'COVERABLE') {
        entry.role = 'CONTAINER-FOLDED';
        entry.bucket = 'alias-of-richer-type';
        entry.foldedInto = f.into;
        entry.foldRule = f.rule;
    }
}

const coverable = ledger.filter(l => l.role === 'COVERABLE').map(l => l.type);
const informational = ledger.filter(l => l.role === 'INFORMATIONAL');
const containerFolded = ledger.filter(l => l.role === 'CONTAINER-FOLDED');

// ---- 4. Named-type universe accounting: E (enumerated) vs reachable vs unreachable ----
const allNamedTypeNames = Object.keys(namedTypes).filter(n => !n.startsWith('ArrayOf'));
const unreachableNamed = allNamedTypeNames.filter(n => !reachable.has(n));

const coverableWithAccessPath = coverable.sort().map(t => ({ type: t, ...accessPathFor(t) }));

const out = {
    EnumerationStdoutCount: operations.length,
    namedComplexTypeCount_nonArrayOf: allNamedTypeNames.length,
    reachableCount: reachable.size,
    coverableCount: coverable.length,
    informationalCount: informational.length,
    containerFoldedCount: containerFolded.length,
    unreachableNamedCount: unreachableNamed.length,
    coverableLeaves: coverable.sort(),
    coverableWithAccessPath,
    informationalLedger: informational.sort((a,b) => a.type.localeCompare(b.type)),
    containerFoldedLedger: containerFolded.sort((a,b) => a.type.localeCompare(b.type)),
    unreachableNamedTypes: unreachableNamed.sort(),
    opToTypeMap: opToType,
    accountingCheck: {
        E_reachable: reachable.size,
        sumOfBuckets: coverable.length + informational.length + containerFolded.length,
        balances: reachable.size === (coverable.length + informational.length + containerFolded.length),
    },
};

fs.writeFileSync(new URL('./output/classification.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
    EnumerationStdoutCount: out.EnumerationStdoutCount,
    namedComplexTypeCount_nonArrayOf: out.namedComplexTypeCount_nonArrayOf,
    reachableCount: out.reachableCount,
    coverableCount: out.coverableCount,
    informationalCount: out.informationalCount,
    containerFoldedCount: out.containerFoldedCount,
    unreachableNamedCount: out.unreachableNamedCount,
    accountingCheck: out.accountingCheck,
    coverableLeaves: out.coverableLeaves,
    coverableWithAccessPath: out.coverableWithAccessPath,
}, null, 2));
