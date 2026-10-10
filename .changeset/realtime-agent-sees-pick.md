---
"@memberjunction/ng-conversations": patch
---

The "Agent can see" chip lets the user pick which source the agent sees when more are on than it sees. Its summary names the source the agent actually sees ("Agent sees: Camera", "Agent sees 2 of 3 sources") instead of counting the sources that are on. Each source that is on but not seen gets a "Show" button, the picked one reads "Viewing now, your pick", and "Let the call choose" clears the pick. The chip raises `SourcePicked` (an id, or `null`), which the call overlay passes to the session's `SelectVideoSource`.
