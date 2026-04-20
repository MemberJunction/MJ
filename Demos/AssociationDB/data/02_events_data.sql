/******************************************************************************
 * Association Sample Database - Events Data
 * File: 02_events_data.sql
 *
 * International Cheese Federation (ICF) Events
 * Generates comprehensive events data including:
 * - 3 ICF Annual Meetings (2024, 2025, 2026) - 3rd Sunday of April
 * - 6 Cheese Symposiums (Cheddar, Feta, Swiss themed)
 * - 4 Joint Conferences
 * - 8 Webinars
 * - Event Registrations with YoY growth trends
 *
 * All dates are relative to parameters defined in 00_parameters.sql
 ******************************************************************************/


-- Parameters are loaded by MASTER_BUILD script before this file

-- ============================================================================
-- CALCULATE 3RD SUNDAY OF APRIL FOR ANNUAL MEETINGS
-- ============================================================================

-- Calculate the 3rd Sunday of April for years 2024, 2025, 2026
-- 3rd Sunday = First day of April + offset to first Sunday + 14 days (2 more weeks)
DECLARE @Year2024 INT = YEAR(@EndDate) - 1;  -- Last year
DECLARE @Year2025 INT = YEAR(@EndDate);      -- Current year
DECLARE @Year2026 INT = YEAR(@EndDate) + 1;  -- Next year

-- Calculate 3rd Sunday of April for each year
DECLARE @April2024Start DATE = DATEFROMPARTS(@Year2024, 4, 1);
DECLARE @DaysToFirstSunday2024 INT = (8 - DATEPART(WEEKDAY, @April2024Start)) % 7;
DECLARE @ThirdSunday2024 DATE = DATEADD(DAY, @DaysToFirstSunday2024 + 14, @April2024Start);

DECLARE @April2025Start DATE = DATEFROMPARTS(@Year2025, 4, 1);
DECLARE @DaysToFirstSunday2025 INT = (8 - DATEPART(WEEKDAY, @April2025Start)) % 7;
DECLARE @ThirdSunday2025 DATE = DATEADD(DAY, @DaysToFirstSunday2025 + 14, @April2025Start);

DECLARE @April2026Start DATE = DATEFROMPARTS(@Year2026, 4, 1);
DECLARE @DaysToFirstSunday2026 INT = (8 - DATEPART(WEEKDAY, @April2026Start)) % 7;
DECLARE @ThirdSunday2026 DATE = DATEADD(DAY, @DaysToFirstSunday2026 + 14, @April2026Start);


-- ============================================================================
-- EVENTS (21 Events - ICF Themed)
-- ============================================================================


-- ICF ANNUAL MEETINGS (3 events - showing YoY growth)
INSERT INTO [AssociationDemo].[Event] (ID, Name, EventType, StartDate, EndDate, Timezone, Location, IsVirtual, Capacity, RegistrationOpenDate, RegistrationCloseDate, MemberPrice, NonMemberPrice, CEUCredits, Description, Status)
VALUES
    -- 2024 Annual Meeting (Completed) - 950 attendees out of 1000 capacity
    (@Event_AnnualConf2024, 'ICF 2024 Annual Meeting', 'Conference',
     CAST(@ThirdSunday2024 AS DATETIME), DATEADD(DAY, 3, CAST(@ThirdSunday2024 AS DATETIME)), 'America/Chicago',
     'Wisconsin Center, Milwaukee, WI', 0, 1000,
     DATEADD(DAY, -90, @ThirdSunday2024), DATEADD(DAY, -1, @ThirdSunday2024),
     595.00, 795.00, 16.0,
     'The premier gathering of cheese professionals from around the world. Four days of education, networking, and celebration of artisan cheese excellence.',
     'Completed'),

    -- 2025 Annual Meeting (Completed) - 1050 attendees out of 1100 capacity (10.5% growth)
    (NEWID(), 'ICF 2025 Annual Meeting', 'Conference',
     CAST(@ThirdSunday2025 AS DATETIME), DATEADD(DAY, 3, CAST(@ThirdSunday2025 AS DATETIME)), 'America/Los_Angeles',
     'Moscone Center, San Francisco, CA', 0, 1100,
     DATEADD(DAY, -90, @ThirdSunday2025), DATEADD(DAY, -1, @ThirdSunday2025),
     645.00, 845.00, 16.0,
     'Building on record attendance! Join the global cheese community for innovation, education, and unforgettable cheese experiences.',
     'Completed'),

    -- 2026 Annual Meeting (Registration Open) - Target 1150 out of 1200 capacity
    (NEWID(), 'ICF 2026 Annual Meeting', 'Conference',
     CAST(@ThirdSunday2026 AS DATETIME), DATEADD(DAY, 3, CAST(@ThirdSunday2026 AS DATETIME)), 'America/New_York',
     'Jacob Javits Center, New York, NY', 0, 1200,
     DATEADD(DAY, -90, @ThirdSunday2026), DATEADD(DAY, -1, @ThirdSunday2026),
     695.00, 895.00, 16.0,
     'Our biggest annual meeting yet! Four days of cheese mastery featuring keynotes from industry legends, hands-on workshops, and the Grand Cheese Awards.',
     'Registration Open');


