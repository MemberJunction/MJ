---
"@memberjunction/server": patch
---

The session janitor's startup recovery closes only the agent sessions an earlier boot of the same MJAPI left, and no longer another MJAPI's live sessions on the same host (#5309). Before, it closed every open session whose `HostInstanceID` started with the machine's host name, so starting a second MJAPI on one machine against the same database closed the first one's live calls, with reason `Janitor`.

- An MJAPI instance is named by its host and the port it serves on. `Serve` sets the port first (`SetHostInstancePort`), and sessions are stamped `hostname:port:pid:bootId` (before: `hostname:pid:bootId`). Two MJAPIs running at once on one host serve on different ports; an MJAPI that restarts serves on its port again. A process that never calls `Serve` is an instance of its own (`pid-<pid>`).
- `SessionJanitor.RunStartupRecovery` reads the open sessions under this instance's prefix (`hostname:port:`) and closes those of another boot, checking each id exactly (`HostInstanceIdentity.IsPriorBoot`), since a SQL `LIKE` reads a `_` in a host name as any character. An optional third argument recovers another instance's boots.
- New `HostInstanceIdentity` and `GetCurrentHostInstance()` hold the identity in one place. `GetHostInstanceID()` returns the new format; `GetHostNamePrefix()` is deprecated, since a host prefix is not an ownership test.
- Sessions stamped in the old format aren't matched by startup recovery. Any left open after the upgrade are closed by the staleness sweep, 15 minutes after their last activity.
