# Intelligent Duplicate Detection & Merge — Setup, Run, Merge

A practical guide for **users** configuring duplicate detection on an entity, and for the
**professional-services team** implementing it for a client. Covers per-entity setup,
running detection, reviewing the AI's verdicts, and merging — plus the cost/quality knobs
and how to swap the reasoning model.

> **The principle: vectors filter, reasoning validates.** A fast embedding/vector pass
> finds *candidate* near-duplicates; an optional, gated LLM pass then judges the
> high-probability ones (Merge / NotDuplicate / Uncertain) and proposes how to merge.
> The LLM never *originates* matches — it only annotates what the vector pass surfaced.

---

## 0. When to use it (and the cost lever)

Vector matching alone is cheap and fast but "not super smart" — it can't tell a true
duplicate from two distinct records that merely share words ("Acme Corp" vs a different
"Acme" subsidiary; "Robert Johnson Sr." vs "Robert Johnson Jr."). Layering a small/fast LLM
on top of the **high-confidence** vector matches dramatically improves precision.

**The key lever is the LLM gate** (`ReasoningThreshold`): the LLM only runs for matched
sets whose top vector score clears it. Set it to `0.80` and you spend LLM tokens only on
matches that are already ≥80% likely — keeping cost bounded while upgrading quality. With
LLM reasoning **off**, the behavior is the classic vector-only path, byte-for-byte unchanged.

---

## 1. Prerequisites

