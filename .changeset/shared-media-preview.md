---
"@memberjunction/ai-realtime-client": patch
---

`MediaPreview` in `@memberjunction/ai-realtime-client/media`: the user's camera and microphone in a lobby before a call or meeting. It runs on an `ILocalMediaController` (the browser's `LocalMediaController`, or a fake in tests) and the shared microphone meter, and gives a lobby such as `mj-camera-check` what it shows: the camera as a stream source, the microphone level, the devices, and the user's choices (`MediaPreviewChoices`). The microphone starts on and the camera off unless asked otherwise; picking a device moves a live kind at once or remembers it for later; a kind that fails to start is turned off with its reason in the state; disposing it releases the devices, the meter and the controller. The meeting room's lobby moves onto it next.
