---
"@memberjunction/installer": patch
---

Fix four defects that break `mj install` on a fresh host.

**turbo's build summary was misread, in two ways.** turbo prints one comma-separated `Failed:` line naming every failed task. Both installer phases parsed it with a regex requiring a literal `Failed:` before each name, so they read only the first — a real `mj_api` build failure listed behind `mj_generatedactions` was tolerated and the install reported success. The same regex matched nothing at all when `FORCE_COLOR` made turbo wrap the names in ANSI escapes, turning the expected pre-CodeGen state of every distribution install (both `Generated*` packages fail until CodeGen writes their `src/generated/`) into a hard `BUILD_FAILED`. Both phases now share one classifier that strips ANSI and reads the whole list; `CodeGenPhase`'s copy additionally required a leading `@` and so could never match the unscoped generated packages. "No failures could be attributed" is now its own named error, build failure messages include turbo's stdout summary, and installer-spawned turbo runs pin `FORCE_COLOR=0`.

**`mj install --dir <new-directory>` failed preflight** with a false "pnpm not found on PATH". The package-manager probe runs from the target directory (corepack resolves per directory) but preflight ran it before anything created that directory, so the spawn failed `ENOENT` and a bare `catch` reported a missing binary. The directory is now created first, and a failed probe reports its real reason.

**Five interactive prompts could never fire.** `InstallConfigDefaults` pre-answered `DatabaseHost`, `DatabasePort`, `DatabaseTrustCert`, `APIPort` and `ExplorerPort` before `ConfigurePhase` applied its `??` guards. `DatabaseTrustCert` defaulting to `false` wrote an empty `DB_TRUST_SERVER_CERTIFICATE` and failed `migrate` against every self-signed (Docker, local) SQL Server. `--yes` and `--config` installs are unchanged.

**The database phase reported things it had not checked** — "Database connectivity verified" on a bare TCP probe, and `[FAIL] User sa NOT found` on a correct `sa` setup (`sa` maps to `dbo`).
