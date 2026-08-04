# Duplicate Detection — Walkthrough Recording Script (~13–14 min)

Audience: Amith, Robert, Hilton. Goal: show the **end-to-end** process — set up dupe
detection per entity, run it, review the AI verdicts, and merge — briefly but completely.
Keep it under 15 min. After approve/merge to `next`, post the recording and **@-tag Matt**,
requesting he review the duplicate-process UX end-to-end.

**Before recording:** have MJAPI + Explorer running, signed in; the **Contacts** test data
loaded and **vectorized** (`npx tsx packages/AI/Vectors/scripts/test-vectorize-entity.ts "Record Duplicate"`);
the dupe board cleared of old runs so it's clean on camera; `AllowRecordMerge = true` on the
test Contacts entity so the merge step is live.

---

### 0:00 — Intro (30s)
- "This is intelligent duplicate detection in MJ. The principle is **vectors filter,
  reasoning validates**: a fast vector pass finds candidate duplicates, then a small, cheap
  LLM judges the high-confidence ones and proposes the merge. The LLM never invents matches —
  it only validates what vectors surface, and only when we tell it to."
- One line on cost: "The whole thing is gated so we don't overspend on the LLM — I'll show
  that dial."

### 0:30 — Setup: the Entity Document (2.5 min)
- Open the **Entity Document** for Contacts (Type = **Record Duplicate**).
- Walk the **vector** fields: embedding model (`gte-small (Local)`), vector DB (Simple Vector
  Service Provider), vector index, and the **template** (the identifying fields we compare).
- Walk the two **vector thresholds**: `PotentialMatchThreshold` (~0.70 — candidate floor),
  `AbsoluteMatchThreshold` (~0.95 — "certain").
- Then the **LLM knobs** — emphasize these, this is Amith's design:
  - `EnableLLMReasoning` = on (off = classic vector-only, unchanged).
  - **`ReasoningThreshold` = 0.80** — "this is the key lever: the LLM only runs for matches
    already ≥80% likely. Per entity, easily changed — set 0.90 to spend even less, 0.70 to
    catch more."
  - `ReasoningMode` = Prompt (cheap single-shot) vs Agent (heavier).
  - `AutomationLevel` = ReviewAll (safe default).
- Note: "These live on the Entity Document form today; a focused setup panel in the Knowledge
  Hub is the UX we want Matt to design."

### 3:00 — Vectorize (45s)
- "Detection matches against vectors built from the records, so they're vectorized first —
  in production via the Entity Vector Sync job; here I ran it once." (Show the command or the
  populated vectors; don't dwell.)

### 3:45 — Run detection (1.5 min)
- **Knowledge Hub → Duplicates.** Pick Contacts. **Run Detection.**
- While it runs: "It embeds each record, finds vector neighbors, drops self-matches and
  anything below threshold, then runs the LLM once per source set that clears the gate."

### 5:15 — Review the board (3.5 min)
- Show the board: groups per source record, candidate matches with **vector score**, **AI
  recommendation**, **confidence**, and **Why?**.
- Call out the wins:
  - The **Smith cluster** (Jonathan / Jon / J. Smith) → confident **Merge** — formatting
    variants of one person.
  - **Robert Johnson Sr. vs Jr.** → **NotDuplicate** with the **"AI disagrees with vector
    score"** badge — "vectors thought these were close; the LLM caught that Sr. and Jr. are
    different people. That badge is the human-review trigger."
  - Stress **per-candidate** verdicts: "within one source's matches, the true duplicate is
    Merge while the unrelated ones are NotDuplicate — each judged independently."
- Open a **"Why?"** to show the rationale.

### 8:45 — Merge (3 min)
- Open a confirmed duplicate group → side-by-side comparison.
- Show the **survivor** + **per-field choices** the LLM pre-filled; override one to show it's
  in the reviewer's control.
- **Execute Merge.** Confirm the records merged into one.
- Mention `AutomationLevel`: "ReviewAll today; we can let high-confidence + LLM-confirmed
  matches auto-merge as trust grows."

### 11:45 — Config recap + model (1.5 min)
- Recap the dials: `EnableLLMReasoning`, **`ReasoningThreshold`** (the cost gate),
  `ReasoningMode`, `AutomationLevel`, and the vector thresholds — "all per entity."
- Model: "The reasoning model is a metadata link on the Duplicate Resolution prompt — swap to
  OSS-120B on Cerebras now, Gemma 4 at GA, no code change."

### 13:15 — Wrap (30s)
- "End to end: configure per entity → vectorize → run → review with AI verdicts → merge.
  Vectors filter, the LLM validates, and we control exactly when the LLM is invoked."
- "@Matt — would love your eyes on the UX of this whole flow; I think there's a really clean
  version of the setup + review + merge experience."

---

**Talking-points cheat sheet**
- Vectors filter, reasoning validates — LLM never originates matches.
- `ReasoningThreshold` = the cost/quality dial, per entity.
- Per-candidate verdicts (no blanket set verdict).
- "AI disagrees" badge = review trigger (Sr/Jr).
- Cheap/fast model is enough; it only refines high-confidence matches.
- Local merge now; source-system write-back is planned (Integrations).
