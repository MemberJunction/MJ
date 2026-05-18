# HubSpot Connector — Credential Setup

How to obtain the API credentials this connector needs and where to put them in MemberJunction.

The connector authenticates to HubSpot's REST API using **OAuth 2.0 authorization-code grant** with a refresh token. You need three values:

```json
{
  "ClientId":     "<from your HubSpot app>",
  "ClientSecret": "<from your HubSpot app>",
  "RefreshToken": "<from the auth-code exchange>"
}
```

There are two ways to get them, depending on whether you control the HubSpot portal you're integrating with.

---

## Path A — You control the portal (recommended for single-tenant deployments)

Use a **Private App**. Simpler — no OAuth dance, one long-lived token. **Note**: Private Apps issue a single long-lived `access_token` only. This connector's auth code is built around the OAuth refresh-token flow, so a Private App requires the alternate auth path documented below.

### 1. Create the Private App in HubSpot

1. Log into the HubSpot portal you want to integrate.
2. Top-right gear icon → **Settings**.
3. Left nav → **Integrations** → **Private Apps**.
4. **Create a private app**.
5. Tab **Basic Info**: give it a name (e.g. `MemberJunction Sync`) and description.
6. Tab **Scopes**: enable the scopes listed in **§ Required scopes** below.
7. **Create app** → **Continue creating**.

### 2. Copy the access token

After creation, HubSpot shows the **Access token** once. Click **Show token** → **Copy**. **Save it somewhere safe** — you cannot retrieve it again from the UI (you can rotate it, which generates a new token).

### 3. Wire into MemberJunction

Private-app access tokens don't expire and don't have a refresh-token. To use one with this connector, populate `MJ: Company Integration.Configuration` like this:

```json
{
  "ClientId":     "private-app",
  "ClientSecret": "private-app",
  "RefreshToken": "<paste the access token here>"
}
```

The `ClientId` / `ClientSecret` are placeholders — the connector's `OAuth2TokenManager` only actually exercises the refresh path when the cached token expires. For Private Apps the token never expires, so the placeholders are never used. (If your security policy requires distinct values, use any non-empty string.)

---

## Path B — You're building an app for HubSpot customers (OAuth Public App)

Use this when end-customers connect their own HubSpot portals (multi-tenant scenarios).

### 1. Register a Public App

1. In any HubSpot portal you own, go to **Settings → Integrations → Apps**, or visit https://developers.hubspot.com/.
2. **Create app** → fill in basic info + redirect URL (must match exactly when you initiate the OAuth flow).
3. Tab **Auth**: HubSpot shows your **Client ID** and **Client secret**. Copy both — these are stable across tenants.
4. Tab **Scopes**: enable the scopes listed in **§ Required scopes** below.

### 2. Get a refresh token for each tenant

For each HubSpot portal you want to sync, run the OAuth authorization-code exchange once:

**Step 2a — Authorize URL (sent to the user in their browser):**

```
https://app.hubspot.com/oauth/authorize
  ?client_id=<your-client-id>
  &redirect_uri=<your-redirect-uri>
  &scope=<space-separated-scopes>
```

User logs in, approves; HubSpot redirects to `<redirect_uri>?code=<auth-code>`.

**Step 2b — Exchange the code for tokens:**

```bash
curl -X POST https://api.hubapi.com/oauth/v1/token \
  -d 'grant_type=authorization_code' \
  -d 'client_id=<your-client-id>' \
  -d 'client_secret=<your-client-secret>' \
  -d 'redirect_uri=<your-redirect-uri>' \
  -d 'code=<auth-code-from-step-2a>'
```

Response:

```json
{
  "access_token": "...",
  "refresh_token": "<KEEP THIS>",
  "expires_in": 1800,
  "token_type": "bearer"
}
```

Capture `refresh_token`. The `access_token` expires in 30 minutes; the connector regenerates it from `refresh_token` automatically.

### 3. Wire into MemberJunction

For each tenant, create one `MJ: Company Integration` row with:

```json
{
  "ClientId":     "<client-id-from-step-1>",
  "ClientSecret": "<client-secret-from-step-1>",
  "RefreshToken": "<refresh-token-from-step-2b>"
}
```

---

## Required scopes

The connector touches 327 objects across 15 categories. Minimum for CRM-only sync:

- `crm.objects.contacts.read`
- `crm.objects.contacts.write` (if writes are enabled)

For broader coverage, add scopes per category. The complete list HubSpot exposes is at https://developers.hubspot.com/docs/api/working-with-oauth#scopes. Typical extensions:

| Coverage | Scopes to add |
|---|---|
| Companies, Deals, Tickets | `crm.objects.companies.{read,write}`, `crm.objects.deals.{read,write}`, `tickets` |
| Custom objects | `crm.objects.custom.{read,write}`, `crm.schemas.custom.{read,write}` |
| Engagements (calls, emails, notes, tasks) | `crm.objects.notes.{read,write}`, `crm.objects.calls.{read,write}`, `crm.objects.emails.{read,write}`, `crm.objects.tasks.{read,write}` |
| Pipelines | `crm.pipelines.{deals,tickets}.{read,write}` |
| Owners (assigned-to users) | `crm.objects.owners.read` |
| Marketing | `content`, `forms`, `marketing-email`, `marketing.campaigns.{read,write}` |
| Automation / Workflows | `automation` |
| CMS | `content`, `hubdb` |
| Conversations | `conversations.read`, `conversations.write` |
| Files | `files` |
| Settings | `settings.users.read`, `accounting` |
| Webhooks | `oauth` (always required if the app uses webhooks) |

Only enable what you need — HubSpot's consent screen lists every scope you request, and customers may decline overly-broad apps.

---

## Verifying the connection

After saving the configuration:

1. From MemberJunction, run **Test Connection** on the Company Integration row.
2. A success returns a green status and the message "Connection successful".
3. A failure surfaces the underlying error — the most common are:
   - **`HTTP 401`** — `RefreshToken` is invalid or revoked. Repeat Path A or Path B Step 2b.
   - **`HTTP 403`** — Token is valid but missing a required scope. Add the scope in HubSpot, then re-authorize (Path B) or recreate the Private App (Path A).
   - **`HTTP 429`** — Rate limit hit (100 req/10s per app). Usually transient; the connector's retry logic absorbs it.

---

## Where credentials live

- Credentials are stored in `MJ: Company Integration.Configuration` as JSON.
- They are never copied into log files, agent context, or the connector source.
- Rotating credentials: regenerate the refresh token (Path B Step 2b) or rotate the Private App token (Path A), then update the `Configuration` JSON. The connector picks up the new value on its next sync run.

## Links

- HubSpot developer hub: https://developers.hubspot.com/
- OAuth working guide: https://developers.hubspot.com/docs/api/working-with-oauth
- Scopes reference: https://developers.hubspot.com/docs/api/working-with-oauth#scopes
- Private Apps overview: https://developers.hubspot.com/docs/api/private-apps
- API rate limits: https://developers.hubspot.com/docs/getting-started/overview
