/******************************************************************************
 * Association Sample Database - Learning Data
 * File: 03_learning_data.sql
 *
 * Generates learning management data including:
 * - 60 Courses
 * - 900 Enrollments (generated programmatically)
 * - 650 Certificates (generated for completions)
 ******************************************************************************/

PRINT '================================================================';
PRINT 'POPULATING LEARNING DATA';
PRINT '=================================================================';
PRINT '';

:r data/00_parameters.sql

-- ============================================================================
-- COURSES (60 Courses across categories and levels)
-- ============================================================================

PRINT 'Inserting Courses...';

INSERT INTO [learning].[Course] (ID, Code, Title, Description, Category, Level, DurationHours, CEUCredits, Price, MemberPrice, IsActive, PublishedDate, InstructorName)
VALUES
    -- Cloud Architecture (8 courses)
    (@Course_CloudArchitect, 'CLD-301', 'Advanced Cloud Architecture Certification', 'Comprehensive cloud architecture patterns and best practices', 'Cloud', 'Advanced', 40.0, 12.0, 899.00, 699.00, 1, DATEADD(DAY, -900, @EndDate), 'Dr. Michael Chen'),
    (NEWID(), 'CLD-101', 'Cloud Fundamentals', 'Introduction to cloud computing concepts and services', 'Cloud', 'Beginner', 16.0, 4.0, 299.00, 199.00, 1, DATEADD(DAY, -1200, @EndDate), 'Sarah Williams'),
    (NEWID(), 'CLD-201', 'Cloud Security Essentials', 'Security best practices for cloud environments', 'Cloud', 'Intermediate', 24.0, 8.0, 549.00, 399.00, 1, DATEADD(DAY, -800, @EndDate), 'David Martinez'),
    (NEWID(), 'CLD-202', 'Multi-Cloud Strategy', 'Managing applications across multiple cloud providers', 'Cloud', 'Intermediate', 20.0, 6.0, 499.00, 349.00, 1, DATEADD(DAY, -600, @EndDate), 'Jennifer Lee'),
    (NEWID(), 'CLD-302', 'Cloud Cost Optimization', 'Advanced techniques for optimizing cloud spending', 'Cloud', 'Advanced', 16.0, 4.0, 449.00, 329.00, 1, DATEADD(DAY, -400, @EndDate), 'Robert Johnson'),
    (NEWID(), 'CLD-303', 'Cloud Migration Strategies', 'Enterprise cloud migration planning and execution', 'Cloud', 'Advanced', 32.0, 10.0, 799.00, 599.00, 1, DATEADD(DAY, -500, @EndDate), 'Dr. Lisa Anderson'),
    (NEWID(), 'CLD-203', 'Kubernetes Foundations', 'Container orchestration with Kubernetes', 'Cloud', 'Intermediate', 28.0, 8.0, 599.00, 449.00, 1, DATEADD(DAY, -350, @EndDate), 'James Rodriguez'),
    (NEWID(), 'CLD-304', 'Serverless Architecture', 'Building applications with serverless technologies', 'Cloud', 'Advanced', 24.0, 6.0, 649.00, 479.00, 1, DATEADD(DAY, -250, @EndDate), 'Michelle Taylor'),

    -- Cybersecurity (10 courses)
    (@Course_CyberSecurity, 'SEC-301', 'Advanced Cybersecurity Certification', 'Comprehensive cybersecurity principles and practices', 'Security', 'Advanced', 48.0, 14.0, 999.00, 749.00, 1, DATEADD(DAY, -850, @EndDate), 'Dr. David Kim'),
    (NEWID(), 'SEC-101', 'Security Fundamentals', 'Introduction to information security', 'Security', 'Beginner', 16.0, 4.0, 299.00, 199.00, 1, DATEADD(DAY, -1100, @EndDate), 'Patricia Moore'),
    (NEWID(), 'SEC-201', 'Network Security', 'Securing network infrastructure', 'Security', 'Intermediate', 24.0, 8.0, 549.00, 399.00, 1, DATEADD(DAY, -750, @EndDate), 'Christopher Jackson'),
    (NEWID(), 'SEC-202', 'Application Security', 'Secure software development practices', 'Security', 'Intermediate', 20.0, 6.0, 499.00, 349.00, 1, DATEADD(DAY, -650, @EndDate), 'Amanda Wilson'),
    (NEWID(), 'SEC-302', 'Penetration Testing', 'Ethical hacking and vulnerability assessment', 'Security', 'Advanced', 40.0, 12.0, 899.00, 679.00, 1, DATEADD(DAY, -550, @EndDate), 'Daniel Thompson'),
    (NEWID(), 'SEC-303', 'Incident Response', 'Security incident handling and forensics', 'Security', 'Advanced', 32.0, 10.0, 799.00, 599.00, 1, DATEADD(DAY, -450, @EndDate), 'Rachel Martinez'),
    (NEWID(), 'SEC-203', 'Cloud Security', 'Securing cloud environments', 'Security', 'Intermediate', 24.0, 8.0, 549.00, 399.00, 1, DATEADD(DAY, -350, @EndDate), 'Kevin Brown'),
    (NEWID(), 'SEC-304', 'Zero Trust Architecture', 'Implementing zero trust security', 'Security', 'Advanced', 28.0, 8.0, 749.00, 549.00, 1, DATEADD(DAY, -300, @EndDate), 'Lisa Davis'),
    (NEWID(), 'SEC-204', 'Identity and Access Management', 'IAM principles and implementation', 'Security', 'Intermediate', 20.0, 6.0, 499.00, 349.00, 1, DATEADD(DAY, -200, @EndDate), 'Thomas White'),
    (NEWID(), 'SEC-305', 'Security Compliance and Auditing', 'Regulatory compliance and security audits', 'Security', 'Advanced', 24.0, 6.0, 649.00, 479.00, 1, DATEADD(DAY, -150, @EndDate), 'Jennifer Miller'),

    -- Data Science & AI (10 courses)
    (@Course_DataScience, 'DAT-301', 'Advanced Data Science Certification', 'Machine learning and advanced analytics', 'Data Science', 'Advanced', 44.0, 12.0, 949.00, 719.00, 1, DATEADD(DAY, -800, @EndDate), 'Dr. Emily Rodriguez'),
    (@Course_AIFundamentals, 'AI-101', 'AI Fundamentals', 'Introduction to artificial intelligence', 'Data Science', 'Beginner', 20.0, 4.0, 349.00, 249.00, 1, DATEADD(DAY, -700, @EndDate), 'Amanda Clark'),
    (NEWID(), 'DAT-101', 'Data Analytics Basics', 'Introduction to data analysis', 'Data Science', 'Beginner', 16.0, 4.0, 299.00, 199.00, 1, DATEADD(DAY, -1000, @EndDate), 'Michael Garcia'),
    (NEWID(), 'DAT-201', 'Python for Data Science', 'Python programming for data analysis', 'Data Science', 'Intermediate', 28.0, 8.0, 599.00, 449.00, 1, DATEADD(DAY, -650, @EndDate), 'Sarah Johnson'),
    (NEWID(), 'DAT-202', 'Machine Learning Fundamentals', 'Introduction to machine learning algorithms', 'Data Science', 'Intermediate', 32.0, 10.0, 699.00, 519.00, 1, DATEADD(DAY, -550, @EndDate), 'Dr. James Patel'),
    (NEWID(), 'DAT-302', 'Deep Learning', 'Neural networks and deep learning', 'Data Science', 'Advanced', 40.0, 12.0, 899.00, 679.00, 1, DATEADD(DAY, -450, @EndDate), 'Dr. Lisa Chen'),
    (NEWID(), 'DAT-303', 'Natural Language Processing', 'NLP techniques and applications', 'Data Science', 'Advanced', 36.0, 10.0, 849.00, 629.00, 1, DATEADD(DAY, -350, @EndDate), 'Robert Taylor'),
    (NEWID(), 'DAT-203', 'Data Visualization', 'Creating effective data visualizations', 'Data Science', 'Intermediate', 20.0, 6.0, 449.00, 329.00, 1, DATEADD(DAY, -300, @EndDate), 'Michelle Lee'),
    (NEWID(), 'DAT-304', 'MLOps and Model Deployment', 'Production machine learning operations', 'Data Science', 'Advanced', 32.0, 10.0, 799.00, 599.00, 1, DATEADD(DAY, -200, @EndDate), 'David Wilson'),
    (NEWID(), 'AI-201', 'Generative AI Applications', 'Practical applications of generative AI', 'Data Science', 'Intermediate', 24.0, 6.0, 599.00, 449.00, 1, DATEADD(DAY, -100, @EndDate), 'Jennifer Martinez'),

    -- DevOps (8 courses)
    (@Course_DevOps, 'DEV-301', 'DevOps Engineering Certification', 'Advanced DevOps practices and automation', 'DevOps', 'Advanced', 40.0, 12.0, 899.00, 699.00, 1, DATEADD(DAY, -750, @EndDate), 'Kevin Martinez'),
    (NEWID(), 'DEV-101', 'DevOps Fundamentals', 'Introduction to DevOps culture and practices', 'DevOps', 'Beginner', 16.0, 4.0, 299.00, 199.00, 1, DATEADD(DAY, -950, @EndDate), 'Rachel Wilson'),
    (NEWID(), 'DEV-201', 'CI/CD Pipeline Design', 'Building continuous integration and deployment pipelines', 'DevOps', 'Intermediate', 24.0, 8.0, 549.00, 399.00, 1, DATEADD(DAY, -600, @EndDate), 'James Brown'),
    (NEWID(), 'DEV-202', 'Infrastructure as Code', 'Terraform, Ansible, and automation tools', 'DevOps', 'Intermediate', 28.0, 8.0, 599.00, 449.00, 1, DATEADD(DAY, -500, @EndDate), 'Lisa Anderson'),
    (NEWID(), 'DEV-203', 'Container Technologies', 'Docker and container management', 'DevOps', 'Intermediate', 20.0, 6.0, 499.00, 349.00, 1, DATEADD(DAY, -400, @EndDate), 'Michael Davis'),
    (NEWID(), 'DEV-302', 'Site Reliability Engineering', 'SRE principles and practices', 'DevOps', 'Advanced', 36.0, 10.0, 849.00, 629.00, 1, DATEADD(DAY, -300, @EndDate), 'Sarah Thompson'),
    (NEWID(), 'DEV-303', 'Kubernetes Administration', 'Advanced Kubernetes operations', 'DevOps', 'Advanced', 40.0, 12.0, 899.00, 679.00, 1, DATEADD(DAY, -250, @EndDate), 'David Garcia'),
    (NEWID(), 'DEV-204', 'Monitoring and Observability', 'Application and infrastructure monitoring', 'DevOps', 'Intermediate', 20.0, 6.0, 499.00, 349.00, 1, DATEADD(DAY, -150, @EndDate), 'Amanda Martinez'),

    -- Leadership & Management (10 courses)
    (@Course_Leadership, 'LDR-301', 'Executive Technology Leadership', 'Strategic leadership for technology executives', 'Leadership', 'Advanced', 32.0, 10.0, 799.00, 599.00, 1, DATEADD(DAY, -700, @EndDate), 'Dr. Robert Brown'),
    (NEWID(), 'LDR-101', 'Technical Leadership Basics', 'Introduction to technical team leadership', 'Leadership', 'Beginner', 16.0, 4.0, 299.00, 199.00, 1, DATEADD(DAY, -900, @EndDate), 'Jennifer Johnson'),
    (NEWID(), 'LDR-201', 'Engineering Management', 'Managing software engineering teams', 'Leadership', 'Intermediate', 24.0, 8.0, 549.00, 399.00, 1, DATEADD(DAY, -550, @EndDate), 'Michael Lee'),
    (NEWID(), 'LDR-202', 'Agile Leadership', 'Leading agile transformations', 'Leadership', 'Intermediate', 20.0, 6.0, 499.00, 349.00, 1, DATEADD(DAY, -450, @EndDate), 'Sarah Wilson'),
    (NEWID(), 'LDR-302', 'Strategic Technology Planning', 'Long-term technology strategy and roadmapping', 'Leadership', 'Advanced', 28.0, 8.0, 749.00, 549.00, 1, DATEADD(DAY, -400, @EndDate), 'Dr. David Chen'),
    (NEWID(), 'LDR-203', 'Building High-Performance Teams', 'Team dynamics and performance optimization', 'Leadership', 'Intermediate', 20.0, 6.0, 499.00, 349.00, 1, DATEADD(DAY, -350, @EndDate), 'Lisa Martinez'),
    (NEWID(), 'LDR-303', 'Change Management in Technology', 'Leading organizational change', 'Leadership', 'Advanced', 24.0, 6.0, 649.00, 479.00, 1, DATEADD(DAY, -300, @EndDate), 'Robert Anderson'),
    (NEWID(), 'LDR-204', 'Remote Team Management', 'Managing distributed technology teams', 'Leadership', 'Intermediate', 16.0, 4.0, 449.00, 329.00, 1, DATEADD(DAY, -200, @EndDate), 'Amanda Taylor'),
    (NEWID(), 'LDR-304', 'Innovation Leadership', 'Fostering innovation in technology organizations', 'Leadership', 'Advanced', 24.0, 6.0, 649.00, 479.00, 1, DATEADD(DAY, -150, @EndDate), 'Dr. Jennifer Kim'),
    (NEWID(), 'LDR-205', 'Technical Communication', 'Effective communication for technical leaders', 'Leadership', 'Intermediate', 16.0, 4.0, 449.00, 329.00, 1, DATEADD(DAY, -100, @EndDate), 'Michael Brown'),

    -- Software Development (8 courses)
    (NEWID(), 'SWE-101', 'Software Engineering Fundamentals', 'Core software development principles', 'Software Development', 'Beginner', 20.0, 4.0, 349.00, 249.00, 1, DATEADD(DAY, -850, @EndDate), 'James Garcia'),
    (NEWID(), 'SWE-201', 'Modern Web Development', 'Full-stack web development', 'Software Development', 'Intermediate', 32.0, 10.0, 699.00, 519.00, 1, DATEADD(DAY, -600, @EndDate), 'Sarah Davis'),
    (NEWID(), 'SWE-202', 'Mobile App Development', 'iOS and Android development', 'Software Development', 'Intermediate', 28.0, 8.0, 599.00, 449.00, 1, DATEADD(DAY, -500, @EndDate), 'David Johnson'),
    (NEWID(), 'SWE-301', 'Software Architecture Patterns', 'Advanced architecture and design patterns', 'Software Development', 'Advanced', 36.0, 10.0, 849.00, 629.00, 1, DATEADD(DAY, -400, @EndDate), 'Dr. Lisa Miller'),
    (NEWID(), 'SWE-203', 'API Design and Development', 'RESTful and GraphQL API development', 'Software Development', 'Intermediate', 24.0, 6.0, 549.00, 399.00, 1, DATEADD(DAY, -350, @EndDate), 'Michael Wilson'),
    (NEWID(), 'SWE-302', 'Microservices Architecture', 'Building microservices-based systems', 'Software Development', 'Advanced', 32.0, 10.0, 799.00, 599.00, 1, DATEADD(DAY, -250, @EndDate), 'Robert Lee'),
    (NEWID(), 'SWE-204', 'Database Design and Optimization', 'Relational and NoSQL database design', 'Software Development', 'Intermediate', 24.0, 6.0, 549.00, 399.00, 1, DATEADD(DAY, -200, @EndDate), 'Jennifer Martinez'),
    (NEWID(), 'SWE-303', 'Performance Optimization', 'Application performance tuning', 'Software Development', 'Advanced', 28.0, 8.0, 749.00, 549.00, 1, DATEADD(DAY, -120, @EndDate), 'Amanda Chen'),

    -- Business & Strategy (6 courses)
    (NEWID(), 'BUS-101', 'Technology Business Fundamentals', 'Business concepts for technologists', 'Business', 'Beginner', 16.0, 4.0, 299.00, 199.00, 1, DATEADD(DAY, -800, @EndDate), 'Dr. Michael Anderson'),
    (NEWID(), 'BUS-201', 'Product Management for Technology', 'Product strategy and execution', 'Business', 'Intermediate', 24.0, 8.0, 549.00, 399.00, 1, DATEADD(DAY, -550, @EndDate), 'Jessica Lee'),
    (NEWID(), 'BUS-202', 'Technology ROI and Metrics', 'Measuring technology investment returns', 'Business', 'Intermediate', 20.0, 6.0, 499.00, 349.00, 1, DATEADD(DAY, -450, @EndDate), 'Robert Taylor'),
    (NEWID(), 'BUS-301', 'Digital Transformation Strategy', 'Enterprise digital transformation', 'Business', 'Advanced', 28.0, 8.0, 749.00, 549.00, 1, DATEADD(DAY, -350, @EndDate), 'Dr. Sarah Johnson'),
    (NEWID(), 'BUS-203', 'Vendor Management and Procurement', 'Technology vendor relationships', 'Business', 'Intermediate', 16.0, 4.0, 449.00, 329.00, 1, DATEADD(DAY, -250, @EndDate), 'David Martinez'),
    (NEWID(), 'BUS-302', 'Technology Portfolio Management', 'Managing technology investments', 'Business', 'Advanced', 24.0, 6.0, 649.00, 479.00, 1, DATEADD(DAY, -180, @EndDate), 'Lisa Brown');

