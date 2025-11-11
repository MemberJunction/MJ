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
-- FORUM POSTS (150+ posts with realistic cheese industry conversations)
-- ============================================================================

-- Get thread IDs for posting
DECLARE @Threads TABLE (ThreadID UNIQUEIDENTIFIER, CategoryID UNIQUEIDENTIFIER, ThreadTitle NVARCHAR(500));
INSERT INTO @Threads
SELECT ID, CategoryID, Title FROM [AssociationDemo].[ForumThread];

-- Helper: Get random member IDs for post authors
DECLARE @PostAuthors TABLE (RowNum INT IDENTITY(1,1), MemberID UNIQUEIDENTIFIER);
INSERT INTO @PostAuthors
SELECT TOP 30 ID FROM [AssociationDemo].[Member] ORDER BY NEWID();

-- Create realistic original posts for specific threads with contextual content
DECLARE @PostContent TABLE (ThreadTitle NVARCHAR(500), OriginalPost NVARCHAR(MAX), Reply1 NVARCHAR(MAX), Reply2 NVARCHAR(MAX), Reply3 NVARCHAR(MAX));

INSERT INTO @PostContent (ThreadTitle, OriginalPost, Reply1, Reply2, Reply3) VALUES
('What is the best starter culture for cheddar?',
 'Hi everyone! I''m expanding my operation to include cheddar production and I''m getting conflicting advice on starter cultures. Some say mesophilic MM100 is the gold standard, others swear by custom blends. I''m aiming for a traditional 12-month aged cheddar with a sharp, complex flavor profile. What do you all use? Any pitfalls to avoid with different cultures?',
 'We''ve been using Chr. Hansen''s CHN-19 mesophilic blend for 8 years now with excellent results. The key is maintaining your mother culture properly - we refresh ours every week and keep detailed pH logs. For that traditional sharp flavor at 12 months, you want a culture that produces good acid development without being too aggressive early on.',
 'I''d second the CHN-19 recommendation, but also consider your milk source. We switched to a thermophilic culture (TA-61) for our cheddar last year because our summer milk was too variable. The higher cooking temp gives us more consistency. Not traditional, but our customers can''t tell the difference and our yield improved by 2%.',
 'One thing nobody mentions - make sure your culture is actually viable! We had 3 bad batches in a row before we realized our supplier had storage issues. Always do an activity test before you pitch a new culture into 500 gallons of milk. Learned that lesson the expensive way!'),

('Help! My cheese is too crumbly',
 'I need some troubleshooting help. My last three batches of cheddar are coming out way too crumbly - they literally fall apart when I try to slice them. I''m following the same recipe I''ve used for 2 years. The only thing that changed is I switched to a new milk supplier last month. Could that be it? pH seems fine (5.1-5.2 at pressing). What am I missing?',
 'Crumbly texture is almost always one of three things: too much acid, too little moisture, or both. Your pH range is actually good, so I''d look at your moisture content. Are you pressing at the same pressure and duration? Even small changes in pressing can drop your moisture by 2-3% and make cheese crumbly. What''s your target moisture?',
 'Check your cook temperature too! If your new milk has higher protein content (which is actually a good thing usually), you might be expelling too much whey during the cook. Try dropping your cook temp by 2-3°F and see if that helps retain moisture.',
 'I had this exact problem! Turned out my new milk supplier''s cows were on a different feed ration with more protein and less fat. The casein-to-fat ratio was off. I had to adjust my whole process - longer set time, gentler cut, lower cook temp. It took me 6 batches to dial it back in, but now it''s better than ever. Don''t give up!'),

('Building an aging cave - tips and lessons learned',
 'We''re finally ready to build a proper aging cave for our farmstead operation. I''ve been aging in a converted shipping container for 3 years (don''t judge! we all start somewhere) and we''re outgrowing it. Looking at a 20x30 space with 8ft ceilings. Budget is around $40K. For those who''ve done this - what do you wish you''d known? What''s worth splurging on vs. where can I save?',
 'Congratulations! Best decision we ever made. Three critical things: 1) Insulation is EVERYTHING - don''t cheap out, we used 6" spray foam and our energy costs are minimal. 2) Get a real humidity control system, not just a humidifier. We use a Stulz unit and it''s worth every penny. 3) Plan for 50% more capacity than you think you need - you WILL fill it faster than you expect!',
 'Air circulation is where most people mess up. You need even airflow over every cheese, but not direct drafts. We installed ceiling fans with direction control and strategically placed baffles. Also, make your aisles wider than you think - you''ll be pushing carts in there and turning is harder than you''d expect with 500lb of cheese!',
 'One thing we did right: we installed floor drains everywhere with a slight slope. Cleaning an aging cave is tedious enough without having to squeegee water around. Also, if you''re doing any washed-rind cheeses, consider a separate small room or at least a contained section - the B. linens will colonize EVERYTHING otherwise.'),

