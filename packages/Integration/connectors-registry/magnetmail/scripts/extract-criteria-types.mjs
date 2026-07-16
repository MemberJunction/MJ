#!/usr/bin/env node
// Resolves the SearchCriteria-derived complexType lineage (base-type chain + own fields) and finds
// which top-level operations wrap their filter params in a <criteria> child element. Credential-free.
// Reproduction: run `npx tsx scripts/extract-criteria-types.mjs` from this connector's registry dir --
// fetches the WSDL fresh (or reuses ./wsdl.xml if extract-wsdl-facts.mjs already cached it this run).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const WSDL_URL = 'https://hlma-apie1.magnetmail.net/mmapi.asmx?WSDL';
const CACHE_PATH = './wsdl.xml';

async function loadWsdl() {
    if (existsSync(CACHE_PATH)) return readFileSync(CACHE_PATH, 'utf-8');
    const res = await fetch(WSDL_URL);
    if (!res.ok) throw new Error(`WSDL fetch failed: HTTP ${res.status}`);
    const text = await res.text();
    writeFileSync(CACHE_PATH, text, 'utf-8');
    return text;
}

const xml = await loadWsdl();

const criteriaTypeNames = [
    'SearchCriteria', 'PagedSearchCriteria', 'DateRangeSearchCriteria',
    'MessageLinkTrackingSearchCriteria', 'MessageTrackingSearchCriteria',
    'PersonifySubscriptionMappingSearchCriteria', 'UnsubscribeSearchCriteria',
    'RecipientSearchCriteria',
];

function extractComplexType(name) {
    const re = new RegExp(`<s:complexType name="${name}">([\\s\\S]{0,900}?)<\\/s:complexType>`);
    const m = xml.match(re);
    if (!m) return null;
    const body = m[1];
    const baseMatch = body.match(/extension base="tns:([A-Za-z]+)"/);
    const fields = (body.match(/<s:element[^/]*\/>/g) || []).map(e => {
        const nm = e.match(/name="([^"]+)"/);
        const ty = e.match(/type="([^"]+)"/);
        return { name: nm ? nm[1] : null, type: ty ? ty[1] : null };
    });
    return { base: baseMatch ? baseMatch[1] : null, ownFields: fields };
}

const criteriaTypes = {};
for (const t of criteriaTypeNames) {
    criteriaTypes[t] = extractComplexType(t);
}

// Find which top-level request elements wrap a "criteria" param typed as one of these criteria types
const wrapperOps = {};
for (const t of criteriaTypeNames) {
    const re = new RegExp(`<s:element name="([A-Za-z]+)">\\s*<s:complexType>\\s*<s:sequence>\\s*<s:element[^/]*name="criteria" type="tns:${t}"`, 'g');
    let m;
    while ((m = re.exec(xml)) !== null) {
        wrapperOps[m[1]] = t;
    }
}
// Broader: find ANY element whose sole/first param is named "criteria" (any type), for completeness
const anyCriteriaParam = [];
const re2 = /<s:element name="([A-Za-z]+)">\s*<s:complexType>\s*<s:sequence>\s*<s:element[^/]*name="criteria" type="tns:([A-Za-z]+)"/g;
let m2;
while ((m2 = re2.exec(xml)) !== null) anyCriteriaParam.push({ op: m2[1], criteriaType: m2[2] });

process.stdout.write(JSON.stringify({ criteriaTypes, wrapperOps, anyCriteriaParam }, null, 2) + '\n');
