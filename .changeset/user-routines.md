---
"@memberjunction/scheduling-engine": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/core-entities": minor
"@memberjunction/global": minor
"@memberjunction/ng-user-routines": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/ng-trees": minor
"@memberjunction/server": minor
---

User Routines (P1.5): user-owned scheduled/monitoring routines that run an Agent, Action, or Prompt on a cron schedule. New UserRoutine/UserRoutineRecipient/UserRoutineRun schema; UserRoutineDispatcherDriver scheduled-job driver (1-minute sweep, claim-before-run, bounded concurrency, per-routine isolation, runs as the owner, Template-driven notifications with OnChange result-hash detection, RequestedSkillIDs pre-arming for Agent targets); pure UserRoutineProcessor schedule/notify primitives shared with MJUserRoutineEntityServer (NextRunAt on save, cron validation) and MJUserRoutineRecipientEntityServer (User-xor-Email); lazy non-startup UserRoutineEngine; new @memberjunction/ng-user-routines widget set (list/editor/history + command-center composite + slide-in, cancelable Before/After events, Agent-only creation with categorical ng-trees picker); conversations bottom-sidebar Routines section gated by ShowRoutines input AND entity-Read permission (hosted in both the generic workspace sidebar and Explorer's Chat wrapper); Routines Explorer app; pure cron preset/describe helpers now in @memberjunction/global (CronUtils); mj-tree gains a DefaultExpansion input ('first-level' | 'all' | 'none'); BaseScheduledJob gains IsHighFrequencyByDesign so by-design pollers (the routine dispatcher) opt out of the high-frequency cron warning; 13-test live integration suite + live Playwright E2E.
