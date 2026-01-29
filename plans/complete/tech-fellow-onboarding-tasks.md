# Tech Fellow Onboarding Tasks - January 2026

## Overview

This document outlines four onboarding projects for new tech fellows, designed to provide meaningful contributions to MemberJunction while building deep familiarity with the codebase. Each project has been scoped based on thorough analysis of the current implementation state.

**Fellows:**
- **Hayder** + **Clara** (Finance Fellow) - MCP Server + Auth + Cowork Integration
- **Ian** - MJStorage File Browser & Attachments UI
- **Madhav** + **Kishan** (Growth Fellow) - MJComms SMS/Notifications
- **Soham** - Admin Dashboard UX Completion

**Collaboration:** All fellows will work with Claude Code sessions to accelerate development and learning.

---

## Project 1: MCP Server with Authentication & Cowork Integration

**Assigned to:** Hayder (PhD) + Clara (Finance Fellow)
**Package:** `packages/AI/MCPServer`
**Priority:** High - Enables external AI tool integrations

### Current State

The MCP (Model Context Protocol) server is **functionally complete** but lacks authentication:

**What's Working:**
- Full MCP protocol implementation via FastMCP with SSE transport
- Dynamic entity tools for all MJ entities:
  - `Get_[Entity]_Record` - Retrieve by primary key
  - `Create_[Entity]_Record` - Create new records
  - `Update_[Entity]_Record` - Update existing records
  - `Delete_[Entity]_Record` - Delete records
  - `Run_[Entity]_View` - Query with filters and sorting
- Complete agent tools:
  - `Discover_Agents` - Find agents by pattern
  - `Run_Agent` - Execute any agent by name or ID
  - `Execute_[AgentName]_Agent` - Specific tools per agent
  - `Get_Agent_Run_Status` - Check execution status
  - `Cancel_Agent_Run` - Request cancellation
- Diagnostic tools for agent run analysis
- CLI with tool filtering (`--include`, `--exclude`, `--tools-file`, `--list-tools`)
- Wildcard pattern support for entity/agent selection

**What's Missing:**
- Authentication is commented out in code (see `Server.ts:200-205`)
- Single hardcoded user context: `contextUser = UserCache.Instance.Users[0]`
- No per-user authorization or RBAC
- No TLS/HTTPS enforcement

### Key Files to Study

| File | Purpose | Lines |
|------|---------|-------|
| `src/index.ts` | CLI entry point with tool filtering | ~150 |
| `src/Server.ts` | Main MCP server implementation | ~1,217 |
| `src/config.ts` | Configuration via cosmiconfig | ~50 |
| `README.md` | Comprehensive documentation | - |

### Phase 1: Get MCP Working with Cowork (No Auth)

**Goal:** Validate the MCP server works end-to-end with Claude Cowork before adding authentication complexity.

#### What is Cowork?

Cowork is Anthropic's new product that brings Claude Code's agentic capabilities to Claude Desktop for knowledge work beyond coding. It can:
- Take on complex, multi-step tasks and execute them autonomously
- Break complex work into subtasks
- Execute within a virtual machine environment
- Coordinate multiple workstreams in parallel

**For our purposes:** Cowork supports MCP servers, which means it can connect to our MJ MCP server and use MJ's entities and agents as tools. This is the key integration point.

Reference: https://support.claude.com/en/articles/13345190-getting-started-with-cowork

#### Tasks

1. **Setup & Configuration**
   - Start the MCP server locally: `npx mj-mcp-server`
   - Review available tools: `npx mj-mcp-server --list-tools`
   - Configure for your sample app's entities

2. **Connect to Claude Cowork**
   - In Cowork/Claude Desktop settings, add MCP server configuration
   - Point to `http://localhost:4242/mcp` (default MCP endpoint)
   - Verify connection establishes successfully
   - Note: For local development, you may need ngrok or similar to expose the server

3. **Test Entity CRUD Operations**
   - Test `Get_[Entity]_Record` - retrieve a known record
   - Test `Create_[Entity]_Record` - create a test record
   - Test `Update_[Entity]_Record` - modify the test record
   - Test `Delete_[Entity]_Record` - clean up test record
   - Test `Run_[Entity]_View` - query with filters

4. **Test Agent Invocation**
   - Use `Discover_Agents` to list available agents
   - Execute a simple agent via `Run_Agent`
   - Check status with `Get_Agent_Run_Status`
   - Test cancellation with `Cancel_Agent_Run`

5. **Document Findings**
   - Note any issues or limitations discovered
   - Document successful use cases
   - Identify gaps for Phase 2

#### Success Criteria
- [ ] MCP server connects to Cowork successfully
- [ ] Can perform CRUD on entities via Cowork
- [ ] Can run views and filter data via Cowork
- [ ] Can invoke MJ agents from Cowork
- [ ] Documented test scenarios and results

### Phase 2: Implement Authentication

**Goal:** Add API key authentication so the MCP server can be safely exposed.

#### Current MJ System User Pattern (Study This First!)

MJ already has a system user + API key pattern in MJServer. Study these files:

| File | Purpose |
|------|---------|
| `packages/MJServer/src/config.ts:160,222` | Single `apiKey` config option |
| `packages/MJServer/src/context.ts:55-68` | API key validation in `getUserPayload()` |
| `packages/SQLServerDataProvider/src/UserCache.ts` | `GetSystemUser()` with hardcoded ID |
| `packages/MJServer/src/directives/RequireSystemUser.ts` | `@RequireSystemUser` decorator |
| `packages/MJServer/src/auth/index.ts` | `getSystemUser()` async helper |

