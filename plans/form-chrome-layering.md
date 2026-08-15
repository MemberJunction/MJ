# Form chrome layering

**Status:** agreed, implementing  
**Depends on merge wave:** [MJ#3823](https://github.com/MemberJunction/MJ/pull/3823), [Orders#71](https://github.com/MemberJunction/bizapps-orders/pull/71), [Tasks#34](https://github.com/MemberJunction/bizapps-tasks/pull/34)  
**Supersedes (chrome membership only):** `plans/form-chrome-policy.md` § “Two layers” — ranker + `FormRole` punches remain as the L2 default and the L1 *shape*, but they are no longer the whole story.

How a generated entity form decides **what is on the rail at all**, and **Primary vs More**, when many OpenApps plus a customer install all have an opinion. Complements [Forms Architecture §7c–7d](../guides/FORMS_ARCHITECTURE_GUIDE.md).

CodeGen output is **layer 0**. It stays. This plan is the control plane above it.

---

## 1. The problem

A Person with Common + Tasks + Orders installed grows a related-entity dump: Task Comments, Assignments, Decisions as first-class; Tasks and Activities in More; Bill-To / Ship-To / Sold-To Orders as three grids. The app author knows that is wrong. The customer admin cannot fix it without editing the same `Configuration` bag the next `mj sync push` overwrites.

Today there is **no stack**. There is one cell and five writers:

| Writer | Cell | Last-wins? |
|---|---|---|
| CodeGen | `DisplayInForm`, `Sequence` | Schema |
| App metadata | `Entity.Configuration` / `ER.Configuration.FormRole` | Last sync of **that row** |
| Contributions | ClassFactory | Last loaded package |
| `BaseFormPolicy` | Full chrome spec replace | Last loaded class |
| End user | `UserInfoEngine` membership | Per user |

Downstream apps mutate upstream rows. Admin edits mutate the same rows. Policy can throw the ranker away. That is powerful and unclean.

---

## 2. The stack

```
L0  CodeGen            what exists (field panels, DisplayInForm, Sequence)
L1  App inclusions     each OpenApp ships None | More | Primary per inclusion
L2  Ranker             Auto leftovers only — L1 None never enters
L3  Install overlay    MJ: Form Chrome Rules — sysadmin, never app-synced
L4  User overlay       membership + rail order (already exists)
```

Later layer wins on the **same target**. Same L1 layer: downstream / later-installed app wins, and the admin UI shows the pathway.

`BaseFormPolicy` is **behavior only**. It cannot add, remove, or re-bucket sections. Downstream still `extends` an upstream policy for grouping labels / icons / future behavior. Membership is data.

---

## 3. L1 — inclusions, not one FormRole per FK

An **inclusion** is keyed by `(parent entity, related entity)` or `(parent entity, contributionKey)` — **not** by a single EntityRelationship row.

An EntityRelationship remains one FK. Bill-To and Ship-To stay two rows. The Person form has **one** Orders section.

```ts
type FormInclusion = 'Primary' | 'More' | 'None';

interface IFormInclusion {
    /** Parent form. */
    entity: string;
    /** Related entity, or omit when targeting a contribution. */
    relatedEntity?: string;
    contributionKey?: string;
    /**
     * Primary — first-class rail.
     * More — candidate, parked.
     * None — not a candidate. Not in More. Ranker never sees it.
     */
    inclusion: FormInclusion;
    /**
     * Same-table OR of FKs. Orders on People:
     *   { mode: 'any', fields: ['BillToPersonID', 'ShipToPersonID'] }
     * Extra FKs (Sold-To) get their own inclusion: None so they do not sprout a rail item.
     */
    join?: { mode: 'any'; fields: string[] };
}
```

`None` is the missing verb. Task Comments / Assignments / Decisions / Activities on Person are **None**, not Detail. The Tasks app author would never put them on the Person form.

**Through-filters** (Tasks linked via `Task Assignments`) are **not** same-table OR. They need a junction. Out of scope for the first cut. Until then that case is a contribution widget, or it waits.

### Where L1 lives in files

OpenApps decorate `metadata/entity-relationships/*.json` (and entity files for Layout) with `@lookup` keys, then `mj sync push`. At release, build engineering turns that metadata into one sync migration. Dev workflow is files + sync; install workflow is SQL.

Shape on the relationship bag (additive, no MJ table for L1):

```ts
// IEntityRelationshipUIConfiguration
inclusion?: 'Primary' | 'More' | 'None'; // preferred
FormRole?: 'Primary' | 'Detail';         // deprecated alias: Primary→Primary, Detail→More
join?: { mode: 'any'; fields: string[] };
```

Resolver maps `FormRole: 'Detail'` → inclusion More so existing punches keep working.

When several ERs share a related entity and one of them carries `join.fields`, that inclusion **owns** the section. Sibling ERs to the same related entity default to None unless they also declare inclusion.

### Ownership

The app that **owns the related entity** (or the contribution) ships the L1 row. Common does not describe Orders-on-Person. Orders does. Tasks does not edit Common’s Contact Methods. Downstream may override an upstream inclusion; that is an explicit L1 override, visible in the pathway.

---

## 4. L2 — ranker, unchanged job, smaller pool

`ResolveRelatedFormRoles` only sees candidates that are still **Auto** after L1 (and not L3-pinned).

- `inclusion: 'None'` — dropped before scoring
- `inclusion: 'Primary' | 'More'` — fixed, does not consume the Auto budget
- omit — Auto, ranked

If we later drop the “under-budget ⇒ keep all Auto” shortcut, satellites fall to More even on a 4-relationship form. **Not required to ship the stack.** The important fix is L1 None so curated apps never offer clutter to the ranker.

---

## 5. L3 — install overlay (this *is* an MJ table)

Admin must not edit the same bag apps sync. That requires a **new entity**, which is a versioned MJ migration (the only schema change in this work). L1 itself is interface + metadata, no MJ migration.

`MJ: Form Chrome Rules`

| Column | Meaning |
|---|---|
| `ID` | PK |
| `EntityID` | Parent form entity |
| `TargetKind` | `Relationship` \| `Contribution` |
| `RelatedEntityID` | When TargetKind = Relationship |
| `ContributionKey` | When TargetKind = Contribution |
| `Inclusion` | `Primary` \| `More` \| `None` |
| `JoinFields` | JSON string array; optional OR of FKs |
| `Sequence` | Tie-break |

No ApplicationID on L3 — install is global. App-authored intent stays in L1 files.

Sync: **never** include this entity in OpenApp `metadata/` push filters. The admin UI writes it. Optional later: a customer-owned overlay directory.

Unique: `(EntityID, TargetKind, RelatedEntityID, ContributionKey)`.

---

## 6. L4 — keep

User rail order and More membership via `UserInfoEngine` stay as they are. L4 cannot **suppress** a contribution (that is L3). L4 can move a visible item to More.

---

## 7. Contributions

No L0 (CodeGen did not emit them). No L2 (not a related-grid pool).

- L1: the package is installed → the contribution **exists** by `contributionKey`
- L3: admin can **suppress** by key (off for the site)
- L4: rearrange among what’s still on

---

## 8. Policy class

```ts
export class BaseFormPolicy {
    // May rename groups, swap icons, wrap Payments+Subs as "Commerce".
    // MUST NOT add/remove/re-bucket sections. Inclusion is data.
    public DecorateChrome(spec: FormChromeSpec, ctx: FormChromeContext): FormChromeSpec {
        return spec;
    }
}
```

`ResolveChrome` that returned a full spec is removed from the contract. `OrdersPersonFormPolicy extends CommonPersonFormPolicy` is still the subclass seam. Installer can ship `AcmePersonFormPolicy`. L3 still wins on membership after decorate.

---

## 9. Resolver order

1. Collect L0 panels + DisplayInForm relationships + registered contributions  
2. Apply L1 inclusions (downstream wins on conflict; record pathway)  
3. Drop `None`  
4. Rank remaining Auto (L2)  
5. Apply L3 rules (pin / More / None / suppress contribution)  
6. Policy `DecorateChrome` (cosmetics only; ignore membership mutations if a policy violates the contract)  
7. Merge same-related-entity groups; apply `join.any` to the grid ExtraFilter (`BuildRelationshipViewParamsForJoinFields` already exists)  
8. L4 user membership  

The admin “why is this here” view is the pathway from step 2–5.

---

## 10. What Person should look like (product)

**Tasks L1:** Tasks = Primary (Beneficiary / main link). Comments, Assignments, Decisions, Activities = **None**.

**Orders L1:** Orders / Payments / Subscriptions = Primary; Orders join `any: [BillToPersonID, ShipToPersonID]`; Stored Payment Methods = More; everything else to Person/Org = None.

**Common L1:** Contact Methods, Addresses, etc. as Common decides.

**L3:** customer can suppress the Orders hero or promote Stored Methods without editing a repo.

---

## 11. Implementation sequence

1. Merge wave (this PR set) — do not layer on unmerged FormRole punches as if they were final.  
2. MJ: extend JSONType interfaces + `entityConfiguration.ts`; change resolver; `DecorateChrome`; L3 table + entity metadata; tests.  
3. `mj sync` JSONType + `mj codegen` + build `@memberjunction/core` / `ng-base-forms` / `core-entities`.  
4. Docs: `FORMS_ARCHITECTURE_GUIDE.md` §7d, `PANELS.md`, base-forms README, `packages/Angular/CLAUDE.md`, this plan, `guides/README.md` pointer.  
5. OpenApp L1 decoration (in this order): Common → Tasks → Issues → Committees → Secure Messaging (only if it hangs related grids on Person/Org) → Accounting → Orders.  
6. Memo for Sales (Josue) and Contracts (Marcelo).

`through` (junction-table filters) is a follow-up. Do not fake assignment-linked Tasks as OR on `vwTasks`.

---

## 12. Out of scope

- Changing CodeGen HTML  
- Per-user suppress of contributions  
- Policy inventing sections  
- PG counterpart (build engineer at release)  
- Sales / Contracts L1 (memo only)

---

## 13. L1 inclusion log — AM review

Inventoried from CodeGen `DisplayInForm` relationships on `bizapps_orders` (Common, Tasks, Orders, Accounting) plus Issues / Committees / Secure Messaging generated entities (those apps are not installed on this DB).

Legend: **P** Primary · **M** More · **N** None · join = same-table OR.

### Person (`MJ_BizApps_Common: People`)

| Related | Join | Inc | Why |
|---|---|---|---|
| Contact Methods | PersonID | **P** | Same-app identity |
| Relationships | FromPersonID | **P** | Outgoing network |
| Relationships | ToPersonID | **M** | Incoming inverse |
| Tasks | CreatedByPersonID | **P** | Only direct Tasks ER (assignee is through Assignments — out of scope) |
| Task Comments / Assignments / Decisions / Activities | * | **N** | Satellites, not the person's work surface |
| Order Headers | BillToPersonID + ShipToPersonID | **P** + `join.any` | One Orders section |
| Order Headers | ShipToPersonID (sibling) | **N** | Owned by the Bill-To join |
| Payment Headers | BillToPersonID | **P** | Money in |
| Subscriptions | BeneficiaryPersonID | **P** | What they hold |
| Customer Payment Methods | OwnerPersonID | **M** | Wallet, not the hero |
| Tax Exemptions, Entitlement Grants, Payment Intents, Price List Assignments, Promotion Codes, Stored Value Accounts | * | **N** | Catalog/audit hang-ons |
| Order Lines / Event Order Lines | * | already DisplayInForm=false | Line-level |
| Issues | ReporterPersonID | **P** | Cases they raised |
| Issues | CreatedByPersonID | **N** | Audit |
| Issue Comments | AuthorPersonID | **N** | Satellite |
| Committees: Memberships | PersonID | **P** | Seats they hold |
| Committees: Attendances | PersonID | **M** | Meeting history |
| Committees: Comments / Votes / Agenda presenter / Artifact uploader | * | **N** | Not a Person-form surface |
| Secure Messaging | (soft PersonID, no hard ER) | — | Custom workspace; no grid to punch |

### Organization

| Related | Join | Inc | Why |
|---|---|---|---|
| Contact Methods | OrganizationID | **P** | Same-app identity |
| Organizations | ParentID | **P** | Children; hierarchy widget claims this |
| Relationships | FromOrganizationID | **P** | Outgoing |
| Relationships | ToOrganizationID | **M** | Incoming inverse |
| Order Headers | BillTo + ShipTo | **P** + `join.any` | One Orders section |
| Payment Headers | BillToOrganizationID | **P** | |
| Subscriptions | HolderOrganizationID | **P** | |
| Customer Payment Methods | OwnerOrganizationID | **M** | |
| Tax Exemptions, Entitlements, Payment Intents, Price List Assignments, Promo Codes, Stored Value | * | **N** | |
| Order Lines | ShipTo | already off | |
| Committees: Committees | OrganizationID | **P** | Committees this org sponsors |

### Task

| Related | Inc | Why |
|---|---|---|
| Tasks (ParentID) | **P** | Sub-tasks (gantt/kanban claims) |
| Task Assignments | **P** | Who is on it |
| Task Dependencies (TaskID) | **P** | Outgoing blockers |
| Task Dependencies (DependsOnTaskID) | **M** | Incoming |
| Comments, Activities, Links, Tag Links, Notification Logs, Decisions | **M** | Working overflow |
| Journal Entry Batches (ApprovalTaskID) | **M** | Accounting hang-on; useful on approval tasks |

### Task Type / Template / Category

| Parent | Related | Inc |
|---|---|---|
| Task Types | Templates | **P** |
| Task Types | Tasks | **M** |
| Task Types | Notification Configs | **M** |
| Task Templates | Template Items | **P** |
| Task Categories | child Categories, Templates | **P** |
| Task Categories | Tasks | **M** |

### Order Header (custom compose, `ShowRelatedEntities: false`)

Punches still ship so a generated/fill-in surface is clean:

| Related | Inc |
|---|---|
| Order Lines | **P** |
| Order Charges, Order Adjustments | **P** |
| Payment Intents, Payment Lines | **M** |
| ReversesOrderHeader, Payment Details, Stored Value Tx, Subscription Events | **N** |

### Payment Header

| Related | Inc |
|---|---|
| Payment Lines (Allocations) | **P** |
| Reversing payments, Stored Value Tx, Subscription Events | **M** |

### Subscription

| Related | Inc |
|---|---|
| Subscription Terms (Coverage Terms) | **P** |
| Entitlement Grants | **P** |
| Events, migrate-from/to, originating Order Lines | **M** |

### Product

| Related | Inc |
|---|---|
| Product Prices, Entitlements, Bundle Items (as bundle) | **P** |
| Order Lines, Subscriptions, kits that include this, Successor, exploded lines, Promotion Targets | **M** |

### Price List / Promotion

| Parent | Related | Inc |
|---|---|---|
| Price Lists | Product Prices, Assignments | **P** |
| Price Lists | Company Policies | **M** |
| Promotions | Codes, Targets | **P** |
| Promotions | Order Adjustments | **M** |

### Journal Entry / Batch / GL / Dimensions

| Parent | Related | Inc |
|---|---|---|
| Journal Entries | Lines | **P** (declared collection). Entity uses `keep-all-primary` |
| Journal Entries | Reverses / ReversedBy | **M** |
| Journal Entries | Order Lines, Payment Headers (posted source) | **N** |
| Journal Entry Batches | Journal Entries | **P** (read-only collection) |
| GL Accounts | child GL Accounts, GL Account Links | **P** |
| GL Accounts | JE Lines, Intercompany DueFrom/DueTo | **M** / **N** for the inverse DueTo |
| Dimensions | Dimension Values | **P** |
| Dimensions | link/JE/order line dimension tags | **M** |
| Currencies | Spot Rates | **P** |
| Currencies | Company Profiles, GL Accounts, JE Lines | **N** |
| Tax Jurisdictions | Rates, child jurisdictions | **P** |
| Tax Jurisdictions | Nexus, Liabilities | **M** |

### Issue

| Parent | Related | Inc |
|---|---|---|
| Person | Issues Reporter | **P** |
| Person | Issues CreatedBy, Issue Comments | **N** |
| Issues | Issue Comments | **P** |

### Committee / Meeting

| Parent | Related | Inc |
|---|---|---|
| Person | Memberships | **P** |
| Person | Attendances | **M** |
| Person | Comments, Votes, presenter, uploader | **N** |
| Organization | Committees | **P** |
| Committees | Memberships, Meetings, child Committees | **P** |
| Committees | Artifacts | **M** |
| Meetings | Agenda Items, Attendances, Minutes | **P** |
| Meetings | Motions, Artifacts | **M** |

### Secure Messaging

No hard FK from SM rows to People/Organizations (`PersonID` on messages is a soft reference). The app owns a custom workspace. **No Person/Org grid punches.** Thread form: Messages **P**, Files **M**, File Requests **M**.

### Sales / Contracts

Not decorated in this pass. Memo for Josue / Marcelo.