1. **The entity's records must be vectorized** before detection finds anything. Detection
   queries a vector index built from the entity's records — if nothing is vectorized, every
   run reports `0 matches` (it's "0 vectors," not "0 duplicates"). See **§3**.
2. **To actually merge**, the entity must have **`AllowRecordMerge = true`**. With it off,
   detection still runs and the AI verdicts still display, but the panel is **read-only**
   ("Merging is not available for this entity") and matches are recorded for manual review
   only.

---

## 2. Step 1 — Configure the Entity Document (per entity)

Duplicate detection for an entity is driven by an **Entity Document** of type
**`Record Duplicate`**. Create (or open) one for the target entity and set its fields. Today
this is done through the standard **Entity Document** record form (a focused setup panel in
the Knowledge Hub is a planned UX improvement).

### Vector (always required)

| Field | What it does | Typical value |
|---|---|---|
| `Type` | Must be **`Record Duplicate`** | `Record Duplicate` |
| `EntityID` | The entity to dedupe | e.g. *Contacts* |
| `AIModelID` | The **embedding** model | `gte-small (Local)` (in-process) or a cloud embedder |
| `VectorDatabaseID` | Where vectors live | `Simple Vector Service Provider` (in-process, no external store) |
| `VectorIndexID` | The logical index (DB + embedding-model pairing) | `Default - SVS + gte-small (Local)` |
| `TemplateText` | The text rendered per record and embedded / compared (which fields matter) | a template over the entity's identifying fields |
| `PotentialMatchThreshold` | Vector score floor for a **candidate** match | `0.70` |
| `AbsoluteMatchThreshold` | Vector score at/above which a match is "certain" (drives auto-merge) | `0.95` |

### LLM reasoning (optional, this feature)

| Field | What it does | Typical value |
|---|---|---|
| `EnableLLMReasoning` | Master switch. `false` ⇒ vector-only, unchanged | `true` |
| **`ReasoningThreshold`** | **The cost gate** — LLM runs only for sets whose top vector score ≥ this | `0.80` |
| `ReasoningMode` | `Prompt` (cheap single-shot) or `Agent` (memory + tools, heavier) | `Prompt` |
| `ReasoningPromptID` | The reasoning prompt; leave blank to use the seeded **"Duplicate Resolution"** prompt | *(blank)* |
| `ReasoningAgentID` | Only for `Agent` mode; blank ⇒ seeded **"Duplicate Resolution Agent"** | *(blank)* |
| `AutomationLevel` | What happens to AI-confirmed merges (see §6) | `ReviewAll` |

> **Tuning the gate.** Start at `ReasoningThreshold = 0.80`. Lower it (e.g. `0.70`) to let the
> LLM adjudicate more borderline pairs (more tokens, more catches); raise it (e.g. `0.90`) to
> spend the LLM only on near-certain matches (fewer tokens). This is the dial Amith's design
> centers on: *per-entity, visible, easily changed.*

---

## 3. Step 2 — Vectorize the entity's records

Detection does **not** vectorize by default — it assumes vectors already exist (built by the
**Entity Vector Sync** scheduled job or run on demand). For a new "Record Duplicate" document,
vectorize once before the first run:

- **Scheduled / production:** the Entity Vector Sync job picks up active documents.
- **On demand (dev/testing):** run the harness from the repo root:
  ```bash
  npx tsx packages/AI/Vectors/scripts/test-vectorize-entity.ts "Record Duplicate"
  ```
  (the positional arg is the Entity Document **Type** to vectorize).

Re-vectorize whenever the source records change materially. (A "re-vectorize before detect"
toggle on the run is a candidate enhancement.)

---

## 4. Step 3 — Run detection

1. Open **Knowledge Hub → Duplicates**.
2. Pick the entity (its active `Record Duplicate` document).
3. **Run Detection.** A *Duplicate Run* is created; the server processes records in batches:
   embeds each source record, queries the vector index for neighbors, filters self-matches and
   below-threshold candidates, then — for sets above `ReasoningThreshold` — invokes the LLM
   once per source set.

Each run is independent and **does not overwrite** prior runs.

---

## 5. Step 4 — Review the results

The board groups results by source record and shows, per candidate match:

- **Vector score** — the embedding similarity that surfaced the candidate.
- **AI recommendation** — `Merge` / `NotDuplicate` / `Uncertain`, **judged per candidate**
  (a false-positive candidate reads `NotDuplicate` even when another candidate in the same set
  is a confident `Merge`).
- **Confidence** — the LLM's confidence, distinct from the vector score.
- **"Why?"** — the LLM's rationale, specific to that candidate.
- **"AI disagrees with vector score"** badge — the prime human-review trigger (high vector
  similarity the LLM rejected, e.g. Sr. vs Jr.).

Move groups across **Pending / Approved / Rejected** as you review.

---

## 6. Step 5 — Merge

Open a group to see a side-by-side comparison. Choose the **surviving record** and, per field,
which record's value to keep. When the LLM proposed a merge it **pre-fills** the survivor and
the per-field choices (you can override anything). **Execute Merge** runs a transactional
`MergeRecords` (requires `AllowRecordMerge = true`).

**`AutomationLevel`** controls how much is automatic:

| Level | Behavior |
|---|---|
| `ReviewAll` | Nothing auto-merges; every match waits for human review. *(Safe default.)* |
| `LLMGated` | The LLM verdict gates which matches are eligible; humans still confirm. |
| `AutoMergeAboveAbsolute` | Matches at/above `AbsoluteMatchThreshold` **and** confirmed by the LLM auto-merge (still requires `AllowRecordMerge`). |

> Merging currently performs the **local** merge. Pushing the result back to source systems
> (soft-delete + `Integrations` write-back of `DeletedAt`, `MergeRecords` as an Integrations
> primitive) is planned future work, coordinated with the integrations layer.

---

## 7. Swapping the reasoning model

The reasoning model is **not** in code — it's the model linked to the "Duplicate Resolution"
prompt via **`MJ: AI Prompt Models`**. To switch (e.g. to OSS-120B on Cerebras now, or Gemma 4
on GA), change that link (one metadata record) — no rebuild, no code change. Because the
prompt is shared by both `Prompt` and `Agent` modes, the swap applies to both. Pick a cheap,
fast model: the LLM only refines high-confidence vector matches, so even a modest model
materially upgrades catch quality.

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `0 matches found` | No vectors for this Entity Document | Vectorize (§3) |
| "Merging is not available… read-only" | Entity `AllowRecordMerge = false` | Set it `true` on the entity |
| AI verdict blank on some rows | LLM returned malformed JSON for that set | Re-run; transient. (Retry-on-parse-failure is a planned hardening.) |
| Reasoning never runs | `EnableLLMReasoning = false`, or top vector score below `ReasoningThreshold` | Enable it / lower the threshold |
| Confusing old results on the board | Each run is kept; the board shows all runs | Look at the newest run; old runs can be cleared |

To confirm the LLM actually ran, check the **AI Prompt Run** log for the "Duplicate Resolution"
prompt.

---

## 9. Professional-services checklist (per entity)

1. Create a `Record Duplicate` Entity Document; set `EntityID`, embedding `AIModelID`,
   `VectorDatabaseID`, `VectorIndexID`, and a `TemplateText` over the entity's identifying fields.
2. Set `PotentialMatchThreshold` (~0.70) and `AbsoluteMatchThreshold` (~0.95).
3. Decide on LLM: set `EnableLLMReasoning`, choose `ReasoningThreshold` (cost gate, ~0.80),
   `ReasoningMode` (`Prompt` to start), and `AutomationLevel` (`ReviewAll` to start).
4. Confirm the reasoning model link points at the desired (cheap/fast) model.
5. Set `AllowRecordMerge = true` on the entity if merging will be performed.
6. Vectorize the entity's records; schedule Entity Vector Sync to keep them current.
7. Run detection, review, and tune `ReasoningThreshold` to balance cost vs. catch rate.
