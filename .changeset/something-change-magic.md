---
"@memberjunction/react-test-harness": patch
---


Adds an onPageReady callback to ComponentExecutionOptions so callers can drive post-render interactions on the live Playwright page (clicks, form fills, etc.) before the harness tears down. Errors inside the callback are caught and appended to result.errors instead of aborting the run.

Adds a fullPageScreenshot flag that forwards fullPage: true to page.screenshot(), capturing the entire scrollable content for tall components (dashboards, long forms) that overflow the viewport. Defaults to false to preserve existing behavior.