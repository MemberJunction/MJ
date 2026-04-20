# Business Application Actions

Action implementations for specific business application domains. Each package provides MemberJunction action wrappers for integrating with external business systems through the Actions framework.

## Packages

| Package | npm | Description |
|---------|-----|-------------|
| [Accounting](./Accounting/README.md) | `@memberjunction/actions-bizapps-accounting` | Accounting system integration actions (QuickBooks, NetSuite, Sage, Dynamics) |
| [CRM](./CRM/README.md) | `@memberjunction/actions-bizapps-crm` | CRM system integration actions (Salesforce, HubSpot, Dynamics, Pipedrive) |
| [FormBuilders](./FormBuilders/README.md) | `@memberjunction/actions-bizapps-formbuilders` | Form builder and survey platform integration actions (Typeform, Google Forms, Jotform) |
| [LMS](./LMS/README.md) | `@memberjunction/actions-bizapps-lms` | Learning management system integration actions (Moodle, Canvas, Blackboard, LearnDash) |
| [Social](./Social/README.md) | `@memberjunction/actions-bizapps-social` | Social media integration actions (Twitter, LinkedIn, Facebook, Instagram, TikTok, YouTube, HootSuite, Buffer) |

## Migration to Generic Integration Actions

BizApps action packages are progressively migrating to MemberJunction's generic, connector-driven action generation architecture. The new system automatically generates CRUD + Search + List actions from connector metadata, reducing per-integration maintenance. See **[Integration Actions Guide](../../Integration/INTEGRATION_ACTIONS.md)** for details on the new architecture and how connectors produce actions automatically.