**Current Pattern:**
```typescript
// Client sends: x-mj-api-key header
// Server validates against config.apiKey
// If match → authenticates as system user with isSystemUser: true
// @RequireSystemUser directive gates sensitive resolvers
```

#### Architecture Decision: Multi-User API Keys

The current system has ONE global API key for the system user. We want to extend this to support MULTIPLE API keys, each linked to a specific user. This enables:
- Different external clients with different access levels
- Per-user audit trails for MCP operations
- Revocable keys without affecting other clients

#### New Entities: API Keys (Based on BCSaaS Design)

The schema below is adapted from the BCSaaS repository's proven design, with modifications for MJ's user-centric (vs org-centric) model.

**Key Design Decisions:**
- **Normalized Scopes** - Separate `Scope` table enables reusable permission definitions
- **Junction Table** - `APIKeyScope` enables many-to-many scope assignments
- **Usage Logging** - Separate `APIKeyUsageLog` table for analytics and debugging
- **Unique Hash Index** - Direct lookup by full SHA-256 hash (no prefix needed)
- **Explicit Status** - `Active`/`Revoked` is clearer than boolean `IsActive`

```sql
-- =============================================================================
-- API KEY SCOPES - Reusable permission definitions
-- =============================================================================
CREATE TABLE __mj.APIScope (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL UNIQUE,       -- e.g., 'entities:read', 'agents:execute', 'admin:*'
    Category NVARCHAR(100) NOT NULL,          -- e.g., 'Entities', 'Agents', 'Admin'
    Description NVARCHAR(500) NULL
);

-- Seed default scopes
INSERT INTO __mj.APIScope (ID, Name, Category, Description) VALUES
    ('11111111-1111-1111-1111-111111111101', 'entities:read', 'Entities', 'Read entity records via RunView and Get'),
    ('11111111-1111-1111-1111-111111111102', 'entities:write', 'Entities', 'Create, update, and delete entity records'),
    ('11111111-1111-1111-1111-111111111103', 'agents:discover', 'Agents', 'List and discover available agents'),
    ('11111111-1111-1111-1111-111111111104', 'agents:execute', 'Agents', 'Execute agents and check run status'),
    ('11111111-1111-1111-1111-111111111105', 'admin:*', 'Admin', 'Full administrative access');

-- =============================================================================
-- API KEYS - The main API key entity
-- =============================================================================
CREATE TABLE __mj.APIKey (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    Hash NVARCHAR(64) NOT NULL UNIQUE,        -- SHA-256 hash of raw key (64 hex chars)
    UserID UNIQUEIDENTIFIER NOT NULL REFERENCES __mj.[User](ID),  -- Key owner/context
    Label NVARCHAR(255) NOT NULL,             -- Friendly name: "Cowork Integration", "CI/CD Pipeline"
    Description NVARCHAR(1000) NULL,          -- Optional detailed description

    -- Lifecycle
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active'
        CHECK (Status IN ('Active', 'Revoked')),
    ExpiresAt DATETIMEOFFSET NULL,            -- NULL = never expires
    LastUsedAt DATETIMEOFFSET NULL,

    -- Audit
    CreatedByUserID UNIQUEIDENTIFIER NOT NULL REFERENCES __mj.[User](ID)
);

-- Direct hash lookup for authentication
CREATE UNIQUE INDEX IX_APIKey_Hash ON __mj.APIKey(Hash);
-- Find keys by user
CREATE INDEX IX_APIKey_UserID ON __mj.APIKey(UserID);

-- =============================================================================
-- API KEY SCOPES - Junction table linking keys to scopes
-- =============================================================================
CREATE TABLE __mj.APIKeyScope (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    APIKeyID UNIQUEIDENTIFIER NOT NULL REFERENCES __mj.APIKey(ID) ON DELETE CASCADE,
    ScopeID UNIQUEIDENTIFIER NOT NULL REFERENCES __mj.APIScope(ID),
    UNIQUE(APIKeyID, ScopeID)
);

-- =============================================================================
-- API KEY USAGE LOG - Track API key usage for analytics/debugging
-- =============================================================================
CREATE TABLE __mj.APIKeyUsageLog (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    APIKeyID UNIQUEIDENTIFIER NOT NULL REFERENCES __mj.APIKey(ID),
    Endpoint NVARCHAR(500) NOT NULL,          -- e.g., '/mcp', '/graphql'
    Operation NVARCHAR(255) NULL,             -- e.g., 'Get_Users_Record', 'Run_Agent'
    Method NVARCHAR(10) NOT NULL,             -- HTTP method: GET, POST, etc.
    StatusCode INT NOT NULL,                  -- HTTP response code
    ResponseTimeMs INT NULL,                  -- Response time in milliseconds
    IPAddress NVARCHAR(45) NULL,              -- Client IP (supports IPv6)
    UserAgent NVARCHAR(500) NULL              -- Client user agent
);

-- Query usage by key
CREATE INDEX IX_APIKeyUsageLog_APIKeyID ON __mj.APIKeyUsageLog(APIKeyID);
-- Query recent usage (for rate limiting, analytics)
CREATE INDEX IX_APIKeyUsageLog_CreatedAt ON __mj.APIKeyUsageLog(__mj_CreatedAt);
```

