---
"@memberjunction/realtime-runtime": patch
"@memberjunction/ng-realtime-media": patch
"@memberjunction/ng-conversations": patch
---

Improve mobile audio UX for realtime voice sessions: remove the 420px horizontal overflow floor on narrow viewports, scale the hero orb and banner for phone screens, clamp the microphone device menu inside the viewport, prevent iOS Safari focus zoom on picker/composer inputs, hide dead side-panel controls below 860px, and omit desktop-only side-panel channels (such as Whiteboard) on mobile with clear desktop-only context messaging so the co-agent explains why instead of reporting a permissions error.
