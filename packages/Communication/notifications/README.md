# @memberjunction/notifications

Unified notification system for MemberJunction with multi-channel delivery support.

## Overview

The notification system provides a **single API** for sending notifications to users across multiple channels:

- **In-App** - Stored in the database, displayed in the MJ UI
- **Email** - HTML-formatted emails via SendGrid
- **SMS** - Text messages via Twilio

Key features:
- **Type-based** - Categorize notifications (e.g., "Agent Completion", "Report Ready")
- **User preferences** - Users control delivery method per notification type
- **Template-driven** - Email/SMS use Nunjucks templates for consistent formatting

## Architecture

The notification system uses three related entities:

```
┌─────────────────────────────┐
│   UserNotificationType      │  Defines notification categories
│   (e.g., "Agent Completion")│  with default delivery settings
└──────────────┬──────────────┘
               │ referenced by
               ▼
┌─────────────────────────────┐
│  UserNotificationPreference │  Per-user overrides for
│  (one per user/type combo)  │  delivery channels
└──────────────┬──────────────┘
               │ links to
               ▼
┌─────────────────────────────┐
│     UserNotification        │  Actual notification records
│   (in-app notifications)    │  displayed in UI
└─────────────────────────────┘
```

**Flow**: When you call `SendNotification()`, the engine:
1. Looks up the notification type
2. Checks user preferences (if allowed)
3. Resolves which channels to use
4. Creates in-app record and/or sends email/SMS

## Notification Types

Notification types define categories with default delivery behavior. Managed via metadata files in `/metadata/notifications/`.

| Field | Description |
|-------|-------------|
| `Name` | Unique identifier (e.g., "Agent Completion") |
| `Description` | Human-readable explanation |
| `DefaultInApp` | In-app enabled by default (default: true) |
| `DefaultEmail` | Email enabled by default (default: false) |
| `DefaultSMS` | SMS enabled by default (default: false) |
| `AllowUserPreference` | Can users override defaults? (default: true) |
| `EmailTemplateID` | FK to Template for email formatting |
| `SMSTemplateID` | FK to Template for SMS formatting |
| `Icon` | Font Awesome class (e.g., "fa-robot") |
| `Color` | Hex color for UI badge (e.g., "#4CAF50") |
| `AutoExpireDays` | Auto-mark as read after N days (NULL = never) |
| `Priority` | Sort order (lower = higher priority) |

## User Preferences

Users can override delivery settings per notification type. Stored in `UserNotificationPreference`.

| Field | Description |
|-------|-------------|
| `UserID` | User reference |
| `NotificationTypeID` | Type reference |
| `InAppEnabled` | Override for in-app (NULL = use type default) |
| `EmailEnabled` | Override for email (NULL = use type default) |
| `SMSEnabled` | Override for SMS (NULL = use type default) |
| `Enabled` | Master switch - set to false to opt out entirely |

**Key behavior**: NULL values inherit from the notification type's defaults. Only set a value when the user explicitly chooses differently.

## NotificationEngine API

### SendNotification

```typescript
import { NotificationEngine } from '@memberjunction/notifications';

const result = await NotificationEngine.Instance.SendNotification({
    userId: targetUserId,
    typeNameOrId: 'Agent Completion',  // Name or UUID
    title: 'Task Complete',
    message: 'Your AI agent has finished processing',
    templateData: {
        agentName: 'My Agent',
        artifactTitle: 'Report.pdf',
        conversationUrl: 'https://app.example.com/conversations/123'
    }
}, contextUser);
```

**Parameters:**

```typescript
interface SendNotificationParams {
    userId: string;                     // Target user
    typeNameOrId: string;               // Type name or UUID
    title: string;                      // Short title (in-app + email subject)
    message: string;                    // Full message (in-app display)
    resourceTypeId?: string;            // Optional resource link
    resourceRecordId?: string;          // Optional record link
    resourceConfiguration?: object;     // Navigation context (JSON)
    templateData?: Record<string, any>; // Data for template rendering
    forceDeliveryChannels?: {           // Override user preferences
        inApp: boolean;
        email: boolean;
        sms: boolean;
    };
}
```

**Returns:**

```typescript
interface NotificationResult {
    success: boolean;
    inAppNotificationId?: string;
    emailSent?: boolean;
    smsSent?: boolean;
    deliveryChannels: { inApp: boolean; email: boolean; sms: boolean };
    errors?: string[];
}
```

### Delivery Channel Resolution

The engine determines which channels to use in this order:

1. **forceDeliveryChannels** (if provided) - Always wins
2. **User preference** (if type allows) - User's custom choice
3. **Type default** - Fallback to notification type configuration

## Adding a Notification Template

Follow these steps to add a new notification type with email/SMS templates.

### Step 1: Create Template Content Files

Create the actual template content in `/metadata/templates/templates/`:

**Email template** (`metadata/templates/templates/your-type-email.html`):
```html
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2196F3; color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .button { display: inline-block; background: #4CAF50; color: white;
                  padding: 14px 32px; text-decoration: none; border-radius: 6px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>{{ title }}</h2>
        </div>
        <div class="content">
            <p>{{ message }}</p>
            <a href="{{ actionUrl }}" class="button">View Details</a>
        </div>
    </div>
</body>
</html>
```

**SMS template** (`metadata/templates/templates/your-type-sms.txt`):
```text
{{ title }}: {{ shortMessage }} - {{ actionUrl }}
```

