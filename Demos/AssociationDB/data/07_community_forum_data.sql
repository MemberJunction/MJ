/******************************************************************************
 * Association Sample Database - Community/Forums Data
 * File: 07_community_forum_data.sql
 *
 * Generates community forum data including:
 * - 12 Forum Categories (cheese industry focused)
 * - 50 Forum Threads
 * - 150 Forum Posts
 * - 300 Post Reactions
 * - 100 Post Tags
 * - 100 Member Follows
 * - 25 Post Attachments
 * - 10 Moderation Records
 ******************************************************************************/


-- Parameters are loaded by MASTER_BUILD script before this file

-- ============================================================================
-- FORUM CATEGORIES (12 categories - cheese industry focused)
-- ============================================================================

-- Top-level categories
INSERT INTO [AssociationDemo].[ForumCategory] (ID, Name, Description, ParentCategoryID, DisplayOrder, Icon, Color, IsActive, RequiresMembership)
VALUES
    (NEWID(), 'Cheesemaking Techniques', 'Discuss artisan and commercial cheesemaking methods', NULL, 1, 'fa-cheese', '#F39C12', 1, 0),
    (NEWID(), 'Dairy Science & Quality', 'Milk composition, microbiology, and quality control', NULL, 2, 'fa-flask', '#3498DB', 1, 1),
    (NEWID(), 'Business & Marketing', 'Growing your cheese business and reaching customers', NULL, 3, 'fa-chart-line', '#27AE60', 1, 0),
    (NEWID(), 'Food Safety & Regulations', 'HACCP, FDA compliance, and safety best practices', NULL, 4, 'fa-shield-alt', '#E74C3C', 1, 1),
    (NEWID(), 'Equipment & Facilities', 'Production equipment, aging caves, and plant design', NULL, 5, 'fa-cogs', '#95A5A6', 1, 0),
    (NEWID(), 'Community & Events', 'Member introductions, events, and networking', NULL, 6, 'fa-users', '#9B59B6', 1, 0);

-- Subcategories (get parent IDs from above)
DECLARE @Cat_Cheesemaking UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [AssociationDemo].[ForumCategory] WHERE Name = 'Cheesemaking Techniques');
DECLARE @Cat_DairyScience UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [AssociationDemo].[ForumCategory] WHERE Name = 'Dairy Science & Quality');
DECLARE @Cat_Business UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [AssociationDemo].[ForumCategory] WHERE Name = 'Business & Marketing');
DECLARE @Cat_FoodSafety UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [AssociationDemo].[ForumCategory] WHERE Name = 'Food Safety & Regulations');
DECLARE @Cat_Equipment UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [AssociationDemo].[ForumCategory] WHERE Name = 'Equipment & Facilities');
DECLARE @Cat_Community UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [AssociationDemo].[ForumCategory] WHERE Name = 'Community & Events');

INSERT INTO [AssociationDemo].[ForumCategory] (ID, Name, Description, ParentCategoryID, DisplayOrder, Icon, Color, IsActive, RequiresMembership)
VALUES
    (NEWID(), 'Aged Cheese', 'Cheddar, Gouda, Parmesan, and aging techniques', @Cat_Cheesemaking, 1, 'fa-hourglass-half', '#F39C12', 1, 0),
    (NEWID(), 'Fresh Cheese', 'Mozzarella, ricotta, chevre, and fresh techniques', @Cat_Cheesemaking, 2, 'fa-leaf', '#F39C12', 1, 0),
    (NEWID(), 'Cultures & Enzymes', 'Starter cultures, rennet, and fermentation', @Cat_DairyScience, 1, 'fa-bacteria', '#3498DB', 1, 1),
    (NEWID(), 'Export & Distribution', 'International markets and logistics', @Cat_Business, 1, 'fa-globe', '#27AE60', 1, 0),
    (NEWID(), 'Retail & Direct Sales', 'Farmers markets, online sales, and retail partnerships', @Cat_Business, 2, 'fa-store', '#27AE60', 1, 0),
    (NEWID(), 'Member Introductions', 'Introduce yourself and your cheese operation', @Cat_Community, 1, 'fa-handshake', '#9B59B6', 1, 0);


-- ============================================================================
-- FORUM THREADS (50 threads with realistic cheese industry topics)
-- ============================================================================

-- Helper: Get random member IDs for thread authors
DECLARE @ThreadAuthors TABLE (MemberID UNIQUEIDENTIFIER);
INSERT INTO @ThreadAuthors
SELECT TOP 20 ID FROM [AssociationDemo].[Member] ORDER BY NEWID();

