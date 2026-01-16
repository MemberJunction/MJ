# @memberjunction/notifications

Unified notification system for MemberJunction with multi-channel delivery support.

## Overview

The notification system provides a **single, unified API** for sending notifications to users across multiple channels:
- **In-App** - UserNotification entities displayed in the MJ UI
- **Email** - HTML-formatted emails with template support
- **SMS** - Text messages for urgent notifications
- **All** - Simultaneous delivery across all channels

### Key Features

✅ **Type-based notifications** - Categorize notifications (Agent Completion, Report Ready, etc.)
✅ **User preferences** - Users control delivery method per notification type
✅ **Template-based delivery** - Email/SMS use Nunjucks templates for consistent formatting
✅ **Multi-channel** - Single API sends to in-app, email, and/or SMS based on preferences
✅ **Backward compatible** - Works alongside existing in-app notification system

## Installation

```bash
npm install @memberjunction/notifications
```

## Quick Start

```typescript
import { NotificationService } from '@memberjunction/notifications';

// Send a notification (delivery method determined by user preferences and type config)
const result = await NotificationService.Instance.SendNotification({
    userId: contextUser.ID,
    typeNameOrId: 'Agent Completion',
    title: 'Task Complete',
    message: 'Your AI agent has finished processing',
    templateData: {
        agentName: 'My Agent',
        artifactTitle: 'Report.pdf',
        conversationUrl: 'https://app.example.com/conversations/123',
        versionNumber: 2
    }
}, contextUser);

if (result.success) {
    console.log(`Notification delivered via: ${result.deliveryMethod}`);
    console.log(`In-app notification ID: ${result.inAppNotificationId}`);
    console.log(`Email sent: ${result.emailSent}`);
    console.log(`SMS sent: ${result.smsSent}`);
}
```

## Architecture

### Database Schema

#### UserNotificationType
Defines categories of notifications with delivery configuration:

- **Name** - Unique type name (e.g., "Agent Completion")
- **DefaultDeliveryMethod** - 'InApp', 'Email', 'SMS', 'All', 'None'
- **AllowUserPreference** - Can users override default?
- **EmailTemplateID** - Optional email template reference
- **SMSTemplateID** - Optional SMS template reference
- **Icon** - Font Awesome icon class
- **Color** - Badge color hex
- **AutoExpireDays** - Auto-mark as read after N days
- **Priority** - Sort order (lower = higher priority)

#### UserNotificationPreference
Per-user delivery preferences:

- **UserID** - User reference
- **NotificationTypeID** - Type reference
- **DeliveryMethod** - User's override (InApp, Email, SMS, All, None)
- **Enabled** - Opt-out flag

#### UserNotification (Updated)
Added field:
- **NotificationTypeID** - Foreign key to notification type

### Delivery Method Resolution

The system resolves delivery method in this order:

1. **Force parameter** (if provided) - Always wins
2. **User preference** (if type allows) - User's custom choice
3. **Type default** - Fallback to type configuration

```typescript
// Example: Force email even if user prefers in-app
await NotificationService.Instance.SendNotification({
    ...params,
    forceDeliveryMethod: 'Email'  // Override user preference
}, contextUser);
```

## Adding New Notification Types

### Step 1: Create Metadata Files

MemberJunction uses `mj-sync` for data management - **never use raw SQL inserts for metadata**. Create files in two directories:

```
metadata/
├── notifications/
│   └── .your-type-name.json              # Notification type definition
│
└── templates/
    ├── .your-type-email-template.json    # Email template entity
    ├── .your-type-sms-template.json      # SMS template entity
    └── templates/                         # Actual content files
        ├── your-type-email.html           # HTML email body (Nunjucks)
        └── your-type-sms.txt              # SMS text body (Nunjucks)
```

**Why two directories?**
- `metadata/notifications/` - Contains **UserNotificationType** records (references templates by ID)
- `metadata/templates/` - Contains **Template** entity records + the actual HTML/text content files