### Step 2: Create Template Metadata Files

Create template entity records that reference the content files.

**Email template** (`metadata/templates/.your-type-email-template.json`):
```json
{
  "entityName": "Templates",
  "fields": {
    "Name": "Your Type - Email",
    "Description": "Email template for your notification type",
    "UserID": "@lookup:Users.Name=System",
    "IsActive": true
  },
  "relatedEntities": {
    "Template Contents": [
      {
        "fields": {
          "TemplateID": "@parent:ID",
          "TypeID": "@lookup:Template Content Types.Name=HTML",
          "TemplateText": "@file:templates/your-type-email.html",
          "Priority": 100,
          "IsActive": true
        }
      }
    ]
  }
}
```

**SMS template** (`metadata/templates/.your-type-sms-template.json`):
```json
{
  "entityName": "Templates",
  "fields": {
    "Name": "Your Type - SMS",
    "Description": "SMS template for your notification type",
    "UserID": "@lookup:Users.Name=System",
    "IsActive": true
  },
  "relatedEntities": {
    "Template Contents": [
      {
        "fields": {
          "TemplateID": "@parent:ID",
          "TypeID": "@lookup:Template Content Types.Name=Text",
          "TemplateText": "@file:templates/your-type-sms.txt",
          "Priority": 100,
          "IsActive": true
        }
      }
    ]
  }
}
```

### Step 3: Create Notification Type

Create the notification type that references your templates.

**Notification type** (`metadata/notifications/.your-type.json`):
```json
{
  "entityName": "MJ: User Notification Types",
  "fields": {
    "Name": "Your Type Name",
    "Description": "When this notification is sent",
    "DefaultInApp": true,
    "DefaultEmail": false,
    "DefaultSMS": false,
    "AllowUserPreference": true,
    "EmailTemplateID": "@lookup:Templates.Name=Your Type - Email",
    "SMSTemplateID": "@lookup:Templates.Name=Your Type - SMS",
    "Icon": "fa-bell",
    "Color": "#2196F3",
    "AutoExpireDays": 7,
    "Priority": 50
  }
}
```

> **Note**: The `@lookup:` syntax resolves foreign keys by querying the referenced entity. UUIDs are auto-generated by mj-sync on first push - you don't need to hardcode them.

### Step 4: Push Metadata

Run mj-sync to push your metadata to the database:

```bash
# Push templates first (notification type references them)
mj sync push --dir=metadata/templates

# Then push notification type
mj sync push --dir=metadata/notifications
```

### Step 5: Use in Code

```typescript
await NotificationEngine.Instance.SendNotification({
    userId: targetUserId,
    typeNameOrId: 'Your Type Name',
    title: 'Notification Title',
    message: 'Full message for in-app display',
    templateData: {
        title: 'Email/SMS title',
        message: 'Email message',
        shortMessage: 'Brief SMS message',
        actionUrl: 'https://app.example.com/...'
    }
}, contextUser);
```

### Step 6: Test

1. **In-App**: Check notification appears in MJ UI
2. **Email**: Verify email received with correct template rendering
3. **SMS**: Confirm SMS delivery (requires Twilio configuration)

## Examples

### Simple In-App Only

```typescript
await NotificationEngine.Instance.SendNotification({
    userId: contextUser.ID,
    typeNameOrId: 'Agent Completion',
    title: 'Agent Complete',
    message: 'Your task finished successfully'
}, contextUser);
```

### Force Email Delivery

```typescript
await NotificationEngine.Instance.SendNotification({
    userId: contextUser.ID,
    typeNameOrId: 'Critical Alert',
    title: 'System Error',
    message: 'A critical error occurred',
    forceDeliveryChannels: { inApp: false, email: true, sms: false },
    templateData: {
        errorDetails: '...',
        timestamp: new Date().toISOString()
    }
}, contextUser);
```

### With Navigation Context

```typescript
await NotificationEngine.Instance.SendNotification({
    userId: contextUser.ID,
    typeNameOrId: 'Report Ready',
    title: 'Monthly Report Ready',
    message: 'Your analytics report is ready',
    resourceConfiguration: {
        reportId: '12345',
        reportType: 'analytics'
    },
    templateData: {
        reportTitle: 'January Analytics',
        reportUrl: 'https://app.example.com/reports/12345'
    }
}, contextUser);
```

## Troubleshooting

### Notification Not Appearing

1. Check type exists: `SELECT * FROM __mj.UserNotificationType WHERE Name='...'`
2. Check user preferences: `SELECT * FROM __mj.UserNotificationPreference WHERE UserID='...'`
3. Verify delivery channel resolution in logs

### Email Not Sending

1. Verify template exists and `IsActive = true`
2. Check user has email address
3. Verify SendGrid provider is configured
4. Check Communication Logs for errors

### SMS Not Sending

1. Verify SMS template exists and is active
2. Check user has phone number
3. Verify Twilio provider is configured
4. Check phone number format

### Template Rendering Errors

1. Verify all required `templateData` parameters are provided
2. Check Nunjucks syntax in template files
3. Test template in isolation

## Related Packages

- [@memberjunction/communication-engine](../engine/README.md) - Multi-provider messaging
- [@memberjunction/templates](../../Templates/README.md) - Template rendering
- [@memberjunction/core-entities](../../MJCoreEntities/README.md) - Entity definitions