-- CHEESE SYMPOSIUMS (6 events - specialty cheese focused)
INSERT INTO [AssociationDemo].[Event] (ID, Name, EventType, StartDate, EndDate, Timezone, Location, IsVirtual, Capacity, RegistrationOpenDate, RegistrationCloseDate, MemberPrice, NonMemberPrice, CEUCredits, Description, Status)
VALUES
    -- Cheddar Symposiums
    (NEWID(), 'International Cheddar Symposium 2024', 'Workshop',
     DATEADD(DAY, -245, @EndDate), DATEADD(DAY, -244, @EndDate), 'America/Chicago',
     'Tillamook Creamery, Tillamook, OR', 0, 150,
     DATEADD(DAY, -290, @EndDate), DATEADD(DAY, -246, @EndDate),
     295.00, 425.00, 6.0,
     'Deep dive into cheddar production, aging techniques, and flavor development. Features tours of award-winning cheddar facilities.',
     'Completed'),

    (NEWID(), 'Artisan Cheddar Workshop 2026', 'Workshop',
     DATEADD(DAY, 95, @EndDate), DATEADD(DAY, 96, @EndDate), 'America/New_York',
     'Vermont Cheese Council, Burlington, VT', 0, 120,
     DATEADD(DAY, 45, @EndDate), DATEADD(DAY, 94, @EndDate),
     325.00, 475.00, 6.0,
     'Master the art of artisan cheddar making. Hands-on sessions with Vermont''s finest cheddar producers.',
     'Published'),

    -- Feta Symposiums
    (NEWID(), 'Mediterranean Feta Symposium', 'Workshop',
     DATEADD(DAY, -180, @EndDate), DATEADD(DAY, -179, @EndDate), 'America/Los_Angeles',
     'Culinary Institute, San Francisco, CA', 0, 100,
     DATEADD(DAY, -220, @EndDate), DATEADD(DAY, -181, @EndDate),
     275.00, 395.00, 5.0,
     'Exploring traditional and modern feta production methods. Greek cheese masters share centuries-old techniques.',
     'Completed'),

    (NEWID(), 'Feta & Soft Cheese Innovations', 'Workshop',
     DATEADD(DAY, 125, @EndDate), DATEADD(DAY, 126, @EndDate), 'America/Chicago',
     'Chicago Culinary Center, Chicago, IL', 0, 110,
     DATEADD(DAY, 75, @EndDate), DATEADD(DAY, 124, @EndDate),
     295.00, 425.00, 5.0,
     'Innovation in soft cheese production. Focus on feta, chevre, and fresh cheese trends.',
     'Published'),

    -- Swiss Symposiums
    (NEWID(), 'Alpine Swiss Cheese Symposium 2025', 'Workshop',
     DATEADD(DAY, -95, @EndDate), DATEADD(DAY, -94, @EndDate), 'America/Denver',
     'Colorado Convention Center, Denver, CO', 0, 130,
     DATEADD(DAY, -140, @EndDate), DATEADD(DAY, -96, @EndDate),
     325.00, 475.00, 6.0,
     'Traditional Swiss cheese making in the Alps. Eye formation, aging, and flavor development in alpine cheese.',
     'Completed'),

    (NEWID(), 'Swiss Cheese Production Excellence', 'Workshop',
     DATEADD(DAY, 155, @EndDate), DATEADD(DAY, 156, @EndDate), 'America/Los_Angeles',
     'Cheese Heritage Center, Green Bay, WI', 0, 95,
     DATEADD(DAY, 105, @EndDate), DATEADD(DAY, 154, @EndDate),
     295.00, 425.00, 5.0,
     'Perfect your Swiss cheese production. Expert-led sessions on temperature control, bacteria cultures, and quality.',
     'Draft');


