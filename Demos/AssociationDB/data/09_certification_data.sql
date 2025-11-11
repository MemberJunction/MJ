/******************************************************************************
 * Association Sample Database - Certification/Credentials Sample Data
 * File: 09_certification_data.sql
 *
 * This file populates the certification and credentials management tables with
 * realistic sample data for cheese industry certifications.
 *
 * Data includes:
 * - 5 Accrediting Bodies (American Cheese Society, etc.)
 * - 12 Certification Types (Certified Cheesemaker, Food Safety, etc.)
 * - 350+ Member Certifications across all types
 * - 60+ Certification Requirements
 * - 75+ Continuing Education records
 * - 50+ Renewal records
 *
 * All UUIDs are real (generated via uuidgen)
 * All dates are parameterized using @EndDate
 ******************************************************************************/

-- ============================================================================
-- ACCREDITING BODIES
-- ============================================================================

PRINT 'Populating Accrediting Bodies...';

INSERT INTO [AssociationDemo].[AccreditingBody]
    ([ID], [Name], [Abbreviation], [Description], [Website], [ContactEmail], [ContactPhone],
     [IsActive], [IsRecognized], [EstablishedDate], [Country])
VALUES
    ('4F94F6B8-F876-4909-BC2F-C17A27F95398',
     'American Cheese Society', 'ACS',
     'The premier organization supporting and promoting artisan, farmstead, and specialty cheesemakers in North America.',
     'https://www.cheesesociety.org', 'info@cheesesociety.org', '720-328-2788',
     1, 1, '1983-01-01', 'United States'),

    ('DE4C869D-98DA-4673-88DB-A59D3CA88313',
     'Wisconsin Cheese Makers Association', 'WCMA',
     'Serving Wisconsin''s cheesemakers since 1893, providing education, certification, and advocacy.',
     'https://www.wischeesemakers.org', 'wcma@wischeesemakers.org', '608-255-2027',
     1, 1, '1893-01-01', 'United States'),

    ('BC7AA565-D106-4899-A071-9AD26515502B',
     'American Dairy Science Association', 'ADSA',
     'Professional organization for dairy scientists, educators, and industry representatives.',
     'https://www.adsa.org', 'adsa@assochq.org', '217-356-5146',
     1, 1, '1906-01-01', 'United States'),

    ('04780AEA-6866-4FB5-88D3-BCC10EDB5EF2',
     'Food Safety & Quality Alliance', 'FSQA',
     'National organization dedicated to food safety certification and quality assurance in dairy production.',
     'https://www.fsqa.org', 'info@fsqa.org', '202-555-0187',
     1, 1, '1995-06-15', 'United States'),

    ('E2B60D6B-E165-4CC3-AE46-D2BB09548292',
     'International Dairy Foods Association', 'IDFA',
     'Trade association representing the dairy processing industry, offering professional development programs.',
     'https://www.idfa.org', 'membership@idfa.org', '202-737-4332',
     1, 1, '1990-01-01', 'United States');
GO

-- ============================================================================
-- CERTIFICATION TYPES
-- ============================================================================

PRINT 'Populating Certification Types...';

INSERT INTO [AssociationDemo].[CertificationType]
    ([ID], [AccreditingBodyID], [Name], [Abbreviation], [Description], [Level],
     [DurationMonths], [RenewalRequiredMonths], [CECreditsRequired], [ExamRequired],
     [PracticalRequired], [CostUSD], [IsActive], [Prerequisites], [TargetAudience])
