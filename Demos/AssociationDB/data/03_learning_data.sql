/******************************************************************************
 * Association Sample Database - Learning Data
 * File: 03_learning_data.sql
 *
 * Generates learning management data including:
 * - 60 Courses
 * - 900 Enrollments (generated programmatically)
 * - 650 Certificates (generated for completions)
 ******************************************************************************/


-- Parameters are loaded by MASTER_BUILD script before this file

-- ============================================================================
-- COURSES (60 Courses across categories and levels)
-- ============================================================================


INSERT INTO [AssociationDemo].[Course] (ID, Code, Title, Description, Category, Level, DurationHours, CEUCredits, Price, MemberPrice, IsActive, PublishedDate, InstructorName)
VALUES
    -- Cheesemaking Fundamentals (8 courses)
    (@Course_CloudArchitect, 'CHZ-301', 'Master Cheesemaker Certification', 'Comprehensive artisan cheesemaking techniques and best practices', 'Cheesemaking', 'Advanced', 40.0, 12.0, 899.00, 699.00, 1, DATEADD(DAY, -900, @EndDate), 'Dr. Michael Chen'),
    (NEWID(), 'CHZ-101', 'Cheesemaking Fundamentals', 'Introduction to cheese production and dairy science basics', 'Cheesemaking', 'Beginner', 16.0, 4.0, 299.00, 199.00, 1, DATEADD(DAY, -1200, @EndDate), 'Sarah Williams'),
    (NEWID(), 'CHZ-201', 'Fresh Cheese Production', 'Techniques for making fresh cheeses: ricotta, mozzarella, chevre', 'Cheesemaking', 'Intermediate', 24.0, 8.0, 549.00, 399.00, 1, DATEADD(DAY, -800, @EndDate), 'David Martinez'),
    (NEWID(), 'CHZ-202', 'Aged Cheese Techniques', 'Aging, affinage, and cave management for aged cheeses', 'Cheesemaking', 'Intermediate', 20.0, 6.0, 499.00, 349.00, 1, DATEADD(DAY, -600, @EndDate), 'Jennifer Lee'),
    (NEWID(), 'CHZ-302', 'Specialty Cheese Innovation', 'Advanced techniques for developing signature cheese varieties', 'Cheesemaking', 'Advanced', 16.0, 4.0, 449.00, 329.00, 1, DATEADD(DAY, -400, @EndDate), 'Robert Johnson'),
    (NEWID(), 'CHZ-303', 'European Cheese Styles', 'Traditional European cheesemaking methods and regional styles', 'Cheesemaking', 'Advanced', 32.0, 10.0, 799.00, 599.00, 1, DATEADD(DAY, -500, @EndDate), 'Dr. Lisa Anderson'),
    (NEWID(), 'CHZ-203', 'Milk Chemistry and Cultures', 'Understanding starter cultures, enzymes, and milk composition', 'Cheesemaking', 'Intermediate', 28.0, 8.0, 599.00, 449.00, 1, DATEADD(DAY, -350, @EndDate), 'James Rodriguez'),
    (NEWID(), 'CHZ-304', 'Artisan Cheesemaking Mastery', 'Small-batch production and farmstead cheese operations', 'Cheesemaking', 'Advanced', 24.0, 6.0, 649.00, 479.00, 1, DATEADD(DAY, -250, @EndDate), 'Michelle Taylor'),

    -- Food Safety & HACCP (10 courses)
    (@Course_CyberSecurity, 'SAF-301', 'Advanced Food Safety Certification', 'Comprehensive HACCP and food safety management systems', 'Food Safety', 'Advanced', 48.0, 14.0, 999.00, 749.00, 1, DATEADD(DAY, -850, @EndDate), 'Dr. David Kim'),
    (NEWID(), 'SAF-101', 'Food Safety Fundamentals', 'Introduction to dairy food safety principles', 'Food Safety', 'Beginner', 16.0, 4.0, 299.00, 199.00, 1, DATEADD(DAY, -1100, @EndDate), 'Patricia Moore'),
    (NEWID(), 'SAF-201', 'HACCP Implementation', 'Hazard analysis and critical control points for cheese plants', 'Food Safety', 'Intermediate', 24.0, 8.0, 549.00, 399.00, 1, DATEADD(DAY, -750, @EndDate), 'Christopher Jackson'),
    (NEWID(), 'SAF-202', 'Dairy Sanitation Practices', 'Clean-in-place systems and sanitation protocols', 'Food Safety', 'Intermediate', 20.0, 6.0, 499.00, 349.00, 1, DATEADD(DAY, -650, @EndDate), 'Amanda Wilson'),
    (NEWID(), 'SAF-302', 'Microbiology for Cheesemakers', 'Pathogen control and beneficial bacteria management', 'Food Safety', 'Advanced', 40.0, 12.0, 899.00, 679.00, 1, DATEADD(DAY, -550, @EndDate), 'Daniel Thompson'),
    (NEWID(), 'SAF-303', 'Food Safety Auditing', 'Conducting internal audits and corrective action management', 'Food Safety', 'Advanced', 32.0, 10.0, 799.00, 599.00, 1, DATEADD(DAY, -450, @EndDate), 'Rachel Martinez'),
    (NEWID(), 'SAF-203', 'Allergen Management', 'Controlling allergens in dairy processing facilities', 'Food Safety', 'Intermediate', 24.0, 8.0, 549.00, 399.00, 1, DATEADD(DAY, -350, @EndDate), 'Kevin Brown'),
    (NEWID(), 'SAF-304', 'FSMA Compliance', 'FDA Food Safety Modernization Act requirements for cheese', 'Food Safety', 'Advanced', 28.0, 8.0, 749.00, 549.00, 1, DATEADD(DAY, -300, @EndDate), 'Lisa Davis'),
    (NEWID(), 'SAF-204', 'Traceability Systems', 'Lot tracking and recall management for dairy products', 'Food Safety', 'Intermediate', 20.0, 6.0, 499.00, 349.00, 1, DATEADD(DAY, -200, @EndDate), 'Thomas White'),
    (NEWID(), 'SAF-305', 'Regulatory Compliance', 'FDA, USDA, and state dairy regulations', 'Food Safety', 'Advanced', 24.0, 6.0, 649.00, 479.00, 1, DATEADD(DAY, -150, @EndDate), 'Jennifer Miller'),

    -- Dairy Science & Quality (10 courses)
    (@Course_DataScience, 'SCI-301', 'Advanced Dairy Science Certification', 'Milk composition analysis and quality optimization', 'Dairy Science', 'Advanced', 44.0, 12.0, 949.00, 719.00, 1, DATEADD(DAY, -800, @EndDate), 'Dr. Emily Rodriguez'),
    (@Course_AIFundamentals, 'SCI-101', 'Dairy Science Fundamentals', 'Introduction to milk production and composition', 'Dairy Science', 'Beginner', 20.0, 4.0, 349.00, 249.00, 1, DATEADD(DAY, -700, @EndDate), 'Amanda Clark'),
    (NEWID(), 'SCI-102', 'Milk Quality Testing', 'Laboratory testing methods for raw milk evaluation', 'Dairy Science', 'Beginner', 16.0, 4.0, 299.00, 199.00, 1, DATEADD(DAY, -1000, @EndDate), 'Michael Garcia'),
    (NEWID(), 'SCI-201', 'Cheese Chemistry', 'Chemical reactions and flavor development in cheese', 'Dairy Science', 'Intermediate', 28.0, 8.0, 599.00, 449.00, 1, DATEADD(DAY, -650, @EndDate), 'Sarah Johnson'),
    (NEWID(), 'SCI-202', 'Sensory Evaluation', 'Professional cheese judging and flavor profiling techniques', 'Dairy Science', 'Intermediate', 32.0, 10.0, 699.00, 519.00, 1, DATEADD(DAY, -550, @EndDate), 'Dr. James Patel'),
    (NEWID(), 'SCI-302', 'Texture and Rheology', 'Understanding cheese texture development and measurement', 'Dairy Science', 'Advanced', 40.0, 12.0, 899.00, 679.00, 1, DATEADD(DAY, -450, @EndDate), 'Dr. Lisa Chen'),
    (NEWID(), 'SCI-303', 'Flavor Chemistry', 'Biochemistry of flavor compounds in aged cheese', 'Dairy Science', 'Advanced', 36.0, 10.0, 849.00, 629.00, 1, DATEADD(DAY, -350, @EndDate), 'Robert Taylor'),
    (NEWID(), 'SCI-203', 'Quality Control Procedures', 'Statistical process control for cheese manufacturing', 'Dairy Science', 'Intermediate', 20.0, 6.0, 449.00, 329.00, 1, DATEADD(DAY, -300, @EndDate), 'Michelle Lee'),
    (NEWID(), 'SCI-304', 'Shelf Life Studies', 'Accelerated aging and shelf life determination methods', 'Dairy Science', 'Advanced', 32.0, 10.0, 799.00, 599.00, 1, DATEADD(DAY, -200, @EndDate), 'David Wilson'),
    (NEWID(), 'SCI-204', 'Nutritional Analysis', 'Nutrient profiling and health claims for cheese products', 'Dairy Science', 'Intermediate', 24.0, 6.0, 599.00, 449.00, 1, DATEADD(DAY, -100, @EndDate), 'Jennifer Martinez'),

    -- Production Operations (8 courses)
    (@Course_DevOps, 'OPS-301', 'Production Management Certification', 'Advanced plant operations and process optimization', 'Production', 'Advanced', 40.0, 12.0, 899.00, 699.00, 1, DATEADD(DAY, -750, @EndDate), 'Kevin Martinez'),
    (NEWID(), 'OPS-101', 'Production Fundamentals', 'Introduction to cheese plant operations and workflows', 'Production', 'Beginner', 16.0, 4.0, 299.00, 199.00, 1, DATEADD(DAY, -950, @EndDate), 'Rachel Wilson'),
    (NEWID(), 'OPS-201', 'Equipment Operations', 'Operating and maintaining cheese production equipment', 'Production', 'Intermediate', 24.0, 8.0, 549.00, 399.00, 1, DATEADD(DAY, -600, @EndDate), 'James Brown'),
    (NEWID(), 'OPS-202', 'Automation Systems', 'PLC programming and automated cheese production systems', 'Production', 'Intermediate', 28.0, 8.0, 599.00, 449.00, 1, DATEADD(DAY, -500, @EndDate), 'Lisa Anderson'),
    (NEWID(), 'OPS-203', 'Packaging Operations', 'Automated packaging systems for cheese products', 'Production', 'Intermediate', 20.0, 6.0, 499.00, 349.00, 1, DATEADD(DAY, -400, @EndDate), 'Michael Davis'),
    (NEWID(), 'OPS-302', 'Lean Manufacturing', 'Six Sigma and continuous improvement in cheese production', 'Production', 'Advanced', 36.0, 10.0, 849.00, 629.00, 1, DATEADD(DAY, -300, @EndDate), 'Sarah Thompson'),
    (NEWID(), 'OPS-303', 'Plant Engineering', 'Advanced troubleshooting and maintenance management', 'Production', 'Advanced', 40.0, 12.0, 899.00, 679.00, 1, DATEADD(DAY, -250, @EndDate), 'David Garcia'),
    (NEWID(), 'OPS-204', 'Process Monitoring', 'Real-time monitoring and data analytics for cheese plants', 'Production', 'Intermediate', 20.0, 6.0, 499.00, 349.00, 1, DATEADD(DAY, -150, @EndDate), 'Amanda Martinez'),

    -- Industry Leadership (10 courses)
    (@Course_Leadership, 'LDR-301', 'Executive Cheese Industry Leadership', 'Strategic leadership for dairy industry executives', 'Leadership', 'Advanced', 32.0, 10.0, 799.00, 599.00, 1, DATEADD(DAY, -700, @EndDate), 'Dr. Robert Brown'),
    (NEWID(), 'LDR-101', 'Supervisory Skills for Dairy', 'Introduction to supervising cheese production teams', 'Leadership', 'Beginner', 16.0, 4.0, 299.00, 199.00, 1, DATEADD(DAY, -900, @EndDate), 'Jennifer Johnson'),
    (NEWID(), 'LDR-201', 'Plant Management', 'Managing cheese manufacturing operations', 'Leadership', 'Intermediate', 24.0, 8.0, 549.00, 399.00, 1, DATEADD(DAY, -550, @EndDate), 'Michael Lee'),
    (NEWID(), 'LDR-202', 'Change Leadership', 'Leading organizational change in dairy operations', 'Leadership', 'Intermediate', 20.0, 6.0, 499.00, 349.00, 1, DATEADD(DAY, -450, @EndDate), 'Sarah Wilson'),
    (NEWID(), 'LDR-302', 'Strategic Planning', 'Long-term business strategy for cheese companies', 'Leadership', 'Advanced', 28.0, 8.0, 749.00, 549.00, 1, DATEADD(DAY, -400, @EndDate), 'Dr. David Chen'),
    (NEWID(), 'LDR-203', 'Team Building', 'Creating high-performance teams in dairy operations', 'Leadership', 'Intermediate', 20.0, 6.0, 499.00, 349.00, 1, DATEADD(DAY, -350, @EndDate), 'Lisa Martinez'),
    (NEWID(), 'LDR-303', 'Innovation Management', 'Driving innovation in cheese product development', 'Leadership', 'Advanced', 24.0, 6.0, 649.00, 479.00, 1, DATEADD(DAY, -300, @EndDate), 'Robert Anderson'),
    (NEWID(), 'LDR-204', 'Crisis Management', 'Managing food safety incidents and product recalls', 'Leadership', 'Intermediate', 16.0, 4.0, 449.00, 329.00, 1, DATEADD(DAY, -200, @EndDate), 'Amanda Taylor'),
    (NEWID(), 'LDR-304', 'Sustainability Leadership', 'Environmental stewardship in dairy operations', 'Leadership', 'Advanced', 24.0, 6.0, 649.00, 479.00, 1, DATEADD(DAY, -150, @EndDate), 'Dr. Jennifer Kim'),
    (NEWID(), 'LDR-205', 'Communication Skills', 'Effective communication for dairy industry leaders', 'Leadership', 'Intermediate', 16.0, 4.0, 449.00, 329.00, 1, DATEADD(DAY, -100, @EndDate), 'Michael Brown'),

    -- Marketing & Sales (8 courses)
    (NEWID(), 'MKT-101', 'Cheese Marketing Fundamentals', 'Introduction to dairy product marketing and branding', 'Marketing', 'Beginner', 20.0, 4.0, 349.00, 249.00, 1, DATEADD(DAY, -850, @EndDate), 'James Garcia'),
    (NEWID(), 'MKT-201', 'Digital Marketing for Cheese', 'Social media and e-commerce strategies for cheese brands', 'Marketing', 'Intermediate', 32.0, 10.0, 699.00, 519.00, 1, DATEADD(DAY, -600, @EndDate), 'Sarah Davis'),
    (NEWID(), 'MKT-202', 'Retail Sales Strategies', 'Cheese merchandising and retail partnership development', 'Marketing', 'Intermediate', 28.0, 8.0, 599.00, 449.00, 1, DATEADD(DAY, -500, @EndDate), 'David Johnson'),
    (NEWID(), 'MKT-301', 'Brand Development', 'Creating distinctive cheese brands and positioning', 'Marketing', 'Advanced', 36.0, 10.0, 849.00, 629.00, 1, DATEADD(DAY, -400, @EndDate), 'Dr. Lisa Miller'),
    (NEWID(), 'MKT-203', 'Export Markets', 'International trade and export strategies for cheese', 'Marketing', 'Intermediate', 24.0, 6.0, 549.00, 399.00, 1, DATEADD(DAY, -350, @EndDate), 'Michael Wilson'),
    (NEWID(), 'MKT-302', 'Premium Cheese Marketing', 'Luxury positioning and specialty cheese markets', 'Marketing', 'Advanced', 32.0, 10.0, 799.00, 599.00, 1, DATEADD(DAY, -250, @EndDate), 'Robert Lee'),
    (NEWID(), 'MKT-204', 'Consumer Insights', 'Understanding cheese consumer preferences and trends', 'Marketing', 'Intermediate', 24.0, 6.0, 549.00, 399.00, 1, DATEADD(DAY, -200, @EndDate), 'Jennifer Martinez'),
    (NEWID(), 'MKT-303', 'Sales Channel Management', 'Multi-channel distribution strategy for cheese products', 'Marketing', 'Advanced', 28.0, 8.0, 749.00, 549.00, 1, DATEADD(DAY, -120, @EndDate), 'Amanda Chen'),

    -- Business Management (6 courses)
    (NEWID(), 'BUS-101', 'Cheese Business Fundamentals', 'Business concepts for artisan cheesemakers', 'Business', 'Beginner', 16.0, 4.0, 299.00, 199.00, 1, DATEADD(DAY, -800, @EndDate), 'Dr. Michael Anderson'),
    (NEWID(), 'BUS-201', 'Financial Management', 'Cost accounting and profitability analysis for cheese operations', 'Business', 'Intermediate', 24.0, 8.0, 549.00, 399.00, 1, DATEADD(DAY, -550, @EndDate), 'Jessica Lee'),
    (NEWID(), 'BUS-202', 'Supply Chain Management', 'Managing dairy supply chains and vendor relationships', 'Business', 'Intermediate', 20.0, 6.0, 499.00, 349.00, 1, DATEADD(DAY, -450, @EndDate), 'Robert Taylor'),
    (NEWID(), 'BUS-301', 'Business Analytics', 'Data-driven decision making for cheese businesses', 'Business', 'Advanced', 28.0, 8.0, 749.00, 549.00, 1, DATEADD(DAY, -350, @EndDate), 'Dr. Sarah Johnson'),
    (NEWID(), 'BUS-203', 'Contract Negotiation', 'Negotiating milk supply and distribution agreements', 'Business', 'Intermediate', 16.0, 4.0, 449.00, 329.00, 1, DATEADD(DAY, -250, @EndDate), 'David Martinez'),
    (NEWID(), 'BUS-302', 'Strategic Growth Planning', 'Scaling artisan and specialty cheese businesses', 'Business', 'Advanced', 24.0, 6.0, 649.00, 479.00, 1, DATEADD(DAY, -180, @EndDate), 'Lisa Brown');


