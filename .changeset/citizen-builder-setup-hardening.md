---
"@memberjunction/cli": patch
---

`mj agent init` workspaces now reach a working state without a coding agent repairing them.

A tester's two clean runs each needed the coding agent to fix the environment by hand before any agent work could start. The workspace and `mj agent init` now handle each of those cases:

- **Database:** a one-shot `db-init` container creates the MemberJunction database before install. The headless installer never created it, and SQL Server reports a missing database as "Login failed for user 'sa'".
- **No restart loop:** setup runs as numbered steps, retries a failed step once, and then stops and reports instead of exiting. Exiting made Docker restart the container and repeat the failure endlessly.
- **Progress:** each step, its typical duration and a heartbeat go to `.mj-status.json` in the workspace, and on failure so do what went wrong, the end of its log, and what to do.
- **Settings:** AI provider keys, the encryption key and sign-in settings are re-read from `.env` on every start and written into the files the API and CLI load, and the API starts without stale copies in its environment, which would override those files. The keys used to be stripped before reaching the API, and a key added after the first start needed the container recreated.
- **Sample data push:** the starter metadata now pushes on a fresh database. It sets `autoCreateMissingRecords`, pushes prompts before agents (`directoryOrder`), and the starter agent no longer uses an invalid `ArtifactCreationMode`.
- **Angular:** setup no longer pins `@angular/compiler` on its own, which left Explorer with two copies of Angular and a blank page. The installer now pins the whole Angular family to Explorer's versions for every distribution install.
- **GitHub:** setup no longer puts `GITHUB_TOKEN` in the install URL. Without a token it waits for GitHub's hourly allowance to reset instead of failing part way, and continues as soon as a token is added to `.env`.
- **Roles:** `OWNER_EMAIL` becomes the installed user, with the Developer role, and anyone else who signs in to the local builder is created with the Developer role too (MJAPI's default is UI only), so the person building agents can run them from Explorer. The builder's ports now accept connections only from the machine it runs on.
- **Anthropic keys not scoped to a workspace:** `ANTHROPIC_WORKSPACE_ID` in `.env` reaches the API and the CLI, so such a key works without creating a new one.
- **`mj agent init` checks before starting:** it gives each workspace its own Compose project, so two workspaces no longer share a database. It generates a valid 32-byte encryption key (the template's placeholder decoded to 24 bytes), moves ports already in use to free ones, and makes the helper scripts executable. It checks Docker memory and free disk, lists the settings still missing in one checklist, and shows Docker's progress while the images build.
- **Docs:** the README, `AGENTS.md` and skills now describe how Flow agents are really built (step and step-path records), how data moves between steps, how to keep the user informed during long waits, and how to test the way the user will actually run the agent.
