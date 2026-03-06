# Communication Packages

MemberJunction's communication infrastructure — message composition, delivery, and entity-level communication integration.

## Packages

| Package | npm | Description |
|---------|-----|-------------|
| [base-types](./base-types/README.md) | `@memberjunction/communication-types` | Core interfaces, base provider abstract class, message/recipient types, and template integration types |
| [engine](./engine/README.md) | `@memberjunction/communication-engine` | Main communication engine — provider management, template rendering, message orchestration, and batch processing |
| [entity-comm-base](./entity-comm-base/README.md) | `@memberjunction/entity-communications-base` | Base types for client/server use with the Entity Communications Engine |
| [entity-comm-client](./entity-comm-client/README.md) | `@memberjunction/entity-communications-client` | Client-side GraphQL integration for entity communications and template preview |
| [entity-comm-server](./entity-comm-server/README.md) | `@memberjunction/entity-communications-server` | Server-side bridge between the MJ entities framework and the communication framework |
| [notifications](./notifications/README.md) | `@memberjunction/notifications` | Unified notification system with multi-channel delivery via the communication engine |

### [providers](./providers/README.md)

Email and SMS delivery provider implementations.

| Package | npm | Description |
|---------|-----|-------------|
| [gmail](./providers/gmail/README.md) | `@memberjunction/communication-gmail` | Gmail/Google Suite provider for MemberJunction Communication framework |
| [MSGraph](./providers/MSGraph/README.md) | `@memberjunction/communication-ms-graph` | Microsoft Graph provider for the MJ Communication framework |
| [sendgrid](./providers/sendgrid/README.md) | `@memberjunction/communication-sendgrid` | SendGrid provider for the MJ Communication framework |
| [twilio](./providers/twilio/README.md) | `@memberjunction/communication-twilio` | Twilio provider for MemberJunction Communication framework |
