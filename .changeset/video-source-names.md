---
"@memberjunction/ai": patch
"@memberjunction/ai-bridge-base": patch
"@memberjunction/ai-bridge-livekit": patch
"@memberjunction/ai-bridge-server": patch
---

In a meeting, the note that tells the model it can no longer see a camera or screen now names the source as the model was told with its first frame. The bridge engine named it by the label the driver reported when the source ended, so after a person was renamed mid-meeting, or when the first frame was read before they had a name, the model read "[You can no longer see: …]" with a name it had never been given. The name for a camera or screen that has none of its own ("a participant's camera", "a participant's screen") now comes from `UnnamedVideoSourceLabel` in `@memberjunction/ai`, beside the video notes; the LiveKit bridge's `VideoSourceLabelOf` and the bridge engine each wrote it. The documentation of `BridgeVideoSourceEnd.SourceLabel` says it can differ from the name the model was given.
