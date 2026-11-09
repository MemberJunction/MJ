# @memberjunction/actions-peopledatalabs

A table-agnostic [People Data Labs](https://www.peopledatalabs.com/) client plus one thin Action.
The client fetches and returns normalized person data; it never writes to the database, and it never
returns emails, phone numbers or addresses. The Action exists for agents and workflows. Code that
needs PDL data calls the client directly, never the Action.

## What it covers

| Surface | PDL endpoint | Billing (confirmed 2026-10-12) |
|---|---|---|
| `PDLPersonClient.BulkEnrich` | `POST /v5/person/bulk` | 1 credit per matched person; misses are free |
| `PDLPersonClient.SearchPeople` | `POST /v5/person/search` | 1 credit per record returned |
| `PDLPersonClient.CountPeople` | `POST /v5/person/search` with `size: 1` | 1 credit when anything matches |
| `PDLPersonClient.SuggestSchools` | `GET /v5/autocomplete?field=school` | free, rate-limited |
| `PDLPersonClient.CleanSchool` | `GET /v5/school/clean` | free, rate-limited |

## Credentials

Two paths, in order:

1. A `CompanyID` resolves that company's active `People Data Labs` row in `MJ: Company Integrations`,
   then its `CredentialID` in `MJ: Credentials`, whose `Values` hold `{ "apiKey": "…" }`.
2. The `PDL_API_KEY` environment variable.

`CompanyIntegration.APIKey` is never read: it is not decrypt-on-read, so a synced value comes back as
ciphertext and PDL answers 401. A credential that exists but is malformed throws rather than falling
back to the environment.

The `MJ: Integrations` row named `People Data Labs` ships in `metadata/integrations/`.

## Usage

```typescript
import { PDLPersonClient } from '@memberjunction/actions-peopledatalabs';

const resolved = await PDLPersonClient.ForCompany(companyID, contextUser);
if (!resolved) throw new Error('no PDL key');
const result = await resolved.Client.BulkEnrich([
    { Key: personID, Email: 'someone@example.org' },
    { Key: otherID, FirstName: 'Ada', LastName: 'Lovelace', Company: 'analytical.example' },
], { MinLikelihood: 6 });
for (const match of result.Matches) {
    // match.Matched, match.PDLID, match.Likelihood (1..10), match.LinkedInURL,
    // match.Education[] { SchoolName, SchoolID, Degrees, Majors, StartDate, EndDate }
    // match.Experience[] { CompanyName, CompanyDomain, Title, StartDate, EndDate, IsCurrent }
}
```

Rules the client enforces:

- At most 100 inputs per call, and every input needs an identifying field: `PDLID`, `Email`,
  `LinkedInURL`, or first name plus last name plus company. Both checks run before any HTTP call.
- `min_likelihood` is sent inside each request's `params`. At the request level PDL silently ignores
  it and returns low-likelihood guesses.
- Results are correlated by position and checked against the echoed `metadata.key`. A mismatch
  throws rather than attaching one person's history to another.
- Per item: 200 is a match, 404 a miss (free, not an error), anything else sets `ErrorMessage` on
  that item only.
- Top level: 401 and 403 become `PDLAuthError`, 402 `PDLCreditsExhaustedError`, 429
  `PDLRateLimitError` with `RetryAfterSeconds` from `x-ratelimit-reset`, anything else
  `PDLRequestError`. The client never sleeps.
- Dates arrive as `YYYY`, `YYYY-MM` or `YYYY-MM-DD` and are normalized to the first day of the year
  or month.
- `Required` and `DataInclude` are passed through when set, but PDL did not apply them on the plan
  this was built against. The field mapping here is the real minimization.

A note on schools: PDL may file a degree under the parent university. A Harvard Kennedy School
master's came back as `school.name = "harvard university"` with major `public administration`.
`CleanSchool` is not reliable alone (it mapped "John F. Kennedy School of Government" to
`john f. kennedy school`); clean, then confirm with `SuggestSchools`, which returns ids and counts.

## The Action

`People Data Labs - Enrich People` (`DriverClass` `PDLEnrichPeopleAction`), category Data Enrichment.

| Param | Type | Notes |
|---|---|---|
| People | Input, required | JSON array (or JSON string) of `{ Email, LinkedInURL, FirstName, LastName, Company, PDLID, Key }`, at most 100 |
| MinLikelihood | Input | 1 to 10, default 6 |
| CompanyID | Input | Per-company credential, as above |
| Matches | Output | The normalized `PDLPersonMatch[]`, in input order |
| MatchedCount, CreditsConsumed, KeySource | Output | |

Result codes: `SUCCESS`, `NO_MATCHES` (a success), `RATE_LIMITED`, `CREDITS_EXHAUSTED`,
`CREDENTIALS_NOT_FOUND`, `CONFIGURATION_ERROR`, `VALIDATION_ERROR`, `ERROR`.

## Tests

`pnpm test`. Every test uses an injected fetch and the redacted fixtures under
`src/__tests__/fixtures/`, captured from live responses on 2026-10-12. Nothing reaches PDL from a
test.
