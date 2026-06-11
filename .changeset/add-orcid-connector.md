---
"@memberjunction/integration-connectors": minor
---

Add ORCID Public API v3.0 connector (pull-only / read-public). Covers the record/person object plus the 11 activity sections (works, employments, educations, qualifications, distinctions, invited-positions, memberships, services, fundings, peer-reviews, research-resources). OAuth2 client-credentials auth; the researcher iD universe is Configuration-scoped per connection (Lucene search query and/or an explicit ORCID iD list), never enumerated. PK = put-code (activities) / ORCID iD (record-person); incremental via last-modified-date where present, otherwise content-hash idempotency. Includes the connector class, 28 unit tests, and declared integration metadata (12 objects, 192 fields).
