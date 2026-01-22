# MemberJunction Committees App & MJ Central App Store Design

**Version:** 1.0 Draft
**Date:** January 21, 2026
**Status:** Design Phase

---

## Executive Summary

This document provides a comprehensive design for two interconnected initiatives:

1. **Committees App**: A first-class MemberJunction application for managing committee structures, rosters, meetings, and governance workflows, designed as an open-core product (OSS core + premium modules).

2. **MJ Central App Store**: A platform for discovering, installing, and managing MemberJunction applications across customer instances, leveraging the existing Component Registry infrastructure.

### Key Architectural Insights

After analyzing the MemberJunction codebase, several important discoveries shape this design:

- **Component Registry Already Exists**: MJ has a robust `ComponentRegistry` infrastructure with multi-registry support (MJ Public Registry, Skip Registry), REST APIs, and client SDKs.
- **Application System is Metadata-Driven**: Applications are defined via JSON metadata files, not code, making them installable via mj-sync.
- **Single Schema Pattern**: MJ uses a unified `__mj` schema with entity categories rather than separate schemas per feature.
- **Provider Pattern for Extensibility**: Premium features can use optional packages/providers (like AI providers).

---

## Part 1: MJ Central App Store Architecture

### 1.1 Current Infrastructure (Already Built)

MJ already has substantial infrastructure for centralized app distribution:

| Component | Status | Location |
|-----------|--------|----------|
| Component Registry Server | ✅ Built | `/packages/ComponentRegistry/` |
| Component Registry Client SDK | ✅ Built | `/packages/ComponentRegistryClientSDK/` |
| GraphQL Registry Operations | ✅ Built | `/packages/MJServer/src/resolvers/ComponentRegistryResolver.ts` |
| Registry Metadata Storage | ✅ Built | `MJ: Component Registries` entity |
| Component Storage | ✅ Built | `MJ: Components` entity |
| Application Entity System | ✅ Built | `Applications`, `UserApplications`, `Application Entities` |
| User Info Engine (Install Logic) | ✅ Built | `UserInfoEngine.InstallApplication()` |

### 1.2 MJ Central Conceptual Model

MJ Central is the hosted service that:
- **Hosts the MJ Public Registry** at `https://registry.memberjunction.com/`
- **Manages subscriptions** and entitlements for customer instances
- **Distributes applications** (metadata + migration bundles)
- **Handles licensing** for premium features

```
┌─────────────────────────────────────────────────────────────────┐
│                        MJ CENTRAL                                │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │  App Catalog     │  │  Subscription    │  │  Component    │ │
│  │  Management      │  │  & Licensing     │  │  Registry     │ │
│  └────────┬─────────┘  └────────┬─────────┘  └───────┬───────┘ │
└───────────┼─────────────────────┼────────────────────┼─────────┘
            │                     │                    │
            ▼                     ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CUSTOMER MJ INSTANCE                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │  Installed Apps  │  │  Subscription    │  │  Local        │ │
│  │  (metadata)      │  │  Record          │  │  Components   │ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 What Needs to Be Built for MJ Central

| Component | Priority | Description |
|-----------|----------|-------------|
| **App Catalog Entity** | High | New entity to track available apps with editions, pricing, dependencies |
| **Subscription Entity** | High | Track customer subscriptions, feature entitlements |
| **App Installation Manager** | High | Service to install/upgrade apps (run migrations, sync metadata) |
| **Central Admin Portal** | Medium | Web UI for Blue Cypress to manage app catalog |
| **Customer Portal** | Medium | Self-service UI for customers to browse/install apps |
| **Entitlement Sync** | Medium | Push subscription state to customer instances |
| **Analytics Dashboard** | Low | Track app usage, adoption metrics |

### 1.4 App Installation Flow

```
1. Customer browses MJ Central App Catalog
2. Selects "Committees Pro" → triggers installation request
3. MJ Central:
   a. Validates subscription/entitlement
   b. Packages app bundle (metadata + migrations)
   c. Sends to customer instance
4. Customer MJ Instance:
   a. Applies migrations (via Flyway)
   b. Syncs metadata (via mj-sync)
   c. Runs CodeGen (refreshes entity classes)
   d. Registers application in Applications entity
5. User sees new app in their application switcher
```

### 1.5 Proposed New Entities for MJ Central

```sql
-- App catalog on MJ Central
CREATE TABLE ${flyway:defaultSchema}.AppCatalog (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX),
    Publisher NVARCHAR(255),
    Category NVARCHAR(100),
    IconURL NVARCHAR(500),
    RepositoryURL NVARCHAR(500),
    DocumentationURL NVARCHAR(500),
    Status NVARCHAR(50) NOT NULL DEFAULT 'Active',
    IsOpenSource BIT NOT NULL DEFAULT 0,
    CONSTRAINT PK_AppCatalog PRIMARY KEY (ID)
);

-- App editions (Core, Pro, Enterprise)
CREATE TABLE ${flyway:defaultSchema}.AppEdition (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    AppID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(100) NOT NULL,  -- 'Core', 'Pro', 'Enterprise'
    Description NVARCHAR(MAX),
    PricingModel NVARCHAR(50),    -- 'Free', 'Subscription', 'OneTime'
    MonthlyPrice DECIMAL(10,2),
    AnnualPrice DECIMAL(10,2),
    Features NVARCHAR(MAX),       -- JSON array of feature flags
    CONSTRAINT PK_AppEdition PRIMARY KEY (ID),
    CONSTRAINT FK_AppEdition_App FOREIGN KEY (AppID) REFERENCES ${flyway:defaultSchema}.AppCatalog(ID)
);