**API Key Format:**
```
mj_sk_[64 hex characters]
```
Example: `mj_sk_a1b2c3d4e5f6789012345678901234567890123456789012345678901234`

- `mj_` - MemberJunction prefix
- `sk_` - Secret key indicator
- 64 hex chars - 32 bytes of cryptographically secure random data

#### Tasks

1. **Study Current System User Pattern**
   - Read `context.ts:getUserPayload()` to understand flow
   - Trace how `@RequireSystemUser` works
   - Understand `UserCache.GetSystemUser()`

2. **Create API Key Entity**
   - Write migration SQL (see schema above)
   - Run CodeGen to generate entity classes
   - Key format: `mj_` prefix + 32 random chars (e.g., `mj_a1b2c3d4e5f6...`)

3. **Implement Key Generation Utility**
   ```typescript
   // packages/MJCore/src/generic/apiKeyUtils.ts
   import { createHash, randomBytes } from 'crypto';

   export interface GeneratedAPIKey {
     raw: string;    // Full key to show user ONCE: mj_sk_abc123...
     hash: string;   // SHA-256 hash to store in DB (64 hex chars)
   }

   /**
    * Generate a new API key with format: mj_sk_[64 hex chars]
    * The raw key should be shown to user immediately and never stored.
    * Only the hash should be saved to the database.
    */
   export function generateAPIKey(): GeneratedAPIKey {
     // Generate 32 bytes of cryptographically secure random data
     const randomData = randomBytes(32);
     const hexString = randomData.toString('hex'); // 64 hex chars

     const raw = `mj_sk_${hexString}`;
     const hash = createHash('sha256').update(raw).digest('hex');

     return { raw, hash };
   }

   /**
    * Hash an API key for validation.
    * Used when validating incoming API keys against stored hashes.
    */
   export function hashAPIKey(key: string): string {
     return createHash('sha256').update(key).digest('hex');
   }

   /**
    * Validate API key format before attempting authentication.
    */
   export function isValidAPIKeyFormat(key: string): boolean {
     return /^mj_sk_[a-f0-9]{64}$/.test(key);
   }
   ```

4. **Update MCP Server Authentication**
   - Extract API key from request (header or query param)
   - Look up by prefix in `APIKey` entity
   - Verify hash matches
   - Check `IsActive` and `ExpiresAt`
   - Load associated `User` for context
   - Update `LastUsedAt` timestamp

5. **Replace Hardcoded User Context**
   - Current: `contextUser = UserCache.Instance.Users[0]`
   - New: `contextUser = await getUserFromApiKey(providedKey)`

6. **Backward Compatibility**
   - If no API key provided AND `config.apiKey` matches → use system user (existing behavior)
   - If database API key provided → use associated user
   - If invalid key → reject with 401

7. **Testing**
   - Generate test API key, verify authentication works
   - Test expired key rejection
   - Test inactive key rejection
   - Verify operations run as correct user context

#### Success Criteria
- [ ] API Key entity created and CodeGen'd
- [ ] Key generation utility working (with hashing)
- [ ] MCP server authenticates via API keys
- [ ] Per-user context passed to all operations
- [ ] Invalid/expired keys rejected with proper error
- [ ] Backward compatible with existing system user flow
- [ ] Documentation updated with auth setup

### Phase 3: Authorization & Polish (Stretch)

**Goal:** Add role-based tool filtering and production hardening.

#### Tasks

1. **Tool-Level Authorization**
   - Filter available tools based on user's entity permissions
   - Users only see entities they have access to
   - Agents filtered by user permissions

2. **Audit Logging**
   - Log all MCP operations
   - Track who did what via which tool

3. **Production Hardening**
   - TLS/HTTPS support
   - Rate limiting
   - Request validation

### Resources

- FastMCP Documentation: https://github.com/jlowin/fastmcp
- MCP Protocol Spec: https://modelcontextprotocol.io/
- Cowork MCP Documentation: (Anthropic docs)
- MJ Credentials System: `packages/MJCore/src/generic/credentials.ts`

---

## Project 2: MJStorage File Browser & Attachments UI

**Assigned to:** Ian
**Package:** `packages/MJStorage`, `packages/Angular/Generic/file-storage`
**Priority:** Medium-High - Makes storage a first-class feature

### Current State

MJStorage has solid backend infrastructure but limited UI:

**What's Working:**
- 7 storage provider drivers (AWS S3, Azure Blob, Google Cloud, Google Drive, Dropbox, Box, SharePoint)
- Provider abstraction via `FileStorageBase` class
- Pre-authenticated upload/download URLs
- `File` entity for metadata tracking
- `FileEntityRecordLink` entity for per-record attachments
- `FileStorageProvider` entity for provider configuration
- Basic Angular components (`FileUploadComponent`, `FilesGridComponent`)
- GraphQL mutations for file operations

**What's Missing:**
- No unified "file browser" UI across providers
- No Mac Finder-style navigation
- Per-record attachment viewing is basic
- No preview capabilities for common file types
- No drag-and-drop between providers

### Key Files to Study

