---
"@memberjunction/mobile-app": patch
---

Keep the tab bar on screen when you drill in.

The bar existed but every drill-down — a chat thread, Data Explorer, an app, a record — was pushed
on the ROOT stack, which covers it. So one level into Data Explorer there was nothing but a back
chevron, and three levels in you pressed back three times to reach anywhere else. The bar was only
doing half its job.

Each tab now owns a stack (`app/(tabs)/(home|chats|apps|you)/`), and every drill-down reachable
from a tab lives inside that tab's group. Route paths are unchanged — Expo Router groups are
invisible in the URL — so deep links and existing navigation calls are unaffected.

Screens that SHOULD cover the bar stay at the root: the voice call, login, the full-screen
previews. Those are modes, not places. A test asserts that distinction so a new "place" cannot
quietly land at the root and lose the bar again.
