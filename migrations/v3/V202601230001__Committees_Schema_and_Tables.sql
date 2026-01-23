CREATE SCHEMA Committees;
GO

-- Committee Types: Board, Standing, Ad Hoc, Workgroup, Standards WG
CREATE TABLE Committees.Type (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(MAX),
    IsStandards BIT NOT NULL DEFAULT 0,
    DefaultTermMonths INT,
    IconClass NVARCHAR(100),
    CONSTRAINT PK_Type PRIMARY KEY (ID),
    CONSTRAINT UQ_Type_Name UNIQUE (Name)
);

-- Core Committee entity
CREATE TABLE Committees.Committee (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX),
    TypeID UNIQUEIDENTIFIER NOT NULL,
    ParentCommitteeID UNIQUEIDENTIFIER,
    OrganizationID UNIQUEIDENTIFIER,
    CharterDocumentURL NVARCHAR(1000),
    MissionStatement NVARCHAR(MAX),
    Status NVARCHAR(50) NOT NULL DEFAULT 'Active',
    IsPublic BIT NOT NULL DEFAULT 1,
    FormationDate DATE,
    DissolutionDate DATE,
    CONSTRAINT PK_Committee PRIMARY KEY (ID),
    CONSTRAINT FK_Committee_Type FOREIGN KEY (TypeID) REFERENCES Committees.Type(ID),
    CONSTRAINT FK_Committee_Parent FOREIGN KEY (ParentCommitteeID) REFERENCES Committees.Committee(ID),
    CONSTRAINT CK_Committee_Status CHECK (Status IN ('Active', 'Inactive', 'Pending', 'Dissolved'))
);

-- Committee Terms (annual or custom periods)
CREATE TABLE Committees.Term (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CommitteeID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(100) NOT NULL,
    StartDate DATE NOT NULL,
    EndDate DATE,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Active',
    CONSTRAINT PK_Term PRIMARY KEY (ID),
    CONSTRAINT FK_Term_Committee FOREIGN KEY (CommitteeID) REFERENCES Committees.Committee(ID),
    CONSTRAINT CK_Term_Status CHECK (Status IN ('Active', 'Upcoming', 'Completed'))
);

-- Role definitions (Chair, Vice Chair, Secretary, Member, Liaison, etc.)
CREATE TABLE Committees.Role (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(MAX),
    IsOfficer BIT NOT NULL DEFAULT 0,
    IsVotingRole BIT NOT NULL DEFAULT 1,
    DefaultPermissionsJSON NVARCHAR(MAX),
    Sequence INT NOT NULL DEFAULT 100,
    CONSTRAINT PK_Role PRIMARY KEY (ID),
    CONSTRAINT UQ_Role_Name UNIQUE (Name)
);

-- Committee membership (links to MJ User entity)
CREATE TABLE Committees.Membership (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CommitteeID UNIQUEIDENTIFIER NOT NULL,
    UserID UNIQUEIDENTIFIER NOT NULL,
    RoleID UNIQUEIDENTIFIER NOT NULL,
    TermID UNIQUEIDENTIFIER,
    StartDate DATE NOT NULL,
    EndDate DATE,
    Status NVARCHAR(50) NOT NULL DEFAULT 'Active',
    EndReason NVARCHAR(100),
    Notes NVARCHAR(MAX),
    CONSTRAINT PK_Membership PRIMARY KEY (ID),
    CONSTRAINT FK_Membership_Committee FOREIGN KEY (CommitteeID) REFERENCES Committees.Committee(ID),
    CONSTRAINT FK_Membership_User FOREIGN KEY (UserID) REFERENCES __mj.[User](ID),
    CONSTRAINT FK_Membership_Role FOREIGN KEY (RoleID) REFERENCES Committees.Role(ID),
    CONSTRAINT FK_Membership_Term FOREIGN KEY (TermID) REFERENCES Committees.Term(ID),
    CONSTRAINT CK_Membership_Status CHECK (Status IN ('Active', 'Pending', 'Ended', 'Suspended'))
);

-- Meeting records
CREATE TABLE Committees.Meeting (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CommitteeID UNIQUEIDENTIFIER NOT NULL,
    Title NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX),
    StartDateTime DATETIMEOFFSET NOT NULL,
    EndDateTime DATETIMEOFFSET,
    TimeZone NVARCHAR(50) NOT NULL DEFAULT 'America/New_York',
    LocationType NVARCHAR(50) NOT NULL DEFAULT 'Virtual',
    LocationText NVARCHAR(500),
    VideoProvider NVARCHAR(50),
    VideoMeetingID NVARCHAR(255),
    VideoJoinURL NVARCHAR(1000),
    VideoRecordingURL NVARCHAR(1000),
    TranscriptURL NVARCHAR(1000),
    Status NVARCHAR(50) NOT NULL DEFAULT 'Scheduled',
    CalendarEventID NVARCHAR(255),
    CONSTRAINT PK_Meeting PRIMARY KEY (ID),
    CONSTRAINT FK_Meeting_Committee FOREIGN KEY (CommitteeID) REFERENCES Committees.Committee(ID),
    CONSTRAINT CK_Meeting_Status CHECK (Status IN ('Draft', 'Scheduled', 'InProgress', 'Completed', 'Cancelled', 'Postponed')),
    CONSTRAINT CK_Meeting_LocationType CHECK (LocationType IN ('Virtual', 'InPerson', 'Hybrid'))
);

-- Meeting agenda items
CREATE TABLE Committees.AgendaItem (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    MeetingID UNIQUEIDENTIFIER NOT NULL,
    ParentAgendaItemID UNIQUEIDENTIFIER,
    Sequence INT NOT NULL,
    Title NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX),
    PresenterUserID UNIQUEIDENTIFIER,
    DurationMinutes INT,
    ItemType NVARCHAR(50) NOT NULL DEFAULT 'Discussion',
    RelatedDocumentURL NVARCHAR(1000),
    Status NVARCHAR(50) NOT NULL DEFAULT 'Pending',
    Notes NVARCHAR(MAX),
    CONSTRAINT PK_AgendaItem PRIMARY KEY (ID),
    CONSTRAINT FK_AgendaItem_Meeting FOREIGN KEY (MeetingID) REFERENCES Committees.Meeting(ID),
    CONSTRAINT FK_AgendaItem_Parent FOREIGN KEY (ParentAgendaItemID) REFERENCES Committees.AgendaItem(ID),
    CONSTRAINT FK_AgendaItem_Presenter FOREIGN KEY (PresenterUserID) REFERENCES __mj.[User](ID),
    CONSTRAINT CK_AgendaItem_Type CHECK (ItemType IN ('Information', 'Discussion', 'Action', 'Vote', 'Report', 'Other')),
    CONSTRAINT CK_AgendaItem_Status CHECK (Status IN ('Pending', 'Discussed', 'Tabled', 'Completed', 'Skipped'))
);

-- Meeting attendance
CREATE TABLE Committees.Attendance (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    MeetingID UNIQUEIDENTIFIER NOT NULL,
    UserID UNIQUEIDENTIFIER NOT NULL,
    AttendanceStatus NVARCHAR(50) NOT NULL DEFAULT 'Expected',
    JoinedAt DATETIMEOFFSET,
    LeftAt DATETIMEOFFSET,
    Notes NVARCHAR(500),
    CONSTRAINT PK_Attendance PRIMARY KEY (ID),
    CONSTRAINT FK_Attendance_Meeting FOREIGN KEY (MeetingID) REFERENCES Committees.Meeting(ID),
    CONSTRAINT FK_Attendance_User FOREIGN KEY (UserID) REFERENCES __mj.[User](ID),
    CONSTRAINT CK_Attendance_Status CHECK (AttendanceStatus IN ('Expected', 'Present', 'Absent', 'Excused', 'Partial')),
    CONSTRAINT UQ_Attendance UNIQUE (MeetingID, UserID)
);

-- Action items (tasks assigned from meetings or committees)
CREATE TABLE Committees.ActionItem (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CommitteeID UNIQUEIDENTIFIER NOT NULL,
    MeetingID UNIQUEIDENTIFIER,
    AgendaItemID UNIQUEIDENTIFIER,
    Title NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX),
    AssignedToUserID UNIQUEIDENTIFIER NOT NULL,
    AssignedByUserID UNIQUEIDENTIFIER,
    DueDate DATE,
    Priority NVARCHAR(20) NOT NULL DEFAULT 'Medium',
    Status NVARCHAR(50) NOT NULL DEFAULT 'Open',
    CompletedAt DATETIMEOFFSET,
    CompletionNotes NVARCHAR(MAX),
    CONSTRAINT PK_ActionItem PRIMARY KEY (ID),
    CONSTRAINT FK_ActionItem_Committee FOREIGN KEY (CommitteeID) REFERENCES Committees.Committee(ID),
    CONSTRAINT FK_ActionItem_Meeting FOREIGN KEY (MeetingID) REFERENCES Committees.Meeting(ID),
    CONSTRAINT FK_ActionItem_AgendaItem FOREIGN KEY (AgendaItemID) REFERENCES Committees.AgendaItem(ID),
    CONSTRAINT FK_ActionItem_AssignedTo FOREIGN KEY (AssignedToUserID) REFERENCES __mj.[User](ID),
    CONSTRAINT FK_ActionItem_AssignedBy FOREIGN KEY (AssignedByUserID) REFERENCES __mj.[User](ID),
    CONSTRAINT CK_ActionItem_Priority CHECK (Priority IN ('Low', 'Medium', 'High', 'Critical')),
    CONSTRAINT CK_ActionItem_Status CHECK (Status IN ('Open', 'InProgress', 'Blocked', 'Completed', 'Cancelled'))
);

-- External artifact links (documents, files, etc.)
CREATE TABLE Committees.Artifact (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CommitteeID UNIQUEIDENTIFIER,
    MeetingID UNIQUEIDENTIFIER,
    AgendaItemID UNIQUEIDENTIFIER,
    ActionItemID UNIQUEIDENTIFIER,
    Title NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX),
    Provider NVARCHAR(50) NOT NULL,
    ExternalID NVARCHAR(500),
    URL NVARCHAR(2000) NOT NULL,
    MimeType NVARCHAR(100),
    FileSize BIGINT,
    UploadedByUserID UNIQUEIDENTIFIER,
    ArtifactType NVARCHAR(50) NOT NULL DEFAULT 'Document',
    CONSTRAINT PK_Artifact PRIMARY KEY (ID),
    CONSTRAINT FK_Artifact_Committee FOREIGN KEY (CommitteeID) REFERENCES Committees.Committee(ID),
    CONSTRAINT FK_Artifact_Meeting FOREIGN KEY (MeetingID) REFERENCES Committees.Meeting(ID),
    CONSTRAINT FK_Artifact_AgendaItem FOREIGN KEY (AgendaItemID) REFERENCES Committees.AgendaItem(ID),
    CONSTRAINT FK_Artifact_ActionItem FOREIGN KEY (ActionItemID) REFERENCES Committees.ActionItem(ID),
    CONSTRAINT FK_Artifact_UploadedBy FOREIGN KEY (UploadedByUserID) REFERENCES __mj.[User](ID),
    CONSTRAINT CK_Artifact_Provider CHECK (Provider IN ('GoogleDrive', 'SharePoint', 'Box', 'OneDrive', 'Dropbox', 'URL')),
    CONSTRAINT CK_Artifact_Type CHECK (ArtifactType IN ('Document', 'Spreadsheet', 'Presentation', 'Minutes', 'Agenda', 'Recording', 'Transcript', 'Image', 'Other'))
);


-- Schema Description
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Committee management system including committee types, memberships, meetings, agendas, and action items',
    @level0type = N'SCHEMA', 
    @level0name = N'Committees';
GO

-- Table: Type
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Defines committee types such as Board, Standing, Ad Hoc, Workgroup, and Standards Working Groups',
    @level0type = N'SCHEMA', @level0name = N'Committees',
    @level1type = N'TABLE', @level1name = N'Type';

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Committee type name (e.g., Board, Standing, Ad Hoc)', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Type', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Detailed description of the committee type', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Type', @level2type = N'COLUMN', @level2name = N'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Indicates if this type is for standards development working groups', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Type', @level2type = N'COLUMN', @level2name = N'IsStandards';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Default term length in months for committees of this type', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Type', @level2type = N'COLUMN', @level2name = N'DefaultTermMonths';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Font Awesome icon class for UI display (e.g., fa-users, fa-gavel)', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Type', @level2type = N'COLUMN', @level2name = N'IconClass';
GO

-- Table: Committee
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Core committee entity containing basic information, hierarchy, and status',
    @level0type = N'SCHEMA', @level0name = N'Committees',
    @level1type = N'TABLE', @level1name = N'Committee';

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Committee name', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Committee', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Committee description and purpose', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Committee', @level2type = N'COLUMN', @level2name = N'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'URL to the committee charter document', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Committee', @level2type = N'COLUMN', @level2name = N'CharterDocumentURL';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Committee mission statement', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Committee', @level2type = N'COLUMN', @level2name = N'MissionStatement';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Current status: Active, Inactive, Pending, or Dissolved', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Committee', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Whether committee information is publicly visible', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Committee', @level2type = N'COLUMN', @level2name = N'IsPublic';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Date the committee was officially formed', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Committee', @level2type = N'COLUMN', @level2name = N'FormationDate';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Date the committee was dissolved or terminated', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Committee', @level2type = N'COLUMN', @level2name = N'DissolutionDate';
GO

-- Table: Term
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Committee terms representing annual or custom time periods for membership tracking',
    @level0type = N'SCHEMA', @level0name = N'Committees',
    @level1type = N'TABLE', @level1name = N'Term';

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Term name (e.g., "2024", "2024-2025", "Q1 2024")', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Term', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Term start date', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Term', @level2type = N'COLUMN', @level2name = N'StartDate';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Term end date (null for ongoing terms)', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Term', @level2type = N'COLUMN', @level2name = N'EndDate';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Term status: Active, Upcoming, or Completed', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Term', @level2type = N'COLUMN', @level2name = N'Status';
GO

-- Table: Role
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Role definitions for committee members (Chair, Vice Chair, Secretary, Member, Liaison, etc.)',
    @level0type = N'SCHEMA', @level0name = N'Committees',
    @level1type = N'TABLE', @level1name = N'Role';

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Role name (e.g., Chair, Vice Chair, Secretary, Member)', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Role', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Description of role responsibilities and expectations', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Role', @level2type = N'COLUMN', @level2name = N'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Indicates if this is an officer position (Chair, Vice Chair, etc.)', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Role', @level2type = N'COLUMN', @level2name = N'IsOfficer';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Whether this role has voting privileges', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Role', @level2type = N'COLUMN', @level2name = N'IsVotingRole';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON object defining default permissions for this role', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Role', @level2type = N'COLUMN', @level2name = N'DefaultPermissionsJSON';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Display order sequence for role listing', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Role', @level2type = N'COLUMN', @level2name = N'Sequence';
GO

-- Table: Membership
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Committee membership records linking users to committees with specific roles and terms',
    @level0type = N'SCHEMA', @level0name = N'Committees',
    @level1type = N'TABLE', @level1name = N'Membership';

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Date the membership began', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Membership', @level2type = N'COLUMN', @level2name = N'StartDate';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Date the membership ended (null for active memberships)', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Membership', @level2type = N'COLUMN', @level2name = N'EndDate';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Membership status: Active, Pending, Ended, or Suspended', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Membership', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Reason for membership ending (e.g., Term Completed, Resigned, Removed)', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Membership', @level2type = N'COLUMN', @level2name = N'EndReason';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Additional notes about the membership', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Membership', @level2type = N'COLUMN', @level2name = N'Notes';
GO

-- Table: Meeting
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Meeting records including scheduling, location, and video conferencing details',
    @level0type = N'SCHEMA', @level0name = N'Committees',
    @level1type = N'TABLE', @level1name = N'Meeting';

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Meeting title', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'Title';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Meeting description and purpose', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Meeting start date and time with timezone offset', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'StartDateTime';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Meeting end date and time with timezone offset', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'EndDateTime';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'IANA timezone identifier (e.g., America/New_York, Europe/London)', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'TimeZone';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Meeting location type: Virtual, InPerson, or Hybrid', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'LocationType';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Physical location address or description', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'LocationText';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Video conferencing provider (e.g., Zoom, Teams, GoogleMeet)', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'VideoProvider';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Video meeting identifier or room number', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'VideoMeetingID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'URL to join the video meeting', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'VideoJoinURL';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'URL to access meeting recording', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'VideoRecordingURL';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'URL to access meeting transcript', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'TranscriptURL';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Meeting status: Draft, Scheduled, InProgress, Completed, Cancelled, or Postponed', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'External calendar system event identifier for synchronization', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Meeting', @level2type = N'COLUMN', @level2name = N'CalendarEventID';
GO

-- Table: AgendaItem
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Meeting agenda items with hierarchical structure and tracking',
    @level0type = N'SCHEMA', @level0name = N'Committees',
    @level1type = N'TABLE', @level1name = N'AgendaItem';

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Display order of agenda item in the meeting', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'AgendaItem', @level2type = N'COLUMN', @level2name = N'Sequence';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Agenda item title', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'AgendaItem', @level2type = N'COLUMN', @level2name = N'Title';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Detailed description of the agenda item', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'AgendaItem', @level2type = N'COLUMN', @level2name = N'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Allocated time in minutes for this agenda item', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'AgendaItem', @level2type = N'COLUMN', @level2name = N'DurationMinutes';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Type of agenda item: Information, Discussion, Action, Vote, Report, or Other', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'AgendaItem', @level2type = N'COLUMN', @level2name = N'ItemType';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'URL to related supporting document', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'AgendaItem', @level2type = N'COLUMN', @level2name = N'RelatedDocumentURL';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Item status: Pending, Discussed, Tabled, Completed, or Skipped', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'AgendaItem', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Discussion notes and outcomes', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'AgendaItem', @level2type = N'COLUMN', @level2name = N'Notes';
GO

-- Table: Attendance
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Meeting attendance tracking for committee members and guests',
    @level0type = N'SCHEMA', @level0name = N'Committees',
    @level1type = N'TABLE', @level1name = N'Attendance';

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Attendance status: Expected, Present, Absent, Excused, or Partial', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Attendance', @level2type = N'COLUMN', @level2name = N'AttendanceStatus';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Timestamp when the attendee joined the meeting', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Attendance', @level2type = N'COLUMN', @level2name = N'JoinedAt';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Timestamp when the attendee left the meeting', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Attendance', @level2type = N'COLUMN', @level2name = N'LeftAt';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Additional notes about attendance (e.g., reason for absence)', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Attendance', @level2type = N'COLUMN', @level2name = N'Notes';
GO

