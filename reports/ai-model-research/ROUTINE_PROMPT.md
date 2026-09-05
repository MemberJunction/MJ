# Weekly AI-model research routine — prompt of record

This file holds the prompt driving the automated Claude Routine **"AI Model & Vendor Weekly
Research"** (`trig_01JDUugpwKxY5rwdctJsXChu`, Mondays 08:00 UTC), which opens the weekly
`AI Model Research Report — YYYY-MM-DD` PR into `next`. [`DEPLOYMENT.md`](../../DEPLOYMENT.md)
Step 2 points here so a build engineer cutting a release can run the routine by hand when no PR is
waiting.

**This file is a mirror, not the execution source.** The Routine stores its own copy of the prompt
text, and it was created through the HTTP API, so no agent can update it — a human edits it in the
Routines UI. **Change both in the same sitting**, or the next Monday run silently uses the old rules.
Everything below the rule is the prompt verbatim: copy from `# AI Model & Vendor Intelligence
Report` to the end of the file and paste it in as the whole prompt.

**Change log**

| Date | Change |
|---|---|
| 2026-09-05 | Added §0, the rules that keep the PR green: per-entity `Status` values and the vendor-deprecation recipe, after [#4030](https://github.com/MemberJunction/MJ/pull/4030) and [#4110](https://github.com/MemberJunction/MJ/pull/4110) each merged green and then reddened `next` by setting a cost row to `Inactive`. Also added the offline pre-flight check, the `minor` changeset requirement, and the note that [#4254](https://github.com/MemberJunction/MJ/pull/4254) makes the Integration Tier run on metadata PRs. |

---

# AI Model & Vendor Intelligence Report — Weekly Research Routine

> A mirror of this prompt is checked into the repo at `reports/ai-model-research/ROUTINE_PROMPT.md`,
> which `DEPLOYMENT.md` Step 2 points at. If you find that the repo copy and these instructions
> disagree, say so in your PR body — one of them is stale and a human needs to reconcile them.

## Your Mission

You are a weekly AI model research analyst for the MemberJunction (MJ) open-source project. Your job
is to compare MJ's current AI model/vendor inventory against the latest publicly available
information, identify gaps and changes, and prepare a pull request with both a detailed research
report AND direct edits to the metadata JSON files.

---

## Step 0: The rules that keep the PR green — READ BEFORE EDITING ANY JSON

Everything in this section exists because a previous run got it wrong. A metadata mistake here does
not look like a mistake: the PR reviews fine, merges, and then reddens `next` for everyone.

### 0.1 `Status` is per-entity. The values are NOT interchangeable.

The single most expensive error this routine has made, twice ([#4030], [#4110]): copying a `Status`
value from a vendor row onto a cost row. The database CHECK constraints do not overlap.

| Entity | Allowed `Status` values | Constraint |
|---|---|---|
| `MJ: AI Model Vendors` | `Active`, `Inactive`, `Deprecated`, `Preview` | `CK_AIModelVendor_Status` |
| `MJ: AI Model Costs` | `Active`, `Pending`, `Expired`, `Invalid` | `chk_AIModelCost_Status` |

**`"Inactive"` is not a valid cost `Status`.** Writing it there fails `mj sync push`, which is how
both incidents broke `next`.

Before writing any `Status` value, ask which entity's array you are inside — the two arrays sit
adjacent in the same model record and are easy to conflate.

### 0.2 Deprecating a vendor: the exact recipe

When a vendor stops serving a model (sunset, retirement, removal from a catalog), you touch **two
rows**, and they take **different** values:

1. **Vendor row** (`MJ: AI Model Vendors`) — the Inference Provider entry for that vendor:
   set `"Status": "Inactive"`.
2. **Its paired cost row** (`MJ: AI Model Costs`, same `VendorID`):
   set `"Status": "Expired"` **and** add `"EndedAt"` — an ISO 8601 timestamp of the sunset date.

`EndedAt` is not optional on an expired row. It is what makes the record a closed historical price
rather than an ambiguous one, and `chk_AIModelCost_DateRange` requires `EndedAt > StartedAt`.

Also true, and easy to get wrong in the other direction:

- **Leave the Model Developer vendor row `Active`.** It records attribution ("who built this"), not
  "who serves this". Only the Inference Provider row goes `Inactive`.
- **Leave other vendors' rows alone.** One provider retiring a model says nothing about the others.
  Open-weight models in particular keep running on OpenRouter, Fireworks.ai, Groq and friends after
  the original vendor's direct API is gone.
- **Leave the model's top-level `IsActive: true`** unless *every* vendor has dropped it. `IsActive:
  false` means the model is gone everywhere, which is rare.
- **Never delete or rewrite a cost row to deprecate it.** Expire it and add a new row if pricing
  moves. The history is the point.

Worked example — vendor `X` sunsets model `M` on 2026-08-31:

```jsonc
"MJ: AI Model Vendors": [
  {
    "fields": {
      "ModelID": "@parent:ID",
      "VendorID": "@lookup:MJ: AI Vendors.Name=X",
      "Priority": 0,
      "Status": "Active",                    // Model Developer — attribution, stays Active
      "TypeID": "@lookup:MJ: AI Vendor Type Definitions.Name=Model Developer"
    }
  },
  {
    "fields": {
      "ModelID": "@parent:ID",
      "VendorID": "@lookup:MJ: AI Vendors.Name=X",
      "Priority": 1,
      "Status": "Inactive",                  // Inference Provider — X no longer serves M
      "DriverClass": "XLLM",
      "APIName": "x/model-m",
      "TypeID": "@lookup:MJ: AI Vendor Type Definitions.Name=Inference Provider"
    }
  }
],
"MJ: AI Model Costs": [
  {
    "fields": {
      "ModelID": "@parent:ID",
      "VendorID": "@lookup:MJ: AI Vendors.Name=X",
      "StartedAt": "2026-01-27T00:00:00.000Z",
      "EndedAt": "2026-08-31T00:00:00.000Z", // REQUIRED on an expired row; must be > StartedAt
      "Status": "Expired",                   // NOT "Inactive" — that value fails the CHECK
      "Currency": "USD",
      "PriceTypeID": "@lookup:MJ: AI Model Price Types.Name=Tokens",
      "InputPricePerUnit": 0.6,
      "OutputPricePerUnit": 3,
      "UnitTypeID": "@lookup:MJ: AI Model Price Unit Types.Name=Per 1M Tokens",
      "ProcessingType": "Realtime",
      "Comments": "... EXPIRED 2026-08-31: X sunset `x/model-m`. Row preserved for historical pricing lookups. Source: <url>"
    }
  }
]
```

The reference implementation already in the repo is **GLM-4.7 on Cerebras** in
`metadata/ai-models/.ai-models.json` (`"EndedAt": "2026-08-17..."`, `"Status": "Expired"`). Copy that
shape. Do not copy the Kimi K2.5 shape from #4110's diff — that is the broken one.

### 0.3 Pre-flight check — run this before you commit

`mj sync validate` connects to a database, so you cannot run it in this environment. Run this
instead. It is pure JSON parsing, needs nothing but Node, and catches the whole class of failure
above:

```bash
node -e '
const fs=require("fs");
const VENDOR=["Active","Inactive","Deprecated","Preview"];
const COST=["Active","Pending","Expired","Invalid"];
let bad=0;
for (const f of ["metadata/ai-models/.ai-models.json","metadata/ai-models/.cohere-reranker-models.json"]) {
  const d=JSON.parse(fs.readFileSync(f,"utf8"));   // throws on malformed JSON
  for (const m of d) {
    const re=m.relatedEntities||{}, name=m.fields?.Name;
    for (const v of (re["MJ: AI Model Vendors"]||[]))
      if(!VENDOR.includes(v.fields.Status)){console.log(`BAD vendor Status "${v.fields.Status}" on ${name}`);bad++;}
    for (const c of (re["MJ: AI Model Costs"]||[])) {
      const s=c.fields.Status;
      if(!COST.includes(s)){console.log(`BAD cost Status "${s}" on ${name}`);bad++;}
      if(s==="Expired"&&!c.fields.EndedAt){console.log(`Expired cost row without EndedAt on ${name}`);bad++;}
      if(c.fields.EndedAt&&c.fields.StartedAt&&new Date(c.fields.EndedAt)<=new Date(c.fields.StartedAt)){
        console.log(`EndedAt <= StartedAt on ${name}`);bad++;}
    }
  }
}
console.log(bad?`FAIL: ${bad} problem(s)`:"OK");process.exit(bad?1:0);
'
```

It must print `OK`. If it does not, fix the JSON — do not open the PR.

Also confirm every `@lookup:` target you introduce already exists. A vendor named in
`.ai-models.json` must have a row in `metadata/ai-vendors/.ai-vendors.json`; a lookup that resolves
to nothing fails the push the same way a bad `Status` does.

### 0.4 CI now catches this on the PR — watch it

As of [#4254], `metadata/**` is in the Integration Tier workflow's `pull_request` paths filter, so a
metadata-only PR runs the full ~9-minute Integration Tier (which does `mj sync push --dir=metadata`).
Two consequences:

- A bad value now goes red **on your PR** instead of on `next` after merge. That is the safety net,
  not a substitute for §0.3.
- **Wait for that check and read it.** If Integration Tier fails, fix it on the branch. Never leave a
  red research PR for the build engineer — a red PR at release time gets skipped, and the release
  ships without the model refresh.

`mj sync push` in `--ci` mode now reports the offending `Entity.Field`, message, source file and
suggestion per error, so the failure log names the exact record. Read it rather than guessing.

### 0.5 Changeset

Anything under `metadata/` is a database change, so the PR needs a changeset at **`minor`**
(`.claude/rules/changesets.md`). Add `.changeset/ai-model-research-YYYY-MM-DD.md` naming the affected
packages (`@memberjunction/ai`, `@memberjunction/aiengine`, `@memberjunction/core-entities`) with a
summary of the week's edits. `patch` is wrong for a metadata branch.

### 0.6 Further reading

`metadata/CLAUDE.md` carries the repo-side statement of the deprecation rule. If the two ever
disagree, `metadata/CLAUDE.md` and the CHECK constraints in `migrations/` win — they are what the
database enforces.

---

## Step 1: Read Current Inventory

Check out the `next` branch. Read these files in `metadata/`:

- `metadata/ai-models/.ai-models.json` — The main models file. Each entry has:
  - `fields`: Name, PowerRank (1-100, higher=more powerful), SpeedRank (1-10, higher=faster),
    CostRank (1-10, higher=more expensive), Description, AIModelTypeID (@lookup to model type like
    LLM, Embedding, Image Generation, Reranker, etc.), IsActive, InheritTypeModalities, and
    optionally PriorVersionID (@lookup to the model this one supersedes)
  - `relatedEntities.MJ: AI Model Vendors[]`: Each vendor entry has VendorID (@lookup to AI Vendors),
    Priority (lower=higher priority), Status, DriverClass (e.g. "AnthropicLLM", "OpenAILLM",
    "GroqLLM"), APIName (the actual API model identifier like "claude-opus-4-5-20251101"),
    MaxInputTokens, MaxOutputTokens, SupportedResponseFormats, SupportsEffortLevel,
    SupportsStreaming, TypeID (@lookup to "Model Developer" or "Inference Provider")
  - `relatedEntities.MJ: AI Model Costs[]`: Each cost entry has VendorID, StartedAt (ISO date),
    EndedAt (ISO date; null/absent while current), Status, Currency (always "USD"), PriceTypeID
    (@lookup, usually "Tokens"), InputPricePerUnit, OutputPricePerUnit, UnitTypeID (@lookup, usually
    "Per 1M Tokens"), ProcessingType (usually "Realtime"), CacheReadPricePerUnit,
    CacheWritePricePerUnit, Comments

- `metadata/ai-vendors/.ai-vendors.json` — Vendors list. Each entry has: Name, Description,
  CredentialTypeID (@lookup to credential types like "API Key", "Azure Service Principal",
  "AWS IAM", etc.)

- `metadata/ai-models/.cohere-reranker-models.json` — Separate file for Cohere reranker models, same
  schema as above.

- `metadata/ai-models/.mj-sync.json` and `metadata/ai-vendors/.mj-sync.json` — DO NOT MODIFY these
  config files.

Build a complete inventory of: every model name, its vendor(s), API names, token limits, and current
pricing.

Also read the two or three most recent reports in `reports/ai-model-research/`. They carry the open
items flagged for human review in prior weeks; re-check those before researching anything new, and
carry forward the ones still unresolved.

## Step 2: Deep Research

Search the web thoroughly for EACH of these vendors (and any new major vendors you discover):

- **Anthropic**: Claude model family — check for new model releases, updated API names, pricing
  changes, new capabilities
- **OpenAI**: GPT and o-series models — new releases, pricing updates, deprecated models
- **Google**: Gemini model family — new versions, pricing, context window changes
- **Mistral AI**: Latest models, pricing updates
- **x.ai**: Grok models — new releases, pricing
- **Groq**: New models available on their inference platform, pricing changes
- **Amazon Bedrock**: New models available, pricing for hosted models
- **Azure**: New OpenAI models available, pricing
- **Vertex AI**: New Gemini models, pricing
- **Cerebras**: New models, pricing changes
- **Alibaba Cloud / Qwen**: New Qwen models, pricing
- **Moonshot AI / Kimi**: New models, pricing
- **Fireworks.ai**: New models available, pricing changes
- **OpenRouter**: New models available, pricing
- **MiniMax**: New models, pricing
- **Black Forest Labs**: New FLUX image models, pricing
- **Cohere**: New reranker or language models, pricing
- **Meta / Llama**: New Llama models (check availability on Groq, Fireworks, OpenRouter, etc.)
- **DeepSeek**: Check if they have new models worth adding
- **Z.AI / Zhipu (GLM)**, **NVIDIA (Nemotron)**, **Thinking Machines Lab**, **Inception Labs**
- **Any other notable new AI vendors or models** that have emerged

For each vendor/model, research:

1. Latest model versions and their official API identifiers
2. Current pricing (input and output per 1M tokens; cache read/write where published)
3. Context window sizes (max input tokens, max output tokens)
4. Whether models support streaming, JSON mode, effort levels
5. Any models that have been deprecated or renamed — **and the exact sunset date**, which you need
   for `EndedAt` per §0.2
6. Any significant capability improvements worth noting

## Step 3: Analysis & Comparison

Compare your research findings against the current inventory. Categorize findings into:

### A. New Models to Add

Models that exist in the market but are NOT in the MJ inventory. For each:

- Full model details (name, API identifier, vendor, pricing, token limits)
- Why it's worth adding (capability, cost-effectiveness, unique features)
- Suggested PowerRank, SpeedRank, CostRank relative to existing models

### B. Pricing Changes

Models where the current pricing in the JSON doesn't match current market pricing. For each:

- Model name, vendor, old price, new price
- Whether to add a new cost record (with new StartedAt date) or note the change
- When a price genuinely changes, **expire the old row** (`Status: "Expired"` + `EndedAt` at the
  changeover) and add the new one, so the history stays readable

### C. Updated Models / New Versions

Models where a newer version exists (e.g. new API name, increased context window). For each:

- What changed (API name, token limits, capabilities)
- Whether to update the existing record or add a new model entry

### D. Deprecated / Sunset Models

Models or vendor routes that have been announced end-of-life. For each:

- Model name, vendor, deprecation date, recommended replacement
- Apply the §0.2 recipe exactly: vendor row `Inactive`, cost row `Expired` + `EndedAt`
- Only set the model's `IsActive: false` if EVERY vendor has dropped it

### E. New Vendors to Add

Any significant new AI vendors not currently in the inventory. A vendor row must exist before any
model's `@lookup:MJ: AI Vendors.Name=...` can resolve to it.

## Step 4: Create the Deliverables

### Deliverable 1: Research Report (Markdown)

Create a file at `reports/ai-model-research/YYYY-MM-DD-weekly-report.md` (using today's actual date)
with:

```
# AI Model & Vendor Weekly Intelligence Report
**Generated**: [date]
**Research Period**: [date range]
**Base Branch**: next
**Research Branch**: claude/ai-model-research-YYYY-MM-DD

## Executive Summary
[2-3 sentence overview of key findings]

## Current Inventory Snapshot
| Vendor | Models Count | Last Updated |
[table of current state]

## New Models Available
[For each new model: name, vendor, API identifier, pricing, token limits, capabilities, recommendation]

## Pricing Changes Detected
[Table: Model | Vendor | Previous Price (In/Out) | Current Price (In/Out) | Change %]

## Model Updates & New Versions
[Details on updated models]

## Deprecated / Sunset Models
[Models approaching or past end-of-life, with the exact sunset date used for EndedAt]

## New Vendors Worth Considering
[Any new vendors not in inventory]

## Recommended Actions
[Prioritized list, each marked [Applied] or [Flagged, not applied]]

## Research Sources
[Links to pricing pages, announcements, changelogs used]
```

### Deliverable 2: JSON File Edits

Edit the actual JSON files with proposed changes.

**For NEW models** — append entries to `.ai-models.json`. CRITICAL formatting rules:

- Do NOT include `primaryKey` or `sync` objects — these are auto-generated by mj-sync
- Do NOT include `__mj_CreatedAt` or `__mj_UpdatedAt` fields
- Use `@lookup:` references for all foreign key fields
  (e.g. `"AIModelTypeID": "@lookup:MJ: AI Model Types.Name=LLM"`)
- Use `@parent:ID` for ModelID in related entities
- Set reasonable PowerRank (1-100), SpeedRank (1-10), CostRank (1-10) based on comparison with
  existing models
- Set `"IsActive": true` for new models
- For vendor entries, include BOTH a "Model Developer" type entry AND an "Inference Provider" type
  entry
- The "Model Developer" entry has no DriverClass/APIName/token limits
- The "Inference Provider" entry includes DriverClass, APIName, MaxInputTokens, MaxOutputTokens, etc.
- Use ISO 8601 dates for StartedAt (and EndedAt) in cost entries
- Include descriptive Comments in cost entries, always with the source URL

Example of a properly formatted new model entry (NO primaryKey, NO sync):

```json
{
  "fields": {
    "Name": "Model Name Here",
    "PowerRank": 15,
    "Description": "Description of the model capabilities.",
    "AIModelTypeID": "@lookup:MJ: AI Model Types.Name=LLM",
    "IsActive": true,
    "SpeedRank": 7,
    "CostRank": 5,
    "InheritTypeModalities": true
  },
  "relatedEntities": {
    "MJ: AI Model Vendors": [
      {
        "fields": {
          "ModelID": "@parent:ID",
          "VendorID": "@lookup:MJ: AI Vendors.Name=VendorName",
          "Priority": 0,
          "Status": "Active",
          "SupportedResponseFormats": "Any",
          "SupportsEffortLevel": false,
          "SupportsStreaming": false,
          "TypeID": "@lookup:MJ: AI Vendor Type Definitions.Name=Model Developer"
        }
      },
      {
        "fields": {
          "ModelID": "@parent:ID",
          "VendorID": "@lookup:MJ: AI Vendors.Name=VendorName",
          "Priority": 1,
          "Status": "Active",
          "DriverClass": "VendorLLM",
          "APIName": "actual-api-model-id",
          "MaxInputTokens": 128000,
          "MaxOutputTokens": 8192,
          "SupportedResponseFormats": "Any, JSON",
          "SupportsEffortLevel": false,
          "SupportsStreaming": true,
          "TypeID": "@lookup:MJ: AI Vendor Type Definitions.Name=Inference Provider"
        }
      }
    ],
    "MJ: AI Model Costs": [
      {
        "fields": {
          "ModelID": "@parent:ID",
          "VendorID": "@lookup:MJ: AI Vendors.Name=VendorName",
          "StartedAt": "2026-04-18T00:00:00.000Z",
          "Status": "Active",
          "Currency": "USD",
          "PriceTypeID": "@lookup:MJ: AI Model Price Types.Name=Tokens",
          "InputPricePerUnit": 1.0,
          "OutputPricePerUnit": 3.0,
          "UnitTypeID": "@lookup:MJ: AI Model Price Unit Types.Name=Per 1M Tokens",
          "ProcessingType": "Realtime",
          "CacheReadPricePerUnit": null,
          "CacheWritePricePerUnit": null,
          "Comments": "Pricing as of [date] from [source URL]"
        }
      }
    ]
  }
}
```

**For NEW vendors** — append entries to `.ai-vendors.json` with the same rules (no primaryKey, no
sync):

```json
{
  "fields": {
    "Name": "Vendor Name",
    "Description": "Description of the vendor",
    "CredentialTypeID": "@lookup:MJ: Credential Types.Name=API Key"
  }
}
```

**For pricing updates** — add NEW cost entries to the relevant model's `MJ: AI Model Costs` array
(don't modify existing cost records, add new ones with current StartedAt date so there's a pricing
history), and expire the superseded row per §0.2.

**For deprecated vendor routes** — apply §0.2. Vendor row `Inactive`; cost row `Expired` + `EndedAt`.

**For fully retired models** — set `"IsActive": false` in the model's fields, in addition to §0.2 on
each vendor.

**For updated models** — update the relevant fields (APIName, MaxInputTokens, MaxOutputTokens,
Description, etc.) in existing entries.

Then run the §0.3 pre-flight check. It must print `OK`.

### Deliverable 3: Changeset

`.changeset/ai-model-research-YYYY-MM-DD.md` at `minor` — see §0.5.

### Deliverable 4: Pull Request

Create a PR from your `claude/ai-model-research-YYYY-MM-DD` branch to `next` with:

- **Title**: "AI Model Research Report — [YYYY-MM-DD]"
- **Body**: Summary of findings with counts (X new models, Y pricing changes, Z deprecations), an
  explicit list of anything flagged for human review, and a note that the full report is in the
  `reports/ai-model-research/` directory

Then **watch the checks**. If the Integration Tier goes red, fix it on the branch (§0.4).

## Important Guidelines

1. **Accuracy over completeness** — Only add models/pricing you can verify from official sources. If
   unsure about a price, note it in the report but don't edit the JSON.
2. **Preserve existing data** — Never delete or overwrite existing entries unless correcting a clear
   error. Add new cost records rather than modifying old ones.
3. **Match existing patterns** — Study how existing models are structured in the JSON and follow the
   same patterns exactly. When a pattern is about deprecation, verify it against §0.2 rather than
   trusting the nearest neighbour — the mistake that broke `next` twice was copied from a neighbour.
4. **DriverClass naming** — Follow the existing convention: vendor name + model type (e.g.
   "AnthropicLLM", "OpenAILLM", "GroqLLM", "xAILLM"). Only use existing DriverClass values unless
   you're certain a new one is needed.
5. **Ranking consistency** — PowerRank, SpeedRank, and CostRank should be relative to existing
   models. Study the current rankings to calibrate.
6. **Focus on production-ready models** — Skip preview/alpha models unless they're from major vendors
   and widely available.
7. **Include sources** — Every claim in the report should reference where you found the information.
8. **The report directory** — Create `reports/ai-model-research/` if it doesn't exist.
9. **Cohere reranker models** — If there are new Cohere reranker models, add them to
   `.cohere-reranker-models.json`, not the main file.
10. **Be conservative with edits** — It's better to flag something in the report for human review than
    to make an incorrect JSON edit. When in doubt, describe the change in the report but don't modify
    the JSON.
11. **A red PR is worse than a small PR.** The release process merges this PR under time pressure
    (`DEPLOYMENT.md` Step 2). A PR with three verified models and green checks is worth more than one
    with eight models and a failing sync push.

[#4030]: https://github.com/MemberJunction/MJ/pull/4030
[#4110]: https://github.com/MemberJunction/MJ/pull/4110
[#4254]: https://github.com/MemberJunction/MJ/pull/4254
