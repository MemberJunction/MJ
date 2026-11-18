# Risk-note coverage of curated bugs

| PR | risk notes count | grade | which risk (ID) | one short reason (≤ 25 words) |
|---|---|---|---|---|
| #4253 | 5 | Named | R1 | R1 says the new SELECT/EXISTS screen rejects legitimate subquery ExtraFilters; the curated bug is the IN (SELECT … BaseView) case. |
| #5897 | 4 | Adjacent | R1 (R2) | R1 warns that a stale onset can attach to a later user turn. The bug is a late transcript replacing the next turn. |
| #3831 | 3 | Named | R3 | R3 says a bus reset after the static flag is set never re-subscribes, so invalidation stops. |
| #5906 | 3 | Named | R2 | R2 says NormalizeWhiteboardPenPalette keeps any non-empty string with no color check, so non-hex values pass through. |
| #4245 | 3 | Adjacent | R2 | R2 says hard-coded header/scrollbar constants may give a height shortfall. It does not name the 40px header or missing scrollbar budget. |
| #4418 | 0 | Missed | — | No risk notes. |
| #6069 | 0 | Missed | — | No risk notes. |
| #5040 | 0 | Missed | — | No risk notes. |
| #5063 | 0 | Missed | — | No risk notes. |
| #3735 | 4 | Missed | — | Notes cover manage-metadata, codegen providers and forms. None mention detectAggregationKeyColumns or UNION handling. |
| #4065 | 0 | Missed | — | No risk notes. |
| #6227 | 4 | Adjacent | R4 | R4 says dropped objects proceed silently. It does not name the case-sensitive name match that causes the drop. |
| #4450 | 4 | Named | R1 | R1 states the exact bug: MaxRows:1 skips the count query, so TotalRowCount is 1. |
| #4828 | 0 | Missed | — | No risk notes. |
| #4290 | 0 | Missed | — | No risk notes. |
| #3602 | 0 | Missed | — | No risk notes. |
| #5052 | 0 | Missed | — | No risk notes. |
| #4317 | 8 | Missed | — | Notes cover BaseEntity IsA guards, the lookup index and PushService. None mention === ID comparison or UUID case. |
| #4451 | 0 | Missed | — | No risk notes. |
| #3585 | 0 | Missed | — | No risk notes. |
| #3644 | 0 | Missed | — | No risk notes. |
| #4512 | 0 | Missed | — | No risk notes. |
| #4814 | 0 | Missed | — | No risk notes. |
| #3412 | 0 | Missed | — | No risk notes. |
| #6027 | 5 | Adjacent | R4 (R1) | R4 says the log row may be missing when the detail row needs it. It does not describe the loop or the missing ready signal. |
| #5513 | 4 | Named | R3 | R3 says a pure click on a vertical handle can commit an H. This is the click-commits-resize bug. |
| #5729 | 0 | Missed | — | No risk notes. |
| #3354 | 5 | Adjacent | R2 | R2 is about the activation-refresh suppression flag in Save(). It does not say that Save() runs the full pipeline inline. |

Counts: Named 5 / Adjacent 5 / Missed 18 (of 28).
PRs with zero risk notes: 16 (all 16 graded Missed; the other 2 Missed PRs, #3735 and #4317, had notes).
Pattern: Named hits are all in small, focused PRs where the curated bug sits in the symbol the PR changed most. In large PRs (#3735, #4317), the notes concentrate on the files with the most changed lines (manage-metadata, BaseEntity) and miss the bug, which sits in a file the fix touched but the notes ignore. Also, zero-note PRs cluster at high RiskScore (6–7, mostly feature/other intent), so the analyzer gave no notes on exactly the PRs it scored as riskiest.
