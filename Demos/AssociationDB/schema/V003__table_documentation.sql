/******************************************************************************
 * Association Sample Database - Consolidated Table Documentation
 * File: V003__table_documentation.sql
 *
 * Extended properties (documentation) for all AssociationDemo schema tables.
 * All tables are consolidated into the unified AssociationDemo schema.
 ******************************************************************************/

-- ============================================================================
-- Schema Documentation
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unified schema for association management system including membership, events, learning, finance, marketing, email communications, chapters, and governance',
    @level0type = N'SCHEMA',
    @level0name = 'AssociationDemo';


-- ============================================================================
-- MEMBERSHIP DOMAIN
-- ============================================================================

-- ============================================================================
-- Extended properties for Organization
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Organizations and companies that are associated with the association',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Organization';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Company or organization name',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Organization',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Primary industry or sector',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Organization',
    @level2type = N'COLUMN', @level2name = 'Industry';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Number of employees',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Organization',
    @level2type = N'COLUMN', @level2name = 'EmployeeCount';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Annual revenue in USD',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Organization',
    @level2type = N'COLUMN', @level2name = 'AnnualRevenue';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Market capitalization in USD (for public companies)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Organization',
    @level2type = N'COLUMN', @level2name = 'MarketCapitalization';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Stock ticker symbol (for public companies)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Organization',
    @level2type = N'COLUMN', @level2name = 'TickerSymbol';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Stock exchange (NYSE, NASDAQ, etc. for public companies)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Organization',
    @level2type = N'COLUMN', @level2name = 'Exchange';


-- ============================================================================
-- Extended properties for MembershipType
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Types of memberships offered by the association',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'MembershipType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Name of membership type (e.g., Individual, Corporate, Student)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'MembershipType',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Annual membership dues amount',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'MembershipType',
    @level2type = N'COLUMN', @level2name = 'AnnualDues';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Number of months until renewal (typically 12)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'MembershipType',
    @level2type = N'COLUMN', @level2name = 'RenewalPeriodMonths';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether members can set up automatic renewal',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'MembershipType',
    @level2type = N'COLUMN', @level2name = 'AllowAutoRenew';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether membership requires staff approval',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'MembershipType',
    @level2type = N'COLUMN', @level2name = 'RequiresApproval';


-- ============================================================================
-- Extended properties for Member
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Individual members of the association',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Member';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Primary email address (unique)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Member',
    @level2type = N'COLUMN', @level2name = 'Email';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member first name',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Member',
    @level2type = N'COLUMN', @level2name = 'FirstName';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member last name',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Member',
    @level2type = N'COLUMN', @level2name = 'LastName';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Job title',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Member',
    @level2type = N'COLUMN', @level2name = 'Title';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Associated organization (if applicable)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Member',
    @level2type = N'COLUMN', @level2name = 'OrganizationID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date member joined the association',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Member',
    @level2type = N'COLUMN', @level2name = 'JoinDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Calculated engagement score based on activity',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Member',
    @level2type = N'COLUMN', @level2name = 'EngagementScore';


-- ============================================================================
-- Extended properties for Membership
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Membership records tracking member subscriptions and renewals',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Membership';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member who holds this membership',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Membership',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Type of membership',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Membership',
    @level2type = N'COLUMN', @level2name = 'MembershipTypeID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Current status: Active, Pending, Lapsed, Suspended, or Cancelled',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Membership',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Membership start date',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Membership',
    @level2type = N'COLUMN', @level2name = 'StartDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Membership end/expiration date',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Membership',
    @level2type = N'COLUMN', @level2name = 'EndDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether membership will automatically renew',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Membership',
    @level2type = N'COLUMN', @level2name = 'AutoRenew';


-- ============================================================================
-- EVENTS DOMAIN
-- ============================================================================

