#!/usr/bin/env node
/**
 * amend-round10-parent-object-name.mjs — wire `Configuration.parentObjectName` on parent-iterated
 * child IOs so the UNCHANGED IntegrationEngine DAG builder orders each child AFTER its door parent.
 *
 * THE GAP: `IntegrationEngine.computeSelectedDependencyGraph` derives sync-ordering parent edges from
 * exactly three sources — a hard FK (`RelatedIntegrationObjectID`), or `Configuration.parentObjectName`,
 * or `Configuration.ReferencedType`. Impexium's parent-iterated children (Certifications via
 * /Individuals/{ID}/Certifications, etc.) carried NONE of these — the parent was only encoded in the
 * human-readable `accessPaths[].nesting` string, which the engine does not read. So on the first sync a
 * child could run in the SAME dependency layer as its door and fetch before any parent rows existed →
 * ZERO_PARENTS → 0 rows. This is a METADATA gap, not an engine gap: the fix is to populate the field the
 * engine already reads, leaving the framework untouched.
 *
 * DERIVATION (provable, not guessed): parentObjectName is the resource segment immediately BEFORE the
 * first non-trailing-page template var in the IO's OWN APIPath — exactly the parent the connector's
 * `resolveParentObjectName(APIPath, primaryToken)` iterates at runtime. A trailing `{Page Number}` (the
 * only var, or a var with no resource after it) means a top-level door → no parent. The derived name is
 * asserted to resolve to a real emitted IO before writing; a segment that names no IO (Courses / Users /
 * Registrants — genuinely absent from the catalog) is left unset (those children are structurally
 * un-enumerable, correctly surfaced as PARENT_UNRESOLVED at runtime). Read-merge into the existing
 * `accessPaths` Configuration; never clobber.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync } from 'node:fs';

const REPO_ROOT = '/Users/bcladmin/Projects/MemberJunction/MJ';
const SERVER_PATH = `${REPO_ROOT}/packages/MCP/mj-metadata/dist/server.js`;
const CONNECTOR = 'impexium';
const METADATA_PATH = `${REPO_ROOT}/metadata/integrations/impexium/.impexium.integration.json`;
const SCRIPT_REL_PATH = 'scripts/amend-round10-parent-object-name.mjs';
const NOW = new Date().toISOString();

function readIOs() {
    return JSON.parse(readFileSync(METADATA_PATH, 'utf-8'))[0].relatedEntities['MJ: Integration Objects'];
}
function currentConfig(io) {
    const raw = io.fields.Configuration;
    if (raw == null) return {};
    if (typeof raw === 'string') return raw.trim() ? JSON.parse(raw) : {};
    return raw;
}
/** parent = resource segment before the first non-trailing-page template var; null when top-level/door. */
function deriveParentSegment(apiPath) {
    const segs = String(apiPath || '').split('/').filter(Boolean);
    const firstVar = segs.findIndex((s) => /^\{.*\}$/.test(s));
    if (firstVar <= 0) return null;                                        // no var, or var is the very first segment
    const hasResourceAfter = segs.slice(firstVar + 1).some((s) => !/^\{.*\}$/.test(s));
    if (!hasResourceAfter) return null;                                    // first var is the trailing page cursor → root/door
    return segs[firstVar - 1];
}

async function main() {
    const ios = readIOs();
    const ioNames = new Map(ios.map((o) => [String(o.fields.Name).toLowerCase(), String(o.fields.Name)]));

    const toWire = [];
    const orphans = [];
    for (const io of ios) {
        const seg = deriveParentSegment(io.fields.APIPath);
        if (!seg) continue;                                                // top-level door — no parent edge needed
        const parent = ioNames.get(seg.toLowerCase());
        if (parent && parent.toLowerCase() !== String(io.fields.Name).toLowerCase()) {
            toWire.push({ name: String(io.fields.Name), apiPath: String(io.fields.APIPath), parent });
        } else {
            orphans.push({ name: String(io.fields.Name), seg });           // parent not an emitted IO — leave unset
        }
    }

    const transport = new StdioClientTransport({ command: 'node', args: [SERVER_PATH], cwd: REPO_ROOT });
    const client = new Client({ name: 'amend-round10-parent-object-name', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);
    const call = async (name, args, what) => {
        const res = await client.callTool({ name, arguments: args });
        if (res.isError) throw new Error(`MCP ${name} FAILED for ${what}: ` + (res.content ?? []).map((c) => c.text ?? '').join(' '));
    };

    const wired = [];
    for (const w of toWire) {
        const io = ios.find((o) => String(o.fields.Name) === w.name);
        const cfg = currentConfig(io);
        if (cfg.parentObjectName === w.parent) { wired.push(`${w.name} (already)`); continue; }
        cfg.parentObjectName = w.parent;                                   // read-merge: keep accessPaths + everything else
        await call('upsert_integration_object',
            { connector: CONNECTOR, io: { Name: w.name, Configuration: JSON.stringify(cfg) } }, `IO ${w.name}`);
        await call('append_code_evidence',
            { connector: CONNECTOR, entry: { ScriptPath: SCRIPT_REL_PATH, ScriptRunAt: NOW,
              StructuredOutput: { io: w.name, apiPath: w.apiPath, derivedParentObjectName: w.parent,
                rule: 'resource segment before first non-trailing-page template var; verified resolves to an emitted IO' },
              SchemaValidationStatus: 'Passed', TargetField: `io.${w.name}.Configuration.parentObjectName` } },
            `CODE_EVIDENCE ${w.name}`);
        wired.push(`${w.name} → ${w.parent}`);
    }

    await transport.close?.();
    process.stdout.write(JSON.stringify({ wired: wired.length, wiredList: wired,
        orphansLeftUnset: orphans }, null, 2) + '\n');
}
main().catch((e) => { console.error(e); process.exit(1); });