-- JOINT CONFERENCES (4 events - collaborative multi-topic)
INSERT INTO [AssociationDemo].[Event] (ID, Name, EventType, StartDate, EndDate, Timezone, Location, IsVirtual, Capacity, RegistrationOpenDate, RegistrationCloseDate, MemberPrice, NonMemberPrice, CEUCredits, Description, Status)
VALUES
    -- Past Joint Conferences (showing mixed trends)
    (NEWID(), 'Joint Conference on Dairy Innovation', 'Conference',
     DATEADD(DAY, -320, @EndDate), DATEADD(DAY, -318, @EndDate), 'America/Chicago',
     'McCormick Place, Chicago, IL', 0, 275,
     DATEADD(DAY, -380, @EndDate), DATEADD(DAY, -321, @EndDate),
     495.00, 695.00, 10.0,
     'Collaborative conference bringing together dairy farmers, cheese makers, and distributors. Focus on sustainable dairy practices.',
     'Completed'),

    (NEWID(), 'Joint Conference on Artisan Cheese Economics', 'Conference',
     DATEADD(DAY, -155, @EndDate), DATEADD(DAY, -153, @EndDate), 'America/New_York',
     'New York Hilton Midtown, New York, NY', 0, 225,
     DATEADD(DAY, -210, @EndDate), DATEADD(DAY, -156, @EndDate),
     545.00, 745.00, 10.0,
     'Economics of small-batch cheese production. Business models, pricing strategies, and market trends.',
     'Completed'),

    -- Future Joint Conferences
    (NEWID(), 'Joint Conference on Cheese & Wine Pairing', 'Conference',
     DATEADD(DAY, 65, @EndDate), DATEADD(DAY, 67, @EndDate), 'America/Los_Angeles',
     'Napa Valley Conference Center, Napa, CA', 0, 250,
     DATEADD(DAY, 15, @EndDate), DATEADD(DAY, 64, @EndDate),
     595.00, 795.00, 10.0,
     'The intersection of cheese and wine. Master sommeliers and fromagers share pairing secrets and techniques.',
     'Registration Open'),

    (NEWID(), 'Joint Conference on Sustainable Cheese Production', 'Conference',
     DATEADD(DAY, 185, @EndDate), DATEADD(DAY, 187, @EndDate), 'America/Denver',
     'Colorado Convention Center, Denver, CO', 0, 200,
     DATEADD(DAY, 135, @EndDate), DATEADD(DAY, 184, @EndDate),
     545.00, 745.00, 10.0,
     'Environmental sustainability in cheese production. Carbon footprint reduction, regenerative agriculture, and eco-packaging.',
     'Published');