-- ============================================================================
-- Extended properties for Event
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Events organized by the association including conferences, webinars, and meetings',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Event name or title',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Type of event: Conference, Webinar, Workshop, Chapter Meeting, Virtual Summit, or Networking',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'EventType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Event start date and time',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'StartDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Event end date and time',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'EndDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether event is held virtually',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'IsVirtual';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Virtual platform used (Zoom, Teams, etc.)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'VirtualPlatform';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Maximum number of attendees',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'Capacity';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Continuing Education Unit credits offered',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'CEUCredits';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Current event status: Draft, Published, Registration Open, Sold Out, In Progress, Completed, or Cancelled',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Event timezone (e.g., America/New_York, America/Chicago)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'Timezone';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Physical location or address of event',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'Location';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'URL for virtual event meeting',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'MeetingURL';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Associated chapter for chapter-specific events',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'ChapterID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date when event registration opens',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'RegistrationOpenDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date when event registration closes',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'RegistrationCloseDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Base registration fee (deprecated - use MemberPrice/NonMemberPrice instead)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'RegistrationFee';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Registration price for association members. Invoices are automatically generated for event registrations using this price for members.',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'MemberPrice';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Registration price for non-members (higher than MemberPrice to incentivize membership)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'NonMemberPrice';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Event description and details',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Event',
    @level2type = N'COLUMN', @level2name = 'Description';


-- ============================================================================
-- Extended properties for EventSession
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Individual sessions within multi-track events',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EventSession';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Parent event',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EventSession',
    @level2type = N'COLUMN', @level2name = 'EventID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Session name or title',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EventSession',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Session type (Keynote, Workshop, Panel, etc.)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EventSession',
    @level2type = N'COLUMN', @level2name = 'SessionType';


-- ============================================================================
-- Extended properties for EventRegistration
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member registrations and attendance tracking for events',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EventRegistration';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Event being registered for',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EventRegistration',
    @level2type = N'COLUMN', @level2name = 'EventID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member registering for the event',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EventRegistration',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date and time of registration',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EventRegistration',
    @level2type = N'COLUMN', @level2name = 'RegistrationDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Type of registration (Early Bird, Standard, Late, etc.)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EventRegistration',
    @level2type = N'COLUMN', @level2name = 'RegistrationType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Registration status: Registered, Waitlisted, Attended, No Show, or Cancelled',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EventRegistration',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Time attendee checked in to the event',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EventRegistration',
    @level2type = N'COLUMN', @level2name = 'CheckInTime';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether CEU credits were awarded',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EventRegistration',
    @level2type = N'COLUMN', @level2name = 'CEUAwarded';


-- ============================================================================
-- LEARNING DOMAIN
-- ============================================================================

-- ============================================================================
-- Extended properties for Course
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Educational courses and certification programs offered by the association',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Course';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Unique course code',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'Code';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Course title',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'Title';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Course difficulty level: Beginner, Intermediate, Advanced, or Expert',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'Level';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Estimated duration in hours',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'DurationHours';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Continuing Education Unit credits awarded',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'CEUCredits';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Standard price for non-members',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'Price';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Discounted price for members',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'MemberPrice';


-- ============================================================================
-- Extended properties for Enrollment
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member course enrollments and progress tracking',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Enrollment';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Course being taken',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'CourseID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member taking the course',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date member enrolled',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'EnrollmentDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Enrollment status: Enrolled, In Progress, Completed, Failed, Withdrawn, or Expired',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Course completion progress (0-100%)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'ProgressPercentage';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Final exam or assessment score',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'FinalScore';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether the member passed the course',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'Passed';


-- ============================================================================
-- Extended properties for Certificate
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Completion certificates issued to members',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Certificate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Course enrollment this certificate is for',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Certificate',
    @level2type = N'COLUMN', @level2name = 'EnrollmentID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Unique certificate number',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Certificate',
    @level2type = N'COLUMN', @level2name = 'CertificateNumber';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date certificate was issued',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Certificate',
    @level2type = N'COLUMN', @level2name = 'IssuedDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'URL to downloadable PDF certificate',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Certificate',
    @level2type = N'COLUMN', @level2name = 'CertificatePDFURL';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Unique verification code for authenticity checking',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Certificate',
    @level2type = N'COLUMN', @level2name = 'VerificationCode';