-- Table: ActionItem
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Action items and tasks assigned from meetings or committees',
    @level0type = N'SCHEMA', @level0name = N'Committees',
    @level1type = N'TABLE', @level1name = N'ActionItem';

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Action item title', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'ActionItem', @level2type = N'COLUMN', @level2name = N'Title';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Detailed description of the action item', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'ActionItem', @level2type = N'COLUMN', @level2name = N'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Date by which the action item should be completed', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'ActionItem', @level2type = N'COLUMN', @level2name = N'DueDate';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Priority level: Low, Medium, High, or Critical', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'ActionItem', @level2type = N'COLUMN', @level2name = N'Priority';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Action item status: Open, InProgress, Blocked, Completed, or Cancelled', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'ActionItem', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Timestamp when the action item was completed', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'ActionItem', @level2type = N'COLUMN', @level2name = N'CompletedAt';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Notes about the completion of the action item', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'ActionItem', @level2type = N'COLUMN', @level2name = N'CompletionNotes';
GO

-- Table: Artifact
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'External artifact links to documents, files, recordings, and other resources',
    @level0type = N'SCHEMA', @level0name = N'Committees',
    @level1type = N'TABLE', @level1name = N'Artifact';

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Artifact title or filename', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Artifact', @level2type = N'COLUMN', @level2name = N'Title';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Description of the artifact content', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Artifact', @level2type = N'COLUMN', @level2name = N'Description';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Storage provider: GoogleDrive, SharePoint, Box, OneDrive, Dropbox, or URL', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Artifact', @level2type = N'COLUMN', @level2name = N'Provider';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Unique identifier in the external provider system', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Artifact', @level2type = N'COLUMN', @level2name = N'ExternalID';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'URL to access the artifact', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Artifact', @level2type = N'COLUMN', @level2name = N'URL';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'MIME type of the artifact (e.g., application/pdf, video/mp4)', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Artifact', @level2type = N'COLUMN', @level2name = N'MimeType';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'File size in bytes', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Artifact', @level2type = N'COLUMN', @level2name = N'FileSize';
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Artifact type: Document, Spreadsheet, Presentation, Minutes, Agenda, Recording, Transcript, Image, or Other', @level0type = N'SCHEMA', @level0name = N'Committees', @level1type = N'TABLE', @level1name = N'Artifact', @level2type = N'COLUMN', @level2name = N'ArtifactType';
GO


-- Default Committee Types
INSERT INTO Committees.Type (Name, Description, IsStandards, DefaultTermMonths, IconClass) VALUES
('Board of Directors', 'Governing board with fiduciary responsibility', 0, 12, 'fa-solid fa-landmark'),
('Standing Committee', 'Permanent committee with ongoing responsibilities', 0, 12, 'fa-solid fa-users'),
('Ad Hoc Committee', 'Temporary committee for specific purpose', 0, NULL, 'fa-solid fa-clock'),
('Workgroup', 'Task-focused group with defined deliverables', 0, NULL, 'fa-solid fa-briefcase'),
('Standards Working Group', 'Committee developing standards or specifications', 1, NULL, 'fa-solid fa-file-contract');

-- Default Roles
INSERT INTO Committees.Role (Name, Description, IsOfficer, IsVotingRole, Sequence) VALUES
('Chair', 'Leads the committee and runs meetings', 1, 1, 10),
('Vice Chair', 'Supports chair and leads in their absence', 1, 1, 20),
('Secretary', 'Records minutes and manages documentation', 1, 1, 30),
('Member', 'Voting member of the committee', 0, 1, 100),
('Non-Voting Member', 'Participates but does not vote', 0, 0, 110),
('Liaison', 'Represents another group or organization', 0, 0, 120),
('Advisor', 'Provides expertise without membership', 0, 0, 130);

























/* SQL generated to create new entity Types */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '7ba2bb9f-e004-46c5-afe1-a41e8be8a4dc',
         'Types',
         NULL,
         NULL,
         NULL,
         'Type',
         'vwTypes',
         'Committees',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity Types to application ID: '62c6165d-0014-4231-bc58-f39360cfb9fa' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('62c6165d-0014-4231-bc58-f39360cfb9fa', '7ba2bb9f-e004-46c5-afe1-a41e8be8a4dc', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '62c6165d-0014-4231-bc58-f39360cfb9fa'))

/* SQL generated to add new permission for entity Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7ba2bb9f-e004-46c5-afe1-a41e8be8a4dc', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7ba2bb9f-e004-46c5-afe1-a41e8be8a4dc', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7ba2bb9f-e004-46c5-afe1-a41e8be8a4dc', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Committees */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '5d0e3a93-3a50-4754-8dad-7d1fe7d22943',
         'Committees',
         NULL,
         NULL,
         NULL,
         'Committee',
         'vwCommittees',
         'Committees',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity Committees to application ID: '62C6165D-0014-4231-BC58-F39360CFB9FA' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('62C6165D-0014-4231-BC58-F39360CFB9FA', '5d0e3a93-3a50-4754-8dad-7d1fe7d22943', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '62C6165D-0014-4231-BC58-F39360CFB9FA'))

/* SQL generated to add new permission for entity Committees for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('5d0e3a93-3a50-4754-8dad-7d1fe7d22943', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Committees for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('5d0e3a93-3a50-4754-8dad-7d1fe7d22943', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Committees for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('5d0e3a93-3a50-4754-8dad-7d1fe7d22943', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Terms */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '50aec50c-b2eb-4a3b-84fd-f99059de954f',
         'Terms',
         NULL,
         NULL,
         NULL,
         'Term',
         'vwTerms',
         'Committees',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity Terms to application ID: '62C6165D-0014-4231-BC58-F39360CFB9FA' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('62C6165D-0014-4231-BC58-F39360CFB9FA', '50aec50c-b2eb-4a3b-84fd-f99059de954f', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '62C6165D-0014-4231-BC58-F39360CFB9FA'))

/* SQL generated to add new permission for entity Terms for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('50aec50c-b2eb-4a3b-84fd-f99059de954f', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Terms for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('50aec50c-b2eb-4a3b-84fd-f99059de954f', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Terms for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('50aec50c-b2eb-4a3b-84fd-f99059de954f', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Roles__Committees */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '70ee1893-7455-413b-b93c-12024d443526',
         'Roles__Committees',
         NULL,
         NULL,
         '__Committees',
         'Role',
         'vwRoles__Committees',
         'Committees',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity Roles__Committees to application ID: '62C6165D-0014-4231-BC58-F39360CFB9FA' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('62C6165D-0014-4231-BC58-F39360CFB9FA', '70ee1893-7455-413b-b93c-12024d443526', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '62C6165D-0014-4231-BC58-F39360CFB9FA'))

/* SQL generated to add new permission for entity Roles__Committees for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('70ee1893-7455-413b-b93c-12024d443526', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Roles__Committees for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('70ee1893-7455-413b-b93c-12024d443526', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Roles__Committees for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('70ee1893-7455-413b-b93c-12024d443526', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Memberships */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '7f183366-c757-4c8f-882d-61cc33c21b03',
         'Memberships',
         NULL,
         NULL,
         NULL,
         'Membership',
         'vwMemberships',
         'Committees',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity Memberships to application ID: '62C6165D-0014-4231-BC58-F39360CFB9FA' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('62C6165D-0014-4231-BC58-F39360CFB9FA', '7f183366-c757-4c8f-882d-61cc33c21b03', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '62C6165D-0014-4231-BC58-F39360CFB9FA'))

/* SQL generated to add new permission for entity Memberships for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7f183366-c757-4c8f-882d-61cc33c21b03', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Memberships for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7f183366-c757-4c8f-882d-61cc33c21b03', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Memberships for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('7f183366-c757-4c8f-882d-61cc33c21b03', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Meetings */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '247f6b12-54ae-45f2-abdd-d171b5e89ce7',
         'Meetings',
         NULL,
         NULL,
         NULL,
         'Meeting',
         'vwMeetings',
         'Committees',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity Meetings to application ID: '62C6165D-0014-4231-BC58-F39360CFB9FA' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('62C6165D-0014-4231-BC58-F39360CFB9FA', '247f6b12-54ae-45f2-abdd-d171b5e89ce7', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '62C6165D-0014-4231-BC58-F39360CFB9FA'))

/* SQL generated to add new permission for entity Meetings for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('247f6b12-54ae-45f2-abdd-d171b5e89ce7', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Meetings for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('247f6b12-54ae-45f2-abdd-d171b5e89ce7', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Meetings for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('247f6b12-54ae-45f2-abdd-d171b5e89ce7', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Agenda Items */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '3aabc390-69d2-44c0-b1e2-7df00ccbf96a',
         'Agenda Items',
         NULL,
         NULL,
         NULL,
         'AgendaItem',
         'vwAgendaItems',
         'Committees',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity Agenda Items to application ID: '62C6165D-0014-4231-BC58-F39360CFB9FA' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('62C6165D-0014-4231-BC58-F39360CFB9FA', '3aabc390-69d2-44c0-b1e2-7df00ccbf96a', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '62C6165D-0014-4231-BC58-F39360CFB9FA'))

/* SQL generated to add new permission for entity Agenda Items for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('3aabc390-69d2-44c0-b1e2-7df00ccbf96a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Agenda Items for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('3aabc390-69d2-44c0-b1e2-7df00ccbf96a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Agenda Items for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('3aabc390-69d2-44c0-b1e2-7df00ccbf96a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Attendances */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '21ae7024-58e8-49dc-8c4d-fe271898ffb5',
         'Attendances',
         NULL,
         NULL,
         NULL,
         'Attendance',
         'vwAttendances',
         'Committees',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity Attendances to application ID: '62C6165D-0014-4231-BC58-F39360CFB9FA' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('62C6165D-0014-4231-BC58-F39360CFB9FA', '21ae7024-58e8-49dc-8c4d-fe271898ffb5', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '62C6165D-0014-4231-BC58-F39360CFB9FA'))

/* SQL generated to add new permission for entity Attendances for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('21ae7024-58e8-49dc-8c4d-fe271898ffb5', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Attendances for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('21ae7024-58e8-49dc-8c4d-fe271898ffb5', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Attendances for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('21ae7024-58e8-49dc-8c4d-fe271898ffb5', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Action Items */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '56020639-d9e0-4736-86fb-fda8fca455f8',
         'Action Items',
         NULL,
         NULL,
         NULL,
         'ActionItem',
         'vwActionItems',
         'Committees',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity Action Items to application ID: '62C6165D-0014-4231-BC58-F39360CFB9FA' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('62C6165D-0014-4231-BC58-F39360CFB9FA', '56020639-d9e0-4736-86fb-fda8fca455f8', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '62C6165D-0014-4231-BC58-F39360CFB9FA'))

/* SQL generated to add new permission for entity Action Items for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('56020639-d9e0-4736-86fb-fda8fca455f8', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Action Items for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('56020639-d9e0-4736-86fb-fda8fca455f8', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Action Items for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('56020639-d9e0-4736-86fb-fda8fca455f8', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity Artifacts */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '38095f73-312f-4549-8295-b76b54230224',
         'Artifacts',
         NULL,
         NULL,
         NULL,
         'Artifact',
         'vwArtifacts',
         'Committees',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity Artifacts to application ID: '62C6165D-0014-4231-BC58-F39360CFB9FA' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('62C6165D-0014-4231-BC58-F39360CFB9FA', '38095f73-312f-4549-8295-b76b54230224', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = '62C6165D-0014-4231-BC58-F39360CFB9FA'))

