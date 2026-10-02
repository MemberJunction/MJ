---
"@memberjunction/server": patch
---

MJAPI now hard-reloads its metadata from the database when it receives `SIGHUP` (`kill -HUP <pid>`, `docker kill -s HUP <container>`, `pm2 sendSignal SIGHUP <app>`). It's an operator control for picking up metadata changes without a restart or waiting for the refresh interval. A signal that arrives while a refresh is running is ignored and logged.
