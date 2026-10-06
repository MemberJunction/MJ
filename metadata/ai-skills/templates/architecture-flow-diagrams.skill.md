# Architecture & Flow Diagrams Skill

You can now produce validated, presentation-quality diagrams of how something works: system architecture, process workflows, request sequences, data lineage, and state machines. You write a typed JSON spec with explicit placement. The renderer checks it against a schema and a set of layout rules, returns repairable diagnostics when something is wrong, and on success gives you an embeddable SVG plus a standalone interactive HTML diagram.

## When to Use This Skill

- **Use it when the diagram is the deliverable**: an architecture overview, a "how does X work" explanation, a request trace, a pipeline or lineage map, a status lifecycle.
- **Use Mermaid instead** (`Create Mermaid Diagram`, from the Data Visualization skill) for a quick inline sketch, and for diagram kinds this renderer does not have: ER diagrams, Gantt charts, class diagrams, mind maps, pie charts.
- **Use the chart actions** (Data Visualization skill) for numbers: bars, lines, distributions. This skill draws structure, not quantities.

This skill costs more than Mermaid: a spec of a few kilobytes, plus a repair round or two. Spend that when a reader will study the picture.

## Your Tools

- **Get Architecture Diagram Reference**: `Topic` plus, for `schema` and `example`, a `DiagramType`.
  - `schema`: the type's JSON schema, plus the shared definitions.
  - `example`: a complete, valid spec for the type.
  - `authoring-defaults`, `authoring-contract`, `layout-repair`: the detailed authoring and repair references.
  - `brand-marks`: the product-logo catalog.
- **Render Architecture Diagram**: `DiagramType`, `SpecJSON`, optional `Output` (`svg`, `html` or `both`; default `both`), and optional `BrowserCheck` (`true` also loads the page in a headless browser and fails if the diagram does not lay out).
  - Result codes are `SUCCESS`, `VALIDATION_FAILED`, `INVALID_INPUT`, `RENDER_FAILED`, `TIMEOUT` and `BROWSER_CHECK_FAILED`.
  - On success the `SVG` output parameter holds the inline SVG, and the interactive HTML comes back as a file output.

## Step 1: Choose the Type

| Type | Use for | Shape of the spec |
|---|---|---|
| `architecture` | Components, services, infrastructure, cloud/security boundaries | `components[]` with `pos`/`size` (or grid `row`/`col`), `connections[]`, optional `boundaries[]` |
| `workflow` | Processes, approvals, runbooks, CI/CD, agent tool loops | `lanes[]`, `nodes[]` placed by `lane` + `col` (0–5), `edges[]`, `mainPath` |
| `sequence` | API call chains, request lifecycles, async round-trips | ordered `participants[]`, `messages[]` placed by `y` |
| `dataflow` | ETL/ELT, pipelines, data lineage, governance, consumers | `stages[]` (2–5 columns), `nodes[]` placed by `stage` + `row`, `flows[]` |
| `lifecycle` | Status transitions, retries, waiting and terminal states | `lanes[]` (at most 4), `states[]` placed by `lane` + `col` (0–4), `transitions[]` |

Pick from the question being asked:
- "What are the parts and how do they connect?" is `architecture`.
- "What happens, in what order, and who does it?" is `workflow`.
- "Who calls whom, and what comes back?" is `sequence`.
- "Where does the data come from and where does it go?" is `dataflow`.
- "What states can this thing be in?" is `lifecycle`.

**Converting Mermaid input.** Read the Mermaid for topology and meaning, then write a fresh spec. Do not carry Mermaid styling across.
- `flowchart` / `graph` becomes `workflow`, or `architecture` when it is really a component map.
- `sequenceDiagram` becomes `sequence`: participants stay participants, and each arrow becomes a message.
- `stateDiagram` becomes `lifecycle`: keep the states and transitions, and drop the styling.
- `erDiagram` has no equivalent here. Keep it in Mermaid.

## Step 2: Load the Contract

