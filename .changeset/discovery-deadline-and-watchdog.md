---
"@memberjunction/integration-engine": patch
---

Discovery samples are now bounded and observable:

- **The base sampler enforces its own deadline between pages.** The deadline was handed to the connector so it could bound its internal fan-out, but a connector that ignores the marker (every connector predating it) keeps returning `HasMore=true` — and nothing above it enforced the budget at all, so an object one page short of its sample target was asked again forever. The sampler now stops at the deadline between pages, keeping everything collected so far. Legacy callers with no deadline are unchanged.
- **A discovery watchdog names what is in flight.** From outside the process, a hung sample and a busy one were identical — nothing logged between start and end. While samples run, a ticker (default 15s, `MJ_INTEGRATION_DISCOVERY_WATCHDOG_MS`, `0` disables) names every object still in flight with its age, stage, pages, records, and time to deadline; silence now means the process is gone. The timer is unref'd and exists only while samples are in flight.
- **Entry/exit lines with a budget marker.** `DiscoverFieldsViaFetch` logs what it set out to do and what it cost, and flags an object that consumed ≥90% of its time budget — separating "slow source" from "this object can never satisfy its stop condition".
