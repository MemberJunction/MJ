---
"@memberjunction/server": patch
---

Realtime call recordings are now stored for signed-in users whose only role is the stock UI role. `UploadRealtimeRecording` ran the store (the `MJ: Files` row, the file↔session link and the session's recording stamp) as the caller, and the UI role cannot create `MJ: Files`, so the audio landed in storage but the recording was never linked (`RecordingFileID` stayed null). Past the ownership and consent gates the store now runs as the system user (`ResolveRecordingStoreUser`); anonymous and web-widget callers keep their existing behaviour.