INSERT INTO [AssociationDemo].[ForumThread] (ID, CategoryID, Title, AuthorID, CreatedDate, ViewCount, ReplyCount, IsPinned, Status)
SELECT
    NEWID(),
    CategoryID,
    Title,
    (SELECT TOP 1 MemberID FROM @ThreadAuthors ORDER BY NEWID()),
    DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 180), @EndDate),
    ABS(CHECKSUM(NEWID()) % 500) + 10,
    0,
    IsPinned,
    'Active'
FROM (VALUES
    (@Cat_Cheesemaking, 'What is the best starter culture for cheddar?', 1),
    (@Cat_Cheesemaking, 'Help! My cheese is too crumbly', 0),
    (@Cat_Cheesemaking, 'Troubleshooting bitter flavor in aged cheese', 0),
    (@Cat_DairyScience, 'Optimal pH levels for different cheese varieties', 0),
    (@Cat_DairyScience, 'Testing milk quality - which equipment do you use?', 0),
    (@Cat_Business, 'Pricing strategy for artisan cheese', 0),
    (@Cat_Business, 'How to break into restaurant distribution', 0),
    (@Cat_FoodSafety, 'FSMA compliance checklist for small creameries', 1),
    (@Cat_FoodSafety, 'Managing allergen cross-contamination', 0),
    (@Cat_Equipment, 'Best cheese vats for small-batch production', 0),
    (@Cat_Equipment, 'Building an aging cave - tips and lessons learned', 0),
    (@Cat_Community, 'New member from Wisconsin - cheese country!', 0),
    (@Cat_Community, 'Annual conference planning thread', 1),
    ((SELECT ID FROM [AssociationDemo].[ForumCategory] WHERE Name = 'Aged Cheese'), 'How long should I age my cheddar?', 0),
    ((SELECT ID FROM [AssociationDemo].[ForumCategory] WHERE Name = 'Aged Cheese'), 'Parmesan aging requirements - 12 vs 24 months', 0),
    ((SELECT ID FROM [AssociationDemo].[ForumCategory] WHERE Name = 'Fresh Cheese'), 'Perfect mozzarella stretch - what am I doing wrong?', 0),
    ((SELECT ID FROM [AssociationDemo].[ForumCategory] WHERE Name = 'Fresh Cheese'), 'Ricotta yield from different milk types', 0),
    ((SELECT ID FROM [AssociationDemo].[ForumCategory] WHERE Name = 'Cultures & Enzymes'), 'Mesophilic vs thermophilic cultures', 0),
    ((SELECT ID FROM [AssociationDemo].[ForumCategory] WHERE Name = 'Cultures & Enzymes'), 'Where do you source your rennet?', 0),
    ((SELECT ID FROM [AssociationDemo].[ForumCategory] WHERE Name = 'Export & Distribution'), 'Exporting to EU - regulatory requirements', 0),
    ((SELECT ID FROM [AssociationDemo].[ForumCategory] WHERE Name = 'Retail & Direct Sales'), 'Online cheese sales - packaging and shipping tips', 0),
    (@Cat_Cheesemaking, 'Gouda wax coating vs vacuum sealing', 0),
    (@Cat_Cheesemaking, 'Blue cheese mold cultivation best practices', 0),
    (@Cat_DairyScience, 'Pasteurization temperature impact on flavor', 0),
    (@Cat_Business, 'Cheese branding and label design advice', 0),
    (@Cat_FoodSafety, 'Listeria testing frequency recommendations', 0),
    (@Cat_Equipment, 'Used equipment marketplace - what to look for', 0),
    (@Cat_Community, 'Regional cheese festivals and competitions', 0),
    ((SELECT ID FROM [AssociationDemo].[ForumCategory] WHERE Name = 'Aged Cheese'), 'Natural rind development techniques', 0),
    ((SELECT ID FROM [AssociationDemo].[ForumCategory] WHERE Name = 'Fresh Cheese'), 'Cream cheese texture troubleshooting', 0),
    ((SELECT ID FROM [AssociationDemo].[ForumCategory] WHERE Name = 'Cultures & Enzymes'), 'Propionic bacteria for Swiss cheese eyes', 0),
    ((SELECT ID FROM [AssociationDemo].[ForumCategory] WHERE Name = 'Export & Distribution'), 'Cold chain logistics for cheese shipments', 0),
    ((SELECT ID FROM [AssociationDemo].[ForumCategory] WHERE Name = 'Retail & Direct Sales'), 'Farmers market booth setup and display', 0),
    (@Cat_Cheesemaking, 'Washed rind cheese - managing the smell!', 0),
    (@Cat_DairyScience, 'Raw milk vs pasteurized - flavor differences', 0),
    (@Cat_Business, 'Instagram marketing strategies that work', 0),
    (@Cat_FoodSafety, 'Sanitation schedule for small creamery', 0),
    (@Cat_Equipment, 'DIY cheese press designs', 0),
    (@Cat_Community, 'Mentorship program - experienced cheesemakers helping newcomers', 0),
    ((SELECT ID FROM [AssociationDemo].[ForumCategory] WHERE Name = 'Aged Cheese'), 'Affinage: when to flip and when to wash', 0),
    ((SELECT ID FROM [AssociationDemo].[ForumCategory] WHERE Name = 'Fresh Cheese'), 'Burrata making workshop recommendations', 0),
    ((SELECT ID FROM [AssociationDemo].[ForumCategory] WHERE Name = 'Cultures & Enzymes'), 'Direct vat inoculation vs bulk starter', 0),
    ((SELECT ID FROM [AssociationDemo].[ForumCategory] WHERE Name = 'Export & Distribution'), 'Tariff impact on international cheese sales', 0),
    ((SELECT ID FROM [AssociationDemo].[ForumCategory] WHERE Name = 'Retail & Direct Sales'), 'Cheese subscription box business models', 0),
    (@Cat_Cheesemaking, 'Feta brine recipe and storage', 0),
    (@Cat_DairyScience, 'Seasonal milk composition changes', 0),
    (@Cat_Business, 'Small creamery profitability margins', 0),
    (@Cat_FoodSafety, 'Water quality testing for cheesemaking', 0),
    (@Cat_Equipment, 'Refrigeration sizing for aging rooms', 0),
    (@Cat_Community, 'Success stories from first-year cheesemakers', 0)
) AS Threads(CategoryID, Title, IsPinned);