| File | Purpose |
|------|---------|
| `packages/MJStorage/src/generic/FileStorageBase.ts` | Base class with all provider methods (~800 lines) |
| `packages/MJStorage/src/drivers/*.ts` | Individual provider implementations |
| `packages/MJStorage/src/util.ts` | Utility functions for URL generation |
| `packages/Angular/Generic/file-storage/src/lib/` | Angular UI components |
| `packages/MJServer/src/resolvers/FileResolver.ts` | GraphQL file operations |

### Key Entities

```
FileStorageProvider
├── ID, Name, ServerDriverKey, ClientDriverKey, Priority, IsActive, SupportsSearch
└── Configuration for each storage backend

File
├── ID, Name, Description, CategoryID, ProviderID, ContentType, ProviderKey, Status
├── Status: 'Pending' | 'Uploading' | 'Uploaded' | 'Deleting' | 'Deleted'
└── Core file metadata

FileEntityRecordLink
├── ID, FileID, EntityID, RecordID
└── Links files to ANY entity record (polymorphic attachment)

FileCategory
├── ID, Name, Description, ParentID
└── Hierarchical organization
```

### Phase 1: Unified File Browser Component

**Goal:** Create a Mac Finder-style file browser that works across all configured storage providers.

#### Design Concept

```
┌─────────────────────────────────────────────────────────────────────┐
│ File Browser                                                    [X] │
├──────────────┬──────────────────────────────────────────────────────┤
│ PROVIDERS    │  📁 Documents / Reports /                    [⬆️][🔄] │
│              │ ────────────────────────────────────────────────────  │
│ 🪣 AWS S3    │  Name              Type      Size    Modified        │
│ ☁️ Azure     │  📁 2024-Q1        folder    -       Jan 15         │
│ 📁 Google Dr │  📁 2024-Q2        folder    -       Apr 20         │
│ 📦 Dropbox   │  📄 summary.pdf    PDF       2.4MB   Dec 10         │
│              │  📊 data.xlsx      Excel     156KB   Dec 12         │
│ CATEGORIES   │  🖼️ chart.png      Image     89KB    Dec 12         │
│              │ ────────────────────────────────────────────────────  │
│ 📁 Documents │  [Upload] [New Folder] [Delete]         4 items      │
│ 📁 Images    │                                                       │
│ 📁 Reports   │                                                       │
└──────────────┴──────────────────────────────────────────────────────┘
```

#### Tasks

1. **Create File Browser Shell Component**
   - Location: `packages/Angular/Generic/file-storage/src/lib/file-browser/`
   - Three-panel layout: providers sidebar, folder tree, file grid
   - Responsive design (collapse sidebar on mobile)

2. **Provider Selector Panel**
   - Load all active `FileStorageProvider` entities
   - Display with appropriate icons per provider type
   - Click to switch active provider
   - Show connection status indicator

3. **Folder Navigation**
   - Breadcrumb path display
   - Back/forward navigation
   - Folder tree view in sidebar
   - Double-click folder to navigate

4. **File Grid/List View**
   - Toggle between grid and list views
   - Columns: Name, Type, Size, Modified, Actions
   - File type icons based on extension/content type
   - Sort by any column
   - Multi-select support

5. **File Operations**
   - Upload files (drag-and-drop + button)
   - Create new folder
   - Rename file/folder
   - Delete (with confirmation)
   - Download file
   - Copy/Move between folders (within same provider)

6. **Search**
   - Search within current provider
   - Filter by name, type, date range
   - Use provider's native search if supported (`SupportsSearch` flag)

#### FileStorageBase Methods to Use

```typescript
// Navigation
ListObjects(prefix, delimiter): Promise<StorageListResult>
DirectoryExists(path): Promise<boolean>
CreateDirectory(path): Promise<boolean>

// File operations
CreatePreAuthUploadUrl(objectName): Promise<CreatePreAuthUploadUrlPayload>
CreatePreAuthDownloadUrl(objectName): Promise<string>
DeleteObject(objectName): Promise<boolean>
MoveObject(oldName, newName): Promise<boolean>
CopyObject(source, destination): Promise<boolean>
ObjectExists(objectName): Promise<boolean>

// Search (if supported)
SearchFiles(query, options?): Promise<FileSearchResultSet>
```

#### Success Criteria
- [ ] Can browse files across all configured providers
- [ ] Folder navigation works (breadcrumbs, tree, double-click)
- [ ] Can upload/download/delete files
- [ ] Search works within provider
- [ ] Responsive design works on mobile

### Phase 2: Per-Record Attachment Viewer

**Goal:** Enable any entity record to display and manage its attached files.

#### Design Concept

```
┌─────────────────────────────────────────────────────────────────────┐
│ Customer Record: Acme Corp                                          │
├─────────────────────────────────────────────────────────────────────┤
│ [Details] [Activity] [Attachments (3)] [Notes]                      │
├─────────────────────────────────────────────────────────────────────┤
│ ATTACHMENTS                                          [+ Add Files]  │
│ ───────────────────────────────────────────────────────────────────│
│ 📄 Contract_2024.pdf         2.4 MB    Dec 10    [👁️][⬇️][🗑️]      │
│ 📊 Financial_Summary.xlsx    156 KB    Dec 12    [👁️][⬇️][🗑️]      │
│ 🖼️ Logo.png                  89 KB     Nov 05    [👁️][⬇️][🗑️]      │
└─────────────────────────────────────────────────────────────────────┘
```

#### Tasks

