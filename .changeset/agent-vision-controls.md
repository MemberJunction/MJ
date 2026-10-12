---
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ng-realtime-media": patch
---

The shared media kit can let a person choose whether the agents in a room see their camera and shared screen. `mj-media-controls` shows a "Let agents in this room see your camera and screen" button when the host sets `ShowAgentVision` (filled while `AgentVisionOn`, labelled "Let agents see me" / "Hide from agents" with `ShowLabels`) and reports clicks through `AgentVisionToggled`; the host does what the person asks. `mj-media-tile` shows an "Agent can see" chip when the participant's new `MediaParticipant.AgentCanSee` is set.
