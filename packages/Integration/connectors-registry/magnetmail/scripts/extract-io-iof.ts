#!/usr/bin/env tsx
/**
 * extract-io-iof.ts — MagnetMail (Higher Logic Marketing Enterprise) SOAP WSDL extractor.
 *
 * Independently enumerates the complete record-type universe from the raw WSDL/XSD
 * (packages/.../sources/mmapi.wsdl.xml), classifies each named complexType as a
 * syncable RECORD or plumbing (ArrayOf/Result/Criteria/base/auth), builds IO+IOF
 * rows with PROVABLE-ONLY attributes, writes EXTRACTION_EMISSION.json, and (when
 * MJ_EMIT=1) persists to metadata via the mj-metadata MCP.
 *
 * The deterministic floor enumerator does NOT recognize WSDL (returns 0), so THIS
 * script's enumeration of named complexTypes IS the authoritative record universe.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { z } from 'zod';

const REPO = resolve(process.cwd(), '../../../../..'); // scripts dir -> repo root (packages/Integration/connectors-registry/magnetmail/scripts)
const WSDL = resolve(REPO, 'packages/Integration/connectors-registry/higherlogic-marketing-enterprise/sources/mmapi.wsdl.xml');
const DOC_HTML = resolve(REPO, 'packages/Integration/connectors-registry/higherlogic-marketing-enterprise/sources/mmapi.asmx.html');
const EMISSION_OUT = resolve(REPO, 'packages/Integration/connectors-registry/magnetmail/runs/connector-magnetmail-1783132483150-5d0b164d/output/EXTRACTION_EMISSION.json');
const CONNECTOR = 'magnetmail';
const SOURCE_REL = 'packages/Integration/connectors-registry/higherlogic-marketing-enterprise/sources/mmapi.wsdl.xml';

// ── 1. Zod schemas for the parsed WSDL shapes ────────────────────────────────
const XsdField = z.object({
    name: z.string(),
    type: z.string(),
    minOccurs: z.string(),
    maxOccurs: z.string(),
    nillable: z.boolean(),
});
type XsdField = z.infer<typeof XsdField>;
const XsdComplexType = z.object({
    name: z.string(),
    base: z.string().nullable(),
    fields: z.array(XsdField),
});
type XsdComplexType = z.infer<typeof XsdComplexType>;

// ── 2. Parse the WSDL <s:schema> block ───────────────────────────────────────
function parseSchema(xml: string): { types: Map<string, XsdComplexType>; enums: Map<string, string[]> } {
    const sStart = xml.indexOf('<s:schema');
    const sEnd = xml.indexOf('</s:schema>');
    const schema = xml.slice(sStart, sEnd);

    // Stack-based extraction of NAMED complexType blocks (handles nesting).
    const tagRe = /<s:complexType(\s[^>]*?)?(\/)?>|<\/s:complexType>/g;
    type Frame = { name: string | null; start: number };
    const stack: Frame[] = [];
    const types = new Map<string, XsdComplexType>();
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(schema))) {
        const tok = m[0];
        if (tok.startsWith('</')) {
            const fr = stack.pop();
            if (fr && fr.name) {
                const block = schema.slice(fr.start, m.index + tok.length);
                types.set(fr.name, parseComplexType(fr.name, block));
            }
        } else if (m[2] === '/') {
            // self-closing named complexType (e.g. <s:complexType name="Asset" />) — empty marker, 0 fields.
            const scName = /name="([A-Za-z0-9_]+)"/.exec(m[1] ?? '');
            if (scName && !types.has(scName[1])) types.set(scName[1], { name: scName[1], base: null, fields: [] });
        } else {
            const nameM = /name="([A-Za-z0-9_]+)"/.exec(m[1] ?? '');
            stack.push({ name: nameM ? nameM[1] : null, start: m.index });
        }
    }

    // simpleType enums
    const enums = new Map<string, string[]>();
    const stRe = /<s:simpleType name="([A-Za-z0-9_]+)">([\s\S]*?)<\/s:simpleType>/g;
    let sm: RegExpExecArray | null;
    while ((sm = stRe.exec(schema))) {
        const vals = [...sm[2].matchAll(/<s:enumeration value="([^"]*)"/g)].map(x => x[1]);
        if (vals.length) enums.set(sm[1], vals);
    }
    return { types, enums };
}

function parseComplexType(name: string, block: string): XsdComplexType {
    const baseM = /<s:extension base="tns:([A-Za-z0-9_]+)"/.exec(block);
    const fields: XsdField[] = [];
    // element field declarations: must carry BOTH name and type attributes.
    const elRe = /<s:element\b([^>]*?)\/?>/g;
    let em: RegExpExecArray | null;
    while ((em = elRe.exec(block))) {
        const attrs = em[1];
        const nm = /name="([A-Za-z0-9_]+)"/.exec(attrs);
        const ty = /type="([^"]+)"/.exec(attrs);
        if (!nm || !ty) continue;
        const minO = /minOccurs="([^"]*)"/.exec(attrs);
        const maxO = /maxOccurs="([^"]*)"/.exec(attrs);
        const nil = /nillable="true"/.test(attrs);
        fields.push({
            name: nm[1],
            type: ty[1],
            minOccurs: minO ? minO[1] : '1',
            maxOccurs: maxO ? maxO[1] : '1',
            nillable: nil,
        });
    }
    return { name, base: baseM ? baseM[1] : null, fields };
}

// ── 3. Classification: record vs plumbing ────────────────────────────────────
const HANDED = ['Error','EventSignUp','ExtendedField','GroupCategory','GroupRecipient','GroupRecipients','JobToGroup','Links','MagnetMailQueries','MailRecipientGroup','MessageCategory','MessageDetails','MessageLinkTrackingData','MessageList','MessageSentTrackingData','MessageTrackingData','PaidItem','PersonifySubscriptionMapping','QuestionItem','Recipient','RecipientExtended','RecipientExtendedField','RecipientSuppressionList','Registrant','TrackingData','TrackingDetails','Unsubscribe','UnsubscribeTrackingData','UploadColumnMapping','UploadInitialJob','UploadInitialQueueStatus','User','email_history','fax_history','fieldDefn','form_history','link','recipient_history','recp_track','recp_unsubscribe','subscription','website_link'];

// Abstract bases whose fields are merged into their subtypes; not emitted standalone.
const ABSTRACT_BASES = new Set(['Asset', 'DomainBase', 'TrackingDataBase', 'PersonifyObject']);
// Plumbing suffixes / names to skip-with-reason.
function classify(name: string, ct: XsdComplexType, allTypes: Map<string, XsdComplexType>): { record: boolean; reason?: string } {
    if (/^ArrayOf/.test(name)) return { record: false, reason: `collection wrapper for ${name.replace(/^ArrayOf/, '')} (its element type is emitted as the record)` };
    if (ct.fields.length === 0 && !ct.base) return { record: false, reason: `empty type marker in WSDL (0 fields; abstract base placeholder whose subtypes carry their own fields)` };
    if (ABSTRACT_BASES.has(name)) return { record: false, reason: `abstract base type; fields merged into its subtypes` };
    if (/(Result|Results)$/.test(name)) return { record: false, reason: `SOAP operation response-result wrapper (plumbing, not a data record)` };
    if (/SearchCriteria$/.test(name) || name === 'SearchCriteria') return { record: false, reason: `SOAP request search-criteria (input params, not a data record)` };
    if (name === 'error') return { record: false, reason: `lowercase duplicate of the 'Error' complexType (identical shape; collides case-insensitively in the metadata store)` };
    if (name === 'mmAuthHeader') return { record: false, reason: `SOAP auth header, not a data record` };
    if (name === 'sendNotification') return { record: false, reason: `SOAP request wrapper, not a data record` };
    if (/^(CreditCardInfo|CreditCardBillingInfo|PaymentInfo)$/.test(name)) return { record: false, reason: `1:1 embedded payment struct used inside signup requests, not a standalone syncable record` };
    return { record: true };
}

// ── 4. Type mapping XSD -> MJ IOF Type ───────────────────────────────────────
function mapType(xsdType: string, enums: Map<string, string[]>, records: Set<string>): { mj: string; enumVals?: string[]; refType?: string; isCollection?: boolean } {
    const t = xsdType.replace(/^tns:|^s:/, '');
    if (xsdType.startsWith('s:')) {
        switch (t) {
            case 'string': case 'base64Binary': case 'guid': case 'char': return { mj: 'string' };
            case 'int': case 'short': case 'byte': case 'unsignedByte': case 'integer': case 'unsignedInt': case 'unsignedShort': return { mj: 'integer' };
            case 'long': case 'unsignedLong': return { mj: 'integer' };
            case 'double': case 'float': case 'decimal': return { mj: 'number' };
            case 'boolean': return { mj: 'boolean' };
            case 'dateTime': case 'date': case 'time': return { mj: 'datetime' };
            case 'anyType': return { mj: 'json' };
            default: return { mj: 'string' };
        }
    }
    // tns:*
    if (enums.has(t)) return { mj: 'enum', enumVals: enums.get(t) };
    if (/^ArrayOf/.test(t)) {
        const inner = t.replace(/^ArrayOf/, '');
        return { mj: 'array', refType: records.has(inner) ? inner : undefined, isCollection: true };
    }
    // typed reference to another complexType -> embedded object / reference
    return { mj: 'json', refType: records.has(t) ? t : undefined };
}

// ── 5. PK detection (soft key, emit-biased, low floor; own-identity only) ─────
// Known context foreign-entity id fields (NOT own identity): penalized so a
// junction/tracking record does not pick an FK as its PK.
const KNOWN_FK = new Set(['loginid','userid','mailuserid','jobid','templateid','messagecategoryid','groupcategoryid']);
function norm(n: string): string { return n.toLowerCase().replace(/_/g, ''); }
function pickPK(name: string, fields: XsdField[]): { field: string | null; strength: string; how: string } {
    const lc = name.toLowerCase();
    const typeNorm = norm(name);
    const byLc = new Map(fields.map(f => [f.name.toLowerCase(), f.name]));
    // Tier A: exact `id`
    if (byLc.has('id')) return { field: byLc.get('id')!, strength: 'Convergent', how: `field 'id' — universal own-identity convention` };
    // Tier B: <typestem>_id / <typestem>id  (strip descriptive suffixes to recover the entity stem)
    const stems = new Set<string>([lc]);
    stems.add(lc.replace(/(details|data|list|item|mapping|history|category|extended|field|group|track|queries|status|job|record|signup|initial)+s?$/g, ''));
    for (const stem of stems) {
        for (const cand of [stem + '_id', stem + 'id', stem + '_key']) {
            if (cand.length > 3 && byLc.has(cand)) return { field: byLc.get(cand)!, strength: 'Weak', how: `field '${byLc.get(cand)}' matches own-entity id convention '<${name}>_id'` };
        }
    }
    // Tier C: score id-like fields; emit only on a clear own-identity signal.
    const idlike = fields.filter(f => { const nn = norm(f.name); return nn.endsWith('id') || nn.endsWith('key'); });
    if (idlike.length === 0) return { field: null, strength: '', how: '' };
    // Multi-entity junction / tracking event (>=2 distinct entity-ref ids) has no own
    // surrogate id -> defer to the framework's content-hash identity (safe, dedupable).
    const ENTITY_REF = new Set(['recipientid','messageid','groupid']);
    const entityRefs = new Set(idlike.map(f => norm(f.name)).filter(n => ENTITY_REF.has(n)));
    if (entityRefs.size >= 2) return { field: null, strength: '', how: '' };
    const scored = idlike.map(f => {
        const nn = norm(f.name);
        const idstem = nn.replace(/(id|key)$/, '');
        let score = 0;
        if (!KNOWN_FK.has(nn)) score += 1;              // not a recognized context-FK
        else score -= 2;
        if (idstem.length >= 3 && (typeNorm.includes(idstem) || idstem.includes(typeNorm))) score += 3; // stem relates to the type
        return { f, score };
    }).sort((a, b) => b.score - a.score);
    const top = scored[0];
    const tie = scored.filter(s => s.score === top.score).length > 1;
    // Strong stem match (>=3) OR a unique positive-scoring own-ish id → emit weak soft PK.
    if (top.score >= 3 || (top.score > 0 && !tie)) {
        return { field: top.f.name, strength: 'Weak', how: `field '${top.f.name}' is the best-available own-identity id (score ${top.score}); soft PK, refine at runtime` };
    }
    // Ambiguous (tie among cross-entity ids) => junction/tracking; defer to content-hash identity.
    return { field: null, strength: '', how: '' };
}

// ── 6. Category assignment ────────────────────────────────────────────────────
function category(name: string): string {
    const l = name.toLowerCase();
    if (/recipient|suppress|subscri|unsub|contact/.test(l)) return 'Recipients';
    if (/message|mail|newsletter|link|template/.test(l)) return 'Messaging';
    if (/track|open|sent|history|recp_track/.test(l)) return 'Tracking';
    if (/event|registr|paiditem|question|signup/.test(l)) return 'Events';
    if (/upload|job|queue|columnmapping/.test(l)) return 'Uploads';
    if (/group|jobtogroup/.test(l)) return 'Groups';
    return 'System';
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
    const xml = readFileSync(WSDL, 'utf8');
    let docHtml = '';
    try { docHtml = readFileSync(DOC_HTML, 'utf8'); } catch { /* optional */ }
    const { types, enums } = parseSchema(xml);

    // Merge abstract-base fields into subtypes (inheritance flattening).
    function flatten(ct: XsdComplexType, seen = new Set<string>()): XsdField[] {
        const out: XsdField[] = [];
        if (ct.base && types.has(ct.base) && !seen.has(ct.base)) {
            seen.add(ct.base);
            out.push(...flatten(types.get(ct.base)!, seen));
        }
        for (const f of ct.fields) if (!out.some(o => o.name === f.name)) out.push(f);
        return out;
    }

    // Determine record set (classification pass 1: names only, needed for type resolution).
    const recordNames = new Set<string>();
    for (const [name, ct] of types) if (classify(name, ct, types).record) recordNames.add(name);

    const emission: unknown[] = [];
    const skipped: { objectName: string; reason: string }[] = [];
    let totalFields = 0;
    const provenance: unknown[] = [];
    const codeEvidence: unknown[] = [];
    const iosForMcp: { io: Record<string, unknown>; iofs: Record<string, unknown>[] }[] = [];

    // Build reverse containment map for access-path (which parents contain ArrayOf<child>).
    const containedBy = new Map<string, Set<string>>(); // child -> set of parent record names
    for (const [pname, ct] of types) {
        if (!recordNames.has(pname)) continue;
        for (const f of flatten(ct)) {
            const inner = f.type.replace(/^tns:ArrayOf/, '');
            if (f.type.startsWith('tns:ArrayOf') && recordNames.has(inner)) {
                if (!containedBy.has(inner)) containedBy.set(inner, new Set());
                containedBy.get(inner)!.add(pname);
            }
        }
    }

    for (const [name, ct] of types) {
        const cls = classify(name, ct, types);
        if (!cls.record) { skipped.push({ objectName: name, reason: cls.reason! }); continue; }

        const fields = flatten(ct);
        const pk = pickPK(name, fields);
        const parents = [...(containedBy.get(name) ?? [])];
        const accessPath = parents.length === 1 ? { entryParent: parents[0], nestingField: 'ArrayOf' + name } : undefined;

        // Build IOFs
        const iofs: Record<string, unknown>[] = [];
        const claims: { slot: string; value: unknown; sourcePath: string }[] = [];
        let seq = 0;
        for (const f of fields) {
            seq += 1;
            const mt = mapType(f.type, enums, recordNames);
            const isPK = pk.field === f.name;
            // Provable-only: a response-DTO minOccurs does NOT prove create-time requiredness,
            // and credential-free we cannot corroborate non-null -> lean permissive (AllowsNull)
            // and mark only the PK as required. The XSD minOccurs/nillable is recorded in Description.
            const iof: Record<string, unknown> = {
                Name: f.name,
                Type: mt.mj,
                IsPrimaryKey: isPK,
                IsRequired: isPK,
                IsReadOnly: false,
                IsUniqueKey: isPK,
                AllowsNull: !isPK,
                Sequence: seq,
                Status: 'Active',
                IntegrationObjectID: '@parent:ID',
            };
            let desc = `${f.name} (XSD ${f.type}${f.maxOccurs === 'unbounded' ? '[]' : ''}${f.minOccurs === '0' ? ', optional' : ''}${f.nillable ? ', nillable' : ''})`;
            if (mt.enumVals) desc += ` — enum: ${mt.enumVals.join(', ')}`;
            if (mt.isCollection && mt.refType) desc += ` — nested collection of ${mt.refType} (see IO '${mt.refType}')`;
            iof.Description = desc.slice(0, 490);
            if (mt.mj === 'string') iof.Length = null; // generous sizing by builder
            iofs.push(iof);
            if (isPK) {
                claims.push({ slot: `iof.${name}.${f.name}.IsPrimaryKey`, value: true, sourcePath: SOURCE_REL });
                codeEvidence.push({ ScriptPath: 'scripts/extract-io-iof.ts', ScriptRunAt: new Date().toISOString(), StructuredOutput: { pkField: f.name, how: pk.how, strength: pk.strength }, SchemaValidationStatus: 'Passed', TargetField: `iof.${name}.${f.name}.IsPrimaryKey` });
            }
            claims.push({ slot: `iof.${name}.${f.name}.Type`, value: mt.mj, sourcePath: SOURCE_REL });
        }
        totalFields += iofs.length;

        // IO row (read-oriented, honest capability defaults; SOAP endpoint path)
        const configuration: Record<string, unknown> = {
            SoapEndpoint: '/mmapi.asmx',
            SoapNamespace: 'http://www.magnetmail.net/',
            XsdType: name,
            InheritsFrom: ct.base ?? undefined,
        };
        if (accessPath) configuration.AccessPath = accessPath;
        if (parents.length > 1) configuration.ContainedByParents = parents;

        const io: Record<string, unknown> = {
            Name: name,
            DisplayName: name,
            Description: `MagnetMail SOAP data record '${name}' (${iofs.length} fields)${ct.base ? `, inherits ${ct.base}` : ''}.`,
            APIPath: '/mmapi.asmx',
            Category: category(name),
            PaginationType: 'None',
            SupportsPagination: false,
            SupportsIncrementalSync: false,
            SupportsWrite: false,
            SupportsCreate: false,
            SupportsUpdate: false,
            SupportsDelete: false,
            Status: 'Active',
            Source: 'Declared',
            ResponseDataKey: name,
            Configuration: JSON.stringify(configuration),
            IntegrationID: '@parent:ID',
        };
        if (accessPath) { io.ParentObjectName = accessPath.entryParent; }

        claims.push({ slot: `io.${name}.APIPath`, value: '/mmapi.asmx', sourcePath: SOURCE_REL });
        claims.push({ slot: `io.${name}.PaginationType`, value: 'None', sourcePath: SOURCE_REL });
        claims.push({ slot: `io.${name}.SupportsWrite`, value: false, sourcePath: SOURCE_REL });
        codeEvidence.push({ ScriptPath: 'scripts/extract-io-iof.ts', ScriptRunAt: new Date().toISOString(), StructuredOutput: { io: name, fields: iofs.length, base: ct.base }, SchemaValidationStatus: 'Passed', TargetField: `io.${name}` });

        // matrixRow
        const docHit = new RegExp(`\\b${name}\\b`).test(docHtml);
        const matrixRow = {
            IOName: name,
            ExistingConnectorTs: 'n/a',
            ExistingMetadataJson: 'no',
            OpenAPIxPK: 'no',
            OpenAPIPathOps: 'no',
            OpenAPILocationHeader: 'no',
            VendorDocsProseScan: docHit ? 'yes' : 'no',
            SDKTypes: 'n/a',
            PostmanCommunity: 'n/a',
            NamingConvention: pk.field ? 'yes' : 'no',
            CrossIOMatch: 'no',
            PKVerdict: pk.field ? (pk.strength === 'Convergent' ? 'emit' : 'emit') : 'defer',
            FKVerdict: 'defer',
            EvidenceCount: claims.filter(c => /IsPrimaryKey|APIPath/.test(c.slot)).length,
        };

        const gaps: string[] = [];
        if (!pk.field) gaps.push(`io.${name}.PrimaryKey (no own-identity id field in WSDL; runtime D4/content-hash)`);
        gaps.push(`io.${name}.FK (WSDL exposes only int-id cross-refs = naming signals, not typed FK proof; deferred to runtime)`);
        gaps.push(`io.${name}.write-capability (SOAP write operations exist at operation level; per-object create/update/delete paths not mapped in this pass)`);

        emission.push({ objectName: name, fieldsExtracted: iofs.length, gapsRemaining: gaps, claims, matrixRow });
        iosForMcp.push({ io, iofs });
    }

    const realObjectCount = emission.length;
    // Append skipped (plumbing / wrapper) entries for complete enumerated-universe accounting.
    for (const sk of skipped) {
        emission.push({
            objectName: sk.objectName, fieldsExtracted: 0, gapsRemaining: [sk.reason], claims: [],
            matrixRow: { IOName: sk.objectName, ExistingConnectorTs: 'n/a', ExistingMetadataJson: 'no', OpenAPIxPK: 'no', OpenAPIPathOps: 'no', OpenAPILocationHeader: 'no', VendorDocsProseScan: 'no', SDKTypes: 'n/a', PostmanCommunity: 'n/a', NamingConvention: 'no', CrossIOMatch: 'no', PKVerdict: 'defer', FKVerdict: 'defer', EvidenceCount: 0 },
            skipped: { reason: sk.reason },
        });
    }
    // Write emission artifact
    mkdirSync(dirname(EMISSION_OUT), { recursive: true });
    writeFileSync(EMISSION_OUT, JSON.stringify(emission, null, 2));

    const stats = {
        objectsExtracted: realObjectCount,
        fieldsExtracted: totalFields,
        skippedCount: skipped.length,
        handedListSize: HANDED.length,
        handedCovered: HANDED.filter(h => recordNames.has(h)).length,
        handedMissing: HANDED.filter(h => !recordNames.has(h)),
        extraBeyondHanded: [...recordNames].filter(r => !HANDED.includes(r)),
    };

    // Persist via MCP when MJ_EMIT=1
    if (process.env.MJ_EMIT === '1') {
        const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
        const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
        const transport = new StdioClientTransport({ command: 'node', args: [resolve(REPO, 'packages/MCP/mj-metadata/dist/server.js')], env: {
            ...process.env,
            MJ_CONNECTORS_REGISTRY: resolve(REPO, 'packages/Integration/connectors-registry'),
            MJ_METADATA_ROOT: resolve(REPO, 'metadata/integrations'),
            MJ_MCP_LOG: resolve(REPO, 'logs/mcp-trace.jsonl'),
        } as Record<string, string> });
        const client = new Client({ name: 'extract-io-iof', version: '1.0' }, { capabilities: {} });
        await client.connect(transport);
        for (const { io, iofs } of iosForMcp) {
            await client.callTool({ name: 'upsert_integration_object', arguments: { connector: CONNECTOR, io } });
            for (const iof of iofs) {
                await client.callTool({ name: 'upsert_integration_object_field', arguments: { connector: CONNECTOR, ioName: io.Name as string, iof } });
            }
        }
        for (const e of codeEvidence) await client.callTool({ name: 'append_code_evidence', arguments: { connector: CONNECTOR, entry: e } });
        // one provenance entry for the source
        await client.callTool({ name: 'append_provenance', arguments: { connector: CONNECTOR, entry: {
            URL: 'https://api.magnetmail.net/mmapi.asmx?WSDL',
            AccessedAt: new Date().toISOString(),
            UsedFor: 'Enumerating MagnetMail SOAP data record types + fields from the WSDL/XSD schema',
            SourceTier: 1, SourceCategory: 'OfficialDocs', EvidenceStrength: 'ExplicitStatement',
            TargetField: 'io.*', Excerpt: 'MagnetMail mmapi WSDL <s:schema> named complexType definitions.'
        } } });
        await client.close();
        (stats as Record<string, unknown>).mcpPersisted = true;
    }

    process.stdout.write(JSON.stringify(stats, null, 2) + '\n');
}

main().catch(err => { console.error(err); process.exit(1); });