-- ============================================================================
-- FINANCE DOMAIN
-- ============================================================================

-- ============================================================================
-- Extended properties for Invoice
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Invoices for membership dues, event registrations, course enrollments, and other charges',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Invoice';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Unique invoice number',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Invoice',
    @level2type = N'COLUMN', @level2name = 'InvoiceNumber';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member being invoiced',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Invoice',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date invoice was created',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Invoice',
    @level2type = N'COLUMN', @level2name = 'InvoiceDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Payment due date',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Invoice',
    @level2type = N'COLUMN', @level2name = 'DueDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Subtotal before tax and discounts',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Invoice',
    @level2type = N'COLUMN', @level2name = 'SubTotal';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Total invoice amount',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Invoice',
    @level2type = N'COLUMN', @level2name = 'Total';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Amount paid to date',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Invoice',
    @level2type = N'COLUMN', @level2name = 'AmountPaid';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Remaining balance due',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Invoice',
    @level2type = N'COLUMN', @level2name = 'Balance';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Invoice status: Draft, Sent, Partial, Paid, Overdue, Cancelled, or Refunded',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Invoice',
    @level2type = N'COLUMN', @level2name = 'Status';


-- ============================================================================
-- Extended properties for InvoiceLineItem
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Detailed line items for each invoice',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'InvoiceLineItem';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Parent invoice',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'InvoiceLineItem',
    @level2type = N'COLUMN', @level2name = 'InvoiceID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Line item description',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'InvoiceLineItem',
    @level2type = N'COLUMN', @level2name = 'Description';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Type of item: Membership Dues, Event Registration, Course Enrollment, Merchandise, Donation, or Other',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'InvoiceLineItem',
    @level2type = N'COLUMN', @level2name = 'ItemType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Related entity type (Event, Course, Membership, etc.)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'InvoiceLineItem',
    @level2type = N'COLUMN', @level2name = 'RelatedEntityType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'ID of related entity (EventID, CourseID, etc.)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'InvoiceLineItem',
    @level2type = N'COLUMN', @level2name = 'RelatedEntityID';


-- ============================================================================
-- Extended properties for Payment
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Payment transactions for invoices',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Payment';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Invoice being paid',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Payment',
    @level2type = N'COLUMN', @level2name = 'InvoiceID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date payment was initiated',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Payment',
    @level2type = N'COLUMN', @level2name = 'PaymentDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Payment amount',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Payment',
    @level2type = N'COLUMN', @level2name = 'Amount';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Payment method: Credit Card, ACH, Check, Wire, PayPal, Stripe, or Cash',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Payment',
    @level2type = N'COLUMN', @level2name = 'PaymentMethod';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'External payment provider transaction ID',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Payment',
    @level2type = N'COLUMN', @level2name = 'TransactionID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Payment status: Pending, Completed, Failed, Refunded, or Cancelled',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Payment',
    @level2type = N'COLUMN', @level2name = 'Status';


-- ============================================================================
-- MARKETING DOMAIN
-- ============================================================================

-- ============================================================================
-- Extended properties for Campaign
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Marketing campaigns and promotional initiatives',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Campaign';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Campaign name',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Campaign',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Campaign type: Email, Event Promotion, Membership Renewal, Course Launch, Donation Drive, or Member Engagement',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Campaign',
    @level2type = N'COLUMN', @level2name = 'CampaignType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Campaign status: Draft, Scheduled, Active, Completed, or Cancelled',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Campaign',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Campaign start date',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Campaign',
    @level2type = N'COLUMN', @level2name = 'StartDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Campaign end date',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Campaign',
    @level2type = N'COLUMN', @level2name = 'EndDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Budgeted amount for campaign',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Campaign',
    @level2type = N'COLUMN', @level2name = 'Budget';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Actual cost incurred',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Campaign',
    @level2type = N'COLUMN', @level2name = 'ActualCost';


