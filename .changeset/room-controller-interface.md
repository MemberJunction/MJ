---
"@memberjunction/livekit-room-core": patch
"@memberjunction/ng-livekit-room": patch
---

The meeting room runs on any room controller. `ILiveKitRoomController` in `@memberjunction/livekit-room-core` is what `mj-livekit-room` drives: the connection, local media, the data channel, effects, devices, and the room's state and events. `LiveKitRoomController` implements it and stays the default. `LIVEKIT_ROOM_CONTROLLER_FACTORY` and the room's `Controller` are now typed to the interface, so a host can provide its own controller; code that assigns `Controller` to a variable typed `LiveKitRoomController` should type it `ILiveKitRoomController` instead.