**Example: `metadata/notifications/.your-type-name.json`**
```json
{
  "entityName": "MJ: User Notification Types",
  "primaryKey": { "ID": "YOUR-UUID-HERE" },
  "fields": {
    "Name": "Your Type Name",
    "Description": "Description of when this notification is sent",
    "DefaultDeliveryMethod": "InApp",
    "AllowUserPreference": true,
    "EmailTemplateID": "@lookup:Templates.Name=Your Type - Email",
    "SMSTemplateID": "@lookup:Templates.Name=Your Type - SMS",
    "Icon": "fa-bell",
    "Color": "#2196F3",
    "AutoExpireDays": null,
    "Priority": 50
  }
}
```

**Example: `metadata/templates/.your-type-email-template.json`**

This creates a **Template** entity record with a related **TemplateContent** record:

```json
{
  "entityName": "Templates",
  "primaryKey": { "ID": "YOUR-UUID-HERE" },
  "fields": {
    "Name": "Your Type - Email",
    "Description": "Email template for your notification type",
    "UserID": "@lookup:Users.Name=your-user",
    "IsActive": true
  },
  "relatedEntities": {
    "Template Contents": [
      {
        "primaryKey": { "ID": "YOUR-UUID-HERE" },
        "fields": {
          "TemplateID": "@parent",
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

**How `@file:` works:** The `@file:templates/your-type-email.html` reference tells mj-sync to read the HTML file content and store it in the `TemplateText` field. This keeps large HTML/text content out of the JSON for cleaner version control.

### Step 2: Create Templates

**Email Template Guidelines:**
- Use responsive HTML with inline styles (email clients don't support external CSS)
- Include clear call-to-action button
- Keep subject under 50 characters
- Test with all required parameters
- Use MemberJunction branding colors

**Example: `templates/your-type-email.html`**
```html
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2196F3; color: white; padding: 30px 20px; text-align: center; }
        .content { background: white; padding: 30px 20px; }
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

**SMS Template Guidelines:**
- Maximum 160 characters for single SMS (longer messages are split)
- Include only essential information
- Always include a clickable link
- Consider using URL shorteners for long links
- Test rendering with all parameter combinations

**Example: `templates/your-type-sms.txt`**
```text
{{ title }}: {{ shortMessage }} - {{ actionUrl }}
```

### Step 3: Trigger Notification

```typescript
import { NotificationService } from '@memberjunction/notifications';

// In your code where the event occurs
await NotificationService.Instance.SendNotification({
    userId: targetUserId,
    typeNameOrId: 'Your Type Name',  // Exact name from database
    title: 'Short notification title',
    message: 'Longer message for in-app display',
    templateData: {
        // Data for template rendering
        title: 'Title for email',
        message: 'Message for email',
        shortMessage: 'Brief message for SMS',
        actionUrl: 'https://...'
    }
}, contextUser);
```

### Step 4: Sync and Test

1. **Push metadata to database**:
   ```bash
   npx mj-sync push --dir=metadata/notifications
   npx mj-sync push --dir=metadata/templates
   ```
2. **Restart API server** to pick up new templates
3. **Test notification**:
   - Trigger event in your code
   - Verify in-app notification appears
   - Check email inbox (if configured)
   - Check SMS delivery (if configured)

> **Note:** No migration or CodeGen is needed for adding notification types - it's all metadata managed by `mj-sync`.

## API Reference

### NotificationService

Singleton service for sending notifications.

#### SendNotification

```typescript
async SendNotification(
    params: SendNotificationParams,
    contextUser: UserInfo
): Promise<NotificationResult>
```

**Parameters:**

```typescript
interface SendNotificationParams {
    userId: string;                    // User ID to send notification to
    typeNameOrId: string;              // 'Type Name' or UUID
    title: string;                     // Short title (in-app + email subject)
    message: string;                   // Full message (in-app display)
    resourceTypeId?: string;           // Optional resource link
    resourceRecordId?: string;         // Optional record link
    resourceConfiguration?: any;       // Navigation context (JSON)
    templateData?: Record<string, any>; // Data for template rendering
    forceDeliveryMethod?: 'InApp' | 'Email' | 'SMS' | 'All' | 'None';
}
```

