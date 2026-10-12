---
"@memberjunction/installer": patch
---

fix(installer): smoke-test cleanup no longer kills the installer itself on macOS/Linux. `KillByPort` now asks `lsof` for listening sockets only (`-sTCP:LISTEN`); a bare `-ti:<port>` also matched the installer's own health-check connection, so `mj install` exited 137 and left Explorer running.
