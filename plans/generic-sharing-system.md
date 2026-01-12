# Generic Sharing System - Complete Proposal (Future Phase)

> **Note:** This document outlines the long-term vision for a unified sharing system across MemberJunction. For the immediate "Lists" implementation, we are adopting a purpose-built, list-specific sharing model as documented in `plans/study-lists-functionality.md`. This generic system will be revisited in a future phase.

## Executive Summary

A metadata-driven, entity-agnostic sharing system that allows any MemberJunction entity to support sharing with configurable permission levels, invitation workflows, and integrated notifications. This system replaces bespoke sharing implementations (like Artifacts) with a unified, extensible pattern.

---

## 1. Schema Design

### 1.1 Core Tables

#### `__mj.SharingType` → Entity: `MJ: Sharing Types`

Defines the universe of permission types available in the system.

| Column | Type | Description |
|--------|------|-------------|
| ID | uniqueidentifier PK | |
| Name | nvarchar(100) NOT NULL | 'View', 'Edit', 'Delete', 'Reshare', 'Manage', 'Owner' |
| Description | nvarchar(500) | Human-readable explanation |
| DriverClass | nvarchar(255) NULL | Optional subclass for custom validation/behavior |
| Rank | int NOT NULL | Permission hierarchy: higher = more access (Owner=100, View=10) |
| DisplayIcon | nvarchar(100) | Font Awesome icon class |
| DisplayColor | nvarchar(50) | Hex color for UI badges |
| ImpliesSharingTypeID | uniqueidentifier FK NULL | Self-reference: Edit implies View |
| AllowsResharing | bit NOT NULL DEFAULT 0 | Does this permission allow the recipient to share with others? |
| IsDiscoverable | bit NOT NULL DEFAULT 0 | Can users browse/discover items with this permission? |
| IsPublic | bit NOT NULL DEFAULT 0 | Visible without authentication? |
| IsActive | bit NOT NULL DEFAULT 1 | |

**Seed Data:**

| Name | Rank | Implies | AllowsResharing | Description |
|------|------|---------|-----------------|-------------|
| View | 10 | - | No | Can view the item |
| Comment | 20 | View | No | Can view and add comments |
| Edit | 50 | View | No | Can modify the item |
| Delete | 60 | Edit | No | Can delete the item |
| Reshare | 40 | View | **Yes** | Can share with others (view-level) |
| Manage | 80 | Edit | **Yes** | Full control except ownership transfer |
| Owner | 100 | Manage | **Yes** | Full control including ownership transfer |

**Permission Hierarchy Visualization:**
```
Owner (100) ─────────────────────────────────────┐
    │                                            │
    └─ implies → Manage (80) ────────────────────┤ AllowsResharing
                     │                           │
                     └─ implies → Edit (50)      │
                                    │            │
Reshare (40) ───────────────────────┼────────────┘
    │                               │
    └─ implies ─────────────────────┴─→ View (10)

Delete (60) ─ implies → Edit (50) ─ implies → View (10)
Comment (20) ─ implies → View (10)
```

---

#### `__mj.EntitySharingType` → Entity: `MJ: Entity Sharing Types`

Configures which sharing types are available for each entity.

| Column | Type | Description |
|--------|------|-------------|
| ID | uniqueidentifier PK | |
| EntityID | uniqueidentifier FK NOT NULL | Which entity |
| SharingTypeID | uniqueidentifier FK NOT NULL | Which sharing type |
| IsEnabled | bit NOT NULL DEFAULT 1 | Available for this entity? |
| IsDefault | bit NOT NULL DEFAULT 0 | Pre-selected when sharing? |
| DisplayOrder | int NOT NULL DEFAULT 0 | Order in UI dropdowns |
| DriverClass | nvarchar(255) NULL | Entity-specific behavior override |
| RequiresApproval | bit NOT NULL DEFAULT 0 | Shares require owner approval? |
| AllowPublicSharing | bit NOT NULL DEFAULT 0 | Allow public/org-wide sharing? |

**Unique Constraint:** `(EntityID, SharingTypeID)`

**Example Configuration:**