VALUES
    ('FDEBD0A0-5B85-4CEC-B41F-B3C260B08618',
     '4F94F6B8-F876-4909-BC2F-C17A27F95398',
     'Certified Cheese Professional', 'CCP',
     'Comprehensive certification for cheese industry professionals covering production, aging, sales, and service.',
     'Intermediate', 12, 24, 20, 1, 1, 495.00, 1,
     'Minimum 2 years cheese industry experience',
     'Cheesemakers, cheesemongers, distributors, and retailers'),

    ('C36ED92E-E2D4-4800-8FE5-507386B82C66',
     'DE4C869D-98DA-4673-88DB-A59D3CA88313',
     'Wisconsin Master Cheesemaker', 'WMC',
     'Prestigious certification requiring deep expertise in specific cheese varieties made in Wisconsin.',
     'Master', 36, 36, 40, 1, 1, 2500.00, 1,
     'Licensed Wisconsin cheesemaker with minimum 10 years experience',
     'Experienced Wisconsin cheesemakers seeking mastery certification'),

    ('2953BB6A-260A-4EBA-9330-55D7677D98F4',
     'DE4C869D-98DA-4673-88DB-A59D3CA88313',
     'Certified Cheesemaker', 'CCM',
     'Professional certification for practicing cheesemakers demonstrating competency in cheese production.',
     'Intermediate', 18, 36, 30, 1, 1, 850.00, 1,
     'Minimum 3 years production experience',
     'Production cheesemakers and plant managers'),

    ('C8AF1156-EE94-4EAF-9234-BA745DE6EBEC',
     '04780AEA-6866-4FB5-88D3-BCC10EDB5EF2',
     'Food Safety Manager Certification', 'FSMC',
     'Certification in food safety principles and HACCP for dairy processing facilities.',
     'Intermediate', 6, 60, 15, 1, 0, 395.00, 1,
     'High school diploma or equivalent',
     'Plant managers, quality assurance staff, and supervisors'),

    ('6906365A-B590-48BD-80FD-5103F53FD9AB',
     '04780AEA-6866-4FB5-88D3-BCC10EDB5EF2',
     'HACCP Coordinator Certification', 'HCC',
     'Specialized certification for implementing and managing HACCP programs in cheese facilities.',
     'Advanced', 9, 36, 24, 1, 1, 675.00, 1,
     'Food Safety Manager Certification and 2 years experience',
     'Quality assurance managers and HACCP team leaders'),

    ('CF9BA555-74C3-4F93-974A-09E1900BAA94',
     '4F94F6B8-F876-4909-BC2F-C17A27F95398',
     'Certified Cheese Grader', 'CCG',
     'Certification for evaluating cheese quality, grading, and sensory analysis.',
     'Advanced', 12, 24, 20, 1, 1, 595.00, 1,
     'Minimum 1 year cheese evaluation experience',
     'Quality control staff, buyers, and competition judges'),

    ('E006FF1E-CFFD-49F2-9C0F-3F3AB50E4D98',
     '4F94F6B8-F876-4909-BC2F-C17A27F95398',
     'Certified Affineur', 'CAF',
     'Specialized certification in cheese aging, cave management, and affinage techniques.',
     'Specialty', 18, 36, 25, 1, 1, 795.00, 1,
     'Certified Cheese Professional or equivalent experience',
     'Cheese agers, cave managers, and specialty retailers'),

    ('8A186D17-70E8-4E61-AF2A-FFA6EF1CD5B1',
     'BC7AA565-D106-4899-A071-9AD26515502B',
     'Dairy Science Professional', 'DSP',
     'Professional certification for dairy scientists and technologists.',
     'Intermediate', 12, 60, 20, 1, 0, 450.00, 1,
     'Bachelor''s degree in Dairy Science or related field',
     'Dairy scientists, researchers, and technical staff'),

    ('40879B5B-148B-4F5D-A3EC-6C8F3A31DBF9',
     'E2B60D6B-E165-4CC3-AE46-D2BB09548292',
     'Dairy Processing Technician', 'DPT',
     'Entry-level certification for dairy processing plant technicians.',
     'Entry', 6, 24, 12, 1, 1, 295.00, 1,
     'None',
     'New workers entering the dairy processing industry'),

    ('20AF7230-7A26-40EB-8F0D-ABBF0C663A80',
     'DE4C869D-98DA-4673-88DB-A59D3CA88313',
     'Advanced Cheesemaking Techniques', 'ACT',
     'Advanced training in specialty cheese production methods and problem-solving.',
     'Advanced', 12, 36, 30, 0, 1, 1250.00, 1,
     'Certified Cheesemaker or 5+ years production experience',
     'Experienced cheesemakers seeking advanced skills'),

    ('C97DDB91-88DC-4A98-B531-B52EF9879DA8',
     '4F94F6B8-F876-4909-BC2F-C17A27F95398',
     'Certified Cheesemonger', 'CCM',
     'Certification for retail cheese professionals in selection, service, and customer education.',
     'Intermediate', 9, 24, 15, 1, 1, 395.00, 1,
     'Minimum 1 year retail cheese experience',
     'Cheese retailers, department managers, and specialty shop staff'),

    ('04F32D88-4BA9-4569-B4E8-E981A7D7C7F5',
     'BC7AA565-D106-4899-A071-9AD26515502B',
     'Milk Quality & Safety Specialist', 'MQSS',
     'Certification in raw milk quality assessment and safety protocols for cheese production.',
     'Specialty', 8, 36, 18, 1, 1, 525.00, 1,
     'Dairy Science Professional or 3 years quality control experience',
     'Quality assurance staff and milk procurement specialists');
GO

-- ============================================================================
-- CERTIFICATION REQUIREMENTS
-- ============================================================================

PRINT 'Populating Certification Requirements...';

-- Requirements for Certified Cheese Professional
INSERT INTO [AssociationDemo].[CertificationRequirement]
    ([ID], [CertificationTypeID], [RequirementType], [Description], [IsRequired], [DisplayOrder], [Details])
VALUES
    ('6FBDDB8F-E137-4EC7-A627-E82E4D7B161A', 'FDEBD0A0-5B85-4CEC-B41F-B3C260B08618',
     'Experience', 'Minimum 2 years professional experience in the cheese industry', 1, 1,
     'Must be verified by employer or professional references'),
    ('2D616D51-62B9-4433-958D-86630445B14D', 'FDEBD0A0-5B85-4CEC-B41F-B3C260B08618',
     'Training', 'Complete 40-hour CCP preparation course', 1, 2,
     'May be completed online or in-person at approved locations'),
    ('A6F79549-51CC-4CBF-98C7-C748833C9A4F', 'FDEBD0A0-5B85-4CEC-B41F-B3C260B08618',
     'Examination', 'Pass written examination with minimum 75% score', 1, 3,
     'Covers cheese production, aging, evaluation, and service'),
    ('4331C33C-D172-436E-972B-DADC2A86B599', 'FDEBD0A0-5B85-4CEC-B41F-B3C260B08618',
     'Examination', 'Pass practical cheese evaluation exam', 1, 4,
     'Blind tasting of 6 cheese varieties with detailed written analysis');

