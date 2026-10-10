---
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ng-realtime-media": patch
---

The shared media kit can let a person choose whether an agent sees their camera and shared screen. `mj-media-controls` shows a "Let the agent see your camera and screen" button when the host sets `ShowAgentVision` (filled while `AgentVisionOn`, labelled "Show agent" / "Hide from agent" with `ShowLabels`) and reports clicks through `AgentVisionToggled`; the host does what the person asks. `mj-media-tile` shows an "Agent can see" chip when the participant's new `MediaParticipant.AgentCanSee` is set.