-- Customer subscriptions
CREATE TABLE ${flyway:defaultSchema}.CustomerSubscription (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CustomerID UNIQUEIDENTIFIER NOT NULL,
    AppEditionID UNIQUEIDENTIFIER NOT NULL,
    StartDate DATE NOT NULL,
    EndDate DATE,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Active',
    EntitlementsJSON NVARCHAR(MAX),  -- Feature flags
    CONSTRAINT PK_CustomerSubscription PRIMARY KEY (ID),
    CONSTRAINT FK_CustomerSubscription_Edition FOREIGN KEY (AppEditionID) REFERENCES ${flyway:defaultSchema}.AppEdition(ID)
);
```

---

## Part 2: Committees App Design

### 2.1 Product Philosophy

The Committees app follows MemberJunction's design principles:
- **Metadata-driven**: All configuration in the database, not code
- **Link-first integration**: References to external systems (Zoom, Google Docs, SharePoint), not recreation
- **Entity-centric**: Leverages MJ's canonical entities (Users, Organizations) rather than duplicating
- **Open-core**: Free core is fully functional; premium adds workflow automation and AI

### 2.2 Schema Strategy: Extend `__mj` Schema

Based on analysis, MJ uses a **single schema pattern** with entity categories. The Committees app should:

1. **Add entities to `__mj` schema** (not a separate `committees` schema)
2. **Use the `MJ: ` prefix** for new entities (following v3 convention)
3. **Register in SchemaInfo** with reserved ID range

**Reserved Entity ID Range**: Request allocation from MJ Core (e.g., 1001000-1001999)

### 2.3 Core Entity Design (Open Source)

#### 2.3.1 Committee Structure Entities

```sql
-- Committee Types: Board, Standing, Ad Hoc, Workgroup, Standards WG
CREATE TABLE ${flyway:defaultSchema}.CommitteeType (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(MAX),
    IsStandards BIT NOT NULL DEFAULT 0,  -- Standards body committees
    DefaultTermMonths INT,
    IconClass NVARCHAR(100),
    CONSTRAINT PK_CommitteeType PRIMARY KEY (ID),
    CONSTRAINT UQ_CommitteeType_Name UNIQUE (Name)
);

-- Core Committee entity
CREATE TABLE ${flyway:defaultSchema}.Committee (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX),
    CommitteeTypeID UNIQUEIDENTIFIER NOT NULL,
    ParentCommitteeID UNIQUEIDENTIFIER,  -- Hierarchy support
    OrganizationID UNIQUEIDENTIFIER,     -- Links to MJ Organization entity
    CharterDocumentURL NVARCHAR(1000),
    MissionStatement NVARCHAR(MAX),
    Status NVARCHAR(50) NOT NULL DEFAULT 'Active',
    IsPublic BIT NOT NULL DEFAULT 1,     -- Visibility control
    FormationDate DATE,
    DissolutionDate DATE,
    CONSTRAINT PK_Committee PRIMARY KEY (ID),
    CONSTRAINT FK_Committee_Type FOREIGN KEY (CommitteeTypeID) REFERENCES ${flyway:defaultSchema}.CommitteeType(ID),
    CONSTRAINT FK_Committee_Parent FOREIGN KEY (ParentCommitteeID) REFERENCES ${flyway:defaultSchema}.Committee(ID),
    CONSTRAINT CK_Committee_Status CHECK (Status IN ('Active', 'Inactive', 'Pending', 'Dissolved'))
);

-- Committee Terms (annual or custom periods)
CREATE TABLE ${flyway:defaultSchema}.CommitteeTerm (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CommitteeID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(100) NOT NULL,         -- e.g., "2025-2026"
    StartDate DATE NOT NULL,
    EndDate DATE,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Active',
    CONSTRAINT PK_CommitteeTerm PRIMARY KEY (ID),
    CONSTRAINT FK_CommitteeTerm_Committee FOREIGN KEY (CommitteeID) REFERENCES ${flyway:defaultSchema}.Committee(ID),
    CONSTRAINT CK_CommitteeTerm_Status CHECK (Status IN ('Active', 'Upcoming', 'Completed'))
);
```

#### 2.3.2 Membership & Roles Entities

```sql
-- Role definitions (Chair, Vice Chair, Secretary, Member, Liaison, etc.)
CREATE TABLE ${flyway:defaultSchema}.CommitteeRole (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(MAX),
    IsOfficer BIT NOT NULL DEFAULT 0,    -- Chair, Vice Chair, Secretary
    IsVotingRole BIT NOT NULL DEFAULT 1,
    DefaultPermissionsJSON NVARCHAR(MAX),
    Sequence INT NOT NULL DEFAULT 100,   -- Display order
    CONSTRAINT PK_CommitteeRole PRIMARY KEY (ID),
    CONSTRAINT UQ_CommitteeRole_Name UNIQUE (Name)
);