-- ============================================================================
-- FORUM POSTS (150 posts - original posts + replies)
-- ============================================================================

-- Get thread IDs for posting
DECLARE @Threads TABLE (ThreadID UNIQUEIDENTIFIER, CategoryID UNIQUEIDENTIFIER);
INSERT INTO @Threads
SELECT ID, CategoryID FROM [AssociationDemo].[ForumThread];

-- Helper: Get random member IDs for post authors
DECLARE @PostAuthors TABLE (MemberID UNIQUEIDENTIFIER);
INSERT INTO @PostAuthors
SELECT TOP 30 ID FROM [AssociationDemo].[Member] ORDER BY NEWID();

-- Original posts (one per thread)
INSERT INTO [AssociationDemo].[ForumPost] (ID, ThreadID, ParentPostID, AuthorID, Content, PostedDate, LikeCount, HelpfulCount, Status)
SELECT
    NEWID(),
    t.ThreadID,
    NULL,
    (SELECT TOP 1 MemberID FROM @PostAuthors ORDER BY NEWID()),
    'This is the original post content for thread. Looking for advice and experiences from the community.',
    DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 180), @EndDate),
    ABS(CHECKSUM(NEWID()) % 20),
    ABS(CHECKSUM(NEWID()) % 10),
    'Published'
FROM @Threads t;

-- Reply posts (2-3 replies per thread on average = 100 replies)
INSERT INTO [AssociationDemo].[ForumPost] (ID, ThreadID, ParentPostID, AuthorID, Content, PostedDate, LikeCount, HelpfulCount, IsAcceptedAnswer, Status)
SELECT TOP 100
    NEWID(),
    t.ThreadID,
    (SELECT TOP 1 ID FROM [AssociationDemo].[ForumPost] p WHERE p.ThreadID = t.ThreadID AND p.ParentPostID IS NULL),
    (SELECT TOP 1 MemberID FROM @PostAuthors ORDER BY NEWID()),
    'Thank you for this question! Here is my experience and advice on this topic...',
    DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 170), @EndDate),
    ABS(CHECKSUM(NEWID()) % 15),
    ABS(CHECKSUM(NEWID()) % 8),
    CASE WHEN ABS(CHECKSUM(NEWID()) % 10) = 0 THEN 1 ELSE 0 END,
    'Published'
FROM @Threads t
ORDER BY NEWID();


-- ============================================================================
-- POST REACTIONS (300 reactions)
-- ============================================================================