-- ============================================================================
-- Extended properties for Segment
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member segmentation for targeted marketing',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Segment';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Segment name',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Segment',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Segment type (Industry, Geography, Engagement, Membership Type, etc.)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Segment',
    @level2type = N'COLUMN', @level2name = 'SegmentType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Filter criteria (JSON or SQL WHERE clause)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Segment',
    @level2type = N'COLUMN', @level2name = 'FilterCriteria';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Number of members matching this segment',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Segment',
    @level2type = N'COLUMN', @level2name = 'MemberCount';


-- ============================================================================
-- Extended properties for CampaignMember
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Members targeted by marketing campaigns',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CampaignMember';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Campaign targeting this member',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CampaignMember',
    @level2type = N'COLUMN', @level2name = 'CampaignID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member being targeted',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CampaignMember',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Segment this member was added through',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CampaignMember',
    @level2type = N'COLUMN', @level2name = 'SegmentID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date member was added to campaign',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CampaignMember',
    @level2type = N'COLUMN', @level2name = 'AddedDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Campaign member status: Targeted, Sent, Responded, Converted, or Opted Out',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CampaignMember',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Value of conversion (revenue generated from this campaign interaction)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CampaignMember',
    @level2type = N'COLUMN', @level2name = 'ConversionValue';


-- ============================================================================
-- EMAIL DOMAIN
-- ============================================================================

-- ============================================================================
-- Extended properties for EmailTemplate
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Reusable email templates for automated communications',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailTemplate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Template name for identification',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailTemplate',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Email subject line (may contain merge fields)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailTemplate',
    @level2type = N'COLUMN', @level2name = 'Subject';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'HTML version of email body',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailTemplate',
    @level2type = N'COLUMN', @level2name = 'HtmlBody';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Plain text version of email body',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailTemplate',
    @level2type = N'COLUMN', @level2name = 'TextBody';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Template category (Welcome, Renewal, Event, Newsletter, etc.)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailTemplate',
    @level2type = N'COLUMN', @level2name = 'Category';


-- ============================================================================
-- Extended properties for EmailSend
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Individual email send tracking with delivery and engagement metrics',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailSend';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Template used for this email',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'TemplateID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Campaign this email is part of',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'CampaignID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member receiving the email',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date email was sent',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'SentDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date email was delivered to inbox',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'DeliveredDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date email was first opened',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'OpenedDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Total number of opens',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'OpenCount';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date a link was first clicked',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'ClickedDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Total number of clicks',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'ClickCount';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Email status: Queued, Sent, Delivered, Opened, Clicked, Bounced, Spam, Unsubscribed, or Failed',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailSend',
    @level2type = N'COLUMN', @level2name = 'Status';


-- ============================================================================
-- Extended properties for EmailClick
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Individual click tracking for links within emails',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailClick';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Email send this click is associated with',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailClick',
    @level2type = N'COLUMN', @level2name = 'EmailSendID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date and time link was clicked',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailClick',
    @level2type = N'COLUMN', @level2name = 'ClickDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'URL that was clicked',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailClick',
    @level2type = N'COLUMN', @level2name = 'URL';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Friendly name for the link',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'EmailClick',
    @level2type = N'COLUMN', @level2name = 'LinkName';


-- ============================================================================
-- CHAPTERS DOMAIN
-- ============================================================================

-- ============================================================================
-- Extended properties for Chapter
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Local chapters and special interest groups within the association',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Chapter';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Chapter name',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Chapter',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Chapter type: Geographic, Special Interest, or Industry',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Chapter',
    @level2type = N'COLUMN', @level2name = 'ChapterType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date chapter was founded',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Chapter',
    @level2type = N'COLUMN', @level2name = 'FoundedDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'How often the chapter meets',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Chapter',
    @level2type = N'COLUMN', @level2name = 'MeetingFrequency';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Number of active members in this chapter',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Chapter',
    @level2type = N'COLUMN', @level2name = 'MemberCount';


