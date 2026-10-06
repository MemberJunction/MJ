# Memo: form chrome L1 for Sales and Contracts

For: Josue (Sales), Marcelo (Contracts)  
From: form-chrome layering work (MJ #3824 + OpenApp PRs)  
When you pick this up: decorate **your** related entities on parent forms. Do not edit Common’s Contact Methods / Addresses.

## The model

Membership is data. `EntityRelationship.Configuration.UI.inclusion`:

- `Primary` — first-class rail
- `More` — parked
- `None` — not a candidate (not in More, ranker never sees it)
- omit — Auto (L2 ranker)
- `join: { mode: 'any', fields: [...] }` — one section over several same-table FKs

`FormRole: 'Detail'` still maps to More. Prefer `inclusion`.

Policy cannot add/remove/re-bucket. `BaseFormPolicy.DecorateChrome` is labels/icons only.

Docs: [Forms Architecture §7d](../guides/FORMS_ARCHITECTURE_GUIDE.md#7d-form-chrome--accordion-left-nav-and-more).

## Who ships the punch

The app that **owns the related entity** ships the L1 row.

- Sales does not edit Common’s People Contact Methods.
- Sales **does** punch `People → Deals` (or whatever Sales calls the commercial object).
- Contracts **does** punch `People → Contracts` / `Organizations → Contracts`.

File: `metadata/entity-relationships/.form-chrome.json` (same `.mj-sync.json` as Entity Relationships). `mj sync push` after.

## Suggested defaults (edit if the product disagrees)

### Sales (Josue)

**On Person / Organization**

| Related | Inclusion | Notes |
|---|---|---|
| Deals / Opportunities (primary party) | Primary | The commercial object they own |
| Deal lines / quote lines | None | Header is enough |
| Activities / notes / emails spawned by Sales | None | Satellites |
| Secondary roles (influencer, billing contact on a deal) | More or None | Prefer None if a join on the primary deal already covers them |

If Bill-To vs Ship-To style dual FKs exist on the same deal table, one inclusion with `join.any` — do not sprout three Deal rail items.

**On Deal / Opportunity**

| Related | Inclusion |
|---|---|
| Lines / quotes | Primary |
| Activities, emails | More |
| Created-by / closed-by inverses | None |

### Contracts (Marcelo)

**On Person / Organization**

| Related | Inclusion | Notes |
|---|---|---|
| Contracts (signatory / party) | Primary | One section; join multiple party FKs if needed |
| Amendments / addenda as their own entity | More | Or None if they only live under the contract |
| Obligations / clauses | None | Not a Person-form surface |

**On Contract**

| Related | Inclusion |
|---|---|
| Amendments, parties, terms | Primary |
| Obligations / milestones | Primary if they are the working body, else More |
| Audit / notification logs | More or None |

## What not to do

- Do not punch `FormRole` on Common-owned ERs.
- Do not use `DisplayInForm: false` for “I don’t want this on Person” when the ER is still a real relationship — use `inclusion: 'None'` so CodeGen still knows the FK exists.
- Do not put through-junction filters (Contracts via a party-link table) in `join.any`. That is a later through-filter, or a contribution widget.

## Check your work

Open a Person with Sales + Contracts + Orders + Tasks installed. The rail should be Details + Contact Methods + Relationships + Tasks + Orders + Payments + Subscriptions + Deals + Contracts + Memberships (if Committees) + More. Satellites stay off.