PRINT '  Courses: 60 inserted';
PRINT '';

-- ============================================================================
-- ENROLLMENTS (900 enrollments - Generated Programmatically)
-- ============================================================================

PRINT 'Generating Course Enrollments (900 records)...';

-- Generate enrollments with realistic patterns
DECLARE @TotalEnrollments INT = 0;
DECLARE @CompletedEnrollments INT = 0;

-- Insert enrollments for random member/course combinations
INSERT INTO [learning].[Enrollment] (ID, CourseID, MemberID, EnrollmentDate, StartDate, CompletionDate, Status, ProgressPercentage, FinalScore, Passed, InvoiceID)
SELECT TOP 900
    NEWID(),
    c.ID,
    m.ID,
    DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 500), @EndDate),
    DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 480), @EndDate),
    CASE
        WHEN RAND(CHECKSUM(NEWID())) < 0.72 -- 72% completion rate
        THEN DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 400), @EndDate)
    END,
    CASE
        WHEN RAND(CHECKSUM(NEWID())) < 0.72 THEN 'Completed'
        WHEN RAND(CHECKSUM(NEWID())) < 0.90 THEN 'In Progress'
        ELSE 'Enrolled'
    END,
    CASE
        WHEN RAND(CHECKSUM(NEWID())) < 0.72 THEN 100
        WHEN RAND(CHECKSUM(NEWID())) < 0.90 THEN 30 + (RAND(CHECKSUM(NEWID())) * 65)
        ELSE 0 + (RAND(CHECKSUM(NEWID())) * 25)
    END,
    CASE
        WHEN RAND(CHECKSUM(NEWID())) < 0.72 THEN 70 + (RAND(CHECKSUM(NEWID())) * 30)
    END,
    CASE
        WHEN RAND(CHECKSUM(NEWID())) < 0.72 THEN 1
        ELSE 0
    END,
    NULL -- Will link to invoices later
