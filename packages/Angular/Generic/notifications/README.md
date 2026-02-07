# @memberjunction/ng-notifications

Angular service for handling user notifications in MemberJunction applications, providing both UI notifications and database-backed persistent notifications.

## Features

- **Singleton Service Architecture**: Application-wide notification management with a single instance
- **Dual Notification Types**: 
  - Temporary UI notifications using Kendo UI
  - Persistent database-backed notifications via User Notifications entity
- **Real-time Updates**: Push notification integration for live updates
- **Flexible Styling**: Support for success, error, warning, and info styles
- **Auto-refresh**: Automatic notification refresh on user login
- **Event Integration**: Seamless integration with MemberJunction global events
- **Resource Linking**: Connect notifications to specific resources and records

## Installation

```bash
npm install @memberjunction/ng-notifications
```

## Requirements

### Angular Version
- Angular 21 or higher

### Peer Dependencies
- `@angular/common`: ^18.0.2
- `@angular/core`: ^18.0.2
- `@progress/kendo-angular-notification`: ^16.2.0

### MemberJunction Dependencies
- `@memberjunction/core`: ^2.43.0
- `@memberjunction/core-entities`: ^2.43.0
- `@memberjunction/global`: ^2.43.0
- `@memberjunction/graphql-dataprovider`: ^2.43.0

## Usage

### Module Setup

Import the `MJNotificationsModule` in your Angular module:

```typescript
import { MJNotificationsModule } from '@memberjunction/ng-notifications';

@NgModule({
  imports: [
    // other imports...
    MJNotificationsModule
  ],
})
export class YourModule { }
```

### Service Injection

The service is automatically provided at the root level, so you can inject it directly:

```typescript
import { MJNotificationService } from '@memberjunction/ng-notifications';

@Component({
  selector: 'app-example',
  templateUrl: './example.component.html'
})
export class ExampleComponent {
  constructor(private notificationService: MJNotificationService) {}
  
  // Or access the singleton instance
  showNotification() {
    MJNotificationService.Instance.CreateSimpleNotification(
      'Operation completed', 
      'success', 
      3000
    );
  }
}
```

## API Reference

### MJNotificationService

Singleton service for managing notifications across the application.

#### Methods

##### CreateSimpleNotification
Creates a temporary UI notification that displays to the user.

```typescript
CreateSimpleNotification(
  message: string, 
  style: "none" | "success" | "error" | "warning" | "info" = "success", 
  hideAfter?: number
): void
```

**Parameters:**
- `message`: Text to display to the user
- `style`: Visual style of the notification (default: "success")
- `hideAfter`: Optional duration in milliseconds before auto-hiding. If not specified, notification shows a close button

**Examples:**
```typescript
// Basic success notification
notificationService.CreateSimpleNotification('Data saved successfully');

// Error notification that auto-hides after 5 seconds
notificationService.CreateSimpleNotification(
  'Failed to process request', 
  'error', 
  5000
);

// Warning with manual close
notificationService.CreateSimpleNotification(
  'Please review your changes', 
  'warning'
);
```

##### CreateNotification
Creates a persistent notification stored in the database.

```typescript
async CreateNotification(
  title: string, 
  message: string, 
  resourceTypeId: string | null, 
  resourceRecordId: string | null, 
  resourceConfiguration: any | null, 
  displayToUser: boolean = true
): Promise<UserNotificationEntity>
```

**Parameters:**
- `title`: Notification title
- `message`: Notification message content
- `resourceTypeId`: Optional ID of the resource type this notification relates to
- `resourceRecordId`: Optional ID of the specific resource record
- `resourceConfiguration`: Optional configuration object (stored as JSON)
- `displayToUser`: Whether to show a UI notification immediately (default: true)

**Examples:**
```typescript
// Simple notification
const notification = await notificationService.CreateNotification(
  'Welcome!', 
  'Thank you for joining our platform', 
  null, 
  null, 
  null
);

// Resource-linked notification
const reportNotification = await notificationService.CreateNotification(
  'Report Generated', 
  'Your monthly sales report is ready', 
  reportResourceTypeId, 
  reportId, 
  { format: 'pdf', includeCharts: true }
);

// Silent notification (no immediate UI display)
await notificationService.CreateNotification(
  'Settings Updated', 
  'Your preferences have been saved', 
  null, 
  null, 
  null, 
  false
);
```

##### PushStatusUpdates
Returns an observable for subscribing to real-time push notification updates.

```typescript
PushStatusUpdates(): Observable<string>
```

**Example:**
```typescript
notificationService.PushStatusUpdates().subscribe(status => {
  const statusObj = JSON.parse(status.message);
  console.log('Push update received:', statusObj);
});
```

#### Static Methods

