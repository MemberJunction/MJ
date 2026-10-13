---
"@memberjunction/ai-bridge-livekit-native": patch
---

`@livekit/rtc-node` is now declared as `^0.13.29` (it was `^0.13.0`), the release the lockfile installs and live meetings ran on; the installed version is unchanged. The meeting bot can't run on earlier 0.13.x releases: it reads participant video through `getReader()`, which rtc-node's streams have from 0.13.12, and it times the avatar's face against `AudioSource.queuedDuration`, which reads 0 after a pause in the voice before 0.13.19 and still counts the dropped audio after `clearQueue()` (a barge-in) before 0.13.20. A host whose package manager satisfied the old range with an earlier release, such as a copy already in its tree, now gets 0.13.29 or later.