-- Committee membership (links to MJ User entity)
CREATE TABLE ${flyway:defaultSchema}.CommitteeMembership (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CommitteeID UNIQUEIDENTIFIER NOT NULL,
    UserID UNIQUEIDENTIFIER NOT NULL,    -- Links to MJ User entity
    RoleID UNIQUEIDENTIFIER NOT NULL,
    TermID UNIQUEIDENTIFIER,             -- Optional: specific term
    StartDate DATE NOT NULL,
    EndDate DATE,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Active',
    EndReason NVARCHAR(100),             -- Term ended, Resigned, Removed, etc.
    Notes NVARCHAR(MAX),
    CONSTRAINT PK_CommitteeMembership PRIMARY KEY (ID),
    CONSTRAINT FK_CommitteeMembership_Committee FOREIGN KEY (CommitteeID) REFERENCES ${flyway:defaultSchema}.Committee(ID),
    CONSTRAINT FK_CommitteeMembership_User FOREIGN KEY (UserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT FK_CommitteeMembership_Role FOREIGN KEY (RoleID) REFERENCES ${flyway:defaultSchema}.CommitteeRole(ID),
    CONSTRAINT FK_CommitteeMembership_Term FOREIGN KEY (TermID) REFERENCES ${flyway:defaultSchema}.CommitteeTerm(ID),
    CONSTRAINT CK_CommitteeMembership_Status CHECK (Status IN ('Active', 'Pending', 'Ended', 'Suspended'))
);
```

#### 2.3.3 Meeting Entities

```sql
-- Meeting records
CREATE TABLE ${flyway:defaultSchema}.CommitteeMeeting (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CommitteeID UNIQUEIDENTIFIER NOT NULL,
    Title NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX),
    StartDateTime DATETIMEOFFSET NOT NULL,
    EndDateTime DATETIMEOFFSET,
    TimeZone NVARCHAR(50) NOT NULL DEFAULT 'America/New_York',
    LocationType NVARCHAR(50) NOT NULL DEFAULT 'Virtual',
    LocationText NVARCHAR(500),          -- Physical address or room
    VideoProvider NVARCHAR(50),          -- Zoom, Teams, Meet
    VideoMeetingID NVARCHAR(255),        -- External meeting ID
    VideoJoinURL NVARCHAR(1000),
    VideoRecordingURL NVARCHAR(1000),
    TranscriptURL NVARCHAR(1000),
    Status NVARCHAR(50) NOT NULL DEFAULT 'Scheduled',
    CalendarEventID NVARCHAR(255),       -- External calendar reference
    CONSTRAINT PK_CommitteeMeeting PRIMARY KEY (ID),
    CONSTRAINT FK_CommitteeMeeting_Committee FOREIGN KEY (CommitteeID) REFERENCES ${flyway:defaultSchema}.Committee(ID),
    CONSTRAINT CK_CommitteeMeeting_Status CHECK (Status IN ('Draft', 'Scheduled', 'InProgress', 'Completed', 'Cancelled', 'Postponed')),
    CONSTRAINT CK_CommitteeMeeting_LocationType CHECK (LocationType IN ('Virtual', 'InPerson', 'Hybrid'))
);

-- Meeting agenda items
CREATE TABLE ${flyway:defaultSchema}.CommitteeMeetingAgendaItem (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    MeetingID UNIQUEIDENTIFIER NOT NULL,
    ParentAgendaItemID UNIQUEIDENTIFIER, -- Sub-items
    Sequence INT NOT NULL,
    Title NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX),
    PresenterUserID UNIQUEIDENTIFIER,    -- Who presents this item
    DurationMinutes INT,
    ItemType NVARCHAR(50) NOT NULL DEFAULT 'Discussion',
    RelatedDocumentURL NVARCHAR(1000),
    Status NVARCHAR(50) NOT NULL DEFAULT 'Pending',
    Notes NVARCHAR(MAX),                 -- Discussion notes/outcome
    CONSTRAINT PK_CommitteeMeetingAgendaItem PRIMARY KEY (ID),
    CONSTRAINT FK_CommitteeMeetingAgendaItem_Meeting FOREIGN KEY (MeetingID) REFERENCES ${flyway:defaultSchema}.CommitteeMeeting(ID),
    CONSTRAINT FK_CommitteeMeetingAgendaItem_Parent FOREIGN KEY (ParentAgendaItemID) REFERENCES ${flyway:defaultSchema}.CommitteeMeetingAgendaItem(ID),
    CONSTRAINT FK_CommitteeMeetingAgendaItem_Presenter FOREIGN KEY (PresenterUserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_CommitteeMeetingAgendaItem_Type CHECK (ItemType IN ('Information', 'Discussion', 'Action', 'Vote', 'Report', 'Other')),
    CONSTRAINT CK_CommitteeMeetingAgendaItem_Status CHECK (Status IN ('Pending', 'Discussed', 'Tabled', 'Completed', 'Skipped'))
);

