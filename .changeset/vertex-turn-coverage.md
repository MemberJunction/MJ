---
"@memberjunction/ai-gemini": minor
"@memberjunction/ai-vertex": minor
---

Gemini Live on Gemini Enterprise (Vertex AI) no longer asks for a turn coverage Vertex AI refuses. Vertex AI closes a session's setup on `TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO` (1007, "Invalid value at 'setup.realtime_input_config.turn_coverage'", on `v1` and `v1beta1`), which Gemini 3.8 Live's catalog rows asked for (`audioActivityAndAllVideo`). The Gemini Live endpoint profiles now say which turn coverages each endpoint accepts: the Developer API both, Gemini Enterprise only `audioActivityOnly`. A session whose configured coverage its endpoint doesn't accept, or whose value is not a coverage, sends `TURN_INCLUDES_ONLY_ACTIVITY` and logs one line naming what was asked for and what was sent. This covers the setup MJAPI's relay writes for a browser session and bridged sessions, resumed connections included. The Developer API still sends `TURN_INCLUDES_AUDIO_ACTIVITY_AND_ALL_VIDEO` when it is configured. The Gemini 3.8 Live row on Vertex AI now sets `ModelConfiguration.Realtime.TurnDetection.Coverage` to `audioActivityOnly`; the model's own value and the Google row keep `audioActivityAndAllVideo`.