-- Requirements for Wisconsin Master Cheesemaker
INSERT INTO [AssociationDemo].[CertificationRequirement]
    ([ID], [CertificationTypeID], [RequirementType], [Description], [IsRequired], [DisplayOrder], [Details])
VALUES
    ('456E12EC-5D3B-4FA2-A089-E0C9733D39F2', 'C36ED92E-E2D4-4800-8FE5-507386B82C66',
     'Prerequisites', 'Hold current Wisconsin Cheesemaker License', 1, 1,
     'Must be in good standing with no violations'),
    ('3D395327-B5FB-410B-970E-E41600841075', 'C36ED92E-E2D4-4800-8FE5-507386B82C66',
     'Experience', 'Minimum 10 years licensed cheesemaking experience in Wisconsin', 1, 2,
     'Verified through licensing records'),
    ('16D538D8-C59F-4638-8CEE-A8EAA2192109', 'C36ED92E-E2D4-4800-8FE5-507386B82C66',
     'Training', 'Complete 3-year Master Cheesemaker program', 1, 3,
     'Intensive training in 2-3 specific cheese varieties'),
    ('D2CA48C5-AB8B-4436-9F18-F0390C403455', 'C36ED92E-E2D4-4800-8FE5-507386B82C66',
     'Examination', 'Pass comprehensive written and practical examinations', 1, 4,
     'Must demonstrate mastery-level competency in selected cheese varieties');

-- Requirements for Food Safety Manager
INSERT INTO [AssociationDemo].[CertificationRequirement]
    ([ID], [CertificationTypeID], [RequirementType], [Description], [IsRequired], [DisplayOrder], [Details])
VALUES
    ('0AB1AE93-F203-4749-8D37-2C345BE9F513', 'C8AF1156-EE94-4EAF-9234-BA745DE6EBEC',
     'Training', 'Complete ANSI-accredited Food Safety Manager course', 1, 1,
     'Minimum 16 hours of instruction covering FDA Food Code'),
    ('21FCDDEE-CC33-446D-BE29-F4FFDA6E0CF7', 'C8AF1156-EE94-4EAF-9234-BA745DE6EBEC',
     'Examination', 'Pass nationally recognized Food Safety Manager exam', 1, 2,
     'Minimum 75% passing score required');

-- Requirements for HACCP Coordinator
INSERT INTO [AssociationDemo].[CertificationRequirement]
    ([ID], [CertificationTypeID], [RequirementType], [Description], [IsRequired], [DisplayOrder], [Details])
VALUES
    ('5436BAA5-C54F-4FA9-8A3F-6369FA1238CA', '6906365A-B590-48BD-80FD-5103F53FD9AB',
     'Prerequisites', 'Current Food Safety Manager Certification', 1, 1,
     'Must be in good standing'),
    ('D80FFF5F-196F-4FB3-AB76-E3239802B2A7', '6906365A-B590-48BD-80FD-5103F53FD9AB',
     'Experience', 'Minimum 2 years experience in food safety or quality assurance', 1, 2,
     'Preferably in dairy processing environment'),
    ('624B4571-841B-4408-BB9D-C2EC7C987DC7', '6906365A-B590-48BD-80FD-5103F53FD9AB',
     'Training', 'Complete 20-hour HACCP training course', 1, 3,
     'Must cover all 7 HACCP principles and dairy-specific applications');

-- Requirements for Certified Cheese Grader
INSERT INTO [AssociationDemo].[CertificationRequirement]
    ([ID], [CertificationTypeID], [RequirementType], [Description], [IsRequired], [DisplayOrder], [Details])
VALUES
    ('3DEA41BD-94C7-441D-B05B-16C01B3C6907', 'CF9BA555-74C3-4F93-974A-09E1900BAA94',
     'Experience', 'Minimum 1 year cheese evaluation or quality control experience', 1, 1,
     'Must include sensory evaluation work'),
    ('5FF7EF6D-CEB1-4EF0-B86D-809EB641F9BA', 'CF9BA555-74C3-4F93-974A-09E1900BAA94',
     'Training', 'Complete ACS Cheese Grading & Evaluation course', 1, 2,
     '3-day intensive workshop covering grading methodology'),
    ('1123B41C-2856-4E1A-BFBA-57EB16DE3378', 'CF9BA555-74C3-4F93-974A-09E1900BAA94',
     'Examination', 'Pass written exam on cheese defects and quality standards', 1, 3,
     'Minimum 80% passing score'),
    ('3F830D42-9585-4F03-8B24-B57B3CA6CCE0', 'CF9BA555-74C3-4F93-974A-09E1900BAA94',
     'Examination', 'Pass practical grading exam on 10 cheese samples', 1, 4,
     'Must accurately identify defects and assign grades within acceptable ranges');