-- Meeting attendance
CREATE TABLE ${flyway:defaultSchema}.CommitteeMeetingAttendance (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    MeetingID UNIQUEIDENTIFIER NOT NULL,
    UserID UNIQUEIDENTIFIER NOT NULL,
    AttendanceStatus NVARCHAR(50) NOT NULL DEFAULT 'Expected',
    JoinedAt DATETIMEOFFSET,
    LeftAt DATETIMEOFFSET,
    Notes NVARCHAR(500),
    CONSTRAINT PK_CommitteeMeetingAttendance PRIMARY KEY (ID),
    CONSTRAINT FK_CommitteeMeetingAttendance_Meeting FOREIGN KEY (MeetingID) REFERENCES ${flyway:defaultSchema}.CommitteeMeeting(ID),
    CONSTRAINT FK_CommitteeMeetingAttendance_User FOREIGN KEY (UserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_CommitteeMeetingAttendance_Status CHECK (AttendanceStatus IN ('Expected', 'Present', 'Absent', 'Excused', 'Partial')),
    CONSTRAINT UQ_CommitteeMeetingAttendance UNIQUE (MeetingID, UserID)
);
```

#### 2.3.4 Action Items & Artifacts

```sql
-- Action items (tasks assigned from meetings or committees)
CREATE TABLE ${flyway:defaultSchema}.CommitteeActionItem (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CommitteeID UNIQUEIDENTIFIER NOT NULL,
    MeetingID UNIQUEIDENTIFIER,          -- Source meeting (optional)
    AgendaItemID UNIQUEIDENTIFIER,       -- Source agenda item (optional)
    Title NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX),
    AssignedToUserID UNIQUEIDENTIFIER NOT NULL,
    AssignedByUserID UNIQUEIDENTIFIER,
    DueDate DATE,
    Priority NVARCHAR(20) NOT NULL DEFAULT 'Medium',
    Status NVARCHAR(50) NOT NULL DEFAULT 'Open',
    CompletedAt DATETIMEOFFSET,
    CompletionNotes NVARCHAR(MAX),
    CONSTRAINT PK_CommitteeActionItem PRIMARY KEY (ID),
    CONSTRAINT FK_CommitteeActionItem_Committee FOREIGN KEY (CommitteeID) REFERENCES ${flyway:defaultSchema}.Committee(ID),
    CONSTRAINT FK_CommitteeActionItem_Meeting FOREIGN KEY (MeetingID) REFERENCES ${flyway:defaultSchema}.CommitteeMeeting(ID),
    CONSTRAINT FK_CommitteeActionItem_AgendaItem FOREIGN KEY (AgendaItemID) REFERENCES ${flyway:defaultSchema}.CommitteeMeetingAgendaItem(ID),
    CONSTRAINT FK_CommitteeActionItem_AssignedTo FOREIGN KEY (AssignedToUserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT FK_CommitteeActionItem_AssignedBy FOREIGN KEY (AssignedByUserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_CommitteeActionItem_Priority CHECK (Priority IN ('Low', 'Medium', 'High', 'Critical')),
    CONSTRAINT CK_CommitteeActionItem_Status CHECK (Status IN ('Open', 'InProgress', 'Blocked', 'Completed', 'Cancelled'))
);

-- External artifact links (documents, files, etc.)
CREATE TABLE ${flyway:defaultSchema}.CommitteeArtifact (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CommitteeID UNIQUEIDENTIFIER,
    MeetingID UNIQUEIDENTIFIER,
    AgendaItemID UNIQUEIDENTIFIER,
    ActionItemID UNIQUEIDENTIFIER,
    Title NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX),
    Provider NVARCHAR(50) NOT NULL,      -- GoogleDrive, SharePoint, Box, URL
    ExternalID NVARCHAR(500),            -- Provider-specific ID
    URL NVARCHAR(2000) NOT NULL,
    MimeType NVARCHAR(100),
    FileSize BIGINT,
    UploadedByUserID UNIQUEIDENTIFIER,
    ArtifactType NVARCHAR(50) NOT NULL DEFAULT 'Document',
    CONSTRAINT PK_CommitteeArtifact PRIMARY KEY (ID),
    CONSTRAINT FK_CommitteeArtifact_Committee FOREIGN KEY (CommitteeID) REFERENCES ${flyway:defaultSchema}.Committee(ID),
    CONSTRAINT FK_CommitteeArtifact_Meeting FOREIGN KEY (MeetingID) REFERENCES ${flyway:defaultSchema}.CommitteeMeeting(ID),
    CONSTRAINT FK_CommitteeArtifact_AgendaItem FOREIGN KEY (AgendaItemID) REFERENCES ${flyway:defaultSchema}.CommitteeMeetingAgendaItem(ID),
    CONSTRAINT FK_CommitteeArtifact_ActionItem FOREIGN KEY (ActionItemID) REFERENCES ${flyway:defaultSchema}.CommitteeActionItem(ID),
    CONSTRAINT FK_CommitteeArtifact_UploadedBy FOREIGN KEY (UploadedByUserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_CommitteeArtifact_Provider CHECK (Provider IN ('GoogleDrive', 'SharePoint', 'Box', 'OneDrive', 'Dropbox', 'URL')),
    CONSTRAINT CK_CommitteeArtifact_Type CHECK (ArtifactType IN ('Document', 'Spreadsheet', 'Presentation', 'Minutes', 'Agenda', 'Recording', 'Transcript', 'Image', 'Other'))
);
```

### 2.4 Premium Entity Design (Closed Source)

#### 2.4.1 Standards Workflow Entities

```sql
-- Workflow stage definitions (configurable per committee type)
CREATE TABLE ${flyway:defaultSchema}.CommitteeWorkflowStage (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CommitteeTypeID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(MAX),
    Sequence INT NOT NULL,
    RequiresApproval BIT NOT NULL DEFAULT 0,
    RequiresVote BIT NOT NULL DEFAULT 0,
    MinApprovers INT,
    VoteThresholdPercent DECIMAL(5,2),
    AutoAdvanceOnApproval BIT NOT NULL DEFAULT 0,
    CONSTRAINT PK_CommitteeWorkflowStage PRIMARY KEY (ID),
    CONSTRAINT FK_CommitteeWorkflowStage_Type FOREIGN KEY (CommitteeTypeID) REFERENCES ${flyway:defaultSchema}.CommitteeType(ID)
);

-- Standards project container
CREATE TABLE ${flyway:defaultSchema}.StandardsProject (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CommitteeID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX),
    ProjectNumber NVARCHAR(50),          -- e.g., "ISO-12345"
    Scope NVARCHAR(MAX),
    TargetCompletionDate DATE,
    CurrentStageID UNIQUEIDENTIFIER,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Active',
    CONSTRAINT PK_StandardsProject PRIMARY KEY (ID),
    CONSTRAINT FK_StandardsProject_Committee FOREIGN KEY (CommitteeID) REFERENCES ${flyway:defaultSchema}.Committee(ID),
    CONSTRAINT FK_StandardsProject_Stage FOREIGN KEY (CurrentStageID) REFERENCES ${flyway:defaultSchema}.CommitteeWorkflowStage(ID)
);

-- Standards draft versions
CREATE TABLE ${flyway:defaultSchema}.StandardsDraft (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    ProjectID UNIQUEIDENTIFIER NOT NULL,
    Version NVARCHAR(50) NOT NULL,       -- e.g., "1.0", "2.0-draft"
    Title NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX),
    DocumentURL NVARCHAR(1000),
    StageID UNIQUEIDENTIFIER,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Draft',
    SubmittedAt DATETIMEOFFSET,
    ApprovedAt DATETIMEOFFSET,
    CONSTRAINT PK_StandardsDraft PRIMARY KEY (ID),
    CONSTRAINT FK_StandardsDraft_Project FOREIGN KEY (ProjectID) REFERENCES ${flyway:defaultSchema}.StandardsProject(ID),
    CONSTRAINT FK_StandardsDraft_Stage FOREIGN KEY (StageID) REFERENCES ${flyway:defaultSchema}.CommitteeWorkflowStage(ID)
);