**Returns:**

```typescript
interface NotificationResult {
    success: boolean;              // Overall success
    inAppNotificationId?: string;  // Created notification ID
    emailSent?: boolean;           // Email delivery status
    smsSent?: boolean;             // SMS delivery status
    deliveryMethod: string;        // Actual method used
    errors?: string[];             // Any errors
}
```

## Integration with CommunicationEngine

The notification service integrates with the existing [CommunicationEngine](../engine/README.md) for external delivery:

- Email sent via configured provider (SendGrid, Gmail, MSGraph)
- SMS sent via configured provider (Twilio)
- Templates rendered using [TemplateEngine](../../Templates/README.md)
- Communication logs created for audit trail

## Real-Time Updates

In-app notifications trigger real-time PubSub events:

```typescript
// Automatically published by NotificationService
pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
    type: 'notification',
    notificationId: result.inAppNotificationId,
    action: 'create',
    title: '...',
    message: '...'
});
```

Clients listening to PubSub automatically refresh their notification list.

## Examples

### Example 1: Simple In-App Notification

```typescript
// Default to in-app only (most common case)
await NotificationService.Instance.SendNotification({
    userId: contextUser.ID,
    typeNameOrId: 'Agent Completion',
    title: 'Agent Complete',
    message: 'Your task finished successfully'
}, contextUser);
```

### Example 2: Force Email Delivery

```typescript
// Override user preference to always send email
await NotificationService.Instance.SendNotification({
    userId: contextUser.ID,
    typeNameOrId: 'Critical Alert',
    title: 'System Error',
    message: 'A critical error occurred',
    forceDeliveryMethod: 'Email',  // Always send email
    templateData: {
        errorDetails: '...',
        timestamp: new Date().toISOString()
    }
}, contextUser);
```

### Example 3: Multi-Channel with Navigation

```typescript
// Send to all channels with navigation context
await NotificationService.Instance.SendNotification({
    userId: contextUser.ID,
    typeNameOrId: 'Report Ready',
    title: 'Monthly Report Ready',
    message: 'Your monthly analytics report is ready',
    resourceConfiguration: {
        reportId: '12345',
        reportType: 'analytics',
        month: 'January'
    },
    forceDeliveryMethod: 'All',  // In-app + Email + SMS
    templateData: {
        reportTitle: 'January Analytics',
        reportUrl: 'https://app.example.com/reports/12345',
        summaryStats: {
            revenue: '$50,000',
            users: 1250
        }
    }
}, contextUser);
```

### Example 4: Conditional Delivery

```typescript
// Let user preferences determine delivery
const isUrgent = calculateUrgency(task);

await NotificationService.Instance.SendNotification({
    userId: contextUser.ID,
    typeNameOrId: 'Task Assignment',
    title: `New task: ${task.name}`,
    message: `You've been assigned a ${task.priority} priority task`,
    // Force SMS only if urgent, otherwise respect user preference
    forceDeliveryMethod: isUrgent ? 'SMS' : undefined,
    templateData: {
        taskName: task.name,
        taskPriority: task.priority,
        taskUrl: `https://app.example.com/tasks/${task.id}`
    }
}, contextUser);
```

## Testing

### Unit Tests

Test the notification service in isolation:

```typescript
import { NotificationService } from '@memberjunction/notifications';

describe('NotificationService', () => {
    it('should send in-app notification', async () => {
        const result = await NotificationService.Instance.SendNotification({
            userId: testUser.ID,
            typeNameOrId: 'Test Type',
            title: 'Test',
            message: 'Test message'
        }, testUser);

        expect(result.success).toBe(true);
        expect(result.deliveryMethod).toBe('InApp');
        expect(result.inAppNotificationId).toBeDefined();
    });
});
```

### Integration Tests

Test full notification flow with templates:

```typescript
it('should render email template and send', async () => {
    const result = await NotificationService.Instance.SendNotification({
        userId: testUser.ID,
        typeNameOrId: 'Agent Completion',
        title: 'Test Agent Complete',
        message: 'Test agent finished',
        forceDeliveryMethod: 'Email',
        templateData: {
            agentName: 'Test Agent',
            artifactTitle: 'Test Artifact',
            conversationUrl: 'https://test.com/conversation/123'
        }
    }, testUser);

    expect(result.emailSent).toBe(true);
});
```

## Best Practices

### 1. Use Descriptive Type Names
```typescript
// Good
'Agent Completion'
'Report Ready'
'Task Assignment'