INSERT INTO [AssociationDemo].[PostReaction] (ID, PostID, MemberID, ReactionType, CreatedDate)
SELECT TOP 300
    NEWID(),
    p.ID,
    (SELECT TOP 1 MemberID FROM @PostAuthors ORDER BY NEWID()),
    CASE ABS(CHECKSUM(NEWID()) % 5)
        WHEN 0 THEN 'Like'
        WHEN 1 THEN 'Helpful'
        WHEN 2 THEN 'Thanks'
        WHEN 3 THEN 'Bookmark'
        ELSE 'Like'
    END,
    DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 160), @EndDate)
FROM [AssociationDemo].[ForumPost] p
ORDER BY NEWID();


-- ============================================================================
-- POST TAGS (100 tags)
-- ============================================================================

INSERT INTO [AssociationDemo].[PostTag] (ID, PostID, TagName, CreatedDate)
SELECT TOP 100
    NEWID(),
    p.ID,
    CASE ABS(CHECKSUM(NEWID()) % 15)
        WHEN 0 THEN 'beginner'
        WHEN 1 THEN 'troubleshooting'
        WHEN 2 THEN 'recipe'
        WHEN 3 THEN 'aged-cheese'
        WHEN 4 THEN 'fresh-cheese'
        WHEN 5 THEN 'cultures'
        WHEN 6 THEN 'equipment'
        WHEN 7 THEN 'food-safety'
        WHEN 8 THEN 'business'
        WHEN 9 THEN 'marketing'
        WHEN 10 THEN 'export'
        WHEN 11 THEN 'retail'
        WHEN 12 THEN 'diy'
        WHEN 13 THEN 'best-practices'
        ELSE 'general'
    END,
    DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 150), @EndDate)
FROM [AssociationDemo].[ForumPost] p
ORDER BY NEWID();


-- ============================================================================
-- MEMBER FOLLOWS (100 follows)
-- ============================================================================

-- Thread follows
INSERT INTO [AssociationDemo].[MemberFollow] (ID, FollowerID, FollowType, FollowedEntityID, CreatedDate, NotifyOnActivity)
SELECT TOP 40
    NEWID(),
    (SELECT TOP 1 MemberID FROM @PostAuthors ORDER BY NEWID()),
    'Thread',
    t.ThreadID,
    DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 140), @EndDate),
    CASE WHEN ABS(CHECKSUM(NEWID()) % 3) = 0 THEN 0 ELSE 1 END
FROM @Threads t
ORDER BY NEWID();

-- Category follows
INSERT INTO [AssociationDemo].[MemberFollow] (ID, FollowerID, FollowType, FollowedEntityID, CreatedDate, NotifyOnActivity)
SELECT TOP 30
    NEWID(),
    (SELECT TOP 1 MemberID FROM @PostAuthors ORDER BY NEWID()),
    'Category',
    c.ID,
    DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 140), @EndDate),
    CASE WHEN ABS(CHECKSUM(NEWID()) % 3) = 0 THEN 0 ELSE 1 END
FROM [AssociationDemo].[ForumCategory] c
WHERE c.ParentCategoryID IS NULL
ORDER BY NEWID();

-- Member follows
INSERT INTO [AssociationDemo].[MemberFollow] (ID, FollowerID, FollowType, FollowedEntityID, CreatedDate, NotifyOnActivity)
SELECT TOP 30
    NEWID(),
    m1.MemberID,
    'Member',
    m2.MemberID,
    DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 140), @EndDate),
    CASE WHEN ABS(CHECKSUM(NEWID()) % 3) = 0 THEN 0 ELSE 1 END
FROM @PostAuthors m1
CROSS JOIN @PostAuthors m2
WHERE m1.MemberID <> m2.MemberID
ORDER BY NEWID();


-- ============================================================================
-- POST ATTACHMENTS (25 attachments)
-- ============================================================================

