---
"@memberjunction/realtime-runtime": minor
"@memberjunction/server": minor
"@memberjunction/ng-realtime-widget": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/conversations-runtime": minor
---

The realtime runtime now runs the session-deadline alarm. `SetSessionDeadline(deadline, { autoEnd?, warnBeforeMs? })` arms it; `SessionDeadlineWarning$` fires once per offset and `SessionDeadlineReached$` at the deadline, then (unless `autoEnd: false`) the runtime ends the call with the new `SessionEndReason` `'deadline'`. A server-verified deadline (`identity.verified`) also arms the alarm with the current options, so a host that receives one now gets the call ended at that deadline unless it calls `SetSessionDeadline(d, { autoEnd: false })`. A deadline reached while the session is still being minted ends the call as soon as it is minted. `EndRealtimeSession('deadline')` lets a host that owns the hang-up report the same end. A deadline end claims `CloseReason` `TimeLimit`; `CloseAgentSession` accepts the claim and `SessionManager.CloseSession` verifies it against the session's stored deadline (passed or within 60 s), otherwise records `Explicit` and logs it; channel plugins are told the verified reason. The realtime widget drops its own deadline timer and reports the runtime's `'deadline'`; the conversations chat area shows no failure notice for a deadline end; the sessions adapter's `SessionEndReason` gains `'deadline'`.