// Bad
'Notification1'
'Alert'
'Message'
```

### 2. Provide Complete Template Data
```typescript
// Always provide all required template parameters
await NotificationService.Instance.SendNotification({
    ...params,
    templateData: {
        agentName: agent.Name,           // Required
        artifactTitle: artifact.Title,   // Required
        conversationUrl: url,            // Required
        versionNumber: version || 1      // Optional but included
    }
}, contextUser);
```

### 3. Handle Errors Gracefully
```typescript
try {
    const result = await NotificationService.Instance.SendNotification(params, contextUser);

    if (!result.success) {
        LogError(`Notification failed: ${result.errors?.join(', ')}`);
    }
} catch (error) {
    LogError(`Notification error: ${error.message}`);
    // Don't throw - notification failures shouldn't break main flow
}
```

### 4. Use Force Sparingly
```typescript
// Only force delivery method when absolutely necessary
// Let user preferences work most of the time
await NotificationService.Instance.SendNotification({
    ...params,
    // Only force if critical/urgent
    forceDeliveryMethod: isCritical ? 'All' : undefined
}, contextUser);
```

### 5. Design Mobile-Friendly Templates
- Email templates should be responsive (max-width: 600px)
- SMS templates should be concise (< 160 characters ideal)
- Always test on mobile devices
- Use clear call-to-action buttons

## Troubleshooting

### Notification Not Appearing

1. Check notification type exists: `SELECT * FROM __mj.UserNotificationType WHERE Name='...'`
2. Check user preferences: `SELECT * FROM __mj.UserNotificationPreference WHERE UserID='...'`
3. Verify delivery method resolution (check logs)
4. Ensure UserInfoEngine cache is refreshed

### Email Not Sending

1. Verify email template exists and is active
2. Check user has email address configured
3. Verify CommunicationEngine provider is configured
4. Check Communication Logs table for errors
5. Review template rendering errors in logs

### SMS Not Sending

1. Verify SMS template exists and is active
2. Check user has phone number configured
3. Verify Twilio or SMS provider is configured
4. Check Communication Logs table for errors
5. Ensure phone number format is correct

### Template Rendering Errors

1. Verify all required parameters are provided in `templateData`
2. Check template syntax (Nunjucks format)
3. Test template in isolation using TemplateEngine
4. Review Template Params definitions for typos

## Migration from Old System

If you have existing direct `UserNotificationEntity` creation code:

### Before:
```typescript
const notification = await md.GetEntityObject<UserNotificationEntity>('User Notifications', contextUser);
notification.UserID = userId;
notification.Title = title;
notification.Message = message;
await notification.Save();
```

### After:
```typescript
await NotificationService.Instance.SendNotification({
    userId: userId,
    typeNameOrId: 'Your Type Name',
    title: title,
    message: message
}, contextUser);
```

**Benefits:**
- Multi-channel delivery (email/SMS)
- User preference support
- Template-based formatting
- Centralized notification logic
- Better audit trail

## Related Packages

- [@memberjunction/core](../../MJCore/README.md) - Core metadata and entity system
- [@memberjunction/communication-engine](../engine/README.md) - Multi-provider messaging
- [@memberjunction/templates](../../Templates/README.md) - Template rendering engine
- [@memberjunction/core-entities](../../MJCoreEntities/README.md) - Entity definitions

## Contributing

When adding new features to the notification system:

1. Follow the established patterns (type-based, template-driven)
2. Add comprehensive tests
3. Update this README with examples
4. Document all new parameters and return values
5. Maintain backward compatibility

## License

ISC - MemberJunction.com
