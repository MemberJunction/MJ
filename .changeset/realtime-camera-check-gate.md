---
"@memberjunction/realtime-runtime": patch
---

A call's first camera start can wait for the user to check the camera. With `RealtimeSessionStartOptions.CameraCheck`, the camera opens for the user only: its state is `starting` with `Checking` set and the stream to preview, and nothing reaches the agent until the host calls `ConfirmCamera()`. `StopCamera()` during the check is the user's "not now". Later starts in the same call skip the check, and the next call checks again. Off by default, so a host that shows no check is unchanged.