-- WEBINARS (8 events - virtual education)
INSERT INTO [AssociationDemo].[Event] (ID, Name, EventType, StartDate, EndDate, Timezone, Location, IsVirtual, VirtualPlatform, MeetingURL, Capacity, RegistrationOpenDate, RegistrationCloseDate, MemberPrice, NonMemberPrice, CEUCredits, Description, Status)
VALUES
    -- Completed Webinars
    (NEWID(), 'Cheese Safety & HACCP Compliance', 'Webinar',
     DATEADD(DAY, -210, @EndDate), DATEADD(DAY, -210, @EndDate), 'America/New_York',
     'Virtual', 1, 'Zoom', 'https://zoom.us/j/cheese-safety', 500,
     DATEADD(DAY, -240, @EndDate), DATEADD(DAY, -211, @EndDate),
     0.00, 49.00, 1.5,
     'Food safety regulations for cheese producers. HACCP plans, testing protocols, and compliance best practices.',
     'Completed'),

    (NEWID(), 'Aging Cheese: Temperature & Humidity Control', 'Webinar',
     DATEADD(DAY, -145, @EndDate), DATEADD(DAY, -145, @EndDate), 'America/Chicago',
     'Virtual', 1, 'Teams', 'https://teams.microsoft.com/aging-cheese', 500,
     DATEADD(DAY, -175, @EndDate), DATEADD(DAY, -146, @EndDate),
     0.00, 49.00, 1.5,
     'Perfect aging conditions for different cheese varieties. Cave management and quality control.',
     'Completed'),

    (NEWID(), 'Marketing Your Artisan Cheese Brand', 'Webinar',
     DATEADD(DAY, -75, @EndDate), DATEADD(DAY, -75, @EndDate), 'America/Los_Angeles',
     'Virtual', 1, 'Zoom', 'https://zoom.us/j/cheese-marketing', 500,
     DATEADD(DAY, -105, @EndDate), DATEADD(DAY, -76, @EndDate),
     0.00, 49.00, 1.0,
     'Build your cheese brand. Social media strategies, storytelling, and direct-to-consumer sales.',
     'Completed'),

    (NEWID(), 'Milk Quality for Cheesemaking', 'Webinar',
     DATEADD(DAY, -25, @EndDate), DATEADD(DAY, -25, @EndDate), 'America/Chicago',
     'Virtual', 1, 'Zoom', 'https://zoom.us/j/milk-quality', 500,
     DATEADD(DAY, -55, @EndDate), DATEADD(DAY, -26, @EndDate),
     0.00, 49.00, 1.5,
     'From farm to vat: ensuring optimal milk quality. Testing, handling, and storage best practices.',
     'Completed'),

    -- Upcoming Webinars
    (NEWID(), 'Cheese Export Regulations & Documentation', 'Webinar',
     DATEADD(DAY, 35, @EndDate), DATEADD(DAY, 35, @EndDate), 'America/New_York',
     'Virtual', 1, 'Zoom', 'https://zoom.us/j/export-regs', 750,
     DATEADD(DAY, 5, @EndDate), DATEADD(DAY, 34, @EndDate),
     0.00, 49.00, 1.5,
     'Navigate international cheese exports. Certifications, customs, and compliance for global markets.',
     'Registration Open'),

    (NEWID(), 'Innovative Cheese Packaging Solutions', 'Webinar',
     DATEADD(DAY, 70, @EndDate), DATEADD(DAY, 70, @EndDate), 'America/Los_Angeles',
     'Virtual', 1, 'Teams', 'https://teams.microsoft.com/packaging', 500,
     DATEADD(DAY, 40, @EndDate), DATEADD(DAY, 69, @EndDate),
     0.00, 49.00, 1.0,
     'Sustainable packaging innovations. Biodegradable materials, vacuum sealing, and shelf-life extension.',
     'Published'),

    (NEWID(), 'Cheese Cultures & Flavor Development', 'Webinar',
     DATEADD(DAY, 110, @EndDate), DATEADD(DAY, 110, @EndDate), 'America/Chicago',
     'Virtual', 1, 'Zoom', 'https://zoom.us/j/cultures', 500,
     DATEADD(DAY, 80, @EndDate), DATEADD(DAY, 109, @EndDate),
     0.00, 49.00, 1.5,
     'Master cheese cultures. Starter selection, flavor profiles, and troubleshooting fermentation issues.',
     'Published'),

    (NEWID(), 'Building a Profitable Cheese Business', 'Webinar',
     DATEADD(DAY, 145, @EndDate), DATEADD(DAY, 145, @EndDate), 'America/New_York',
     'Virtual', 1, 'Zoom', 'https://zoom.us/j/cheese-business', 500,
     DATEADD(DAY, 115, @EndDate), DATEADD(DAY, 144, @EndDate),
     0.00, 49.00, 1.0,
     'Financial planning for cheese startups. Pricing, cash flow management, and scaling production.',
     'Draft'),

