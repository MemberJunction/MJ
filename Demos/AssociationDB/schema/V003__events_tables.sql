/******************************************************************************
 * Association Sample Database - Events Schema Tables
 * File: V003__events_tables.sql
 *
 * Creates events management tables including:
 * - Event: Conferences, webinars, workshops, meetings
 * - EventSession: Individual sessions within multi-track events
 * - EventRegistration: Member registrations and attendance tracking
 ******************************************************************************/

-- ============================================================================
-- Event Table
-- ============================================================================
CREATE TABLE [events].[Event] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(255) NOT NULL,
    [EventType] NVARCHAR(50) NOT NULL CHECK ([EventType] IN ('Conference', 'Webinar', 'Workshop', 'Chapter Meeting', 'Virtual Summit', 'Networking')),
    [StartDate] DATETIME NOT NULL,
    [EndDate] DATETIME NOT NULL,
    [Timezone] NVARCHAR(50),
    [Location] NVARCHAR(255),
    [IsVirtual] BIT NOT NULL DEFAULT 0,
    [VirtualPlatform] NVARCHAR(100),
    [MeetingURL] NVARCHAR(500),
    [ChapterID] UNIQUEIDENTIFIER,
    [Capacity] INT,
    [RegistrationOpenDate] DATETIME,
    [RegistrationCloseDate] DATETIME,
    [RegistrationFee] DECIMAL(10,2),
    [MemberPrice] DECIMAL(10,2),
    [NonMemberPrice] DECIMAL(10,2),
    [CEUCredits] DECIMAL(4,2),
    [Description] NVARCHAR(MAX),
    [Status] NVARCHAR(20) NOT NULL CHECK ([Status] IN ('Draft', 'Published', 'Registration Open', 'Sold Out', 'In Progress', 'Completed', 'Cancelled'))
);
GO

-- Create indexes for common queries
CREATE INDEX IX_Event_StartDate ON [events].[Event]([StartDate]);
CREATE INDEX IX_Event_Type ON [events].[Event]([EventType]);
CREATE INDEX IX_Event_Status ON [events].[Event]([Status]);
GO

-- Extended properties for Event
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Events organized by the association including conferences, webinars, and meetings',
    @level0type = N'SCHEMA', @level0name = 'events',
    @level1type = N'TABLE', @level1name = 'Event';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Event name or title',
    @level0type = N'SCHEMA', @level0name = 'events',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Type of event: Conference, Webinar, Workshop, Chapter Meeting, Virtual Summit, or Networking',
    @level0type = N'SCHEMA', @level0name = 'events',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'EventType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Event start date and time',
    @level0type = N'SCHEMA', @level0name = 'events',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'StartDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Event end date and time',
    @level0type = N'SCHEMA', @level0name = 'events',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'EndDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether event is held virtually',
    @level0type = N'SCHEMA', @level0name = 'events',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'IsVirtual';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Virtual platform used (Zoom, Teams, etc.)',
    @level0type = N'SCHEMA', @level0name = 'events',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'VirtualPlatform';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Maximum number of attendees',
    @level0type = N'SCHEMA', @level0name = 'events',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'Capacity';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Continuing Education Unit credits offered',
    @level0type = N'SCHEMA', @level0name = 'events',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'CEUCredits';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Current event status: Draft, Published, Registration Open, Sold Out, In Progress, Completed, or Cancelled',
    @level0type = N'SCHEMA', @level0name = 'events',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'Status';
GO

-- ============================================================================
-- EventSession Table
-- ============================================================================
CREATE TABLE [events].[EventSession] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [EventID] UNIQUEIDENTIFIER NOT NULL,
    [Name] NVARCHAR(255) NOT NULL,
    [Description] NVARCHAR(MAX),
    [StartTime] DATETIME NOT NULL,
    [EndTime] DATETIME NOT NULL,
    [Room] NVARCHAR(100),
    [SpeakerName] NVARCHAR(255),
    [SessionType] NVARCHAR(50),
    [Capacity] INT,
    [CEUCredits] DECIMAL(4,2),
    CONSTRAINT FK_EventSession_Event FOREIGN KEY ([EventID])
        REFERENCES [events].[Event]([ID])
);
GO

-- Create index for event lookups
CREATE INDEX IX_EventSession_Event ON [events].[EventSession]([EventID]);
GO