FROM [learning].[Course] c
CROSS JOIN [membership].[Member] m
WHERE m.JoinDate < DATEADD(DAY, -30, @EndDate)
ORDER BY NEWID();

SET @TotalEnrollments = @@ROWCOUNT;

PRINT '  Enrollments: ' + CAST(@TotalEnrollments AS VARCHAR) + ' generated';
PRINT '';

-- ============================================================================
-- CERTIFICATES (Generated for completed enrollments)
-- ============================================================================

PRINT 'Generating Certificates for Completed Enrollments...';

INSERT INTO [learning].[Certificate] (ID, EnrollmentID, CertificateNumber, IssuedDate, ExpirationDate, CertificatePDFURL, VerificationCode)
SELECT
    NEWID(),
    e.ID,
    'CERT-' + FORMAT(YEAR(e.CompletionDate), '0000') + '-' + RIGHT('000000' + CAST(ROW_NUMBER() OVER (ORDER BY e.CompletionDate) AS VARCHAR), 6),
    e.CompletionDate,
    CASE
        WHEN c.Category IN ('Security', 'Cloud') THEN DATEADD(YEAR, 3, e.CompletionDate)
        ELSE NULL
    END,
    'https://certificates.association.org/' + CAST(NEWID() AS VARCHAR(36)) + '.pdf',
    UPPER(SUBSTRING(CAST(NEWID() AS VARCHAR(36)), 1, 12))
FROM [learning].[Enrollment] e
INNER JOIN [learning].[Course] c ON e.CourseID = c.ID
WHERE e.Status = 'Completed' AND e.Passed = 1;

SET @CompletedEnrollments = @@ROWCOUNT;

PRINT '  Certificates: ' + CAST(@CompletedEnrollments AS VARCHAR) + ' generated';
PRINT '';

PRINT '=================================================================';
PRINT 'LEARNING DATA POPULATION COMPLETE';
PRINT 'Summary:';
PRINT '  - Courses: 60';
PRINT '  - Enrollments: ' + CAST(@TotalEnrollments AS VARCHAR);
PRINT '  - Certificates: ' + CAST(@CompletedEnrollments AS VARCHAR);
PRINT '=================================================================';
PRINT '';
-- Note: No GO statement here - variables must persist within transaction