-- UPCOMING EVENTS (0-90 Days) - Guaranteed visibility in "next 30 days" views
-- These events ensure there's always something happening in any 30-day window

    -- Week 1 (Days 2-6)
    (NEWID(), 'Cheese Photography Workshop', 'Workshop',
     DATEADD(DAY, 2, @EndDate), DATEADD(DAY, 2, @EndDate), 'America/Los_Angeles',
     'Virtual', 1, 'Zoom', 'https://zoom.us/j/cheese-photo', 100,
     DATEADD(DAY, -7, @EndDate), DATEADD(DAY, 1, @EndDate),
     25.00, 75.00, 0.5,
     'Learn to capture stunning cheese photography for marketing and social media. Lighting, composition, and styling techniques.',
     'Registration Open'),

    (NEWID(), 'Local Chapter Leadership Call', 'Chapter Meeting',
     DATEADD(DAY, 5, @EndDate), DATEADD(DAY, 5, @EndDate), 'America/Chicago',
     'Virtual', 1, 'Teams', 'https://teams.microsoft.com/chapter-leads', 50,
     DATEADD(DAY, -5, @EndDate), DATEADD(DAY, 4, @EndDate),
     0.00, 0.00, 0.0,
     'Monthly call for chapter leaders to share best practices and coordinate regional activities.',
     'Registration Open'),

    -- Week 2 (Days 8-14)
    (NEWID(), 'Cheese Tasting Techniques', 'Workshop',
     DATEADD(DAY, 10, @EndDate), DATEADD(DAY, 10, @EndDate), 'America/New_York',
     'Virtual', 1, 'Zoom', 'https://zoom.us/j/tasting', 200,
     DATEADD(DAY, -10, @EndDate), DATEADD(DAY, 9, @EndDate),
     15.00, 45.00, 1.0,
     'Professional cheese tasting and evaluation. Develop your palate, identify flavor notes, and conduct tasting sessions.',
     'Registration Open'),

    (NEWID(), 'Small Batch Cheesemaking Equipment Guide', 'Webinar',
     DATEADD(DAY, 12, @EndDate), DATEADD(DAY, 12, @EndDate), 'America/Chicago',
     'Virtual', 1, 'Zoom', 'https://zoom.us/j/equipment', 300,
     DATEADD(DAY, -8, @EndDate), DATEADD(DAY, 11, @EndDate),
     0.00, 35.00, 1.0,
     'Essential equipment for starting a small cheese operation. Cost-effective solutions and vendor recommendations.',
     'Registration Open'),

    -- Week 3 (Days 18-21)
    (NEWID(), 'Cheese Cave Tour: Virtual Edition', 'Virtual Summit',
     DATEADD(DAY, 18, @EndDate), DATEADD(DAY, 18, @EndDate), 'America/Los_Angeles',
     'Virtual', 1, 'Zoom', 'https://zoom.us/j/cave-tour', 500,
     DATEADD(DAY, -5, @EndDate), DATEADD(DAY, 17, @EndDate),
     0.00, 25.00, 0.0,
     'Live virtual tour of award-winning cheese caves. See aging facilities and ask questions to master cheesemakers.',
     'Registration Open'),

    (NEWID(), 'Cheese Board Competition: Spring Edition', 'Conference',
     DATEADD(DAY, 21, @EndDate), DATEADD(DAY, 21, @EndDate), 'America/Chicago',
     'Hybrid', 0, NULL, 'https://cheesemakers.org/competition-spring', 75,
     DATEADD(DAY, -30, @EndDate), DATEADD(DAY, 14, @EndDate),
     50.00, 100.00, 0.0,
     'Submit your best cheese board designs for judging. Categories: Traditional, Modern, and Innovative Pairings.',
     'Registration Open'),

    -- Week 4 (Days 25-28)
    (NEWID(), 'Dairy Farm Partnership Strategies', 'Webinar',
     DATEADD(DAY, 25, @EndDate), DATEADD(DAY, 25, @EndDate), 'America/New_York',
     'Virtual', 1, 'Teams', 'https://teams.microsoft.com/dairy-partnership', 200,
     DATEADD(DAY, -10, @EndDate), DATEADD(DAY, 24, @EndDate),
     0.00, 40.00, 1.0,
     'Build strong relationships with dairy farms. Contract negotiation, quality agreements, and long-term partnerships.',
     'Registration Open'),

    (NEWID(), 'Regulatory Update: FDA Cheese Standards', 'Webinar',
     DATEADD(DAY, 28, @EndDate), DATEADD(DAY, 28, @EndDate), 'America/Chicago',
     'Virtual', 1, 'Zoom', 'https://zoom.us/j/fda-update', 400,
     DATEADD(DAY, -14, @EndDate), DATEADD(DAY, 27, @EndDate),
     0.00, 50.00, 1.5,
     'Latest FDA regulations affecting cheese production. Standards of identity, labeling requirements, and compliance updates.',
     'Registration Open'),

    -- Week 5-6 (Days 35-42)
    (NEWID(), 'Cheese & Beverage Pairing Masterclass', 'Workshop',
     DATEADD(DAY, 35, @EndDate), DATEADD(DAY, 35, @EndDate), 'America/Los_Angeles',
     'Virtual', 1, 'Zoom', 'https://zoom.us/j/pairing', 150,
     DATEADD(DAY, -20, @EndDate), DATEADD(DAY, 34, @EndDate),
     30.00, 80.00, 1.5,
     'Master the art of pairing cheese with wine, beer, spirits, and non-alcoholic beverages. Professional sommelier instruction.',
     'Registration Open'),

    (NEWID(), 'Cheese Retail & Merchandising Best Practices', 'Webinar',
     DATEADD(DAY, 40, @EndDate), DATEADD(DAY, 40, @EndDate), 'America/Chicago',
     'Virtual', 1, 'Zoom', 'https://zoom.us/j/retail', 250,
     DATEADD(DAY, -15, @EndDate), DATEADD(DAY, 39, @EndDate),
     0.00, 45.00, 1.0,
     'Optimize cheese sales in retail environments. Display strategies, customer education, and inventory management.',
     'Registration Open'),

    -- Week 7-8 (Days 50-56)
    (NEWID(), 'Artisan Cheese Troubleshooting Clinic', 'Workshop',
     DATEADD(DAY, 52, @EndDate), DATEADD(DAY, 52, @EndDate), 'America/New_York',
     'Virtual', 1, 'Zoom', 'https://zoom.us/j/troubleshoot', 100,
     DATEADD(DAY, -20, @EndDate), DATEADD(DAY, 51, @EndDate),
     20.00, 60.00, 1.5,
     'Solve common cheesemaking problems. Bring your challenges and get expert advice on texture, flavor, and production issues.',
     'Registration Open'),

    (NEWID(), 'Cheese Industry Networking Mixer', 'Networking',
     DATEADD(DAY, 55, @EndDate), DATEADD(DAY, 55, @EndDate), 'America/Chicago',
     'Virtual', 1, 'Gather', 'https://gather.town/cheese-mixer', 200,
     DATEADD(DAY, -10, @EndDate), DATEADD(DAY, 54, @EndDate),
     0.00, 15.00, 0.0,
     'Casual networking event for cheese professionals. Meet colleagues, share experiences, and build connections in a virtual space.',
     'Registration Open'),

    -- Week 10-12 (Days 70-85)
    (NEWID(), 'Grant Writing for Cheese Businesses', 'Webinar',
     DATEADD(DAY, 72, @EndDate), DATEADD(DAY, 72, @EndDate), 'America/Los_Angeles',
     'Virtual', 1, 'Zoom', 'https://zoom.us/j/grants', 150,
     DATEADD(DAY, -25, @EndDate), DATEADD(DAY, 71, @EndDate),
     0.00, 55.00, 1.0,
     'Navigate agricultural grants and funding opportunities. Application strategies, USDA programs, and state-level resources.',
     'Registration Open'),

    (NEWID(), 'Seasonal Cheese Innovation Workshop', 'Workshop',
     DATEADD(DAY, 85, @EndDate), DATEADD(DAY, 85, @EndDate), 'America/New_York',
     'Virtual', 1, 'Teams', 'https://teams.microsoft.com/seasonal', 100,
     DATEADD(DAY, -30, @EndDate), DATEADD(DAY, 84, @EndDate),
     35.00, 95.00, 2.0,
     'Create seasonal cheese varieties and limited releases. Recipe development, market testing, and production planning.',
     'Registration Open');


