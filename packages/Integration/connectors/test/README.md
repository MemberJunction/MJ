# Connector live tests — credential-safe

These harnesses validate connectors against their **real** APIs without ever exposing
the credential to anything but the process **you** launch. The same mechanism is what the
connector-builder **testing-agent** uses (`agentic/connector-builder` branch), so the
"agent can use the key by name but can never read its value" guarantee is identical for
manual runs and autonomous agent runs.

## The credential guarantee (kernel-enforced)

Claude's shell runs as your normal user with **no passwordless sudo**, and is blocked by
OS permissions from files it doesn't own. So a **root-owned, mode-600 file is physically
unreadable by Claude** — no `cat`/`node -e`/`python`/redirect trick bypasses a kernel
`EACCES`, and Claude can't escalate (sudo needs a password it can't supply). This is the
*real* barrier; Claude's own `deny` rules help but are leaky for Bash.

### 1) Store the key as a root-owned secret (one-time; you enter your password)
```bash
sudo bash -c 'umask 077; cat > /etc/mj-hubspot.env' <<'EOF'
HUBSPOT_PRIVATE_APP_TOKEN=pat-na1-xxxxxxxx
EOF
sudo chmod 600 /etc/mj-hubspot.env && sudo chown root:wheel /etc/mj-hubspot.env
```
Claude now gets permission-denied on `/etc/mj-hubspot.env` (verified: same as `/etc/sudoers`).

### 2) Run the test — YOU launch it (token lives only in your sudo session)
```bash
cd <repo-root>
sudo bash -c 'set -a; . /etc/mj-hubspot.env; set +a; exec node \
  packages/Integration/connectors/test/hubspot-live-test.mjs'
```
The harness reads `process.env.HUBSPOT_PRIVATE_APP_TOKEN` **by name**, injects it into the
connector in-process, and prints only a **token-redacted** JSON result (the runner scrubs
every secret value out of all output, including the connector's own logs). Paste that JSON
back to Claude — it contains no secret.

> Prereq: build the packages first (no token needed):
> `cd packages/Integration/engine && npm run build && cd ../connectors && npm run build`

## Tiers

- **Tier 1 — `hubspot-live-test.mjs` (no DB, runnable now):** `TestConnection` +
  `DiscoverObjects` + `DiscoverFields(contacts)`. Proves the token works and the connector
  talks to HubSpot with real data.
- **Tier 2 — full sync to Postgres AND SQL Server (incl. associations):** runs through the
  Docker **workbench**, which has MJ installed on both a SQL Server (`sql-claude`) and a
  Postgres (`postgres-claude`, `docker compose --profile postgres up`) instance. The flow
  is the real Apply: create the `hubspot` schema/entities → CodeGen the CRUD layer → sync
  `contacts` → `companies` → `assoc_contacts_companies`. Associations require their
  from-side parent (contacts/companies) to be synced first — which is exactly the
  DAG-ordering that the composite-PK FK inference now provides — so Tier 2 is what factually
  confirms "associations fill in" on both dialects. (Harness driven the same credential-safe
  way; the credentialed sync step is launched by you under `sudo`.)

## Agent-architecture reuse

`credential-safe-runner.mjs` is connector-agnostic. The testing-agent invokes it as a
subprocess passing only the env-var NAMES of the secrets a connector's `CredentialType`
declares; the values are injected by the out-of-band runner the agent does not control; the
agent reads the scrubbed JSON result. No credential bytes ever enter the agent's context —
the same guarantee you get manually.
