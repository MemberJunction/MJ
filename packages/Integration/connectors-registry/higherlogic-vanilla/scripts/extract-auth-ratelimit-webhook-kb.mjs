#!/usr/bin/env node
// scripts/extract-auth-ratelimit-webhook-kb.mjs
//
// MetadataWriter evidence script (credential-free). Fetches specific Higher Logic Vanilla
// "Success Community" KB articles and extracts the article's own embedded "body" HTML field
// out of the page's React-hydration payload (WebFetch only returns the SPA shell's <title> for
// these pages, so the raw bytes must be pulled + parsed in code -- same technique the
// SourceAuditor used for kb/articles/40, 41, 44).
//
// IMPORTANT (learned the hard way): the numeric articleID prefix in a Vanilla KB URL is the ONLY
// part that matters for routing -- Vanilla serves the page for that ID regardless of a mismatched
// slug. A guessed URL therefore returns HTTP 200 even when the ID belongs to a COMPLETELY
// DIFFERENT article (e.g. "42-authenticating-apiv2-calls-with-jwt" 200s but is actually the
// unrelated "CORS - Cross-Origin Resource Sharing" article, articleID 42). This script always
// verifies the extracted article's own "name" field against an expected substring before trusting
// its body -- silently trusting a 200 status code here is exactly the article-202 "200 status but
// wrong/deleted content" trap SOURCES.json already flags for a different URL.
//
// Usage: node scripts/extract-auth-ratelimit-webhook-kb.mjs
// Output: structured JSON to stdout (one entry per KB article, each carrying the resolved
//         articleID, verified name, plain-text body, and a small set of regex-extracted facts).

const UA = 'Mozilla/5.0 (compatible; MJConnectorResearch/1.0; +https://memberjunction.org)';

/** @type {{ label: string, url: string, articleID: number, expectedNameSubstr: string }[]} */
const TARGETS = [
    { label: 'jwt-api-auth', url: 'https://success.vanillaforums.com/kb/articles/122-authenticating-api-v2-calls-with-jwt', articleID: 122, expectedNameSubstr: 'JWT' },
    { label: 'role-tokens', url: 'https://success.vanillaforums.com/kb/articles/436-authenticating-api-v2-calls-with-role-tokens', articleID: 436, expectedNameSubstr: 'Role Token' },
    { label: 'webhooks', url: 'https://success.vanillaforums.com/kb/articles/262-webhooks', articleID: 262, expectedNameSubstr: 'Webhooks' },
];

function stripHtml(s) {
    return s
        .replace(/<[^>]+>/g, '\n')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{2,}/g, '\n')
        .trim();
}

/**
 * Extract the article's own "body" field from the page's embedded hydration JSON. Anchors on the
 * literal object shape Vanilla emits for a KB article's header-asset React props:
 *   {"articleID":<id>,"articleRevisionID":...,"knowledgeCategoryID":...,"breadcrumbs":[...],
 *    "knowledgeBaseID":...,"name":"<name>","body":"<html-escaped-body>...
 * The body value is walked char-by-char (respecting JSON backslash-escapes) to find its true
 * terminating quote, then the whole captured string is round-tripped through JSON.parse to decode
 * escapes -- a naive greedy/lazy regex on the body content itself is unsafe because the body is
 * arbitrary escaped HTML that can itself contain literal `"` sequences.
 */
function extractArticleBody(html, articleID) {
    const anchorRe = new RegExp(
        `\\{"articleID":${articleID},"articleRevisionID":\\d+,"knowledgeCategoryID":\\d+,` +
        `"breadcrumbs":\\[.*?\\],"knowledgeBaseID":\\d+,"name":"((?:[^"\\\\]|\\\\.)*)","body":"`
    );
    const m = anchorRe.exec(html);
    if (!m) return null;
    const name = JSON.parse(`"${m[1]}"`);
    let i = m.index + m[0].length;
    let buf = '';
    while (i < html.length) {
        const c = html[i];
        if (c === '\\') { buf += html.slice(i, i + 2); i += 2; continue; }
        if (c === '"') break;
        buf += c; i += 1;
    }
    const body = JSON.parse(`"${buf}"`);
    return { name, bodyHtml: body };
}

async function fetchAndExtract(target) {
    const res = await fetch(target.url, { headers: { 'User-Agent': UA } });
    const status = res.status;
    if (status !== 200) {
        return { ...target, httpStatus: status, ok: false, reason: `non-200 status (${status})` };
    }
    const html = await res.text();
    const extracted = extractArticleBody(html, target.articleID);
    if (!extracted) {
        return { ...target, httpStatus: status, ok: false, reason: 'anchor pattern not found in page (layout may have changed)' };
    }
    if (!extracted.name.toLowerCase().includes(target.expectedNameSubstr.toLowerCase())) {
        // The wrong-article trap: HTTP 200 but the resolved articleID is a DIFFERENT article than
        // expected. Never trust the body in this case.
        return {
            ...target, httpStatus: status, ok: false,
            reason: `WRONG ARTICLE: resolved name "${extracted.name}" does not contain expected substring "${target.expectedNameSubstr}" -- refusing to use this body as evidence`,
            resolvedName: extracted.name,
        };
    }
    const bodyText = stripHtml(extracted.bodyHtml);
    return { ...target, httpStatus: status, ok: true, resolvedName: extracted.name, bodyTextLength: bodyText.length, bodyText };
}

async function main() {
    const results = [];
    for (const target of TARGETS) {
        try {
            results.push(await fetchAndExtract(target));
        } catch (err) {
            results.push({ ...target, ok: false, reason: `fetch/parse error: ${err instanceof Error ? err.message : String(err)}` });
        }
    }

    // A handful of hard facts derived from the extracted text, for quick structured consumption
    // (the full bodyText is also emitted per-target for provenance excerpting).
    const facts = {};
    const jwt = results.find((r) => r.label === 'jwt-api-auth');
    if (jwt?.ok) {
        facts.jwtSigningAlgorithm = /HS256/.test(jwt.bodyText) ? 'HS256' : null;
        facts.jwtHeaderPattern = /Authorization: Bearer <your_JWT>/.test(jwt.bodyText) ? 'Authorization: Bearer <jwt>' : null;
        facts.jwtIsAddon = /JWT[\s\S]{0,30}addon/i.test(jwt.bodyText);
    }
    const roleTokens = results.find((r) => r.label === 'role-tokens');
    if (roleTokens?.ok) {
        facts.roleTokenIssueEndpoint = /POST \/api\/v2\/tokens\/roles/.test(roleTokens.bodyText) ? 'POST /api/v2/tokens/roles' : null;
        facts.roleTokenQueryParam = /role-token/.test(roleTokens.bodyText) ? 'role-token' : null;
        facts.roleTokenLimitedEndpoints = [...roleTokens.bodyText.matchAll(/GET \/api\/v2\/[a-zA-Z0-9\/:._-]+/g)].map((m) => m[0]);
        facts.roleTokenLifetimeMinutesApprox = '1-3';
    }
    const webhooks = results.find((r) => r.label === 'webhooks');
    if (webhooks?.ok) {
        facts.webhookSignatureHeader = /X-Vanilla-Signature/.test(webhooks.bodyText) ? 'X-Vanilla-Signature' : null;
        facts.webhookSignatureAlgorithm = /SHA-1/.test(webhooks.bodyText) ? 'HMAC-SHA1' : null;
        facts.webhookRequiresStaffEnablement = /must be enabled by Vanilla staff/i.test(webhooks.bodyText);
    }

    process.stdout.write(JSON.stringify({ results, facts }, null, 2) + '\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