1. **Create Attachment Panel Component**
   - Location: `packages/Angular/Generic/file-storage/src/lib/attachment-panel/`
   - Input: `EntityID` and `RecordID`
   - Query `FileEntityRecordLink` for attachments
   - Display linked files with metadata

2. **Attachment Operations**
   - Add attachment (upload new or link existing)
   - Remove attachment (unlink, optionally delete file)
   - Download attachment
   - Preview common types (images, PDFs)

3. **Integration with Entity Forms**
   - Create directive/service for easy integration
   - Example usage:
     ```html
     <mj-attachment-panel
       [entityName]="'Customers'"
       [recordId]="customer.ID">
     </mj-attachment-panel>
     ```

4. **File Preview Modal**
   - Image preview (inline)
   - PDF preview (embedded viewer or new tab)
   - Office documents (download or external viewer link)
   - Code/text files (syntax highlighted view)

#### Data Access Pattern

```typescript
// Load attachments for a record
const rv = new RunView();
const links = await rv.RunView<FileEntityRecordLinkEntity>({
  EntityName: 'File Entity Record Links',
  ExtraFilter: `EntityID='${entityId}' AND RecordID='${recordId}'`,
  ResultType: 'entity_object'
});

// Get file details for each link
const fileIds = links.Results.map(l => l.FileID);
const files = await rv.RunView<FileEntity>({
  EntityName: 'Files',
  ExtraFilter: `ID IN (${fileIds.map(id => `'${id}'`).join(',')})`,
  ResultType: 'entity_object'
});
```

#### Success Criteria
- [ ] Attachment panel loads files for any entity/record
- [ ] Can add new attachments (upload + link)
- [ ] Can remove attachments
- [ ] Preview works for images and PDFs
- [ ] Easy to integrate into existing entity forms

### Phase 3: Agent Framework Integration (Stretch)

**Goal:** Make files accessible to AI agents as context.

#### Tasks

1. **File Context for Agents**
   - When agent runs on a record, include attached files in context
   - Support image modality for vision-capable models
   - Extract text from documents for context

2. **File Actions**
   - `ReadFileAction` - Get file contents
   - `SearchFilesAction` - Search across providers
   - `AttachFileAction` - Link file to conversation/record

### Resources

- Existing Components: `packages/Angular/Generic/file-storage/src/lib/`
- Provider Drivers: `packages/MJStorage/src/drivers/`
- GraphQL Resolver: `packages/MJServer/src/resolvers/FileResolver.ts`
- Kendo UI File Components: https://www.telerik.com/kendo-angular-ui/components/upload/

---

## Project 3: MJComms SMS/Notifications Enhancement

**Assigned to:** Madhav (with Kishan, Growth Fellow)
**Package:** `packages/Communication`
**Priority:** High - Enables user engagement features

### Current State

MJComms has working infrastructure but lacks unified notification delivery:

**What's Working:**
- 4 providers: SendGrid (email), MS Graph (Office 365), Gmail, Twilio (SMS)
- Template system integration
- `User Notifications` entity for in-app notifications
- `CommunicationEngine` for server-side sending
- `EntityCommunicationsEngine` for bulk entity-based sends
- Communication logging (`Communication Runs`, `Communication Logs`)
- Credential resolution from environment variables

**What's Missing:**
- No unified "notify user" API combining in-app + external delivery
- No `User Notification Types` for categorizing notifications
- No user delivery preferences (email vs SMS vs in-app)
- SMS receiving/webhook handling not documented
- No scheduled notification delivery

### Key Files to Study

| File | Purpose |
|------|---------|
| `packages/Communication/engine/src/Engine.ts` | Main CommunicationEngine |
| `packages/Communication/providers/twilio/src/TwilioProvider.ts` | Twilio SMS provider |
| `packages/Communication/base-types/src/BaseProvider.ts` | Message/ProcessedMessage classes |
| `packages/MJCoreEntities/src/engines/UserInfoEngine.ts` | User notification loading |
| `packages/Angular/Generic/notifications/src/lib/notifications.service.ts` | Angular notification service |

### Key Entities

```
Communication Providers
├── ID, Name, Status, SupportsSending, SupportsScheduledSending
└── Provider configuration

Communication Provider Message Types
├── ID, CommunicationProviderID, CommunicationBaseMessageTypeID
└── What each provider supports (Email, SMS, etc.)

Communication Base Message Types
├── ID, Type ('Email', 'SMS', etc.)
└── Global message type definitions

User Notifications (Current - In-App Only)
├── ID, UserID, Title, Message, ResourceTypeID, ResourceRecordID
├── Unread, ReadAt
└── In-app notification storage

Communication Runs / Communication Logs
└── Audit trail for sent messages
```

### Phase 1: Get Twilio SMS Working

**Goal:** Send and receive SMS messages using existing Twilio provider.

#### Tasks

1. **Setup Twilio Account**
   - Create Twilio account (if not exists)
   - Get Account SID, Auth Token, Phone Number
   - Configure webhook URL for incoming messages

2. **Configure Environment**
   ```bash
   export TWILIO_ACCOUNT_SID=your_sid
   export TWILIO_AUTH_TOKEN=your_token
   export TWILIO_PHONE_NUMBER=+1234567890
   ```