-- Ballot/voting records
CREATE TABLE ${flyway:defaultSchema}.CommitteeBallot (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CommitteeID UNIQUEIDENTIFIER NOT NULL,
    DraftID UNIQUEIDENTIFIER,
    AgendaItemID UNIQUEIDENTIFIER,
    Title NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX),
    BallotType NVARCHAR(50) NOT NULL,    -- Motion, StandardsApproval, Election
    StartDateTime DATETIMEOFFSET NOT NULL,
    EndDateTime DATETIMEOFFSET NOT NULL,
    QuorumRequired INT,
    ThresholdPercent DECIMAL(5,2),
    Status NVARCHAR(50) NOT NULL DEFAULT 'Open',
    Result NVARCHAR(50),
    CONSTRAINT PK_CommitteeBallot PRIMARY KEY (ID),
    CONSTRAINT FK_CommitteeBallot_Committee FOREIGN KEY (CommitteeID) REFERENCES ${flyway:defaultSchema}.Committee(ID),
    CONSTRAINT FK_CommitteeBallot_Draft FOREIGN KEY (DraftID) REFERENCES ${flyway:defaultSchema}.StandardsDraft(ID),
    CONSTRAINT FK_CommitteeBallot_AgendaItem FOREIGN KEY (AgendaItemID) REFERENCES ${flyway:defaultSchema}.CommitteeMeetingAgendaItem(ID),
    CONSTRAINT CK_CommitteeBallot_Type CHECK (BallotType IN ('Motion', 'StandardsApproval', 'Election', 'PolicyChange', 'Other')),
    CONSTRAINT CK_CommitteeBallot_Status CHECK (Status IN ('Draft', 'Open', 'Closed', 'Cancelled')),
    CONSTRAINT CK_CommitteeBallot_Result CHECK (Result IN ('Passed', 'Failed', 'NoQuorum', 'Cancelled', 'Tie'))
);

