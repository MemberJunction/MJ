/******************************************************************************
 * Association Sample Database - Learning Schema Documentation
 * File: V004__learning_documentation.sql
 *
 * Extended properties (documentation) for learning schema tables.
 * This file is separate to allow optional installation of documentation.
 ******************************************************************************/

-- ============================================================================
-- Extended properties for Course
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Educational courses and certification programs offered by the association',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Course';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Unique course code',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'Code';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Course title',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'Title';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Course difficulty level: Beginner, Intermediate, Advanced, or Expert',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'Level';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Estimated duration in hours',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'DurationHours';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Continuing Education Unit credits awarded',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'CEUCredits';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Standard price for non-members',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'Price';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Discounted price for members',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Course',
    @level2type = N'COLUMN', @level2name = 'MemberPrice';


-- ============================================================================
-- Extended properties for Enrollment
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member course enrollments and progress tracking',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Enrollment';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Course being taken',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'CourseID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Member taking the course',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date member enrolled',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'EnrollmentDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Enrollment status: Enrolled, In Progress, Completed, Failed, Withdrawn, or Expired',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'Status';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Course completion progress (0-100%)',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'ProgressPercentage';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Final exam or assessment score',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'FinalScore';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Whether the member passed the course',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Enrollment',
    @level2type = N'COLUMN', @level2name = 'Passed';


-- ============================================================================
-- Extended properties for Certificate
-- ============================================================================
EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Completion certificates issued to members',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Certificate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Course enrollment this certificate is for',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Certificate',
    @level2type = N'COLUMN', @level2name = 'EnrollmentID';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Unique certificate number',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Certificate',
    @level2type = N'COLUMN', @level2name = 'CertificateNumber';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Date certificate was issued',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Certificate',
    @level2type = N'COLUMN', @level2name = 'IssuedDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'URL to downloadable PDF certificate',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Certificate',
    @level2type = N'COLUMN', @level2name = 'CertificatePDFURL';

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Unique verification code for authenticity checking',
    @level0type = N'SCHEMA', @level0name = 'learning',
    @level1type = N'TABLE', @level1name = 'Certificate',
    @level2type = N'COLUMN', @level2name = 'VerificationCode';


PRINT 'Learning schema documentation added successfully!';