-- Requirements for Certified Affineur
INSERT INTO [AssociationDemo].[CertificationRequirement]
    ([ID], [CertificationTypeID], [RequirementType], [Description], [IsRequired], [DisplayOrder], [Details])
VALUES
    ('5C36BEE8-36BB-4EDA-9578-B87FE452D23E', 'E006FF1E-CFFD-49F2-9C0F-3F3AB50E4D98',
     'Prerequisites', 'Certified Cheese Professional or equivalent', 1, 1,
     'May substitute with 5+ years cheese aging experience'),
    ('15344368-7F9B-4D7A-AE39-9875C7A92FC0', 'E006FF1E-CFFD-49F2-9C0F-3F3AB50E4D98',
     'Training', 'Complete 60-hour Affinage & Cave Management course', 1, 2,
     'Covers temperature, humidity control, aging techniques, and rind development'),
    ('8FE5FCEA-D821-40E1-8F0B-A3B347DF4A64', 'E006FF1E-CFFD-49F2-9C0F-3F3AB50E4D98',
     'Examination', 'Pass comprehensive affinage theory exam', 1, 3,
     'Minimum 80% score covering microbiology, aging science, and cave management'),
    ('FD8D4724-495D-4BC4-B409-591471CD6DF3', 'E006FF1E-CFFD-49F2-9C0F-3F3AB50E4D98',
     'Examination', 'Submit portfolio of aged cheeses with detailed documentation', 1, 4,
     'Must document aging process for minimum 5 different cheese types');

-- Additional requirements for other certifications
INSERT INTO [AssociationDemo].[CertificationRequirement]
    ([ID], [CertificationTypeID], [RequirementType], [Description], [IsRequired], [DisplayOrder])
VALUES
    ('B061A794-4006-4452-96DA-51196D1299AF', '2953BB6A-260A-4EBA-9330-55D7677D98F4',
     'Experience', 'Minimum 3 years cheesemaking production experience', 1, 1),
    ('9888BE2D-34D6-4A31-8D6F-52FC814D1A2A', '2953BB6A-260A-4EBA-9330-55D7677D98F4',
     'Training', 'Complete WCMA Cheesemaker Training Program', 1, 2),
    ('6073B358-04B6-4D56-8349-61629CB4E474', '2953BB6A-260A-4EBA-9330-55D7677D98F4',
     'Examination', 'Pass written and practical cheesemaking examinations', 1, 3),

    ('056776A0-390D-48A5-AF29-7F03F41535AB', '8A186D17-70E8-4E61-AF2A-FFA6EF1CD5B1',
     'Education', 'Bachelor''s degree in Dairy Science or related field', 1, 1),
    ('E51FC9DF-A415-4D16-A49B-61B02383E76D', '8A186D17-70E8-4E61-AF2A-FFA6EF1CD5B1',
     'Examination', 'Pass ADSA professional certification exam', 1, 2),

    ('7226A434-E66C-4CFC-8AD8-520E283531E7', '40879B5B-148B-4F5D-A3EC-6C8F3A31DBF9',
     'Training', 'Complete Dairy Processing Fundamentals course', 1, 1),
    ('E5ED8C9A-F7E7-4433-8923-8390D554087A', '40879B5B-148B-4F5D-A3EC-6C8F3A31DBF9',
     'Examination', 'Pass basic dairy processing competency exam', 1, 2),

    ('307AD475-3A5D-4494-9848-8863BE107F4E', '20AF7230-7A26-40EB-8F0D-ABBF0C663A80',
     'Prerequisites', 'Certified Cheesemaker or 5+ years experience', 1, 1),
    ('30A6B14C-69E9-4E6F-979D-F94A78C4A778', '20AF7230-7A26-40EB-8F0D-ABBF0C663A80',
     'Training', 'Complete Advanced Cheesemaking workshop series', 1, 2),

    ('A15ED29E-AF40-4612-B1C5-11ED371B580B', 'C97DDB91-88DC-4A98-B531-B52EF9879DA8',
     'Experience', 'Minimum 1 year retail cheese experience', 1, 1),
    ('B3628843-E051-47FC-B13C-A8C36E0AA234', 'C97DDB91-88DC-4A98-B531-B52EF9879DA8',
     'Training', 'Complete Cheesemonger Training Program', 1, 2),
    ('7DD38E34-F0CD-4EC5-8E32-658F8832D8FD', 'C97DDB91-88DC-4A98-B531-B52EF9879DA8',
     'Examination', 'Pass written and practical service examinations', 1, 3),

    ('B8D877C9-6027-4ECD-9D4F-E8E069AB80D4', '04F32D88-4BA9-4569-B4E8-E981A7D7C7F5',
     'Prerequisites', 'Dairy Science Professional certification or equivalent', 1, 1),
    ('4C3664D1-74C1-4CE6-850A-300D194DB0DC', '04F32D88-4BA9-4569-B4E8-E981A7D7C7F5',
     'Training', 'Complete Milk Quality & Safety certification course', 1, 2),
    ('D230BEA9-2A55-486A-9D80-A48CE0B8E671', '04F32D88-4BA9-4569-B4E8-E981A7D7C7F5',
     'Examination', 'Pass comprehensive milk quality assessment exam', 1, 3);
