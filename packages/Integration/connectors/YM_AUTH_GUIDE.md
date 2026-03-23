# YourMembership API Authentication Guide

## Overview

The YourMembership (YM) REST API uses session-based authentication via ServiceStack. Authentication produces a `SessionId` which is then passed on all subsequent data requests via the `X-SS-ID` header.

## Credentials

YM authentication requires three values:

| Credential | Description | Used As |
|---|---|---|
| **Client ID** | Numeric identifier for the YM instance/site | `ClientID` in auth body (as a number) |
| **License Key** | The API license key (a UUID) | `UserName` in auth body |
| **API Password** | The API password (a UUID) | `Password` in auth body |

**Important naming caveat:** The License Key is sent as `UserName` and the API Password is sent as `Password`. This is counterintuitive — the "key" goes in the username field and the "password" goes in the password field. This matches YM's ServiceStack credentials provider convention.

## Step 1: Authenticate (Get Session)

```
POST https://ws.yourmembership.com/Ams/Authenticate
Content-Type: application/json
Accept: application/json

{
  "provider": "credentials",
  "UserName": "<LICENSE_KEY>",
  "Password": "<API_PASSWORD>",
  "UserType": "Admin",
  "ClientID": <CLIENT_ID_AS_NUMBER>
}
```

### Success Response (HTTP 200)

```json
{
  "ClientID": 12345,
  "MemberID": 0,
  "FailedLoginReason": "None",
  "UserId": "b91f7dab-...",
  "SessionId": "5hCq7iMZ9kyMZhE4EnIe",
  "ResponseStatus": {}
}
```

Extract the `SessionId` value — this is your auth token for all data requests.

### Failure Response (HTTP 401)

```json
{
  "ClientID": 0,
  "MemberID": 0,
  "FailedLoginReason": "None",
  "ResponseStatus": {
    "ErrorCode": "None",
    "Message": "Invalid username/password combination."
  }
}
```

If you get 401, verify:
1. `UserName` contains the **License Key** (not the API Password)
2. `Password` contains the **API Password** (not the License Key)
3. `ClientID` is a **number**, not a string

## Step 2: Make Data Requests

All data requests use:
- URL pattern: `https://ws.yourmembership.com/Ams/{ClientID}/{Endpoint}`
- Session passed via `X-SS-ID` header (NOT as a query parameter)

```
GET https://ws.yourmembership.com/Ams/{ClientID}/{Endpoint}
Accept: application/json
X-SS-ID: <SessionId>
```

### Available Endpoints

| Endpoint | Returns | Paginated |
|---|---|---|
| `ClientConfig` | Site configuration info | No |
| `MemberList` | Member records | Yes |
| `MemberTypes` | Membership type definitions | No |
| `Memberships` | Membership records | No |
| `Events` | Event records | Yes |
| `Groups` | Group records (nested) | No |
| `Products` | Product records | No |
| `DonationFunds` | Donation fund records | No |
| `Certifications` | Certification records | No |

### Pagination

For paginated endpoints, use query parameters:
```
GET /Ams/{ClientID}/MemberList?PageNumber=1&PageSize=200
```

Response includes a `TotalRecords` field to determine when all pages have been fetched.

### Example: Fetch Member Types

```
GET https://ws.yourmembership.com/Ams/12345/MemberTypes
Accept: application/json
X-SS-ID: 5hCq7iMZ9kyMZhE4EnIe
```

Response:
```json
{
  "MemberTypes": [
    { "ID": 219892, "TypeCode": "Bronze Retail Member", "Name": "Bronze Retail Member", ... },
    ...
  ]
}
```

## Session Lifetime

- Sessions typically last **15 minutes**
- Cache the session and reuse it; re-authenticate on 401
- The connector caches sessions for 14 minutes to allow a safety margin

## Common Mistakes

1. **Swapped credentials** — The License Key goes in `UserName`, the API Password in `Password`. The naming is unintuitive.
2. **Using `?SessionId=` query param** — This does NOT work. Use the `X-SS-ID` header.
3. **Using `/Ams/MemberList` without ClientID** — The URL MUST include the ClientID: `/Ams/{ClientID}/MemberList`.
4. **Passing ClientID as a string** — `ClientID` must be a number in the JSON body, not a quoted string.
5. **Using `/auth/credentials`** — The ServiceStack standard auth endpoint returns 500. Use `/Ams/Authenticate`.

## Credential Storage in MemberJunction

In MJ, YM credentials are stored as an encrypted JSON blob in the `Credential` entity with `CredentialType = "YourMembership API"`. The JSON schema is:

```json
{
  "ClientID": "12345",
  "APIKey": "<license_key>",
  "APIPassword": "<api_password>"
}
```

The connector's `parseConfigJson()` maps:
- `APIKey` → sent as `UserName` in the auth request
- `APIPassword` → sent as `Password` in the auth request

## Reference Implementation

See `YourMembershipConnector.ts` in this package:
- `CreateSession()` — authentication
- `MakeRequest()` — data fetching with session retry on 401
- `BuildUrl()` — URL construction with ClientID path segment
- `FetchWithSession()` — adds `X-SS-ID` header