| Entity | Enabled Sharing Types |
|--------|----------------------|
| Lists | View, Edit, Reshare, Manage, Owner |
| Reports | View, Edit, Owner |
| Dashboards | View, Edit, Manage, Owner |
| Templates | View, Edit, Owner |

---

#### `__mj.SharedItem` → Entity: `MJ: Shared Items`

The actual sharing records - who shared what with whom.

| Column | Type | Description |
|--------|------|-------------|
| ID | uniqueidentifier PK | |
| EntityID | uniqueidentifier FK NOT NULL | What entity type is being shared |
| RecordID | nvarchar(450) NOT NULL | Which specific record |
| SharingTypeID | uniqueidentifier FK NOT NULL | Permission level granted |
| SharedByUserID | uniqueidentifier FK NOT NULL | Who created this share |
| SharedWithUserID | uniqueidentifier FK NULL | Recipient user |
| SharedWithRoleID | uniqueidentifier FK NULL | Recipient role |
| Status | nvarchar(50) NOT NULL DEFAULT 'Pending' | 'Pending', 'Accepted', 'Declined', 'Revoked', 'Expired' |
| InvitationMessage | nvarchar(max) NULL | Optional message from sharer |
| InvitationSentAt | datetime NULL | When notification was sent |
| RespondedAt | datetime NULL | When recipient responded |
| ExpiresAt | datetime NULL | Optional TTL |
| Notes | nvarchar(max) NULL | Internal notes |

**Constraints:**
- `CHECK (SharedWithUserID IS NOT NULL OR SharedWithRoleID IS NOT NULL)`
- **Indexes:**
  - `IX_SharedItem_EntityRecord ON (EntityID, RecordID)`
  - `IX_SharedItem_SharedWithUser ON (SharedWithUserID) WHERE SharedWithUserID IS NOT NULL`
  - `IX_SharedItem_SharedWithRole ON (SharedWithRoleID) WHERE SharedWithRoleID IS NOT NULL`
  - `IX_SharedItem_Status ON (Status)`

**Status Flow:**
```
┌─────────┐    Accept    ┌──────────┐
│ Pending │─────────────→│ Accepted │
└────┬────┘              └──────────┘
     │
     │ Decline           ┌──────────┐
     └──────────────────→│ Declined │
                         └──────────┘

┌──────────┐  Owner Action  ┌─────────┐
│ Accepted │───────────────→│ Revoked │
└──────────┘                └─────────┘

┌──────────┐  Time Passes   ┌─────────┐
│ Pending  │───────────────→│ Expired │
│ Accepted │                └─────────┘
└──────────┘
```

---

### 1.2 System Configuration

#### `__mj.SystemSetting` (existing table) - New Rows

For system-level defaults, we add configuration to the existing SystemSettings:

| Name | Value | Description |
|------|-------|-------------|
| `Sharing.DefaultCommunicationProviderName` | 'SendGrid' | Provider for share notifications |
| `Sharing.DefaultSenderEmail` | 'noreply@company.com' | From address for notifications |
| `Sharing.DefaultSenderName` | 'MemberJunction' | Display name for notifications |
| `Sharing.InvitationExpirationDays` | '7' | Default days until pending invites expire |
| `Sharing.EnableInAppNotifications` | 'true' | Show in-app notification badges |
| `Sharing.EnableEmailNotifications` | 'true' | Send email notifications |

---

### 1.3 Notification Templates

Create templates in the Templates entity for sharing notifications:

| Template Name | Purpose |
|---------------|---------|
| `System: Share Invitation` | Email sent when item is shared |
| `System: Share Accepted` | Email to sharer when recipient accepts |
| `System: Share Declined` | Email to sharer when recipient declines |
| `System: Share Revoked` | Email to recipient when access is revoked |
| `System: Share Expiring Soon` | Reminder before share expires |

**Template Parameters:**
- `{{SharerName}}` - Name of person sharing
- `{{RecipientName}}` - Name of recipient
- `{{ItemName}}` - Name of shared item
- `{{ItemType}}` - Entity name (e.g., "List", "Report")
- `{{PermissionLevel}}` - e.g., "View", "Edit"
- `{{InvitationMessage}}` - Optional personal message
- `{{AcceptUrl}}` - Link to accept invitation
- `{{DeclineUrl}}` - Link to decline invitation
- `{{ViewItemUrl}}` - Direct link to the item
- `{{ExpirationDate}}` - When the share expires