-- ============================================================================
-- EVENT REGISTRATIONS (Generated Programmatically with YoY Growth)
-- ============================================================================


-- Event registrations with SPECIAL HANDLING for Annual Meetings to show YoY growth
-- and "repeat attender" analysis possibilities

-- For Annual Meetings: Use specific target counts to show YoY growth
-- 2024: 950 attendees, 2025: 1050 attendees (10.5% growth), 2026: 400 so far (partial)

-- 2024 Annual Meeting Registrations (950 attendees)
INSERT INTO [AssociationDemo].[EventRegistration] (ID, EventID, MemberID, RegistrationDate, RegistrationType, Status, CheckInTime, CEUAwarded)
SELECT
    NEWID(),
    @Event_AnnualConf2024,
    m.ID,
    DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 60), CAST(@ThirdSunday2024 AS DATETIME)),
    CASE WHEN ABS(CHECKSUM(NEWID()) % 100) < 35 THEN 'Early Bird' ELSE 'Standard' END,
    CASE ABS(CHECKSUM(NEWID()) % 100)
        WHEN 0 THEN 'No Show'
        WHEN 1 THEN 'No Show'
        WHEN 2 THEN 'No Show'
        WHEN 3 THEN 'No Show'
        WHEN 4 THEN 'Registered'
        WHEN 5 THEN 'Registered'
        WHEN 6 THEN 'Registered'
        ELSE 'Attended'
    END,
    CASE
        WHEN ABS(CHECKSUM(NEWID()) % 100) < 90
        THEN DATEADD(MINUTE, 480 + ABS(CHECKSUM(NEWID()) % 120), CAST(@ThirdSunday2024 AS DATETIME))
        ELSE NULL
    END,
    CASE WHEN ABS(CHECKSUM(NEWID()) % 100) < 90 THEN 1 ELSE 0 END
