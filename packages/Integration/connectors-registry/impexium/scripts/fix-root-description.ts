#!/usr/bin/env tsx
/**
 * fix-root-description.ts — surgical Integration-row fix, per the reviewer's
 * FixInstructions batch (2026-07-12): update integration.Description to the
 * corrected, SOURCE_STUDY-grounded wording (§0/§8). ImportPath already
 * matches the requested value (no-op, verified before running). CredentialTypeID
 * is NOT touched here — the fix instruction for that slot carries
 * operation:null + requiresEscalation:true (the auth model is a genuinely
 * unverified candidate-A-vs-candidate-B hypothesis; the existing
 * "Impexium AMS API" CredentialTypeID pointer set by a prior run is left as-is
 * pending human resolution of the auth-model ambiguity — this script does not
 * unset or alter it).
 *
 * Root-level Integration row only. No IO/IOF rows are touched.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync } from 'node:fs';

const REPO_ROOT = '/Users/bcladmin/Projects/MemberJunction/MJ';
const SERVER_PATH = `${REPO_ROOT}/packages/MCP/mj-metadata/dist/server.js`;
const CONNECTOR = 'impexium';
const METADATA_PATH = `${REPO_ROOT}/metadata/integrations/impexium/.impexium.integration.json`;
const NOW = new Date().toISOString();

const NEW_DESCRIPTION =
    're:Members AMS (formerly Impexium) — Association Management Software REST API covering Individuals, Organizations, Events, Memberships, Committees, Awards, Exams, Certifications, and related member-lifecycle objects.';

async function main(): Promise<void> {
    const before = JSON.parse(readFileSync(METADATA_PATH, 'utf-8')) as Array<{ fields: Record<string, unknown> }>;
    const priorDescription = before[0].fields.Description as string | null;
    const priorImportPath = before[0].fields.ImportPath as string | null;
    const priorCredentialTypeID = before[0].fields.CredentialTypeID as string | null;

    const transport = new StdioClientTransport({ command: 'node', args: [SERVER_PATH], cwd: REPO_ROOT });
    const client = new Client({ name: 'fix-root-description', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);

    const checkedCall = async (name: string, args: Record<string, unknown>, what: string): Promise<void> => {
        const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content?: { type: string; text?: string }[] };
        if (res.isError) throw new Error(`MCP ${name} FAILED for ${what}: ` + (res.content ?? []).map((c) => c.text ?? '').join(' '));
    };

    let applied = 0;

    // ---- integration.Description: set (before != after) ----
    if (priorDescription !== NEW_DESCRIPTION) {
        await checkedCall('upsert_integration_fields', {
            connector: CONNECTOR,
            fields: { Description: NEW_DESCRIPTION },
        }, 'root field Description (corrected wording)');

        await checkedCall('append_provenance', {
            connector: CONNECTOR,
            entry: {
                URL: 'file://packages/Integration/connectors-registry/impexium/SOURCE_STUDY.md',
                AccessedAt: NOW,
                UsedFor:
                    'Reviewer FixInstructions batch (2026-07-12): correcting integration.Description to the SOURCE_STUDY-grounded object-family wording (the prior text was superseded by this more precise, source-cited phrasing). §0 establishes the vendor identity + raw-swagger authority; §8 (Scope decision) confirms the in-scope object universe (Individuals, Organizations, Events, Memberships, Committees, Awards, Exams, Certifications) and its provable-only sourcing (137 operations / 116 paths / 73 definitions, all triaged, no artificial cap).',
                SourceTier: 1,
                SourceCategory: 'OfficialDocs',
                EvidenceStrength: 'ExplicitStatement',
                TargetField: 'integration.Description',
                Excerpt:
                    '§8 Scope decision: "the full documented object universe reachable through the re:Members AMS / Impexium Power Platform connector\'s apiDefinition.swagger.json (137 operations / 116 paths / 73 named definitions ... No artificial cap was applied." §5 TaxonomyLeaves table rows 1 (Individuals), 2 (Organizations), 5 (Event Registrations), 3/4 (Memberships), 11-14 (Committees family), 15 (Awards), 19 (Certifications), 21 (Exams) confirm each named family is an independently sourced, COVERABLE leaf.',
            },
        }, 'PROVENANCE integration.Description (corrected)');

        applied++;
        console.error(`[fix-root-description] Description updated: "${priorDescription}" -> "${NEW_DESCRIPTION}"`);
    } else {
        console.error('[fix-root-description] Description already matches target value; no-op.');
    }

    // ---- integration.ImportPath: verify no-op (already matches requested value) ----
    const EXPECTED_IMPORT_PATH = '@memberjunction/connector-impexium';
    if (priorImportPath === EXPECTED_IMPORT_PATH) {
        console.error(`[fix-root-description] ImportPath already correct ("${priorImportPath}"); no change applied (not counted).`);
    } else {
        // Defensive: only reached if drift is discovered; still surgical, still evidenced.
        await checkedCall('upsert_integration_fields', {
            connector: CONNECTOR,
            fields: { ImportPath: EXPECTED_IMPORT_PATH },
        }, 'root field ImportPath (drift correction)');
        applied++;
        console.error(`[fix-root-description] ImportPath corrected: "${priorImportPath}" -> "${EXPECTED_IMPORT_PATH}"`);
    }

    // ---- integration.CredentialTypeID: operation=null, requiresEscalation=true — NOT MODIFIED ----
    console.error(
        `[fix-root-description] CredentialTypeID left untouched (current value: ${JSON.stringify(priorCredentialTypeID)}). ` +
        'Fix instruction for this slot has operation:null + requiresEscalation:true (auth-model candidate A vs candidate B ' +
        'is genuinely unverified per Configuration.AuthModel) — this is an escalation signal, not a set/clear directive. ' +
        'No mechanical action taken; flagged for human resolution of the auth-model ambiguity.'
    );

    await client.close();

    const after = JSON.parse(readFileSync(METADATA_PATH, 'utf-8')) as Array<{ fields: Record<string, unknown> }>;
    process.stdout.write(JSON.stringify({
        scriptRunAt: NOW,
        applied,
        slots: {
            'integration.Description': { before: priorDescription, after: after[0].fields.Description, changed: priorDescription !== after[0].fields.Description },
            'integration.ImportPath': { before: priorImportPath, after: after[0].fields.ImportPath, changed: priorImportPath !== after[0].fields.ImportPath },
            'integration.CredentialTypeID': { before: priorCredentialTypeID, after: after[0].fields.CredentialTypeID, changed: false, escalated: true },
        },
    }, null, 2) + '\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
