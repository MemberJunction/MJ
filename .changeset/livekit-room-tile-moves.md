---
"@memberjunction/ng-livekit-room": patch
---

The meeting room's pin is a move of the participant's tile to the spotlight in the shared media stage: each participant's tile is a media-stage surface, and `MoveTile(identity, placement)` moves it to the spotlight (`stage`) or back among the others (`tab`). One participant holds the spotlight, so a new pin sends the last one back, and unpinning gives the spotlight back to the call. Pinning someone in Gallery switches the room to Active speaker with them in the spotlight, and emits `LayoutChange`. `PinnedIdentity` reads the participant moved to the spotlight while pinning is on and they are in the room; setting it moves their tile, and `null` sends it back.