FROM (
    SELECT TOP 950 ID
    FROM [AssociationDemo].[Member]
    WHERE JoinDate < CAST(@ThirdSunday2024 AS DATETIME)
    ORDER BY NEWID()
) m;


-- 2025 Annual Meeting Registrations (1050 attendees - includes repeat attendees from 2024)
-- 70% are repeat attendees from 2024, 30% are new
INSERT INTO [AssociationDemo].[EventRegistration] (ID, EventID, MemberID, RegistrationDate, RegistrationType, Status, CheckInTime, CEUAwarded)
SELECT
    NEWID(),
    e.ID,
    m.ID,
    DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 60), CAST(@ThirdSunday2025 AS DATETIME)),
    CASE WHEN ABS(CHECKSUM(NEWID()) % 100) < 40 THEN 'Early Bird' ELSE 'Standard' END,
    CASE ABS(CHECKSUM(NEWID()) % 100)
        WHEN 0 THEN 'No Show'
        WHEN 1 THEN 'No Show'
        WHEN 2 THEN 'No Show'
        WHEN 3 THEN 'Registered'
        WHEN 4 THEN 'Registered'
        WHEN 5 THEN 'Registered'
        ELSE 'Attended'
    END,
    CASE
        WHEN ABS(CHECKSUM(NEWID()) % 100) < 92
        THEN DATEADD(MINUTE, 480 + ABS(CHECKSUM(NEWID()) % 120), CAST(@ThirdSunday2025 AS DATETIME))
        ELSE NULL
    END,
    CASE WHEN ABS(CHECKSUM(NEWID()) % 100) < 92 THEN 1 ELSE 0 END
FROM [AssociationDemo].[Event] e
CROSS APPLY (
    -- 70% repeat attendees from 2024
    SELECT TOP 735 er.MemberID AS ID
    FROM [AssociationDemo].[EventRegistration] er
    WHERE er.EventID = @Event_AnnualConf2024
    AND er.Status = 'Attended'
    ORDER BY NEWID()

    UNION ALL

    -- 30% new attendees
    SELECT TOP 315 m2.ID
    FROM [AssociationDemo].[Member] m2
    WHERE m2.JoinDate < CAST(@ThirdSunday2025 AS DATETIME)
    AND m2.ID NOT IN (
        SELECT MemberID
        FROM [AssociationDemo].[EventRegistration]
        WHERE EventID = @Event_AnnualConf2024
    )
    ORDER BY NEWID()
) m
WHERE e.Name = 'ICF 2025 Annual Meeting';


-- 2026 Annual Meeting Registrations (400 so far - registration still open)
-- Mix of repeat and new attendees
INSERT INTO [AssociationDemo].[EventRegistration] (ID, EventID, MemberID, RegistrationDate, RegistrationType, Status, CheckInTime, CEUAwarded)
SELECT
    NEWID(),
    e.ID,
    m.ID,
    DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 30), CAST(GETDATE() AS DATETIME)),  -- Recent registrations
    CASE WHEN ABS(CHECKSUM(NEWID()) % 100) < 60 THEN 'Early Bird' ELSE 'Standard' END,
    'Registered',  -- All still just registered, event hasn't happened
    NULL,
    0