INSERT INTO [AssociationDemo].[PostAttachment] (ID, PostID, FileName, FileURL, FileType, FileSizeBytes, UploadedDate, UploadedByID, DownloadCount)
SELECT TOP 25
    NEWID(),
    p.ID,
    CASE ABS(CHECKSUM(NEWID()) % 5)
        WHEN 0 THEN 'cheese_recipe.pdf'
        WHEN 1 THEN 'aging_room_photo.jpg'
        WHEN 2 THEN 'production_log.xlsx'
        WHEN 3 THEN 'equipment_specs.pdf'
        ELSE 'cheese_sample.jpg'
    END,
    'https://forums.association.org/attachments/' + CAST(NEWID() AS VARCHAR(36)),
    CASE ABS(CHECKSUM(NEWID()) % 4)
        WHEN 0 THEN 'application/pdf'
        WHEN 1 THEN 'image/jpeg'
        WHEN 2 THEN 'application/vnd.ms-excel'
        ELSE 'image/png'
    END,
    ABS(CHECKSUM(NEWID()) % 5000000) + 10000,
    DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 130), @EndDate),
    (SELECT TOP 1 MemberID FROM @PostAuthors ORDER BY NEWID()),
    ABS(CHECKSUM(NEWID()) % 50)
FROM [AssociationDemo].[ForumPost] p
WHERE p.ParentPostID IS NULL
ORDER BY NEWID();


-- ============================================================================
-- FORUM MODERATION (10 moderation records)
-- ============================================================================

INSERT INTO [AssociationDemo].[ForumModeration] (ID, PostID, ReportedByID, ReportedDate, ReportReason, ModerationStatus, ModeratedByID, ModeratedDate, ModeratorNotes, Action)
SELECT TOP 10
    NEWID(),
    p.ID,
    (SELECT TOP 1 MemberID FROM @PostAuthors ORDER BY NEWID()),
    DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 120), @EndDate),
    CASE ABS(CHECKSUM(NEWID()) % 4)
        WHEN 0 THEN 'Spam or promotional content'
        WHEN 1 THEN 'Inappropriate language'
        WHEN 2 THEN 'Off-topic discussion'
        ELSE 'Duplicate post'
    END,
    CASE ABS(CHECKSUM(NEWID()) % 3)
        WHEN 0 THEN 'Approved'
        WHEN 1 THEN 'Dismissed'
        ELSE 'Reviewing'
    END,
    CASE WHEN ABS(CHECKSUM(NEWID()) % 3) < 2 THEN (SELECT TOP 1 MemberID FROM @PostAuthors ORDER BY NEWID()) ELSE NULL END,
    CASE WHEN ABS(CHECKSUM(NEWID()) % 3) < 2 THEN DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 110), @EndDate) ELSE NULL END,
    'Reviewed and determined appropriate/inappropriate per community guidelines',
    CASE ABS(CHECKSUM(NEWID()) % 3)
        WHEN 0 THEN 'No action required'
        WHEN 1 THEN 'Post edited by author'
        ELSE 'Warning sent to member'
    END
FROM [AssociationDemo].[ForumPost] p
ORDER BY NEWID();


-- ============================================================================
-- UPDATE THREAD COUNTS
-- ============================================================================

-- Update reply counts on threads
UPDATE t
SET
    ReplyCount = (SELECT COUNT(*) FROM [AssociationDemo].[ForumPost] p WHERE p.ThreadID = t.ID AND p.ParentPostID IS NOT NULL),
    LastActivityDate = (SELECT MAX(p.PostedDate) FROM [AssociationDemo].[ForumPost] p WHERE p.ThreadID = t.ID),
    LastReplyAuthorID = (SELECT TOP 1 p.AuthorID FROM [AssociationDemo].[ForumPost] p WHERE p.ThreadID = t.ID AND p.ParentPostID IS NOT NULL ORDER BY p.PostedDate DESC)
FROM [AssociationDemo].[ForumThread] t;

-- Update category counts
UPDATE c
SET
    ThreadCount = (SELECT COUNT(*) FROM [AssociationDemo].[ForumThread] t WHERE t.CategoryID = c.ID),
    PostCount = (SELECT COUNT(*) FROM [AssociationDemo].[ForumPost] p INNER JOIN [AssociationDemo].[ForumThread] t ON p.ThreadID = t.ID WHERE t.CategoryID = c.ID),
    LastPostDate = (SELECT MAX(p.PostedDate) FROM [AssociationDemo].[ForumPost] p INNER JOIN [AssociationDemo].[ForumThread] t ON p.ThreadID = t.ID WHERE t.CategoryID = c.ID),
    LastPostAuthorID = (SELECT TOP 1 p.AuthorID FROM [AssociationDemo].[ForumPost] p INNER JOIN [AssociationDemo].[ForumThread] t ON p.ThreadID = t.ID WHERE t.CategoryID = c.ID ORDER BY p.PostedDate DESC)
FROM [AssociationDemo].[ForumCategory] c;


-- Note: No GO statement here - variables must persist within transaction