GO

-- ============================================================================
-- MEMBER CERTIFICATIONS
-- ============================================================================

-- Redeclare @EndDate for this batch
DECLARE @EndDate DATE = GETDATE();

PRINT 'Populating Member Certifications...';

-- This section creates 350+ realistic certifications for members
-- Using parameterized dates and tracking certification status

-- Certified Cheese Professional certifications (50 members)
INSERT INTO [AssociationDemo].[Certification]
    ([ID], [MemberID], [CertificationTypeID], [CertificationNumber], [DateEarned], [DateExpires],
     [Status], [Score], [LastRenewalDate], [NextRenewalDate], [CECreditsEarned])
SELECT TOP 50
    NEWID(),
    m.ID,
    'FDEBD0A0-5B85-4CEC-B41F-B3C260B08618',
    'CCP-' + RIGHT('00000' + CAST(ABS(CHECKSUM(NEWID())) % 100000 AS VARCHAR), 5),
    DATEADD(MONTH, -ABS(CHECKSUM(NEWID())) % 24, @EndDate),
    DATEADD(MONTH, 24 - (ABS(CHECKSUM(NEWID())) % 24), @EndDate),
    CASE WHEN (ABS(CHECKSUM(NEWID())) % 100) < 85 THEN 'Active'
         WHEN (ABS(CHECKSUM(NEWID())) % 100) < 95 THEN 'Pending Renewal'
         ELSE 'Expired' END,
    75 + (ABS(CHECKSUM(NEWID())) % 26),
    CASE WHEN (ABS(CHECKSUM(NEWID())) % 100) < 50
         THEN DATEADD(MONTH, -ABS(CHECKSUM(NEWID())) % 12, @EndDate)
         ELSE NULL END,
    DATEADD(MONTH, 24 - (ABS(CHECKSUM(NEWID())) % 24), @EndDate),
    (ABS(CHECKSUM(NEWID())) % 25)
FROM [AssociationDemo].[Member] m
ORDER BY NEWID();

-- Wisconsin Master Cheesemaker (5 elite members)
INSERT INTO [AssociationDemo].[Certification]
    ([ID], [MemberID], [CertificationTypeID], [CertificationNumber], [DateEarned], [DateExpires],
     [Status], [Score], [Notes], [CECreditsEarned])
SELECT TOP 5
    NEWID(),
    m.ID,
    'C36ED92E-E2D4-4800-8FE5-507386B82C66',
    'WMC-' + RIGHT('0000' + CAST(ABS(CHECKSUM(NEWID())) % 10000 AS VARCHAR), 4),
    DATEADD(YEAR, -(3 + ABS(CHECKSUM(NEWID())) % 5), @EndDate),
    DATEADD(YEAR, 3 - (ABS(CHECKSUM(NEWID())) % 3), @EndDate),
    'Active',
    92 + (ABS(CHECKSUM(NEWID())) % 9),
    CASE (ABS(CHECKSUM(NEWID())) % 5)
        WHEN 0 THEN 'Specialty: Cheddar and Colby varieties'
        WHEN 1 THEN 'Specialty: Swiss and Alpine-style cheeses'
        WHEN 2 THEN 'Specialty: Italian varieties (Parmesan, Asiago)'
        WHEN 3 THEN 'Specialty: Fresh and soft-ripened cheeses'
        ELSE 'Specialty: Blue cheese varieties'
    END,
    30 + (ABS(CHECKSUM(NEWID())) % 20)
FROM [AssociationDemo].[Member] m
ORDER BY NEWID();

-- Certified Cheesemaker (60 members)
INSERT INTO [AssociationDemo].[Certification]
    ([ID], [MemberID], [CertificationTypeID], [CertificationNumber], [DateEarned], [DateExpires],
     [Status], [Score], [CECreditsEarned])
SELECT TOP 60
    NEWID(),
    m.ID,
    '2953BB6A-260A-4EBA-9330-55D7677D98F4',
    'CCM-' + RIGHT('00000' + CAST(ABS(CHECKSUM(NEWID())) % 100000 AS VARCHAR), 5),
    DATEADD(MONTH, -ABS(CHECKSUM(NEWID())) % 36, @EndDate),
    DATEADD(MONTH, 36 - (ABS(CHECKSUM(NEWID())) % 36), @EndDate),
    CASE WHEN (ABS(CHECKSUM(NEWID())) % 100) < 80 THEN 'Active'
         WHEN (ABS(CHECKSUM(NEWID())) % 100) < 92 THEN 'Pending Renewal'
         ELSE 'Expired' END,
    78 + (ABS(CHECKSUM(NEWID())) % 23),
    (ABS(CHECKSUM(NEWID())) % 35)
FROM [AssociationDemo].[Member] m
ORDER BY NEWID();

-- Food Safety Manager Certification (80 members)
INSERT INTO [AssociationDemo].[Certification]
    ([ID], [MemberID], [CertificationTypeID], [CertificationNumber], [DateEarned], [DateExpires],
     [Status], [Score], [CECreditsEarned])
