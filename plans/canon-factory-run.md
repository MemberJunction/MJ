# Canon factory run: build all open Canon work with the Software Factory

One run of the BizApps Software Factory builds everything open on Canon, on an integration branch that merges to `next` once, at the end.

## Status

- **Status**: Ruled, 2026-11-28. The sponsor accepted the [decision sheet](#decision-sheet). The run starts when the [preconditions](#preconditions-people-only) are set.
- **Created**: 2026-11-28
- **Sponsor**: Amith Nagarajan (`AN-BC`).
- **What it builds**: every open item of [`canon-master-plan.md`](canon-master-plan.md), phases U1 to U6 and Rule 6 of [`canon-unification.md`](canon-unification.md), all of [MJ 6213](https://github.com/MemberJunction/MJ/pull/6213), and the `canon` issues and backlog listed under [Scope](#scope).
- **What runs it**: [`MemberJunction/bizapps-software-factory`](https://github.com/MemberJunction/bizapps-software-factory), on the sponsor's local instance. Carbon and Neon models build; Fable reviews adversarially.
- **The team**: paused on Canon for the run. They test after the merge to `next`.
- **Second purpose**: this is the factory's largest run on MJ core, so it is also a test of the factory. [What we measure](#what-we-measure) says how it is judged.

## Why run it this way

The sponsor's note to the team on 2026-11-28 sets the direction. Canon had been built in pieces by several people, coordinated by a plan, dates and a monthly review. That split was needed when people wrote the code. With the factory it is not, and the pieces had become the problem: no one could say the whole worked end to end. So the work is pulled back, the factory builds all of it in one run, and the result is presented to the team once it is on `next`, for them to test.

The run also adds the piece that was missing from every plan: **measuring whether Canon makes answers and outcomes better**, and letting that evidence drive what is promoted.

Two facts about the factory shape the run:

- **It executes a spec; it does not make design decisions.** Its own retrospective records that its planner invents requirements when a spec is vague. So every open Canon decision is ruled in the decision sheet below, before the run starts.
- **Its merge gate sends protected paths to a person.** Any diff touching `migrations/`, `metadata/`, `.github/`, `package.json`, the lockfile, `CLAUDE.md` or an `auth` or `security` folder needs a human sign-off. Nearly every Canon slice touches one. The integration branch below is how the run avoids a sign-off per slice.

## How the run works

1. **One integration branch**, `canon/factory-run`, cut from `next`. Every slice targets it. Nothing reaches `next` until the final merge.
2. **Slices merge into the integration branch without a person**, under an owner-signed, time-limited policy exception granted to this project's delivery policy. The factory scopes an exception by project, not by branch, so this project targets only the integration branch.
3. **Schema can change during the run.** Nothing on the branch has shipped, so a migration from an early wave can be edited or replaced later. Schema still goes first in each wave, so CodeGen has produced the typed properties before code is written against them.
4. **CI on every merge.** MJ's workflows run only for pull requests into `next`. A draft pull request from `canon/factory-run` into `next` stays open for the whole run, so each merge into the branch runs the full checks. The factory's own checks run per slice as well.
5. **`next` is merged into the branch daily.** Generated files and class manifests are regenerated after each merge, never merged by hand.
6. **Review during the run is by Claude.** The factory raises each wave for review; Claude (Fable) reviews the merged diff against this plan, the decision sheet and the frozen tests, and its findings go back to the factory as remediation slices. This repeats until a wave is clean.
7. **One approval, at the end.** Before the final merge the run's migrations are replaced by one migration stamped after everything on `next`, with one CodeGen run and one PostgreSQL conversion. The sponsor approves that one pull request.
8. **Then the team.** After the merge the sponsor presents the result, the team tests it, and a retrospective plans how they are involved from there.

No person outside the sponsor sees this work before it is on `next`. Three things stand in for that: the frozen tests in [Tests that cannot be traded away](#tests-that-cannot-be-traded-away); a reviewer that is a different model from the builders; and the rule that **every new behaviour ships switched off** (see [What ships switched off](#what-ships-switched-off)), so merging changes nothing for a host until someone turns a setting on.

## Preconditions (people only)

The factory refuses to let a model do any of these.

| # | What |
|---|---|
| 1 | Create `canon/factory-run` and the draft pull request into `next`. |
| 2 | For this project on `MemberJunction/MJ`: shadow mode off, auto-merge allowed, target branch `canon/factory-run`. |
| 3 | Sign the policy exception that waives the protected-path rule for this project's delivery policy, expiring when the run ends. |
| 4 | Approve each frozen plan with upfront auto-merge. The approval is bound to the plan's hash, so a changed plan needs it again. |
| 5 | Enrol the builder and reviewer models so builder, reviewer and validator are never the same model family. |
| 6 | Spot-check the labels of the gold set and the answer evaluation set. A model that is not the extractor drafts them from the demo corpus; the sponsor checks a sample; the team audits them after the merge. |

## Scope

**In:**

- Canon unification phases U1 to U6, and Rule 6 (promotion and evidence).
- All of [MJ 6213](https://github.com/MemberJunction/MJ/pull/6213), per D27.
- Workstream 5: [MJ 6723](https://github.com/MemberJunction/MJ/issues/6723) (5b), [MJ 6724](https://github.com/MemberJunction/MJ/issues/6724) (5c), [MJ 6725](https://github.com/MemberJunction/MJ/issues/6725) (5d), [MJ 6837](https://github.com/MemberJunction/MJ/issues/6837) (5a follow-ups).
- [MJ 6757](https://github.com/MemberJunction/MJ/issues/6757) (authority per concept), [MJ 6996](https://github.com/MemberJunction/MJ/issues/6996) (resolution by meaning), [MJ 6997](https://github.com/MemberJunction/MJ/issues/6997) (gold-set eval), [MJ 6998](https://github.com/MemberJunction/MJ/issues/6998) (effective dates), [MJ 6956](https://github.com/MemberJunction/MJ/issues/6956) (path ranking) with [MJ 6932](https://github.com/MemberJunction/MJ/pull/6932) (index metadata) finished first.
- The master plan's backlog: the stewards' review queue, learning from usage, gap alerts, the workflow health job, triggers on a Canon metric, taxonomy import and portable bundles ([MJ 6811](https://github.com/MemberJunction/MJ/issues/6811)).
- The Canon guide brought up to date, the Canon owners list, and MJ's written rule on PostgreSQL migrations (D26).
- The Canon parts of [Skip client 50](https://github.com/BlueCypress/Skip-Client-Open-App/pull/50) and [Skip-Brain 677](https://github.com/BlueCypress/Skip-Brain/pull/677), per D40; [Skip-Brain 612](https://github.com/BlueCypress/Skip-Brain/pull/612) closes with them.

**Out, and why:**

- **Living Canon's connectors, directory sync, screening and delegated agents** ([`living-canon-continuous-ingest.md`](living-canon-continuous-ingest.md), workstreams A to E). They need Slack, Teams and mail credentials the factory's builders do not hold, and they cannot be tested without a live workspace. Its graduated autonomy (workstream F) is in, as part of Rule 6.
- **Canon over MCP.** It waits on MJ's MCP hosting work, which is not merged.

## What ships switched off

Each of these merges with its setting off, so a host behaves as before until someone turns it on:

- approval by policy or by the AI reviewer, for every class (D30)
- publishing by a non-human approval (D31)
- the random holdout (D34)
- dreaming and the harness refiner (D27)
- the Canon context resolver replacing the five existing routes (it sits behind a flag and is compared first)
- retrospective proposals (D36)

## Decision sheet

**Ruled 2026-11-28.** The sponsor accepted D1 to D24 as written and reversed D25 on `cmbrock-BC`'s suggestion. D26 to D40 record what the sponsor then agreed in discussion the same day. The sheet replaces the decisions the December 3 review was going to make.

| # | Question | Ruling | Schema |
|---|---|---|---|
| D1 | Is Canon a property of approved, visible members, read through a `CanonState` read-model (unification decision 1)? | Yes. No new column; adapters map each kind's own lifecycle. | None |
| D2 | Edge direction for `Defines`, `Measures`, `Describes`, `Implements`. | Confirm artifact → concept, as shipped in [MJ 6842](https://github.com/MemberJunction/MJ/pull/6842). "Artifact" here means whatever defines, measures, describes or implements a concept (a view, a query, a document, a skill), not an `MJ: Artifacts` record. The edge links the two; nothing is promoted by it. | None |
| D3 | Per-graph permissions (5b): how are they stored? | A `MJ: Graph Permissions` table modelled on `MJ: Search Scope Permissions`, with Read, Use and Approve, registered as a permission domain. `Graph: Approve Edges` stays as the all-graphs grant. | New table |
| D4 | Default grants on graphs (5b). | `MJ Canon` stays readable by the UI role, as today. A new graph grants nothing until someone grants it. The UI role keeps read on the type tables. | Seed rows |
| D5 | Do search-scope permissions also move into the permission engine (unification decision 3)? | Not in this run. [MJ 6910](https://github.com/MemberJunction/MJ/pull/6910) just made their resolver pluggable; moving them is a separate change with its own risk. Graphs use the new table; search scopes stay as they are. | None |
| D6 | One visibility rule (U3): what does it cover? | `ResolveVisibility` in core, called by search's origin gate, the graph's provenance policies, and the delegated document permissions from [MJ 6970](https://github.com/MemberJunction/MJ/pull/6970). | None |
| D7 | Concept visibility through plain reads (5c). | A server-side read rule on `MJ: Graph Concepts` applies the same decision as the graph engine, so a `RunView` cannot return text the engine would hide or redact. | None |
| D8 | A `Graph` lane on search scopes (unification decision 4). | Yes: a `MJ: Search Scope Graphs` child table. An empty table means no graph. `ScopeConfig.graphNames` is read only as a fallback. | New table |
| D9 | One `CanonContextResolver` (unification decision 5). | Yes, with MJ 6213's precedence order enforced there and one budget per run. | None |
| D10 | Does the resolver's budget replace per-scope `MaxResults`? | No. It sits above it as a cap. | None |
| D11 | Citation format. | The shipped inline token, `[[MJ: Graph Concepts\|ID\|Name]]` ([MJ 6963](https://github.com/MemberJunction/MJ/pull/6963)), parsed by the shipped parser. Not a second "short-ID" format. Citing is required by the resolver's contract. | None |
| D12 | The proposal ledger (master plan decision 2). | Build MJ 6213's learning-cycle proposal tables and proposal sources as drafted there, corrected to the shipped statuses and tiers (decision 5). `arie-glazier-bcc` reviews the ledger schema during wave 0, since wave 4 builds on it. Until that slice lands, proposers write `Proposed` graph rows directly, as [MJ 6667](https://github.com/MemberJunction/MJ/pull/6667) does. | New tables |
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
| D25 | Does the run write PostgreSQL migrations? | Yes (reversed from the draft, on `cmbrock-BC`'s suggestion). Each slice that adds a migration runs the `pg-migrate-v2` skill: the deterministic converter, a model finishing the small residue the converter marks for hand work, and proof by applying the result to a fresh PostgreSQL database. This is a stated exception, for this run, to MJ's rule that a feature pull request ships the T-SQL migration only; the frozen plans say so, so builders do not get two instructions. | None |
| D26 | Should MJ's written rule on PostgreSQL migrations change for everyone, not only this run? | Yes. A pull request that adds a migration ships its PostgreSQL migration, produced and proven by the `pg-migrate-v2` skill. Slice 0.9 updates `CLAUDE.md`, `AGENTS.md` and `migrations/CLAUDE.md`. | None |
| D27 | Does this run take over and finish [MJ 6213](https://github.com/MemberJunction/MJ/pull/6213) (memory, learning cycles, Canon precedence)? | Yes, all five of its phases, reconciled to the master plan: shipped statuses plus `Provisional` (D28), no `Canonical` or `Disputed` status, a canonical note is a behaviour rule only (decision 4), and promotion follows Rule 6 of the unification plan. Dreaming and the harness refiner ship switched off, with their cost cap. | Its five schema changes |
| D28 | A `Provisional` status for concepts and edges? | Yes. A provisional item is in use but not ratified: agents may use it, it ranks below `Approved`, it is labelled as provisional wherever it is shown, and it has a review-by date on its ledger row. | One status value on each |
| D29 | An impact ranking? | Yes. Every proposal carries a computed Impact (Low, Medium, High, Critical) and Confidence, stored on its ledger row with the inputs that produced them. Authority tiers stay what they are: trust in a source, not the cost of being wrong. | Ledger columns |
| D30 | Who may approve without a person? | Nobody, until an org says so. Every class of decision starts in Review, with the AI reviewer recording what it would have decided. A person switches a class to Auto with audit or Auto, with the class's record in front of them. The system never raises a threshold or switches a class by itself. | Settings rows |
| D31 | Does an approval made by policy or by the AI reviewer publish a concept to readers who cannot see its sources? | No by default. It is a setting per graph, off as shipped, that an org may turn on. Only a person's approval publishes unless that setting is on. | One setting |
| D32 | What can never be approved automatically, whatever the settings? | Policy and Process concepts; anything that contradicts or supersedes an approved concept; anything whose evidence traces to an untrusted outside source; and anything in a graph shown to outside users, unless the org has opted that graph in. | None |
| D33 | What does a reviewer see? | A review brief on every request: what is proposed, the evidence with links, what depends on it, the case for and against, and a recommendation. The reviewer accepts, overrules or edits; similar requests are batched. The reviewing model is never the proposing model. | Ledger columns |
| D34 | How do we know a Canon item helped? | The evidence ladder from [MJ 6213](https://github.com/MemberJunction/MJ/pull/6213), applied to concepts: shown, cited, correlated with better runs, replayed with and without it, and withheld from a random share of runs. Replay is the main evidence; the random holdout is read per class, never per concept, because one concept sees too few runs. A human-approved Policy concept is never withheld. | None beyond D13 |
| D35 | How do we know Canon improves answers at all? | An answer evaluation set per graph: fixed questions with known right answers, scored with Canon on and off in the weekly live-model tier. A user's correction of an agent's answer can be added as a case. | None |
| D36 | May Canon propose changes to itself from how it is used? | Yes, through the same ledger as every proposer: a concept retrieved but never cited gets a rewrite proposed, one cited and then corrected gets a revision proposed, and clusters of unanswered questions become new concept proposals. | None |
| D37 | Contradictions. | The resolution step gains a fourth outcome, *conflicts with*, written as a proposed `Contradicts` edge. A scheduled sweep checks approved concepts against each other. A contradiction always goes to a person, and an agent asked about either side says the two disagree. | None |
| D38 | At what size do we prove the graph works? | 250,000 concepts and 2,000,000 edges in one graph. This is the size the load test runs at, not a limit: nothing in the code enforces a maximum, and a larger graph is allowed. The sponsor may change the number. To get there the engine loads a graph when it is asked for, not every graph in every process, and the browser never holds a whole graph. | None |
| D39 | What does the team do during the run? | Nothing on Canon. Work on every Canon pull request and issue is paused; the December 1 close-out and the December 3 review are superseded. The team tests after the merge to `next`, and the retrospective plans how they get involved. | None |
| D40 | The Skip repositories. | The run finishes the Canon parts of Skip client 50 and Skip-Brain 677 if they are still open. `jordanfanapour` and `MS-BC` merge there, as always. | None |

## Waves

Slices in a wave are independent of each other. A wave starts when the one before it has merged into the integration branch and its review is clean. **Wave 0 is the pilot**: its measurements are looked at before wave 1 is released. "Done when" is the frozen acceptance test for a slice; the factory adds its standard unit-test, integration-test and documentation requirements to each.

### Wave 0: foundation

| Slice | What | Done when |
|---|---|---|
| 0.1 | Schema for the whole run: `MJ: Graph Permissions`; `MJ: Search Scope Graphs`; the five schema changes of [MJ 6213](https://github.com/MemberJunction/MJ/pull/6213) (note sources, learning cycles, proposals with impact, confidence, route and brief, proposal sources, context items, the canonical columns on notes and skills); `EffectiveFrom` and `EffectiveTo` on concepts; `AuthorityTierID` on edges; `Provisional` on concepts and edges; the per-graph settings of D20 and D31. CodeGen and the PostgreSQL migration. | SQL Server and PostgreSQL databases each build from migrations alone; generated classes exist for every new table and column. |
| 0.2 | Metadata: the `AuthoritativeFor` edge type and endpoint rows, the graph permission domain, default grants per D4, the autonomy classes all set to Review. | The edge-type registry test passes; a new graph is unreadable by a UI-role user until granted. |
| 0.3 | [MJ 6837](https://github.com/MemberJunction/MJ/issues/6837), both items, per D18 and D19. | A new ungoverned column fails a test; deleting a source document leaves no edgeless approved concept. |
| 0.4 | The memory and action-approval fixes of [MJ 6213](https://github.com/MemberJunction/MJ/pull/6213) phase 0. | Its scope-isolation tests pass for callers with no company, user or agent. |
| 0.5 | The gold-set scorer ([MJ 6997](https://github.com/MemberJunction/MJ/issues/6997)), scoring after synonym and `Same As` resolution. | It reports precision and recall for concepts and edges, and the baseline is recorded. |
| 0.6 | The answer evaluation harness (D35): the same questions answered with Canon on and with Canon off. | Both scores are recorded as the baseline, per graph. |
| 0.7 | Gap alerts: log `NO_MATCH` and `AMBIGUOUS_CONCEPT` results from `Get Graph Context`. | A question with no match produces one row a steward can list. |
| 0.8 | The Canon guide: path finding, `RenderCanonDocument`, the approval gate, the ambiguity codes, redaction, the edge direction contract, the two edge-fix Record Processes hosts run after upgrading. The Canon owners list. | Every method the guide names exists, and each shipped feature has a section. |
| 0.9 | MJ's written rule on PostgreSQL migrations, per D26. | `CLAUDE.md`, `AGENTS.md` and `migrations/CLAUDE.md` say the same thing and the instruction-file check passes. |

### Wave 1: membership, lookups and precedence

| Slice | What | Done when |
|---|---|---|
| 1.1 | U1: `BaseCanonMemberAdapter` and an adapter per kind; `GraphEngine` reads `CanonState`; approval state wired for fingerprinted kinds; stale policy per D20. | A query edited after approval disappears from `CanonContext` and reappears when re-approved. |
| 1.2 | 5d ([MJ 6725](https://github.com/MemberJunction/MJ/issues/6725)): every lookup by name takes a graph. | With one concept name in two graphs, each caller gets the one in their graph; an `Approved` row is never shadowed by a `Draft` one. |
| 1.3 | [MJ 6213](https://github.com/MemberJunction/MJ/pull/6213) phase 1: note sources, the five-tier precedence, two-lane selection. | A terse canonical rule is not pushed out by five wordier preference notes; a new in-conversation preference beats an old personal note. |

### Wave 2: reach

| Slice | What | Done when |
|---|---|---|
| 2.1 | U2: derived providers for components, approved action code, active skills and saved flow agents. Tags per D22. | Each kind is reachable from a concept in `MJ Canon` with no stored edge. |
| 2.2 | Authority per concept ([MJ 6757](https://github.com/MemberJunction/MJ/issues/6757)), per D17. | Two sources with opposite authority on two concepts rank correctly for each. |
| 2.3 | Effective dates in the engine, per D16. | A question as of a past date returns the concept in effect then. |
| 2.4 | [MJ 6932](https://github.com/MemberJunction/MJ/pull/6932) finished, then [MJ 6956](https://github.com/MemberJunction/MJ/issues/6956): index and cardinality facts on existing `References` edges, an exact weighted path search, the top few paths described for the agent. No new edge type. | The best path by meaning wins; physical cost only breaks ties; the run is over a schema graph, not `MJ Canon`. |

### Wave 3: access control

| Slice | What | Done when |
|---|---|---|
| 3.1 | U3: `ResolveVisibility` in core, called by search, the graph and delegated document permissions, per D6. Visibility audit events. | One test suite runs the same fixtures through search and through the graph and gets the same answers, for one reader and for an audience. |
| 3.2 | 5b ([MJ 6723](https://github.com/MemberJunction/MJ/issues/6723)): Read, Use and Approve checked per graph, per D3. | A user granted Approve on one graph cannot approve in another; a user with no Read cannot resolve the graph by name. |
| 3.3 | 5c ([MJ 6724](https://github.com/MemberJunction/MJ/issues/6724)): the read rule on concepts, per D7, with the D31 setting. | Every test in [Tests that cannot be traded away](#tests-that-cannot-be-traded-away) passes. |

### Wave 4: scope, ledger and retrieval

| Slice | What | Done when |
|---|---|---|
| 4.1 | U4: the `Graph` lane and `MJ: Search Scope Graphs`; `ExplainScope` reports graphs. | A scope with no graph rows reaches no graph. |
| 4.2 | The ledger write path and its materializer: every proposer writes through it; the graph row links back to its proposal; settling a request never wakes or re-runs an agent. | A proposal from each proposer appears in the ledger and as a linked row; rejecting it leaves the graph row rejected. |
| 4.3 | U5: `CanonContextResolver`, the five existing routes behind a flag, precedence, one budget, citations per D11, context items per D13. | With the flag on, the deterministic integration tier passes; a fixed fixture's prompt contains each concept once; a shown concept writes an exposure row and a cited one a `Cited` row. |

### Wave 5: promotion and evidence

| Slice | What | Done when |
|---|---|---|
| 5.1 | Impact and confidence, computed for every proposal, per D29. | The same proposal scores the same twice, and the inputs are stored with the score. |
| 5.2 | The AI reviewer and the review brief, per D33. | Every review request carries a brief; the reviewing model differs from the proposing one; an overrule is recorded with its reason. |
| 5.3 | Routing, `Provisional`, and autonomy by class, per D28, D30 and D32. Every class in Review. | With every class in Review, nothing is approved without a person. A D32 case is refused even with its class set to Auto. No code path changes a class or a threshold. |
| 5.4 | The stewards' review queue in the Graph Explorer: requests ordered by impact, briefs shown, similar requests approved together. | A steward clears twenty similar low-impact requests in one action, and each is recorded singly. |
| 5.5 | Verification by replay and the random holdout, per D34. | A replay of a past decision with and without a concept records which was better, with the two shown to the judge in both orders; the holdout never withholds a D34-protected concept. |
| 5.6 | Contradictions, per D37. | Two approved concepts that disagree produce a proposed `Contradicts` edge and a request to a person. |

### Wave 6: training and learning

| Slice | What | Done when |
|---|---|---|
| 6.1 | Resolution by meaning ([MJ 6996](https://github.com/MemberJunction/MJ/issues/6996)), replacing the word-overlap match, per D14, D15 and D37. | Gold-set recall improves on the wave 0 baseline with no loss of precision; a candidate matching a rejected concept writes nothing. |
| 6.2 | Concept profiles, per D23. | Every fact in a profile links to a source chunk the reviewer can open. |
| 6.3 | [MJ 6213](https://github.com/MemberJunction/MJ/pull/6213) phases 2 to 4: learning cycles, dreaming, the harness refiner, verification routing, drafted skills, memory search during a run, agent hooks. Off as shipped. | Its own success measures hold on fixtures; a dreaming cycle stops at its cost cap; nothing from an untrusted outside source rises above `Provisional`. |
| 6.4 | Learning from usage: query runs and Skip's approved queries as sources of proposed `Measures` edges. | A query run often against a concept's entity produces one proposal, not one per run. |

### Wave 7: health and scale

| Slice | What | Done when |
|---|---|---|
| 7.1 | U6: the Canon scorecard as a scheduled job, with stale approvals, unused members, rejected proposals per proposer, open contradictions, gap alerts, extraction quality and the answer evaluation scores. The workflow health job. | The first report is produced on a database built from the branch. |
| 7.2 | Retrospective proposals, per D36. | Each of the three cases in D36 produces one proposal with a brief, on fixtures. |
| 7.3 | The load test, per D38. No size limit is added anywhere. | At the test size a two-hop context request and a path search finish within the times recorded as the baseline, and no process holds a whole graph it was not asked for. |

### Wave 8: remaining backlog

| Slice | What | Done when |
|---|---|---|
| 8.1 | Taxonomy import (SKOS) and portable bundles ([MJ 6811](https://github.com/MemberJunction/MJ/issues/6811)), both writing `Proposed` rows through the ledger, dry run by default. | A graph exported from one database imports into another as proposals and nothing else. |
| 8.2 | Triggers on a Canon metric crossing a threshold. | A metric concept's measuring query crossing its threshold raises one event. |
| 8.3 | The Canon parts of Skip client 50 and Skip-Brain 677, per D40. | Skip receives Canon through the context resolver, labelled by status, and handles `NO_MATCH` and `AMBIGUOUS_CONCEPT`. |

### Final merge

1. Replace the run's migrations with one migration stamped after everything on `next`; run CodeGen once; convert it to PostgreSQL once; add the changeset (`minor`, since the run ships a migration and metadata).
2. Run the full integration tier from empty databases.
3. Claude reviews the whole pull request against the decision sheet, slice by slice, and reports what was built, what differs from the sheet, and what is switched off.
4. The sponsor approves and merges.
5. The master plan is updated, the issues the run built are closed, the measurements are recorded, and the sponsor presents the result to the team.

## Tests that cannot be traded away

These are written into the frozen plans for waves 3 to 5. The factory may add tests; it may not remove or weaken these. Each runs as a restricted user and was seen to fail before the fix.

1. A concept synthesized only from documents the reader cannot see is hidden: its name, synonyms, description and specification never reach the reader, through the graph engine, `Get Graph Context`, a plain `RunView`, search, or a rendered Canon document.
2. A concept with some visible sources is redacted, not shown.
3. A concept sourced from a document attached to a record the reader cannot see is hidden (the delegated permissions from MJ 6970).
4. In a shared room, a concept is shown only if every reader can see it.
5. A user with no Read on a graph cannot resolve it by name, traverse it, or see its concepts in search.
6. A user with Approve on one graph cannot approve, reject or deprecate in another.
7. The context resolver never places a hidden concept's text in a prompt, and writes the visibility outcome to the context item.
8. No proposer writes an `Approved` row, and no proposer writes at all unless asked to.

9. With every class in Review, no concept or edge becomes `Approved` or `Provisional` without a person's action.
10. A concept approved by policy or by the AI reviewer stays bound to its sources' permissions while the D31 setting is off.
11. Nothing in the D32 list is approved automatically under any combination of settings.
12. No code path raises a threshold or changes a class's autonomy setting; only a person's save does.

## What we measure

**About the factory**, per slice and summed for the run:

| Measure | Why |
|---|---|
| Model spend and wall-clock time | What the run costs |
| Remediation rounds, and how each ended | Whether the review loop converges on this codebase |
| Review findings by severity, per wave | What the builders miss and the reviewer catches |
| The sponsor's minutes | Whether one person can run this |
| Slices re-planned because the spec was unclear | How good the specs were |
| Schema changes after wave 0 | Whether deciding schema first was right |
| Findings by the team after the merge, by severity | What the whole arrangement missed |
| Whether `next` stayed green after the final merge | The result that matters |

**About Canon**, which is what "world class" has to mean. The sponsor sets a target for each before the final merge; the run records the number:

| Measure | From |
|---|---|
| Answer accuracy with Canon on, against Canon off | The answer evaluation set (D35) |
| Extraction precision and recall, wave 0 against wave 6 | The gold set |
| Share of answers that cite a Canon item | Context items |
| A reviewer's minutes per decision, by impact level | The review queue |
| Agreement between the AI reviewer and people, per class | The ledger |
| Reversals of policy approvals | The ledger (zero while every class is in Review) |
| Visibility leaks | The frozen tests: none |
| Response time at the D38 size | The load test |

## Risks

| Risk | What limits it |
|---|---|
| The final pull request is too large to read | Frozen tests, the integration tier, review wave by wave, new behaviour switched off |
| No person but the sponsor sees it before `next` | A reviewer that is a different model from the builders; the team's test after the merge; everything new off by default |
| The run takes longer than a couple of days | Nothing depends on the date; wave 0 gives the first real rate |
| The branch drifts from `next` | Daily merge; generated files regenerated, never hand-merged |
| The factory's planner invents requirements | The decision sheet and the "done when" tests are the spec; a slice that needs an unruled decision stops and asks |
| A wrong access-control merge | The twelve frozen tests; wave 3 reviewed line by line before wave 4 starts |
| Automatic promotion is used to plant a false "policy" | D32's fixed list; the trust ceiling on outside sources; every class starts in Review |
| Cost runs away | The factory's per-task and per-project caps; dreaming's own cap; a slice that stalls stops and is reported |

## References

- [`canon-master-plan.md`](canon-master-plan.md), [`canon-unification.md`](canon-unification.md), [`living-canon-continuous-ingest.md`](living-canon-continuous-ingest.md)
- [MJ 6213](https://github.com/MemberJunction/MJ/pull/6213): memory, learning cycles, the evidence ladder and Canon precedence
- [`MemberJunction/bizapps-software-factory`](https://github.com/MemberJunction/bizapps-software-factory): how it works, configuration, and its protected-path and exception rules
- [`guides/CANON_AND_SEMANTIC_GRAPHS_GUIDE.md`](../guides/CANON_AND_SEMANTIC_GRAPHS_GUIDE.md)

## Change log

| Date | Change |
|---|---|
| 2026-11-28 | Draft created for the sponsor's rulings. |
| 2026-11-28 | The sponsor ruled the decision sheet: every row accepted, D25 reversed so each migration slice also produces and proves its PostgreSQL migration. |
| 2026-11-28 | Scope widened to everything open on Canon, on the sponsor's direction: all of MJ 6213, the backlog, and a new promotion and evidence design (unification Rule 6; D26 to D40). The team is paused for the run and tests after the merge; review during the run is by Claude. |
