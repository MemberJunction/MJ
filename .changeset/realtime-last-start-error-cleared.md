---
"@memberjunction/realtime-runtime": patch
---

`RealtimeSessionRuntime.LastStartError` is now cleared when a session starts, as its documentation said (#5431). Nothing cleared it before, so once a start failed, the runtime kept reporting that failure through every later start, including ones that succeeded. A host that reads it when `ConnectionState$` reports `'error'` could then give a later failure an earlier start's cause: the embeddable widget, retried after a blocked microphone, could tell the visitor the microphone was blocked when the new call failed while connecting. Each start now clears it before it reports `'connecting'`.
