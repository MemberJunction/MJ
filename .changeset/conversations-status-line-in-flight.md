---
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-composer": patch
---

The composer's status line ("Sage is working, 0:41", "2 agents working", "Stopping Sage…") now shows whenever a reply is in flight, instead of only while the send slot is Stop. It is information, not a control, so a read-only viewer and a host with `AllowStopRun` off see it too; the Stop control itself is still gated as before. Nothing changes for the default host, where the slot was already Stop whenever the line showed. The elapsed time after the line is now its own pill (no comma), on the info status tokens so it reads in dark mode.