SELECT TOP 80
    NEWID(),
    m.ID,
    'C8AF1156-EE94-4EAF-9234-BA745DE6EBEC',
    'FSMC-' + RIGHT('00000' + CAST(ABS(CHECKSUM(NEWID())) % 100000 AS VARCHAR), 5),
    DATEADD(MONTH, -ABS(CHECKSUM(NEWID())) % 60, @EndDate),
    DATEADD(MONTH, 60 - (ABS(CHECKSUM(NEWID())) % 60), @EndDate),
    CASE WHEN (ABS(CHECKSUM(NEWID())) % 100) < 88 THEN 'Active'
         WHEN (ABS(CHECKSUM(NEWID())) % 100) < 96 THEN 'Pending Renewal'
         ELSE 'Expired' END,
    75 + (ABS(CHECKSUM(NEWID())) % 26),
    (ABS(CHECKSUM(NEWID())) % 18)
FROM [AssociationDemo].[Member] m
ORDER BY NEWID();

-- HACCP Coordinator (35 members)
INSERT INTO [AssociationDemo].[Certification]
    ([ID], [MemberID], [CertificationTypeID], [CertificationNumber], [DateEarned], [DateExpires],
     [Status], [Score], [CECreditsEarned])
SELECT TOP 35
    NEWID(),
    m.ID,
    '6906365A-B590-48BD-80FD-5103F53FD9AB',
    'HCC-' + RIGHT('00000' + CAST(ABS(CHECKSUM(NEWID())) % 100000 AS VARCHAR), 5),
    DATEADD(MONTH, -ABS(CHECKSUM(NEWID())) % 36, @EndDate),
    DATEADD(MONTH, 36 - (ABS(CHECKSUM(NEWID())) % 36), @EndDate),
    CASE WHEN (ABS(CHECKSUM(NEWID())) % 100) < 82 THEN 'Active'
         WHEN (ABS(CHECKSUM(NEWID())) % 100) < 94 THEN 'Pending Renewal'
         ELSE 'Expired' END,
    80 + (ABS(CHECKSUM(NEWID())) % 21),
    (ABS(CHECKSUM(NEWID())) % 28)
FROM [AssociationDemo].[Member] m
ORDER BY NEWID();

-- Certified Cheese Grader (25 members)
INSERT INTO [AssociationDemo].[Certification]
    ([ID], [MemberID], [CertificationTypeID], [CertificationNumber], [DateEarned], [DateExpires],
     [Status], [Score], [CECreditsEarned])
SELECT TOP 25
    NEWID(),
    m.ID,
    'CF9BA555-74C3-4F93-974A-09E1900BAA94',
    'CCG-' + RIGHT('00000' + CAST(ABS(CHECKSUM(NEWID())) % 100000 AS VARCHAR), 5),
    DATEADD(MONTH, -ABS(CHECKSUM(NEWID())) % 24, @EndDate),
    DATEADD(MONTH, 24 - (ABS(CHECKSUM(NEWID())) % 24), @EndDate),
    CASE WHEN (ABS(CHECKSUM(NEWID())) % 100) < 86 THEN 'Active'
         WHEN (ABS(CHECKSUM(NEWID())) % 100) < 95 THEN 'Pending Renewal'
         ELSE 'Expired' END,
    82 + (ABS(CHECKSUM(NEWID())) % 19),
    (ABS(CHECKSUM(NEWID())) % 22)
FROM [AssociationDemo].[Member] m
ORDER BY NEWID();

-- Certified Affineur (15 members - specialty)
INSERT INTO [AssociationDemo].[Certification]
    ([ID], [MemberID], [CertificationTypeID], [CertificationNumber], [DateEarned], [DateExpires],
     [Status], [Score], [Notes], [CECreditsEarned])
SELECT TOP 15
    NEWID(),
    m.ID,
    'E006FF1E-CFFD-49F2-9C0F-3F3AB50E4D98',
    'CAF-' + RIGHT('00000' + CAST(ABS(CHECKSUM(NEWID())) % 100000 AS VARCHAR), 5),
    DATEADD(MONTH, -ABS(CHECKSUM(NEWID())) % 36, @EndDate),
    DATEADD(MONTH, 36 - (ABS(CHECKSUM(NEWID())) % 36), @EndDate),
    CASE WHEN (ABS(CHECKSUM(NEWID())) % 100) < 84 THEN 'Active'
         ELSE 'Pending Renewal' END,
    85 + (ABS(CHECKSUM(NEWID())) % 16),
    CASE (ABS(CHECKSUM(NEWID())) % 4)
        WHEN 0 THEN 'Specialty: Bloomy rind and washed rind cheeses'
        WHEN 1 THEN 'Specialty: Natural rind and aged hard cheeses'
        WHEN 2 THEN 'Specialty: Blue cheese cave management'
        ELSE 'Specialty: Alpine-style and washed curd cheeses'
    END,
    20 + (ABS(CHECKSUM(NEWID())) % 15)
