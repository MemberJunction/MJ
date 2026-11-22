# Canon master plan

One coordinating plan for all open Canon work across MemberJunction, Skip and the Skip client.

## Status

- **Status**: Active. This plan coordinates every pull request listed in [Open work](#open-work).
- **Created**: 2026-11-16
- **Deadline**: **2026-12-01**. By that date every pull request listed here is merged, closed, or converted to a `canon` issue. See [What done means](#what-done-means-on-december-1).
- **Sponsor**: Amith Nagarajan (`AN-BC`)
- **Development lead**: `rkihm-BC` oversees the implementation from here and rules on open implementation questions. Design input closed on 2026-11-18.
- **Where to discuss**: comments on this plan's pull request, [MJ 6675](https://github.com/MemberJunction/MJ/pull/6675). Scope changes are agreed there first, then this file is updated.
- **How it changes**: this file is expected to change as we build. Edit it through its pull request and add a line to the [Change log](#change-log).

## Why this plan exists

Canon grew quickly through several plans and pull requests written in parallel. They are individually sound, but they overlap: the graph runtime exists twice, three designs hold proposals awaiting approval, notes can reach Canon by two routes with different review rules, and two pull requests describe the schema differently from what shipped.

Nobody did anything wrong. The work simply outran its coordination. This plan names one owner and one outcome for each piece, so nobody builds the same thing twice or builds on something about to move.

## What Canon is

Canon is the organization's ratified, machine-readable ground truth: how it defines its concepts, computes its metrics, states its policies and runs its recurring processes. It has four layers.

| Layer | Holds | Stored in |
|---|---|---|
| 1. Governed data slices | The approved way to select a set of records | `MJ: Entity Alternate Base Views`, `MJ: Queries` |
| 2. Concepts and authority | Terms, metrics, policies, processes, roles and domains, ranked by authority, linked to what defines, measures and implements them | `MJ: Graph Concepts`, `MJ: Graph Edges` in a graph whose type has `IsCanon = 1` |
| 3. Agent guardrails | Short rules about how an agent should behave | `MJ: AI Agent Notes` |
| 4. Executable procedures | The approved way to do a piece of work | `MJ: AI Skills`, `MJ: Actions`, saved Flow workflows |

### What is already on `next`

- Layer 1, alternate base views.
- The nine `__mj.Graph*` tables, the `MJ Canon` graph and its seeded types, tiers and edge types.
- The Content Pipeline `Graph` stage, which turns documents into concepts and edges.
- `GraphEngine` (`packages/MJCoreEntities/src/graph/`), `CanonGraphEngine`, seven derived edge providers, the `Get Graph Context` action, the graph lane in `SearchEngine`, and the `graphExpand` stage in the agent pipeline.
- Workflow promotion discovery and workflow health scoring in `@memberjunction/ai-core-plus`. Both are pure functions that nothing calls yet outside tests.
- The Knowledge Hub "Graphs & Canon" explorer.

The reference for all of it is [`guides/CANON_AND_SEMANTIC_GRAPHS_GUIDE.md`](../guides/CANON_AND_SEMANTIC_GRAPHS_GUIDE.md). **The shipped schema is the source of truth.** Where a plan or pull request disagrees with it, the plan or pull request changes.

## Open work

"Outcome" is what should have happened to each pull request by December 1. Owners are the current authors and assignees; workstream owners below are proposals to confirm in review.

### Coordinated from this plan

| Pull request | Author, assignees | What it is | Outcome by Dec 1 |
|---|---|---|---|
| [MJ 6667](https://github.com/MemberJunction/MJ/pull/6667) | `AN-BC`; `jordanfanapour`, `MS-BC`, `cmbrock-BC` | Path finding, ambiguity result codes on `Get Graph Context`, deterministic domain proposals. Code. | Merge. It sets two rules everything else follows (decisions 2 and 6). |
| [MJ 6404](https://github.com/MemberJunction/MJ/pull/6404) | `MS-BC` | A second `GraphEngine` and `CanonGraphEngine`, `RenderCanonDocument`, sub-agent result propagation. Draft, conflicts with `next`. | Re-cut (decision 1), then merge the remainder. |
| [MJ 6213](https://github.com/MemberJunction/MJ/pull/6213) | `AN-BC`; `arie-glazier-bcc` | The memory, learning-cycle and Canon precedence plan for v6.3. Plan only. | Revise per decisions 2 to 5, then merge. Its implementation follows as `canon` issues. |
| [MJ 4155](https://github.com/MemberJunction/MJ/pull/4155) | `AN-BC`; `ct-bc` | Agent framework review. Recommendation R4 adds a proposals table for agent self-improvement. Plan only. | Fold R4 into MJ 6213 (decision 2). The rest is outside Canon and proceeds unchanged. |
| [MJ 6586](https://github.com/MemberJunction/MJ/pull/6586) | `AN-BC` | DBAutoDoc roadmap. Uses query history as evidence and certifies schema descriptions. Plan only. | Agree the interface to Canon (decision 7), then merge. |
| [Skip client 50](https://github.com/BlueCypress/Skip-Client-Open-App/pull/50) | `MS-BC` | Sends a `canon` section to Skip, a note-to-Canon bridge, and Skip Local agents bound to `Get Graph Context`. Draft. | Revise per decisions 3, 4 and 5, then merge. Its section 1 (metadata cache) is superseded by the shipped catalog cache ([Skip-Brain 731](https://github.com/BlueCypress/Skip-Brain/pull/731), [Skip client 55](https://github.com/BlueCypress/Skip-Client-Open-App/pull/55), 0.3.10); rebase and keep only sections 2 and 3. The `canon` and `agentNotes` sections may be sent as catalog kinds by reference. |
| [Skip-Brain 677](https://github.com/BlueCypress/Skip-Brain/pull/677) | `MS-BC` | Consumes the `canon` section in Skip's prompts. Draft. | Revise per decision 5, then merge after Skip client 50. Its section 1 is superseded by Skip-Brain 731; rebase and keep only the Canon and Notetaker grounding parts. |
| [Skip-Brain 612](https://github.com/BlueCypress/Skip-Brain/pull/612) | `AN-BC`; `MS-BC` | The plan that Skip client 50 and Skip-Brain 677 implement. | Merge or close once those two land. |
| [MJ 6762](https://github.com/MemberJunction/MJ/pull/6762) | `AN-BC`; `cmbrock-BC` | MJ Docs in the semantic graph: auto-indexing, `[[links]]`, a Related tab, authority tiers driven by metadata, pluggable graph access policies. Adds `GraphConcept.Origin` and graph-type defaults. Added by the sponsor on 2026-11-19. | **Merged 2026-11-22** by `cmbrock-BC`. Promoting a Docs concept to Canon is not built; when it is, it follows decisions 2 and 3. |

### Adjacent: watched, not coordinated

These touch something Canon reads or will read. Their owners need do nothing unless a comment on their pull request says otherwise.

| Pull request | Why it matters to Canon |
|---|---|
| [MJ 6583](https://github.com/MemberJunction/MJ/pull/6583) (merged Nov 17) | Makes saved-query metadata on `Metadata` opt-in. Canon code must read queries through `QueryEngine`. |
| [MJ 6505](https://github.com/MemberJunction/MJ/pull/6505) | DBAutoDoc data-quality checks, a possible later source of evidence. |
| [MJ 6589](https://github.com/MemberJunction/MJ/pull/6589) | Ranks actions and skills to suggest. Skills are Layer 4. |
| [MJ 6642](https://github.com/MemberJunction/MJ/pull/6642) (merged Nov 16) | Fingerprints query and view definitions. Useful if Canon metrics later drive triggers. |
| [MJ 6517](https://github.com/MemberJunction/MJ/pull/6517) | Model monitoring jobs, the nearest thing to a metric trigger. |
| [MJ 6643](https://github.com/MemberJunction/MJ/pull/6643), [6240](https://github.com/MemberJunction/MJ/pull/6240), [6455](https://github.com/MemberJunction/MJ/pull/6455), [3370](https://github.com/MemberJunction/MJ/pull/3370) | MCP hosting and security. These come first if Canon is ever exposed to outside assistants. |

## Decisions

Closed by the sponsor on 2026-11-18. No decision drew an objection, so each answer below stands. To change one, raise it with the development lead on this plan's pull request.

### 1. One graph runtime

MJ 6404 adds `packages/MJCoreEntities/src/engines/GraphEngine.ts`. `next` already has `packages/MJCoreEntities/src/graph/GraphEngine.ts`, with `CanonGraphEngine`, the edge providers and `Get Graph Context`, and MJ 6667 builds on those.

**Decided**: the runtime on `next` is the only one. MJ 6404 is re-cut to what `next` lacks: `RenderCanonDocument`, and the sub-agent result propagation fix as its own small pull request, since it is not Canon work.

### 2. One place for proposals awaiting approval

Three designs exist:

- MJ 6667 writes a `Proposed` concept and `Inferred` + `Proposed` edges, approved through the existing `Graph: Approve Edges` authorization.
- MJ 6213 adds learning-cycle proposal tables as a quarantine for anything a machine proposes.
- MJ 4155 R4 adds a separate `MJ: AI Agent Improvement Proposals` table.

**Decided**:

- A graph row carries its own review state. Anything proposed for Layer 2 is a `Proposed` concept or edge, and approval is the `Graph: Approve Edges` gate. No second approval path for graph rows.
- The learning-cycle proposal tables in MJ 6213 are the one upstream ledger for machine-generated proposals of every kind (notes, skills, workflows, graph rows). A graph proposal that originates there is materialized as a `Proposed` graph row and links back to its proposal.
- MJ 4155 R4 uses that ledger. No `MJ: AI Agent Improvement Proposals` table.

Today only edges are gated this way; concepts are not. [Workstream 5a](#workstream-5-graph-access-control) closes that gap.

### 3. One route from a note to Canon

Skip client 50 has `promoteNoteToCanon()`, which writes concepts and edges with `Origin = 'Declared'`, and a bridge that synthesizes Canon from `Active` notes automatically. MJ 6213 routes the same promotion through verification and human approval.

**Decided**: promotion lives in MemberJunction core, once. Skip calls it. Anything a machine promotes is `Origin = 'Inferred'`, `Status = 'Proposed'`. `Declared` is reserved for a person stating something directly. Skip may still *send* un-promoted notes to Skip as notes, clearly labelled as notes and not as Canon.

### 4. A fact has one home

MJ 6213 adds `IsCanonical` to agent notes. The same definition, for example "active member", could then live as a canonical note and as a Graph Concept, retrieved by different paths and ranked by different systems.

**Decided**:

- Anything that defines a term, metric, policy, process, role or domain is a Graph Concept.
- A canonical note is a rule about agent behaviour that names no business concept, for example "never send external email without approval".
- The contradiction check runs across both stores.
- MJ 6213's precedence order states where an approved concept sits relative to a canonical note.
- Patterns seen across several users are proposed as concepts, not notes.

### 5. Use the shipped vocabulary

- MJ 6213 lists concept statuses `Proposed / Canonical / Disputed / Deprecated`. Shipped: `Draft / Proposed / Approved / Deprecated`.
- MJ 6213 lists an authority tier `Custom`. Shipped: `Inferred`.
- Skip-Brain 677 names concept types `Term, Metric, Rule, Hierarchy`. Shipped: `Policy, Metric, Process, Role, Domain, Term`.
- MJ 6667 adds result codes `AMBIGUOUS_CONCEPT` and `NO_MATCH` to `Get Graph Context`, both with `Success: true`. The Skip Local agents in Skip client 50 bind that action and must handle both.

**Decided**: each of these pull requests is corrected to the shipped values. A new status, tier or type is a schema proposal, raised as a `canon` issue.

### 6. Every proposer follows the same two rules

Concepts are now proposed from structure (MJ 6667), from documents (the `Graph` stage) and, in plan, from usage (MJ 6213) and query history (MJ 6586).

**Decided**, both taken from MJ 6667:

- A proposer skips any name already in the graph in any status, so a rejected proposal stays rejected.
- A proposer writes nothing by default. Writing is an explicit option.

### 7. The DBAutoDoc interface

MJ 6586 certifies schema descriptions and wants query history as evidence.

**Decided**: DBAutoDoc keeps describing schema, and its certified descriptions stay on entities and fields. When it finds something that is a business concept, it proposes it through decision 2's route like any other proposer. It does not keep a second store of definitions.

## Workstreams

| # | Workstream | Pull requests | Proposed owner | Done when |
|---|---|---|---|---|
| 1 | Runtime and agent surface | MJ 6667, MJ 6404 | `jordanfanapour` | 6667 merged; 6404 re-cut and merged or closed |
| 2 | Learning loop and proposal ledger | MJ 6213, MJ 4155 R4 | `arie-glazier-bcc` | 6213 revised per decisions 2 to 5 and merged |
| 3 | Skip on Canon | Skip client 50, Skip-Brain 677, Skip-Brain 612 | `MS-BC` | All three merged or closed, using core promotion and shipped vocabulary |
| 4 | Schema knowledge | MJ 6586 | `ct-bc` | Decision 7 written into 6586; merged |
| 5 | Graph access control | [MJ 6731](https://github.com/MemberJunction/MJ/pull/6731) (5a); issues [6723](https://github.com/MemberJunction/MJ/issues/6723), [6724](https://github.com/MemberJunction/MJ/issues/6724), [6725](https://github.com/MemberJunction/MJ/issues/6725) (5b to 5d) | `cmbrock-BC` | 5a merged; 5b to 5d filed as `canon` issues with a design sketch, ready for the December 3 review |

Owner confirmations: `MS-BC` accepted workstreams 3 and 4 and the 6404 split ([comment](https://github.com/MemberJunction/MJ/pull/6675#issuecomment-6930640383)), then handed workstream 4 to `ct-bc`, who was already driving the 6586 roadmap ([comment](https://github.com/MemberJunction/MJ/pull/6675#issuecomment-6952518939)); `MS-BC` reviews its Canon interface section. `ct-bc` agreed decisions 1 to 7 and confirmed workstream 4 and folding MJ 4155 R4, with its Off / Propose / Auto mode, into MJ 6213's ledger ([comment](https://github.com/MemberJunction/MJ/pull/6675#issuecomment-6962182228)). `cmbrock-BC` agreed decisions 1 to 7 and confirmed workstream 5 ([comment](https://github.com/MemberJunction/MJ/pull/6675#issuecomment-6952739756)). The non-Canon part of 6404 is now [MJ 6688](https://github.com/MemberJunction/MJ/pull/6688).

### Workstream 5: graph access control

Reading the graph is already checked against the caller: every node is re-read as the user, so entity permissions and row-level security apply; a stored edge is kept only if the user can read it and both of its ends; in a shared room every reader must see a node. What is missing is control over a graph as a whole, and over who may approve what:

- **No permissions on a graph.** Any user can resolve any active graph by name. Search scopes have their own permissions; graphs have no equivalent.
- **Wide default grants.** The UI role reads every concept and edge in every graph; Developer and Integration have full create, update and delete. No row-level filters ship, so separating tenants depends on someone adding them.
- **A concept is not tied to its sources.** A concept synthesized from Staff-only content is visible to anyone who can read the concept row. Search hides derived content when the user cannot see the record it came from; the graph has no such gate.
- **Concept approval is ungated.** Edges need `Graph: Approve Edges`; concepts have no server-side rule, so approving one is a plain update. Decision 2's single approval path currently covers edges only.
- **Approval is global.** `Graph: Approve Edges` is one authorization across all graphs, so an app such as Betty cannot let an org admin approve only their own org's graph.
- **By-name lookups are not graph-scoped.** `CanonGraphEngine.ExplainConcept` takes the first concept with that name in any graph.

| Item | What | When |
|---|---|---|
| 5a | Concept approval goes through the same gate as edges: a server-side rule on `MJ: Graph Concepts` so that approving, rejecting or deprecating a concept, or editing an approved one, needs `Graph: Approve Edges`. The pipeline's own approved concepts use the same scope its approved edges already use. In [MJ 6731](https://github.com/MemberJunction/MJ/pull/6731). `rkihm-BC` ruled on 2026-11-19 that the pipeline keeps every existing `Approved` or `Deprecated` concept in every graph for now; narrowing that by graph type moves to 5b and 5c. **Merged 2026-11-22** by `cmbrock-BC` (`23055e7cd`). Two follow-ups from its meeting with MJ 6762, governing `Origin` and the evidence retractor's scope, are in issue [MJ 6837](https://github.com/MemberJunction/MJ/issues/6837). | Merged. The 6837 follow-ups are named exceptions to the freeze if `rkihm-BC` rules them so. |
| 5b | Permissions per graph (read, use, approve), modelled on search-scope permissions, including a review of the default grants. Approval is checked per graph. | `canon` issue for December 3 |
| 5c | A concept is no more visible than its sources, mirroring search's gate on derived content. MJ 6762's provenance access policies implement most of this (full, redacted or hidden by readable sources; an `Approved` Canon concept stays visible); issue 6724 is re-scoped to what remains once it merges. Until this lands, an app serving members or the public sends no concept text (name, synonyms, description, specification) to its users or its model, only the chunk IDs that pass its own entitlement checks. | `canon` issue for December 3 |
| 5d | Concept lookups by name take a graph, starting with `ExplainConcept`. | `canon` issue for December 3 |

Betty consumes Canon for many tenants, so its plan depends on 5b and 5c: its training contradictions, synonym retrieval and feedback promotion should wait for them. Betty work that needs only per-source authority ranking can go ahead.

### Backlog

Not started and not to be opened as pull requests. Each becomes a `canon` issue and is taken up at the first monthly review.

- Steward tools in the Graph Explorer: a review queue for proposed concepts and edges, and matching by meaning, not only by name and synonym.
- Learning from usage: query runs and Skip's approved queries as sources of proposed `Measures` edges.
- Gap alerts: log the `NO_MATCH` and `AMBIGUOUS_CONCEPT` results from MJ 6667, so stewards see what people ask about that Canon does not define.
- Wiring workflow promotion discovery and workflow health scoring to a scheduled job.
- Triggers driven by a Canon metric crossing a threshold.
- Exposing Canon context to outside assistants over MCP, after the MCP security work lands.
- Portable Canon bundles ([MJ 6811](https://github.com/MemberJunction/MJ/issues/6811)): export a graph and import it into another instance as `Proposed`, the export half of MJ 6765's taxonomy import. Prompted by the TrustGraph comparison.
- Authority per concept ([MJ 6757](https://github.com/MemberJunction/MJ/issues/6757)): an `AuthoritativeFor` edge from a content source or item to a concept, with an optional authority tier on the edge. Depends on 5b to 5d. The review should settle which tier wins when a source's tier and an edge's tier disagree, so decision 4 holds.

## Timeline

| Date | What |
|---|---|
| Nov 16 | Plan opened. Owners notified on their pull requests. |
| Nov 18 | Decisions 1 to 7 closed by the sponsor; development handed to `rkihm-BC`. |
| Nov 25 | Revised pull requests ready for review. |
| Dec 1 | Close-out. Every listed pull request is merged, closed or converted to an issue. This plan merges. |
| Dec 3 | First monthly Canon review. |

### What done means on December 1

- No open pull request in the "Coordinated from this plan" table.
- The seven decisions are recorded in this file as decided, with any changes made in review.
- Every backlog item, and every implementation phase of MJ 6213, exists as a `canon` issue.
- The governance below is in force.

Two plans by the sponsor feed the December 3 review: [MJ 6765](https://github.com/MemberJunction/MJ/pull/6765) treats Canon as a property of approved, visible members of a Canon graph, with one visibility rule, one retrieval path and one health loop; [MJ 6769](https://github.com/MemberJunction/MJ/pull/6769) adds continuous ingest from Slack, Teams and email, reaching Canon only by promotion. Both keep decisions 1 to 7. 6765's one visibility rule and permission domains bear directly on 5b and 5c, so issues 6723 and 6724 are reviewed alongside it.

December 1 closes the *coordination* problem. It does not mean the v6.3 learning loop is built; that work continues afterwards, one issue at a time.

## How we coordinate until then

- **One thread.** Questions that cross pull requests go on this plan's pull request, not on the individual ones.
- **No new Canon pull requests** until December 1, other than re-cuts of the ones listed and these named exceptions: workstream 5a, and the sponsor's plan-only pull requests for the December 3 review, [MJ 6765](https://github.com/MemberJunction/MJ/pull/6765) (Canon unification) and [MJ 6769](https://github.com/MemberJunction/MJ/pull/6769) (Living Canon, continuous ingest). A new idea is a `canon` issue.
- **Alignment check each day.** Each listed pull request's new commits and comments are compared with this plan, and the repositories are scanned for new Canon and graph pull requests and issues. Where one diverges from a decision, or two start to overlap, a comment is posted on that pull request linking the relevant section here. The check is run by an automated Claude session on the sponsor's behalf, and its comments say so.
- **Due-date reminders.** As a date in the timeline approaches (November 25, December 1, the monthly review), each owner whose item is not yet done gets a short reminder on that pull request or issue, 4, 2 and 1 days before and on the day, then every 2 days while overdue with the development lead tagged. The reminders come from the same automated Claude session as the alignment check, and say so.
- **Disagreeing is fine.** If the plan is wrong, say so on its pull request and it changes. What we are avoiding is silent divergence.

## Governance after December 1

1. **Ideas are issues, not pull requests.** Use the "Canon idea" issue template, which applies the `canon` label.
2. **A Canon pull request links what it implements**: an accepted `canon` issue or a section of this plan. One without a link is converted to an issue.
3. **What counts as Canon** is the path list under the Canon heading in [`.github/CODEOWNERS`](../.github/CODEOWNERS). Changes there need a Canon owner's review.
4. **Monthly review.** On the 3rd of each month the open `canon` issues are gathered into a short proposal of what to take on next, and a group meets to decide. The group is everyone who authored, reviewed or commented on a Canon pull request or issue in the period.
5. **Schema is deliberate.** New concept types, statuses, tiers, edge types or `__mj.Graph*` columns are decided at the monthly review, never inside a feature pull request.

## Change log

| Date | Change |
|---|---|
| 2026-11-16 | Plan created. |
| 2026-11-17 | `MS-BC` accepted decisions 1 to 7 and workstreams 3 and 4; the non-Canon part of MJ 6404 moved to MJ 6688. Watched MJ 6642 merged. Added workstream 5, graph access control, owned by `cmbrock-BC`, with 5a as a named exception to the freeze. |
| 2026-11-17 | Workstream 4 handed from `MS-BC` to `ct-bc`. |
| 2026-11-17 | `ct-bc` and `cmbrock-BC` agreed decisions 1 to 7 and confirmed workstreams 4 and 5. |
| 2026-11-18 | `cmbrock-BC` opened MJ 6731 for workstream 5a and filed issues 6723, 6724 and 6725 for 5b to 5d. Watched MJ 6583 merged. |
| 2026-11-18 | MJ 6688 (the non-Canon part of 6404) merged. `cmbrock-BC` filed MJ 6757 (authority per concept), added to the backlog. The sponsor closed design input: decisions 1 to 7 stand, and `rkihm-BC` leads development. |
| 2026-11-19 | The sponsor added MJ 6762 (MJ Docs in the semantic graph), assigned to `cmbrock-BC`. Its provenance access policies cover most of 5c. |
| 2026-11-19 | The sponsor opened two plan-only pull requests for the December 3 review: MJ 6765 (Canon unification) and MJ 6769 (Living Canon). Both keep decisions 1 to 7 and are named exceptions to the freeze. |
| 2026-11-19 | `rkihm-BC` reviewed MJ 6731 and requested one change (regenerate the two server class manifests). He ruled that 5a's pipeline exception keeps existing approved concepts in every graph; narrowing by graph type goes to 5b and 5c. `MS-BC` brought MJ 6667 up to date with `next` and re-approved it. |
| 2026-11-20 | `cmbrock-BC` reviewed MJ 6762 (ten findings), the fixes landed with tests, and he approved it at `febece7b`. MJ 6797 (Canon guide: `GraphStage` writes no `Contradicts` edges) merged. `jordanfanapour` noted on Skip-Brain 612 that its metadata cache is superseded by Skip-Brain 728, so Skip client 50 and Skip-Brain 677 keep only their Canon parts. |
| 2026-11-20 | A review of TrustGraph (an open-source RDF/OWL knowledge runtime for agents) fed four additions into MJ 6765, all for the review: proposers validate against the edge-type contract, a visibility audit event, retrieval traces, and taxonomy import. MJ 6769 ties its ingest to the first two. Export bundles filed as MJ 6811 and added to the backlog. |
| 2026-11-21 | `jordanfanapour` confirmed the client catalog cache shipped (Skip-Brain 731, Skip client 55, release 0.3.10). Section 1 of Skip client 50 and Skip-Brain 677 is superseded; their Canon sections continue here and may be sent as catalog kinds. |
| 2026-11-21 | The sponsor asked for due-date reminders on GitHub; the daily check now posts them (see How we coordinate). |
| 2026-11-21 | November 25 reminders posted on MJ 6667, 6404, 4155, 6731, Skip client 50 and Skip-Brain 677. MJ 6815 (`ylee-BC`, sponsor-directed) gates query approval behind a `Queries: Approve` authorization, the query counterpart of 5a; watched, and relevant to MJ 6765 Rule 1. |
| 2026-11-22 | MJ 6762 merged. `cmbrock-BC` regenerated MJ 6731's manifests and `rkihm-BC` approved it, noting two follow-ups from 6762's merge: `GraphConcept.Origin` is not yet a governed field on approved concepts, and 6762's evidence retractor deletes concepts outside the scope 5a's gate honours, which can leave edgeless concepts behind. |
| 2026-11-22 | MJ 6731 (5a) merged. The two follow-ups are filed as MJ 6837. The SQL Server integration failures on 6731 (`fls-closeout-client.CW7`/`CW8`, `work-bus-core.WBC10`) were already failing on `next` since MJ 6817 and 6825 merged, and are not Canon. |
