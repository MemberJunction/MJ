---
"@memberjunction/ai-bridge-zoom": minor
"@memberjunction/ai-bridge-teams": minor
"@memberjunction/ai-bridge-googlemeet": minor
"@memberjunction/ai-bridge-webex": minor
"@memberjunction/ai-bridge-discord": minor
"@memberjunction/ai-bridge-slack": minor
---

The Zoom, Microsoft Teams, Google Meet, Cisco Webex, Discord and Slack rows in `MJ: AI Bridge Providers` no longer claim `VideoIn`, `VideoOut`, `ScreenIn` or `ScreenOut`. Their drivers carry audio only: no video or screen frames come in, and `video-out` and `screen-out` frames are dropped. Each driver's tests now read its row from `metadata/` and check that it claims exactly the media tracks the driver carries. The rows' descriptions no longer promise full AV, the file's status note and the Loopback description are current, and every row's `SupportedFeatures` is a JSON object instead of an escaped string, as `metadata/CLAUDE.md` asks; `mj sync push` stores it pretty-printed, with the same parsed value. Once the push applies the rows, Explorer's provider form and the realtime dashboard show those six bridges without video or screen. Minor because the rows are metadata.