---

## 2. Service Layer

### 2.1 SharingEngine (Core Package)

Location: `packages/MJCore/src/generic/sharing/SharingEngine.ts`

```typescript
export class SharingEngine {
  private static _instance: SharingEngine;
  public static get Instance(): SharingEngine { ... }

  // ═══════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════

  /**
   * Check if an entity supports sharing
   */
  async isEntityShareable(entityName: string): Promise<boolean>;

  /**
   * Get all sharing types enabled for an entity
   */
  async getEntitySharingTypes(entityName: string): Promise<EntitySharingTypeEntity[]>;

  /**
   * Get all shareable entities (for admin UI)
   */
  async getShareableEntities(): Promise<EntityInfo[]>;

  // ═══════════════════════════════════════════════════════════════
  // SHARING OPERATIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Share an item with a user or role
   * @returns The created SharedItem (status = Pending)
   */
  async shareItem(params: ShareItemParams, contextUser: UserInfo): Promise<SharedItemEntity>;

  /**
   * Share with multiple recipients at once
   */
  async shareItemBulk(params: ShareItemBulkParams, contextUser: UserInfo): Promise<SharedItemEntity[]>;

  /**
   * Update an existing share (change permission, expiration, etc.)
   */
  async updateShare(shareId: string, updates: ShareUpdateParams, contextUser: UserInfo): Promise<SharedItemEntity>;

  /**
   * Revoke a share
   */
  async revokeShare(shareId: string, contextUser: UserInfo): Promise<boolean>;

  /**
   * Accept a pending share invitation
   */
  async acceptInvitation(shareId: string, contextUser: UserInfo): Promise<SharedItemEntity>;

  /**
   * Decline a pending share invitation
   */
  async declineInvitation(shareId: string, contextUser: UserInfo): Promise<SharedItemEntity>;

  // ═══════════════════════════════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get all shares for a specific record
   */
  async getSharesForRecord(
    entityName: string,
    recordId: string,
    contextUser: UserInfo
  ): Promise<SharedItemEntity[]>;

  /**
   * Get items shared WITH the current user (across all entities or specific)
   */
  async getSharedWithMe(
    entityName?: string,
    includeRoleShares?: boolean,
    contextUser: UserInfo
  ): Promise<SharedWithMeResult[]>;

  /**
   * Get items shared BY the current user
   */
  async getSharedByMe(
    entityName?: string,
    contextUser: UserInfo
  ): Promise<SharedItemEntity[]>;

  /**
   * Get pending invitations for the current user
   */
  async getPendingInvitations(contextUser: UserInfo): Promise<SharedItemEntity[]>;

  /**
   * Count pending invitations (for badge display)
   */
  async getPendingInvitationCount(contextUser: UserInfo): Promise<number>;

  // ═══════════════════════════════════════════════════════════════
  // PERMISSION CHECKS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get the user's effective permission on a record
   * Considers: ownership, direct shares, role shares, implied permissions
   */
  async getEffectivePermission(
    entityName: string,
    recordId: string,
    contextUser: UserInfo
  ): Promise<EffectivePermission | null>;

  /**
   * Check if user has a specific permission level
   */
  async hasPermission(
    entityName: string,
    recordId: string,
    permissionName: string,
    contextUser: UserInfo
  ): Promise<boolean>;

  /**
   * Check if user can share this record (has AllowsResharing permission)
   */
  async canShare(
    entityName: string,
    recordId: string,
    contextUser: UserInfo
  ): Promise<boolean>;

  /**
   * Check if user is the owner of the record
   */
  async isOwner(
    entityName: string,
    recordId: string,
    contextUser: UserInfo
  ): Promise<boolean>;

  // ═══════════════════════════════════════════════════════════════
  // NOTIFICATIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Send invitation notification (email and/or in-app)
   */
  async sendInvitationNotification(share: SharedItemEntity, contextUser: UserInfo): Promise<void>;

  /**
   * Send response notification to sharer (accepted/declined)
   */
  async sendResponseNotification(share: SharedItemEntity, contextUser: UserInfo): Promise<void>;

  /**
   * Process expired invitations (scheduled job)
   */
  async processExpiredInvitations(): Promise<number>;
}
```