('FSMA compliance checklist for small creameries',
 'With the new FSMA enforcement ramping up, I''m trying to make sure our small creamery (6 employees, 8,000 lbs/week) is fully compliant. I''ve got our HACCP plan updated and we''re doing environmental monitoring, but I keep hearing about "preventive controls" requirements. Can someone break down what''s actually required for a facility our size? The FDA guidance is 200 pages and honestly overwhelming.',
 'FSMA compliance isn''t as scary as it seems once you break it down. You need: 1) Written food safety plan (your HACCP plan likely covers most of this), 2) Preventive controls for hazards you identify, 3) Monitoring procedures, 4) Corrective action procedures, 5) Verification procedures, and 6) A trained preventive controls qualified individual (PCQI). Have you taken the FSPCA training yet?',
 'The PCQI training is key - it''s a 3-day course and totally worth it. After taking it, everything clicked for me. The main difference from traditional HACCP is you need to think about more than just CCPs - you''re looking at preventive controls for any identified hazards, not just critical ones. For a small operation like yours, your biggest areas are probably allergen control, sanitation, and supply chain verification.',
 'Don''t forget about your supplier verification program! This trips up a lot of small operations. You need documentation that your ingredient suppliers have adequate food safety controls. For milk, this is usually straightforward (Grade A certification), but for other ingredients like cultures, rennet, etc., you need letters of guarantee or certificates of analysis. Start gathering those now if you haven''t already.'),

('Troubleshooting bitter flavor in aged cheese',
 'I''m getting a bitter off-flavor in my 6-month aged gouda that wasn''t there at 3 months. It''s not overwhelming, but it''s definitely noticeable and getting worse with age. My make procedure hasn''t changed, same milk source, same culture (CHN-22). My aging cave is at 52°F and 85% humidity, which should be fine. Has anyone dealt with this? Is this salvageable or do I need to pivot to a younger sale age?',
 'Bitterness in aged cheese is usually from excessive proteolysis - basically, your proteins are breaking down into bitter peptides. This can be from contaminating bacteria (often Pseudomonas or other psychrotrophs in the milk) or from too much residual rennet activity. Have you checked your milk quality recently? Specifically, psychrotrophic counts?',
 'I''d bet money it''s late-lactation milk if this just started happening. Fall/winter milk from cows at the end of their lactation has more proteolytic enzymes naturally. Combined with aging, you get bitterness. We had this same issue last year. Solution: blend your milk if possible, or reduce your aging time for winter batches. We now age our winter gouda for 4 months max instead of 6.',
 'Also check your brine! If your brine pH drifted below 5.0, it can lead to excessive protein breakdown during aging. We monitor our brine pH weekly and keep it at 5.2-5.4. And make sure you''re not over-salting - too much salt can amplify bitter flavors even if they''re mild.'),

('Instagram marketing strategies that work',
 'Our cheese is great (if I do say so myself!) but our Instagram is... not. We post sporadically, get maybe 20 likes per post, and zero new customers from social media. Meanwhile, I see other small creameries with huge followings. What''s the secret? I know I need to post more consistently, but what should I actually be posting? Just cheese pics gets old fast.',
 'Content strategy is everything! We post 5x/week and our engagement went from crickets to 500+ likes per post in 6 months. Mix it up: Monday = behind-the-scenes (people LOVE seeing the make process), Wednesday = recipe using our cheese, Friday = cheese of the week feature, plus random posts for events, seasonals, etc. Stories are actually more important than posts - use them daily for "day in the life" content.',
 'Stop selling in your posts! I know it sounds counterintuitive, but educational content performs 10x better than "buy our cheese" posts. We share cheese science, pairing guides, storage tips, jokes about cheese memes - build community first, sales follow. Also, use location tags and collaborate with local restaurants/shops that carry your cheese for cross-promotion.',
 'Video is king right now. Our Reels showing the curd being cut, the cheddaring process, wax application, etc. get 10x the reach of photos. You don''t need fancy equipment - I shoot everything on my iPhone. Make it authentic, not polished. People want to see the real process, messy make room and all!');

