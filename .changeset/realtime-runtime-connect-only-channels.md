---
"@memberjunction/realtime-runtime": patch
---

On a connect-only provider (`ConnectGraphQLClient`), the realtime session reads the `MJ: AI Agent Channels` registry over GraphQL instead of starting with no channels, so anonymous embeds keep their channel tools (Whiteboard, Media) at mint.
