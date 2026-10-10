---
"@memberjunction/realtime-runtime": patch
"@memberjunction/ng-realtime-media": patch
"@memberjunction/ng-conversations": patch
---

A user can switch microphone and camera during a realtime call (#5371). The runtime gains `SwitchMicrophone(deviceId)` beside `SwitchCamera`, through the host's `LocalMediaController.SwitchDevice`: the new track goes into the same stream with the mute carried over, and the driver and the call's recording move to it. `Microphone$` (`RealtimeMicrophoneState`: the microphone in use and the microphones listed, or `REALTIME_MICROPHONE_NONE`) offers it from the moment the call connects until it ends; a host without a controller gets none. `mj-media-controls` gains an optional device chevron on the microphone (`ShowDeviceMenu`, `Devices`, `SelectedMicrophoneID`, `SelectedCameraID`, `DeviceSelected`) that opens `mj-media-device-menu` above the controls with the microphones and cameras; it lists no speakers, and closes from its close button, the chevron, Escape or a click outside. The call overlay offers it in the composer's strip and lean dock (not the typed-input dock, which also has no Share arrow), listing the call's microphones and, while the camera is open, its cameras; a pick switches through the session and emits `ControlInvoked` with the new `'devices'` id. A narrow lean dock tightens its gaps, and wraps if needed, so the chevron fits.