-- ============================================================================
-- ENROLLMENTS (900 enrollments - Generated Programmatically)
-- ============================================================================


-- Generate enrollments with realistic patterns
DECLARE @TotalEnrollments INT = 0;
DECLARE @CompletedEnrollments INT = 0;

-- Insert enrollments for random member/course combinations
INSERT INTO [AssociationDemo].[Enrollment] (ID, CourseID, MemberID, EnrollmentDate, StartDate, CompletionDate, Status, ProgressPercentage, FinalScore, Passed, InvoiceID)
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
FROM [AssociationDemo].[Course] c
CROSS JOIN [AssociationDemo].[Member] m
WHERE m.JoinDate < DATEADD(DAY, -30, @EndDate)
ORDER BY NEWID();

SET @TotalEnrollments = @@ROWCOUNT;


-- ============================================================================
-- CERTIFICATES (Generated for completed enrollments)
-- ============================================================================


INSERT INTO [AssociationDemo].[Certificate] (ID, EnrollmentID, CertificateNumber, IssuedDate, ExpirationDate, CertificatePDFURL, VerificationCode)
SELECT
    NEWID(),
    e.ID,
    'CERT-' + FORMAT(YEAR(COALESCE(e.CompletionDate, GETDATE())), '0000') + '-' + RIGHT('000000' + CAST(ROW_NUMBER() OVER (ORDER BY COALESCE(e.CompletionDate, GETDATE())) AS VARCHAR), 6),
    COALESCE(e.CompletionDate, GETDATE()),
    CASE
        WHEN c.Category IN ('Food Safety', 'Cheesemaking') THEN DATEADD(YEAR, 3, COALESCE(e.CompletionDate, GETDATE()))
        ELSE NULL
    END,
    'https://certificates.association.org/' + CAST(NEWID() AS VARCHAR(36)) + '.pdf',
    UPPER(SUBSTRING(CAST(NEWID() AS VARCHAR(36)), 1, 12))
FROM [AssociationDemo].[Enrollment] e
INNER JOIN [AssociationDemo].[Course] c ON e.CourseID = c.ID
WHERE e.Status = 'Completed' AND e.Passed = 1 AND e.CompletionDate IS NOT NULL;

SET @CompletedEnrollments = @@ROWCOUNT;


-- Note: No GO statement here - variables must persist within transaction