3. **Test Sending SMS**
   ```typescript
   const engine = CommunicationEngine.Instance;
   await engine.Config(false, contextUser);

   const message = new Message();
   message.To = '+1987654321';
   message.Body = 'Hello from MemberJunction!';

   const result = await engine.SendSingleMessage(
     'Twilio',
     'SMS',  // or check actual message type name
     message
   );
   ```

4. **Build Simple Test App**
   - Angular component with phone number input
   - Send message button
   - Display sent message log
   - Show delivery status

5. **Implement SMS Receiving**
   - Create webhook endpoint for Twilio callbacks
   - Parse incoming message data
   - Store in appropriate entity (new or existing)
   - Trigger notification for received messages

6. **Test Two-Way Conversation**
   - Send SMS to test phone
   - Reply from phone
   - Verify reply captured in system

#### Twilio Provider Methods

```typescript
// From TwilioProvider.ts
SendSingleMessage(message: ProcessedMessage): Promise<MessageResult>
GetMessages(params: GetMessagesParams): Promise<GetMessagesResult>
GetSingleMessage(messageId: string): Promise<any>
```

#### Success Criteria
- [ ] Can send SMS via Twilio
- [ ] Messages logged to Communication Logs
- [ ] Incoming SMS captured via webhook
- [ ] Simple test UI working

### Phase 2: User Notification Types Entity

**Goal:** Create infrastructure for categorizing notifications with different delivery behaviors.

#### New Entity Design

```sql
-- User Notification Types
-- Note: __mj_CreatedAt/__mj_UpdatedAt are added automatically by CodeGen
CREATE TABLE __mj.UserNotificationType (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,           -- e.g., 'System Alert', 'Task Assignment', 'Report Ready'
    Description NVARCHAR(500),

    -- Delivery Configuration
    DefaultDeliveryMethod NVARCHAR(50),     -- 'InApp', 'Email', 'SMS', 'All'
    AllowUserPreference BIT DEFAULT 1,      -- Can users override?

    -- UI Configuration
    Icon NVARCHAR(100),                     -- Font Awesome icon class
    Color NVARCHAR(50),                     -- Badge/highlight color

    -- Behavior
    AutoExpireDays INT,                     -- Auto-mark as read after N days
    Priority INT DEFAULT 0                  -- Sort order (lower = higher priority)
);

-- User Notification Preferences (per user per type)
-- Note: __mj_CreatedAt/__mj_UpdatedAt are added automatically by CodeGen
CREATE TABLE __mj.UserNotificationPreference (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    UserID UNIQUEIDENTIFIER NOT NULL REFERENCES __mj.[User](ID),
    NotificationTypeID UNIQUEIDENTIFIER NOT NULL REFERENCES __mj.UserNotificationType(ID),

    DeliveryMethod NVARCHAR(50),            -- Override: 'InApp', 'Email', 'SMS', 'None'
    Enabled BIT DEFAULT 1,                  -- Opt-out of this type entirely

    UNIQUE(UserID, NotificationTypeID)
);

-- Update User Notifications to reference Type
ALTER TABLE __mj.UserNotification
ADD NotificationTypeID UNIQUEIDENTIFIER REFERENCES __mj.UserNotificationType(ID);
```

#### Tasks

1. **Create Migration**
   - Add `UserNotificationType` entity
   - Add `UserNotificationPreference` entity
   - Update `UserNotification` with `NotificationTypeID` FK
   - Seed default notification types

2. **Run CodeGen**
   - Generate entity classes
   - Generate GraphQL schema
   - Generate Angular forms

3. **Create Default Types**
   ```sql
   INSERT INTO __mj.UserNotificationType (ID, Name, DefaultDeliveryMethod, Icon)
   VALUES
     ('...', 'System Alert', 'InApp', 'fa-exclamation-triangle'),
     ('...', 'Task Assignment', 'Email', 'fa-tasks'),
     ('...', 'Report Ready', 'InApp', 'fa-chart-bar'),
     ('...', 'Agent Completion', 'Email', 'fa-robot'),
     ('...', 'Security Alert', 'All', 'fa-shield-alt');
   ```

#### Success Criteria
- [ ] New entities created and CodeGen'd
- [ ] Default notification types seeded
- [ ] User preferences can be stored

### Phase 3: Unified Notification Service

**Goal:** Create single API that handles in-app + external delivery based on type and preferences.

#### Service Design

```typescript
// New: packages/Communication/notifications/src/NotificationService.ts

interface SendNotificationParams {
  userId: string;
  typeNameOrId: string;          // 'Task Assignment' or UUID
  title: string;
  message: string;
  resourceTypeId?: string;       // Link to resource
  resourceRecordId?: string;
  data?: Record<string, any>;    // Additional context for templates
  forceDeliveryMethod?: 'InApp' | 'Email' | 'SMS' | 'All';  // Override
}

class NotificationService {
  static Instance: NotificationService;

  async SendNotification(params: SendNotificationParams, contextUser: UserInfo): Promise<NotificationResult> {
    // 1. Load notification type
    const type = await this.getNotificationType(params.typeNameOrId);

    // 2. Load user preferences
    const prefs = await this.getUserPreferences(params.userId, type.ID);

    // 3. Determine delivery method
    const method = params.forceDeliveryMethod
      ?? prefs?.DeliveryMethod
      ?? type.DefaultDeliveryMethod;

    // 4. Create in-app notification (always, unless method is 'None')
    if (method !== 'None') {
      await this.createInAppNotification(params, type);
    }

    // 5. Send external notification if needed
    if (method === 'Email' || method === 'All') {
      await this.sendEmail(params, contextUser);
    }
    if (method === 'SMS' || method === 'All') {
      await this.sendSMS(params, contextUser);
    }

    return { success: true, deliveryMethod: method };
  }
}
```

