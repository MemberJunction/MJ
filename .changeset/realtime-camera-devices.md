---
"@memberjunction/realtime-runtime": patch
---

While the user's camera is open (being checked or on), its capture state names the camera in use (`DeviceID`) and lists the cameras the browser offers (`Devices`), following the host's controller as cameras come and go and their names appear. `SwitchCamera(deviceId)` moves the open camera to another device and keeps the same stream, so the preview and the agent's frames carry on; when the new camera cannot open, the camera in use stays.
