---
'@memberjunction/mobile-app': patch
---

fix(mobile-app): the voice call's buttons have names a screen reader reads

The voice call's three buttons had no accessibility role or label, so VoiceOver and TalkBack had no name to read for them (#5449). The red button is now a button named "End call", as the web call names it, and the screen's hint says "Tap to end the call". The two side buttons are the mobile plan's keyboard mode and menu, which nothing is wired to yet: they are buttons named "Keyboard" and "Menu", and disabled, so a screen reader says they can't be used rather than offering a button that does nothing. On screen only the hint's words change.