### 2.2 Type Definitions

```typescript
interface ShareItemParams {
  entityName: string;
  recordId: string;
  sharingTypeName: string;           // 'View', 'Edit', etc.
  sharedWithUserId?: string;
  sharedWithRoleId?: string;
  invitationMessage?: string;
  expiresAt?: Date;
  sendNotification?: boolean;        // default: true
}

interface ShareItemBulkParams {
  entityName: string;
  recordId: string;
  sharingTypeName: string;
  recipients: Array<{
    userId?: string;
    roleId?: string;
  }>;
  invitationMessage?: string;
  expiresAt?: Date;
  sendNotification?: boolean;
}

interface ShareUpdateParams {
  sharingTypeName?: string;
  expiresAt?: Date | null;
  notes?: string;
}

interface SharedWithMeResult {
  share: SharedItemEntity;
  entityName: string;
  recordId: string;
  recordDisplayName: string;         // Loaded from the actual record
  sharingType: SharingTypeEntity;
  sharedBy: UserEntity;
}

interface EffectivePermission {
  sharingType: SharingTypeEntity;
  source: 'owner' | 'direct' | 'role' | 'public' | 'organization';
  shareId?: string;                  // If from a SharedItem
  impliedPermissions: string[];      // All permissions this grants (e.g., Edit implies View)
  canReshare: boolean;
  expiresAt?: Date;
}
```

---

## 3. Driver Classes

### 3.1 Base Driver

Location: `packages/MJCore/src/generic/sharing/BaseSharingDriver.ts`

```typescript
@RegisterClass(BaseSharingDriver)
export abstract class BaseSharingDriver {

  /**
   * Validate before creating a share
   * @returns ValidationResult with success flag and optional error messages
   */
  async validateShare(
    share: ShareItemParams,
    sharer: UserInfo,
    targetRecord: BaseEntity
  ): Promise<ValidationResult> {
    // Default: allow if sharer can reshare
    const canShare = await SharingEngine.Instance.canShare(
      share.entityName,
      share.recordId,
      sharer
    );
    return { success: canShare, errors: canShare ? [] : ['You do not have permission to share this item'] };
  }

  /**
   * Hook called after share is created
   */
  async onShareCreated(share: SharedItemEntity, contextUser: UserInfo): Promise<void> {
    // Default: no-op, override for custom behavior
  }

  /**
   * Hook called after share is accepted
   */
  async onShareAccepted(share: SharedItemEntity, contextUser: UserInfo): Promise<void> {
    // Default: no-op
  }

  /**
   * Hook called after share is revoked
   */
  async onShareRevoked(share: SharedItemEntity, contextUser: UserInfo): Promise<void> {
    // Default: no-op
  }

  /**
   * Custom permission resolution logic
   * Override for entities with special permission rules (e.g., inheritance)
   */
  async resolveEffectivePermission(
    entityName: string,
    recordId: string,
    contextUser: UserInfo
  ): Promise<EffectivePermission | null> {
    // Default: use standard SharedItem lookup
    return null; // null means use default resolution
  }

  /**
   * Get display name for a record (for notifications and UI)
   */
  async getRecordDisplayName(
    entityName: string,
    recordId: string,
    contextUser: UserInfo
  ): Promise<string> {
    // Default: try common fields like Name, Title, Subject
    const md = new Metadata();
    const entity = await md.GetEntityObject(entityName, contextUser);
    await entity.Load(recordId);
    return entity.Get('Name') || entity.Get('Title') || entity.Get('Subject') || recordId;
  }
}
```

### 3.2 Entity-Specific Drivers (Examples)

