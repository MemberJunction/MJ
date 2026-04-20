# @memberjunction/notifications

Unified notification engine for MemberJunction that handles in-app, email, and SMS delivery based on notification types and user preferences. This server-side package coordinates between the MJ entity system, template engine, and communication engine to deliver notifications through the appropriate channels.

## Architecture

```mermaid
graph TD
    subgraph notif["@memberjunction/notifications"]
        NE["NotificationEngine\n(Singleton)"]
        TYPES["SendNotificationParams\nNotificationResult\nDeliveryChannels"]
    end

    subgraph entities["MJ Entity System"]
        UNT["UserNotificationTypes"]
        UNP["UserNotificationPreferences"]
        UNN["UserNotifications\n(In-App Records)"]
    end

    subgraph comm["@memberjunction/communication-engine"]
        CE["CommunicationEngine"]
    end

    subgraph templates["@memberjunction/templates"]
        TE["TemplateEngineServer"]
    end

    subgraph providers["Delivery Channels"]
        INAPP["In-App\n(Database Record)"]
        EMAIL["Email\n(via SendGrid)"]
        SMS["SMS\n(via Twilio)"]
    end

    NE -->|reads types| UNT
    NE -->|checks prefs| UNP
    NE -->|creates| UNN
    NE -->|sends via| CE
    CE -->|renders| TE
    UNN --> INAPP
    CE --> EMAIL
    CE --> SMS

    style notif fill:#7c5295,stroke:#563a6b,color:#fff
    style entities fill:#2d6a9f,stroke:#1a4971,color:#fff
    style comm fill:#2d8659,stroke:#1a5c3a,color:#fff
    style templates fill:#b8762f,stroke:#8a5722,color:#fff
    style providers fill:#2d8659,stroke:#1a5c3a,color:#fff
```

## Installation

```bash
npm install @memberjunction/notifications
```

## Usage

### Sending a Notification

```typescript
import { NotificationEngine } from '@memberjunction/notifications';
import { SendNotificationParams } from '@memberjunction/notifications';

const engine = NotificationEngine.Instance;
await engine.Config(false, contextUser);

const params: SendNotificationParams = {
    userId: 'user-uuid',
    typeNameOrId: 'Agent Completion',
    title: 'Agent Run Finished',
    message: 'Your AI agent has completed processing.',
    templateData: {
        agentName: 'Data Analyzer',
        duration: '2m 34s'
    },
    resourceTypeId: 'resource-type-uuid',
    resourceRecordId: 'agent-run-uuid',
    resourceConfiguration: { conversationId: 'conv-uuid' }
};

const result = await engine.SendNotification(params, contextUser);

if (result.success) {
    console.log('Channels used:', result.deliveryChannels);
    // { inApp: true, email: true, sms: false }
}
```

### Forcing Delivery Channels

Override user preferences and type defaults by specifying exact channels:

```typescript
const result = await engine.SendNotification({
    userId: 'user-uuid',
    typeNameOrId: 'System Alert',
    title: 'Critical Error',
    message: 'Database connection lost',
    forceDeliveryChannels: {
        inApp: true,
        email: true,
        sms: true
    }
}, contextUser);
```

## Channel Resolution Logic

```mermaid
flowchart TD
    START["SendNotification()"] --> FORCE{"forceDeliveryChannels\nspecified?"}
    FORCE -->|Yes| USE_FORCE["Use forced channels directly"]
    FORCE -->|No| CHECK_PREFS{"User preference\nexists?"}
    CHECK_PREFS -->|Yes| CHECK_ENABLED{"Preference\nenabled?"}
    CHECK_ENABLED -->|No| ALL_OFF["All channels disabled\n(user opted out)"]
    CHECK_ENABLED -->|Yes| CHECK_ALLOW{"Type allows\nuser preference?"}
    CHECK_ALLOW -->|Yes| USE_PREFS["Use user preference\nper-channel settings"]
    CHECK_ALLOW -->|No| USE_DEFAULTS["Use type defaults"]
    CHECK_PREFS -->|No| USE_DEFAULTS

    style START fill:#2d6a9f,stroke:#1a4971,color:#fff
    style USE_FORCE fill:#2d8659,stroke:#1a5c3a,color:#fff
    style USE_PREFS fill:#2d8659,stroke:#1a5c3a,color:#fff
    style USE_DEFAULTS fill:#b8762f,stroke:#8a5722,color:#fff
    style ALL_OFF fill:#7c5295,stroke:#563a6b,color:#fff
```

The engine resolves delivery channels with this priority:

1. **Force override**: If `forceDeliveryChannels` is set, use it directly
2. **User opt-out**: If user preference exists but `Enabled` is false, all channels are disabled
3. **User preference**: If the notification type allows user preferences, use per-channel settings (`InAppEnabled`, `EmailEnabled`, `SMSEnabled`)
4. **Type defaults**: Fall back to `DefaultInApp`, `DefaultEmail`, `DefaultSMS` from the notification type

## Delivery Channels

| Channel | How It Works |
|---------|-------------|
| **In-App** | Creates a `UserNotification` entity record in the database. Synchronous, instant. |
| **Email** | Renders the notification type's `EmailTemplateID` via `TemplateEngineServer`, then sends through `CommunicationEngine` using SendGrid. Fire-and-forget (async). |
| **SMS** | Renders the notification type's `SMSTemplateID` via `TemplateEngineServer`, then sends through `CommunicationEngine` using Twilio. Fire-and-forget (async). |

## Type Definitions

### SendNotificationParams

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `userId` | `string` | Yes | Target user ID |
| `typeNameOrId` | `string` | Yes | Notification type name or UUID |
| `title` | `string` | Yes | Short title (in-app display, email subject) |
| `message` | `string` | Yes | Full notification message |
| `templateData` | `Record<string, unknown>` | No | Data for email/SMS template rendering |
| `resourceTypeId` | `string` | No | Link notification to a resource type |
| `resourceRecordId` | `string` | No | Link notification to a specific record |
| `resourceConfiguration` | `object` | No | Navigation context stored as JSON |
| `forceDeliveryChannels` | `DeliveryChannels` | No | Override channel resolution |

### NotificationResult

| Property | Type | Description |
|----------|------|-------------|
| `success` | `boolean` | Overall operation success |
| `inAppNotificationId` | `string` | ID of created in-app notification |
| `emailSent` | `boolean` | Whether email delivery was initiated |
| `smsSent` | `boolean` | Whether SMS delivery was initiated |
| `deliveryChannels` | `DeliveryChannels` | Resolved channels used |
| `errors` | `string[]` | Error messages if any |

### DeliveryChannels

```typescript
interface DeliveryChannels {
    inApp: boolean;
    email: boolean;
    sms: boolean;
}
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `@memberjunction/core` | BaseEngine, Metadata, UserInfo, logging |
| `@memberjunction/core-entities` | UserNotification, UserNotificationType entities |
| `@memberjunction/communication-engine` | CommunicationEngine for email/SMS delivery |
| `@memberjunction/communication-types` | Message class |
| `@memberjunction/templates` | TemplateEngineServer for rendering |
| `@memberjunction/sqlserver-dataprovider` | UserCache for server-side user lookup |

## Development

```bash
npm run build    # Compile TypeScript
```
