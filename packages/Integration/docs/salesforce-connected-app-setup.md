# Salesforce Connected App Setup Guide

This guide walks through creating and configuring a Salesforce Connected App for MemberJunction's JWT Bearer Token authentication flow.

## Overview

MemberJunction authenticates to Salesforce using the **OAuth 2.0 JWT Bearer Token** flow. This is a server-to-server flow that does not require user interaction — the MJ server signs a JWT with a private key, and Salesforce validates it against a pre-uploaded X.509 certificate.

## Step 1: Generate RSA Key Pair

Generate a 2048-bit RSA key pair on the machine that will run MemberJunction:

```bash
# Generate private key
openssl genrsa -out salesforce-key.pem 2048

# Generate self-signed X.509 certificate (valid for 10 years)
openssl req -new -x509 -key salesforce-key.pem -out salesforce-cert.pem -days 3650 \
  -subj "/CN=MemberJunction Integration/O=Your Organization/C=US"
```

This produces:
- `salesforce-key.pem` — Private key (stays on your MJ server, never shared)
- `salesforce-cert.pem` — X.509 certificate (uploaded to Salesforce)

## Step 2: Create Connected App in Salesforce

1. Log in to Salesforce as an administrator
2. Navigate to **Setup** → **App Manager** (or **Setup** → **Apps** → **App Manager**)
3. Click **New Connected App**
4. Fill in the required fields:
   - **Connected App Name**: `MemberJunction Integration`
   - **API Name**: `MemberJunction_Integration` (auto-populated)
   - **Contact Email**: Your admin email address

## Step 3: Configure OAuth Settings

1. Check **Enable OAuth Settings**
2. Set **Callback URL** to `https://login.salesforce.com/services/oauth2/callback` (required but not used for JWT flow)
3. Check **Use digital signatures**
4. Click **Choose File** and upload `salesforce-cert.pem` from Step 1
5. Add these **Selected OAuth Scopes**:
   - `Access and manage your data (api)`
   - `Perform requests at any time (refresh_token, offline_access)`
6. Click **Save**, then **Continue**

## Step 4: Pre-Authorize the Integration User

The JWT Bearer flow requires the integration user to be pre-authorized on the Connected App. There are two ways to do this:

### Option A: Admin Pre-Authorization (Recommended)

1. Go to **Setup** → **App Manager**
2. Find the Connected App and click **Manage**
3. Click **Edit Policies**
4. Set **Permitted Users** to `Admin approved users are pre-authorized`
5. Click **Save**
6. Back on the Manage page, scroll to **Profiles** or **Permission Sets**
7. Add the profile or permission set of your integration user

### Option B: User Consent Flow (One-Time)

Have the integration user visit this URL once in a browser to grant consent:

```
https://login.salesforce.com/services/oauth2/authorize?
  response_type=token&
  client_id={YOUR_CONSUMER_KEY}&
  redirect_uri=https://login.salesforce.com/services/oauth2/callback
```

## Step 5: Get the Consumer Key

1. Go to **Setup** → **App Manager**
2. Find the Connected App and click the dropdown arrow → **View**
3. Under **API (Enable OAuth Settings)**, find **Consumer Key**
4. Copy this value — it is the `clientId` for MJ credential configuration

## Step 6: Identify the Integration User

Choose or create a Salesforce user that will be used for the integration:

- The user must have a profile with API access
- The user must have Read/Write permissions on the objects you want to sync
- The user's email address is the `username` for MJ credential configuration
- **Best practice**: Create a dedicated integration user (e.g., `mj-integration@yourorg.com`) rather than using a personal account

## Step 7: Configure MJ Credential

In MemberJunction, create a credential record of type **Salesforce JWT Bearer** with:

| Field | Value |
|---|---|
| **Login URL** | `https://login.salesforce.com` (production) or `https://test.salesforce.com` (sandbox) |
| **Consumer Key** | The Consumer Key from Step 5 |
| **Integration User** | The email of the Salesforce user from Step 6 |
| **Private Key (PEM)** | The contents of `salesforce-key.pem` from Step 1 |
| **API Version** | `61.0` (default, or your preferred version) |

### Private Key Format

The private key must be the full PEM content including headers:

```
-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWep4PAtGoLFt0A3...
...
-----END RSA PRIVATE KEY-----
```

## Step 8: Test the Connection

After configuring the credential and linking it to a Company Integration record, use MemberJunction's integration management UI or API to test the connection. The connector calls Salesforce's API version endpoint to verify authentication.

A successful test confirms:
- The JWT is properly signed with the private key
- Salesforce accepts the certificate
- The integration user is pre-authorized
- The `instance_url` is reachable

## Troubleshooting

### "invalid_grant" — user hasn't approved this consumer

The integration user has not been pre-authorized. Follow Step 4 above to either:
- Set the Connected App to admin-approved and add the user's profile, or
- Have the user complete the one-time consent flow

### "invalid_grant" — invalid assertion

- Verify the private key matches the certificate uploaded to the Connected App
- Check that the `clientId` (Consumer Key) is correct
- Ensure the `loginUrl` matches the org type (don't use `login.salesforce.com` for a sandbox)

### "invalid_client_id"

The Consumer Key is incorrect. Double-check it in Salesforce Setup → App Manager → View.

### "invalid_client" — certificate associated with consumer key is invalid

The X.509 certificate uploaded to the Connected App doesn't match the private key used for signing. Re-generate the certificate from the same private key (Step 1) and re-upload it (Step 3).

### Connection works but API calls return 403

The integration user's profile lacks the required permissions. Check:
- **System Permissions**: "API Enabled" must be checked
- **Object Permissions**: Read/Write on target objects
- **Field-Level Security**: Field visibility for the user's profile

## Security Best Practices

1. **Rotate keys periodically**: Generate a new key pair annually and update both the MJ credential and the Connected App certificate
2. **Use a dedicated integration user**: Don't share credentials with human users
3. **Minimum permissions**: Grant only the object/field access needed for your sync configuration
4. **Monitor API usage**: Check Salesforce Setup → Company Information for daily API call consumption
5. **Sandbox testing**: Always test new configurations in a sandbox before production
6. **Key storage**: Store the private key securely — it grants full API access as the integration user
