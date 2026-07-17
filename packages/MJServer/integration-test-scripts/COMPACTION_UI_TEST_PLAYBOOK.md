# Conversation Compaction — Live UI Test Playbook & Campaign Log

Companion to the deterministic suite (`conversation-compaction-tests.ts`). That suite covers
the assembly layer with no LLM calls; the scenarios here exercise what it cannot — live
trigger math, the summary LLM call, retrieval-tool round-trips, carry-forward reuse, and
edit handling — through the real Explorer chat UI, with every claim verified via SQL
against the dev database. Re-run these after any change to the compaction/retrieval paths.

## Environment

- MJAPI :4001, MJExplorer :4200 (serve on 4200 — the Auth0 tenant only allows that
  callback, despite the start script's 4201), SQL Server dev DB, schema `__mj`.
- Chat = the **Conversations** nav item; default agent **Sage** (may delegate to the
  Research Agent — root every scripted turn with an explicit `@Sage` mention so the
  compaction budget resolves against Sage's config).
- Config knob: `AIAgent.ContextWindowMaxTokens` / `CompactionTriggerPercent` /
  `CompactionTargetPercent` on Sage. Compaction only *profits* when
  `trigger tokens > SUMMARY_RESERVE_TOKENS (1500) + tail + MIN_COMPACTION_GAIN_TOKENS (500)`
  — with 6000/50/30 a fire needs a ~3,000-token window; with 6000/10/30 (trigger 600) the
  min-gain guard correctly refuses every pass. **Restart MJAPI after changing config**
  (agent metadata is cached).
- Timing note: a turn's own output is not in its own post-turn window, so the fire lands
  on the NEXT Sage turn's pre-turn check. Do not send a message while the previous turn is
  still streaming — the composer silently drops it (known contour).
- Window-size gotcha: the assembled agent window (`GetAgentContextWindow`) measures far
  smaller than raw `ConversationDetail` chars/4 when turns produced artifacts or
  delegation placeholders — reason about the trigger against the window, not the table.
  Config changes MUST go through the entity path (BaseEntity.Save) or a restart, never a
  raw sqlcmd UPDATE alone. Also: heavy delegation chains (Marketing → Brand Guardian →
  Editor) can OOM MJAPI at Node's default ~4GB heap — start with
  `NODE_OPTIONS=--max-old-space-size=8192` when scripting delegation turns.

## Scenario intents and assertions

| # | Intent (business framing) | Assertions (SQL/log/UI) |
|---|---|---|
| S1/Control | Short business chat at default config — prove normal users are untouched | `Sequence` assigned 1..N; zero `SummaryOfEarlierConversation`; zero `StepType='Compaction'` steps |
| Compaction fire | 4–6 substantive turns (concrete figures) past the trigger | Boundary row = highest Sequence with non-null summary + `SummaryPromptRunID`; `Compaction` step OutputData `{fired:true, tokensBefore, tokensAfter, warnings}`; summary is the map format (About + Gist + `seq N` markers) |
| Verbatim recall | "use getMessageBySequence on sequence N, quote verbatim" for a folded row | `Conversation Tool: getMessageBySequence` step Completed with `"toolFamily":"conversation"` in OutputData; answer is a byte-match of the stored `Message`; Prompt→Tool→Prompt shape, no silence |
| Carry-forward reuse | Follow-up answerable from the prior turn's tool result | "Tool results from your previous turn" present in the follow-up `AIPromptRun.Messages`; **zero** new Tool steps on that run; correct answer in 1–2s |
| summarizeRange | "summarizeRange sequences X–Y with lens '…'" | `Conversation Tool: summarizeRange` step with `TargetLogID` = a same-second `Summarize Conversation Range` `AIPromptRun` (cheap model); lens-focused output with seq citations |
| Degenerate budget | Over-trigger with trigger ≤ summary size | NO new boundary per turn; at most one `⚠️ [CrossTurnCompaction]` warning per conversation; no per-turn summary prompt runs |
| Edit handling | Pencil-edit a folded user message (change a figure), then ask for the current value | `OriginalMessageChanged=1`; "(edited)" badge; boundary rows **unchanged** (same `SummaryPromptRunID`); agent re-reads the row via tool and answers with the NEW value |
| Recursive fire | Keep going until a second compaction | New boundary at higher Sequence supersedes the old; its prompt input = prior summary + `[seq …]` delta only (no raw pre-boundary re-read) |
| Clamp | `ContextWindowMaxTokens` > model max for one turn | No info-level clamp log at default verbosity; clamp captured in structured step `Warnings` when a pass records |

## Executed campaigns (dev DB conversation IDs)

Full transcripts (including stored summaries and edit flags) exported to
`test-evidence/transcript-*.txt` at the repo root (untracked).

| Conversation | ID | Date | What it proved |
|---|---|---|---|
| Quarterly Membership Health Update | `A910A4E9-0B01-4053-A871-A9176912A3A5` | 2026-07-14 | Control at defaults: no compaction artifacts |
| CPES Membership Retention Analysis | `F1187F6A-4FEF-473E-A0FB-AF6BCD76D71B` | 2026-07-14 | First fire (3378→1716 tok), verbatim recall, summarizeRange ×2 with lineage, reuse (zero re-calls), recursive 2nd boundary (seq 37, delta-only input), edit → $525 re-read, degenerate-budget guard (single warning, no churn) |
| 2027 Leadership Summit Venue | `E1E58550-30F4-4150-A1EF-FE96C3DBF110` | 2026-07-15 | Post-refactor regression R1–R6: pre-turn fire (3749→1204 tok, no clamp spam), stamped tool step, reuse in 1s, summarizeRange lineage, 500k-budget clamp silent, edit → $6,500 re-read |
| 2027 Membership Dues Revenue | `6973EE39-6EFC-467A-928B-8ED97DD93F18` | 2026-07-16 | Found-state config (trigger 600): min-gain guard correctly refuses unprofitable fires; verbatim recall + reuse (640) still work without any compaction |
| 2028 Regional Conference Budget | `42A8C345-033F-4F1E-A033-FA8381AD89EA` | 2026-07-16 | PR-#2732 review follow-ups, live: carry-forward LRU cache hit on both paths (log: "served from cache (0/1 step(s), no DB lookup)"), reuse turn 0:02 vs 0:06 tool turn; pre-turn fire 5596→1204 tok recorded as a SINGLE-WRITE Compaction step (`__mj_CreatedAt = __mj_UpdatedAt`), boundary seq 16 + SummaryPromptRunID lineage |

Prior-session seeded corpora: "Compaction Tests — Project Nightingale", "Compaction Demo —
Project Falcon" (contour testing that produced the three fixes in commit `3a38f65fc7`).

## Observed performance (from step OutputData + AIPromptRun rows)

- Window compression at fire: 49–82% (best recorded 8061→1468; typical 3.4–3.7k → 1.2–1.7k).
- Cost of one fire: one `Conversation Summary` run on GPT-OSS-120B — 3.5–4.9k prompt +
  1.6–3.1k completion tokens, 4.1–7.1s wall. Post-turn fires are fire-and-forget (zero
  user-visible latency); a pre-turn fire adds its wall time to that single turn.
- Carry-forward: reuse turns ran 1.8–2.2s vs 4.5–5.3s for tool round-trip turns
  (one prompt execution instead of two).
- Pre-guard history (visible in old step rows): fires like 1572→1627 and 1389→1525 were
  net-NEGATIVE — exactly what `MIN_COMPACTION_GAIN_TOKENS` now prevents.