-- Insert original posts with realistic content
INSERT INTO [AssociationDemo].[ForumPost] (ID, ThreadID, ParentPostID, AuthorID, Content, PostedDate, LikeCount, HelpfulCount, Status)
SELECT
    NEWID(),
    t.ThreadID,
    NULL,
    (SELECT TOP 1 MemberID FROM @PostAuthors ORDER BY NEWID()),
    COALESCE(pc.OriginalPost,
        'I''m looking for advice and experiences from the community on this topic. Any insights would be greatly appreciated!'),
    DATEADD(DAY, -ABS(CHECKSUM(NEWID()) % 180), @EndDate),
    ABS(CHECKSUM(NEWID()) % 20) + 5,
    ABS(CHECKSUM(NEWID()) % 10) + 2,
    'Published'
FROM @Threads t
LEFT JOIN @PostContent pc ON t.ThreadTitle = pc.ThreadTitle;

-- Insert first set of replies with contextual content
INSERT INTO [AssociationDemo].[ForumPost] (ID, ThreadID, ParentPostID, AuthorID, Content, PostedDate, LikeCount, HelpfulCount, IsAcceptedAnswer, Status)
SELECT
    NEWID(),
    t.ThreadID,
    (SELECT TOP 1 ID FROM [AssociationDemo].[ForumPost] p WHERE p.ThreadID = t.ThreadID AND p.ParentPostID IS NULL),
    (SELECT TOP 1 MemberID FROM @PostAuthors WHERE MemberID != (SELECT TOP 1 AuthorID FROM [AssociationDemo].[ForumPost] p WHERE p.ThreadID = t.ThreadID AND p.ParentPostID IS NULL) ORDER BY NEWID()),
    COALESCE(pc.Reply1,
        CASE ABS(CHECKSUM(t.ThreadID)) % 8
            WHEN 0 THEN 'Great question! I''ve had similar experiences. In my operation, I found that controlling temperature and humidity made the biggest difference. Keep detailed logs and you''ll start seeing patterns.'
            WHEN 1 THEN 'I''d recommend checking your milk quality first. We had similar issues until we started testing every batch. The investment in testing equipment paid for itself in reduced waste within 6 months.'
            WHEN 2 THEN 'This is a common challenge. What worked for us was adjusting our culture ratios based on seasonal milk variations. Summer milk behaves very differently than winter milk!'
            WHEN 3 THEN 'Have you considered the impact of your water source? We discovered our well water had high mineral content that was affecting our cultures. A simple filtration system solved it.'
            WHEN 4 THEN 'Equipment calibration is often overlooked! When was the last time you verified your thermometers and pH meters? We calibrate weekly now and it made a huge difference in consistency.'
            WHEN 5 THEN 'Your process timing might need adjustment. We extended our set time by 15 minutes and saw immediate improvements. Small changes can have big impacts!'
            WHEN 6 THEN 'I learned this from a mentor: keep everything else constant and change only one variable at a time. Document everything. It takes longer but you''ll actually understand what''s happening.'
            ELSE 'Thanks for bringing this up! I''ve been wondering about this too. Following this thread for more insights from experienced cheesemakers.'
        END),
    DATEADD(HOUR, -ABS(CHECKSUM(NEWID()) % 48), (SELECT PostedDate FROM [AssociationDemo].[ForumPost] p WHERE p.ThreadID = t.ThreadID AND p.ParentPostID IS NULL)),
    ABS(CHECKSUM(NEWID()) % 15) + 3,
    ABS(CHECKSUM(NEWID()) % 12) + 1,
    CASE WHEN pc.Reply1 IS NOT NULL THEN 1 ELSE CASE WHEN ABS(CHECKSUM(NEWID()) % 10) = 0 THEN 1 ELSE 0 END END,
    'Published'
FROM @Threads t
LEFT JOIN @PostContent pc ON t.ThreadTitle = pc.ThreadTitle;

