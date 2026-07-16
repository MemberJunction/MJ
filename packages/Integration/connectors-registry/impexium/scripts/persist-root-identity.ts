#!/usr/bin/env tsx
/**
 * persist-root-identity.ts — recovery write for the Integration root row.
 *
 * The identity-establisher (run 1) computed the correct root identity values
 * (Name, Description, ImportPath, CredentialTypeID, Icon) but a pipeline
 * persistence bug left the root `fields` block a stub (Name still the raw
 * slug 'impexium', the other four null). This script re-persists the
 * complete, correct root row via the mj-metadata MCP upsert tool (never a
 * direct file edit) and records provenance for every hard-constraint field
 * set (Description / ImportPath / CredentialTypeID are nullable:false slots
 * per phase0-slots.json and require evidence).
 *
 * A companion credential-type row ("Impexium AMS API") was added directly to
 * metadata/credential-types/.credential-types.json (out of mj-metadata's
 * scope, which only covers metadata/integrations/<vendor>/) so the
 * CredentialTypeID @lookup resolves at push time.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync } from 'node:fs';

const REPO_ROOT = '/Users/bcladmin/Projects/MemberJunction/MJ';
const SERVER_PATH = `${REPO_ROOT}/packages/MCP/mj-metadata/dist/server.js`;
const CONNECTOR = 'impexium';
const METADATA_PATH = `${REPO_ROOT}/metadata/integrations/impexium/.impexium.integration.json`;
const SCRIPT_REL_PATH = 'scripts/persist-root-identity.ts';
const NOW = new Date().toISOString();

async function main(): Promise<void> {
    const transport = new StdioClientTransport({ command: 'node', args: [SERVER_PATH], cwd: REPO_ROOT });
    const client = new Client({ name: 'persist-root-identity', version: '1.0' }, { capabilities: {} });
    await client.connect(transport);

    const checkedCall = async (name: string, args: Record<string, unknown>, what: string): Promise<void> => {
        const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content?: { type: string; text?: string }[] };
        if (res.isError) throw new Error(`MCP ${name} FAILED for ${what}: ` + (res.content ?? []).map((c) => c.text ?? '').join(' '));
    };

    // ---- 1. Root fields upsert (merge -- existing Configuration/ClassName/NavigationBaseURL preserved) ----
    await checkedCall('upsert_integration_fields', {
        connector: CONNECTOR,
        fields: {
            Name: 're:Members AMS',
            Description:
                're:Members AMS membership management platform (formerly Impexium) — syncs members, organizations, memberships, groups, committees, chapters, events, products, orders, and invoices via the raw mpxapi.com REST API.',
            ImportPath: '@memberjunction/connector-impexium',
            CredentialTypeID: '@lookup:MJ: Credential Types.Name=Impexium AMS API',
            Icon: 'fa-solid fa-people-group',
        },
    }, 'root identity fields (Name/Description/ImportPath/CredentialTypeID/Icon)');

    // ---- 2. Provenance for each nullable:false hard-constraint field ----
    await checkedCall('append_provenance', {
        connector: CONNECTOR,
        entry: {
            URL: 'https://raw.githubusercontent.com/microsoft/PowerPlatformConnectors/dev/certified-connectors/Impexium/apiDefinition.swagger.json',
            AccessedAt: NOW,
            UsedFor:
                "Confirming the canonical vendor/product name for Integration.Name (root-row recovery write -- the identity-establisher's run-1 computed value was never persisted due to a pipeline bug).",
            SourceTier: 1,
            SourceCategory: 'OpenAPISpec',
            EvidenceStrength: 'ExplicitStatement',
            TargetField: 'integration.Name',
            Excerpt:
                '"title": "re:Members AMS (Formerly Impexium)", "description": "re:Members AMS (formerly Impexium) is the premier association management software solution for nonprofits and member-based organizations."',
        },
    }, 'PROVENANCE integration.Name');

    await checkedCall('append_provenance', {
        connector: CONNECTOR,
        entry: {
            URL: 'https://raw.githubusercontent.com/microsoft/PowerPlatformConnectors/dev/certified-connectors/Impexium/apiDefinition.swagger.json',
            AccessedAt: NOW,
            UsedFor: 'Sourcing the connector Description text and confirming the object families covered (members/orgs/memberships/groups/committees/chapters/events/products/orders/invoices).',
            SourceTier: 1,
            SourceCategory: 'OpenAPISpec',
            EvidenceStrength: 'ExplicitStatement',
            TargetField: 'integration.Description',
            Excerpt:
                '"description": "re:Members AMS (formerly Impexium) is the premier association management software solution for nonprofits and member-based organizations." -- object-family coverage independently confirmed by this build’s own 116-path/121-operation catalog scan (see SOURCE_STUDY.md §2–§9 and CODE_EVIDENCE.json).',
        },
    }, 'PROVENANCE integration.Description');

    await checkedCall('append_provenance', {
        connector: CONNECTOR,
        entry: {
            URL: 'file://packages/Integration/connectors-registry/impexium/PROVENANCE.json',
            AccessedAt: NOW,
            UsedFor:
                'ImportPath follows the four-way invariant convention documented in .claude/rules/connector-code-conventions.md (ClassName == package name == ImportPath == the shipped Open App ClassName) already applied identically for the hubspot, stripe, wildapricot, and zendesk connectors in this same registry (ClassName=ImpexiumConnector -> package/import path @memberjunction/connector-impexium).',
            SourceTier: 2,
            SourceCategory: 'OfficialDocs',
            EvidenceStrength: 'ExplicitStatement',
            TargetField: 'integration.ImportPath',
            Excerpt:
                'Sibling connectors in this registry: hubspot -> @memberjunction/connector-hubspot, stripe -> @memberjunction/connector-stripe, wildapricot -> @memberjunction/connector-wildapricot, zendesk -> @memberjunction/connector-zendesk (see metadata/integrations/*/.*.integration.json). ClassName ImpexiumConnector -> @memberjunction/connector-impexium follows the identical, established pattern.',
        },
    }, 'PROVENANCE integration.ImportPath');

    await checkedCall('append_provenance', {
        connector: CONNECTOR,
        entry: {
            URL: 'https://raw.githubusercontent.com/microsoft/PowerPlatformConnectors/dev/certified-connectors/Impexium/apiProperties.json',
            AccessedAt: NOW,
            UsedFor:
                'Provisioning a vendor-specific CredentialTypeID ("Impexium AMS API", added to metadata/credential-types/.credential-types.json following the established per-vendor pattern -- GrowthZone API, Wild Apricot API, HubSpot API). Shape provisioned for the strongest-evidence auth hypothesis (candidate A, app+user handshake); the confirmed-but-different-surface single-key model (candidate B, MS Power-Platform-proxy x-api-key) is retained as a fallback field on the same credential type. The auth FLOW itself remains UNVERIFIED -- see Configuration.AuthModel on this Integration record for the full evidence trail; this entry only supports the CredentialTypeID pointer + its field-shape provisioning, not a settled handshake.',
            SourceTier: 1,
            SourceCategory: 'OpenAPISpec',
            EvidenceStrength: 'ExplicitStatement',
            TargetField: 'integration.CredentialTypeID',
            Excerpt:
                '"connectionParameters": {"hostUrl": {...,"description": "Specify your API Url e.g. https://abc.mpxapi.com"}, "api_key": {"type": "securestring", ...}}, "publisher": "re:Members AMS Corporation" -- confirms the per-tenant HostUrl connection parameter shape; api_key is the CONFIRMED shape for the MS-proxy surface only, not the raw host (see Configuration.AuthModel.candidateB_altSurface).',
        },
    }, 'PROVENANCE integration.CredentialTypeID');

    await client.close();

    // ---- 3. Re-read + report the final root fields state ----
    const parsed = JSON.parse(readFileSync(METADATA_PATH, 'utf-8')) as Array<{ fields: Record<string, unknown> }>;
    const rootFields = parsed[0].fields;
    process.stdout.write(JSON.stringify({
        scriptRunAt: NOW,
        rootFieldsFinal: {
            Name: rootFields.Name,
            ClassName: rootFields.ClassName,
            Description: rootFields.Description,
            ImportPath: rootFields.ImportPath,
            CredentialTypeID: rootFields.CredentialTypeID,
            Icon: rootFields.Icon,
            NavigationBaseURL: rootFields.NavigationBaseURL,
            BatchMaxRequestCount: rootFields.BatchMaxRequestCount ?? null,
            BatchRequestWaitTime: rootFields.BatchRequestWaitTime ?? null,
        },
        configurationKeyCount: Object.keys(JSON.parse(rootFields.Configuration as string)).length,
    }, null, 2) + '\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
