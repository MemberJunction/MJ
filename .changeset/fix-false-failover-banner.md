---
'@memberjunction/ai-prompts': patch
---

Stop logging a failover banner for failovers that never happened.

The "🔄 Trying candidate N/M" line was keyed off `i > 0`, which is not the same as
"a previous candidate failed": candidates lacking credentials in the current
environment are skipped without ever issuing a request, so the first *called*
candidate is routinely `i > 0`. Successful first-try calls logged
`🔄 Trying candidate 2/315`. One regression-suite run produced 515 such lines and
zero real failovers. Now keyed off an actual prior failure.