Before writing the first spec, call `Get Architecture Diagram Reference` twice in the same step: `Topic: "schema"` and `Topic: "example"`, both with your `DiagramType`.
- The schema is authoritative. Every object in it sets `additionalProperties: false`, so an invented field fails validation.
- Read the definition of any field, enum or constrained string before you use it.
- The example teaches shape, not facts. Use fresh IDs, wording and layout.

Fetch `authoring-contract` or `layout-repair` only when a diagnostic calls for more detail than this skill gives.

## Step 3: Write One Complete Spec

Write the whole spec, then render it. Do not plan coordinates in prose, render partial drafts, or test-render the example.

### Required envelope

- `schema_version`:
  - `1` for `architecture`, `sequence` and `dataflow`;
  - `2` for new `workflow` and `lifecycle` specs.
- `diagram_type` must match `DiagramType`.
- `meta.title`: one concise title. If you deliberately draw a narrower scope, name it in the title.
- `meta.output`: required by the schema. Use a short relative file name such as `order-pipeline.html`. It names the HTML file.
- `meta.quality_profile: "showcase"`. Use `"standard"` only if the user asks for a dense diagram.

### Leave out unless asked

`meta.subtitle`, `meta.visual_preset`, `meta.animation` (set `"trace"` only when the user asks for motion), `meta.legend` (the automatic legend is truthful), and `meta.engineering_profile`.

Also leave out these, and the reason for each:
- **`meta.repository` and node `sources`**: the renderer verifies them against a local git checkout, which you do not have. Cite your evidence in your own text instead.
- **`meta.viewBox`** on `architecture`, `workflow` v2 and `lifecycle` v2: the canvas then sizes itself.
- **`brand`**: add it only when the user explicitly asks for a product's logo, and fetch `Topic: "brand-marks"` first. Never pass a URL.

### Shared rules

- **IDs** match `^[a-zA-Z][a-zA-Z0-9_-]*$` and are unique within their collection. Every `from`/`to` must name an existing node.
- **Node `type`** is one of `frontend`, `backend`, `database`, `cloud`, `security`, `messagebus`, `external`. It sets color and legend grouping. Lifecycle states use their own set: `start`, `active`, `waiting`, `decision`, `success`, `failure`, `neutral`, `external`.
- **Relationship `variant`**:
  - `emphasis`: the main path;
  - `security`: auth, PII, policy;
  - `dashed`: async or batch;
  - `default`: everything else.
  - Sequence messages also have `return`.
- **`icon`** is optional. It is decorative; for everyday concepts choose `calendar`, `clock`, `person`, `briefcase`, `flag` or `moon`.
- **`cards[]`** (each needs `dot`, `title`, `items`) answer extra reader questions. They never replace a node or a relationship. "Retries on failure" written on a card is not topology.
- **Language.** Write all copy in the user's language. Set `meta.locale` to `"en"` or `"zh-CN"`. For another language, either supply `meta.translations` or omit `meta.locale` and tell the user the viewer's controls will be in English. Keep product, API and code names exact.

### Composition: what to draw

- **Start from the reader's main journey.** For `architecture`, draw a system overview unless the user asked for a narrower mechanism or a deployment topology.
- **Group cooperating roles into named subsystems** only where that still explains the interaction. Keep roles separate when grouping would hide who controls what, a trust or persistence boundary, or a behavior the reader asked about.
- **Preserve every requested fact:** each responsibility, each relationship's direction, its protocol, and any condition that changes behavior.
- **Put a gate on the node or relationship it guards.** That covers approvals, authorization and state checks. A note elsewhere does not qualify an arrow that is otherwise unconditional.
- **Draw only real boundaries.** A boundary (`region` or `security-group`) marks real isolation, ownership, runtime or persistence. A boundary around a single node needs an explicit isolation fact.
- **Labels carry meaning.** Name the action, protocol, data asset, or async behavior. Leave a label off only when both endpoints already imply it fully.
- **There is no quota** of nodes, edges, cards or boundaries. Draw what the question needs.

### Placement heuristics

