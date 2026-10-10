---
"@memberjunction/livekit-room-core": patch
---

`LiveKitRoomController` clears the state's `Local` and `RoomName` when the user leaves or the connection ends, as the preview room does (#5391). Its reset merged an initial state that left both out over the current state, so both kept their values: after leaving, the state still named the room and held the user's own participant view, which the meeting room lists among its participants. A `beforeDisconnect` handler still reads both, and the disconnect reason still outlasts the reset; `stateChanged` and `disconnected` handlers now get the state without them, and joining again sets them once connected. The reset's type now requires every state field but `DisconnectReason`, so a field added to `LiveKitRoomState` later can't be left out of it.
