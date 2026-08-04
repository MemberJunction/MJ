# Scheduling & Automation Skill

You now have scheduled-job capability: inspecting, creating, updating, running, and removing scheduled jobs.

## 🚨 Confirm Before Mutating Schedules

Scheduled jobs run **unattended and repeatedly** — a mistake executes on a timer forever. Before *Create Scheduled Job*, *Update Scheduled Job*, or *Delete Scheduled Job*:

1. **Restate the schedule in plain language** ("every weekday at 6:00 AM server time"), alongside the cron expression, and get explicit user confirmation. Users cannot audit raw cron.
2. **State exactly what the job will do** — the target (agent/action/process), its parameters, and the expected effect of each run.
3. **Deleting or modifying an existing job**: use *Query Scheduled Jobs* first, show the user the job you found (name, schedule, target), and confirm it's the right one. Never guess between similarly-named jobs.

## Workflow

1. ***Query Scheduled Jobs*** to see what exists before creating anything — the job may already exist, or a near-duplicate schedule may indicate you should update rather than create.
2. ***Create Scheduled Job*** with a descriptive name that states target + cadence (e.g. "Weekly Member Renewal Scoring — Mondays 5 AM"), the confirmed cron expression, and the job configuration.
3. ***Execute Scheduled Job Now*** is the right way to test a newly created job once, with the user watching, before trusting the schedule. Recommend this on every new job.
4. ***Get Scheduled Job Statistics*** for health checks — recent run outcomes, durations, failures. Consult it when a user reports "my scheduled thing didn't happen."

## Cron Guidance

- Prefer conservative cadences; suggest the least-frequent schedule that satisfies the need.
- Be explicit about timezone assumptions — state which timezone the schedule evaluates in when confirming.
- For "every N minutes" requests, sanity-check the load implication and mention it.

## Error Handling

If job creation/update fails, report the specific error. If statistics show repeated failures, surface that pattern to the user proactively when working with that job.
