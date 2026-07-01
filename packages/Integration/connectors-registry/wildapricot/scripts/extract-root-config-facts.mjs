#!/usr/bin/env node
/**
 * extract-root-config-facts.mjs
 *
 * MetadataWriter reproducible extraction script for wildapricot root Integration-row
 * Configuration facts. Covers the 15-object gap set assigned to this pass:
 *   Account, AttachmentData, ContactFieldDescription, EmailDraft, EmailLog,
 *   EntityFieldDescription, Event, EventRegistrationType, Feature, MembershipGroup,
 *   MembershipLevel, Product, SavedSearch, SentEmailRecipient, Tender
 *
 * Sources (credential-free, public):
 *   - Wild Apricot Admin API OpenAPI 3.1 spec (SwaggerHub, v9.14.0-oas3) — Tier 1/2,
 *     the SAME spec already used for the 680 existing io/iof provenance entries.
 *   - gethelp.wildapricot.com Admin API Help Center articles — Tier 1 vendor docs,
 *     content embedded as JSON-LD FAQPage schema (extracted via regex, not scraped
 *     visible HTML, since the page is JS-rendered).
 *
 * Run: node scripts/extract-root-config-facts.mjs
 * Output: structured JSON to stdout (no PII, no credentials — public docs only).
 */

const SPEC_URL = 'https://api.swaggerhub.com/apis/WildApricot/wild-apricot_public_api/9.14.0-oas3';
const RATE_LIMIT_DOC_URL = 'https://gethelp.wildapricot.com/en/articles/182-using-wildapricot-s-api';
const ACCOUNTS_HELP_URL = 'https://gethelp.wildapricot.com/en/articles/506-accounts-admin-api-call';

async function fetchArticleText(url) {
    const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36' },
    });
    const html = await res.text();
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (!m) return { status: res.status, url, text: null };
    let json;
    try { json = JSON.parse(m[1]); } catch { return { status: res.status, url, text: null, error: 'parse-failed' }; }
    const entity = Array.isArray(json.mainEntity) ? json.mainEntity[0] : json.mainEntity;
    return { status: res.status, url, title: json.name, text: entity?.acceptedAnswer?.text ?? null };
}

async function fetchSpec() {
    const res = await fetch(SPEC_URL);
    if (!res.ok) throw new Error(`spec fetch failed: ${res.status}`);
    return res.json();
}

function extractRateLimits(text) {
    const marker = 'API request limits';
    const idx = text.indexOf(marker);
    if (idx < 0) return null;
    const section = text.slice(idx, idx + 400);
    const contactsListMatch = section.match(/(\d+)\s*requests per minute to get a list of contacts/i);
    const contactByIdMatch = section.match(/(\d+)\s*requests per minute to get a contact by identifier/i);
    const otherMatch = section.match(/(\d+)\s*for other request types/i);
    const batchMatch = section.match(/Batch requests are limited to (\d+) subrequests per batch/i);
    return {
        excerpt: section,
        contactsListPerMinute: contactsListMatch ? Number(contactsListMatch[1]) : null,
        contactByIdPerMinute: contactByIdMatch ? Number(contactByIdMatch[1]) : null,
        otherRequestTypesPerMinute: otherMatch ? Number(otherMatch[1]) : null,
        batchSubrequestLimit: batchMatch ? Number(batchMatch[1]) : null,
    };
}

// PATH_OBJECT_MAP mirrors the vocabulary already used by the emitted IO rows.
const PATH_OBJECT_MAP = [
    { re: /^\/accounts$/i, obj: 'Account' },
    { re: /^\/accounts\/\{accountId\}$/i, obj: 'Account' },
    { re: /^\/accounts\/\{accountId\}\/attachments/i, obj: 'AttachmentData' },
    { re: /^\/accounts\/\{accountId\}\/contactfields/i, obj: 'ContactFieldDescription' },
    { re: /^\/accounts\/\{accountId\}\/donationfields/i, obj: 'EntityFieldDescription' },
    { re: /^\/accounts\/\{accountId\}\/EmailDrafts/i, obj: 'EmailDraft' },
    { re: /^\/accounts\/\{accountId\}\/SentEmails$/i, obj: 'EmailLog' },
    { re: /^\/accounts\/\{accountId\}\/SentEmails\/\{[^}]+\}$/i, obj: 'EmailLog' },
    { re: /^\/accounts\/\{accountId\}\/SentEmailRecipients/i, obj: 'SentEmailRecipient' },
    { re: /^\/accounts\/\{accountId\}\/events(\/\{eventId\})?$/i, obj: 'Event' },
    { re: /^\/accounts\/\{accountId\}\/EventRegistrationTypes/i, obj: 'EventRegistrationType' },
    { re: /^\/accounts\/\{accountId\}\/membershiplevels/i, obj: 'MembershipLevel' },
    { re: /^\/accounts\/\{accountId\}\/membergroups/i, obj: 'MembershipGroup' },
    { re: /^\/accounts\/\{accountId\}\/tenders/i, obj: 'Tender' },
    { re: /^\/accounts\/\{accountId\}\/store\/products/i, obj: 'Product' },
    { re: /^\/accounts\/\{accountId\}\/savedsearches/i, obj: 'SavedSearch' },
    { re: /^\/accounts\/\{accountId\}\/features/i, obj: 'Feature' },
];