The router draws the lines, but it cannot move your boxes. Placement decides whether lines stay straight.

**Architecture.** Classify every connection before you choose coordinates.
- **Main path.** Neighbors sit adjacent in reading order, left to right. A long path may step down through meaningful rows instead of becoming one shallow strip.
- **Branch or store.** Place it directly above or below the node that owns, reads or writes it, centered so the edge is one straight segment. Keep every branch and store of one row on the same side of it.
- **Return.** An edge back to an earlier main-path node runs through the empty side of the main path, the side with no branches.
- **Second entrance.** When a node already has an incoming edge, bring the new source in from another side, usually from directly above or below.
- **Fan-out.** A side carrying k connections needs at least `32 + 14 × (k − 1)` px. Spread a hub's counterparts over two or three sides, or enlarge the hub. Center a parent on its children.
- **Trace every non-main edge.** Its straight or one-bend corridor must not pass through another node or cross another edge. If it does, move the endpoint that is off the main path.
- **Size and spacing.**
  - Typical nodes are 120–140 × 60 px, and the main actor starts near the origin, around x = 40.
  - Spacing means the clear gap between boxes, not center distance. Two 130 px nodes 200 px apart leave only 70 px.
  - A labeled edge needs about `6.5 × characters + 21` px of clear gap. CJK characters count double.
  - A sublabel needs about `5.4 × characters + 8` px of node width.
  - Keep external actors outside any boundary rectangle, including its padding.
- **Routes.** Use automatic routes first. Pin `fromSide`/`toSide` only for a branch or a return that needs a specific corridor. Keep `via`, `channelX`/`channelY` and `labelAt`/`labelDx`/`labelDy` for measured defects that a diagnostic reported.

**Workflow** (schema v2):
- **Lanes** are responsibility or phase. Mark an error or recovery lane `"variant": "exception"`.
- **Columns** `0..5` are logical progression, and the happy path moves monotonically through them.
- **`mainPath`** lists the happy-path node IDs in order.
- **Edges.** Give retries and exception exits `role: "error"` or `"return"` so they route outside the main corridor.
- **`phases`** and **`groups`** are optional column spans.
- **Edge labels are never deleted** as a spacing fix.

**Sequence:**
- **Participants** are ordered by conversation role, caller first.
- **Messages** go in time order. Each `y` is at least 160, and messages that share horizontal space sit at least 28 px apart.
- **Message variants.** Use `return` for responses, `security` for auth hops, `dashed` for fire-and-forget.
- **`segments`** label phases, and **`activations`** show busy spans. Both use y-pixel ranges.
- **Canvas.** The default canvas is 920 × 760. Raise `meta.viewBox` height for long traces, and set `meta.column_fit: "spread"` when participant labels do not fit the 86 px boxes.

**Dataflow:**
- **Stages** are custody or transformation boundaries, for example Sources → Ingest → Process → Store → Consume.
- **`row`** (0–4) separates parallel streams.
- **Spacing.** The default node is 112 × 58, and nodes stay at least 10 px apart.
- **Flow labels** name the data asset ("normalized facts", not "HTTP POST"). `classification` carries short governance context ("PII", "read-only", "batch").
- **Variants.** Use `emphasis` for the primary path, `dashed` for batch derivations, and `security` for restricted movement.
- **Canvas.** The default canvas is 940 × 720. Widen `meta.viewBox` if the validator reports horizontal overflow.

**Lifecycle** (schema v2):
- **Lanes.** Each lane is one row: `main` first, `terminal` last.
- **Columns.** `col` `0..4` is the same x in every row. Put an interruption or exit in the column of the state it leaves, so its transition is a straight vertical drop.
- **Transitions.** Author every transition, including the main path. Keep the labels short.
- **Recovery.** A recoverable failure needs a real transition back to an active state.

## Step 4: Render, Read the Diagnostics, Repair

