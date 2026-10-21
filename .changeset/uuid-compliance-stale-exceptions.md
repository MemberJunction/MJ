---
"@memberjunction/global": patch
---

The UUID compliance scan (`UUIDCompliance.test.ts`) checks three realtime files again: the LiveKit room resource, `mj-livekit-room` and the bridge session factory. Their `KNOWN_EXCEPTIONS` entries were for voice ids compared with `===`, and none of those comparisons is left (the voice lists now compare option objects), so the scan flags no line in any of the three. A new test in the same file fails when an entry's file is gone or holds no line the scan flags, since an entry takes its whole file out of the scan.
