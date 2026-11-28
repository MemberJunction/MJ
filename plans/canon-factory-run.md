# Canon factory run: build the open Canon work with the Software Factory

One run of the BizApps Software Factory builds the open Canon work on an integration branch, and it merges to `next` once, at the end.

## Status

- **Status**: Draft for the sponsor's rulings. Nothing starts until the [decision sheet](#decision-sheet) is ruled and the [preconditions](#preconditions-people-only) are set.
- **Created**: 2026-11-28
- **Sponsor**: Amith Nagarajan (`AN-BC`). **Development lead**: `rkihm-BC`.
- **What it builds**: the open items of [`canon-master-plan.md`](canon-master-plan.md), phases U1 to U6 of [`canon-unification.md`](canon-unification.md), and the `canon` issues listed under [Scope](#scope).
- **What runs it**: [`MemberJunction/bizapps-software-factory`](https://github.com/MemberJunction/bizapps-software-factory), started by the sponsor from a local workspace.
- **Second purpose**: this is the Software Factory's largest run on MJ core so far, so it is also a test of the factory. [What we measure](#what-we-measure) says how it is judged.
- **Where to discuss**: comments on this plan's pull request.

## Why run it this way

The master plan paced Canon work around people's time: owners, due dates, a monthly review that decides. The sponsor's direction on 2026-11-28 changes that. The factory builds; people rule on design up front, then test and refine what it built. People stop being the step everything waits for.

Two facts about the factory shape the run:

- **It executes a spec; it does not make design decisions.** Its own retrospective records that its planner invents requirements when a spec is vague. So every open Canon decision is ruled before the run starts, in the decision sheet below.
- **Its merge gate sends protected paths to a person.** Any diff touching `migrations/`, `metadata/`, `.github/`, `package.json`, the lockfile, `CLAUDE.md` or an `auth` or `security` folder needs a human sign-off. Nearly every Canon phase touches one of these. The integration branch below is how the run avoids a sign-off per slice.

## How the run works

1. **One integration branch**, `canon/factory-run`, cut from `next`. Every factory slice targets it (the factory takes an explicit target branch per repository). Nothing reaches `next` until the final merge.
2. **Slices merge into the integration branch without a person**, under an owner-signed, time-limited policy exception scoped to this project and this branch. The exception does not apply to `next`.
3. **Schema can change during the run.** Nothing on the integration branch has shipped, so a migration written in an early wave can be edited or replaced by a later one. Schema still goes first in each wave, so CodeGen has produced the typed properties before code is written against them.
4. **CI on every merge.** MJ's workflows run only for pull requests into `next`. A draft pull request from `canon/factory-run` into `next` stays open for the whole run, so each merge into the branch runs the full pull-request checks. The factory's own checks (build, unit tests, the integration tier on a scratch database) run per slice as well.
5. **`next` is merged into the branch daily.** Generated files and class manifests are regenerated after each merge, never merged by hand.
6. **One approval, at the end.** Before the final merge the run's migrations are replaced by one migration stamped after everything on `next`, with one CodeGen run and one metadata sync. The sponsor approves that one pull request into `next`.
7. **People test the branch while it is built.** Each person in [Who tests what](#who-tests-what) works against a database built from the branch and files findings as comments on the draft pull request. A finding becomes a factory remediation slice, not a hand fix.

The final pull request will be too large to review by reading. Its safeguards are the frozen acceptance tests, the integration tier, and the testers. That is a deliberate trade, and it is why the access-control tests in [Tests that cannot be traded away](#tests-that-cannot-be-traded-away) are fixed here and not left to the factory's planner.

## Preconditions (people only)

The factory refuses to let a model do any of these.

| # | What | Who |
|---|---|---|
| 1 | Rule on the decision sheet. | Sponsor |
| 2 | Create `canon/factory-run` and the draft pull request into `next`. | Sponsor |
| 3 | For this project on `MemberJunction/MJ`: shadow mode off, auto-merge allowed, target branch `canon/factory-run`. | Sponsor |
| 4 | Sign the policy exception for protected paths, scoped to this project and branch, expiring when the run ends. | Sponsor |
| 5 | Approve each frozen plan with upfront auto-merge. The approval is bound to the plan's hash, so a changed plan needs it again. | Sponsor |
| 6 | Three model vendors, or distinct model families, enrolled, so builder, reviewer and validator are never the same. | Sponsor |
| 7 | Label the gold-set corpus for [MJ 6997](https://github.com/MemberJunction/MJ/issues/6997): 10 to 20 documents, with the concepts and edges a person expects. The factory can draft labels; a person confirms them. | `cmbrock-BC` |

`next` requires one approving review, and the factory's pull requests into `next` have merged under the sponsor's account without one ([MJ 6970](https://github.com/MemberJunction/MJ/pull/6970)). In this run only the final pull request goes to `next`, and the sponsor reviews it.

## Scope

**In:**

- Canon unification phases U1 to U6.
- Workstream 5: [MJ 6723](https://github.com/MemberJunction/MJ/issues/6723) (5b), [MJ 6724](https://github.com/MemberJunction/MJ/issues/6724) (5c), [MJ 6725](https://github.com/MemberJunction/MJ/issues/6725) (5d), [MJ 6837](https://github.com/MemberJunction/MJ/issues/6837) (5a follow-ups).
- [MJ 6757](https://github.com/MemberJunction/MJ/issues/6757) (authority per concept), [MJ 6996](https://github.com/MemberJunction/MJ/issues/6996) (resolution by meaning), [MJ 6997](https://github.com/MemberJunction/MJ/issues/6997) (gold-set eval), [MJ 6998](https://github.com/MemberJunction/MJ/issues/6998) (effective dates).
- From [MJ 6213](https://github.com/MemberJunction/MJ/pull/6213), only what Canon depends on: the proposal ledger (its sections 3.2 to 3.4), `MJ: AI Agent Context Items` (3.6) and the precedence order (4).
- The Canon guide brought up to date, gap-alert logging, and the Canon owners list.

**Out of this run:**

- **Living Canon** ([`living-canon-continuous-ingest.md`](living-canon-continuous-ingest.md)). It needs Slack, Teams and mail credentials the factory's builders do not hold, and an error in its screening is a leak. It gets its own run after this one.
- **The rest of MJ 6213** (dreaming, verification, skill drafting, the harness refiner). A second run, once `arie-glazier-bcc` has reconciled it with the unification plan.
- **The Skip repositories.** [Skip client 50](https://github.com/BlueCypress/Skip-Client-Open-App/pull/50), [Skip-Brain 677](https://github.com/BlueCypress/Skip-Brain/pull/677) and [Skip-Brain 612](https://github.com/BlueCypress/Skip-Brain/pull/612) are merged by `jordanfanapour` and `MS-BC`.
- **[MJ 6956](https://github.com/MemberJunction/MJ/issues/6956)** (path ranking) unless [MJ 6932](https://github.com/MemberJunction/MJ/pull/6932) has merged by wave 6.
- Taxonomy import, portable bundles ([MJ 6811](https://github.com/MemberJunction/MJ/issues/6811)), metric triggers, Canon over MCP, and the stewards' review queue in the Graph Explorer.

## Decision sheet

Each row has a recommended answer. The sponsor marks each Accept or writes a change. A ruled sheet replaces the decisions the December 3 review was going to make; the review becomes a review of the run.

| # | Question | Recommended answer | Schema |
|---|---|---|---|
| D1 | Is Canon a property of approved, visible members, read through a `CanonState` read-model (unification decision 1)? | Yes. No new column; adapters map each kind's own lifecycle. | None |
| D2 | Edge direction for `Defines`, `Measures`, `Describes`, `Implements`. | Confirm artifact → concept, as shipped in [MJ 6842](https://github.com/MemberJunction/MJ/pull/6842). | None |
| D3 | Per-graph permissions (5b): how are they stored? | A `MJ: Graph Permissions` table modelled on `MJ: Search Scope Permissions`, with Read, Use and Approve, registered as a permission domain. `Graph: Approve Edges` stays as the all-graphs grant. | New table |
| D4 | Default grants on graphs (5b). | `MJ Canon` stays readable by the UI role, as today. A new graph grants nothing until someone grants it. The UI role keeps read on the type tables. | Seed rows |
| D5 | Do search-scope permissions also move into the permission engine (unification decision 3)? | Not in this run. [MJ 6910](https://github.com/MemberJunction/MJ/pull/6910) just made their resolver pluggable; moving them is a separate change with its own risk. Graphs use the new table; search scopes stay as they are. | None |
| D6 | One visibility rule (U3): what does it cover? | `ResolveVisibility` in core, called by search's origin gate, the graph's provenance policies, and the delegated document permissions from [MJ 6970](https://github.com/MemberJunction/MJ/pull/6970). | None |
| D7 | Concept visibility through plain reads (5c). | A server-side read rule on `MJ: Graph Concepts` applies the same decision as the graph engine, so a `RunView` cannot return text the engine would hide or redact. | None |
| D8 | A `Graph` lane on search scopes (unification decision 4). | Yes: a `MJ: Search Scope Graphs` child table. An empty table means no graph. `ScopeConfig.graphNames` is read only as a fallback. | New table |
| D9 | One `CanonContextResolver` (unification decision 5). | Yes, with MJ 6213's precedence order enforced there and one budget per run. | None |
| D10 | Does the resolver's budget replace per-scope `MaxResults`? | No. It sits above it as a cap. | None |
| D11 | Citation format. | The shipped inline token, `[[MJ: Graph Concepts\|ID\|Name]]` ([MJ 6963](https://github.com/MemberJunction/MJ/pull/6963)), parsed by the shipped parser. Not a second "short-ID" format. Citing is required by the resolver's contract. | None |
| D12 | The proposal ledger (master plan decision 2). | Build MJ 6213's learning-cycle proposal tables and proposal sources as drafted there, corrected to the shipped statuses and tiers (decision 5). Until that slice lands, proposers write `Proposed` graph rows directly, as [MJ 6667](https://github.com/MemberJunction/MJ/pull/6667) does. | New tables |
| D13 | Retrieval traces. | Build `MJ: AI Agent Context Items` as drafted in MJ 6213 section 3.6. | New table |
| D14 | Amend master plan decision 6 to resolution by meaning ([MJ 6996](https://github.com/MemberJunction/MJ/issues/6996))? | Yes. Three outcomes; every outcome is a proposal; a match to a rejected concept stays rejected. Concept vectors come from MJ's existing entity vector sync. | None |
| D15 | May a confident "same concept" be applied without a reviewer? | No. It is proposed as a synonym and a person approves it. Revisit after the gold set shows the error rate. | None |
| D16 | Effective dates ([MJ 6998](https://github.com/MemberJunction/MJ/issues/6998)). | Nullable `EffectiveFrom` and `EffectiveTo` on `MJ: Graph Concepts` only. Edges get them later if a case needs it. An expired concept stays `Approved`; the resolver answers as of today unless given a date. | Two columns |
| D17 | Authority per concept ([MJ 6757](https://github.com/MemberJunction/MJ/issues/6757)). | Add the `AuthoritativeFor` edge type and a nullable `AuthorityTierID` on `MJ: Graph Edges`. When a source's tier and an edge's tier disagree for a concept, the edge wins, because it is the more specific statement. | One column, seed rows |
| D18 | [MJ 6837](https://github.com/MemberJunction/MJ/issues/6837), item 1: governing `Origin`. | Invert the rule so every column except `Status` is governed, with a test that fails when a new column is not. | None |
| D19 | MJ 6837, item 2: stranded concepts. | Option (c): the concept gate accepts the retraction scope for a pipeline-originated concept, and the retractor checks the delete before removing edges. | None |
| D20 | Stale members (an approval whose definition changed). | Hidden by default. Configurable per graph as a ceiling; an agent may only be stricter. | None |
| D21 | Are dashboards and user views Canon members? | Not in this run. Components and queries only. | None |
| D22 | Tags. | Derived `Tagged` edges from a provider, never stored, and tags are never members. Steering a question by tag is left out of this run. | None |
| D23 | Concept profiles for the most-connected concepts. | Yes, as proposed `Specification` drafts with every fact linked to a `SourcedFrom` chunk, through the ledger. | None |
| D24 | Who decides schema between monthly reviews? | The sponsor, by ruling this sheet. Master plan governance rule 5 is amended to say so. | None |
| D25 | Does the run write PostgreSQL migrations? | No. MJ's rule is that a feature pull request ships the T-SQL migration only and the build engineer converts at release. The factory's PostgreSQL step is switched off for this project. (It did write one in [MJ 6970](https://github.com/MemberJunction/MJ/pull/6970), which is the exception this ruling avoids repeating.) | None |

## Waves

Slices in a wave are independent of each other. A wave starts when the one before it has merged into the integration branch. "Done when" is the frozen acceptance test for the slice; the factory adds its standard unit-test, integration-test and documentation requirements to each.

### Wave 0: foundation

| Slice | What | Done when |
|---|---|---|
| 0.1 | Schema: `MJ: Graph Permissions`, `MJ: Search Scope Graphs`, the proposal ledger tables, `MJ: AI Agent Context Items`, `EffectiveFrom` and `EffectiveTo` on concepts, `AuthorityTierID` on edges. CodeGen. | A database builds from migrations alone; generated classes exist for every new table and column. |
| 0.2 | Metadata: the `AuthoritativeFor` edge type and its endpoint rows, the graph permission domain, default grants per D4. | The edge-type registry test passes; a new graph is unreadable by a UI-role user until granted. |
| 0.3 | MJ 6837, both items, per D18 and D19. | A new ungoverned column fails a test; deleting a source document leaves no edgeless approved concept. |
| 0.4 | The Canon guide: path finding, `RenderCanonDocument`, the approval gate, the ambiguity codes, redaction, the edge direction contract and the two edge-fix Record Processes hosts run after upgrading. | Every public method of `GraphEngine` and `CanonGraphEngine` named in the guide exists, and each shipped feature above has a section. |
| 0.5 | The gold-set scorer for MJ 6997, in the weekly live-model tier, scoring after synonym and `Same As` resolution. | The scorer reports precision and recall for concepts and edges on the labeled corpus, and the baseline is recorded. |
| 0.6 | Gap alerts: log `NO_MATCH` and `AMBIGUOUS_CONCEPT` results from `Get Graph Context`. | A question with no match produces one row a steward can list. |

### Wave 1: membership and lookups

| Slice | What | Done when |
|---|---|---|
| 1.1 | U1: `BaseCanonMemberAdapter` and an adapter per kind; `GraphEngine` reads `CanonState`; approval state wired for fingerprinted kinds. Stale policy per D20. | A query edited after approval disappears from `CanonContext` and reappears when re-approved. |
| 1.2 | 5d (MJ 6725): every lookup by name takes a graph. | With the same concept name in two graphs, each caller gets the one in their graph; an `Approved` row is never shadowed by a `Draft` one. |

### Wave 2: reach

| Slice | What | Done when |
|---|---|---|
| 2.1 | U2: derived providers for components, approved action code, active skills and saved flow agents. Tags per D22. | Each kind is reachable from a concept in `MJ Canon` with no stored edge. |
| 2.2 | Authority per concept (MJ 6757), per D17. | Two sources with opposite authority on two concepts rank correctly for each concept. |
| 2.3 | Effective dates in the engine, per D16. | A question as of a past date returns the concept in effect then; a question with no date returns the current one. |

### Wave 3: access control

| Slice | What | Done when |
|---|---|---|
| 3.1 | U3: `ResolveVisibility` in core, called by search, the graph and delegated document permissions, per D6. Visibility audit events. | One test suite runs the same fixtures through search and through the graph and gets the same answers, for one reader and for an audience. |
| 3.2 | 5b (MJ 6723): Read, Use and Approve checked per graph, per D3. | A user granted Approve on one graph cannot approve in another; a user with no Read cannot resolve the graph by name. |
| 3.3 | 5c (MJ 6724): the read rule on concepts, per D7. | Every test in [Tests that cannot be traded away](#tests-that-cannot-be-traded-away) passes. |

Wave 3 is the one wave whose merged result `cmbrock-BC` tests by hand before wave 4 starts.

### Wave 4: scope and retrieval

| Slice | What | Done when |
|---|---|---|
| 4.1 | U4: the `Graph` lane and `MJ: Search Scope Graphs`; `ExplainScope` reports graphs. | A scope with no graph rows reaches no graph. |
| 4.2 | The ledger write path: every proposer writes through it and the `Proposed` graph row links back to its proposal, per D12. | A proposal from each proposer appears in the ledger and as a linked `Proposed` row; rejecting it leaves the graph row rejected. |
| 4.3 | U5: `CanonContextResolver`, the five existing routes behind a flag, precedence, one budget, citations per D11, context items per D13. | With the flag on, the deterministic integration tier passes; a fixed fixture's prompt contains each concept once; a cited concept produces a `Cited` row. |

### Wave 5: training quality

| Slice | What | Done when |
|---|---|---|
| 5.1 | Resolution by meaning (MJ 6996), replacing the word-overlap match in `ConceptSeedClustering`, per D14 and D15. | Gold-set recall improves on the wave 0 baseline with no loss of precision; a candidate matching a rejected concept writes nothing. |
| 5.2 | Concept profiles, per D23. | Every fact in a generated profile links to a source chunk the reviewer can open. |

### Wave 6: health

| Slice | What | Done when |
|---|---|---|
| 6.1 | U6: the Canon scorecard as a scheduled job, with stale approvals, unused members, rejected proposals per proposer, open contradictions, gap alerts and extraction quality. | The first report is produced on a database built from the branch. |
| 6.2 | MJ 6956, only if MJ 6932 has merged. | As that issue states. |

### Final merge

1. Replace the run's migrations with one migration stamped after everything on `next`; run CodeGen once; add the changeset (`minor`, since the run ships a migration and metadata).
2. Run the full integration tier from an empty database, as MJ's CI does.
3. Mark the draft pull request ready. The sponsor reviews the decision sheet against what was built and approves.
4. Update the master plan, close the issues the run built, and record the measurements.

## Tests that cannot be traded away

These are written into the frozen plans for waves 3 and 4. The factory may add tests; it may not remove or weaken these. Each runs as a restricted user and was seen to fail before the fix.

1. A concept synthesized only from documents the reader cannot see is hidden: its name, synonyms, description and specification never reach the reader, through the graph engine, `Get Graph Context`, a plain `RunView`, search, or a rendered Canon document.
2. A concept with some visible sources is redacted, not shown.
3. A concept sourced from a document attached to a record the reader cannot see is hidden (the delegated permissions from MJ 6970).
4. In a shared room, a concept is shown only if every reader can see it.
5. A user with no Read on a graph cannot resolve it by name, traverse it, or see its concepts in search.
6. A user with Approve on one graph cannot approve, reject or deprecate in another.
7. The context resolver never places a hidden concept's text in a prompt, and writes the visibility outcome to the context item.
8. No proposer writes an `Approved` row, and no proposer writes at all unless asked to.

## What we measure

Recorded per slice, and summed for the run:

| Measure | Why |
|---|---|
| Model spend and wall-clock time | What the run costs |
| Remediation rounds, and how each ended | Whether the review loop converges on this codebase |
| Minutes of a person's time, by person | Whether people really moved from writing to testing |
| Findings by testers after a slice merged, by severity | What the factory's own gates miss |
| Slices re-planned because the spec was unclear | How good the specs were |
| Schema changes after wave 0 | Whether deciding schema first was right |
| Gold-set precision and recall, wave 0 against wave 5 | Whether Canon's training got better |
| Whether `next` stayed green after the final merge | The result that matters |

The run counts as a success for the factory if the final merge leaves `next` green, no access-control finding of High or above is found after it, and people's time is mostly testing.

## Who tests what

| Person | Tests |
|---|---|
| `rkihm-BC` | Leads the final review; rules on findings that need a design answer. |
| `cmbrock-BC` | Wave 3 by hand as restricted users, using View As User ([MJ 6958](https://github.com/MemberJunction/MJ/pull/6958)); the gold set; the Content Pipeline slices. |
| `arie-glazier-bcc` | The ledger, context items and precedence against MJ 6213, so the second run can build on them. |
| `ct-bc` | DBAutoDoc proposing a concept through the ledger (decision 7). |
| `MS-BC` | `RenderCanonDocument` and Skip's consumption of the context resolver; MJ 6956. |
| `jordanfanapour` | The runtime and agent surface: `Get Graph Context`, path finding, the graph lane. |

## Risks

| Risk | What limits it |
|---|---|
| The final pull request is too large to read | Frozen acceptance tests, the integration tier, testers on the branch throughout |
| The branch drifts from `next` | Daily merge; generated files regenerated, never hand-merged |
| The factory's planner invents requirements | The decision sheet and the "done when" tests are the spec; a slice that needs an unruled decision stops and asks |
| A wrong access-control merge | Wave 3 is tested by hand before wave 4; the eight tests above are frozen |
| Other Canon work lands on `next` during the run and collides | The master plan's freeze on new Canon pull requests stays until the final merge; Canon owners review any change under the Canon paths |
| Cost runs away | The factory's per-task and per-project caps; a slice that stalls stops and is reported |

## References

- [`canon-master-plan.md`](canon-master-plan.md), [`canon-unification.md`](canon-unification.md), [`living-canon-continuous-ingest.md`](living-canon-continuous-ingest.md)
- [MJ 6213](https://github.com/MemberJunction/MJ/pull/6213): memory, learning cycles and Canon precedence
- [`MemberJunction/bizapps-software-factory`](https://github.com/MemberJunction/bizapps-software-factory): how it works, configuration, and its cross-repository and protected-path rules
- [`guides/CANON_AND_SEMANTIC_GRAPHS_GUIDE.md`](../guides/CANON_AND_SEMANTIC_GRAPHS_GUIDE.md)

## Change log

| Date | Change |
|---|---|
| 2026-11-28 | Draft created for the sponsor's rulings. |
