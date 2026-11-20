---
"@memberjunction/core": minor
"@memberjunction/actions-base": minor
"@memberjunction/communication-types": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/server": minor
---

Keep secret values out of stored logs and out of reads by regular users. Record Changes write the encrypted-value sentinel in place of any field marked for encryption, in the change JSON, the change description and the record snapshot. Action Execution Logs no longer store the values of parameters named as secrets (passwords, client secrets, access and refresh tokens, API keys) or of secret-named keys inside object parameters. A message can be marked `ContainsSecrets`, and its Communication Log then keeps the addresses and subject but not the body; magic-link invites, identity-claim emails and delivered realtime verification emails set it. Metadata encrypts the MCP server OAuth client secret, the OAuth client registration secret and access token, and MCP connection environment variables, and the API no longer sends them. The UI role no longer reads Credentials, O Auth Client Registrations or Communication Logs, and reads only its own Action Execution Logs.
