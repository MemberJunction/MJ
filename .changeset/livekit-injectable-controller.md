---
"@memberjunction/ng-livekit-room": minor
---

`LiveKitRoomComponent`: make the room controller injectable. The component previously did `new LiveKitRoomController()` inline (untestable, no seam to substitute); it now resolves a new exported `LIVEKIT_ROOM_CONTROLLER_FACTORY` injection token and invokes it. The default factory returns `new LiveKitRoomController()`, so **runtime behavior is unchanged** — this is purely additive.

A host (or test) can now provide an alternate/fake controller: `{ provide: LIVEKIT_ROOM_CONTROLLER_FACTORY, useValue: () => myController }`. Used to add a container-level DOM spec that drives the room entirely from a fake controller (no `livekit-client`, no media), proving the injected-fake-container test pattern.