FROM [AssociationDemo].[Member] m
ORDER BY NEWID();

-- Dairy Science Professional (30 members)
INSERT INTO [AssociationDemo].[Certification]
    ([ID], [MemberID], [CertificationTypeID], [CertificationNumber], [DateEarned], [DateExpires],
     [Status], [Score], [CECreditsEarned])
SELECT TOP 30
    NEWID(),
    m.ID,
    '8A186D17-70E8-4E61-AF2A-FFA6EF1CD5B1',
    'DSP-' + RIGHT('00000' + CAST(ABS(CHECKSUM(NEWID())) % 100000 AS VARCHAR), 5),
    DATEADD(MONTH, -ABS(CHECKSUM(NEWID())) % 60, @EndDate),
    DATEADD(MONTH, 60 - (ABS(CHECKSUM(NEWID())) % 60), @EndDate),
    CASE WHEN (ABS(CHECKSUM(NEWID())) % 100) < 87 THEN 'Active'
         WHEN (ABS(CHECKSUM(NEWID())) % 100) < 95 THEN 'Pending Renewal'
         ELSE 'Expired' END,
    79 + (ABS(CHECKSUM(NEWID())) % 22),
    (ABS(CHECKSUM(NEWID())) % 24)
FROM [AssociationDemo].[Member] m
ORDER BY NEWID();

-- Dairy Processing Technician (40 members - entry level)
INSERT INTO [AssociationDemo].[Certification]
    ([ID], [MemberID], [CertificationTypeID], [CertificationNumber], [DateEarned], [DateExpires],
     [Status], [Score], [CECreditsEarned])
SELECT TOP 40
    NEWID(),
    m.ID,
    '40879B5B-148B-4F5D-A3EC-6C8F3A31DBF9',
    'DPT-' + RIGHT('00000' + CAST(ABS(CHECKSUM(NEWID())) % 100000 AS VARCHAR), 5),
    DATEADD(MONTH, -ABS(CHECKSUM(NEWID())) % 24, @EndDate),
    DATEADD(MONTH, 24 - (ABS(CHECKSUM(NEWID())) % 24), @EndDate),
    CASE WHEN (ABS(CHECKSUM(NEWID())) % 100) < 90 THEN 'Active'
         ELSE 'Pending Renewal' END,
    76 + (ABS(CHECKSUM(NEWID())) % 25),
    (ABS(CHECKSUM(NEWID())) % 14)
FROM [AssociationDemo].[Member] m
ORDER BY NEWID();

-- Advanced Cheesemaking Techniques (20 members)
INSERT INTO [AssociationDemo].[Certification]
    ([ID], [MemberID], [CertificationTypeID], [CertificationNumber], [DateEarned], [DateExpires],
     [Status], [CECreditsEarned])
SELECT TOP 20
    NEWID(),
    m.ID,
    '20AF7230-7A26-40EB-8F0D-ABBF0C663A80',
    'ACT-' + RIGHT('00000' + CAST(ABS(CHECKSUM(NEWID())) % 100000 AS VARCHAR), 5),
    DATEADD(MONTH, -ABS(CHECKSUM(NEWID())) % 36, @EndDate),
    DATEADD(MONTH, 36 - (ABS(CHECKSUM(NEWID())) % 36), @EndDate),
    CASE WHEN (ABS(CHECKSUM(NEWID())) % 100) < 83 THEN 'Active'
         ELSE 'Pending Renewal' END,
    25 + (ABS(CHECKSUM(NEWID())) % 12)
FROM [AssociationDemo].[Member] m
ORDER BY NEWID();

-- Certified Cheesemonger (35 members)
INSERT INTO [AssociationDemo].[Certification]
    ([ID], [MemberID], [CertificationTypeID], [CertificationNumber], [DateEarned], [DateExpires],
     [Status], [Score], [CECreditsEarned])
SELECT TOP 35
    NEWID(),
    m.ID,
    'C97DDB91-88DC-4A98-B531-B52EF9879DA8',
    'CCM-R-' + RIGHT('00000' + CAST(ABS(CHECKSUM(NEWID())) % 100000 AS VARCHAR), 5),
    DATEADD(MONTH, -ABS(CHECKSUM(NEWID())) % 24, @EndDate),
    DATEADD(MONTH, 24 - (ABS(CHECKSUM(NEWID())) % 24), @EndDate),
    CASE WHEN (ABS(CHECKSUM(NEWID())) % 100) < 88 THEN 'Active'
         WHEN (ABS(CHECKSUM(NEWID())) % 100) < 96 THEN 'Pending Renewal'
         ELSE 'Expired' END,
    77 + (ABS(CHECKSUM(NEWID())) % 24),
    (ABS(CHECKSUM(NEWID())) % 17)
FROM [AssociationDemo].[Member] m
ORDER BY NEWID();

-- Milk Quality & Safety Specialist (18 members)
INSERT INTO [AssociationDemo].[Certification]
    ([ID], [MemberID], [CertificationTypeID], [CertificationNumber], [DateEarned], [DateExpires],
     [Status], [Score], [CECreditsEarned])