#### Tasks

1. **Create NotificationService Class**
   - Server-side service in new package
   - Handle type lookup and preference resolution
   - Coordinate in-app + external delivery

2. **Integrate with CommunicationEngine**
   - Use existing email/SMS providers
   - Use Credentials system for provider config
   - Template support for notification messages

3. **Create Client-Side Wrapper**
   - Angular service that calls GraphQL mutation
   - Simple API: `notificationService.send({ userId, type, title, message })`

4. **Update User Notifications UI**
   - Show notification type icon/color
   - Filter by type
   - Preferences management UI

#### Success Criteria
- [ ] Single API sends to in-app + external based on preferences
- [ ] User can set delivery preferences per type
- [ ] Email and SMS delivery working through unified service

### Phase 4: Scheduled/Digest Notifications (Stretch)

**Goal:** Support scheduled delivery and digest summaries.

#### Tasks

1. **Notification Queue Entity**
   - Store pending notifications
   - Support scheduled send time
   - Batch into digests

2. **Scheduled Job**
   - Process queue periodically
   - Group into daily/weekly digests
   - Send via appropriate channel

### Resources

- Twilio Node SDK: https://www.twilio.com/docs/libraries/node
- MJ Credentials: `packages/MJCore/src/generic/credentials.ts`
- Template Engine: `packages/Templates/`
- Existing Notification Service: `packages/Angular/Generic/notifications/`

---

## Project 4: Admin Dashboard UX Completion

**Assigned to:** Soham
**Package:** `packages/Angular/Explorer/explorer-settings`
**Priority:** Medium-High - Improves admin experience

### Current State

The admin dashboard has good foundations but needs completion and polish:

**What's Working:**
- User Management (CRUD, filtering, stats, export)
- Role Management (CRUD, system vs custom differentiation)
- Entity Permissions (CRUD permissions per role per entity)
- Application Management (basic CRUD)
- User Profile Settings (avatar with 4 methods)
- SQL Logging (advanced feature for owners)
- User App Configuration (drag-drop reordering)

**What's Broken/Incomplete:**
- Search in Settings doesn't filter (UI exists, logic missing)
- Mobile layout only works for General tab
- Auth provider avatar sync is stubbed
- Some debug `console.log` statements in production code
- System role detection is hardcoded (not data-driven)

**What's Missing:**
- Bulk operations (multi-select users, bulk role assign)
- Audit trail (who changed what when)
- Permission conflict warnings
- Role templates/presets

### Key Files to Study

| File | Purpose |
|------|---------|
| `explorer-settings/src/lib/settings/settings.component.ts` | Main settings container |
| `explorer-settings/src/lib/user-management/user-management.component.ts` | User CRUD (~400 lines) |
| `explorer-settings/src/lib/role-management/role-management.component.ts` | Role CRUD |
| `explorer-settings/src/lib/entity-permissions/entity-permissions.component.ts` | Permission matrix |
| `explorer-settings/src/lib/user-profile-settings/user-profile-settings.component.ts` | Avatar management |

### Phase 1: Fix Existing Issues

**Goal:** Make all existing features work correctly.

#### Bug Fixes Required

1. **Search Filtering Not Working**
   - Location: `settings.component.ts:161-163`
   - Issue: `TODO: Implement content filtering based on search term`
   - Fix: Implement `filterSettings()` method to filter visible sections/items

2. **Mobile Layout Incomplete**
   - Location: `settings.component.html:217-236`
   - Issue: Only General tab case implemented in mobile template
   - Fix: Add cases for Users, Roles, Applications, Permissions, Advanced tabs

3. **Console.log Cleanup**
   - Location: `permission-dialog.component.ts:56, 100-134`
   - Issue: Debug logging in production code
   - Fix: Remove or wrap in `environment.production` check

4. **System Role Detection Hardcoded**
   - Location: `role-management.component.ts:167`
   - Issue: `['Administrator', 'User', 'Guest', 'Developer']` hardcoded
   - Fix: Add `IsSystemRole` to Role entity or query from metadata

#### Tasks

1. **Implement Settings Search**
   ```typescript
   // settings.component.ts
   filterSettings(searchTerm: string): void {
     const term = searchTerm.toLowerCase();
     this.filteredSections = this.sections.filter(section =>
       section.title.toLowerCase().includes(term) ||
       section.description.toLowerCase().includes(term)
     );
   }
   ```

2. **Complete Mobile Template**
   - Add `@switch` cases for all tabs
   - Ensure components are responsive
   - Test on mobile viewport

3. **Remove Debug Logging**
   - Search for `console.log` in explorer-settings
   - Remove or conditionally compile

4. **Data-Driven System Roles**
   - Option A: Add `IsSystemRole` column to Role entity
   - Option B: Query from configuration/metadata

#### Success Criteria
- [ ] Search filters settings sections
- [ ] All tabs work on mobile
- [ ] No debug console.log in code
- [ ] System roles detected from data

### Phase 2: Enhance User Settings Page