FROM [AssociationDemo].[Event] e
CROSS APPLY (
    SELECT TOP 400 m2.ID
    FROM [AssociationDemo].[Member] m2
    WHERE m2.JoinDate < CAST(@ThirdSunday2026 AS DATETIME)
    ORDER BY NEWID()
) m
WHERE e.Name = 'ICF 2026 Annual Meeting';


-- All other events: Use standard registration generation
INSERT INTO [AssociationDemo].[EventRegistration] (ID, EventID, MemberID, RegistrationDate, RegistrationType, Status, CheckInTime, CEUAwarded)
SELECT
    NEWID(),
    e.ID,
    m.ID,
    DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 60), e.StartDate),
    CASE
        WHEN DATEDIFF(DAY, m.JoinDate, e.StartDate) < 30 THEN 'Early Bird'
        ELSE 'Standard'
    END,
    CASE
        -- Adjust attendance rates based on event type and trend
        WHEN e.EventType = 'Conference' THEN
            CASE ABS(CHECKSUM(NEWID()) % 100)
                WHEN 0 THEN 'No Show'
                WHEN 1 THEN 'No Show'
                WHEN 2 THEN 'No Show'
                WHEN 3 THEN 'Registered'
                WHEN 4 THEN 'Registered'
                ELSE 'Attended'
            END
        WHEN e.EventType = 'Workshop' THEN
            CASE ABS(CHECKSUM(NEWID()) % 100)
                WHEN 0 THEN 'No Show'
                WHEN 1 THEN 'No Show'
                WHEN 2 THEN 'Registered'
                WHEN 3 THEN 'Registered'
                ELSE 'Attended'
            END
        ELSE  -- Webinars have higher no-show rates
            CASE ABS(CHECKSUM(NEWID()) % 100)
                WHEN 0 THEN 'No Show' WHEN 1 THEN 'No Show' WHEN 2 THEN 'No Show'
                WHEN 3 THEN 'No Show' WHEN 4 THEN 'No Show' WHEN 5 THEN 'No Show'
                WHEN 6 THEN 'No Show' WHEN 7 THEN 'No Show' WHEN 8 THEN 'No Show'
                WHEN 9 THEN 'No Show'
                WHEN 10 THEN 'Registered' WHEN 11 THEN 'Registered' WHEN 12 THEN 'Registered'
                WHEN 13 THEN 'Registered' WHEN 14 THEN 'Registered'
                ELSE 'Attended'
            END
    END,
    CASE
        WHEN e.Status = 'Completed' AND ABS(CHECKSUM(NEWID()) % 100) < 85
        THEN DATEADD(MINUTE, 480 + ABS(CHECKSUM(NEWID()) % 120), CAST(e.StartDate AS DATETIME))
        ELSE NULL
    END,
    CASE
        WHEN e.Status = 'Completed' AND ABS(CHECKSUM(NEWID()) % 100) < 85 THEN 1
        ELSE 0
    END
FROM [AssociationDemo].[Event] e
CROSS APPLY (
    -- Calculate target registrations based on event type and status
    SELECT CASE
        WHEN e.Status = 'Completed' THEN
            -- Completed events: 75-90% capacity (trending)
            CAST(e.Capacity * (0.75 + (CAST(ABS(CHECKSUM(e.ID)) % 16 AS DECIMAL) / 100)) AS INT)
        WHEN e.Status = 'Registration Open' THEN
            -- Open registration: 35-50% capacity so far
            CAST(e.Capacity * (0.35 + (CAST(ABS(CHECKSUM(e.ID)) % 16 AS DECIMAL) / 100)) AS INT)
        WHEN e.Status = 'Published' THEN
            -- Published but not open: 20-35% early registrants
            CAST(e.Capacity * (0.20 + (CAST(ABS(CHECKSUM(e.ID)) % 16 AS DECIMAL) / 100)) AS INT)
        ELSE 0
    END AS TargetCount
) target
CROSS APPLY (
    SELECT TOP (target.TargetCount) ID, JoinDate
    FROM [AssociationDemo].[Member] m
    WHERE m.JoinDate < e.StartDate
    ORDER BY NEWID()
) m
WHERE e.Name NOT LIKE 'ICF%Annual Meeting%'  -- Exclude Annual Meetings (already handled above)
AND target.TargetCount > 0;


-- Note: No GO statement here - variables must persist within transaction
