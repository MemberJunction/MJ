---
"@memberjunction/ai": patch
"@memberjunction/server": patch
"@memberjunction/ai-realtime-client": patch
"@memberjunction/realtime-runtime": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-realtime-widget": patch
"@memberjunction/mobile-app": patch
---

A relayed call (Gemini Enterprise) that reaches its 30-minute cap, or its shorter `MaxSessionSeconds`, now ends with its own message instead of a connection error. MJAPI's relay closes the browser leg with `REALTIME_RELAY_TIME_LIMIT_CLOSE_CODE` (4000, "Call time limit reached"; the upstream still gets 1000). `GeminiRealtimeClient` ends the call on that code with a fatal error whose `Code` is `REALTIME_CLIENT_TIME_LIMIT_ERROR_CODE` (`'time-limit'`), without trying to resume. `RealtimeSessionRuntime.LastSessionError` keeps the call's fatal client error until the next start, and `DescribeCallEnd` words a time-limit end (`REALTIME_CALL_TIME_LIMIT_END`): the call bar and the audio hero say "Time limit reached" (`RealtimeAgentBannerComponent.ErrorLabel`), and the widget (`mj-error` code `time-limit`) and the phone's error screen say "This call reached its time limit. Start a new call to keep talking." The avatar tile's state chip still says "Connection error".
