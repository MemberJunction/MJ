#!/usr/bin/env node
// Structured extraction over the public MagnetMail WSDL. Credential-free, static-metadata-only.
// Emits: endpoint URLs, namespace, operation list, mmAuthHeader shape, Authenticate op message shape,
// per-operation parameter names (to detect pagination/watermark param names), and the
// searchForRecipients <criteria> wrapper shape.
//
// Reproduction (verify-claim): run `npx tsx scripts/extract-wsdl-facts.mjs` from this connector's
// registry directory. Fetches the WSDL fresh each run (credential-free GET) -- no cached/local
// copy is required or read.
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

function findAll(re, s) {
    const out = [];
    let m;
    const r = new RegExp(re, 'g');
    while ((m = r.exec(s)) !== null) out.push(m);
    return out;
}

// 1. Endpoint + namespace
const soapAddr = [...new Set(findAll('<soap:address location="([^"]*)"', xml).map(m => m[1]))];
const soap12Addr = [...new Set(findAll('<soap12:address location="([^"]*)"', xml).map(m => m[1]))];
const targetNamespaceMatch = xml.match(/targetNamespace="([^"]*)"/);

// 2. Operation names (unique, from wsdl:operation under portType, i.e. the abstract operation list)
const portTypeBlockMatch = xml.match(/<wsdl:portType[^>]*>([\s\S]*?)<\/wsdl:portType>/);
const portTypeBlock = portTypeBlockMatch ? portTypeBlockMatch[1] : '';
const opNames = [...new Set(findAll('<wsdl:operation name="([^"]+)"', portTypeBlock).map(m => m[1]))];

// 3. mmAuthHeader complexType shape (the SOAP header element)
const authHeaderTypeMatch = xml.match(/<s:element name="mmAuthHeader">([\s\S]{0,600}?)<\/s:complexType>\s*<\/s:element>/);
const authHeaderShape = authHeaderTypeMatch ? authHeaderTypeMatch[1].match(/<s:element[^/]*\/>/g) : null;

// 4. Authenticate request message shape (element name="Authenticate")
const authenticateElMatch = xml.match(/<s:element name="Authenticate">([\s\S]{0,600}?)<\/s:complexType>\s*<\/s:element>/);
const authenticateShape = authenticateElMatch ? authenticateElMatch[1].match(/<s:element[^/]*\/>/g) : null;

// 4b. AuthenticateResponse shape (to find the returned session field name)
const authenticateRespMatch = xml.match(/<s:element name="AuthenticateResponse">([\s\S]{0,600}?)<\/s:complexType>\s*<\/s:element>/);
const authenticateRespShape = authenticateRespMatch ? authenticateRespMatch[1].match(/<s:element[^/]*\/>/g) : null;

// 5. For each operation, find its request-element param names (pageNumber/pageCount/sentStartDate/etc.)
const paramsByOp = {};
for (const op of opNames) {
    const re = new RegExp(`<s:element name="${op}">([\\s\\S]{0,1200}?)<\\/s:complexType>\\s*<\\/s:element>`);
    const m = xml.match(re);
    if (m) {
        const els = m[1].match(/<s:element[^/]*\/>/g) || [];
        const names = els.map(e => {
            const nm = e.match(/name="([^"]+)"/);
            const ty = e.match(/type="([^"]+)"/);
            return { name: nm ? nm[1] : null, type: ty ? ty[1] : null };
        });
        paramsByOp[op] = names;
    } else {
        paramsByOp[op] = null; // no request element found (unusual)
    }
}

// 6. Look specifically for pagination param names across ops
const paginationOps = {};
for (const [op, params] of Object.entries(paramsByOp)) {
    if (!params) continue;
    const names = params.map(p => p.name);
    const hasPage = names.some(n => /page/i.test(n ?? ''));
    if (hasPage) paginationOps[op] = names;
}

// 7. Watermark-ish param names (date/time bounded ranges)
const watermarkOps = {};
for (const [op, params] of Object.entries(paramsByOp)) {
    if (!params) continue;
    const names = params.map(p => p.name);
    const hasDateRange = names.some(n => /start.*date|end.*date|from.*date|to.*date/i.test(n ?? ''));
    if (hasDateRange) watermarkOps[op] = names;
}

// 8. searchForRecipients shape (criteria wrapper check)
const searchForRecipientsMatch = xml.match(/<s:element name="searchForRecipients">([\s\S]{0,1500}?)<\/s:complexType>\s*<\/s:element>/);
const searchForRecipientsRaw = searchForRecipientsMatch ? searchForRecipientsMatch[1] : null;

// 9. SOAPAction values per operation (from soap:operation soapAction attribute)
const soapActionsMap = {};
for (const m of findAll('<wsdl:operation name="([^"]+)">\\s*<soap:operation soapAction="([^"]*)"', xml)) {
    soapActionsMap[m[1]] = m[2];
}

// 10. Check for a getById-style operation naming pattern per family (PK signal scan, awareness only)
const getByIdLike = opNames.filter(o => /GetById|getById|byId/i.test(o));

// 11. mutation-like operations (create/update/delete/add/remove/detail)
const mutationLike = opNames.filter(o => /^(add|create|update|delete|remove|insert|set|unsubscribe)/i.test(o));

const result = {
    soapAddr,
    soap12Addr,
    targetNamespace: targetNamespaceMatch ? targetNamespaceMatch[1] : null,
    operationCount: opNames.length,
    operationNames: opNames,
    authHeaderShape,
    authenticateShape,
    authenticateRespShape,
    paginationOps,
    watermarkOps,
    searchForRecipientsRaw: searchForRecipientsRaw ? searchForRecipientsRaw.slice(0, 800) : null,
    soapActionSample: Object.fromEntries(Object.entries(soapActionsMap).slice(0, 5)),
    soapActionCount: Object.keys(soapActionsMap).length,
    getByIdLike,
    mutationLike,
};

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