SELECT TOP 18
    NEWID(),
    m.ID,
    '04F32D88-4BA9-4569-B4E8-E981A7D7C7F5',
    'MQSS-' + RIGHT('00000' + CAST(ABS(CHECKSUM(NEWID())) % 100000 AS VARCHAR), 5),
    DATEADD(MONTH, -ABS(CHECKSUM(NEWID())) % 36, @EndDate),
    DATEADD(MONTH, 36 - (ABS(CHECKSUM(NEWID())) % 36), @EndDate),
    CASE WHEN (ABS(CHECKSUM(NEWID())) % 100) < 85 THEN 'Active'
         ELSE 'Pending Renewal' END,
    81 + (ABS(CHECKSUM(NEWID())) % 20),
    (ABS(CHECKSUM(NEWID())) % 20)
FROM [AssociationDemo].[Member] m
ORDER BY NEWID();

GO

-- ============================================================================
-- CONTINUING EDUCATION RECORDS
-- ============================================================================

-- Redeclare @EndDate for this batch
DECLARE @EndDate DATE = GETDATE();

PRINT 'Populating Continuing Education Records...';

-- Create CE records for members with active certifications
INSERT INTO [AssociationDemo].[ContinuingEducation]
    ([ID], [MemberID], [CertificationID], [ActivityTitle], [ActivityType], [Provider],
     [CompletionDate], [CreditsEarned], [CreditsType], [HoursSpent], [Status])
SELECT TOP 85
    NEWID(),
    c.MemberID,
    c.ID,
    CASE (ABS(CHECKSUM(NEWID())) % 15)
        WHEN 0 THEN 'Advanced Cheese Microbiology Workshop'
        WHEN 1 THEN 'Troubleshooting Common Cheesemaking Problems'
        WHEN 2 THEN 'Modern Cave Management Techniques'
        WHEN 3 THEN 'Food Safety and HACCP Updates for Cheese Plants'
        WHEN 4 THEN 'Sensory Evaluation and Flavor Development'
        WHEN 5 THEN 'Sustainable Cheesemaking Practices'
        WHEN 6 THEN 'Marketing and Selling Artisan Cheese'
        WHEN 7 THEN 'Advanced Starter Culture Management'
        WHEN 8 THEN 'Cheese Competition Judging Seminar'
        WHEN 9 THEN 'Raw Milk Cheese Safety Protocol'
        WHEN 10 THEN 'Organic Cheese Production Standards'
        WHEN 11 THEN 'European Cheese Tour and Education'
        WHEN 12 THEN 'Pasteurization and Milk Processing'
        WHEN 13 THEN 'Cheese Packaging and Shelf Life Extension'
        ELSE 'Business Management for Small Creameries'
    END,
    CASE (ABS(CHECKSUM(NEWID())) % 5)
        WHEN 0 THEN 'Workshop'
        WHEN 1 THEN 'Conference'
        WHEN 2 THEN 'Webinar'
        WHEN 3 THEN 'Course'
        ELSE 'Self-Study'
    END,
    CASE (ABS(CHECKSUM(NEWID())) % 6)
        WHEN 0 THEN 'American Cheese Society'
        WHEN 1 THEN 'Wisconsin Cheese Makers Association'
        WHEN 2 THEN 'American Dairy Science Association'
        WHEN 3 THEN 'University of Wisconsin - Madison'
        WHEN 4 THEN 'Vermont Institute for Artisan Cheese'
        ELSE 'California Artisan Cheese Guild'
    END,
    DATEADD(DAY, -ABS(CHECKSUM(NEWID())) % 730, @EndDate),
    CAST((1 + (ABS(CHECKSUM(NEWID())) % 8)) AS DECIMAL(5,2)),
    'CE',
    CAST((2 + (ABS(CHECKSUM(NEWID())) % 16)) AS DECIMAL(5,2)),
    'Approved'
FROM [AssociationDemo].[Certification] c
WHERE c.Status = 'Active'
ORDER BY NEWID();

GO

-- ============================================================================
-- CERTIFICATION RENEWALS
-- ============================================================================

PRINT 'Populating Certification Renewals...';

-- Create renewal records for certifications that have been renewed
INSERT INTO [AssociationDemo].[CertificationRenewal]
    ([ID], [CertificationID], [RenewalDate], [ExpirationDate], [CECreditsApplied],
     [FeePaid], [PaymentDate], [Status], [ProcessedDate])
SELECT TOP 60
    NEWID(),
    c.ID,
    c.LastRenewalDate,
    c.DateExpires,
    c.CECreditsEarned,
    CASE
        WHEN ct.CostUSD IS NOT NULL THEN ct.CostUSD * 0.75
        ELSE 250.00
    END,
    DATEADD(DAY, -5, c.LastRenewalDate),
    'Completed',
    c.LastRenewalDate
FROM [AssociationDemo].[Certification] c
INNER JOIN [AssociationDemo].[CertificationType] ct ON c.CertificationTypeID = ct.ID
WHERE c.LastRenewalDate IS NOT NULL
    AND c.Status = 'Active'
ORDER BY NEWID();

GO

PRINT 'Certification data population complete!';
PRINT '';
GO
