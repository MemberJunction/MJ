---
"@memberjunction/ai": patch
"@memberjunction/ai-bridge-base": patch
"@memberjunction/ai-bridge-server": patch
---

The realtime bridge carries meeting video safely. The engine sends a shared screen (`screen-in`) to the model as video (it was tagged as audio), and sends camera and screen frames only to a session that declares inbound video: a driver that takes audio only, or declares no capabilities, would otherwise read an image as audio. `InboundVideoStreamsOf(capabilities)` in `@memberjunction/ai` tells a host how many inbound video streams a live session takes. `BridgeMediaFrame` gains optional `SourceID` and `SourceLabel`, so a bridge can say which camera or screen a frame comes from.