```typescript
// For Lists - maybe cascade to related items?
@RegisterClass(BaseSharingDriver, 'ListSharingDriver')
export class ListSharingDriver extends BaseSharingDriver {

  async onShareCreated(share: SharedItemEntity, contextUser: UserInfo): Promise<void> {
    // Optional: Log to list activity feed
    // Optional: Cascade permissions to list items if configured
  }

  async getRecordDisplayName(entityName: string, recordId: string, contextUser: UserInfo): Promise<string> {
    const md = new Metadata();
    const list = await md.GetEntityObject<ListEntity>('Lists', contextUser);
    await list.Load(recordId);
    return list.Name;
  }
}

// For Categories - maybe cascade to children?
@RegisterClass(BaseSharingDriver, 'CategorySharingDriver')
export class CategorySharingDriver extends BaseSharingDriver {

  async onShareCreated(share: SharedItemEntity, contextUser: UserInfo): Promise<void> {
    // Could cascade share to all lists in this category
    // Based on configuration
  }
}
```

---

## 4. Actions (AI Agents & Workflows)

Location: `packages/Actions/CoreActions/src/custom/sharing/`

### 4.1 Core Actions

| Action | Description | Key Params |
|--------|-------------|------------|
| `ShareItemAction` | Share a record with user/role | entityName, recordId, sharingType, recipientUserId/RoleId, message |
| `ShareItemBulkAction` | Share with multiple recipients | entityName, recordId, sharingType, recipientUserIds[], recipientRoleIds[] |
| `RevokeShareAction` | Remove a share | shareId |
| `UpdateShareAction` | Change permission/expiration | shareId, newSharingType, newExpiration |
| `GetSharedWithMeAction` | List items shared with user | entityName (optional), includeRoles |
| `GetSharesForRecordAction` | List who has access | entityName, recordId |
| `CheckPermissionAction` | Check user's access level | entityName, recordId, userId |
| `AcceptShareInvitationAction` | Accept pending share | shareId |
| `DeclineShareInvitationAction` | Decline pending share | shareId |
| `GetPendingInvitationsAction` | List pending shares | - |

### 4.2 Action Categories

Create new Action Category: **"Sharing"** with appropriate icon and description.

---

## 5. Angular UI Components

Location: `packages/Angular/Generic/sharing/`

### 5.1 Components Overview

```
packages/Angular/Generic/sharing/
├── src/
│   ├── lib/
│   │   ├── components/
│   │   │   ├── share-dialog/              # Main sharing dialog
│   │   │   ├── share-manager/             # Manage existing shares
│   │   │   ├── sharing-badge/             # Permission indicator
│   │   │   ├── shared-with-me-browser/    # Browse shared items
│   │   │   ├── pending-invitations/       # Invitation list
│   │   │   └── invitation-response/       # Accept/decline UI
│   │   ├── services/
│   │   │   └── sharing.service.ts         # Angular service wrapper
│   │   └── models/
│   │       └── sharing.models.ts
│   └── module.ts
```

### 5.2 Share Dialog Component

**Features:**
- Search for users/roles to share with
- Select permission level from configured options
- Add optional message
- Set expiration date
- Preview who already has access
- Bulk add multiple recipients

**Usage:**
```html
<mj-share-dialog
  [entityName]="'Lists'"
  [recordId]="selectedList.ID"
  [recordDisplayName]="selectedList.Name"
  [visible]="showShareDialog"
  (shareComplete)="onShareComplete($event)"
  (cancel)="showShareDialog = false">
</mj-share-dialog>
```

### 5.3 Share Manager Component

**Features:**
- View all current shares for a record
- Change permission levels
- Revoke access
- Resend invitation
- See pending/accepted/declined status

**Usage:**
```html
<mj-share-manager
  [entityName]="'Lists'"
  [recordId]="list.ID"
  [readonly]="!canManageShares">
</mj-share-manager>
```

### 5.4 Sharing Badge Component

**Features:**
- Shows sharing status icon
- Hover tooltip with permission level
- Click to open share manager
- Different styles: Owner, Shared, Public

**Usage:**
```html
<mj-sharing-badge
  [entityName]="'Lists'"
  [recordId]="list.ID"
  [showTooltip]="true"
  (click)="openShareManager()">
</mj-sharing-badge>
```

### 5.5 Shared With Me Browser