##### RefreshUserNotifications
Manually refreshes the user's notifications from the database.

```typescript
static async RefreshUserNotifications(): Promise<void>
```

**Example:**
```typescript
await MJNotificationService.RefreshUserNotifications();
console.log('Notifications refreshed');
```

#### Static Properties

##### Instance
Access the singleton instance of the notification service.

```typescript
static get Instance(): MJNotificationService
```

##### UserNotifications
Get all notifications for the current user.

```typescript
static get UserNotifications(): UserNotificationEntity[]
```

##### UnreadUserNotifications
Get only unread notifications.

```typescript
static get UnreadUserNotifications(): UserNotificationEntity[]
```

##### UnreadUserNotificationCount
Get the count of unread notifications.

```typescript
static get UnreadUserNotificationCount(): number
```

**Example:**
```typescript
// Display unread count in UI
const unreadCount = MJNotificationService.UnreadUserNotificationCount;
console.log(`You have ${unreadCount} unread notifications`);

// Process unread notifications
const unread = MJNotificationService.UnreadUserNotifications;
unread.forEach(notification => {
  console.log(notification.Title, notification.Message);
});
```

## Event Integration

The service automatically integrates with MemberJunction global events:

### Handled Events

1. **MJEventType.LoggedIn**
   - Refreshes user notifications from the database
   - Subscribes to push notification updates

2. **MJEventType.DisplaySimpleNotificationRequest**
   - Displays notifications triggered from other parts of the application
   - Allows centralized notification handling

3. **MJEventType.ComponentEvent** (code: "UserNotificationsUpdated")
   - Refreshes the notification list when updates occur

### Push Notification Handling

The service processes push notifications for:
- **User Notifications**: Automatically refreshes when new notifications are created
- **Other Types**: Displays as simple notifications (except for specific system types)

## Best Practices

### 1. Use Appropriate Notification Types

```typescript
// Use simple notifications for transient messages
this.notificationService.CreateSimpleNotification(
  'File uploaded successfully', 
  'success', 
  3000
);

// Use database notifications for important persistent messages
await this.notificationService.CreateNotification(
  'Invoice Due', 
  'Invoice #1234 is due in 3 days', 
  invoiceResourceTypeId, 
  invoiceId, 
  { dueDate: '2024-01-15', amount: 1500 }
);
```

### 2. Handle Errors Gracefully

```typescript
try {
  await this.notificationService.CreateNotification(
    'Task Complete', 
    'Your scheduled task has finished', 
    null, 
    null, 
    null
  );
} catch (error) {
  // Fall back to simple notification on error
  this.notificationService.CreateSimpleNotification(
    'Could not save notification', 
    'error', 
    5000
  );
}
```

### 3. Leverage Resource Linking

When notifications relate to specific entities or resources, always include the resource information:

```typescript
// Link to a specific record
await this.notificationService.CreateNotification(
  'Order Shipped', 
  `Order ${orderNumber} has been shipped`, 
  orderResourceTypeId, 
  orderId, 
  { trackingNumber: 'ABC123', carrier: 'FedEx' }
);
```

### 4. Use Consistent Styling

- **Success**: Completed operations, confirmations
- **Error**: Failed operations, validation errors
- **Warning**: Important notices, confirmations needed
- **Info**: General information, tips

### 5. Consider Auto-hide Duration

```typescript
// Quick confirmations: 2-3 seconds
this.notificationService.CreateSimpleNotification('Saved', 'success', 2000);

// Important messages: 5+ seconds or manual close
this.notificationService.CreateSimpleNotification(
  'Please review the validation errors below', 
  'warning'
);
```

## Integration with MemberJunction

### User Context

The service automatically uses the current user context from MemberJunction metadata:

```typescript
// Notifications are automatically associated with the current user
const notification = await this.notificationService.CreateNotification(
  'Personal Alert', 
  'This is just for you', 
  null, 
  null, 
  null
);
// notification.UserID is automatically set to the current user
```

### Entity Integration

Notifications are stored as `UserNotificationEntity` objects, allowing full entity operations:

```typescript
// Mark notification as read
const notification = MJNotificationService.UnreadUserNotifications[0];
notification.Unread = false;
await notification.Save();

// Delete old notifications
const oldNotifications = MJNotificationService.UserNotifications
  .filter(n => n.CreatedAt < someDate);
for (const notif of oldNotifications) {
  await notif.Delete();
}
```

## Module Exports

The package exports:
- `MJNotificationsModule` - The Angular module to import
- `MJNotificationService` - The notification service

## Support

For issues or questions:
- Check the [MemberJunction documentation](https://docs.memberjunction.com)
- Submit issues to the [GitHub repository](https://github.com/MemberJunction/MJ)
- Contact MemberJunction support