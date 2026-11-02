---
"@memberjunction/component-registry-server": patch
"@memberjunction/scheduling-engine": patch
---

Read the real row total where a `MaxRows: 1` RunView no longer returns it (#6000): the component registry health endpoint counts components with `count_only`, and the wake-gate watermark probe reads two rows so `totalMatchingCount` stays the full count.