-- ============================================================================
-- Extended properties for ChapterMembership
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member participation in local chapters',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'ChapterMembership';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Chapter this membership is for',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'ChapterMembership',
    @level2type = N'COLUMN', @level2name = 'ChapterID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member participating in chapter',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'ChapterMembership',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date member joined the chapter',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'ChapterMembership',
    @level2type = N'COLUMN', @level2name = 'JoinDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Membership status: Active or Inactive',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'ChapterMembership',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Role within chapter (Member, Officer, etc.)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'ChapterMembership',
    @level2type = N'COLUMN', @level2name = 'Role';


-- ============================================================================
-- Extended properties for ChapterOfficer
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Chapter leadership positions and officers',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'ChapterOfficer';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Chapter this officer serves',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'ChapterOfficer',
    @level2type = N'COLUMN', @level2name = 'ChapterID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member serving as officer',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'ChapterOfficer',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Officer position (President, Vice President, Secretary, etc.)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'ChapterOfficer',
    @level2type = N'COLUMN', @level2name = 'Position';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Start date of officer term',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'ChapterOfficer',
    @level2type = N'COLUMN', @level2name = 'StartDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'End date of officer term',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'ChapterOfficer',
    @level2type = N'COLUMN', @level2name = 'EndDate';


-- ============================================================================
-- GOVERNANCE DOMAIN
-- ============================================================================

-- ============================================================================
-- Extended properties for Committee
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Association committees and task forces',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Committee';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Committee name',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Committee',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Committee type: Standing, Ad Hoc, or Task Force',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Committee',
    @level2type = N'COLUMN', @level2name = 'CommitteeType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Purpose and charter of the committee',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Committee',
    @level2type = N'COLUMN', @level2name = 'Purpose';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'How often committee meets',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Committee',
    @level2type = N'COLUMN', @level2name = 'MeetingFrequency';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date committee was formed',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Committee',
    @level2type = N'COLUMN', @level2name = 'FormedDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member serving as committee chair',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Committee',
    @level2type = N'COLUMN', @level2name = 'ChairMemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Maximum number of committee members allowed',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'Committee',
    @level2type = N'COLUMN', @level2name = 'MaxMembers';


-- ============================================================================
-- Extended properties for CommitteeMembership
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Committee member assignments and roles',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CommitteeMembership';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Committee this membership is for',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CommitteeMembership',
    @level2type = N'COLUMN', @level2name = 'CommitteeID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member serving on committee',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CommitteeMembership',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Role on committee (Chair, Vice Chair, Member, etc.)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CommitteeMembership',
    @level2type = N'COLUMN', @level2name = 'Role';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Start date of committee service',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CommitteeMembership',
    @level2type = N'COLUMN', @level2name = 'StartDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'End date of committee service',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CommitteeMembership',
    @level2type = N'COLUMN', @level2name = 'EndDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Who appointed this member to the committee',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'CommitteeMembership',
    @level2type = N'COLUMN', @level2name = 'AppointedBy';


-- ============================================================================
-- Extended properties for BoardPosition
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Board of directors positions',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'BoardPosition';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Position title (President, Vice President, Treasurer, etc.)',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'BoardPosition',
    @level2type = N'COLUMN', @level2name = 'PositionTitle';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Display order for listing positions',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'BoardPosition',
    @level2type = N'COLUMN', @level2name = 'PositionOrder';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Length of term in years',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'BoardPosition',
    @level2type = N'COLUMN', @level2name = 'TermLengthYears';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether this is an officer position',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'BoardPosition',
    @level2type = N'COLUMN', @level2name = 'IsOfficer';


-- ============================================================================
-- Extended properties for BoardMember
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Current and historical board members',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'BoardMember';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Board position held',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'BoardMember',
    @level2type = N'COLUMN', @level2name = 'BoardPositionID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member serving on board',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'BoardMember',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Start date of board service',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'BoardMember',
    @level2type = N'COLUMN', @level2name = 'StartDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'End date of board service',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'BoardMember',
    @level2type = N'COLUMN', @level2name = 'EndDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date member was elected to this position',
    @level0type = N'SCHEMA', @level0name = 'AssociationDemo',
    @level1type = N'TABLE', @level1name = 'BoardMember',
    @level2type = N'COLUMN', @level2name = 'ElectionDate';