**Features:**
- List all items shared with current user
- Filter by entity type
- Sort by date, name, sharer
- Quick actions: View, Remove from list
- Group by entity type or sharer

**Usage:**
```html
<mj-shared-with-me-browser
  [entityName]="'Lists'"  <!-- Optional: filter to one entity -->
  [showEntityFilter]="true"
  (itemSelected)="openSharedItem($event)">
</mj-shared-with-me-browser>
```

### 5.6 Pending Invitations Component

**Features:**
- List pending share invitations
- Accept/decline actions
- View invitation message
- See expiration date
- Badge count for header

**Usage:**
```html
<!-- In app header -->
<mj-pending-invitations-badge
  (click)="openInvitationsPanel()">
</mj-pending-invitations-badge>

<!-- Full panel -->
<mj-pending-invitations
  (invitationAccepted)="onAccepted($event)"
  (invitationDeclined)="onDeclined($event)">
</mj-pending-invitations>
```

---

## 6. Notifications Integration

### 6.1 Communication Setup

**Required Configuration:**

1. **Enable Email for System Notifications**
   - Ensure Communication Provider (SendGrid/etc.) is configured and active
   - Create EntityCommunicationMessageType for Users entity with Email type

2. **Create Templates**
   - Add notification templates to Templates entity
   - Configure template parameters for sharing context

3. **System Settings**
   - Set `Sharing.DefaultCommunicationProviderName`
   - Set `Sharing.DefaultSenderEmail` and `DefaultSenderName`

### 6.2 Notification Flow

```
User Shares Item
       │
       ▼
┌──────────────────┐
│ Create SharedItem│
│ (Status=Pending) │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌─────────────────┐
│ Send Email via   │────→│ CommunicationLog│
│ CommunicationEng │     │ (audit trail)   │
└────────┬─────────┘     └─────────────────┘
         │
         ▼
┌──────────────────┐
│ Create In-App    │
│ Notification     │
└──────────────────┘
         │
         ▼
    Recipient Sees
    Badge & Email
```

### 6.3 In-App Notifications

We should leverage or extend the existing notification system (if any) or create:

**Option A: Use existing Notifications entity (if exists)**

**Option B: Create new entity `MJ: User Notifications`**

| Column | Type | Description |
|--------|------|-------------|
| ID | uniqueidentifier PK | |
| UserID | FK | Recipient |
| Type | nvarchar(50) | 'ShareInvitation', 'ShareAccepted', etc. |
| Title | nvarchar(255) | Notification title |
| Message | nvarchar(max) | Notification body |
| EntityName | nvarchar(255) | Related entity |
| RecordID | nvarchar(450) | Related record |
| ActionURL | nvarchar(500) | Deep link |
| IsRead | bit | |
| CreatedAt | datetime | |

---

## 7. Admin UI

### 7.1 Sharing Administration Dashboard

Location: `packages/Angular/Explorer/dashboards/src/SharingAdmin/`

**Features:**

1. **Entity Configuration Tab**
   - List all entities
   - Toggle sharing enabled/disabled per entity
   - Configure available sharing types per entity
   - Set defaults (default permission, require approval)

2. **Sharing Types Tab**
   - View all sharing types
   - Add custom sharing types
   - Configure drivers
   - Set rank/hierarchy

3. **Active Shares Tab**
   - View all shares across system
   - Filter by entity, user, status
   - Bulk revoke
   - Export for audit

4. **System Settings Tab**
   - Configure notification provider
   - Set sender email/name
   - Invitation expiration defaults
   - Toggle email/in-app notifications

### 7.2 Navigation

Add to Admin application or create dedicated "Sharing" application:

```json
{
  "Name": "Sharing Admin",
  "DefaultNavItems": [
    {
      "Label": "Entity Configuration",
      "Icon": "fa-solid fa-sliders",
      "ResourceType": "Custom",
      "DriverClass": "SharingEntityConfigResource",
      "isDefault": true
    },
    {
      "Label": "Sharing Types",
      "Icon": "fa-solid fa-layer-group",
      "ResourceType": "Custom",
      "DriverClass": "SharingTypesResource"
    },
    {
      "Label": "Active Shares",
      "Icon": "fa-solid fa-share-nodes",
      "ResourceType": "Custom",
      "DriverClass": "ActiveSharesResource"
    },
    {
      "Label": "Settings",
      "Icon": "fa-solid fa-gear",
      "ResourceType": "Custom",
      "DriverClass": "SharingSettingsResource"
    }
  ]
}
```

