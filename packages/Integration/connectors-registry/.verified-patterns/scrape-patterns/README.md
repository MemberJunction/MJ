# Scrape patterns

Proven HTML-documentation scrape patterns for vendors without machine-readable schema (no OpenAPI / no SDK type defs / no Postman). Each entry covers a specific docs-publishing platform: Stoplight, ReadMe, Redoc, Swagger UI, GitBook, Mintlify, etc.

Each entry captures:
- The platform identifier (CSS selectors / DOM landmarks that identify the platform)
- Object-catalog extraction (which DOM nodes hold the object list)
- Field extraction (which DOM nodes hold the field tables, per-field name + type + required + description)
- Auth/pagination/error extraction (where on the page each lives)
- Reference extraction script using Cheerio or equivalent
- Applicable vendors (≥3 required)

Entries land in phase C, only after a non-OpenAPI / non-SDK-typedef vendor surfaces during rebuild and ≥2 more vendors of similar docs-platform are processed.

For the current vendor cohort (HubSpot/Stripe/Salesforce/YourMembership), only YourMembership might exercise this — and even YM has a ServiceStack `/openapi` endpoint that the framework should detect before falling to scrape.
