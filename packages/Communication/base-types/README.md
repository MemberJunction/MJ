# @memberjunction/communication-types

Core types, interfaces, and abstract base classes for the MemberJunction Communication Framework. This package defines the contract that all communication providers must implement, along with shared message types, credential utilities, and the communication engine base class.

## Architecture

```mermaid
graph TD
    subgraph base["@memberjunction/communication-types"]
        ENGINE["CommunicationEngineBase"]
        BCP["BaseCommunicationProvider"]
        MSG["Message / ProcessedMessage"]
        CRED["Credential Utilities"]
        TYPES["Params and Result Types"]
    end

    subgraph providers["Provider Implementations"]
        SG["SendGrid Provider"]
        GM["Gmail Provider"]
        TW["Twilio Provider"]
        MSP["MS Graph Provider"]
    end

    subgraph engine["@memberjunction/communication-engine"]
        CE["CommunicationEngine"]
    end

    ENGINE --> CE
    BCP --> SG
    BCP --> GM
    BCP --> TW
    BCP --> MSP
    MSG --> BCP
    CRED --> BCP
    TYPES --> BCP

    style base fill:#2d6a9f,stroke:#1a4971,color:#fff
    style providers fill:#2d8659,stroke:#1a5c3a,color:#fff
    style engine fill:#7c5295,stroke:#563a6b,color:#fff
```

## Installation

```bash
npm install @memberjunction/communication-types
```

## Key Exports

### CommunicationEngineBase

Singleton base class that loads communication metadata (providers, message types, entity communication fields) and provides lifecycle management for communication runs and logs.

```typescript
import { CommunicationEngineBase } from '@memberjunction/communication-types';

const engine = CommunicationEngineBase.Instance;
await engine.Config(false, contextUser);

// Access loaded metadata
const providers = engine.Providers;           // MJCommunicationProviderEntityExtended[]
const messageTypes = engine.BaseMessageTypes; // CommunicationBaseMessageTypeEntity[]
```

### BaseCommunicationProvider

Abstract base class that all communication providers must extend. Defines both core operations (must implement) and extended mailbox operations (optional override).

```mermaid
classDiagram
    class BaseCommunicationProvider {
        <<abstract>>
        +SendSingleMessage(message, credentials?) MessageResult
        +GetMessages(params, credentials?) GetMessagesResult
        +ForwardMessage(params, credentials?) ForwardMessageResult
        +ReplyToMessage(params, credentials?) ReplyToMessageResult
        +CreateDraft(params, credentials?) CreateDraftResult
        +getSupportedOperations() ProviderOperation[]
        +supportsOperation(op) boolean
        +GetSingleMessage() GetSingleMessageResult
        +DeleteMessage() DeleteMessageResult
        +MoveMessage() MoveMessageResult
        +ListFolders() ListFoldersResult
        +MarkAsRead() MarkAsReadResult
        +ArchiveMessage() ArchiveMessageResult
        +SearchMessages() SearchMessagesResult
        +ListAttachments() ListAttachmentsResult
        +DownloadAttachment() DownloadAttachmentResult
        +GetEvents() GetEventsResult
    }

    class SendGridProvider {
        SendSingleMessage only
    }
    class GmailProvider {
        All 14 operations
    }
    class MSGraphProvider {
        All 14 operations
    }
    class TwilioProvider {
        Send Get Forward Reply
    }

    BaseCommunicationProvider <|-- SendGridProvider
    BaseCommunicationProvider <|-- GmailProvider
    BaseCommunicationProvider <|-- MSGraphProvider
    BaseCommunicationProvider <|-- TwilioProvider

    style BaseCommunicationProvider fill:#2d6a9f,stroke:#1a4971,color:#fff
    style SendGridProvider fill:#b8762f,stroke:#8a5722,color:#fff
    style GmailProvider fill:#2d8659,stroke:#1a5c3a,color:#fff
    style MSGraphProvider fill:#2d8659,stroke:#1a5c3a,color:#fff
    style TwilioProvider fill:#7c5295,stroke:#563a6b,color:#fff
```