function classifyPathObject(path) {
    for (const { re, obj } of PATH_OBJECT_MAP) if (re.test(path)) return obj;
    return null;
}

function deriveCrudSummary(spec) {
    const byObj = {};
    for (const [path, methods] of Object.entries(spec.paths ?? {})) {
        const obj = classifyPathObject(path);
        if (!obj) continue;
        byObj[obj] = byObj[obj] ?? [];
        const verbs = Object.keys(methods).filter((k) => ['get', 'post', 'put', 'patch', 'delete'].includes(k));
        byObj[obj].push({ path, verbs });
    }
    const summary = {};
    for (const [obj, paths] of Object.entries(byObj)) {
        const allVerbs = new Set(paths.flatMap((p) => p.verbs));
        summary[obj] = {
            get: allVerbs.has('get'),
            create: allVerbs.has('post'),
            update: allVerbs.has('put') || allVerbs.has('patch'),
            delete: allVerbs.has('delete'),
            matchedPaths: paths,
        };
    }
    return summary;
}

function findSchemaFlag(spec, schemaName, flagName) {
    const schemas = spec.components?.schemas ?? {};
    const schema = schemas[schemaName];
    if (!schema) return null;
    // Flatten allOf branches to find the property.
    const branches = schema.allOf ?? [schema];
    for (const branch of branches) {
        const prop = branch.properties?.[flagName];
        if (prop) return { schemaName, flagName, type: prop.type, description: prop.description };
    }
    return null;
}

async function main() {
    const spec = await fetchSpec();
    const crud = deriveCrudSummary(spec);

    const rateLimitArticle = await fetchArticleText(RATE_LIMIT_DOC_URL);
    const rateLimits = rateLimitArticle.text ? extractRateLimits(rateLimitArticle.text) : null;

    const accountsHelp = await fetchArticleText(ACCOUNTS_HELP_URL);
    const accountsListDescription = spec.paths?.['/accounts']?.get?.description ?? null;
    const accountsListSummary = spec.paths?.['/accounts']?.get?.summary ?? null;

    const contactFieldIsBuiltIn = findSchemaFlag(spec, 'ContactFieldDescription', 'IsBuiltIn')
        ?? (() => {
            // IsBuiltIn is declared on the allOf-composed EntityFieldDescriptionWithExtraCharge branch.
            const schemas = spec.components?.schemas ?? {};
            const cfd = schemas['ContactFieldDescription'];
            for (const branch of cfd?.allOf ?? []) {
                if (branch.properties?.IsBuiltIn) return { schemaName: 'ContactFieldDescription', flagName: 'IsBuiltIn', ...branch.properties.IsBuiltIn };
            }
            return null;
        })();
    const donationFieldIsSystem = findSchemaFlag(spec, 'EntityFieldDescription', 'IsSystem');

    const sentEmailRecipientSchema = spec.components?.schemas?.SentEmailRecipient ?? null;
    const sentEmailRecipientHasId = sentEmailRecipientSchema
        ? Object.keys(sentEmailRecipientSchema.properties ?? {}).some((k) => /^id$/i.test(k))
        : null;

    const output = {
        ScriptRunAt: new Date().toISOString(),
        SpecUrl: SPEC_URL,
        SpecVersion: spec.info?.version ?? null,
        RateLimits: {
            sourceUrl: RATE_LIMIT_DOC_URL,
            ...rateLimits,
        },
        AccountsDiscovery: {
            sourceUrl: ACCOUNTS_HELP_URL,
            helpArticleExcerpt: accountsHelp.text,
            specSummary: accountsListSummary,
            specDescription: accountsListDescription,
        },
        CrudByGapObject: crud,
        CustomFieldMarkerFlags: {
            ContactFieldDescription_IsBuiltIn: contactFieldIsBuiltIn,
            EntityFieldDescription_IsSystem: donationFieldIsSystem,
        },
        SentEmailRecipientPKCheck: {
            hasIdProperty: sentEmailRecipientHasId,
            properties: sentEmailRecipientSchema ? Object.keys(sentEmailRecipientSchema.properties ?? {}) : null,
        },
    };

    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
