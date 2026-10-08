# Organization setup: your schemas and business context

How an organization configures the Citizen Agent Builder so its business users build agents against
the organization's **real entity schemas and relationships** instead of the default sample data.

---

## 1. Two Open Apps

To give builders a realistic environment without putting production data on personal machines, an
organization publishes two Open Apps:

| App | What it carries |
|---|---|
| **`<org>-platform`** | Your custom entities, fields, relationships, actions and queries. |
| **`<org>-sampledata`** | Synthetic records in the same shapes as production, with referential integrity. Declares `<org>-platform` as a dependency. |

When a workspace installs `<org>-sampledata`, MemberJunction installs `<org>-platform` first.

Why this works:
1. **Same entity shapes as production.** An agent built against the sample data runs in production
   without renaming a field.
2. **No personal data on laptops.** The records are synthetic by construction.
3. **Simple promotion.** Promoting an agent deploys its metadata; no code or schema mapping changes.

---

## 2. Set up once for your builders

Builders should not have to deal with GitHub access, sign-in configuration or provider keys. Give them
a short settings sheet (or a pre-filled `.env`) with:

| Setting in `.env` | What to provide |
|---|---|
| `OPEN_APP_INSTALL_URL` | Your sample-data app, e.g. `https://github.com/your-org/your-sampledata` |
| `GITHUB_TOKEN` | Only if that repository is private: a fine-grained, read-only token with `Contents: Read` on the sample-data and platform repositories. |
| `ENTRA_TENANT_ID` and `ENTRA_CLIENT_ID` (or `AUTH0_DOMAIN` and `AUTH0_CLIENT_ID`) | A single-page app registration for local builders, with `http://localhost:4202` registered as a redirect URI. One registration serves everyone. |
| An AI provider key | Ideally an organization-managed key per team. For Anthropic, keys must be created inside a workspace. |

Each builder adds their own `OWNER_EMAIL` (the account they sign in with), which gets the Developer
role so they can run the agents they build.

A builder then creates a workspace pointed at your app:
```bash
npx @memberjunction/cli@edge agent init ./my-agents --app https://github.com/your-org/your-sampledata
```
or, for an existing workspace, sets `OPEN_APP_INSTALL_URL` in `.env` and starts over with fresh
volumes (`docker compose down -v`, then `docker compose up -d`; this deletes the workspace's data).

### Using a local checkout instead of GitHub
If builders have your platform app checked out locally, mount it into the container with a
`docker-compose.override.yml` next to `docker-compose.yml`:
```yaml
services:
  mj:
    volumes:
      - /path/to/your-org-platform:/opt/apps/your-org-platform:ro
```
Then install it from inside the container:
```bash
docker compose exec mj mj app install /opt/apps/your-org-platform
```

---

## 3. Refresh the capabilities catalog

After your app installs, run:
```bash
./scripts/generate-capabilities.sh
```
`CAPABILITIES.md` then lists your apps (with their install status), entities, fields and actions, so
the coding agent builds with your real names.

---

## 4. Releasing new sample data

1. Generate synthetic records (for example with Loom).
2. Push them to a staging database with `mj sync push`.
3. Capture the SQL that `mj sync push` emits as the next `V<timestamp>__v<version>_Metadata_Sync.sql`
   migration in `<org>-sampledata`.
4. Publish a release of `<org>-sampledata`. New workspaces install it; existing ones get it with
   `docker compose exec mj mj app upgrade <app-name>`.
