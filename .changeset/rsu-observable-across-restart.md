---
"@memberjunction/integration-progress-artifacts": minor
"@memberjunction/schema-engine": minor
"@memberjunction/server": minor
---

The runtime schema update is observable across its own restart: the progress emitter can resume a run (manifest preserved, sequence continues), RSU run artifacts carry the connection id so they are readable over the API, and the post-restart half emits `CreateEntityMaps` and `StartSync` steps before closing the run.

A run is also survivable and stoppable. Listing runs now applies its filters and limit to the run manifests before hydrating anything, and a finished run's counts, warnings, event count and final event come from the `result.json` the emitter already wrote — so `IntegrationListRuns` with `limit:1` reads one journal instead of every journal four times. Retention prunes by run start time and sacrifices finished runs before result-less ones, so a stranded run's evidence is no longer the first thing deleted. `MJ_INTEGRATION_RUN_ARTIFACT_ROOT` moves the artifact tree out of the directory a deploy swaps. And the RSU compile runs with bounded turbo concurrency in its own process group, is killed (group-wide) when it exceeds its timeout instead of running on unattended, reports elapsed time while it runs, and fails the pipeline before the commit and restart steps rather than restarting the API onto an uncompiled tree.