#### Core Operations (Abstract -- Must Implement)

| Method | Description |
|--------|-------------|
| `SendSingleMessage()` | Send a single message through the provider |
| `GetMessages()` | Retrieve messages from the provider |
| `ForwardMessage()` | Forward a message to new recipients |
| `ReplyToMessage()` | Reply to an existing message |
| `CreateDraft()` | Create a draft message (return error if unsupported) |

#### Extended Operations (Optional -- Override to Support)

These methods have default implementations that return "not supported" errors. Override them in providers that have full mailbox access.

| Method | Description |
|--------|-------------|
| `GetSingleMessage()` | Retrieve a single message by ID |
| `DeleteMessage()` | Delete or trash a message |
| `MoveMessage()` | Move a message to a different folder |
| `ListFolders()` | List available folders/labels |
| `MarkAsRead()` | Mark messages as read or unread |
| `ArchiveMessage()` | Archive a message |
| `SearchMessages()` | Search messages by query string |
| `ListAttachments()` | List attachments on a message |
| `DownloadAttachment()` | Download an attachment by ID |
| `GetEvents()` | Read calendar events for one calendar |

#### Capability Discovery

```typescript
const operations = provider.getSupportedOperations();

if (provider.supportsOperation('SearchMessages')) {
    const results = await provider.SearchMessages({ Query: 'invoice' });
}
```

### Message Classes

- **Message**: Holds all data for a single communication including optional template references, CC/BCC recipients, headers, and scheduled send time.
- **ProcessedMessage**: Abstract subclass of `Message` with rendered content (`ProcessedBody`, `ProcessedHTMLBody`, `ProcessedSubject`) and a `Process()` method for template rendering.
- **MessageRecipient**: Represents a single recipient with per-recipient template context data.
- **MessageResult**: Result of a send operation including success/failure status, error details, and the processed message.

```typescript
import { Message, ProcessedMessage, MessageRecipient } from '@memberjunction/communication-types';

const message = new Message();
message.From = 'sender@example.com';
message.To = 'recipient@example.com';
message.Subject = 'Hello';
message.Body = 'Plain text body';
message.HTMLBody = '<p>HTML body</p>';
message.CCRecipients = ['cc@example.com'];
message.BCCRecipients = ['bcc@example.com'];
message.Headers = { 'X-Custom': 'value' };
message.SendAt = new Date('2025-01-01');

// Template-based messages
message.BodyTemplate = templateEntity;
message.SubjectTemplate = subjectTemplateEntity;
message.ContextData = { name: 'John', company: 'Acme Corp' };
```

### Credential Utilities

The credential system supports per-request credential overrides while maintaining backward compatibility with environment variables.

```typescript
import {
    ProviderCredentialsBase,
    resolveCredentialValue,
    validateRequiredCredentials,
    resolveCredentials
} from '@memberjunction/communication-types';

// Resolve a single credential (request value takes precedence over env fallback)
const apiKey = resolveCredentialValue(
    credentials?.apiKey,        // from request
    process.env.SENDGRID_KEY,   // environment fallback
    false                       // disableEnvironmentFallback
);

// Validate all required fields are present
validateRequiredCredentials(
    { apiKey, tenantId },
    ['apiKey', 'tenantId'],
    'MyProvider'
);

// Resolve multiple fields with source tracking
const result = resolveCredentials(
    requestCredentials,
    envCredentials,
    ['apiKey', 'secret'],
    false
);
// result.source: 'request' | 'environment' | 'mixed'
// result.fieldSources: { apiKey: 'request', secret: 'environment' }
```

### Communication Runs and Logging

The engine provides methods for tracking communication activities through database entities:

```typescript
const run = await engine.StartRun();
const log = await engine.StartLog(processedMessage, run);
// ... send message ...
log.Status = 'Complete';
await log.Save();
await engine.EndRun(run);
```

## Type Definitions

All parameter and result types used across the framework:

| Type | Purpose |
|------|---------|
| `GetMessagesParams` / `GetMessagesResult` | Message retrieval |
| `ForwardMessageParams` / `ForwardMessageResult` | Message forwarding |
| `ReplyToMessageParams` / `ReplyToMessageResult` | Message replies |
| `CreateDraftParams` / `CreateDraftResult` | Draft creation |
| `GetSingleMessageParams` / `GetSingleMessageResult` | Single message retrieval |
| `DeleteMessageParams` / `DeleteMessageResult` | Message deletion |
| `MoveMessageParams` / `MoveMessageResult` | Folder management |
| `ListFoldersParams` / `ListFoldersResult` | Folder listing |
| `MarkAsReadParams` / `MarkAsReadResult` | Read status |
| `SearchMessagesParams` / `SearchMessagesResult` | Message search |
| `ListAttachmentsParams` / `ListAttachmentsResult` | Attachment listing |
| `DownloadAttachmentParams` / `DownloadAttachmentResult` | Attachment download |
| `GetEventsParams` / `GetEventsResult` / `GetEventsEvent` | Calendar retrieval |
| `ProviderOperation` | Union type of all operation names |
| `MessageFolder` / `MessageAttachment` | Data structures for folders and attachments |

### Received messages: direction and Bcc

`GetMessageMessage` has two optional fields a provider fills when it can tell:

- `Direction` (`'Inbound' | 'Outbound'`): whether the mailbox being read received or sent the message. Mail sent on someone's behalf from that mailbox is `Outbound`, although its `From` is the other person.
- `BCCRecipients`: blind-copy recipients, present only on the sending mailbox's copy.

`undefined` means the provider does not say; it is not the same as `Inbound` or an empty list. MS Graph fills both; other providers leave them undefined.

`ForwardMessageParams.ContextData` matches the other operations: MS Graph reads `ContextData.Email` as the mailbox to forward from, which a stored Azure Service Principal credential (no account email) needs.

## Communications V2

V2 adds a compliance-gated send pipeline to the framework. This package holds its contracts; the
implementation is in [`@memberjunction/communication-engine`](../engine/README.md). The full picture, including
the data flow, entities and worked examples for every extension point, is in the
[Communications V2 Guide](../../../guides/COMMUNICATIONS_V2_GUIDE.md).

### What this package adds

| File | Exports |
|------|---------|
| `src/V2Types.ts` | The V2 DTOs. Every export and field has TSDoc; read it there rather than here. |
| `src/V2Drivers.ts` | The driver base classes and `PrincipalMessageContext`. |
| `src/BaseProvider.ts` | `Message.CorrelationLogID`, `Message.DisableProviderTracking`, `MessageResult.ProviderMessageID`; `NormalizedNotification.Kind = 'activity'` with `ActivityEvents`; `CreateDomainAuthentication` / `VerifyDomainAuthentication` / `DeleteDomainAuthentication` on `BaseCommunicationProvider` and the matching `ProviderOperation` values. |
| `src/BaseEngine.ts` | `CommunicationEngineBase` now also caches `Principals`, `SenderTypes`, `Jurisdictions`, `JurisdictionMembers`, `ComplianceRegimes`, `ComplianceRuleTypes`, `ComplianceRegimeRules`, `ComplianceRegimeJurisdictions` and `SuppressionPolicies`. |

### DTOs by purpose

