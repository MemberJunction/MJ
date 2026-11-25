# GitHub Engineering Skill

Use this skill when inspecting GitHub repositories, searching code, committing single- or multi-file changes atomically, raising or reviewing Pull Requests, triaging Issues, or diagnosing GitHub Actions CI failures.

## Standard Engineering Workflow

1. **Orient first**: Call `GitHub - Get Repository Context` on an unfamiliar repository to retrieve the default branch, languages, top-level file tree, README preview, and recent releases in a single call.
2. **Navigate and search**:
   - Use `GitHub - List Repository Tree` with `PathPrefix` or `Glob` (e.g. `"packages/**/*.ts"`) to locate relevant modules.
   - Use `GitHub - Search Code` to locate symbol definitions or call sites across the repository or organization.
   - Use `GitHub - Read Repository File` with `Path` (or `Paths` array) and optional `StartLine` / `EndLine` to inspect source files without loading entire large files.
3. **Commit and raise PRs atomically**:
   - Use `GitHub - Commit Files and Create PR` to create a feature branch, commit multiple file additions, updates, or deletions (`delete: true`) in a single atomic Git Data API commit, and open a Pull Request.
   - Use `GitHub - Commit Files to Branch` to push follow-up commits to an existing feature branch.
4. **Review and diagnose CI**:
   - Use `GitHub - Get Pull Request Context` to fetch PR metadata, changed files + unified diffs, review comments, and CI check runs in a single call.
   - Use `GitHub - Get Workflow Run and Logs` (`Action: 'inspect'`) to inspect failed GitHub Actions jobs, failed steps, and the tail of job failure logs.

## Safety & Governance Rules

- **Never commit directly to protected branches** (`main`, `master`, `next`, `production`, or the repository's default branch). Always use a feature branch such as `agent/<topic>` or `fix/<issue>`.
- **App-token-never-merges**: Autonomous agent tokens open and update Pull Requests (`Draft: true` by default), while humans review and merge them. Do not call `GitHub - Merge Pull Request` unless explicitly instructed and authorized with a merge-enabled credential or human 3LO token.