-- Individual votes
CREATE TABLE ${flyway:defaultSchema}.CommitteeBallotVote (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    BallotID UNIQUEIDENTIFIER NOT NULL,
    UserID UNIQUEIDENTIFIER NOT NULL,
    Vote NVARCHAR(50) NOT NULL,
    Comments NVARCHAR(MAX),
    VotedAt DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT PK_CommitteeBallotVote PRIMARY KEY (ID),
    CONSTRAINT FK_CommitteeBallotVote_Ballot FOREIGN KEY (BallotID) REFERENCES ${flyway:defaultSchema}.CommitteeBallot(ID),
    CONSTRAINT FK_CommitteeBallotVote_User FOREIGN KEY (UserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_CommitteeBallotVote_Vote CHECK (Vote IN ('Yes', 'No', 'Abstain', 'Present')),
    CONSTRAINT UQ_CommitteeBallotVote UNIQUE (BallotID, UserID)
);
```

### 2.5 Package Structure

Following MJ patterns, the Committees app should be organized as:

```
packages/
├── Committees/
│   ├── Core/                           # @memberjunction/committees-core
│   │   ├── src/
│   │   │   ├── entities/               # Entity subclass extensions
│   │   │   ├── engines/                # CommitteeEngine, MeetingEngine
│   │   │   ├── interfaces/             # Type definitions
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── Server/                         # @memberjunction/committees-server
│   │   ├── src/
│   │   │   ├── resolvers/              # GraphQL resolvers
│   │   │   ├── actions/                # Server-side actions
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── Standards/                      # @memberjunction/committees-standards (PREMIUM)
│   │   ├── src/
│   │   │   ├── workflow/               # Workflow engine
│   │   │   ├── balloting/              # Ballot management
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── AI/                             # @memberjunction/committees-ai (PREMIUM)
│   │   ├── src/
│   │   │   ├── transcription/          # Meeting transcript processing
│   │   │   ├── summarization/          # AI-generated minutes
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── Integrations/                   # @memberjunction/committees-integrations
│       ├── Zoom/                       # @memberjunction/committees-zoom (PREMIUM)
│       ├── Teams/                      # @memberjunction/committees-teams (PREMIUM)
│       └── Calendar/                   # @memberjunction/committees-calendar (PREMIUM)
│
└── Angular/
    └── Explorer/
        └── committees/                  # @memberjunction/ng-committees
            ├── src/
            │   ├── lib/
            │   │   ├── committee-list/
            │   │   ├── committee-detail/
            │   │   ├── meeting-scheduler/
            │   │   ├── roster-manager/
            │   │   ├── action-items/
            │   │   ├── module.ts
            │   │   └── index.ts
            │   └── public-api.ts
            └── package.json
```

### 2.6 Application Metadata Definition

```json
// /metadata/applications/.committees-application.json
{
  "fields": {
    "Name": "Committees",
    "Description": "Committee management, meetings, and governance",
    "Icon": "fa-solid fa-users-rectangle",
    "DefaultForNewUser": false,
    "Color": "#1976d2",
    "DefaultSequence": 500,
    "Status": "Active",
    "NavigationStyle": "Both",
    "DefaultNavItems": [
      {
        "Label": "Overview",
        "Icon": "fa-solid fa-gauge-high",
        "ResourceType": "Custom",
        "DriverClass": "CommitteeOverviewResource",
        "isDefault": true
      },
      {
        "Label": "My Committees",
        "Icon": "fa-solid fa-user-group",
        "ResourceType": "Custom",
        "DriverClass": "MyCommitteesResource",
        "isDefault": false
      },
      {
        "Label": "Meetings",
        "Icon": "fa-solid fa-calendar-days",
        "ResourceType": "Custom",
        "DriverClass": "CommitteeMeetingsResource",
        "isDefault": false
      },
      {
        "Label": "Action Items",
        "Icon": "fa-solid fa-list-check",
        "ResourceType": "Custom",
        "DriverClass": "CommitteeActionItemsResource",
        "isDefault": false
      },
      {
        "Label": "All Committees",
        "Icon": "fa-solid fa-sitemap",
        "ResourceType": "Custom",
        "DriverClass": "AllCommitteesResource",
        "isDefault": false
      }
    ]
  },
  "relatedEntities": {
    "Application Entities": [
      {
        "fields": {
          "ApplicationID": "@parent:ID",
          "EntityID": "@lookup:Entities.Name=MJ: Committees",
          "Sequence": 1,
          "DefaultForNewUser": true
        }
      },
      {
        "fields": {
          "ApplicationID": "@parent:ID",
          "EntityID": "@lookup:Entities.Name=MJ: Committee Meetings",
          "Sequence": 2,
          "DefaultForNewUser": true
        }
      },
      {
        "fields": {
          "ApplicationID": "@parent:ID",
          "EntityID": "@lookup:Entities.Name=MJ: Committee Memberships",
          "Sequence": 3,
          "DefaultForNewUser": true
        }
      },
      {
        "fields": {
          "ApplicationID": "@parent:ID",
          "EntityID": "@lookup:Entities.Name=MJ: Committee Action Items",
          "Sequence": 4,
          "DefaultForNewUser": true
        }
      }
    ]
  }
}
```

### 2.7 Premium Module Metadata (Standards Pack)

```json
// /metadata/applications/.committees-standards-application.json
{
  "fields": {
    "Name": "Standards Workflow",
    "Description": "Standards development workflow and balloting (Committees Pro)",
    "Icon": "fa-solid fa-file-contract",
    "DefaultForNewUser": false,
    "Color": "#7b1fa2",
    "DefaultSequence": 501,
    "Status": "Active",
    "NavigationStyle": "Nav Bar",
    "DefaultNavItems": [
      {
        "Label": "Projects",
        "Icon": "fa-solid fa-diagram-project",
        "ResourceType": "Custom",
        "DriverClass": "StandardsProjectsResource",
        "isDefault": true
      },
      {
        "Label": "Drafts",
        "Icon": "fa-solid fa-file-pen",
        "ResourceType": "Custom",
        "DriverClass": "StandardsDraftsResource",
        "isDefault": false
      },
      {
        "Label": "Ballots",
        "Icon": "fa-solid fa-check-to-slot",
        "ResourceType": "Custom",
        "DriverClass": "BallotingResource",
        "isDefault": false
      },
      {
        "Label": "Workflow",
        "Icon": "fa-solid fa-route",
        "ResourceType": "Custom",
        "DriverClass": "WorkflowManagerResource",
        "isDefault": false
      }
    ]
  },
  "relatedEntities": {
    "Application Entities": []
  }
}
```

---

## Part 3: Open-Core Licensing Model

### 3.1 Feature Gating Architecture

MJ should use a **hybrid gating model**:

1. **Package-Based Gating**: Premium packages are separate NPM packages
   - If not installed, features don't exist
   - Clean separation at the code level

2. **Entitlement-Based Gating**: For granular feature control
   - Premium packages check subscription entitlements
   - UI hides/disables features without entitlement
   - API returns authorization errors

### 3.2 Subscription Entity (Customer Instance)

```sql
-- Stored on each customer MJ instance
CREATE TABLE ${flyway:defaultSchema}.Subscription (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CentralSubscriptionID UNIQUEIDENTIFIER NOT NULL,  -- Reference to MJ Central
    AppName NVARCHAR(100) NOT NULL,
    Edition NVARCHAR(50) NOT NULL,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Active',
    StartDate DATE NOT NULL,
    ExpirationDate DATE,
    EntitlementsJSON NVARCHAR(MAX),      -- Feature flags
    LastSyncedAt DATETIMEOFFSET,
    CONSTRAINT PK_Subscription PRIMARY KEY (ID)
);
```

### 3.3 Entitlement Checking Pattern

```typescript
// packages/Committees/Core/src/engines/FeatureGate.ts
import { Metadata, RunView } from '@memberjunction/core';
import { SubscriptionEntity } from '@memberjunction/core-entities';

export class CommitteeFeatureGate {
    private static _subscriptions: Map<string, SubscriptionEntity> = new Map();

    static async CheckFeature(featureName: string): Promise<boolean> {
        const subscription = await this.GetSubscription('Committees');
        if (!subscription) return false;

        const entitlements = JSON.parse(subscription.EntitlementsJSON || '{}');
        return entitlements[featureName] === true;
    }

    static async RequiresProEdition(): Promise<boolean> {
        const subscription = await this.GetSubscription('Committees');
        return subscription?.Edition === 'Pro' || subscription?.Edition === 'Enterprise';
    }

    private static async GetSubscription(appName: string): Promise<SubscriptionEntity | null> {
        if (this._subscriptions.has(appName)) {
            return this._subscriptions.get(appName)!;
        }

        const rv = new RunView();
        const result = await rv.RunView<SubscriptionEntity>({
            EntityName: 'MJ: Subscriptions',
            ExtraFilter: `AppName='${appName}' AND Status='Active'`,
            ResultType: 'entity_object'
        });

        if (result.Success && result.Results.length > 0) {
            this._subscriptions.set(appName, result.Results[0]);
            return result.Results[0];
        }
        return null;
    }
}
```

### 3.4 Edition Feature Matrix

| Feature | Core (Free) | Pro | Enterprise |
|---------|-------------|-----|------------|
| Committee CRUD | ✅ | ✅ | ✅ |
| Membership Management | ✅ | ✅ | ✅ |
| Meeting Scheduling | ✅ | ✅ | ✅ |
| Agenda Management | ✅ | ✅ | ✅ |
| Action Items | ✅ | ✅ | ✅ |
| Document Links | ✅ | ✅ | ✅ |
| Basic Attendance | ✅ | ✅ | ✅ |
| **Standards Workflow** | ❌ | ✅ | ✅ |
| **Balloting/Voting** | ❌ | ✅ | ✅ |
| **Automated Meeting Links** | ❌ | ✅ | ✅ |
| **Calendar Integration** | ❌ | ✅ | ✅ |
| **AI Minutes Generation** | ❌ | ❌ | ✅ |
| **Transcript Processing** | ❌ | ❌ | ✅ |
| **Governance Analytics** | ❌ | ❌ | ✅ |
| **Compliance Exports** | ❌ | ❌ | ✅ |
| **Audit Trail** | Basic | Full | Full + Export |

---

## Part 4: Integration Architecture

### 4.1 External System Integration Strategy

The Committees app uses a **link-first** approach:

```
┌─────────────────────────────────────────────────────────────┐
│                    COMMITTEES APP                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              CommitteeArtifact Entity                │   │
│  │  - Provider: 'GoogleDrive' | 'SharePoint' | 'Box'   │   │
│  │  - ExternalID: Provider-specific document ID         │   │
│  │  - URL: Direct link to document                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                  │
│                     (stores links)                           │
└───────────────────────────┼─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ Google Drive │   │  SharePoint  │   │     Box      │
│  (external)  │   │  (external)  │   │  (external)  │
└──────────────┘   └──────────────┘   └──────────────┘
```

### 4.2 Video Meeting Integration (Premium)

```typescript
// packages/Committees/Integrations/Zoom/src/ZoomIntegration.ts
import { BaseVideoIntegration, MeetingDetails } from '@memberjunction/committees-core';
import { CredentialEngine } from '@memberjunction/credentials';

export class ZoomIntegration extends BaseVideoIntegration {
    async CreateMeeting(details: MeetingDetails): Promise<string> {
        const credentials = await CredentialEngine.GetCredential('Zoom');

        // Call Zoom API to create meeting
        const response = await this.zoomClient.meetings.create({
            topic: details.title,
            start_time: details.startDateTime,
            duration: details.durationMinutes,
            // ... other settings
        });

        return response.join_url;
    }

    async GetRecordingURL(meetingId: string): Promise<string | null> {
        // Fetch recording after meeting ends
    }

    async GetTranscript(meetingId: string): Promise<string | null> {
        // Fetch transcript if available
    }
}
```

### 4.3 AI Processing Pipeline (Enterprise)

```typescript
// packages/Committees/AI/src/MeetingAIProcessor.ts
import { AIPromptRunner, AIPromptParams } from '@memberjunction/ai-prompts';
import { CommitteeMeetingEntity } from '@memberjunction/core-entities';

export class MeetingAIProcessor {
    private promptRunner: AIPromptRunner;

    async ProcessTranscript(meeting: CommitteeMeetingEntity): Promise<ProcessedMeeting> {
        const transcript = await this.fetchTranscript(meeting.TranscriptURL);

        // Generate meeting minutes
        const minutesPrompt = new AIPromptParams();
        minutesPrompt.prompt = await this.getPrompt('Generate Meeting Minutes');
        minutesPrompt.data = {
            transcript,
            agendaItems: await this.getAgendaItems(meeting.ID),
            attendees: await this.getAttendees(meeting.ID)
        };

        const minutes = await this.promptRunner.ExecutePrompt(minutesPrompt);

        // Extract action items
        const actionItemsPrompt = new AIPromptParams();
        actionItemsPrompt.prompt = await this.getPrompt('Extract Action Items');
        actionItemsPrompt.data = { transcript, minutes: minutes.result };

        const actionItems = await this.promptRunner.ExecutePrompt(actionItemsPrompt);

        return {
            minutes: minutes.result,
            actionItems: JSON.parse(actionItems.result),
            summary: await this.generateSummary(transcript)
        };
    }
}
```

---

## Part 5: Implementation Roadmap

### Phase 1: Foundation (MVP)

**Goal**: Committees Core with basic functionality

**Deliverables**:
1. Database migration with core entities
2. `@memberjunction/committees-core` package
3. `@memberjunction/ng-committees` Angular components
4. Application metadata for MJ Explorer
5. Basic CRUD for committees, memberships, meetings
6. Document linking (URL-based)

**Entities**:
- MJ: Committee Types
- MJ: Committees
- MJ: Committee Terms
- MJ: Committee Roles
- MJ: Committee Memberships
- MJ: Committee Meetings
- MJ: Committee Meeting Agenda Items
- MJ: Committee Meeting Attendance
- MJ: Committee Action Items
- MJ: Committee Artifacts

### Phase 2: Enhanced Core (V1)

**Goal**: Production-ready core with polish

**Deliverables**:
1. Committee workspace UI (dashboard per committee)
2. Meeting templates (agenda templates, minutes templates)
3. Role-based permissions at committee level
4. Basic reporting dashboards
5. Committee hierarchy visualization
6. Email notifications for meetings/action items

### Phase 3: Premium Modules (V2)

**Goal**: Standards workflow and integrations

**Deliverables**:
1. `@memberjunction/committees-standards` package
2. Workflow stage engine
3. Balloting/voting system
4. `@memberjunction/committees-zoom` integration
5. `@memberjunction/committees-teams` integration
6. Calendar integration (Google/Outlook)
7. Subscription/entitlement checking

### Phase 4: Enterprise AI (V3)

**Goal**: AI-powered automation

**Deliverables**:
1. `@memberjunction/committees-ai` package
2. Transcript import from Zoom/Teams
3. AI-generated meeting minutes
4. AI-extracted action items
5. Decision log generation
6. Governance analytics dashboard
7. Compliance export bundles

### Phase 5: MJ Central Integration

**Goal**: Full App Store experience

**Deliverables**:
1. App Catalog entities on MJ Central
2. Subscription management
3. One-click installation from MJ Central
4. Automatic updates/migrations
5. Usage analytics

---

## Part 6: Technical Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Schema** | Use `__mj` schema | Matches MJ pattern; simplifies CodeGen |
| **Entity Prefix** | `MJ: Committee*` | Follows v3 naming convention |
| **Package Split** | Core/Standards/AI/Integrations | Clean open-core separation |
| **Licensing** | Package + Entitlement hybrid | Flexibility + clean separation |
| **Document Storage** | Link-first (no file storage) | Don't compete with Google/SharePoint |
| **Video Integration** | API integration (no embedding) | Leverage existing tools |
| **AI Processing** | Use existing MJ AI Prompts | Consistent with platform |
| **Permissions** | Extend MJ ResourcePermissions | Don't reinvent permissions |

---

## Appendix A: Entity Naming Reference

| Entity Name | Base Table | Description |
|-------------|------------|-------------|
| MJ: Committee Types | CommitteeType | Board, Standing, Ad Hoc, Workgroup |
| MJ: Committees | Committee | Core committee records |
| MJ: Committee Terms | CommitteeTerm | Annual/custom term periods |
| MJ: Committee Roles | CommitteeRole | Chair, Vice Chair, Member, etc. |
| MJ: Committee Memberships | CommitteeMembership | User-committee assignments |
| MJ: Committee Meetings | CommitteeMeeting | Meeting records |
| MJ: Committee Meeting Agenda Items | CommitteeMeetingAgendaItem | Structured agendas |
| MJ: Committee Meeting Attendance | CommitteeMeetingAttendance | Who attended |
| MJ: Committee Action Items | CommitteeActionItem | Tasks and assignments |
| MJ: Committee Artifacts | CommitteeArtifact | Document/file links |
| MJ: Standards Projects | StandardsProject | (Premium) Standards containers |
| MJ: Standards Drafts | StandardsDraft | (Premium) Draft versions |
| MJ: Committee Workflow Stages | CommitteeWorkflowStage | (Premium) Stage definitions |
| MJ: Committee Ballots | CommitteeBallot | (Premium) Voting records |
| MJ: Committee Ballot Votes | CommitteeBallotVote | (Premium) Individual votes |

---

## Appendix B: Migration File Naming

Following MJ conventions:
```
migrations/v3/
├── V202601220000__v3.x_Committee_Core_Entities.sql
├── V202601220001__v3.x_Committee_Meeting_Entities.sql
├── V202601220002__v3.x_Committee_Seed_Data.sql
├── V202601230000__v3.x_Committee_Premium_Standards_Entities.sql  (separate, premium)
└── V202601230001__v3.x_Committee_Premium_Ballot_Entities.sql     (separate, premium)
```

---

## Next Steps

1. **Review this design** with stakeholders
2. **Finalize entity ID range** allocation with MJ Core team
3. **Create Phase 1 migration** file
4. **Scaffold package structure**
5. **Build MVP Angular components**
6. **Test with sample data**
7. **Prepare for MJ Central integration**

---

*Document created for Blue Cypress / MemberJunction architecture planning.*
