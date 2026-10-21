---
"@memberjunction/graphql-dataprovider": patch
---

The client falls back to data-only RunQuery cache validation only when the server's schema rejects `definitionHash` (the unknown output field or unknown input field errors, with their GraphQL validation codes). Any other error that names the field now fails normally instead of relaxing the definition check for five minutes.
