# Verified Patterns Library

Per architecture §4.23. Reference implementations + sample fixtures for vendor patterns that have been **proven across ≥3 real connectors**.

## What goes here

Each entry is a pattern reference (script + sample fixtures + when-applicable doc + known-vendor list). The library is distinct from the strategy library:

| | Strategy library (`packages/Integration/connector-extractor-strategies/`) | Verified-patterns library (here) |
|---|---|---|
| What it provides | Code-level extraction primitives (OpenAPI parser, type helpers, UpsertByKey) | Reference-level metadata patterns (auth flow, pagination shape, response envelope, scrape pattern) |
| When entries land | When ≥3 vendors exercise the same shape and the code can be lifted as a reusable strategy class | When ≥3 vendors exhibit the same pattern at the metadata/observation level, with a reference script proving the pattern works |
| Form | TypeScript classes + interfaces | JSON / markdown / fixture sample data with provenance |

Subdirectories:

- `auth-patterns/` — proven auth-flow patterns (OAuth2 Authorization Code with refresh; JWT Bearer Flow with instance-URL preservation; HMAC with timestamp; API-key-as-Basic-username; etc.)
- `pagination-patterns/` — proven pagination shapes (Cursor via `paging.next.after`; Cursor via `starting_after`; Offset; Page Number; Link-Header)
- `response-envelope-patterns/` — proven response envelopes (`{results:[]}`, `{data:[]}`, `{records:[],done,totalSize,nextRecordsUrl?}`, `{items:[]}`)
- `scrape-patterns/` — proven HTML scrape patterns (Stoplight, ReadMe, Redoc, Swagger UI, GitBook, Mintlify)

## What does NOT go here

- One-vendor specifics (those stay per-connector)
- Theoretical patterns we haven't actually exercised
- Code-level abstractions (those go to the strategy library)

## Entry format

Each pattern entry is a directory containing:

```
<pattern-name>/
  pattern.json          # Canonical pattern description with provenance
  reference-script.ts   # Working extraction logic (if applicable)
  fixtures/             # Sample data demonstrating the pattern
  README.md             # When-applicable docs + caveats + known vendor list
```

`pattern.json` schema:

```json
{
  "Name": "OAuth2AuthCodeWithRefresh",
  "Category": "auth",
  "Description": "OAuth 2.0 Authorization Code grant with long-lived refresh tokens; access tokens short-lived (30-60 min) and refreshed via /oauth/token endpoint.",
  "ApplicableVendors": ["HubSpot", "Salesforce", "<vendor3>"],
  "MinimumVerifications": 3,
  "CurrentVerifications": 0,
  "ReferenceScript": "./reference-script.ts",
  "ProvenanceURLs": ["https://...", "https://..."],
  "CaveatsAndKnownIssues": [
    "Refresh-token rotation (FP-001) requires preserving existing refresh_token when response omits it"
  ],
  "LastVerifiedAt": "2026-05-18T00:00:00Z"
}
```

## Phase

This directory is **scaffolded** in framework-expansion phase A.5. Entries land in phase C after 4 vendor rebuilds (B.1-B.4) surface patterns that recur ≥3 times. No premature abstraction.