| Purpose | Types |
|---------|-------|
| Describing a send | `SendingEnvelope`, `MessagePayload`, `RecipientSendTarget`, `PrincipalRecordRef`, `EndpointTarget`, `SendToPrincipalsParams` |
| Send results | `SendV2Result`, `SendV2RecipientOutcome`, `SendV2OutcomeStatus` |
| Eligibility | `EvaluateEligibilityParams`, `EvaluateEligibilityResult`, `SendableRecipient`, `BlockedRecipient`, `ResolvedEndpoint`, `PrincipalAttributes` |
| The gate and rule drivers | `ComplianceEvalContext`, `ComplianceRuleOutcome`, `ComplianceObligations`, `ComplianceGateResult`, `ComplianceAuditSnapshot` |
| Delivery and engagement events | `NormalizedActivityEvent` |
| Sending-domain authentication | `DomainDNSRecord`, `CreateDomainAuthParams`, `CreateDomainAuthResult`, `VerifyDomainAuthParams`, `VerifyDomainAuthResult`, `DeleteDomainAuthParams` |
| Templated sends | `RenderAndSendParams`, `ITemplatedCommunicationService` |
| Value lists derived from the generated entities | `MessageClass`, `NormalizedActivityEventType`, `SuppressionReason`, `SuppressionSource`, `ConsentSource`, `PreferenceState`, `OptInMethod`, `EnforcementMode`, `SendingDomainStatus`, `EndpointStatus` |

The value-list types are indexed-access types over the generated entity classes
(`MJCommunicationSuppressionEntity['Reason']`), so they follow the database CHECK constraints. Derive from them;
do not copy the unions.

### Driver base classes

Each is registered with `@RegisterClass(<base>, '<DriverClass>')` and named in a metadata row.

| Base class | Named in | Implement |
|------------|----------|-----------|
| `BaseComplianceRule<TMerged>` | `MJ: Communication Compliance Rule Types`.`DriverClass` | `MergeStrictest(parameterSets)`, `Evaluate(merged, ctx)` |
| `BaseCommunicationPrincipal` | `MJ: Communication Principals`.`DriverClass` | `ResolveEndpoints`, `ResolveJurisdiction`, `ResolveAttributes`; optional `PreProcess`, `PostProcess`, `OnActivity` |
| `BaseCommunicationSender` | `MJ: Communication Sender Types`.`DriverClass` | Optional `ResolveTemplateContext` |
| `BaseCommunicationSuppressionPolicy` | `MJ: Communication Suppression Policies`.`DriverClass` | `Evaluate(events, parameters, contextUser)` |

A minimal rule driver:

```typescript
import { RegisterClass } from '@memberjunction/global';
import {
    BaseComplianceRule,
    ComplianceEvalContext,
    ComplianceRuleOutcome,
} from '@memberjunction/communication-types';

interface RequireFooterMerged {
    Required: boolean;
}

@RegisterClass(BaseComplianceRule, 'RequireFooterRuleDriver')
export class RequireFooterRuleDriver extends BaseComplianceRule<RequireFooterMerged> {
    public MergeStrictest(parameterSets: ReadonlyArray<Record<string, unknown>>): RequireFooterMerged {
        return { Required: parameterSets.some((p) => p['required'] === true) };
    }

    public Evaluate(merged: RequireFooterMerged, ctx: ComplianceEvalContext): ComplianceRuleOutcome {
        return {
            Passed: true,
            ObligationsPatch: {
                RequireFooterUnsubscribe: merged.Required && ctx.MessageClass !== 'Transactional',
            },
        };
    }
}
```

### Provider contract additions

A provider that wants its sends correlated with delivery events should attach `Message.CorrelationLogID` to
the outgoing message as provider metadata, honor `Message.DisableProviderTracking`, pass `Message.Headers`
through, and return `MessageResult.ProviderMessageID`. To support sending-domain authentication, override the
three `*DomainAuthentication` methods and list them in `getSupportedOperations()`; the base implementations
return `Success: false` with a "does not support" message. See section 13.5 of the guide.

### Configuration

This package reads no environment variables for V2. The settings that affect V2 are listed in the guide's
[configuration reference](../../../guides/COMMUNICATIONS_V2_GUIDE.md#12-configuration-reference).

## Dependencies

| Package | Purpose |
|---------|---------|
| `@memberjunction/core` | BaseEngine, UserInfo, logging utilities |
| `@memberjunction/core-entities` | Generated entity types for Communication metadata |
| `@memberjunction/global` | RegisterClass decorator and MJGlobal class factory |
| `@memberjunction/templates-base-types` | Template entity types for message templating |

## Development

```bash
npm run build    # Compile TypeScript
npm start        # Watch mode
```
