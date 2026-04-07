# Phase 2 Metadata Credential Type References
# Add these CredentialTypeID fields to each .{platform}.json when on the phase-2 branch

## Reusing existing credential types:
- `.wild-apricot.json` → `"CredentialTypeID": "@lookup:MJ: Credential Types.Name=OAuth2 Client Credentials"`
- `.constant-contact.json` → `"CredentialTypeID": "@lookup:MJ: Credential Types.Name=OAuth2 Client Credentials"`
- `.mailchimp.json` → `"CredentialTypeID": "@lookup:MJ: Credential Types.Name=API Key"`
- `.growthzone.json` → `"CredentialTypeID": "@lookup:MJ: Credential Types.Name=API Key with Endpoint"`
- `.personify360.json` → `"CredentialTypeID": "@lookup:MJ: Credential Types.Name=OAuth2 Client Credentials"`
- `.mj-to-mj.json` → `"CredentialTypeID": "@lookup:MJ: Credential Types.Name=API Key"`
- `.sharepoint.json` → `"CredentialTypeID": "@lookup:MJ: Credential Types.Name=Azure Service Principal"`

## New credential types (schemas created on phase-3 branch):
- `.blackbaud.json` → `"CredentialTypeID": "@lookup:MJ: Credential Types.Name=Blackbaud SKY API"`
- `.netsuite.json` → `"CredentialTypeID": "@lookup:MJ: Credential Types.Name=NetSuite TBA"`
