/******************************************************************************
 * Association Sample Database - Chapters Schema Documentation
 * File: V008__chapters_documentation.sql
 *
 * Extended properties (documentation) for chapters schema tables.
 * This file is separate to allow optional installation of documentation.
 ******************************************************************************/

-- ============================================================================
-- Extended properties for Chapter
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Local chapters and special interest groups within the association',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'Chapter';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Chapter name',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'Chapter',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Chapter type: Geographic, Special Interest, or Industry',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'Chapter',
    @level2type = N'COLUMN', @level2name = 'ChapterType';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date chapter was founded',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'Chapter',
    @level2type = N'COLUMN', @level2name = 'FoundedDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'How often the chapter meets',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'Chapter',
    @level2type = N'COLUMN', @level2name = 'MeetingFrequency';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Number of active members in this chapter',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'Chapter',
    @level2type = N'COLUMN', @level2name = 'MemberCount';


-- ============================================================================
-- Extended properties for ChapterMembership
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member participation in local chapters',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'ChapterMembership';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Chapter this membership is for',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'ChapterMembership',
    @level2type = N'COLUMN', @level2name = 'ChapterID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member participating in chapter',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'ChapterMembership',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date member joined the chapter',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'ChapterMembership',
    @level2type = N'COLUMN', @level2name = 'JoinDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Membership status: Active or Inactive',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'ChapterMembership',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Role within chapter (Member, Officer, etc.)',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'ChapterMembership',
    @level2type = N'COLUMN', @level2name = 'Role';


-- ============================================================================
-- Extended properties for ChapterOfficer
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Chapter leadership positions and officers',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'ChapterOfficer';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Chapter this officer serves',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'ChapterOfficer',
    @level2type = N'COLUMN', @level2name = 'ChapterID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member serving as officer',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'ChapterOfficer',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Officer position (President, Vice President, Secretary, etc.)',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'ChapterOfficer',
    @level2type = N'COLUMN', @level2name = 'Position';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Start date of officer term',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'ChapterOfficer',
    @level2type = N'COLUMN', @level2name = 'StartDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'End date of officer term',
    @level0type = N'SCHEMA', @level0name = 'chapters',
    @level1type = N'TABLE', @level1name = 'ChapterOfficer',
    @level2type = N'COLUMN', @level2name = 'EndDate';


PRINT 'Chapters schema documentation added successfully!';

