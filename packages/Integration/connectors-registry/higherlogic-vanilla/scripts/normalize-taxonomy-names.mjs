#!/usr/bin/env node
// normalize-names.mjs — deterministic, rule-based display-name canonicalization run OVER the
// enumerate-vanilla-catalog.mjs stdout (never a hand-typed rename). Rules, applied in order, with
// an explicit collision-avoidance override table for the handful of cases where blind suffix
// stripping would produce a name that collides with (or is less clear than) another leaf's name.
import { readFileSync, writeFileSync } from 'node:fs';

const catalogPath = process.argv[2];
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));

// Explicit, named overrides — each has a one-line reason (never silent).
const OVERRIDES = {
    UserFragment: { to: 'OnlineUser', reason: 'reached only via GET /online; suffix-stripping to "User" would collide with the real User leaf' },
    LocaleConfig: { to: 'Locale', reason: 'allOf(Locale, TranslationServiceType) — base record is Locale; no collision since Locale is not separately coverable' },
    Drafts: { to: 'Draft', reason: 'pluralized door name; canonical schema-level record is singular' },
    Polls: { to: 'Poll', reason: 'pluralized door name' },
    Sessions: { to: 'Session', reason: 'pluralized door name' },
    Subcommunities: { to: 'Subcommunity', reason: 'pluralized door name' },
    KnowledgeCategories: { to: 'KnowledgeCategory', reason: 'pluralized door name' },
    emailTemplates: { to: 'EmailTemplate', reason: 'lowercase-leading vendor schema key + pluralized; canonicalized to PascalCase singular' },
    FullCollectionSchema: { to: 'Collection', reason: 'strip vendor "Full…Schema" wrapper naming convention' },
    FullKnowledgeBaseSchema: { to: 'KnowledgeBase', reason: 'strip vendor "Full…Schema" wrapper naming convention' },
    FullEvent: { to: 'Event', reason: 'strip vendor "Full…" wrapper naming convention' },
    NotificationSchema: { to: 'Notification', reason: 'strip vendor "…Schema" suffix' },
    CategorySchema: { to: 'Category', reason: 'strip vendor "…Schema" suffix' },
    AuthenticatorFragment: { to: 'Authenticator', reason: 'strip vendor "…Fragment" suffix' },
    UserMentions: { to: 'UserMention', reason: 'pluralized door name' },
};

function normalize(name) {
    if (OVERRIDES[name]) return OVERRIDES[name].to;
    return name;
}

const mapping = catalog.coverable.map((c) => ({
    normalizedName: normalize(c.name),
    rawName: c.name,
    overrideReason: OVERRIDES[c.name]?.reason ?? null,
    doors: c.doors,
    pkField: c.pkField,
}));

// Collision check — assert normalization produced a bijective (no-collision) result.
const seen = new Map();
for (const m of mapping) {
    if (seen.has(m.normalizedName)) {
        throw new Error(`Normalization collision: "${m.normalizedName}" produced by both ${seen.get(m.normalizedName)} and ${m.rawName}`);
    }
    seen.set(m.normalizedName, m.rawName);
}

const out = {
    count: mapping.length,
    taxonomyLeaves: mapping.map((m) => m.normalizedName).sort(),
    mapping: mapping.sort((a, b) => a.normalizedName.localeCompare(b.normalizedName)),
};
writeFileSync('taxonomy-leaves.final.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({ count: out.count, taxonomyLeaves: out.taxonomyLeaves }, null, 2));