/* SQL generated to add new permission for entity Artifacts for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('38095f73-312f-4549-8295-b76b54230224', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity Artifacts for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('38095f73-312f-4549-8295-b76b54230224', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity Artifacts for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('38095f73-312f-4549-8295-b76b54230224', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity Committees.Role */
ALTER TABLE [Committees].[Role] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Committees.Role */
ALTER TABLE [Committees].[Role] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Committees.Membership */
ALTER TABLE [Committees].[Membership] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Committees.Membership */
ALTER TABLE [Committees].[Membership] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Committees.Committee */
ALTER TABLE [Committees].[Committee] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Committees.Committee */
ALTER TABLE [Committees].[Committee] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Committees.AgendaItem */
ALTER TABLE [Committees].[AgendaItem] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Committees.AgendaItem */
ALTER TABLE [Committees].[AgendaItem] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Committees.Type */
ALTER TABLE [Committees].[Type] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Committees.Type */
ALTER TABLE [Committees].[Type] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Committees.Artifact */
ALTER TABLE [Committees].[Artifact] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Committees.Artifact */
ALTER TABLE [Committees].[Artifact] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Committees.Meeting */
ALTER TABLE [Committees].[Meeting] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Committees.Meeting */
ALTER TABLE [Committees].[Meeting] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Committees.Term */
ALTER TABLE [Committees].[Term] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Committees.Term */
ALTER TABLE [Committees].[Term] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Committees.ActionItem */
ALTER TABLE [Committees].[ActionItem] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Committees.ActionItem */
ALTER TABLE [Committees].[ActionItem] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity Committees.Attendance */
ALTER TABLE [Committees].[Attendance] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity Committees.Attendance */
ALTER TABLE [Committees].[Attendance] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f5918cc8-1530-4f34-8450-000d722e1086'  OR 
               (EntityID = '70EE1893-7455-413B-B93C-12024D443526' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f5918cc8-1530-4f34-8450-000d722e1086',
            '70EE1893-7455-413B-B93C-12024D443526', -- Entity: Roles__Committees
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f163c5c1-bfba-4794-b2db-78d484c3502f'  OR 
               (EntityID = '70EE1893-7455-413B-B93C-12024D443526' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f163c5c1-bfba-4794-b2db-78d484c3502f',
            '70EE1893-7455-413B-B93C-12024D443526', -- Entity: Roles__Committees
            100002,
            'Name',
            'Name',
            'Role name (e.g., Chair, Vice Chair, Secretary, Member)',
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6d0361e9-27f4-4063-acc7-195d3be82724'  OR 
               (EntityID = '70EE1893-7455-413B-B93C-12024D443526' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6d0361e9-27f4-4063-acc7-195d3be82724',
            '70EE1893-7455-413B-B93C-12024D443526', -- Entity: Roles__Committees
            100003,
            'Description',
            'Description',
            'Description of role responsibilities and expectations',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd55bc648-adac-4a20-8cfe-ecb09cd58f5b'  OR 
               (EntityID = '70EE1893-7455-413B-B93C-12024D443526' AND Name = 'IsOfficer')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd55bc648-adac-4a20-8cfe-ecb09cd58f5b',
            '70EE1893-7455-413B-B93C-12024D443526', -- Entity: Roles__Committees
            100004,
            'IsOfficer',
            'Is Officer',
            'Indicates if this is an officer position (Chair, Vice Chair, etc.)',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '52b1e7a6-6618-41e1-a14f-37cbc324c70f'  OR 
               (EntityID = '70EE1893-7455-413B-B93C-12024D443526' AND Name = 'IsVotingRole')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '52b1e7a6-6618-41e1-a14f-37cbc324c70f',
            '70EE1893-7455-413B-B93C-12024D443526', -- Entity: Roles__Committees
            100005,
            'IsVotingRole',
            'Is Voting Role',
            'Whether this role has voting privileges',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4cb01be2-97f4-423b-86c1-680ee6e47b0b'  OR 
               (EntityID = '70EE1893-7455-413B-B93C-12024D443526' AND Name = 'DefaultPermissionsJSON')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4cb01be2-97f4-423b-86c1-680ee6e47b0b',
            '70EE1893-7455-413B-B93C-12024D443526', -- Entity: Roles__Committees
            100006,
            'DefaultPermissionsJSON',
            'Default Permissions JSON',
            'JSON object defining default permissions for this role',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '64b9e0da-416b-4a26-af5f-56b682d6e5b3'  OR 
               (EntityID = '70EE1893-7455-413B-B93C-12024D443526' AND Name = 'Sequence')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '64b9e0da-416b-4a26-af5f-56b682d6e5b3',
            '70EE1893-7455-413B-B93C-12024D443526', -- Entity: Roles__Committees
            100007,
            'Sequence',
            'Sequence',
            'Display order sequence for role listing',
            'int',
            4,
            10,
            0,
            0,
            '(100)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3a3d3734-8b2a-45e3-878a-f90d80c4519b'  OR 
               (EntityID = '70EE1893-7455-413B-B93C-12024D443526' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3a3d3734-8b2a-45e3-878a-f90d80c4519b',
            '70EE1893-7455-413B-B93C-12024D443526', -- Entity: Roles__Committees
            100008,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2e0113d5-e034-497a-9cb6-85a60122ac75'  OR 
               (EntityID = '70EE1893-7455-413B-B93C-12024D443526' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2e0113d5-e034-497a-9cb6-85a60122ac75',
            '70EE1893-7455-413B-B93C-12024D443526', -- Entity: Roles__Committees
            100009,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b042ce1e-e712-4ce4-add8-69173a4ca2e8'  OR 
               (EntityID = '7F183366-C757-4C8F-882D-61CC33C21B03' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b042ce1e-e712-4ce4-add8-69173a4ca2e8',
            '7F183366-C757-4C8F-882D-61CC33C21B03', -- Entity: Memberships
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a428c03b-d880-4de2-989b-c2bda9f02d14'  OR 
               (EntityID = '7F183366-C757-4C8F-882D-61CC33C21B03' AND Name = 'CommitteeID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a428c03b-d880-4de2-989b-c2bda9f02d14',
            '7F183366-C757-4C8F-882D-61CC33C21B03', -- Entity: Memberships
            100002,
            'CommitteeID',
            'Committee ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '405542ce-a250-4fc2-9a86-55869638c7dd'  OR 
               (EntityID = '7F183366-C757-4C8F-882D-61CC33C21B03' AND Name = 'UserID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '405542ce-a250-4fc2-9a86-55869638c7dd',
            '7F183366-C757-4C8F-882D-61CC33C21B03', -- Entity: Memberships
            100003,
            'UserID',
            'User ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '29ac1d20-9311-4284-9966-c0000066a464'  OR 
               (EntityID = '7F183366-C757-4C8F-882D-61CC33C21B03' AND Name = 'RoleID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '29ac1d20-9311-4284-9966-c0000066a464',
            '7F183366-C757-4C8F-882D-61CC33C21B03', -- Entity: Memberships
            100004,
            'RoleID',
            'Role ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '70EE1893-7455-413B-B93C-12024D443526',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'fe86aeb4-2458-4c39-bdb4-b5396f38a771'  OR 
               (EntityID = '7F183366-C757-4C8F-882D-61CC33C21B03' AND Name = 'TermID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fe86aeb4-2458-4c39-bdb4-b5396f38a771',
            '7F183366-C757-4C8F-882D-61CC33C21B03', -- Entity: Memberships
            100005,
            'TermID',
            'Term ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '50AEC50C-B2EB-4A3B-84FD-F99059DE954F',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6e12786b-6aee-406f-b3c8-5dfebbf2c7b9'  OR 
               (EntityID = '7F183366-C757-4C8F-882D-61CC33C21B03' AND Name = 'StartDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6e12786b-6aee-406f-b3c8-5dfebbf2c7b9',
            '7F183366-C757-4C8F-882D-61CC33C21B03', -- Entity: Memberships
            100006,
            'StartDate',
            'Start Date',
            'Date the membership began',
            'date',
            3,
            10,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '261b09de-c34c-4daf-8d43-142d92a56575'  OR 
               (EntityID = '7F183366-C757-4C8F-882D-61CC33C21B03' AND Name = 'EndDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '261b09de-c34c-4daf-8d43-142d92a56575',
            '7F183366-C757-4C8F-882D-61CC33C21B03', -- Entity: Memberships
            100007,
            'EndDate',
            'End Date',
            'Date the membership ended (null for active memberships)',
            'date',
            3,
            10,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f887dc17-1be7-46ca-bb97-4cff8984ee12'  OR 
               (EntityID = '7F183366-C757-4C8F-882D-61CC33C21B03' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f887dc17-1be7-46ca-bb97-4cff8984ee12',
            '7F183366-C757-4C8F-882D-61CC33C21B03', -- Entity: Memberships
            100008,
            'Status',
            'Status',
            'Membership status: Active, Pending, Ended, or Suspended',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Active',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '58a1d68c-5bb2-4340-bd3e-48af97be8cd8'  OR 
               (EntityID = '7F183366-C757-4C8F-882D-61CC33C21B03' AND Name = 'EndReason')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '58a1d68c-5bb2-4340-bd3e-48af97be8cd8',
            '7F183366-C757-4C8F-882D-61CC33C21B03', -- Entity: Memberships
            100009,
            'EndReason',
            'End Reason',
            'Reason for membership ending (e.g., Term Completed, Resigned, Removed)',
            'nvarchar',
            200,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '10322280-5f5a-4ba0-810b-c3170d8d79db'  OR 
               (EntityID = '7F183366-C757-4C8F-882D-61CC33C21B03' AND Name = 'Notes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '10322280-5f5a-4ba0-810b-c3170d8d79db',
            '7F183366-C757-4C8F-882D-61CC33C21B03', -- Entity: Memberships
            100010,
            'Notes',
            'Notes',
            'Additional notes about the membership',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2ad7549f-fb7c-43d9-be62-3fbdd62fcdf1'  OR 
               (EntityID = '7F183366-C757-4C8F-882D-61CC33C21B03' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2ad7549f-fb7c-43d9-be62-3fbdd62fcdf1',
            '7F183366-C757-4C8F-882D-61CC33C21B03', -- Entity: Memberships
            100011,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd022bb73-4a35-47df-b6b1-e675feb307b5'  OR 
               (EntityID = '7F183366-C757-4C8F-882D-61CC33C21B03' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd022bb73-4a35-47df-b6b1-e675feb307b5',
            '7F183366-C757-4C8F-882D-61CC33C21B03', -- Entity: Memberships
            100012,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b96a357e-2e45-498d-ab5f-fbe248445827'  OR 
               (EntityID = '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b96a357e-2e45-498d-ab5f-fbe248445827',
            '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943', -- Entity: Committees
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '06cc2f6c-0aa6-4d38-8273-523b37ef4301'  OR 
               (EntityID = '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '06cc2f6c-0aa6-4d38-8273-523b37ef4301',
            '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943', -- Entity: Committees
            100002,
            'Name',
            'Name',
            'Committee name',
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '78d8f3d2-f9b6-46c6-9970-4b34e788f119'  OR 
               (EntityID = '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '78d8f3d2-f9b6-46c6-9970-4b34e788f119',
            '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943', -- Entity: Committees
            100003,
            'Description',
            'Description',
            'Committee description and purpose',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7acaa6b2-7cd0-40b9-b892-2264c8556842'  OR 
               (EntityID = '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943' AND Name = 'TypeID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7acaa6b2-7cd0-40b9-b892-2264c8556842',
            '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943', -- Entity: Committees
            100004,
            'TypeID',
            'Type ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '7BA2BB9F-E004-46C5-AFE1-A41E8BE8A4DC',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '354955e1-ac5c-49ee-91eb-58558cbc23a4'  OR 
               (EntityID = '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943' AND Name = 'ParentCommitteeID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '354955e1-ac5c-49ee-91eb-58558cbc23a4',
            '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943', -- Entity: Committees
            100005,
            'ParentCommitteeID',
            'Parent Committee ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'fc4aa89a-a092-48be-9666-f1efd87ba0f5'  OR 
               (EntityID = '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943' AND Name = 'OrganizationID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fc4aa89a-a092-48be-9666-f1efd87ba0f5',
            '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943', -- Entity: Committees
            100006,
            'OrganizationID',
            'Organization ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a2dc456f-11dd-43c1-98d4-2bb4f4355380'  OR 
               (EntityID = '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943' AND Name = 'CharterDocumentURL')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a2dc456f-11dd-43c1-98d4-2bb4f4355380',
            '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943', -- Entity: Committees
            100007,
            'CharterDocumentURL',
            'Charter Document URL',
            'URL to the committee charter document',
            'nvarchar',
            2000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '352e2bb5-6b87-4e90-994f-3e8e0b051cf6'  OR 
               (EntityID = '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943' AND Name = 'MissionStatement')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '352e2bb5-6b87-4e90-994f-3e8e0b051cf6',
            '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943', -- Entity: Committees
            100008,
            'MissionStatement',
            'Mission Statement',
            'Committee mission statement',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3b691cb8-0edc-41de-976e-50e06cc6a345'  OR 
               (EntityID = '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3b691cb8-0edc-41de-976e-50e06cc6a345',
            '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943', -- Entity: Committees
            100009,
            'Status',
            'Status',
            'Current status: Active, Inactive, Pending, or Dissolved',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Active',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1d4a49d5-c399-4ec0-a594-bd03ce97929f'  OR 
               (EntityID = '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943' AND Name = 'IsPublic')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1d4a49d5-c399-4ec0-a594-bd03ce97929f',
            '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943', -- Entity: Committees
            100010,
            'IsPublic',
            'Is Public',
            'Whether committee information is publicly visible',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c26a926c-923b-40c8-9456-afb25d0249f2'  OR 
               (EntityID = '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943' AND Name = 'FormationDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c26a926c-923b-40c8-9456-afb25d0249f2',
            '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943', -- Entity: Committees
            100011,
            'FormationDate',
            'Formation Date',
            'Date the committee was officially formed',
            'date',
            3,
            10,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1284f7bb-f0ba-4fff-a16d-2b3feb83fe57'  OR 
               (EntityID = '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943' AND Name = 'DissolutionDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1284f7bb-f0ba-4fff-a16d-2b3feb83fe57',
            '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943', -- Entity: Committees
            100012,
            'DissolutionDate',
            'Dissolution Date',
            'Date the committee was dissolved or terminated',
            'date',
            3,
            10,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9ed17add-a6ff-45fc-aa84-e88bf708b028'  OR 
               (EntityID = '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9ed17add-a6ff-45fc-aa84-e88bf708b028',
            '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943', -- Entity: Committees
            100013,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '315804b7-d253-4a17-961d-b493c4e18682'  OR 
               (EntityID = '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '315804b7-d253-4a17-961d-b493c4e18682',
            '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943', -- Entity: Committees
            100014,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3746ca97-db14-41e6-91ca-61d15b152935'  OR 
               (EntityID = '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3746ca97-db14-41e6-91ca-61d15b152935',
            '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A', -- Entity: Agenda Items
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '33054d10-10bc-4815-8f1c-070747886342'  OR 
               (EntityID = '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A' AND Name = 'MeetingID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '33054d10-10bc-4815-8f1c-070747886342',
            '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A', -- Entity: Agenda Items
            100002,
            'MeetingID',
            'Meeting ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '247F6B12-54AE-45F2-ABDD-D171B5E89CE7',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5d8d5912-f7bc-43fb-8228-8ddf10e00bb9'  OR 
               (EntityID = '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A' AND Name = 'ParentAgendaItemID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5d8d5912-f7bc-43fb-8228-8ddf10e00bb9',
            '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A', -- Entity: Agenda Items
            100003,
            'ParentAgendaItemID',
            'Parent Agenda Item ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'efe0d8e6-8428-46d4-81c3-11db0d6f63c3'  OR 
               (EntityID = '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A' AND Name = 'Sequence')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'efe0d8e6-8428-46d4-81c3-11db0d6f63c3',
            '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A', -- Entity: Agenda Items
            100004,
            'Sequence',
            'Sequence',
            'Display order of agenda item in the meeting',
            'int',
            4,
            10,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6e0e86c7-48f3-4a7e-a809-821aee51d85c'  OR 
               (EntityID = '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A' AND Name = 'Title')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6e0e86c7-48f3-4a7e-a809-821aee51d85c',
            '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A', -- Entity: Agenda Items
            100005,
            'Title',
            'Title',
            'Agenda item title',
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9b7821b8-9f8d-4048-adbe-2e7167d666f2'  OR 
               (EntityID = '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9b7821b8-9f8d-4048-adbe-2e7167d666f2',
            '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A', -- Entity: Agenda Items
            100006,
            'Description',
            'Description',
            'Detailed description of the agenda item',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '852a11e3-d4c5-4f9e-a9ec-cb42d1462bc9'  OR 
               (EntityID = '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A' AND Name = 'PresenterUserID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '852a11e3-d4c5-4f9e-a9ec-cb42d1462bc9',
            '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A', -- Entity: Agenda Items
            100007,
            'PresenterUserID',
            'Presenter User ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd4499342-ae1d-4b11-878f-0dd8fd921dc7'  OR 
               (EntityID = '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A' AND Name = 'DurationMinutes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd4499342-ae1d-4b11-878f-0dd8fd921dc7',
            '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A', -- Entity: Agenda Items
            100008,
            'DurationMinutes',
            'Duration Minutes',
            'Allocated time in minutes for this agenda item',
            'int',
            4,
            10,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6705c316-c186-4d61-97aa-803696c0ae0f'  OR 
               (EntityID = '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A' AND Name = 'ItemType')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6705c316-c186-4d61-97aa-803696c0ae0f',
            '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A', -- Entity: Agenda Items
            100009,
            'ItemType',
            'Item Type',
            'Type of agenda item: Information, Discussion, Action, Vote, Report, or Other',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Discussion',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '56c39869-87d6-4d61-9a9e-37932c62fc1d'  OR 
               (EntityID = '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A' AND Name = 'RelatedDocumentURL')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '56c39869-87d6-4d61-9a9e-37932c62fc1d',
            '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A', -- Entity: Agenda Items
            100010,
            'RelatedDocumentURL',
            'Related Document URL',
            'URL to related supporting document',
            'nvarchar',
            2000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'fb55c570-ce2c-4fad-abca-b105457e4a84'  OR 
               (EntityID = '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fb55c570-ce2c-4fad-abca-b105457e4a84',
            '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A', -- Entity: Agenda Items
            100011,
            'Status',
            'Status',
            'Item status: Pending, Discussed, Tabled, Completed, or Skipped',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Pending',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '71188cae-6eee-49c1-8bb2-afc7b40669a9'  OR 
               (EntityID = '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A' AND Name = 'Notes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '71188cae-6eee-49c1-8bb2-afc7b40669a9',
            '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A', -- Entity: Agenda Items
            100012,
            'Notes',
            'Notes',
            'Discussion notes and outcomes',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'dfcc6b15-bd27-4c8f-81a2-4fe910ca9f3a'  OR 
               (EntityID = '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'dfcc6b15-bd27-4c8f-81a2-4fe910ca9f3a',
            '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A', -- Entity: Agenda Items
            100013,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f6dab155-222a-404b-a81c-92a5ce275e15'  OR 
               (EntityID = '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f6dab155-222a-404b-a81c-92a5ce275e15',
            '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A', -- Entity: Agenda Items
            100014,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ca2b57f4-67ab-461a-9927-fbe3b4978da8'  OR 
               (EntityID = '7BA2BB9F-E004-46C5-AFE1-A41E8BE8A4DC' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ca2b57f4-67ab-461a-9927-fbe3b4978da8',
            '7BA2BB9F-E004-46C5-AFE1-A41E8BE8A4DC', -- Entity: Types
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2e3d91f8-a5aa-4cff-9cd2-254cfdc97002'  OR 
               (EntityID = '7BA2BB9F-E004-46C5-AFE1-A41E8BE8A4DC' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2e3d91f8-a5aa-4cff-9cd2-254cfdc97002',
            '7BA2BB9F-E004-46C5-AFE1-A41E8BE8A4DC', -- Entity: Types
            100002,
            'Name',
            'Name',
            'Committee type name (e.g., Board, Standing, Ad Hoc)',
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ac06cdc6-0764-4dda-b546-31d7bd9ef2a7'  OR 
               (EntityID = '7BA2BB9F-E004-46C5-AFE1-A41E8BE8A4DC' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ac06cdc6-0764-4dda-b546-31d7bd9ef2a7',
            '7BA2BB9F-E004-46C5-AFE1-A41E8BE8A4DC', -- Entity: Types
            100003,
            'Description',
            'Description',
            'Detailed description of the committee type',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9dc6948b-791b-4a3f-8759-305f97e20a71'  OR 
               (EntityID = '7BA2BB9F-E004-46C5-AFE1-A41E8BE8A4DC' AND Name = 'IsStandards')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9dc6948b-791b-4a3f-8759-305f97e20a71',
            '7BA2BB9F-E004-46C5-AFE1-A41E8BE8A4DC', -- Entity: Types
            100004,
            'IsStandards',
            'Is Standards',
            'Indicates if this type is for standards development working groups',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '888aad49-394d-41d6-b946-b8a4f5e63f96'  OR 
               (EntityID = '7BA2BB9F-E004-46C5-AFE1-A41E8BE8A4DC' AND Name = 'DefaultTermMonths')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '888aad49-394d-41d6-b946-b8a4f5e63f96',
            '7BA2BB9F-E004-46C5-AFE1-A41E8BE8A4DC', -- Entity: Types
            100005,
            'DefaultTermMonths',
            'Default Term Months',
            'Default term length in months for committees of this type',
            'int',
            4,
            10,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3751a431-7eb5-44ef-9a25-f5801df56b5e'  OR 
               (EntityID = '7BA2BB9F-E004-46C5-AFE1-A41E8BE8A4DC' AND Name = 'IconClass')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3751a431-7eb5-44ef-9a25-f5801df56b5e',
            '7BA2BB9F-E004-46C5-AFE1-A41E8BE8A4DC', -- Entity: Types
            100006,
            'IconClass',
            'Icon Class',
            'Font Awesome icon class for UI display (e.g., fa-users, fa-gavel)',
            'nvarchar',
            200,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3e92bd1f-910f-4034-a51d-a165c180178d'  OR 
               (EntityID = '7BA2BB9F-E004-46C5-AFE1-A41E8BE8A4DC' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3e92bd1f-910f-4034-a51d-a165c180178d',
            '7BA2BB9F-E004-46C5-AFE1-A41E8BE8A4DC', -- Entity: Types
            100007,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'fc37ef5c-a687-4d9e-bbc8-f9699f76d156'  OR 
               (EntityID = '7BA2BB9F-E004-46C5-AFE1-A41E8BE8A4DC' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fc37ef5c-a687-4d9e-bbc8-f9699f76d156',
            '7BA2BB9F-E004-46C5-AFE1-A41E8BE8A4DC', -- Entity: Types
            100008,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '90e952a6-72b5-4666-a9b0-4f8aa2c055d6'  OR 
               (EntityID = '247F6B12-54AE-45F2-ABDD-D171B5E89CE7' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '90e952a6-72b5-4666-a9b0-4f8aa2c055d6',
            '247F6B12-54AE-45F2-ABDD-D171B5E89CE7', -- Entity: Meetings
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '216ed028-f439-4470-87ec-cee9701c2ded'  OR 
               (EntityID = '247F6B12-54AE-45F2-ABDD-D171B5E89CE7' AND Name = 'CommitteeID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '216ed028-f439-4470-87ec-cee9701c2ded',
            '247F6B12-54AE-45F2-ABDD-D171B5E89CE7', -- Entity: Meetings
            100002,
            'CommitteeID',
            'Committee ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '93f65b18-be85-4ecd-8a4e-f018a0972b63'  OR 
               (EntityID = '247F6B12-54AE-45F2-ABDD-D171B5E89CE7' AND Name = 'Title')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '93f65b18-be85-4ecd-8a4e-f018a0972b63',
            '247F6B12-54AE-45F2-ABDD-D171B5E89CE7', -- Entity: Meetings
            100003,
            'Title',
            'Title',
            'Meeting title',
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '932d2606-897a-4786-9019-6b411dfffb20'  OR 
               (EntityID = '247F6B12-54AE-45F2-ABDD-D171B5E89CE7' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '932d2606-897a-4786-9019-6b411dfffb20',
            '247F6B12-54AE-45F2-ABDD-D171B5E89CE7', -- Entity: Meetings
            100004,
            'Description',
            'Description',
            'Meeting description and purpose',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8c4ff15f-4c0c-4ad5-b4c7-e214c680ec9e'  OR 
               (EntityID = '247F6B12-54AE-45F2-ABDD-D171B5E89CE7' AND Name = 'StartDateTime')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8c4ff15f-4c0c-4ad5-b4c7-e214c680ec9e',
            '247F6B12-54AE-45F2-ABDD-D171B5E89CE7', -- Entity: Meetings
            100005,
            'StartDateTime',
            'Start Date Time',
            'Meeting start date and time with timezone offset',
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2fdd872c-c2e7-4455-b2ec-dd8f14a95cd2'  OR 
               (EntityID = '247F6B12-54AE-45F2-ABDD-D171B5E89CE7' AND Name = 'EndDateTime')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2fdd872c-c2e7-4455-b2ec-dd8f14a95cd2',
            '247F6B12-54AE-45F2-ABDD-D171B5E89CE7', -- Entity: Meetings
            100006,
            'EndDateTime',
            'End Date Time',
            'Meeting end date and time with timezone offset',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '60feafd3-2788-4c1a-9bf3-23f665a867a7'  OR 
               (EntityID = '247F6B12-54AE-45F2-ABDD-D171B5E89CE7' AND Name = 'TimeZone')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '60feafd3-2788-4c1a-9bf3-23f665a867a7',
            '247F6B12-54AE-45F2-ABDD-D171B5E89CE7', -- Entity: Meetings
            100007,
            'TimeZone',
            'Time Zone',
            'IANA timezone identifier (e.g., America/New_York, Europe/London)',
            'nvarchar',
            100,
            0,
            0,
            0,
            'America/New_York',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '25be53f8-4350-4c4a-87a7-e5ac83ace065'  OR 
               (EntityID = '247F6B12-54AE-45F2-ABDD-D171B5E89CE7' AND Name = 'LocationType')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '25be53f8-4350-4c4a-87a7-e5ac83ace065',
            '247F6B12-54AE-45F2-ABDD-D171B5E89CE7', -- Entity: Meetings
            100008,
            'LocationType',
            'Location Type',
            'Meeting location type: Virtual, InPerson, or Hybrid',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Virtual',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e98050fa-767e-4983-8b5e-be808b13dffa'  OR 
               (EntityID = '247F6B12-54AE-45F2-ABDD-D171B5E89CE7' AND Name = 'LocationText')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e98050fa-767e-4983-8b5e-be808b13dffa',
            '247F6B12-54AE-45F2-ABDD-D171B5E89CE7', -- Entity: Meetings
            100009,
            'LocationText',
            'Location Text',
            'Physical location address or description',
            'nvarchar',
            1000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b139e156-3952-421e-a6ef-e9aca2f02b0d'  OR 
               (EntityID = '247F6B12-54AE-45F2-ABDD-D171B5E89CE7' AND Name = 'VideoProvider')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b139e156-3952-421e-a6ef-e9aca2f02b0d',
            '247F6B12-54AE-45F2-ABDD-D171B5E89CE7', -- Entity: Meetings
            100010,
            'VideoProvider',
            'Video Provider',
            'Video conferencing provider (e.g., Zoom, Teams, GoogleMeet)',
            'nvarchar',
            100,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ff24af72-ecad-41cc-b7b1-b9e3903cab92'  OR 
               (EntityID = '247F6B12-54AE-45F2-ABDD-D171B5E89CE7' AND Name = 'VideoMeetingID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ff24af72-ecad-41cc-b7b1-b9e3903cab92',
            '247F6B12-54AE-45F2-ABDD-D171B5E89CE7', -- Entity: Meetings
            100011,
            'VideoMeetingID',
            'Video Meeting ID',
            'Video meeting identifier or room number',
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '11a0dab4-e4d6-4900-ad15-e3f22b4e3a37'  OR 
               (EntityID = '247F6B12-54AE-45F2-ABDD-D171B5E89CE7' AND Name = 'VideoJoinURL')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '11a0dab4-e4d6-4900-ad15-e3f22b4e3a37',
            '247F6B12-54AE-45F2-ABDD-D171B5E89CE7', -- Entity: Meetings
            100012,
            'VideoJoinURL',
            'Video Join URL',
            'URL to join the video meeting',
            'nvarchar',
            2000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c35f77d2-2f37-4f20-a7fb-f712caefc484'  OR 
               (EntityID = '247F6B12-54AE-45F2-ABDD-D171B5E89CE7' AND Name = 'VideoRecordingURL')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c35f77d2-2f37-4f20-a7fb-f712caefc484',
            '247F6B12-54AE-45F2-ABDD-D171B5E89CE7', -- Entity: Meetings
            100013,
            'VideoRecordingURL',
            'Video Recording URL',
            'URL to access meeting recording',
            'nvarchar',
            2000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6138b0aa-8190-4691-ab6e-1afdac764e50'  OR 
               (EntityID = '247F6B12-54AE-45F2-ABDD-D171B5E89CE7' AND Name = 'TranscriptURL')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6138b0aa-8190-4691-ab6e-1afdac764e50',
            '247F6B12-54AE-45F2-ABDD-D171B5E89CE7', -- Entity: Meetings
            100014,
            'TranscriptURL',
            'Transcript URL',
            'URL to access meeting transcript',
            'nvarchar',
            2000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c94dcd64-b25f-4818-83fd-369beda88f45'  OR 
               (EntityID = '247F6B12-54AE-45F2-ABDD-D171B5E89CE7' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c94dcd64-b25f-4818-83fd-369beda88f45',
            '247F6B12-54AE-45F2-ABDD-D171B5E89CE7', -- Entity: Meetings
            100015,
            'Status',
            'Status',
            'Meeting status: Draft, Scheduled, InProgress, Completed, Cancelled, or Postponed',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Scheduled',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4c21a998-2797-4364-8a66-a1ef8d798cde'  OR 
               (EntityID = '247F6B12-54AE-45F2-ABDD-D171B5E89CE7' AND Name = 'CalendarEventID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4c21a998-2797-4364-8a66-a1ef8d798cde',
            '247F6B12-54AE-45F2-ABDD-D171B5E89CE7', -- Entity: Meetings
            100016,
            'CalendarEventID',
            'Calendar Event ID',
            'External calendar system event identifier for synchronization',
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e5b8b94a-2493-4201-82d4-90340ed81c64'  OR 
               (EntityID = '247F6B12-54AE-45F2-ABDD-D171B5E89CE7' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e5b8b94a-2493-4201-82d4-90340ed81c64',
            '247F6B12-54AE-45F2-ABDD-D171B5E89CE7', -- Entity: Meetings
            100017,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8b13701c-9979-43d1-a0f6-f61998399ebc'  OR 
               (EntityID = '247F6B12-54AE-45F2-ABDD-D171B5E89CE7' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8b13701c-9979-43d1-a0f6-f61998399ebc',
            '247F6B12-54AE-45F2-ABDD-D171B5E89CE7', -- Entity: Meetings
            100018,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '489b64c3-49a3-4839-9478-c306ee9d1227'  OR 
               (EntityID = '50AEC50C-B2EB-4A3B-84FD-F99059DE954F' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '489b64c3-49a3-4839-9478-c306ee9d1227',
            '50AEC50C-B2EB-4A3B-84FD-F99059DE954F', -- Entity: Terms
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6c12ac8b-1249-4045-b718-5824e283351f'  OR 
               (EntityID = '50AEC50C-B2EB-4A3B-84FD-F99059DE954F' AND Name = 'CommitteeID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6c12ac8b-1249-4045-b718-5824e283351f',
            '50AEC50C-B2EB-4A3B-84FD-F99059DE954F', -- Entity: Terms
            100002,
            'CommitteeID',
            'Committee ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '753019de-a88c-4d3e-ab3a-dec0663441ab'  OR 
               (EntityID = '50AEC50C-B2EB-4A3B-84FD-F99059DE954F' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '753019de-a88c-4d3e-ab3a-dec0663441ab',
            '50AEC50C-B2EB-4A3B-84FD-F99059DE954F', -- Entity: Terms
            100003,
            'Name',
            'Name',
            'Term name (e.g., "2024", "2024-2025", "Q1 2024")',
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b93644fb-369e-45b7-9d86-25616b509afd'  OR 
               (EntityID = '50AEC50C-B2EB-4A3B-84FD-F99059DE954F' AND Name = 'StartDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b93644fb-369e-45b7-9d86-25616b509afd',
            '50AEC50C-B2EB-4A3B-84FD-F99059DE954F', -- Entity: Terms
            100004,
            'StartDate',
            'Start Date',
            'Term start date',
            'date',
            3,
            10,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '46a1ad68-6523-4ddf-8e93-081b310b39fe'  OR 
               (EntityID = '50AEC50C-B2EB-4A3B-84FD-F99059DE954F' AND Name = 'EndDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '46a1ad68-6523-4ddf-8e93-081b310b39fe',
            '50AEC50C-B2EB-4A3B-84FD-F99059DE954F', -- Entity: Terms
            100005,
            'EndDate',
            'End Date',
            'Term end date (null for ongoing terms)',
            'date',
            3,
            10,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '46d195e2-abbf-47a5-a39e-93b66325d91b'  OR 
               (EntityID = '50AEC50C-B2EB-4A3B-84FD-F99059DE954F' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '46d195e2-abbf-47a5-a39e-93b66325d91b',
            '50AEC50C-B2EB-4A3B-84FD-F99059DE954F', -- Entity: Terms
            100006,
            'Status',
            'Status',
            'Term status: Active, Upcoming, or Completed',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Active',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9f6f2212-b9c8-41d3-8ee5-55f5dd322069'  OR 
               (EntityID = '50AEC50C-B2EB-4A3B-84FD-F99059DE954F' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9f6f2212-b9c8-41d3-8ee5-55f5dd322069',
            '50AEC50C-B2EB-4A3B-84FD-F99059DE954F', -- Entity: Terms
            100007,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '27235116-1bd5-43e3-8a8b-375d673c69e4'  OR 
               (EntityID = '50AEC50C-B2EB-4A3B-84FD-F99059DE954F' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '27235116-1bd5-43e3-8a8b-375d673c69e4',
            '50AEC50C-B2EB-4A3B-84FD-F99059DE954F', -- Entity: Terms
            100008,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0b4744e8-49a2-4868-8a00-b149319c536a'  OR 
               (EntityID = '56020639-D9E0-4736-86FB-FDA8FCA455F8' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0b4744e8-49a2-4868-8a00-b149319c536a',
            '56020639-D9E0-4736-86FB-FDA8FCA455F8', -- Entity: Action Items
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8d465232-3c85-4aa0-ab77-875869928690'  OR 
               (EntityID = '56020639-D9E0-4736-86FB-FDA8FCA455F8' AND Name = 'CommitteeID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8d465232-3c85-4aa0-ab77-875869928690',
            '56020639-D9E0-4736-86FB-FDA8FCA455F8', -- Entity: Action Items
            100002,
            'CommitteeID',
            'Committee ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'fe6f59b0-8bdc-4cfd-8d36-1a288ac6524c'  OR 
               (EntityID = '56020639-D9E0-4736-86FB-FDA8FCA455F8' AND Name = 'MeetingID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'fe6f59b0-8bdc-4cfd-8d36-1a288ac6524c',
            '56020639-D9E0-4736-86FB-FDA8FCA455F8', -- Entity: Action Items
            100003,
            'MeetingID',
            'Meeting ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '247F6B12-54AE-45F2-ABDD-D171B5E89CE7',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4be4152a-a272-4a80-b056-f003ebc25659'  OR 
               (EntityID = '56020639-D9E0-4736-86FB-FDA8FCA455F8' AND Name = 'AgendaItemID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4be4152a-a272-4a80-b056-f003ebc25659',
            '56020639-D9E0-4736-86FB-FDA8FCA455F8', -- Entity: Action Items
            100004,
            'AgendaItemID',
            'Agenda Item ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd3c0cd1a-6765-4ed3-8265-cbc38844f559'  OR 
               (EntityID = '56020639-D9E0-4736-86FB-FDA8FCA455F8' AND Name = 'Title')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd3c0cd1a-6765-4ed3-8265-cbc38844f559',
            '56020639-D9E0-4736-86FB-FDA8FCA455F8', -- Entity: Action Items
            100005,
            'Title',
            'Title',
            'Action item title',
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b469ab47-2d08-4d04-bb97-1b04f24cf42b'  OR 
               (EntityID = '56020639-D9E0-4736-86FB-FDA8FCA455F8' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b469ab47-2d08-4d04-bb97-1b04f24cf42b',
            '56020639-D9E0-4736-86FB-FDA8FCA455F8', -- Entity: Action Items
            100006,
            'Description',
            'Description',
            'Detailed description of the action item',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6f66586b-0592-4054-aaab-b8c12dcadd46'  OR 
               (EntityID = '56020639-D9E0-4736-86FB-FDA8FCA455F8' AND Name = 'AssignedToUserID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6f66586b-0592-4054-aaab-b8c12dcadd46',
            '56020639-D9E0-4736-86FB-FDA8FCA455F8', -- Entity: Action Items
            100007,
            'AssignedToUserID',
            'Assigned To User ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '88c59c48-3232-473c-863f-1284224a54cc'  OR 
               (EntityID = '56020639-D9E0-4736-86FB-FDA8FCA455F8' AND Name = 'AssignedByUserID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '88c59c48-3232-473c-863f-1284224a54cc',
            '56020639-D9E0-4736-86FB-FDA8FCA455F8', -- Entity: Action Items
            100008,
            'AssignedByUserID',
            'Assigned By User ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4f13e52f-b84a-4a81-aaa7-dbaae5434a84'  OR 
               (EntityID = '56020639-D9E0-4736-86FB-FDA8FCA455F8' AND Name = 'DueDate')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4f13e52f-b84a-4a81-aaa7-dbaae5434a84',
            '56020639-D9E0-4736-86FB-FDA8FCA455F8', -- Entity: Action Items
            100009,
            'DueDate',
            'Due Date',
            'Date by which the action item should be completed',
            'date',
            3,
            10,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6f3bfcc9-192c-45ea-87ba-d45ece6a6c87'  OR 
               (EntityID = '56020639-D9E0-4736-86FB-FDA8FCA455F8' AND Name = 'Priority')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6f3bfcc9-192c-45ea-87ba-d45ece6a6c87',
            '56020639-D9E0-4736-86FB-FDA8FCA455F8', -- Entity: Action Items
            100010,
            'Priority',
            'Priority',
            'Priority level: Low, Medium, High, or Critical',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Medium',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'bfe76d7e-9dda-4141-9716-1f2862662033'  OR 
               (EntityID = '56020639-D9E0-4736-86FB-FDA8FCA455F8' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bfe76d7e-9dda-4141-9716-1f2862662033',
            '56020639-D9E0-4736-86FB-FDA8FCA455F8', -- Entity: Action Items
            100011,
            'Status',
            'Status',
            'Action item status: Open, InProgress, Blocked, Completed, or Cancelled',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Open',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '19ebcf50-9025-4b2c-ba0f-784e034c08a5'  OR 
               (EntityID = '56020639-D9E0-4736-86FB-FDA8FCA455F8' AND Name = 'CompletedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '19ebcf50-9025-4b2c-ba0f-784e034c08a5',
            '56020639-D9E0-4736-86FB-FDA8FCA455F8', -- Entity: Action Items
            100012,
            'CompletedAt',
            'Completed At',
            'Timestamp when the action item was completed',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0d264986-d4b9-472f-90eb-b123ee16be8f'  OR 
               (EntityID = '56020639-D9E0-4736-86FB-FDA8FCA455F8' AND Name = 'CompletionNotes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0d264986-d4b9-472f-90eb-b123ee16be8f',
            '56020639-D9E0-4736-86FB-FDA8FCA455F8', -- Entity: Action Items
            100013,
            'CompletionNotes',
            'Completion Notes',
            'Notes about the completion of the action item',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '28fcf9d9-d608-4528-bb7d-643d489d4000'  OR 
               (EntityID = '56020639-D9E0-4736-86FB-FDA8FCA455F8' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '28fcf9d9-d608-4528-bb7d-643d489d4000',
            '56020639-D9E0-4736-86FB-FDA8FCA455F8', -- Entity: Action Items
            100014,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b018aaf2-be0b-4724-9ff7-197c7a995f46'  OR 
               (EntityID = '56020639-D9E0-4736-86FB-FDA8FCA455F8' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b018aaf2-be0b-4724-9ff7-197c7a995f46',
            '56020639-D9E0-4736-86FB-FDA8FCA455F8', -- Entity: Action Items
            100015,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '85639e4a-f8fe-4c2a-8ffd-fc5d5389270e'  OR 
               (EntityID = '21AE7024-58E8-49DC-8C4D-FE271898FFB5' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '85639e4a-f8fe-4c2a-8ffd-fc5d5389270e',
            '21AE7024-58E8-49DC-8C4D-FE271898FFB5', -- Entity: Attendances
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1b328b16-e1af-479c-8416-c4f0f5a8c74c'  OR 
               (EntityID = '21AE7024-58E8-49DC-8C4D-FE271898FFB5' AND Name = 'MeetingID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1b328b16-e1af-479c-8416-c4f0f5a8c74c',
            '21AE7024-58E8-49DC-8C4D-FE271898FFB5', -- Entity: Attendances
            100002,
            'MeetingID',
            'Meeting ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '247F6B12-54AE-45F2-ABDD-D171B5E89CE7',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a3dab4a7-6dbe-4272-8c3d-bf9d8501f150'  OR 
               (EntityID = '21AE7024-58E8-49DC-8C4D-FE271898FFB5' AND Name = 'UserID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a3dab4a7-6dbe-4272-8c3d-bf9d8501f150',
            '21AE7024-58E8-49DC-8C4D-FE271898FFB5', -- Entity: Attendances
            100003,
            'UserID',
            'User ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5119fa60-11c8-4794-bb2e-02322b58b4ef'  OR 
               (EntityID = '21AE7024-58E8-49DC-8C4D-FE271898FFB5' AND Name = 'AttendanceStatus')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5119fa60-11c8-4794-bb2e-02322b58b4ef',
            '21AE7024-58E8-49DC-8C4D-FE271898FFB5', -- Entity: Attendances
            100004,
            'AttendanceStatus',
            'Attendance Status',
            'Attendance status: Expected, Present, Absent, Excused, or Partial',
            'nvarchar',
            100,
            0,
            0,
            0,
            'Expected',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3f62fe01-dfd7-4e67-8c3d-316c29b72400'  OR 
               (EntityID = '21AE7024-58E8-49DC-8C4D-FE271898FFB5' AND Name = 'JoinedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3f62fe01-dfd7-4e67-8c3d-316c29b72400',
            '21AE7024-58E8-49DC-8C4D-FE271898FFB5', -- Entity: Attendances
            100005,
            'JoinedAt',
            'Joined At',
            'Timestamp when the attendee joined the meeting',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e0c68c85-6521-40aa-b5f4-98ef04b20ffc'  OR 
               (EntityID = '21AE7024-58E8-49DC-8C4D-FE271898FFB5' AND Name = 'LeftAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e0c68c85-6521-40aa-b5f4-98ef04b20ffc',
            '21AE7024-58E8-49DC-8C4D-FE271898FFB5', -- Entity: Attendances
            100006,
            'LeftAt',
            'Left At',
            'Timestamp when the attendee left the meeting',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f34f3aec-436d-44fc-b686-85c4a0821cee'  OR 
               (EntityID = '21AE7024-58E8-49DC-8C4D-FE271898FFB5' AND Name = 'Notes')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f34f3aec-436d-44fc-b686-85c4a0821cee',
            '21AE7024-58E8-49DC-8C4D-FE271898FFB5', -- Entity: Attendances
            100007,
            'Notes',
            'Notes',
            'Additional notes about attendance (e.g., reason for absence)',
            'nvarchar',
            1000,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '76f8525f-d5c5-482a-8143-7bd6246119f5'  OR 
               (EntityID = '21AE7024-58E8-49DC-8C4D-FE271898FFB5' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '76f8525f-d5c5-482a-8143-7bd6246119f5',
            '21AE7024-58E8-49DC-8C4D-FE271898FFB5', -- Entity: Attendances
            100008,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '40bc75a0-00a9-428c-a583-96a91fe6921a'  OR 
               (EntityID = '21AE7024-58E8-49DC-8C4D-FE271898FFB5' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '40bc75a0-00a9-428c-a583-96a91fe6921a',
            '21AE7024-58E8-49DC-8C4D-FE271898FFB5', -- Entity: Attendances
            100009,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert entity field value with ID 7ed7b10a-4080-49a1-83eb-76f984ad1c4c */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7ed7b10a-4080-49a1-83eb-76f984ad1c4c', '3B691CB8-0EDC-41DE-976E-50E06CC6A345', 1, 'Active', 'Active')

/* SQL text to insert entity field value with ID cea3a475-84c1-444d-97e9-82d1d14d3d11 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('cea3a475-84c1-444d-97e9-82d1d14d3d11', '3B691CB8-0EDC-41DE-976E-50E06CC6A345', 2, 'Dissolved', 'Dissolved')

/* SQL text to insert entity field value with ID 7fbc6c5b-5a27-4dfc-b649-5fa32f2dee52 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7fbc6c5b-5a27-4dfc-b649-5fa32f2dee52', '3B691CB8-0EDC-41DE-976E-50E06CC6A345', 3, 'Inactive', 'Inactive')

/* SQL text to insert entity field value with ID 8cdfba04-217b-4bc7-a5d3-bf197d4f180d */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('8cdfba04-217b-4bc7-a5d3-bf197d4f180d', '3B691CB8-0EDC-41DE-976E-50E06CC6A345', 4, 'Pending', 'Pending')

/* SQL text to update ValueListType for entity field ID 3B691CB8-0EDC-41DE-976E-50E06CC6A345 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='3B691CB8-0EDC-41DE-976E-50E06CC6A345'

/* SQL text to insert entity field value with ID 6478e3c5-23b4-4e78-9ffc-12f722e71a81 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('6478e3c5-23b4-4e78-9ffc-12f722e71a81', '46D195E2-ABBF-47A5-A39E-93B66325D91B', 1, 'Active', 'Active')

/* SQL text to insert entity field value with ID 285c3abd-48be-4363-8779-65fee76600bc */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('285c3abd-48be-4363-8779-65fee76600bc', '46D195E2-ABBF-47A5-A39E-93B66325D91B', 2, 'Completed', 'Completed')

/* SQL text to insert entity field value with ID c923261a-ef1b-4e1a-b8d9-bc9d8c742837 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('c923261a-ef1b-4e1a-b8d9-bc9d8c742837', '46D195E2-ABBF-47A5-A39E-93B66325D91B', 3, 'Upcoming', 'Upcoming')

/* SQL text to update ValueListType for entity field ID 46D195E2-ABBF-47A5-A39E-93B66325D91B */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='46D195E2-ABBF-47A5-A39E-93B66325D91B'

/* SQL text to insert entity field value with ID 9d364738-1158-4e5f-8bd0-2848f4db811b */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9d364738-1158-4e5f-8bd0-2848f4db811b', 'F887DC17-1BE7-46CA-BB97-4CFF8984EE12', 1, 'Active', 'Active')

/* SQL text to insert entity field value with ID a589b386-bd1a-475a-92ba-a52734ba043d */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('a589b386-bd1a-475a-92ba-a52734ba043d', 'F887DC17-1BE7-46CA-BB97-4CFF8984EE12', 2, 'Ended', 'Ended')

/* SQL text to insert entity field value with ID 0983ab43-2328-476d-8fd9-46e4dbc02198 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('0983ab43-2328-476d-8fd9-46e4dbc02198', 'F887DC17-1BE7-46CA-BB97-4CFF8984EE12', 3, 'Pending', 'Pending')

/* SQL text to insert entity field value with ID 39c3971e-f118-43a9-9fce-56bc7b080863 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('39c3971e-f118-43a9-9fce-56bc7b080863', 'F887DC17-1BE7-46CA-BB97-4CFF8984EE12', 4, 'Suspended', 'Suspended')

/* SQL text to update ValueListType for entity field ID F887DC17-1BE7-46CA-BB97-4CFF8984EE12 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F887DC17-1BE7-46CA-BB97-4CFF8984EE12'

/* SQL text to insert entity field value with ID 1a6ba590-877d-4f4c-88ab-55a74250570d */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('1a6ba590-877d-4f4c-88ab-55a74250570d', 'C94DCD64-B25F-4818-83FD-369BEDA88F45', 1, 'Cancelled', 'Cancelled')

/* SQL text to insert entity field value with ID d13cedd2-8c78-4ab2-a38d-095c9d2054dd */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('d13cedd2-8c78-4ab2-a38d-095c9d2054dd', 'C94DCD64-B25F-4818-83FD-369BEDA88F45', 2, 'Completed', 'Completed')

/* SQL text to insert entity field value with ID b7f6d41f-96be-4de0-a0ff-06f405ac9a4c */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('b7f6d41f-96be-4de0-a0ff-06f405ac9a4c', 'C94DCD64-B25F-4818-83FD-369BEDA88F45', 3, 'Draft', 'Draft')

/* SQL text to insert entity field value with ID a7abb2ea-9887-4b5e-9e3e-c166cd53ce6d */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('a7abb2ea-9887-4b5e-9e3e-c166cd53ce6d', 'C94DCD64-B25F-4818-83FD-369BEDA88F45', 4, 'InProgress', 'InProgress')

/* SQL text to insert entity field value with ID 64adcfa4-deeb-40f1-a8bd-b09eeefc5a38 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('64adcfa4-deeb-40f1-a8bd-b09eeefc5a38', 'C94DCD64-B25F-4818-83FD-369BEDA88F45', 5, 'Postponed', 'Postponed')

/* SQL text to insert entity field value with ID c094e81d-e27c-426c-832c-11fece9a865c */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('c094e81d-e27c-426c-832c-11fece9a865c', 'C94DCD64-B25F-4818-83FD-369BEDA88F45', 6, 'Scheduled', 'Scheduled')

/* SQL text to update ValueListType for entity field ID C94DCD64-B25F-4818-83FD-369BEDA88F45 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='C94DCD64-B25F-4818-83FD-369BEDA88F45'

/* SQL text to insert entity field value with ID afa370d1-bb63-4a42-af3a-f12180e93327 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('afa370d1-bb63-4a42-af3a-f12180e93327', '25BE53F8-4350-4C4A-87A7-E5AC83ACE065', 1, 'Hybrid', 'Hybrid')

/* SQL text to insert entity field value with ID a90bd6a5-de57-4a05-8d5f-cc2609dee5f3 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('a90bd6a5-de57-4a05-8d5f-cc2609dee5f3', '25BE53F8-4350-4C4A-87A7-E5AC83ACE065', 2, 'InPerson', 'InPerson')

/* SQL text to insert entity field value with ID 0aa27ca1-e771-4de7-8d4d-188151607f61 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('0aa27ca1-e771-4de7-8d4d-188151607f61', '25BE53F8-4350-4C4A-87A7-E5AC83ACE065', 3, 'Virtual', 'Virtual')

/* SQL text to update ValueListType for entity field ID 25BE53F8-4350-4C4A-87A7-E5AC83ACE065 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='25BE53F8-4350-4C4A-87A7-E5AC83ACE065'

/* SQL text to insert entity field value with ID 837215b7-9630-4321-b222-5ca895a23d2e */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('837215b7-9630-4321-b222-5ca895a23d2e', '6705C316-C186-4D61-97AA-803696C0AE0F', 1, 'Action', 'Action')

/* SQL text to insert entity field value with ID 9293589c-f4aa-4934-ba51-2a6f32b79011 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9293589c-f4aa-4934-ba51-2a6f32b79011', '6705C316-C186-4D61-97AA-803696C0AE0F', 2, 'Discussion', 'Discussion')

/* SQL text to insert entity field value with ID caa72983-f507-46c2-8047-06f3c2b9bfb0 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('caa72983-f507-46c2-8047-06f3c2b9bfb0', '6705C316-C186-4D61-97AA-803696C0AE0F', 3, 'Information', 'Information')

/* SQL text to insert entity field value with ID b9fa2ab7-9e1a-429a-a736-66a73920ed5c */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('b9fa2ab7-9e1a-429a-a736-66a73920ed5c', '6705C316-C186-4D61-97AA-803696C0AE0F', 4, 'Other', 'Other')

/* SQL text to insert entity field value with ID 6c8e104e-b95e-4444-96bb-dc1d116c7310 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('6c8e104e-b95e-4444-96bb-dc1d116c7310', '6705C316-C186-4D61-97AA-803696C0AE0F', 5, 'Report', 'Report')

/* SQL text to insert entity field value with ID b61e1828-da3e-48b4-9436-27d8492e7417 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('b61e1828-da3e-48b4-9436-27d8492e7417', '6705C316-C186-4D61-97AA-803696C0AE0F', 6, 'Vote', 'Vote')

/* SQL text to update ValueListType for entity field ID 6705C316-C186-4D61-97AA-803696C0AE0F */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='6705C316-C186-4D61-97AA-803696C0AE0F'

/* SQL text to insert entity field value with ID 8d83b2bd-647b-4601-b7ee-c307bd969533 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('8d83b2bd-647b-4601-b7ee-c307bd969533', 'FB55C570-CE2C-4FAD-ABCA-B105457E4A84', 1, 'Completed', 'Completed')

/* SQL text to insert entity field value with ID a2ef3fb4-b309-4e3f-8ac0-cf7d3d91830c */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('a2ef3fb4-b309-4e3f-8ac0-cf7d3d91830c', 'FB55C570-CE2C-4FAD-ABCA-B105457E4A84', 2, 'Discussed', 'Discussed')

/* SQL text to insert entity field value with ID 163f1196-8f69-4f19-960c-f4274e84893f */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('163f1196-8f69-4f19-960c-f4274e84893f', 'FB55C570-CE2C-4FAD-ABCA-B105457E4A84', 3, 'Pending', 'Pending')

/* SQL text to insert entity field value with ID 8b26baa1-f539-4298-9cfc-6e86bcf16415 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('8b26baa1-f539-4298-9cfc-6e86bcf16415', 'FB55C570-CE2C-4FAD-ABCA-B105457E4A84', 4, 'Skipped', 'Skipped')

/* SQL text to insert entity field value with ID f62026a6-0519-463b-b8cd-513582457763 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('f62026a6-0519-463b-b8cd-513582457763', 'FB55C570-CE2C-4FAD-ABCA-B105457E4A84', 5, 'Tabled', 'Tabled')

/* SQL text to update ValueListType for entity field ID FB55C570-CE2C-4FAD-ABCA-B105457E4A84 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='FB55C570-CE2C-4FAD-ABCA-B105457E4A84'

/* SQL text to insert entity field value with ID ad67b5dc-4609-4ad3-ae1e-f615adacbc9b */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('ad67b5dc-4609-4ad3-ae1e-f615adacbc9b', '5119FA60-11C8-4794-BB2E-02322B58B4EF', 1, 'Absent', 'Absent')

/* SQL text to insert entity field value with ID 651cdb27-12fd-4d77-bda7-be53e60fcccc */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('651cdb27-12fd-4d77-bda7-be53e60fcccc', '5119FA60-11C8-4794-BB2E-02322B58B4EF', 2, 'Excused', 'Excused')

/* SQL text to insert entity field value with ID bfdefbf9-bdc7-4813-b73b-68711ae9bf17 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('bfdefbf9-bdc7-4813-b73b-68711ae9bf17', '5119FA60-11C8-4794-BB2E-02322B58B4EF', 3, 'Expected', 'Expected')

/* SQL text to insert entity field value with ID e073fec3-d658-4113-8248-82c9a39eb0fc */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('e073fec3-d658-4113-8248-82c9a39eb0fc', '5119FA60-11C8-4794-BB2E-02322B58B4EF', 4, 'Partial', 'Partial')

/* SQL text to insert entity field value with ID 2a7bcdd5-a4f7-42dc-98e4-b194049ad491 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('2a7bcdd5-a4f7-42dc-98e4-b194049ad491', '5119FA60-11C8-4794-BB2E-02322B58B4EF', 5, 'Present', 'Present')

/* SQL text to update ValueListType for entity field ID 5119FA60-11C8-4794-BB2E-02322B58B4EF */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='5119FA60-11C8-4794-BB2E-02322B58B4EF'

/* SQL text to insert entity field value with ID ea755353-d51e-46ee-a3f2-d5ff42604d06 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('ea755353-d51e-46ee-a3f2-d5ff42604d06', '6F3BFCC9-192C-45EA-87BA-D45ECE6A6C87', 1, 'Critical', 'Critical')

/* SQL text to insert entity field value with ID 5012b05c-05f3-44eb-ba39-102f84aeb347 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('5012b05c-05f3-44eb-ba39-102f84aeb347', '6F3BFCC9-192C-45EA-87BA-D45ECE6A6C87', 2, 'High', 'High')

/* SQL text to insert entity field value with ID 2bea8fc0-7a8b-43d8-9543-b0cea7ecab85 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('2bea8fc0-7a8b-43d8-9543-b0cea7ecab85', '6F3BFCC9-192C-45EA-87BA-D45ECE6A6C87', 3, 'Low', 'Low')

/* SQL text to insert entity field value with ID 8c6724ac-f7f0-4608-bfba-dc16d8825e55 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('8c6724ac-f7f0-4608-bfba-dc16d8825e55', '6F3BFCC9-192C-45EA-87BA-D45ECE6A6C87', 4, 'Medium', 'Medium')

/* SQL text to update ValueListType for entity field ID 6F3BFCC9-192C-45EA-87BA-D45ECE6A6C87 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='6F3BFCC9-192C-45EA-87BA-D45ECE6A6C87'

/* SQL text to insert entity field value with ID f848e75e-ace3-4f2b-9628-ed5cd4dc86d1 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('f848e75e-ace3-4f2b-9628-ed5cd4dc86d1', 'BFE76D7E-9DDA-4141-9716-1F2862662033', 1, 'Blocked', 'Blocked')

/* SQL text to insert entity field value with ID 6614775a-1f25-4a1a-9cf9-5bc620ee0411 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('6614775a-1f25-4a1a-9cf9-5bc620ee0411', 'BFE76D7E-9DDA-4141-9716-1F2862662033', 2, 'Cancelled', 'Cancelled')

/* SQL text to insert entity field value with ID 157db338-8189-4fe9-becf-47255eee1395 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('157db338-8189-4fe9-becf-47255eee1395', 'BFE76D7E-9DDA-4141-9716-1F2862662033', 3, 'Completed', 'Completed')

/* SQL text to insert entity field value with ID f0bf7ea9-6001-46da-918d-1504550beae2 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('f0bf7ea9-6001-46da-918d-1504550beae2', 'BFE76D7E-9DDA-4141-9716-1F2862662033', 4, 'InProgress', 'InProgress')

/* SQL text to insert entity field value with ID 9342051b-0a0a-4ce4-b1ba-7d8fe97e91c1 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('9342051b-0a0a-4ce4-b1ba-7d8fe97e91c1', 'BFE76D7E-9DDA-4141-9716-1F2862662033', 5, 'Open', 'Open')

/* SQL text to update ValueListType for entity field ID BFE76D7E-9DDA-4141-9716-1F2862662033 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='BFE76D7E-9DDA-4141-9716-1F2862662033'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'fdd0f228-44cb-414f-a8bf-3762fa20e552'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('fdd0f228-44cb-414f-a8bf-3762fa20e552', '70EE1893-7455-413B-B93C-12024D443526', '7F183366-C757-4C8F-882D-61CC33C21B03', 'RoleID', 'One To Many', 1, 1, 'Memberships', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'f25eea72-af39-4c2b-9a00-497c7922c374'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('f25eea72-af39-4c2b-9a00-497c7922c374', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '7F183366-C757-4C8F-882D-61CC33C21B03', 'UserID', 'One To Many', 1, 1, 'Memberships', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '8e71ab71-b0cd-4bec-a5d1-fddaa4c54c56'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('8e71ab71-b0cd-4bec-a5d1-fddaa4c54c56', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A', 'PresenterUserID', 'One To Many', 1, 1, 'Agenda Items', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '0faee731-28c5-499b-9304-f06ed60cdb61'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('0faee731-28c5-499b-9304-f06ed60cdb61', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '56020639-D9E0-4736-86FB-FDA8FCA455F8', 'AssignedToUserID', 'One To Many', 1, 1, 'Action Items', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'c5624ce9-72c0-4073-a1ed-18cd9b277b1a'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('c5624ce9-72c0-4073-a1ed-18cd9b277b1a', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '56020639-D9E0-4736-86FB-FDA8FCA455F8', 'AssignedByUserID', 'One To Many', 1, 1, 'Action Items', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '5fcf53f7-9700-42c9-9587-0c206b4f989b'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('5fcf53f7-9700-42c9-9587-0c206b4f989b', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '21AE7024-58E8-49DC-8C4D-FE271898FFB5', 'UserID', 'One To Many', 1, 1, 'Attendances', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '141b0d7c-a2ad-406a-98b1-e85f976beef9'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('141b0d7c-a2ad-406a-98b1-e85f976beef9', '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943', '247F6B12-54AE-45F2-ABDD-D171B5E89CE7', 'CommitteeID', 'One To Many', 1, 1, 'Meetings', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '70b68961-465c-4171-afca-6628bca1536e'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('70b68961-465c-4171-afca-6628bca1536e', '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943', '50AEC50C-B2EB-4A3B-84FD-F99059DE954F', 'CommitteeID', 'One To Many', 1, 1, 'Terms', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '6fc3fccc-c374-4451-9532-d639254eff00'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('6fc3fccc-c374-4451-9532-d639254eff00', '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943', '56020639-D9E0-4736-86FB-FDA8FCA455F8', 'CommitteeID', 'One To Many', 1, 1, 'Action Items', 3);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '72c78f96-d52e-4381-9743-175ed07795a0'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('72c78f96-d52e-4381-9743-175ed07795a0', '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943', '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943', 'ParentCommitteeID', 'One To Many', 1, 1, 'Committees', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'aa7d07fc-2cf7-4111-887b-8aa8d26b5fb0'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('aa7d07fc-2cf7-4111-887b-8aa8d26b5fb0', '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943', '7F183366-C757-4C8F-882D-61CC33C21B03', 'CommitteeID', 'One To Many', 1, 1, 'Memberships', 3);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '9c2aefef-40f8-478c-8ed1-841d2dbc7760'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('9c2aefef-40f8-478c-8ed1-841d2dbc7760', '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A', '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A', 'ParentAgendaItemID', 'One To Many', 1, 1, 'Agenda Items', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '490c0882-5ff0-41d4-a061-5726da7d9127'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('490c0882-5ff0-41d4-a061-5726da7d9127', '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A', '56020639-D9E0-4736-86FB-FDA8FCA455F8', 'AgendaItemID', 'One To Many', 1, 1, 'Action Items', 4);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '15153c51-341f-4c82-9730-40caecf7d5d0'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('15153c51-341f-4c82-9730-40caecf7d5d0', '7BA2BB9F-E004-46C5-AFE1-A41E8BE8A4DC', '5D0E3A93-3A50-4754-8DAD-7D1FE7D22943', 'TypeID', 'One To Many', 1, 1, 'Committees', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'db426576-6bdd-41c1-9011-b5fe1a88eadd'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('db426576-6bdd-41c1-9011-b5fe1a88eadd', '247F6B12-54AE-45F2-ABDD-D171B5E89CE7', '3AABC390-69D2-44C0-B1E2-7DF00CCBF96A', 'MeetingID', 'One To Many', 1, 1, 'Agenda Items', 3);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'a4b45027-25e8-4af3-85e8-6736fb5b7097'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('a4b45027-25e8-4af3-85e8-6736fb5b7097', '247F6B12-54AE-45F2-ABDD-D171B5E89CE7', '56020639-D9E0-4736-86FB-FDA8FCA455F8', 'MeetingID', 'One To Many', 1, 1, 'Action Items', 5);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '1b735da7-436b-4408-b2ff-e702553c8cd1'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('1b735da7-436b-4408-b2ff-e702553c8cd1', '247F6B12-54AE-45F2-ABDD-D171B5E89CE7', '21AE7024-58E8-49DC-8C4D-FE271898FFB5', 'MeetingID', 'One To Many', 1, 1, 'Attendances', 2);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'e109a40a-8e29-4f5b-bec7-6aa7e9732367'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('e109a40a-8e29-4f5b-bec7-6aa7e9732367', '50AEC50C-B2EB-4A3B-84FD-F99059DE954F', '7F183366-C757-4C8F-882D-61CC33C21B03', 'TermID', 'One To Many', 1, 1, 'Memberships', 4);
   END
                              

/* Index for Foreign Keys for ActionItem */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Action Items
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CommitteeID in table ActionItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActionItem_CommitteeID' 
    AND object_id = OBJECT_ID('[Committees].[ActionItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActionItem_CommitteeID ON [Committees].[ActionItem] ([CommitteeID]);

-- Index for foreign key MeetingID in table ActionItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActionItem_MeetingID' 
    AND object_id = OBJECT_ID('[Committees].[ActionItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActionItem_MeetingID ON [Committees].[ActionItem] ([MeetingID]);

-- Index for foreign key AgendaItemID in table ActionItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActionItem_AgendaItemID' 
    AND object_id = OBJECT_ID('[Committees].[ActionItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActionItem_AgendaItemID ON [Committees].[ActionItem] ([AgendaItemID]);

-- Index for foreign key AssignedToUserID in table ActionItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActionItem_AssignedToUserID' 
    AND object_id = OBJECT_ID('[Committees].[ActionItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActionItem_AssignedToUserID ON [Committees].[ActionItem] ([AssignedToUserID]);

-- Index for foreign key AssignedByUserID in table ActionItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ActionItem_AssignedByUserID' 
    AND object_id = OBJECT_ID('[Committees].[ActionItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ActionItem_AssignedByUserID ON [Committees].[ActionItem] ([AssignedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID 8D465232-3C85-4AA0-AB77-875869928690 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='8D465232-3C85-4AA0-AB77-875869928690',
         @RelatedEntityNameFieldMap='Committee'

/* Index for Foreign Keys for AgendaItem */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Agenda Items
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key MeetingID in table AgendaItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AgendaItem_MeetingID' 
    AND object_id = OBJECT_ID('[Committees].[AgendaItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AgendaItem_MeetingID ON [Committees].[AgendaItem] ([MeetingID]);

-- Index for foreign key ParentAgendaItemID in table AgendaItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AgendaItem_ParentAgendaItemID' 
    AND object_id = OBJECT_ID('[Committees].[AgendaItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AgendaItem_ParentAgendaItemID ON [Committees].[AgendaItem] ([ParentAgendaItemID]);

-- Index for foreign key PresenterUserID in table AgendaItem
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AgendaItem_PresenterUserID' 
    AND object_id = OBJECT_ID('[Committees].[AgendaItem]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AgendaItem_PresenterUserID ON [Committees].[AgendaItem] ([PresenterUserID]);

/* Root ID Function SQL for Agenda Items.ParentAgendaItemID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Agenda Items
-- Item: fnAgendaItemParentAgendaItemID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AgendaItem].[ParentAgendaItemID]
------------------------------------------------------------
IF OBJECT_ID('[Committees].[fnAgendaItemParentAgendaItemID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [Committees].[fnAgendaItemParentAgendaItemID_GetRootID];
GO

CREATE FUNCTION [Committees].[fnAgendaItemParentAgendaItemID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        -- Anchor: Start from @ParentID if not null, otherwise start from @RecordID
        SELECT
            [ID],
            [ParentAgendaItemID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [Committees].[AgendaItem]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentAgendaItemID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c.[ID],
            c.[ParentAgendaItemID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [Committees].[AgendaItem] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentAgendaItemID]
        WHERE
            p.[Depth] < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentAgendaItemID] IS NULL
    ORDER BY
        [RootParentID]
);
GO


/* SQL text to update entity field related entity name field map for entity field ID 852A11E3-D4C5-4F9E-A9EC-CB42D1462BC9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='852A11E3-D4C5-4F9E-A9EC-CB42D1462BC9',
         @RelatedEntityNameFieldMap='PresenterUser'

/* Index for Foreign Keys for Attendance */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Attendances
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key MeetingID in table Attendance
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Attendance_MeetingID' 
    AND object_id = OBJECT_ID('[Committees].[Attendance]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Attendance_MeetingID ON [Committees].[Attendance] ([MeetingID]);

-- Index for foreign key UserID in table Attendance
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Attendance_UserID' 
    AND object_id = OBJECT_ID('[Committees].[Attendance]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Attendance_UserID ON [Committees].[Attendance] ([UserID]);

/* SQL text to update entity field related entity name field map for entity field ID A3DAB4A7-6DBE-4272-8C3D-BF9D8501F150 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A3DAB4A7-6DBE-4272-8C3D-BF9D8501F150',
         @RelatedEntityNameFieldMap='User'

/* Index for Foreign Keys for Committee */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committees
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TypeID in table Committee
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Committee_TypeID' 
    AND object_id = OBJECT_ID('[Committees].[Committee]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Committee_TypeID ON [Committees].[Committee] ([TypeID]);

-- Index for foreign key ParentCommitteeID in table Committee
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Committee_ParentCommitteeID' 
    AND object_id = OBJECT_ID('[Committees].[Committee]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Committee_ParentCommitteeID ON [Committees].[Committee] ([ParentCommitteeID]);

/* Root ID Function SQL for Committees.ParentCommitteeID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committees
-- Item: fnCommitteeParentCommitteeID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [Committee].[ParentCommitteeID]
------------------------------------------------------------
IF OBJECT_ID('[Committees].[fnCommitteeParentCommitteeID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [Committees].[fnCommitteeParentCommitteeID_GetRootID];
GO

CREATE FUNCTION [Committees].[fnCommitteeParentCommitteeID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        -- Anchor: Start from @ParentID if not null, otherwise start from @RecordID
        SELECT
            [ID],
            [ParentCommitteeID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [Committees].[Committee]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentCommitteeID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c.[ID],
            c.[ParentCommitteeID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [Committees].[Committee] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentCommitteeID]
        WHERE
            p.[Depth] < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentCommitteeID] IS NULL
    ORDER BY
        [RootParentID]
);
GO


/* SQL text to update entity field related entity name field map for entity field ID 7ACAA6B2-7CD0-40B9-B892-2264C8556842 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7ACAA6B2-7CD0-40B9-B892-2264C8556842',
         @RelatedEntityNameFieldMap='Type'

/* SQL text to update entity field related entity name field map for entity field ID 354955E1-AC5C-49EE-91EB-58558CBC23A4 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='354955E1-AC5C-49EE-91EB-58558CBC23A4',
         @RelatedEntityNameFieldMap='ParentCommittee'

/* SQL text to update entity field related entity name field map for entity field ID 6F66586B-0592-4054-AAAB-B8C12DCADD46 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6F66586B-0592-4054-AAAB-B8C12DCADD46',
         @RelatedEntityNameFieldMap='AssignedToUser'

/* Base View SQL for Attendances */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Attendances
-- Item: vwAttendances
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Attendances
-----               SCHEMA:      Committees
-----               BASE TABLE:  Attendance
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Committees].[vwAttendances]', 'V') IS NOT NULL
    DROP VIEW [Committees].[vwAttendances];
GO

CREATE VIEW [Committees].[vwAttendances]
AS
SELECT
    a.*,
    User_UserID.[Name] AS [User]
FROM
    [Committees].[Attendance] AS a
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [a].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [Committees].[vwAttendances] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Attendances */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Attendances
-- Item: Permissions for vwAttendances
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Committees].[vwAttendances] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Attendances */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Attendances
-- Item: spCreateAttendance
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Attendance
------------------------------------------------------------
IF OBJECT_ID('[Committees].[spCreateAttendance]', 'P') IS NOT NULL
    DROP PROCEDURE [Committees].[spCreateAttendance];
GO

CREATE PROCEDURE [Committees].[spCreateAttendance]
    @ID uniqueidentifier = NULL,
    @MeetingID uniqueidentifier,
    @UserID uniqueidentifier,
    @AttendanceStatus nvarchar(50) = NULL,
    @JoinedAt datetimeoffset,
    @LeftAt datetimeoffset,
    @Notes nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Committees].[Attendance]
            (
                [ID],
                [MeetingID],
                [UserID],
                [AttendanceStatus],
                [JoinedAt],
                [LeftAt],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @MeetingID,
                @UserID,
                ISNULL(@AttendanceStatus, 'Expected'),
                @JoinedAt,
                @LeftAt,
                @Notes
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Committees].[Attendance]
            (
                [MeetingID],
                [UserID],
                [AttendanceStatus],
                [JoinedAt],
                [LeftAt],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @MeetingID,
                @UserID,
                ISNULL(@AttendanceStatus, 'Expected'),
                @JoinedAt,
                @LeftAt,
                @Notes
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Committees].[vwAttendances] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Committees].[spCreateAttendance] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Attendances */

GRANT EXECUTE ON [Committees].[spCreateAttendance] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Attendances */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Attendances
-- Item: spUpdateAttendance
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Attendance
------------------------------------------------------------
IF OBJECT_ID('[Committees].[spUpdateAttendance]', 'P') IS NOT NULL
    DROP PROCEDURE [Committees].[spUpdateAttendance];
GO

CREATE PROCEDURE [Committees].[spUpdateAttendance]
    @ID uniqueidentifier,
    @MeetingID uniqueidentifier,
    @UserID uniqueidentifier,
    @AttendanceStatus nvarchar(50),
    @JoinedAt datetimeoffset,
    @LeftAt datetimeoffset,
    @Notes nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Committees].[Attendance]
    SET
        [MeetingID] = @MeetingID,
        [UserID] = @UserID,
        [AttendanceStatus] = @AttendanceStatus,
        [JoinedAt] = @JoinedAt,
        [LeftAt] = @LeftAt,
        [Notes] = @Notes
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Committees].[vwAttendances] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Committees].[vwAttendances]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Committees].[spUpdateAttendance] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Attendance table
------------------------------------------------------------
IF OBJECT_ID('[Committees].[trgUpdateAttendance]', 'TR') IS NOT NULL
    DROP TRIGGER [Committees].[trgUpdateAttendance];
GO
CREATE TRIGGER [Committees].trgUpdateAttendance
ON [Committees].[Attendance]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Committees].[Attendance]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Committees].[Attendance] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Attendances */

GRANT EXECUTE ON [Committees].[spUpdateAttendance] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Attendances */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Attendances
-- Item: spDeleteAttendance
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Attendance
------------------------------------------------------------
IF OBJECT_ID('[Committees].[spDeleteAttendance]', 'P') IS NOT NULL
    DROP PROCEDURE [Committees].[spDeleteAttendance];
GO

CREATE PROCEDURE [Committees].[spDeleteAttendance]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Committees].[Attendance]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Committees].[spDeleteAttendance] TO [cdp_Integration]
    

/* spDelete Permissions for Attendances */

GRANT EXECUTE ON [Committees].[spDeleteAttendance] TO [cdp_Integration]



/* Base View SQL for Agenda Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Agenda Items
-- Item: vwAgendaItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Agenda Items
-----               SCHEMA:      Committees
-----               BASE TABLE:  AgendaItem
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Committees].[vwAgendaItems]', 'V') IS NOT NULL
    DROP VIEW [Committees].[vwAgendaItems];
GO

CREATE VIEW [Committees].[vwAgendaItems]
AS
SELECT
    a.*,
    User_PresenterUserID.[Name] AS [PresenterUser],
    root_ParentAgendaItemID.RootID AS [RootParentAgendaItemID]
FROM
    [Committees].[AgendaItem] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_PresenterUserID
  ON
    [a].[PresenterUserID] = User_PresenterUserID.[ID]
OUTER APPLY
    [Committees].[fnAgendaItemParentAgendaItemID_GetRootID]([a].[ID], [a].[ParentAgendaItemID]) AS root_ParentAgendaItemID
GO
GRANT SELECT ON [Committees].[vwAgendaItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Agenda Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Agenda Items
-- Item: Permissions for vwAgendaItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Committees].[vwAgendaItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Agenda Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Agenda Items
-- Item: spCreateAgendaItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AgendaItem
------------------------------------------------------------
IF OBJECT_ID('[Committees].[spCreateAgendaItem]', 'P') IS NOT NULL
    DROP PROCEDURE [Committees].[spCreateAgendaItem];
GO

CREATE PROCEDURE [Committees].[spCreateAgendaItem]
    @ID uniqueidentifier = NULL,
    @MeetingID uniqueidentifier,
    @ParentAgendaItemID uniqueidentifier,
    @Sequence int,
    @Title nvarchar(255),
    @Description nvarchar(MAX),
    @PresenterUserID uniqueidentifier,
    @DurationMinutes int,
    @ItemType nvarchar(50) = NULL,
    @RelatedDocumentURL nvarchar(1000),
    @Status nvarchar(50) = NULL,
    @Notes nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Committees].[AgendaItem]
            (
                [ID],
                [MeetingID],
                [ParentAgendaItemID],
                [Sequence],
                [Title],
                [Description],
                [PresenterUserID],
                [DurationMinutes],
                [ItemType],
                [RelatedDocumentURL],
                [Status],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @MeetingID,
                @ParentAgendaItemID,
                @Sequence,
                @Title,
                @Description,
                @PresenterUserID,
                @DurationMinutes,
                ISNULL(@ItemType, 'Discussion'),
                @RelatedDocumentURL,
                ISNULL(@Status, 'Pending'),
                @Notes
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Committees].[AgendaItem]
            (
                [MeetingID],
                [ParentAgendaItemID],
                [Sequence],
                [Title],
                [Description],
                [PresenterUserID],
                [DurationMinutes],
                [ItemType],
                [RelatedDocumentURL],
                [Status],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @MeetingID,
                @ParentAgendaItemID,
                @Sequence,
                @Title,
                @Description,
                @PresenterUserID,
                @DurationMinutes,
                ISNULL(@ItemType, 'Discussion'),
                @RelatedDocumentURL,
                ISNULL(@Status, 'Pending'),
                @Notes
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Committees].[vwAgendaItems] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Committees].[spCreateAgendaItem] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Agenda Items */

GRANT EXECUTE ON [Committees].[spCreateAgendaItem] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Agenda Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Agenda Items
-- Item: spUpdateAgendaItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AgendaItem
------------------------------------------------------------
IF OBJECT_ID('[Committees].[spUpdateAgendaItem]', 'P') IS NOT NULL
    DROP PROCEDURE [Committees].[spUpdateAgendaItem];
GO

CREATE PROCEDURE [Committees].[spUpdateAgendaItem]
    @ID uniqueidentifier,
    @MeetingID uniqueidentifier,
    @ParentAgendaItemID uniqueidentifier,
    @Sequence int,
    @Title nvarchar(255),
    @Description nvarchar(MAX),
    @PresenterUserID uniqueidentifier,
    @DurationMinutes int,
    @ItemType nvarchar(50),
    @RelatedDocumentURL nvarchar(1000),
    @Status nvarchar(50),
    @Notes nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Committees].[AgendaItem]
    SET
        [MeetingID] = @MeetingID,
        [ParentAgendaItemID] = @ParentAgendaItemID,
        [Sequence] = @Sequence,
        [Title] = @Title,
        [Description] = @Description,
        [PresenterUserID] = @PresenterUserID,
        [DurationMinutes] = @DurationMinutes,
        [ItemType] = @ItemType,
        [RelatedDocumentURL] = @RelatedDocumentURL,
        [Status] = @Status,
        [Notes] = @Notes
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Committees].[vwAgendaItems] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Committees].[vwAgendaItems]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Committees].[spUpdateAgendaItem] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AgendaItem table
------------------------------------------------------------
IF OBJECT_ID('[Committees].[trgUpdateAgendaItem]', 'TR') IS NOT NULL
    DROP TRIGGER [Committees].[trgUpdateAgendaItem];
GO
CREATE TRIGGER [Committees].trgUpdateAgendaItem
ON [Committees].[AgendaItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Committees].[AgendaItem]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Committees].[AgendaItem] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Agenda Items */

GRANT EXECUTE ON [Committees].[spUpdateAgendaItem] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Agenda Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Agenda Items
-- Item: spDeleteAgendaItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AgendaItem
------------------------------------------------------------
IF OBJECT_ID('[Committees].[spDeleteAgendaItem]', 'P') IS NOT NULL
    DROP PROCEDURE [Committees].[spDeleteAgendaItem];
GO

CREATE PROCEDURE [Committees].[spDeleteAgendaItem]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Committees].[AgendaItem]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Committees].[spDeleteAgendaItem] TO [cdp_Integration]
    

/* spDelete Permissions for Agenda Items */

GRANT EXECUTE ON [Committees].[spDeleteAgendaItem] TO [cdp_Integration]



/* Base View SQL for Committees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committees
-- Item: vwCommittees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Committees
-----               SCHEMA:      Committees
-----               BASE TABLE:  Committee
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Committees].[vwCommittees]', 'V') IS NOT NULL
    DROP VIEW [Committees].[vwCommittees];
GO

CREATE VIEW [Committees].[vwCommittees]
AS
SELECT
    c.*,
    Type_TypeID.[Name] AS [Type],
    Committee_ParentCommitteeID.[Name] AS [ParentCommittee],
    root_ParentCommitteeID.RootID AS [RootParentCommitteeID]
FROM
    [Committees].[Committee] AS c
INNER JOIN
    [Committees].[Type] AS Type_TypeID
  ON
    [c].[TypeID] = Type_TypeID.[ID]
LEFT OUTER JOIN
    [Committees].[Committee] AS Committee_ParentCommitteeID
  ON
    [c].[ParentCommitteeID] = Committee_ParentCommitteeID.[ID]
OUTER APPLY
    [Committees].[fnCommitteeParentCommitteeID_GetRootID]([c].[ID], [c].[ParentCommitteeID]) AS root_ParentCommitteeID
GO
GRANT SELECT ON [Committees].[vwCommittees] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Committees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committees
-- Item: Permissions for vwCommittees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Committees].[vwCommittees] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Committees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committees
-- Item: spCreateCommittee
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Committee
------------------------------------------------------------
IF OBJECT_ID('[Committees].[spCreateCommittee]', 'P') IS NOT NULL
    DROP PROCEDURE [Committees].[spCreateCommittee];
GO

CREATE PROCEDURE [Committees].[spCreateCommittee]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @TypeID uniqueidentifier,
    @ParentCommitteeID uniqueidentifier,
    @OrganizationID uniqueidentifier,
    @CharterDocumentURL nvarchar(1000),
    @MissionStatement nvarchar(MAX),
    @Status nvarchar(50) = NULL,
    @IsPublic bit = NULL,
    @FormationDate date,
    @DissolutionDate date
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Committees].[Committee]
            (
                [ID],
                [Name],
                [Description],
                [TypeID],
                [ParentCommitteeID],
                [OrganizationID],
                [CharterDocumentURL],
                [MissionStatement],
                [Status],
                [IsPublic],
                [FormationDate],
                [DissolutionDate]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @TypeID,
                @ParentCommitteeID,
                @OrganizationID,
                @CharterDocumentURL,
                @MissionStatement,
                ISNULL(@Status, 'Active'),
                ISNULL(@IsPublic, 1),
                @FormationDate,
                @DissolutionDate
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Committees].[Committee]
            (
                [Name],
                [Description],
                [TypeID],
                [ParentCommitteeID],
                [OrganizationID],
                [CharterDocumentURL],
                [MissionStatement],
                [Status],
                [IsPublic],
                [FormationDate],
                [DissolutionDate]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @TypeID,
                @ParentCommitteeID,
                @OrganizationID,
                @CharterDocumentURL,
                @MissionStatement,
                ISNULL(@Status, 'Active'),
                ISNULL(@IsPublic, 1),
                @FormationDate,
                @DissolutionDate
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Committees].[vwCommittees] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Committees].[spCreateCommittee] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Committees */

GRANT EXECUTE ON [Committees].[spCreateCommittee] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Committees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committees
-- Item: spUpdateCommittee
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Committee
------------------------------------------------------------
IF OBJECT_ID('[Committees].[spUpdateCommittee]', 'P') IS NOT NULL
    DROP PROCEDURE [Committees].[spUpdateCommittee];
GO

CREATE PROCEDURE [Committees].[spUpdateCommittee]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @TypeID uniqueidentifier,
    @ParentCommitteeID uniqueidentifier,
    @OrganizationID uniqueidentifier,
    @CharterDocumentURL nvarchar(1000),
    @MissionStatement nvarchar(MAX),
    @Status nvarchar(50),
    @IsPublic bit,
    @FormationDate date,
    @DissolutionDate date
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Committees].[Committee]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [TypeID] = @TypeID,
        [ParentCommitteeID] = @ParentCommitteeID,
        [OrganizationID] = @OrganizationID,
        [CharterDocumentURL] = @CharterDocumentURL,
        [MissionStatement] = @MissionStatement,
        [Status] = @Status,
        [IsPublic] = @IsPublic,
        [FormationDate] = @FormationDate,
        [DissolutionDate] = @DissolutionDate
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Committees].[vwCommittees] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Committees].[vwCommittees]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Committees].[spUpdateCommittee] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Committee table
------------------------------------------------------------
IF OBJECT_ID('[Committees].[trgUpdateCommittee]', 'TR') IS NOT NULL
    DROP TRIGGER [Committees].[trgUpdateCommittee];
GO
CREATE TRIGGER [Committees].trgUpdateCommittee
ON [Committees].[Committee]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Committees].[Committee]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Committees].[Committee] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Committees */

GRANT EXECUTE ON [Committees].[spUpdateCommittee] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Committees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Committees
-- Item: spDeleteCommittee
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Committee
------------------------------------------------------------
IF OBJECT_ID('[Committees].[spDeleteCommittee]', 'P') IS NOT NULL
    DROP PROCEDURE [Committees].[spDeleteCommittee];
GO

CREATE PROCEDURE [Committees].[spDeleteCommittee]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Committees].[Committee]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Committees].[spDeleteCommittee] TO [cdp_Integration]
    

/* spDelete Permissions for Committees */

GRANT EXECUTE ON [Committees].[spDeleteCommittee] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 88C59C48-3232-473C-863F-1284224A54CC */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='88C59C48-3232-473C-863F-1284224A54CC',
         @RelatedEntityNameFieldMap='AssignedByUser'

/* Base View SQL for Action Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Action Items
-- Item: vwActionItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Action Items
-----               SCHEMA:      Committees
-----               BASE TABLE:  ActionItem
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Committees].[vwActionItems]', 'V') IS NOT NULL
    DROP VIEW [Committees].[vwActionItems];
GO

CREATE VIEW [Committees].[vwActionItems]
AS
SELECT
    a.*,
    Committee_CommitteeID.[Name] AS [Committee],
    User_AssignedToUserID.[Name] AS [AssignedToUser],
    User_AssignedByUserID.[Name] AS [AssignedByUser]
FROM
    [Committees].[ActionItem] AS a
INNER JOIN
    [Committees].[Committee] AS Committee_CommitteeID
  ON
    [a].[CommitteeID] = Committee_CommitteeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_AssignedToUserID
  ON
    [a].[AssignedToUserID] = User_AssignedToUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_AssignedByUserID
  ON
    [a].[AssignedByUserID] = User_AssignedByUserID.[ID]
GO
GRANT SELECT ON [Committees].[vwActionItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Action Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Action Items
-- Item: Permissions for vwActionItems
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Committees].[vwActionItems] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Action Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Action Items
-- Item: spCreateActionItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ActionItem
------------------------------------------------------------
IF OBJECT_ID('[Committees].[spCreateActionItem]', 'P') IS NOT NULL
    DROP PROCEDURE [Committees].[spCreateActionItem];
GO

CREATE PROCEDURE [Committees].[spCreateActionItem]
    @ID uniqueidentifier = NULL,
    @CommitteeID uniqueidentifier,
    @MeetingID uniqueidentifier,
    @AgendaItemID uniqueidentifier,
    @Title nvarchar(255),
    @Description nvarchar(MAX),
    @AssignedToUserID uniqueidentifier,
    @AssignedByUserID uniqueidentifier,
    @DueDate date,
    @Priority nvarchar(20) = NULL,
    @Status nvarchar(50) = NULL,
    @CompletedAt datetimeoffset,
    @CompletionNotes nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Committees].[ActionItem]
            (
                [ID],
                [CommitteeID],
                [MeetingID],
                [AgendaItemID],
                [Title],
                [Description],
                [AssignedToUserID],
                [AssignedByUserID],
                [DueDate],
                [Priority],
                [Status],
                [CompletedAt],
                [CompletionNotes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CommitteeID,
                @MeetingID,
                @AgendaItemID,
                @Title,
                @Description,
                @AssignedToUserID,
                @AssignedByUserID,
                @DueDate,
                ISNULL(@Priority, 'Medium'),
                ISNULL(@Status, 'Open'),
                @CompletedAt,
                @CompletionNotes
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Committees].[ActionItem]
            (
                [CommitteeID],
                [MeetingID],
                [AgendaItemID],
                [Title],
                [Description],
                [AssignedToUserID],
                [AssignedByUserID],
                [DueDate],
                [Priority],
                [Status],
                [CompletedAt],
                [CompletionNotes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CommitteeID,
                @MeetingID,
                @AgendaItemID,
                @Title,
                @Description,
                @AssignedToUserID,
                @AssignedByUserID,
                @DueDate,
                ISNULL(@Priority, 'Medium'),
                ISNULL(@Status, 'Open'),
                @CompletedAt,
                @CompletionNotes
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Committees].[vwActionItems] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Committees].[spCreateActionItem] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Action Items */

GRANT EXECUTE ON [Committees].[spCreateActionItem] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Action Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Action Items
-- Item: spUpdateActionItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ActionItem
------------------------------------------------------------
IF OBJECT_ID('[Committees].[spUpdateActionItem]', 'P') IS NOT NULL
    DROP PROCEDURE [Committees].[spUpdateActionItem];
GO

CREATE PROCEDURE [Committees].[spUpdateActionItem]
    @ID uniqueidentifier,
    @CommitteeID uniqueidentifier,
    @MeetingID uniqueidentifier,
    @AgendaItemID uniqueidentifier,
    @Title nvarchar(255),
    @Description nvarchar(MAX),
    @AssignedToUserID uniqueidentifier,
    @AssignedByUserID uniqueidentifier,
    @DueDate date,
    @Priority nvarchar(20),
    @Status nvarchar(50),
    @CompletedAt datetimeoffset,
    @CompletionNotes nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Committees].[ActionItem]
    SET
        [CommitteeID] = @CommitteeID,
        [MeetingID] = @MeetingID,
        [AgendaItemID] = @AgendaItemID,
        [Title] = @Title,
        [Description] = @Description,
        [AssignedToUserID] = @AssignedToUserID,
        [AssignedByUserID] = @AssignedByUserID,
        [DueDate] = @DueDate,
        [Priority] = @Priority,
        [Status] = @Status,
        [CompletedAt] = @CompletedAt,
        [CompletionNotes] = @CompletionNotes
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Committees].[vwActionItems] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Committees].[vwActionItems]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Committees].[spUpdateActionItem] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ActionItem table
------------------------------------------------------------
IF OBJECT_ID('[Committees].[trgUpdateActionItem]', 'TR') IS NOT NULL
    DROP TRIGGER [Committees].[trgUpdateActionItem];
GO
CREATE TRIGGER [Committees].trgUpdateActionItem
ON [Committees].[ActionItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Committees].[ActionItem]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Committees].[ActionItem] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Action Items */

GRANT EXECUTE ON [Committees].[spUpdateActionItem] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Action Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Action Items
-- Item: spDeleteActionItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ActionItem
------------------------------------------------------------
IF OBJECT_ID('[Committees].[spDeleteActionItem]', 'P') IS NOT NULL
    DROP PROCEDURE [Committees].[spDeleteActionItem];
GO

CREATE PROCEDURE [Committees].[spDeleteActionItem]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Committees].[ActionItem]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Committees].[spDeleteActionItem] TO [cdp_Integration]
    

/* spDelete Permissions for Action Items */

GRANT EXECUTE ON [Committees].[spDeleteActionItem] TO [cdp_Integration]



/* Index for Foreign Keys for Meeting */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Meetings
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CommitteeID in table Meeting
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Meeting_CommitteeID' 
    AND object_id = OBJECT_ID('[Committees].[Meeting]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Meeting_CommitteeID ON [Committees].[Meeting] ([CommitteeID]);

/* SQL text to update entity field related entity name field map for entity field ID 216ED028-F439-4470-87EC-CEE9701C2DED */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='216ED028-F439-4470-87EC-CEE9701C2DED',
         @RelatedEntityNameFieldMap='Committee'

/* Index for Foreign Keys for Membership */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Memberships
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CommitteeID in table Membership
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Membership_CommitteeID' 
    AND object_id = OBJECT_ID('[Committees].[Membership]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Membership_CommitteeID ON [Committees].[Membership] ([CommitteeID]);

-- Index for foreign key UserID in table Membership
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Membership_UserID' 
    AND object_id = OBJECT_ID('[Committees].[Membership]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Membership_UserID ON [Committees].[Membership] ([UserID]);

-- Index for foreign key RoleID in table Membership
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Membership_RoleID' 
    AND object_id = OBJECT_ID('[Committees].[Membership]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Membership_RoleID ON [Committees].[Membership] ([RoleID]);

-- Index for foreign key TermID in table Membership
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Membership_TermID' 
    AND object_id = OBJECT_ID('[Committees].[Membership]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Membership_TermID ON [Committees].[Membership] ([TermID]);

/* SQL text to update entity field related entity name field map for entity field ID A428C03B-D880-4DE2-989B-C2BDA9F02D14 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A428C03B-D880-4DE2-989B-C2BDA9F02D14',
         @RelatedEntityNameFieldMap='Committee'

/* Index for Foreign Keys for Role */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Roles__Committees
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for Term */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Terms
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CommitteeID in table Term
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Term_CommitteeID' 
    AND object_id = OBJECT_ID('[Committees].[Term]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Term_CommitteeID ON [Committees].[Term] ([CommitteeID]);

/* SQL text to update entity field related entity name field map for entity field ID 6C12AC8B-1249-4045-B718-5824E283351F */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6C12AC8B-1249-4045-B718-5824E283351F',
         @RelatedEntityNameFieldMap='Committee'

/* Index for Foreign Keys for Type */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for Roles__Committees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Roles__Committees
-- Item: vwRoles__Committees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Roles__Committees
-----               SCHEMA:      Committees
-----               BASE TABLE:  Role
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Committees].[vwRoles__Committees]', 'V') IS NOT NULL
    DROP VIEW [Committees].[vwRoles__Committees];
GO

CREATE VIEW [Committees].[vwRoles__Committees]
AS
SELECT
    r.*
FROM
    [Committees].[Role] AS r
GO
GRANT SELECT ON [Committees].[vwRoles__Committees] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Roles__Committees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Roles__Committees
-- Item: Permissions for vwRoles__Committees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Committees].[vwRoles__Committees] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Roles__Committees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Roles__Committees
-- Item: spCreateRole__Committees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Role
------------------------------------------------------------
IF OBJECT_ID('[Committees].[spCreateRole__Committees]', 'P') IS NOT NULL
    DROP PROCEDURE [Committees].[spCreateRole__Committees];
GO

CREATE PROCEDURE [Committees].[spCreateRole__Committees]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @IsOfficer bit = NULL,
    @IsVotingRole bit = NULL,
    @DefaultPermissionsJSON nvarchar(MAX),
    @Sequence int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Committees].[Role]
            (
                [ID],
                [Name],
                [Description],
                [IsOfficer],
                [IsVotingRole],
                [DefaultPermissionsJSON],
                [Sequence]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                ISNULL(@IsOfficer, 0),
                ISNULL(@IsVotingRole, 1),
                @DefaultPermissionsJSON,
                ISNULL(@Sequence, 100)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Committees].[Role]
            (
                [Name],
                [Description],
                [IsOfficer],
                [IsVotingRole],
                [DefaultPermissionsJSON],
                [Sequence]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                ISNULL(@IsOfficer, 0),
                ISNULL(@IsVotingRole, 1),
                @DefaultPermissionsJSON,
                ISNULL(@Sequence, 100)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Committees].[vwRoles__Committees] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Committees].[spCreateRole__Committees] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Roles__Committees */

GRANT EXECUTE ON [Committees].[spCreateRole__Committees] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Roles__Committees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Roles__Committees
-- Item: spUpdateRole__Committees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Role
------------------------------------------------------------
IF OBJECT_ID('[Committees].[spUpdateRole__Committees]', 'P') IS NOT NULL
    DROP PROCEDURE [Committees].[spUpdateRole__Committees];
GO

CREATE PROCEDURE [Committees].[spUpdateRole__Committees]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @IsOfficer bit,
    @IsVotingRole bit,
    @DefaultPermissionsJSON nvarchar(MAX),
    @Sequence int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Committees].[Role]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [IsOfficer] = @IsOfficer,
        [IsVotingRole] = @IsVotingRole,
        [DefaultPermissionsJSON] = @DefaultPermissionsJSON,
        [Sequence] = @Sequence
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Committees].[vwRoles__Committees] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Committees].[vwRoles__Committees]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Committees].[spUpdateRole__Committees] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Role table
------------------------------------------------------------
IF OBJECT_ID('[Committees].[trgUpdateRole__Committees]', 'TR') IS NOT NULL
    DROP TRIGGER [Committees].[trgUpdateRole__Committees];
GO
CREATE TRIGGER [Committees].trgUpdateRole__Committees
ON [Committees].[Role]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Committees].[Role]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Committees].[Role] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Roles__Committees */

GRANT EXECUTE ON [Committees].[spUpdateRole__Committees] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Roles__Committees */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Roles__Committees
-- Item: spDeleteRole__Committees
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Role
------------------------------------------------------------
IF OBJECT_ID('[Committees].[spDeleteRole__Committees]', 'P') IS NOT NULL
    DROP PROCEDURE [Committees].[spDeleteRole__Committees];
GO

CREATE PROCEDURE [Committees].[spDeleteRole__Committees]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Committees].[Role]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Committees].[spDeleteRole__Committees] TO [cdp_Integration]
    

/* spDelete Permissions for Roles__Committees */

GRANT EXECUTE ON [Committees].[spDeleteRole__Committees] TO [cdp_Integration]



/* Base View SQL for Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Types
-- Item: vwTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Types
-----               SCHEMA:      Committees
-----               BASE TABLE:  Type
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Committees].[vwTypes]', 'V') IS NOT NULL
    DROP VIEW [Committees].[vwTypes];
GO

CREATE VIEW [Committees].[vwTypes]
AS
SELECT
    t.*
FROM
    [Committees].[Type] AS t
GO
GRANT SELECT ON [Committees].[vwTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Types
-- Item: Permissions for vwTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Committees].[vwTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Types
-- Item: spCreateType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Type
------------------------------------------------------------
IF OBJECT_ID('[Committees].[spCreateType]', 'P') IS NOT NULL
    DROP PROCEDURE [Committees].[spCreateType];
GO

CREATE PROCEDURE [Committees].[spCreateType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @IsStandards bit = NULL,
    @DefaultTermMonths int,
    @IconClass nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Committees].[Type]
            (
                [ID],
                [Name],
                [Description],
                [IsStandards],
                [DefaultTermMonths],
                [IconClass]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                ISNULL(@IsStandards, 0),
                @DefaultTermMonths,
                @IconClass
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Committees].[Type]
            (
                [Name],
                [Description],
                [IsStandards],
                [DefaultTermMonths],
                [IconClass]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                ISNULL(@IsStandards, 0),
                @DefaultTermMonths,
                @IconClass
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Committees].[vwTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Committees].[spCreateType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Types */

GRANT EXECUTE ON [Committees].[spCreateType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Types
-- Item: spUpdateType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Type
------------------------------------------------------------
IF OBJECT_ID('[Committees].[spUpdateType]', 'P') IS NOT NULL
    DROP PROCEDURE [Committees].[spUpdateType];
GO

CREATE PROCEDURE [Committees].[spUpdateType]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @IsStandards bit,
    @DefaultTermMonths int,
    @IconClass nvarchar(100)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Committees].[Type]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [IsStandards] = @IsStandards,
        [DefaultTermMonths] = @DefaultTermMonths,
        [IconClass] = @IconClass
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Committees].[vwTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Committees].[vwTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Committees].[spUpdateType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Type table
------------------------------------------------------------
IF OBJECT_ID('[Committees].[trgUpdateType]', 'TR') IS NOT NULL
    DROP TRIGGER [Committees].[trgUpdateType];
GO
CREATE TRIGGER [Committees].trgUpdateType
ON [Committees].[Type]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Committees].[Type]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Committees].[Type] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Types */

GRANT EXECUTE ON [Committees].[spUpdateType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Types
-- Item: spDeleteType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Type
------------------------------------------------------------
IF OBJECT_ID('[Committees].[spDeleteType]', 'P') IS NOT NULL
    DROP PROCEDURE [Committees].[spDeleteType];
GO

CREATE PROCEDURE [Committees].[spDeleteType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Committees].[Type]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Committees].[spDeleteType] TO [cdp_Integration]
    

/* spDelete Permissions for Types */

GRANT EXECUTE ON [Committees].[spDeleteType] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 405542CE-A250-4FC2-9A86-55869638C7DD */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='405542CE-A250-4FC2-9A86-55869638C7DD',
         @RelatedEntityNameFieldMap='User'

/* Base View SQL for Meetings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Meetings
-- Item: vwMeetings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Meetings
-----               SCHEMA:      Committees
-----               BASE TABLE:  Meeting
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Committees].[vwMeetings]', 'V') IS NOT NULL
    DROP VIEW [Committees].[vwMeetings];
GO

CREATE VIEW [Committees].[vwMeetings]
AS
SELECT
    m.*,
    Committee_CommitteeID.[Name] AS [Committee]
FROM
    [Committees].[Meeting] AS m
INNER JOIN
    [Committees].[Committee] AS Committee_CommitteeID
  ON
    [m].[CommitteeID] = Committee_CommitteeID.[ID]
GO
GRANT SELECT ON [Committees].[vwMeetings] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Meetings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Meetings
-- Item: Permissions for vwMeetings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Committees].[vwMeetings] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Meetings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Meetings
-- Item: spCreateMeeting
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Meeting
------------------------------------------------------------
IF OBJECT_ID('[Committees].[spCreateMeeting]', 'P') IS NOT NULL
    DROP PROCEDURE [Committees].[spCreateMeeting];
GO

CREATE PROCEDURE [Committees].[spCreateMeeting]
    @ID uniqueidentifier = NULL,
    @CommitteeID uniqueidentifier,
    @Title nvarchar(255),
    @Description nvarchar(MAX),
    @StartDateTime datetimeoffset,
    @EndDateTime datetimeoffset,
    @TimeZone nvarchar(50) = NULL,
    @LocationType nvarchar(50) = NULL,
    @LocationText nvarchar(500),
    @VideoProvider nvarchar(50),
    @VideoMeetingID nvarchar(255),
    @VideoJoinURL nvarchar(1000),
    @VideoRecordingURL nvarchar(1000),
    @TranscriptURL nvarchar(1000),
    @Status nvarchar(50) = NULL,
    @CalendarEventID nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Committees].[Meeting]
            (
                [ID],
                [CommitteeID],
                [Title],
                [Description],
                [StartDateTime],
                [EndDateTime],
                [TimeZone],
                [LocationType],
                [LocationText],
                [VideoProvider],
                [VideoMeetingID],
                [VideoJoinURL],
                [VideoRecordingURL],
                [TranscriptURL],
                [Status],
                [CalendarEventID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CommitteeID,
                @Title,
                @Description,
                @StartDateTime,
                @EndDateTime,
                ISNULL(@TimeZone, 'America/New_York'),
                ISNULL(@LocationType, 'Virtual'),
                @LocationText,
                @VideoProvider,
                @VideoMeetingID,
                @VideoJoinURL,
                @VideoRecordingURL,
                @TranscriptURL,
                ISNULL(@Status, 'Scheduled'),
                @CalendarEventID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Committees].[Meeting]
            (
                [CommitteeID],
                [Title],
                [Description],
                [StartDateTime],
                [EndDateTime],
                [TimeZone],
                [LocationType],
                [LocationText],
                [VideoProvider],
                [VideoMeetingID],
                [VideoJoinURL],
                [VideoRecordingURL],
                [TranscriptURL],
                [Status],
                [CalendarEventID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CommitteeID,
                @Title,
                @Description,
                @StartDateTime,
                @EndDateTime,
                ISNULL(@TimeZone, 'America/New_York'),
                ISNULL(@LocationType, 'Virtual'),
                @LocationText,
                @VideoProvider,
                @VideoMeetingID,
                @VideoJoinURL,
                @VideoRecordingURL,
                @TranscriptURL,
                ISNULL(@Status, 'Scheduled'),
                @CalendarEventID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Committees].[vwMeetings] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Committees].[spCreateMeeting] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Meetings */

GRANT EXECUTE ON [Committees].[spCreateMeeting] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Meetings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Meetings
-- Item: spUpdateMeeting
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Meeting
------------------------------------------------------------
IF OBJECT_ID('[Committees].[spUpdateMeeting]', 'P') IS NOT NULL
    DROP PROCEDURE [Committees].[spUpdateMeeting];
GO

CREATE PROCEDURE [Committees].[spUpdateMeeting]
    @ID uniqueidentifier,
    @CommitteeID uniqueidentifier,
    @Title nvarchar(255),
    @Description nvarchar(MAX),
    @StartDateTime datetimeoffset,
    @EndDateTime datetimeoffset,
    @TimeZone nvarchar(50),
    @LocationType nvarchar(50),
    @LocationText nvarchar(500),
    @VideoProvider nvarchar(50),
    @VideoMeetingID nvarchar(255),
    @VideoJoinURL nvarchar(1000),
    @VideoRecordingURL nvarchar(1000),
    @TranscriptURL nvarchar(1000),
    @Status nvarchar(50),
    @CalendarEventID nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Committees].[Meeting]
    SET
        [CommitteeID] = @CommitteeID,
        [Title] = @Title,
        [Description] = @Description,
        [StartDateTime] = @StartDateTime,
        [EndDateTime] = @EndDateTime,
        [TimeZone] = @TimeZone,
        [LocationType] = @LocationType,
        [LocationText] = @LocationText,
        [VideoProvider] = @VideoProvider,
        [VideoMeetingID] = @VideoMeetingID,
        [VideoJoinURL] = @VideoJoinURL,
        [VideoRecordingURL] = @VideoRecordingURL,
        [TranscriptURL] = @TranscriptURL,
        [Status] = @Status,
        [CalendarEventID] = @CalendarEventID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Committees].[vwMeetings] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Committees].[vwMeetings]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Committees].[spUpdateMeeting] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Meeting table
------------------------------------------------------------
IF OBJECT_ID('[Committees].[trgUpdateMeeting]', 'TR') IS NOT NULL
    DROP TRIGGER [Committees].[trgUpdateMeeting];
GO
CREATE TRIGGER [Committees].trgUpdateMeeting
ON [Committees].[Meeting]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Committees].[Meeting]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Committees].[Meeting] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Meetings */

GRANT EXECUTE ON [Committees].[spUpdateMeeting] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Meetings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Meetings
-- Item: spDeleteMeeting
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Meeting
------------------------------------------------------------
IF OBJECT_ID('[Committees].[spDeleteMeeting]', 'P') IS NOT NULL
    DROP PROCEDURE [Committees].[spDeleteMeeting];
GO

CREATE PROCEDURE [Committees].[spDeleteMeeting]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Committees].[Meeting]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Committees].[spDeleteMeeting] TO [cdp_Integration]
    

/* spDelete Permissions for Meetings */

GRANT EXECUTE ON [Committees].[spDeleteMeeting] TO [cdp_Integration]



/* Base View SQL for Terms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Terms
-- Item: vwTerms
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Terms
-----               SCHEMA:      Committees
-----               BASE TABLE:  Term
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Committees].[vwTerms]', 'V') IS NOT NULL
    DROP VIEW [Committees].[vwTerms];
GO

CREATE VIEW [Committees].[vwTerms]
AS
SELECT
    t.*,
    Committee_CommitteeID.[Name] AS [Committee]
FROM
    [Committees].[Term] AS t
INNER JOIN
    [Committees].[Committee] AS Committee_CommitteeID
  ON
    [t].[CommitteeID] = Committee_CommitteeID.[ID]
GO
GRANT SELECT ON [Committees].[vwTerms] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Terms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Terms
-- Item: Permissions for vwTerms
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Committees].[vwTerms] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Terms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Terms
-- Item: spCreateTerm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Term
------------------------------------------------------------
IF OBJECT_ID('[Committees].[spCreateTerm]', 'P') IS NOT NULL
    DROP PROCEDURE [Committees].[spCreateTerm];
GO

CREATE PROCEDURE [Committees].[spCreateTerm]
    @ID uniqueidentifier = NULL,
    @CommitteeID uniqueidentifier,
    @Name nvarchar(100),
    @StartDate date,
    @EndDate date,
    @Status nvarchar(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Committees].[Term]
            (
                [ID],
                [CommitteeID],
                [Name],
                [StartDate],
                [EndDate],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CommitteeID,
                @Name,
                @StartDate,
                @EndDate,
                ISNULL(@Status, 'Active')
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Committees].[Term]
            (
                [CommitteeID],
                [Name],
                [StartDate],
                [EndDate],
                [Status]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CommitteeID,
                @Name,
                @StartDate,
                @EndDate,
                ISNULL(@Status, 'Active')
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Committees].[vwTerms] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Committees].[spCreateTerm] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Terms */

GRANT EXECUTE ON [Committees].[spCreateTerm] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Terms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Terms
-- Item: spUpdateTerm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Term
------------------------------------------------------------
IF OBJECT_ID('[Committees].[spUpdateTerm]', 'P') IS NOT NULL
    DROP PROCEDURE [Committees].[spUpdateTerm];
GO

CREATE PROCEDURE [Committees].[spUpdateTerm]
    @ID uniqueidentifier,
    @CommitteeID uniqueidentifier,
    @Name nvarchar(100),
    @StartDate date,
    @EndDate date,
    @Status nvarchar(50)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Committees].[Term]
    SET
        [CommitteeID] = @CommitteeID,
        [Name] = @Name,
        [StartDate] = @StartDate,
        [EndDate] = @EndDate,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Committees].[vwTerms] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Committees].[vwTerms]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Committees].[spUpdateTerm] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Term table
------------------------------------------------------------
IF OBJECT_ID('[Committees].[trgUpdateTerm]', 'TR') IS NOT NULL
    DROP TRIGGER [Committees].[trgUpdateTerm];
GO
CREATE TRIGGER [Committees].trgUpdateTerm
ON [Committees].[Term]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Committees].[Term]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Committees].[Term] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Terms */

GRANT EXECUTE ON [Committees].[spUpdateTerm] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Terms */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Terms
-- Item: spDeleteTerm
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Term
------------------------------------------------------------
IF OBJECT_ID('[Committees].[spDeleteTerm]', 'P') IS NOT NULL
    DROP PROCEDURE [Committees].[spDeleteTerm];
GO

CREATE PROCEDURE [Committees].[spDeleteTerm]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Committees].[Term]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Committees].[spDeleteTerm] TO [cdp_Integration]
    

/* spDelete Permissions for Terms */

GRANT EXECUTE ON [Committees].[spDeleteTerm] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 29AC1D20-9311-4284-9966-C0000066A464 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='29AC1D20-9311-4284-9966-C0000066A464',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID FE86AEB4-2458-4C39-BDB4-B5396F38A771 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='FE86AEB4-2458-4C39-BDB4-B5396F38A771',
         @RelatedEntityNameFieldMap='Term'

/* Base View SQL for Memberships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Memberships
-- Item: vwMemberships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Memberships
-----               SCHEMA:      Committees
-----               BASE TABLE:  Membership
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[Committees].[vwMemberships]', 'V') IS NOT NULL
    DROP VIEW [Committees].[vwMemberships];
GO

CREATE VIEW [Committees].[vwMemberships]
AS
SELECT
    m.*,
    Committee_CommitteeID.[Name] AS [Committee],
    User_UserID.[Name] AS [User],
    Role__Committees_RoleID.[Name] AS [Role],
    Term_TermID.[Name] AS [Term]
FROM
    [Committees].[Membership] AS m
INNER JOIN
    [Committees].[Committee] AS Committee_CommitteeID
  ON
    [m].[CommitteeID] = Committee_CommitteeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [m].[UserID] = User_UserID.[ID]
INNER JOIN
    [Committees].[Role] AS Role__Committees_RoleID
  ON
    [m].[RoleID] = Role__Committees_RoleID.[ID]
LEFT OUTER JOIN
    [Committees].[Term] AS Term_TermID
  ON
    [m].[TermID] = Term_TermID.[ID]
GO
GRANT SELECT ON [Committees].[vwMemberships] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for Memberships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Memberships
-- Item: Permissions for vwMemberships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [Committees].[vwMemberships] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for Memberships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Memberships
-- Item: spCreateMembership
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Membership
------------------------------------------------------------
IF OBJECT_ID('[Committees].[spCreateMembership]', 'P') IS NOT NULL
    DROP PROCEDURE [Committees].[spCreateMembership];
GO

CREATE PROCEDURE [Committees].[spCreateMembership]
    @ID uniqueidentifier = NULL,
    @CommitteeID uniqueidentifier,
    @UserID uniqueidentifier,
    @RoleID uniqueidentifier,
    @TermID uniqueidentifier,
    @StartDate date,
    @EndDate date,
    @Status nvarchar(50) = NULL,
    @EndReason nvarchar(100),
    @Notes nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [Committees].[Membership]
            (
                [ID],
                [CommitteeID],
                [UserID],
                [RoleID],
                [TermID],
                [StartDate],
                [EndDate],
                [Status],
                [EndReason],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CommitteeID,
                @UserID,
                @RoleID,
                @TermID,
                @StartDate,
                @EndDate,
                ISNULL(@Status, 'Active'),
                @EndReason,
                @Notes
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [Committees].[Membership]
            (
                [CommitteeID],
                [UserID],
                [RoleID],
                [TermID],
                [StartDate],
                [EndDate],
                [Status],
                [EndReason],
                [Notes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CommitteeID,
                @UserID,
                @RoleID,
                @TermID,
                @StartDate,
                @EndDate,
                ISNULL(@Status, 'Active'),
                @EndReason,
                @Notes
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [Committees].[vwMemberships] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [Committees].[spCreateMembership] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for Memberships */

GRANT EXECUTE ON [Committees].[spCreateMembership] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Memberships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Memberships
-- Item: spUpdateMembership
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Membership
------------------------------------------------------------
IF OBJECT_ID('[Committees].[spUpdateMembership]', 'P') IS NOT NULL
    DROP PROCEDURE [Committees].[spUpdateMembership];
GO

CREATE PROCEDURE [Committees].[spUpdateMembership]
    @ID uniqueidentifier,
    @CommitteeID uniqueidentifier,
    @UserID uniqueidentifier,
    @RoleID uniqueidentifier,
    @TermID uniqueidentifier,
    @StartDate date,
    @EndDate date,
    @Status nvarchar(50),
    @EndReason nvarchar(100),
    @Notes nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Committees].[Membership]
    SET
        [CommitteeID] = @CommitteeID,
        [UserID] = @UserID,
        [RoleID] = @RoleID,
        [TermID] = @TermID,
        [StartDate] = @StartDate,
        [EndDate] = @EndDate,
        [Status] = @Status,
        [EndReason] = @EndReason,
        [Notes] = @Notes
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [Committees].[vwMemberships] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [Committees].[vwMemberships]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [Committees].[spUpdateMembership] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Membership table
------------------------------------------------------------
IF OBJECT_ID('[Committees].[trgUpdateMembership]', 'TR') IS NOT NULL
    DROP TRIGGER [Committees].[trgUpdateMembership];
GO
CREATE TRIGGER [Committees].trgUpdateMembership
ON [Committees].[Membership]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [Committees].[Membership]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [Committees].[Membership] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Memberships */

GRANT EXECUTE ON [Committees].[spUpdateMembership] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Memberships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Memberships
-- Item: spDeleteMembership
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Membership
------------------------------------------------------------
IF OBJECT_ID('[Committees].[spDeleteMembership]', 'P') IS NOT NULL
    DROP PROCEDURE [Committees].[spDeleteMembership];
GO

CREATE PROCEDURE [Committees].[spDeleteMembership]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [Committees].[Membership]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [Committees].[spDeleteMembership] TO [cdp_Integration]
    

/* spDelete Permissions for Memberships */

GRANT EXECUTE ON [Committees].[spDeleteMembership] TO [cdp_Integration]