-- Insert second set of replies
INSERT INTO [AssociationDemo].[ForumPost] (ID, ThreadID, ParentPostID, AuthorID, Content, PostedDate, LikeCount, HelpfulCount, Status)
SELECT TOP 50
    NEWID(),
    t.ThreadID,
    (SELECT TOP 1 ID FROM [AssociationDemo].[ForumPost] p WHERE p.ThreadID = t.ThreadID AND p.ParentPostID IS NULL),
    (SELECT TOP 1 MemberID FROM @PostAuthors WHERE MemberID NOT IN (SELECT AuthorID FROM [AssociationDemo].[ForumPost] p WHERE p.ThreadID = t.ThreadID) ORDER BY NEWID()),
    COALESCE(pc.Reply2,
        CASE ABS(CHECKSUM(t.ThreadID) + 1) % 8
            WHEN 0 THEN 'I second what was said above, but I''d add one more thing - don''t underestimate the importance of your make room environment. Air quality and circulation matter more than most people realize.'
            WHEN 1 THEN 'Different perspective here: we actually went the opposite direction and simplified our process. Sometimes we overthink things. Focus on the fundamentals first - good milk, clean equipment, consistent timing.'
            WHEN 2 THEN 'Has anyone tried the XYZ method? We switched to it last year and our consistency improved dramatically. It requires some investment but the ROI was under 4 months for us.'
            WHEN 3 THEN 'Pro tip from 20 years of cheesemaking: your milk supplier relationship is everything. We visit our dairy weekly, know the cows, understand their feeding schedule. That connection makes all the difference.'
            WHEN 4 THEN 'Be careful with that advice - it doesn''t work for all cheese types. What works for cheddar might be completely wrong for soft-ripened cheeses. Always consider your specific context.'
            WHEN 5 THEN 'We struggled with this for months until we attended the Wisconsin Cheesemaker workshop. The hands-on training was invaluable. Sometimes you need expert eyes on your process.'
            WHEN 6 THEN 'I use a completely different approach but get similar results. There''s no one "right" way - you need to find what works for your milk, your equipment, and your environment.'
            ELSE 'This thread has been so helpful! I''m taking notes. The cheese community is the best - everyone willing to share their hard-won knowledge.'
        END),
    DATEADD(HOUR, -ABS(CHECKSUM(NEWID()) % 36), (SELECT MAX(PostedDate) FROM [AssociationDemo].[ForumPost] p WHERE p.ThreadID = t.ThreadID)),
    ABS(CHECKSUM(NEWID()) % 12) + 2,
    ABS(CHECKSUM(NEWID()) % 8) + 1,
    'Published'
FROM @Threads t
LEFT JOIN @PostContent pc ON t.ThreadTitle = pc.ThreadTitle
ORDER BY NEWID();

-- Insert third set of replies for threads with detailed content
INSERT INTO [AssociationDemo].[ForumPost] (ID, ThreadID, ParentPostID, AuthorID, Content, PostedDate, LikeCount, HelpfulCount, Status)
SELECT
    NEWID(),
    t.ThreadID,
    (SELECT TOP 1 ID FROM [AssociationDemo].[ForumPost] p WHERE p.ThreadID = t.ThreadID AND p.ParentPostID IS NULL),
    (SELECT TOP 1 MemberID FROM @PostAuthors WHERE MemberID NOT IN (SELECT AuthorID FROM [AssociationDemo].[ForumPost] p WHERE p.ThreadID = t.ThreadID) ORDER BY NEWID()),
    pc.Reply3,
    DATEADD(HOUR, -ABS(CHECKSUM(NEWID()) % 24), (SELECT MAX(PostedDate) FROM [AssociationDemo].[ForumPost] p WHERE p.ThreadID = t.ThreadID)),
    ABS(CHECKSUM(NEWID()) % 10) + 2,
    ABS(CHECKSUM(NEWID()) % 6) + 1,
    'Published'
FROM @Threads t
INNER JOIN @PostContent pc ON t.ThreadTitle = pc.ThreadTitle
WHERE pc.Reply3 IS NOT NULL;

-- Add some follow-up comments (replies to replies)
INSERT INTO [AssociationDemo].[ForumPost] (ID, ThreadID, ParentPostID, AuthorID, Content, PostedDate, LikeCount, HelpfulCount, Status)
SELECT TOP 25
    NEWID(),
    p.ThreadID,
    p.ID,
    (SELECT TOP 1 MemberID FROM @PostAuthors WHERE MemberID != p.AuthorID ORDER BY NEWID()),
    CASE ABS(CHECKSUM(p.ID)) % 6
        WHEN 0 THEN 'Thank you! This is exactly what I needed to hear. I''m going to try this approach next batch.'
        WHEN 1 THEN 'Can you elaborate on that? I''m curious about the specifics of your process.'
        WHEN 2 THEN 'Great point! I hadn''t thought about it that way. Definitely going to implement this.'
        WHEN 3 THEN 'We tried something similar but got different results. I wonder if it''s a regional milk quality thing?'
        WHEN 4 THEN 'This worked! Just wanted to follow up and say I made the changes you suggested and my last batch was perfect. Thank you!'
        ELSE 'Interesting perspective! I''ve always done it differently but your method makes sense. Might experiment with it.'
    END,
    DATEADD(HOUR, -ABS(CHECKSUM(NEWID()) % 12), p.PostedDate),
    ABS(CHECKSUM(NEWID()) % 8) + 1,
    ABS(CHECKSUM(NEWID()) % 4),
    'Published'
FROM [AssociationDemo].[ForumPost] p
WHERE p.ParentPostID IS NOT NULL
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
