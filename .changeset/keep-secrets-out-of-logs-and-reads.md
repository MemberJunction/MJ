---
"@memberjunction/core": minor
"@memberjunction/actions-base": minor
"@memberjunction/communication-types": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/server": minor
"@memberjunction/ai-agent-harness": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/postgresql-dataprovider": minor
"@memberjunction/sqlserver-dataprovider": minor
---

Keep secret values out of stored logs and out of reads by regular users. Record Changes write the encrypted-value sentinel in place of any field marked for encryption, in the change JSON and the change description; the record snapshot keeps an encrypted field only in its stored encrypted form, and a delete snapshot holds that encrypted form so a restore gives the value back. A save never stores the sentinel: an update keeps the stored value and a create stores null. The API read paths send a value of an encrypted field that is not yet in the encrypted format only when the field allows decryption in the API; otherwise they send its ciphertext or the sentinel. Action Execution Logs no longer store the values of parameters named as secrets (passwords, passphrases, client secrets, access and refresh tokens, API keys, authentication objects, webhook URLs, cookies) or of secret-named keys inside object parameters. A message can be marked `ContainsSecrets`, and its Communication Log then keeps the addresses and subject but not the body; magic-link invites, identity-claim emails and delivered realtime verification emails set it. Agent harness runs get granted credentials and the user's own delegated GitHub token through the credential engine. Metadata encrypts the MCP server OAuth client secret, the OAuth client registration secret, access token and registration response, and MCP connection environment variables, and the API no longer sends them. The UI role no longer reads Credentials, O Auth Client Registrations or Communication Logs, and reads only its own Action Execution Logs.
