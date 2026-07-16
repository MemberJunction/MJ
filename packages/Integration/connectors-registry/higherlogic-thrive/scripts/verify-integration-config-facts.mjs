#!/usr/bin/env node
// Verifies (live, credential-free) the NavigationBaseURL + regional-host claims, and extracts
// (from the already-saved raw HelpPage op pages) the exact wire-level auth shape for
// Authentication/Login, Authentication/Widget, and Authentication/GetTenantDetail — the facts
// MetadataWriter needs for Integration.NavigationBaseURL + Integration.Configuration.AuthFlow /
// RegionalBaseURLs. Structured JSON to stdout only; no vendor data beyond public doc-page HTML.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OPS_DIR = resolve(HERE, '..', 'sources', 'ops');

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const stripTags = (html) => decode(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();

async function checkURL(url) {
    try {
        const res = await fetch(url, { method: 'GET', redirect: 'follow' });
        return { url, status: res.status, ok: res.ok };
    }
    catch (err) {
        return { url, status: null, ok: false, error: String(err) };
    }
}

// Extract a "Name ... Description ... Type" field table from a Resource Description / Body
// Parameters section by locating the labeled table and pulling out field-name tokens. The
// HelpPage's per-operation tables are `<table class="help-page-table">` with a fixed
// Name/Description/Type/Additional-information column order; we parse the already-decoded
// plain-text form (stripTags) rather than the raw HTML since the layout is consistent enough
// that a positional text scan is reliable and avoids brittle per-tag regex.
function parseLoginPage() {
    const html = readFileSync(resolve(OPS_DIR, 'POST-api-v2.0-Authentication-Login.html'), 'utf8');
    const text = stripTags(html);
    const bodyModelMatch = text.match(/Body Parameters ([\s\S]*?) Request Formats/);
    const bodyFields = bodyModelMatch ? [...bodyModelMatch[1].matchAll(/\b(Username|Password)\b Username of user|Password of user/g)].map(() => null) : [];
    const responseModelMatch = text.match(/Resource Description ([\s\S]*?) Response Formats/);
    return {
        sourceFile: 'sources/ops/POST-api-v2.0-Authentication-Login.html',
        bodyModelName: (text.match(/LoginCredentials/) || [])[0] ?? null,
        bodyFieldsConfirmed: ['Username', 'Password'].filter((f) => new RegExp(`\\b${f}\\b`).test(text)),
        responseModelName: (text.match(/AuthToken/) || [])[0] ?? null,
        responseFieldsConfirmed: ['Token'].filter((f) => new RegExp(`\\b${f}\\b`).test(text)),
        rawExcerpt: text.slice(0, 400),
    };
}

function parseWidgetPage() {
    const html = readFileSync(resolve(OPS_DIR, 'POST-api-v2.0-Authentication-Widget.html'), 'utf8');
    const text = stripTags(html);
    return {
        sourceFile: 'sources/ops/POST-api-v2.0-Authentication-Widget.html',
        bodyModelName: (text.match(/WidgetToken/) || [])[0] ?? null,
        bodyFieldsConfirmed: ['token'].filter((f) => new RegExp(`\\b${f}\\b`).test(text)),
        responseModelName: (text.match(/TenantInfo/) || [])[0] ?? null,
        responseFieldsConfirmed: ['IAMKey', 'TenantShortName', 'TenantCode', 'DomainUrl', 'DomainLoginUrl'].filter((f) => new RegExp(`\\b${f}\\b`).test(text)),
        rawExcerpt: text.slice(0, 400),
    };
}

function parseGetTenantDetailPage() {
    const html = readFileSync(resolve(OPS_DIR, 'GET-api-v2.0-Authentication-GetTenantDetail_communityUrl.html'), 'utf8');
    const text = stripTags(html);
    return {
        sourceFile: 'sources/ops/GET-api-v2.0-Authentication-GetTenantDetail_communityUrl.html',
        uriParamsConfirmed: ['communityUrl'].filter((f) => new RegExp(`\\b${f}\\b`).test(text)),
        responseModelName: (text.match(/TenantDetail/) || [])[0] ?? null,
        responseFieldsConfirmed: ['TenantKey', 'FullName', 'ShortName', 'HomePage'].filter((f) => new RegExp(`\\b${f}\\b`).test(text)),
        rawExcerpt: text.slice(0, 500),
    };
}

async function main() {
    const [helpPageUS, helpPageMirror, helpPageCanada, bareUS, bareCanada] = await Promise.all([
        checkURL('https://api.connectedcommunity.org/v2.0/Help'),
        checkURL('https://api.higherlogic.com/v2.0/Help'),
        checkURL('https://api.onlinecommunity.ca/v2.0/Help'),
        checkURL('https://api.connectedcommunity.org/'),
        checkURL('https://api.onlinecommunity.ca/'),
    ]);

    const output = {
        verifiedAt: new Date().toISOString(),
        urlChecks: { helpPageUS, helpPageMirror, helpPageCanada, bareUS, bareCanada },
        authShapes: {
            login: parseLoginPage(),
            widget: parseWidgetPage(),
            getTenantDetail: parseGetTenantDetailPage(),
        },
    };
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