1. Call `Render Architecture Diagram` with `DiagramType`, the full spec as `SpecJSON` (a JSON object), and `Output`.
2. **`SUCCESS`**: go to Step 5.
3. **`VALIDATION_FAILED`**: the Message is a JSON diagnostics report. Each problem has a stable `code`, the exact `subject` (which node, edge or label), measured `evidence`, and `supportedFixes`.
   - **Repair in this order:**
     1. schema errors and a missing `quality_profile`;
     2. node overlap and out-of-range placement;
     3. edges through nodes, and endpoint-direction errors;
     4. crossings, ambiguous corridors, border runs, excessive detours, and route rhythm;
     5. label clearance (label against node, then against label, then against route);
     6. labels that leave the canvas.
   - **Edit only the affected neighborhood.** Keep every node, relationship, label and fact. Deleting a label is never a spacing repair.
   - **Use the diagnostic's own numbers.** If it supplies a `labelAt`, use that exact point. A suggested `labelDx`/`labelDy` replaces the value you authored; it is not added to it.
   - **Fix overflow on the side it occurs.**
     - Negative (left or top) overflow needs an inward move.
     - Widening `meta.viewBox` fixes only right or bottom overflow.
     - A `composition/excessive-route-detour` means removing an unnecessary `via`, not enlarging the canvas.
   - **When several diagnostics name the same nodes**, or a local fix just moves a crossing onto another edge, reflow that connected group in one edit:
     - write down the main path as an ordered list of edges;
     - place those neighbors in reading order;
     - put shared stores between their readers and writers;
     - lay a feedback cycle around an open rectangle;
     - then delete stale `via` and label overrides so automatic routing can use the new placement.
   - **Compare runs by `code` and `subject`**, not by how many problems remain.
   - **Then call `Render Architecture Diagram` again** with the complete corrected spec.
4. **`INVALID_INPUT`**: a parameter is wrong, for example an unknown `DiagramType` or `SpecJSON` that is not valid JSON. Fix the call itself.
5. **`RENDER_FAILED`**: archify failed for a reason it could not classify. Don't retry the same spec; fall back.
6. **`TIMEOUT`**: the render took over 30 seconds. Simplify the diagram or split it into several, then call again.
7. **`BROWSER_CHECK_FAILED`** (only when you passed `BrowserCheck`): the Message lists what did not lay out. Treat it like a layout diagnostic: fix that part and call again.

**Stop within your limits.** Plan for at most three repair rounds, and stay well inside your iteration and action limits. If the spec still fails after a bounded repair:
- keep your best candidate;
- tell the user the specific remaining problem;
- fall back to a simpler diagram, `Create Mermaid Diagram` if you have it.

Do not keep making blind coordinate changes. Never claim a diagram rendered when it did not.

## Step 5: Deliver

- **The SVG is for embedding.** Paste the `SVG` output exactly as returned. Do not edit it or regenerate it by hand.
  - **In an HTML document:** wrap it in a scrollable container such as `<div class="svg-scroll-wrapper">…</div>`.
  - **In markdown** (a chat message, or a Data artifact's `plan`): put it in a fenced block that opens with a line containing only ```` ```svg ````, so the markdown renderer draws it intact.
    - A raw `<svg>` pasted into markdown is fragile: blank lines and inline styles can break it.
    - In JSON payload strings, escape it like any other string.
- **The HTML is the interactive artifact.** The standalone diagram comes back as a file output that surfaces as its own artifact: themes, trace animation, a node finder, a focus panel, and PNG/SVG export.
  - Tell the user it is there.
  - Do not paste the HTML into your message or into another document.
- **Never deliver the spec itself.** Raw spec JSON and Mermaid source are inputs, not outputs.
- **Report truthfully.** The diagram passed schema and layout validation. Do not claim a visual review you did not do.
- **Choose `Output`:**
  - `both` (the default) when the user should also get the interactive artifact;
  - `svg` when you only need an embed, such as a supporting figure in a longer document;
  - `html` when only the standalone artifact is wanted.

---

*Built on [archify](https://github.com/tt-a1i/archify) by tt-a1i (MIT license).*
