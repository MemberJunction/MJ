# @memberjunction/ng-notifications

Angular service for handling user notifications in MemberJunction applications, providing both UI notifications and database-backed persistent notifications.

## Features

- Singleton notification service for consistent application-wide notifications
- Support for temporary UI notifications
- Database-backed persistent user notifications
- Real-time push notification updates
- Notification styling options (success, error, warning, info)
- Automatic notification refresh on login
- Unread notification tracking

## Installation

```bash
npm install @memberjunction/ng-notifications
```

## Usage

The service is automatically provided at the root level, so you can inject it directly into your components:

```typescript
import { MJNotificationService } from '@memberjunction/ng-notifications';

@Component({
  // ...
})
export class YourComponent {
  constructor(private notificationService: MJNotificationService) {
    // Use the service directly
  }
  
  // Or access the singleton instance
  showNotification() {
    MJNotificationService.Instance.CreateSimpleNotification('Operation completed', 'success', 3000);
  }
}
```

## Features

### Simple UI Notifications

Display temporary notifications to the user:

```typescript
// Basic success notification
notificationService.CreateSimpleNotification('Operation completed successfully');

// Error notification that disappears after 5 seconds
notificationService.CreateSimpleNotification(
  'An error occurred while processing your request', 
  'error', 
  5000
);

// Warning notification with manual close button
notificationService.CreateSimpleNotification(
  'Please verify your input data', 
  'warning'
);

// Informational notification
notificationService.CreateSimpleNotification(
  'New updates are available', 
  'info', 
  3000
);
```

### Persistent Database Notifications

Create notifications that are stored in the database and can be viewed later:

```typescript
// Create a simple notification
await notificationService.CreateNotification(
  'New Comment', 
  'User John added a comment to your post', 
  null, 
  null, 
  null
);

// Create a notification linked to a resource
await notificationService.CreateNotification(
  'Report Ready', 
  'Your requested report is now available', 
  reportResourceTypeId, 
  reportId, 
  { reportConfig: 'some-config-data' }
);

// Create a notification but don't display it to the user immediately
await notificationService.CreateNotification(
  'Background Update', 
  'System updated your preferences', 
  null, 
  null, 
  null, 
  false
);
```

### Accessing User Notifications

Retrieve user notifications:

```typescript
// Get all notifications for the current user
const notifications = MJNotificationService.UserNotifications;

// Get only unread notifications
const unreadNotifications = MJNotificationService.UnreadUserNotifications;

// Get count of unread notifications
const unreadCount = MJNotificationService.UnreadUserNotificationCount;

// Manually refresh notifications from the database
await MJNotificationService.RefreshUserNotifications();
```

## Push Notifications

The service automatically subscribes to push notifications after login, handling:

- User notification updates
- System status messages
- Custom event propagation

```typescript
// Access push status updates directly
notificationService.PushStatusUpdates().subscribe(status => {
  // Handle status updates
});
```

## Event Integration

The service integrates with MemberJunction global events, reacting to:

- `MJEventType.LoggedIn`: Refreshes notifications and sets up push updates
- `MJEventType.DisplaySimpleNotificationRequest`: Displays notifications from other parts of the application
- `MJEventType.ComponentEvent` with `UserNotificationsUpdated` code: Refreshes notification list