---

## 8. Migration Path for Existing Artifacts

### 8.1 Backwards Compatibility

The Artifacts system currently uses:
- `SharingScope` field on Conversation Artifacts
- `ConversationArtifactPermissions` junction table

**Migration Strategy:**

1. **Phase 1: Parallel Operation**
   - Create new sharing tables
   - Add Artifacts to EntitySharingTypes
   - Keep existing Artifact sharing working
   - New shares use new system

2. **Phase 2: Data Migration**
   - Script to migrate `ConversationArtifactPermissions` → `SharedItem`
   - Map `SharingScope` values to appropriate `SharingType`
   - Validate data integrity

3. **Phase 3: Deprecation**
   - Mark old tables/fields as deprecated
   - Update Artifact UI to use new sharing components
   - Remove old permission checks

4. **Phase 4: Cleanup**
   - Remove deprecated tables/fields
   - Remove old sharing code

---

## 9. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Create database migration for core tables
- [ ] Seed SharingType data
- [ ] Create EntitySharingType configuration for initial entities
- [ ] Implement SharingEngine core methods
- [ ] Create BaseSharingDriver

### Phase 2: Service Layer (Week 2-3)
- [ ] Complete SharingEngine implementation
- [ ] Add permission checking logic
- [ ] Implement notification integration
- [ ] Create Actions for AI agents

### Phase 3: UI Components (Week 3-4)
- [ ] Share Dialog component
- [ ] Share Manager component
- [ ] Sharing Badge component
- [ ] Shared With Me browser
- [ ] Pending Invitations component

### Phase 4: Admin & Polish (Week 4-5)
- [ ] Admin dashboard components
- [ ] System settings UI
- [ ] Integration with Lists (first consumer)
- [ ] Documentation

### Phase 5: Migration & Cleanup (Week 5-6)
- [ ] Artifact migration planning
- [ ] Data migration scripts
- [ ] Testing and validation
- [ ] Deprecation of old system

---

## 10. Security Considerations

### 10.1 Permission Checks

All sharing operations must verify:
1. User is authenticated
2. User has permission to perform the action (AllowsResharing for sharing)
3. Target entity supports the requested sharing type
4. Recipient is valid (exists, active)

### 10.2 Data Access

When loading shared items:
1. Only return items where user has accepted share OR is owner
2. Filter by active/non-expired shares
3. Consider role memberships
4. Respect entity-level security

### 10.3 Audit Trail

All sharing operations are logged via:
1. MemberJunction Record Changes (automatic)
2. Communication Logs (for notifications)
3. Optional: Custom audit entity for compliance

---

## 11. Open Questions

1. **Role Hierarchy**: If user is in Role A, and Role A is shared with, should nested roles also get access?

2. **Guest Access**: Should we support sharing with external users (by email) who don't have accounts?

3. **Link Sharing**: Should we support "anyone with the link" style sharing like Google Docs?

4. **Folder/Container Sharing**: When sharing a Category, should it auto-share all Lists within?

5. **Notifications Entity**: Create new `MJ: User Notifications` or leverage existing system?

---

## 12. Summary

This Generic Sharing System provides:

✅ **Unified Pattern** - One system for all entities
✅ **Metadata-Driven** - Configuration without code changes
✅ **Extensible** - Driver classes for custom behavior
✅ **Complete Workflow** - Invitation → Accept/Decline → Access
✅ **Integrated Notifications** - Email + In-app via MJ Communications
✅ **Admin Control** - Full configuration UI
✅ **AI-Ready** - Actions for agents and workflows
✅ **Secure** - Permission checks at every level
✅ **Auditable** - Full trail via Record Changes

Once approved, this system will be implemented and Lists will be the first consumer, followed by migration of Artifacts.