-- Extended properties for EventSession
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Individual sessions within multi-track events',
    @level0type = N'SCHEMA', @level0name = 'events',
    @level1type = N'TABLE', @level1name = 'EventSession';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Parent event',
    @level0type = N'SCHEMA', @level0name = 'events',
    @level1type = N'TABLE', @level1name = 'EventSession',
    @level2type = N'COLUMN', @level2name = 'EventID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Session name or title',
    @level0type = N'SCHEMA', @level0name = 'events',
    @level1type = N'TABLE', @level1name = 'EventSession',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Session type (Keynote, Workshop, Panel, etc.)',
    @level0type = N'SCHEMA', @level0name = 'events',
    @level1type = N'TABLE', @level1name = 'EventSession',
    @level2type = N'COLUMN', @level2name = 'SessionType';
GO

-- ============================================================================
-- EventRegistration Table
-- ============================================================================
CREATE TABLE [events].[EventRegistration] (
    [ID] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    [EventID] UNIQUEIDENTIFIER NOT NULL,
    [MemberID] UNIQUEIDENTIFIER NOT NULL,
    [RegistrationDate] DATETIME NOT NULL,
    [RegistrationType] NVARCHAR(50),
    [Status] NVARCHAR(20) NOT NULL CHECK ([Status] IN ('Registered', 'Waitlisted', 'Attended', 'No Show', 'Cancelled')),
    [CheckInTime] DATETIME,
    [InvoiceID] UNIQUEIDENTIFIER,
    [CEUAwarded] BIT NOT NULL DEFAULT 0,
    [CEUAwardedDate] DATETIME,
    [CancellationDate] DATETIME,
    [CancellationReason] NVARCHAR(MAX),
    CONSTRAINT FK_EventReg_Event FOREIGN KEY ([EventID])
        REFERENCES [events].[Event]([ID]),
    CONSTRAINT FK_EventReg_Member FOREIGN KEY ([MemberID])
        REFERENCES [membership].[Member]([ID])
);
GO

-- Create indexes for common queries
CREATE INDEX IX_EventReg_Event ON [events].[EventRegistration]([EventID]);
CREATE INDEX IX_EventReg_Member ON [events].[EventRegistration]([MemberID]);
CREATE INDEX IX_EventReg_Status ON [events].[EventRegistration]([Status]);
GO

-- Extended properties for EventRegistration
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member registrations and attendance tracking for events',
    @level0type = N'SCHEMA', @level0name = 'events',
    @level1type = N'TABLE', @level1name = 'EventRegistration';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Event being registered for',
    @level0type = N'SCHEMA', @level0name = 'events',
    @level1type = N'TABLE', @level1name = 'EventRegistration',
    @level2type = N'COLUMN', @level2name = 'EventID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member registering for the event',
    @level0type = N'SCHEMA', @level0name = 'events',
    @level1type = N'TABLE', @level1name = 'EventRegistration',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date and time of registration',
    @level0type = N'SCHEMA', @level0name = 'events',
    @level1type = N'TABLE', @level1name = 'EventRegistration',
    @level2type = N'COLUMN', @level2name = 'RegistrationDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Type of registration (Early Bird, Standard, Late, etc.)',
    @level0type = N'SCHEMA', @level0name = 'events',
    @level1type = N'TABLE', @level1name = 'EventRegistration',
    @level2type = N'COLUMN', @level2name = 'RegistrationType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Registration status: Registered, Waitlisted, Attended, No Show, or Cancelled',
    @level0type = N'SCHEMA', @level0name = 'events',
    @level1type = N'TABLE', @level1name = 'EventRegistration',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Time attendee checked in to the event',
    @level0type = N'SCHEMA', @level0name = 'events',
    @level1type = N'TABLE', @level1name = 'EventRegistration',
    @level2type = N'COLUMN', @level2name = 'CheckInTime';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether CEU credits were awarded',
    @level0type = N'SCHEMA', @level0name = 'events',
    @level1type = N'TABLE', @level1name = 'EventRegistration',
    @level2type = N'COLUMN', @level2name = 'CEUAwarded';
GO

PRINT 'Events schema tables created successfully!';
PRINT 'Tables: Event, EventSession, EventRegistration';
GO
