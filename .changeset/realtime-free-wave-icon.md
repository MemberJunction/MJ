---
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-dashboards": patch
---

The realtime voice picker's "Voice" label and the Realtime Recordings list's audio-only sessions now show their icon. Both used `fa-waveform-lines`, which only Font Awesome Pro has; Explorer loads Font Awesome Free, so the icon rendered blank. Both now use `fa-wave-square`, the wave icon in Font Awesome Free. A unit test in each package fails when a realtime template or component uses an `fa-*` class that Font Awesome Free's stylesheet has no rule for; `@fortawesome/fontawesome-free` 6.7.2, the version the realtime widget vendors, becomes a devDependency of both packages for it.
