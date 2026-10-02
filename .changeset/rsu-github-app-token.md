---
'@memberjunction/schema-engine': patch
---

The Runtime Schema Update commit-and-PR step can authenticate with a GitHub App. When no `GITHUB_TOKEN`/`GH_TOKEN` is set it mints an installation token from `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID` and `GITHUB_APP_PRIVATE_KEY` (or `_PATH`), scoped to the one repository named by `RSU_GITHUB_REPO`, so a deployment that provides the App instead of a token no longer ends the step with "GitHub token not found" and leaves its migration and generated code uncommitted.