**Goal:** Make user settings page polished and complete.

#### Current User Settings Structure

```
Settings
├── General
│   ├── Profile (name, email, avatar)  ← Partially done
│   ├── Preferences                     ← Placeholder
│   └── Notifications                   ← Placeholder
├── Users (admin only)
├── Roles (admin only)
├── Applications (admin only)
├── Permissions (admin only)
└── Advanced
    ├── SQL Logging                     ← Done
    ├── Performance                     ← Placeholder
    └── Developer Tools                 ← Placeholder
```

#### Tasks

1. **Complete Profile Section**
   - Display current user info clearly
   - Edit name, title, contact info
   - Avatar management (already exists, integrate better)

2. **Implement Preferences Section**
   - Theme preference (light/dark/system)
   - Default landing page
   - Date/time format preference
   - Items per page default

3. **Implement Notifications Section**
   - Link to notification type preferences (from Madhav's work)
   - In-app notification settings
   - Email digest preferences
   - Do not disturb schedule

4. **Complete Auth Provider Avatar Sync**
   - Location: `user-profile-settings.component.ts:264`
   - Current: Stubbed with error message
   - Fix: Integrate with auth provider to fetch avatar

5. **Add User Activity Section**
   - Recent login history
   - Active sessions
   - Security events

#### Success Criteria
- [ ] Profile section fully functional
- [ ] Preferences section working
- [ ] Notifications section working
- [ ] Avatar sync from auth provider
- [ ] User activity visible

### Phase 3: Add Bulk Operations

**Goal:** Enable efficient management of multiple users/roles.

#### Design Concept

```
┌─────────────────────────────────────────────────────────────────────┐
│ Users                                    [+ Add User] [⚙️ Actions ▼]│
├─────────────────────────────────────────────────────────────────────┤
│ [2 selected]  [✓ Select All]  Actions: [Enable] [Disable] [Delete] │
├─────────────────────────────────────────────────────────────────────┤
│ ☐ Name          Email              Role        Status    Actions   │
│ ☑ John Smith    john@example.com   Admin       Active    [✏️][🗑️]  │
│ ☑ Jane Doe      jane@example.com   User        Active    [✏️][🗑️]  │
│ ☐ Bob Wilson    bob@example.com    User        Inactive  [✏️][🗑️]  │
└─────────────────────────────────────────────────────────────────────┘
```

#### Tasks

1. **Add Selection State to Grid**
   - Checkbox column
   - Select all / deselect all
   - Selection count indicator

2. **Bulk Action Toolbar**
   - Appears when items selected
   - Actions: Enable, Disable, Delete, Assign Role
   - Confirmation dialog for destructive actions

3. **Bulk Role Assignment Dialog**
   - Select role to add/remove
   - Preview affected users
   - Execute with progress indicator

4. **Implement for Users, Roles, Permissions**
   - Users: bulk status change, bulk role assign
   - Roles: bulk delete (non-system only)
   - Permissions: bulk permission update

#### Success Criteria
- [ ] Multi-select working on user grid
- [ ] Bulk enable/disable working
- [ ] Bulk role assignment working
- [ ] Confirmation dialogs for destructive actions

### Phase 4: Audit Trail (Stretch)

**Goal:** Show admin activity history.

#### Tasks

1. **Query Record Changes**
   - MJ has built-in record change tracking
   - Query changes for admin-related entities
   - Display in timeline format

2. **Activity Log Component**
   - Who changed what when
   - Filter by user, entity, date
   - Export capability

### Resources

- Kendo UI Grid Selection: https://www.telerik.com/kendo-angular-ui/components/grid/selection/
- MJ Record Changes: `packages/MJCoreEntities/src/generated/entity_subclasses.ts` (RecordChangeEntity)
- Existing Components: `packages/Angular/Explorer/explorer-settings/src/lib/`

---

## Success Metrics

Each project should achieve:

1. **Functionality** - Core features working as specified
2. **Code Quality** - Follows MJ patterns, no `any` types, proper error handling
3. **Documentation** - README updates, code comments where needed
4. **Testing** - Manual test plan executed, edge cases considered
5. **Learning** - Fellow understands MJ architecture and can explain their work

## Getting Help

All fellows have access to Claude Code for:
- Code generation and review
- Debugging assistance
- Architecture questions
- Best practices guidance

When stuck:
1. Search existing code for similar patterns
2. Check CLAUDE.md guidelines
3. Ask Claude Code for help
4. Escalate to Amith if blocked

---

## Appendix: Common MJ Patterns

### Entity Access
```typescript
const md = new Metadata();
const entity = await md.GetEntityObject<UserEntity>('Users', contextUser);
await entity.Load(userId);
```

### RunView for Queries
```typescript
const rv = new RunView();
const results = await rv.RunView<UserEntity>({
  EntityName: 'Users',
  ExtraFilter: `IsActive=1`,
  OrderBy: 'Name',
  ResultType: 'entity_object'
}, contextUser);
```

### Angular Component Pattern
```typescript
@Component({...})
export class MyComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
```

### No Standalone Components!
```typescript
// ❌ WRONG
@Component({
  standalone: true,
  imports: [CommonModule]
})

// ✅ CORRECT - use NgModule
@NgModule({
  declarations: [MyComponent],
  imports: [CommonModule],
  exports: [MyComponent]
})
```
