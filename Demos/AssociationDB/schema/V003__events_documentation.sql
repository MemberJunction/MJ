/******************************************************************************
 * Association Sample Database - Events Schema Documentation
 * File: V003__events_documentation.sql
 *
 * Extended properties (documentation) for events schema tables.
 * This file is separate to allow optional installation of documentation.
 ******************************************************************************/

-- ============================================================================
-- Extended properties for Event
-- ============================================================================
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
-- Extended properties for EventSession
-- ============================================================================
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
-- Extended properties for EventRegistration
-- ============================================================================
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

PRINT 'Events schema documentation added successfully!';
GO
