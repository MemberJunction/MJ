/******************************************************************************
 * Association Sample Database - Resource Library Data
 * File: 08_resource_library_data.sql
 *
 * This file populates the Resource Library tables with cheese industry content.
 * All dates use @EndDate parameters for alignment with other data files.
 *
 * Data Volumes:
 * - Resource Categories: 15 (hierarchical structure)
 * - Resources: 100 (PDFs, videos, articles, templates, guides)
 * - Resource Versions: 50+ (document updates)
 * - Resource Downloads: 200 (member download tracking)
 * - Resource Ratings: 75 (member reviews and ratings)
 * - Resource Tags: 150+ (searchability)
 ******************************************************************************/

PRINT 'Populating Resource Library Data...';

-- ============================================================================
-- Get member IDs for resource authorship
-- ============================================================================

DECLARE @Member1 UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [AssociationDemo].[Member] ORDER BY NEWID());
DECLARE @Member2 UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [AssociationDemo].[Member] WHERE ID != @Member1 ORDER BY NEWID());
DECLARE @Member3 UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [AssociationDemo].[Member] WHERE ID NOT IN (@Member1, @Member2) ORDER BY NEWID());
DECLARE @Member4 UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [AssociationDemo].[Member] WHERE ID NOT IN (@Member1, @Member2, @Member3) ORDER BY NEWID());
DECLARE @Member5 UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [AssociationDemo].[Member] WHERE ID NOT IN (@Member1, @Member2, @Member3, @Member4) ORDER BY NEWID());
DECLARE @Member6 UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [AssociationDemo].[Member] WHERE ID NOT IN (@Member1, @Member2, @Member3, @Member4, @Member5) ORDER BY NEWID());
DECLARE @Member7 UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [AssociationDemo].[Member] WHERE ID NOT IN (@Member1, @Member2, @Member3, @Member4, @Member5, @Member6) ORDER BY NEWID());
DECLARE @Member8 UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [AssociationDemo].[Member] WHERE ID NOT IN (@Member1, @Member2, @Member3, @Member4, @Member5, @Member6, @Member7) ORDER BY NEWID());
DECLARE @Member9 UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [AssociationDemo].[Member] WHERE ID NOT IN (@Member1, @Member2, @Member3, @Member4, @Member5, @Member6, @Member7, @Member8) ORDER BY NEWID());
DECLARE @Member10 UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [AssociationDemo].[Member] WHERE ID NOT IN (@Member1, @Member2, @Member3, @Member4, @Member5, @Member6, @Member7, @Member8, @Member9) ORDER BY NEWID());
DECLARE @Member11 UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [AssociationDemo].[Member] WHERE ID NOT IN (@Member1, @Member2, @Member3, @Member4, @Member5, @Member6, @Member7, @Member8, @Member9, @Member10) ORDER BY NEWID());
DECLARE @Member12 UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [AssociationDemo].[Member] WHERE ID NOT IN (@Member1, @Member2, @Member3, @Member4, @Member5, @Member6, @Member7, @Member8, @Member9, @Member10, @Member11) ORDER BY NEWID());
DECLARE @Member13 UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [AssociationDemo].[Member] WHERE ID NOT IN (@Member1, @Member2, @Member3, @Member4, @Member5, @Member6, @Member7, @Member8, @Member9, @Member10, @Member11, @Member12) ORDER BY NEWID());
DECLARE @Member14 UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [AssociationDemo].[Member] WHERE ID NOT IN (@Member1, @Member2, @Member3, @Member4, @Member5, @Member6, @Member7, @Member8, @Member9, @Member10, @Member11, @Member12, @Member13) ORDER BY NEWID());
DECLARE @Member15 UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [AssociationDemo].[Member] WHERE ID NOT IN (@Member1, @Member2, @Member3, @Member4, @Member5, @Member6, @Member7, @Member8, @Member9, @Member10, @Member11, @Member12, @Member13, @Member14) ORDER BY NEWID());
DECLARE @Member16 UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [AssociationDemo].[Member] WHERE ID NOT IN (@Member1, @Member2, @Member3, @Member4, @Member5, @Member6, @Member7, @Member8, @Member9, @Member10, @Member11, @Member12, @Member13, @Member14, @Member15) ORDER BY NEWID());
DECLARE @Member17 UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [AssociationDemo].[Member] WHERE ID NOT IN (@Member1, @Member2, @Member3, @Member4, @Member5, @Member6, @Member7, @Member8, @Member9, @Member10, @Member11, @Member12, @Member13, @Member14, @Member15, @Member16) ORDER BY NEWID());
DECLARE @Member18 UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [AssociationDemo].[Member] WHERE ID NOT IN (@Member1, @Member2, @Member3, @Member4, @Member5, @Member6, @Member7, @Member8, @Member9, @Member10, @Member11, @Member12, @Member13, @Member14, @Member15, @Member16, @Member17) ORDER BY NEWID());
DECLARE @Member19 UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [AssociationDemo].[Member] WHERE ID NOT IN (@Member1, @Member2, @Member3, @Member4, @Member5, @Member6, @Member7, @Member8, @Member9, @Member10, @Member11, @Member12, @Member13, @Member14, @Member15, @Member16, @Member17, @Member18) ORDER BY NEWID());
DECLARE @Member20 UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM [AssociationDemo].[Member] WHERE ID NOT IN (@Member1, @Member2, @Member3, @Member4, @Member5, @Member6, @Member7, @Member8, @Member9, @Member10, @Member11, @Member12, @Member13, @Member14, @Member15, @Member16, @Member17, @Member18, @Member19) ORDER BY NEWID());

-- ============================================================================
-- Resource Categories (15 categories in hierarchical structure)
-- ============================================================================

DECLARE @ResLib_Recipes UNIQUEIDENTIFIER = 'E19375FD-5BDC-4DE1-89D1-E84DB8071682';
DECLARE @ResLib_Regulations UNIQUEIDENTIFIER = 'C72AC72E-DC63-44BC-BD85-0433548BD0D4';
DECLARE @ResLib_Technical UNIQUEIDENTIFIER = '59E66EBA-D6CC-4D20-994C-9EE2C967FCA6';
DECLARE @ResLib_Business UNIQUEIDENTIFIER = '19C75CCC-BFED-4E7D-9EDC-63AA8096E976';
DECLARE @ResLib_Marketing UNIQUEIDENTIFIER = 'E18545D7-5821-423F-910B-E4444DA2362F';

-- Sub-categories
DECLARE @ResLib_CheeseRecipes UNIQUEIDENTIFIER = '41C30D65-0735-429F-96EC-CAAFAE401DA9';
DECLARE @ResLib_YogurtRecipes UNIQUEIDENTIFIER = 'D3886C96-C189-4B74-B95E-43A8BE71C85C';
DECLARE @ResLib_FDA UNIQUEIDENTIFIER = '8F0F4403-051C-4D1A-B26F-4F533BEFD0E4';
DECLARE @ResLib_International UNIQUEIDENTIFIER = 'EF97B153-9972-4A80-B7D3-A9315C911B3A';
DECLARE @ResLib_Production UNIQUEIDENTIFIER = '33C26028-7BB2-4DDA-B2CA-A9ECC6271306';
DECLARE @ResLib_Quality UNIQUEIDENTIFIER = '199F75B1-F4AD-429A-A765-B1544739644D';
DECLARE @ResLib_Templates UNIQUEIDENTIFIER = '5C98D61F-8FBB-4934-B04C-DDD425DB9405';
DECLARE @ResLib_Operations UNIQUEIDENTIFIER = '001E1D90-8086-4FEE-9565-8B995459F68F';
DECLARE @ResLib_SocialMedia UNIQUEIDENTIFIER = '20C1D17E-2D71-43A8-A5ED-A8B38F8B7F00';
DECLARE @ResLib_ContentLib UNIQUEIDENTIFIER = '0443DF7D-E075-4C42-BA84-42A2D1649840';

-- Top-level categories
INSERT INTO [AssociationDemo].[ResourceCategory] ([ID], [Name], [Description], [ParentCategoryID], [DisplayOrder], [Icon], [Color], [IsActive], [RequiresMembership], [ResourceCount])
VALUES
    (@ResLib_Recipes, 'Recipes & Formulations', 'Traditional and modern cheese recipes, formulations, and production methods', NULL, 1, 'fa-book-open', '#FF6B6B', 1, 0, 0),
    (@ResLib_Regulations, 'Regulations & Compliance', 'FDA regulations, international standards, and compliance guidelines', NULL, 2, 'fa-scale-balanced', '#4ECDC4', 1, 0, 0),
    (@ResLib_Technical, 'Technical Guides', 'Production techniques, quality control, and technical documentation', NULL, 3, 'fa-flask', '#45B7D1', 1, 1, 0),
    (@ResLib_Business, 'Business Resources', 'Templates, calculators, and business planning tools', NULL, 4, 'fa-briefcase', '#96CEB4', 1, 1, 0),
    (@ResLib_Marketing, 'Marketing Materials', 'Marketing templates, social media content, and promotional resources', NULL, 5, 'fa-bullhorn', '#FFEAA7', 1, 0, 0);

-- Sub-categories
INSERT INTO [AssociationDemo].[ResourceCategory] ([ID], [Name], [Description], [ParentCategoryID], [DisplayOrder], [Icon], [Color], [IsActive], [RequiresMembership], [ResourceCount])
VALUES
    (@ResLib_CheeseRecipes, 'Cheese Recipes', 'Traditional and artisan cheese recipes', @ResLib_Recipes, 1, 'fa-cheese', '#FF6B6B', 1, 0, 0),
    (@ResLib_YogurtRecipes, 'Cultured Dairy', 'Yogurt, kefir, and cultured dairy product recipes', @ResLib_Recipes, 2, 'fa-blender', '#FF8E8E', 1, 0, 0),
    (@ResLib_FDA, 'FDA & USDA Standards', 'U.S. federal regulations and standards', @ResLib_Regulations, 1, 'fa-landmark', '#4ECDC4', 1, 0, 0),
    (@ResLib_International, 'International Standards', 'EU, Canadian, and other international regulations', @ResLib_Regulations, 2, 'fa-globe', '#6FD9D1', 1, 1, 0),
    (@ResLib_Production, 'Production Techniques', 'Manufacturing processes and production optimization', @ResLib_Technical, 1, 'fa-industry', '#45B7D1', 1, 1, 0),
    (@ResLib_Quality, 'Quality Control', 'Testing procedures, HACCP, and quality assurance', @ResLib_Technical, 2, 'fa-microscope', '#6BC5E8', 1, 1, 0),
    (@ResLib_Templates, 'Business Templates', 'Forms, checklists, and planning templates', @ResLib_Business, 1, 'fa-file-lines', '#96CEB4', 1, 1, 0),
    (@ResLib_Operations, 'Operations Guides', 'Operational procedures and management guides', @ResLib_Business, 2, 'fa-gears', '#B3DBC4', 1, 1, 0),
    (@ResLib_SocialMedia, 'Social Media', 'Social media templates and content calendars', @ResLib_Marketing, 1, 'fa-share-nodes', '#FFEAA7', 1, 0, 0),
    (@ResLib_ContentLib, 'Content Library', 'Photos, videos, and promotional materials', @ResLib_Marketing, 2, 'fa-images', '#FFF0C4', 1, 0, 0);

-- ============================================================================
-- Resources (100 resources across all categories)
-- ============================================================================

-- Cheese Recipes (15 resources)
INSERT INTO [AssociationDemo].[Resource] ([ID], [CategoryID], [Title], [Description], [ResourceType], [FileURL], [FileSizeBytes], [MimeType], [AuthorID], [PublishedDate], [ViewCount], [DownloadCount], [AverageRating], [RatingCount], [IsFeatured], [RequiresMembership], [Status])
VALUES
    ('3D930326-657F-453F-8633-0AB26F09C078', @ResLib_CheeseRecipes, 'Traditional Cheddar - 200 Year Old Method', 'Authentic English cheddar recipe using traditional cheddaring techniques passed down through generations.', 'PDF', '/resources/cheddar-traditional.pdf', 2456789, 'application/pdf', @Member1, DATEADD(DAY, -180, @EndDate), 456, 234, 4.75, 12, 1, 0, 'Published'),
    ('02FF29AC-90DF-44E0-A9E3-62AC68B6E2E9', @ResLib_CheeseRecipes, 'Artisan Brie Making Guide', 'Complete guide to producing soft-ripened brie with proper bloomy rind development.', 'PDF', '/resources/brie-guide.pdf', 3234567, 'application/pdf', @Member2, DATEADD(DAY, -165, @EndDate), 389, 198, 4.50, 8, 1, 0, 'Published'),
    ('1407E135-1FA1-439F-A6BB-DEDBB74C00A7', @ResLib_CheeseRecipes, 'Swiss Cheese Production Manual', 'Professional-grade manual for producing authentic Swiss cheese with proper eye formation.', 'PDF', '/resources/swiss-manual.pdf', 4567890, 'application/pdf', @Member3, DATEADD(DAY, -150, @EndDate), 312, 167, 4.67, 9, 0, 1, 'Published'),
    ('13F8939A-AF69-4FFF-B597-2E9FC87E235D', @ResLib_CheeseRecipes, 'Mozzarella Quick Guide', 'Fast-track guide to making fresh mozzarella in under 2 hours.', 'PDF', '/resources/mozzarella-quick.pdf', 1234567, 'application/pdf', @Member4, DATEADD(DAY, -135, @EndDate), 678, 445, 4.25, 16, 1, 0, 'Published'),
    ('A74ABAD3-1629-4245-BE28-C343D7148918', @ResLib_CheeseRecipes, 'Blue Cheese Cultivation Techniques', 'Advanced guide to Penicillium roqueforti cultivation and blue cheese production.', 'PDF', '/resources/blue-cheese.pdf', 3456789, 'application/pdf', @Member5, DATEADD(DAY, -120, @EndDate), 234, 123, 4.80, 10, 0, 1, 'Published'),
    ('D141DB84-C80E-4BEB-BFA2-908A3084E2F4', @ResLib_CheeseRecipes, 'Gouda Aging Protocol', 'Complete protocol for aging Gouda cheese from 6 months to 5 years.', 'PDF', '/resources/gouda-aging.pdf', 2345678, 'application/pdf', @Member6, DATEADD(DAY, -105, @EndDate), 289, 156, 4.60, 5, 0, 1, 'Published'),
    ('44BF10A5-3724-4048-9F2E-67C5BA081985', @ResLib_CheeseRecipes, 'Feta in Brine - Traditional Greek Method', 'Authentic Greek feta recipe with proper brining techniques for shelf stability.', 'PDF', '/resources/feta-traditional.pdf', 1890234, 'application/pdf', @Member7, DATEADD(DAY, -90, @EndDate), 345, 189, 4.40, 7, 0, 0, 'Published'),
    ('27F98A70-A8DF-4C52-8426-5D60D94DAC21', @ResLib_CheeseRecipes, 'Parmesan 24-Month Production', 'Long-aged hard cheese production following Parmigiano-Reggiano methods.', 'PDF', '/resources/parmesan-24.pdf', 3789012, 'application/pdf', @Member8, DATEADD(DAY, -75, @EndDate), 267, 134, 4.90, 11, 1, 1, 'Published'),
    ('24A2D48B-95C5-40C4-A1A5-BEA76AE54474', @ResLib_CheeseRecipes, 'Cream Cheese & Soft Spreads', 'Collection of cream cheese and spreadable cheese recipes for retail production.', 'PDF', '/resources/cream-cheese.pdf', 2123456, 'application/pdf', @Member9, DATEADD(DAY, -60, @EndDate), 423, 267, 4.30, 13, 0, 0, 'Published'),
    ('60B5DDD4-7B0D-4A2D-A4D7-8F0CC51109FD', @ResLib_CheeseRecipes, 'Washed-Rind Cheese Handbook', 'Comprehensive guide to producing washed-rind cheeses with proper surface culture.', 'PDF', '/resources/washed-rind.pdf', 2890123, 'application/pdf', @Member10, DATEADD(DAY, -45, @EndDate), 198, 98, 4.70, 6, 0, 1, 'Published'),
    ('BBA5BD0E-4E11-4B87-BF6A-1988972B3452', @ResLib_CheeseRecipes, 'Processed Cheese Technology', 'Industrial guide to processed cheese production and emulsifying salts.', 'PDF', '/resources/processed-cheese.pdf', 3234890, 'application/pdf', @Member11, DATEADD(DAY, -30, @EndDate), 156, 87, 3.90, 4, 0, 1, 'Published'),
    ('4107E96F-79E0-4C38-81B9-3E96A5B09EE1', @ResLib_CheeseRecipes, 'Cottage Cheese Production Line Setup', 'Equipment and process guide for commercial cottage cheese production.', 'PDF', '/resources/cottage-setup.pdf', 4123456, 'application/pdf', @Member12, DATEADD(DAY, -25, @EndDate), 223, 112, 4.50, 8, 0, 1, 'Published'),
    ('2E25C5CE-77C1-488E-801E-4B6A71E8288A', @ResLib_CheeseRecipes, 'Ricotta from Whey - Sustainability Guide', 'Convert whey byproduct into high-value ricotta cheese for zero waste production.', 'PDF', '/resources/ricotta-whey.pdf', 1789012, 'application/pdf', @Member13, DATEADD(DAY, -20, @EndDate), 312, 178, 4.85, 9, 1, 0, 'Published'),
    ('ACA029A4-40A4-4E83-BCAF-488A56B2D8B1', @ResLib_CheeseRecipes, 'Smoked Cheese Techniques', 'Cold and hot smoking methods for cheese with equipment recommendations.', 'PDF', '/resources/smoked-cheese.pdf', 2456123, 'application/pdf', @Member14, DATEADD(DAY, -15, @EndDate), 267, 145, 4.40, 7, 0, 0, 'Published'),
    ('C846C20D-74B2-4AB7-B864-E9A03C57BC6A', @ResLib_CheeseRecipes, 'Lactose-Free Cheese Production', 'Methods for producing lactose-free cheese varieties for sensitive consumers.', 'PDF', '/resources/lactose-free.pdf', 2123789, 'application/pdf', @Member15, DATEADD(DAY, -10, @EndDate), 189, 98, 4.60, 5, 0, 1, 'Published');

-- Cultured Dairy (10 resources)
INSERT INTO [AssociationDemo].[Resource] ([ID], [CategoryID], [Title], [Description], [ResourceType], [FileURL], [FileSizeBytes], [MimeType], [AuthorID], [PublishedDate], [ViewCount], [DownloadCount], [AverageRating], [RatingCount], [IsFeatured], [RequiresMembership], [Status])
VALUES
    ('7D13C842-EE91-44A2-9B86-095C2F04AA08', @ResLib_YogurtRecipes, 'Greek Yogurt Production at Scale', 'Commercial Greek yogurt production with proper straining and texture development.', 'PDF', '/resources/greek-yogurt.pdf', 2789456, 'application/pdf', @Member16, DATEADD(DAY, -140, @EndDate), 445, 267, 4.55, 11, 1, 0, 'Published'),
    ('47641855-0BE8-4626-896F-DCA12AAB5A31', @ResLib_YogurtRecipes, 'Kefir Grain Cultivation Guide', 'Maintaining and propagating kefir grains for consistent production.', 'PDF', '/resources/kefir-grains.pdf', 1456789, 'application/pdf', @Member17, DATEADD(DAY, -125, @EndDate), 234, 134, 4.70, 8, 0, 0, 'Published'),
    ('084E8A8B-89B0-42A8-ACA7-06A81B1A463D', @ResLib_YogurtRecipes, 'Skyr - Icelandic Cultured Dairy', 'Traditional Icelandic skyr production methods and culture management.', 'PDF', '/resources/skyr-production.pdf', 2123456, 'application/pdf', @Member18, DATEADD(DAY, -110, @EndDate), 198, 112, 4.65, 6, 0, 1, 'Published'),
    ('58E0A4A0-5AA7-4B81-941C-69ABB7508FE8', @ResLib_YogurtRecipes, 'Probiotic Culture Selection', 'Choosing and managing probiotic cultures for functional dairy products.', 'Article', '/resources/probiotic-selection.html', 567890, 'text/html', @Member19, DATEADD(DAY, -95, @EndDate), 312, 0, 4.80, 9, 1, 1, 'Published'),
    ('83A3CB21-CC76-49D2-99F6-7253BED40C5C', @ResLib_YogurtRecipes, 'Buttermilk & Sour Cream Production', 'Cultured buttermilk and sour cream for retail and food service.', 'PDF', '/resources/buttermilk-sourcream.pdf', 1890234, 'application/pdf', @Member20, DATEADD(DAY, -80, @EndDate), 267, 145, 4.35, 7, 0, 0, 'Published'),
    ('91D2FD7E-7EF3-4319-B52B-F4DB0C151298', @ResLib_YogurtRecipes, 'Yogurt Flavor Development Workshop', 'Video series on developing natural flavors for yogurt products.', 'Video', '/resources/yogurt-flavors.mp4', 45678901, 'video/mp4', @Member1, DATEADD(DAY, -65, @EndDate), 523, 0, 4.90, 12, 1, 0, 'Published'),
    ('E61A7679-9228-4492-8AD9-B3C2B4BC1002', @ResLib_YogurtRecipes, 'Drinkable Yogurt Formulations', 'Formulating stable drinkable yogurt with proper viscosity and shelf life.', 'PDF', '/resources/drinkable-yogurt.pdf', 2345678, 'application/pdf', @Member2, DATEADD(DAY, -50, @EndDate), 289, 167, 4.45, 8, 0, 1, 'Published'),
    ('68FF1FF8-7893-4192-93A1-6ECB10353CDA', @ResLib_YogurtRecipes, 'Crème Fraîche Production Guide', 'European-style crème fraîche for culinary and retail applications.', 'PDF', '/resources/creme-fraiche.pdf', 1678901, 'application/pdf', @Member3, DATEADD(DAY, -35, @EndDate), 178, 89, 4.60, 5, 0, 0, 'Published'),
    ('085D39D2-7CDA-4290-B96C-5335422E93AE', @ResLib_YogurtRecipes, 'Quark & Fromage Blanc', 'Fresh cheese production techniques for quark and fromage blanc.', 'PDF', '/resources/quark-production.pdf', 2012345, 'application/pdf', @Member4, DATEADD(DAY, -20, @EndDate), 156, 78, 4.50, 6, 0, 1, 'Published'),
    ('EDE85BC9-6A01-450A-B9F3-7411D6B89AB3', @ResLib_YogurtRecipes, 'Plant-Based Yogurt Alternatives', 'Producing coconut, almond, and oat-based yogurt alternatives.', 'PDF', '/resources/plant-yogurt.pdf', 2456789, 'application/pdf', @Member5, DATEADD(DAY, -5, @EndDate), 423, 234, 4.25, 10, 1, 0, 'Published');

-- FDA & USDA Standards (15 resources)
INSERT INTO [AssociationDemo].[Resource] ([ID], [CategoryID], [Title], [Description], [ResourceType], [FileURL], [FileSizeBytes], [MimeType], [AuthorID], [PublishedDate], [ViewCount], [DownloadCount], [AverageRating], [RatingCount], [IsFeatured], [RequiresMembership], [Status])
VALUES
    ('D900D334-D76F-497A-9538-9FC5992755A6', @ResLib_FDA, 'Pasteurized Milk Ordinance (PMO) Guide', 'Complete guide to FDA PMO requirements for Grade A milk and dairy products.', 'PDF', '/resources/pmo-guide.pdf', 5678901, 'application/pdf', @Member6, DATEADD(DAY, -200, @EndDate), 678, 389, 4.95, 15, 1, 0, 'Published'),
    ('91AC5AFE-4D2F-4FBE-92B6-5F733DA82391', @ResLib_FDA, 'HACCP Plan Template for Cheese Plants', 'FDA-compliant HACCP plan template specifically for cheese manufacturing.', 'Template', '/resources/haccp-template.docx', 234567, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', @Member7, DATEADD(DAY, -185, @EndDate), 891, 567, 4.88, 18, 1, 0, 'Published'),
    ('BFB45369-CFFC-4638-8296-8E0392791AEA', @ResLib_FDA, 'FSMA Preventive Controls Guide', 'Understanding FSMA Preventive Controls for Human Food in dairy operations.', 'PDF', '/resources/fsma-preventive.pdf', 4123456, 'application/pdf', @Member8, DATEADD(DAY, -170, @EndDate), 534, 312, 4.80, 13, 1, 0, 'Published'),
    ('13867E15-4ED7-4689-8EC3-D99FD03A766F', @ResLib_FDA, 'Listeria Environmental Monitoring', 'Best practices for Listeria monocytogenes environmental monitoring programs.', 'PDF', '/resources/listeria-monitoring.pdf', 3456789, 'application/pdf', @Member9, DATEADD(DAY, -155, @EndDate), 423, 267, 4.92, 14, 1, 1, 'Published'),
    ('E461CE45-7945-432F-A00C-F210ABB44F7C', @ResLib_FDA, 'Raw Milk Cheese Regulations', '60-day aging rule and other FDA requirements for raw milk cheese production.', 'PDF', '/resources/raw-milk-regs.pdf', 2789012, 'application/pdf', @Member10, DATEADD(DAY, -140, @EndDate), 389, 223, 4.70, 11, 0, 0, 'Published'),
    ('3EC7E952-4314-46B8-905D-A93C0E92168A', @ResLib_FDA, 'Dairy Plant Sanitation Standards', 'FDA 3-A Sanitary Standards for dairy processing equipment and facilities.', 'PDF', '/resources/sanitation-standards.pdf', 3890123, 'application/pdf', @Member11, DATEADD(DAY, -125, @EndDate), 312, 189, 4.65, 9, 0, 1, 'Published'),
    ('6D30AE47-4743-40F4-9C9A-EFBC2A37F3D8', @ResLib_FDA, 'Allergen Control Program Template', 'Managing milk allergen controls and labeling compliance.', 'Template', '/resources/allergen-template.docx', 178901, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', @Member12, DATEADD(DAY, -110, @EndDate), 445, 298, 4.75, 12, 1, 0, 'Published'),
    ('D37779B4-5EA9-4E84-AB67-3A4D6D3911C2', @ResLib_FDA, 'Food Defense Plan for Dairy', 'FDA Food Defense plan template and guidance for dairy facilities.', 'PDF', '/resources/food-defense.pdf', 2456789, 'application/pdf', @Member13, DATEADD(DAY, -95, @EndDate), 267, 156, 4.60, 8, 0, 1, 'Published'),
    ('25927717-DEE0-4958-8459-F734CD593FF1', @ResLib_FDA, 'Recall Procedures & Mock Recall Guide', 'Developing effective recall procedures with mock recall templates.', 'PDF', '/resources/recall-procedures.pdf', 2123456, 'application/pdf', @Member14, DATEADD(DAY, -80, @EndDate), 356, 198, 4.85, 10, 1, 0, 'Published'),
    ('CF321DB8-6E45-4BD5-946F-88EDDE5C3C85', @ResLib_FDA, 'Nutrition Labeling for Cheese Products', 'Calculating and formatting nutrition facts labels for cheese varieties.', 'PDF', '/resources/nutrition-labeling.pdf', 1890234, 'application/pdf', @Member15, DATEADD(DAY, -65, @EndDate), 423, 267, 4.50, 11, 0, 0, 'Published'),
    ('2D448EE6-84DC-4E26-B771-A7865EA28E92', @ResLib_FDA, 'Certificate of Free Sale Requirements', 'Obtaining FDA certificates for export of dairy products.', 'Article', '/resources/free-sale-cert.html', 456789, 'text/html', @Member16, DATEADD(DAY, -50, @EndDate), 198, 0, 4.40, 6, 0, 1, 'Published'),
    ('11D7837C-B90B-4DF1-B1CC-C2C23F533CBC', @ResLib_FDA, 'Interstate Milk Shippers List Application', 'How to get on the IMS List for interstate milk and dairy shipping.', 'PDF', '/resources/ims-application.pdf', 1678901, 'application/pdf', @Member17, DATEADD(DAY, -35, @EndDate), 234, 134, 4.70, 7, 0, 0, 'Published'),
    ('A6BB65AB-B955-455E-8EE3-46028A2E7928', @ResLib_FDA, 'Water Quality Testing Protocols', 'FDA and EPA water testing requirements for dairy processing plants.', 'PDF', '/resources/water-testing.pdf', 2345678, 'application/pdf', @Member18, DATEADD(DAY, -28, @EndDate), 289, 167, 4.55, 8, 0, 1, 'Published'),
    ('62717F53-9C71-411E-A57E-8C6424D6A57E', @ResLib_FDA, 'Supplier Verification Program Guide', 'FSMA supplier verification and approval programs for dairy ingredients.', 'PDF', '/resources/supplier-verification.pdf', 2890123, 'application/pdf', @Member19, DATEADD(DAY, -18, @EndDate), 312, 178, 4.80, 9, 1, 1, 'Published'),
    ('E52C9190-55DB-4F0C-B5FE-CED7D1F6E3E2', @ResLib_FDA, 'Current Good Manufacturing Practices (cGMP)', 'FDA cGMP requirements specific to dairy processing operations.', 'PDF', '/resources/cgmp-dairy.pdf', 3456789, 'application/pdf', @Member20, DATEADD(DAY, -8, @EndDate), 445, 234, 4.90, 13, 1, 0, 'Published');

-- International Standards (10 resources)
INSERT INTO [AssociationDemo].[Resource] ([ID], [CategoryID], [Title], [Description], [ResourceType], [FileURL], [FileSizeBytes], [MimeType], [AuthorID], [PublishedDate], [ViewCount], [DownloadCount], [AverageRating], [RatingCount], [IsFeatured], [RequiresMembership], [Status])
VALUES
    ('267A36E2-DF9E-47DE-93AE-A7442A683501', @ResLib_International, 'EU Cheese Export Requirements Checklist', 'Complete checklist for exporting cheese products to European Union markets.', 'Document', '/resources/eu-export-checklist.pdf', 1234567, 'application/pdf', @Member1, DATEADD(DAY, -160, @EndDate), 356, 198, 4.85, 11, 1, 1, 'Published'),
    ('AAA6F51C-E112-4E72-A608-ACD14CD50131', @ResLib_International, 'Canadian Food Inspection Agency (CFIA) Compliance', 'CFIA requirements for dairy exports to Canada.', 'PDF', '/resources/cfia-compliance.pdf', 2456789, 'application/pdf', @Member2, DATEADD(DAY, -145, @EndDate), 267, 145, 4.60, 8, 0, 1, 'Published'),
    ('F1AC7402-A5E2-4FD6-BAE7-51DC0FC06391', @ResLib_International, 'Protected Designation of Origin (PDO) Guide', 'Understanding EU PDO and PGI certifications for cheese.', 'PDF', '/resources/pdo-guide.pdf', 3123456, 'application/pdf', @Member3, DATEADD(DAY, -130, @EndDate), 198, 112, 4.75, 9, 0, 1, 'Published'),
    ('DCAF2D3F-CD4E-4A8C-A5E8-295F8D6E54B1', @ResLib_International, 'Codex Alimentarius Standards for Cheese', 'International Codex standards for cheese classification and labeling.', 'PDF', '/resources/codex-cheese.pdf', 2789012, 'application/pdf', @Member4, DATEADD(DAY, -115, @EndDate), 234, 134, 4.70, 7, 0, 1, 'Published'),
    ('80A26234-E25C-40F5-BE59-4552EF103ABD', @ResLib_International, 'Halal Certification for Dairy Products', 'Obtaining halal certification for cheese and dairy exports to Muslim markets.', 'PDF', '/resources/halal-certification.pdf', 1890234, 'application/pdf', @Member5, DATEADD(DAY, -100, @EndDate), 312, 178, 4.55, 10, 1, 1, 'Published'),
    ('D132960A-CF31-416E-A861-88F37514061D', @ResLib_International, 'Kosher Dairy Certification Process', 'Working with kosher certifying agencies for dairy production.', 'PDF', '/resources/kosher-dairy.pdf', 1678901, 'application/pdf', @Member6, DATEADD(DAY, -85, @EndDate), 289, 156, 4.65, 8, 0, 1, 'Published'),
    ('7F023681-DBD8-4E14-80D2-EF13EB650EF4', @ResLib_International, 'Australian Dairy Export Standards', 'Export requirements for cheese and dairy products to Australia and New Zealand.', 'PDF', '/resources/australia-export.pdf', 2123456, 'application/pdf', @Member7, DATEADD(DAY, -70, @EndDate), 178, 98, 4.50, 6, 0, 1, 'Published'),
    ('44DDD774-F313-4E50-815B-80F32F26C3EB', @ResLib_International, 'Japanese Import Regulations for Dairy', 'Navigating Japanese food safety and import requirements.', 'PDF', '/resources/japan-import.pdf', 2456789, 'application/pdf', @Member8, DATEADD(DAY, -55, @EndDate), 223, 123, 4.80, 9, 1, 1, 'Published'),
    ('C4737E12-8F5E-4436-9CAB-959F360C2507', @ResLib_International, 'Chinese Market Access for Dairy', 'Requirements for exporting dairy products to China including facility registration.', 'PDF', '/resources/china-market.pdf', 2890123, 'application/pdf', @Member9, DATEADD(DAY, -40, @EndDate), 267, 145, 4.40, 7, 0, 1, 'Published'),
    ('2948CB8D-FB7E-4ED9-A3C4-927654A0E273', @ResLib_International, 'UK Post-Brexit Dairy Regulations', 'Updated UK dairy regulations and export/import requirements after Brexit.', 'Article', '/resources/uk-brexit.html', 678901, 'text/html', @Member10, DATEADD(DAY, -12, @EndDate), 389, 0, 4.90, 11, 1, 1, 'Published');

-- Production Techniques (15 resources)
INSERT INTO [AssociationDemo].[Resource] ([ID], [CategoryID], [Title], [Description], [ResourceType], [FileURL], [FileSizeBytes], [MimeType], [AuthorID], [PublishedDate], [ViewCount], [DownloadCount], [AverageRating], [RatingCount], [IsFeatured], [RequiresMembership], [Status])
VALUES
    ('2149DAE1-1CEC-4F7B-80E0-45FE81CA2F33', @ResLib_Production, 'Cheese Yield Optimization Calculator', 'Excel calculator for maximizing cheese yield and reducing costs.', 'Spreadsheet', '/resources/yield-calculator.xlsx', 456789, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', @Member11, DATEADD(DAY, -175, @EndDate), 534, 312, 4.92, 14, 1, 1, 'Published'),
    ('0232BD08-D76E-4745-9C7A-6D8A77CBC306', @ResLib_Production, 'Milk Standardization Techniques', 'Protein and fat standardization methods for consistent cheese production.', 'PDF', '/resources/milk-standardization.pdf', 2345678, 'application/pdf', @Member12, DATEADD(DAY, -160, @EndDate), 312, 189, 4.70, 10, 0, 1, 'Published'),
    ('93F74D3A-BDD1-4151-A4C0-B5C7BFBD78F7', @ResLib_Production, 'Starter Culture Management', 'Maintaining mother cultures and troubleshooting starter culture issues.', 'PDF', '/resources/starter-culture.pdf', 2890123, 'application/pdf', @Member13, DATEADD(DAY, -145, @EndDate), 423, 245, 4.85, 12, 1, 1, 'Published'),
    ('37CF4D67-DC11-41A7-A050-ACBAEE42C42F', @ResLib_Production, 'Curd Handling Best Practices', 'Proper curd cutting, cooking, and handling for quality cheese.', 'Video', '/resources/curd-handling.mp4', 67890123, 'video/mp4', @Member14, DATEADD(DAY, -130, @EndDate), 489, 0, 4.95, 15, 1, 1, 'Published'),
    ('1BE1C901-18CD-4876-A141-EEBB5A4ECA8B', @ResLib_Production, 'Cheese Cave Management', 'Temperature, humidity, and airflow control for aging caves.', 'PDF', '/resources/cave-management.pdf', 3123456, 'application/pdf', @Member15, DATEADD(DAY, -115, @EndDate), 345, 198, 4.75, 11, 0, 1, 'Published'),
    ('4ACC382C-EBB4-46F2-86E1-D770CB0C0364', @ResLib_Production, 'Whey Protein Recovery Systems', 'Installing and operating whey protein concentration equipment.', 'PDF', '/resources/whey-recovery.pdf', 3890123, 'application/pdf', @Member16, DATEADD(DAY, -100, @EndDate), 289, 167, 4.60, 9, 0, 1, 'Published'),
    ('DCE66812-18AB-4E8E-B282-3631A7B2FC7E', @ResLib_Production, 'Cheese Packaging Line Setup', 'Designing efficient cheese packaging operations for retail and foodservice.', 'PDF', '/resources/packaging-setup.pdf', 4123456, 'application/pdf', @Member17, DATEADD(DAY, -85, @EndDate), 267, 145, 4.50, 8, 0, 1, 'Published'),
    ('4DDFEC12-C51A-417A-8FD0-BE0B1AFA0EB6', @ResLib_Production, 'Thermization vs Pasteurization', 'Comparing heat treatment methods and their effects on cheese quality.', 'Article', '/resources/heat-treatment.html', 567890, 'text/html', @Member18, DATEADD(DAY, -70, @EndDate), 312, 0, 4.80, 10, 1, 1, 'Published'),
    ('0F4B0253-880B-4F20-A087-DE25B400BAA4', @ResLib_Production, 'Natural Rind Development Techniques', 'Developing natural rinds on artisan cheese through proper cave management.', 'PDF', '/resources/natural-rind.pdf', 2456789, 'application/pdf', @Member19, DATEADD(DAY, -55, @EndDate), 234, 134, 4.70, 8, 0, 1, 'Published'),
    ('1046C8D2-4BA5-4D2C-B130-A2B5AF6F9B58', @ResLib_Production, 'Annatto and Natural Colorants', 'Using natural colorants in cheese production and regulatory considerations.', 'PDF', '/resources/annatto-colorants.pdf', 1890234, 'application/pdf', @Member20, DATEADD(DAY, -40, @EndDate), 198, 112, 4.45, 7, 0, 0, 'Published'),
    ('657E3D98-9413-40CE-AC9B-F8E226FABA58', @ResLib_Production, 'Affinage Techniques from Master Affineurs', 'Professional cheese ripening and affinage methods.', 'PDF', '/resources/affinage-techniques.pdf', 3234567, 'application/pdf', @Member1, DATEADD(DAY, -32, @EndDate), 356, 189, 4.90, 12, 1, 1, 'Published'),
    ('1E23D4C3-C343-4ABB-9A16-34605996B926', @ResLib_Production, 'Membrane Filtration in Cheese Making', 'Ultrafiltration and microfiltration applications in modern cheese production.', 'PDF', '/resources/membrane-filtration.pdf', 2789012, 'application/pdf', @Member2, DATEADD(DAY, -24, @EndDate), 223, 123, 4.65, 8, 0, 1, 'Published'),
    ('606A450E-CAD3-4C76-80E0-261EBE66A0C8', @ResLib_Production, 'Salt Brining Procedures', 'Proper brine management and salting techniques for various cheese types.', 'PDF', '/resources/salt-brining.pdf', 2123456, 'application/pdf', @Member3, DATEADD(DAY, -16, @EndDate), 289, 156, 4.75, 9, 0, 1, 'Published'),
    ('92BCFEE8-0E3D-4C23-84BA-C3AD5976D88C', @ResLib_Production, 'Equipment Calibration Schedule', 'Template for maintaining calibration records on production equipment.', 'Template', '/resources/calibration-template.xlsx', 234567, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', @Member4, DATEADD(DAY, -9, @EndDate), 267, 145, 4.55, 7, 0, 1, 'Published'),
    ('83F4400D-6C51-4C0C-8068-AFF96F53A2E3', @ResLib_Production, 'Energy Efficiency in Dairy Processing', 'Reducing energy costs through efficient refrigeration and process optimization.', 'PDF', '/resources/energy-efficiency.pdf', 3123456, 'application/pdf', @Member5, DATEADD(DAY, -3, @EndDate), 312, 178, 4.80, 10, 1, 1, 'Published');

-- Quality Control (15 resources)
INSERT INTO [AssociationDemo].[Resource] ([ID], [CategoryID], [Title], [Description], [ResourceType], [FileURL], [FileSizeBytes], [MimeType], [AuthorID], [PublishedDate], [ViewCount], [DownloadCount], [AverageRating], [RatingCount], [IsFeatured], [RequiresMembership], [Status])
VALUES
    ('C87784F1-C4CF-4523-9019-1040B70E45DB', @ResLib_Quality, 'Microbiological Testing Protocols', 'Standard methods for testing cheese and dairy products for pathogens.', 'PDF', '/resources/micro-testing.pdf', 3456789, 'application/pdf', @Member6, DATEADD(DAY, -190, @EndDate), 445, 267, 4.90, 14, 1, 1, 'Published'),
    ('E59905F7-026B-4EEE-A08E-2858E5D17936', @ResLib_Quality, 'Sensory Evaluation Training Manual', 'Training cheese graders and developing a sensory evaluation program.', 'PDF', '/resources/sensory-evaluation.pdf', 4123456, 'application/pdf', @Member7, DATEADD(DAY, -175, @EndDate), 389, 223, 4.85, 13, 1, 1, 'Published'),
    ('B103302A-77D8-455A-9E93-ED743FE3B0B5', @ResLib_Quality, 'pH and Acidity Testing Procedures', 'Proper techniques for measuring pH and titratable acidity in cheese.', 'PDF', '/resources/ph-testing.pdf', 1890234, 'application/pdf', @Member8, DATEADD(DAY, -160, @EndDate), 312, 189, 4.70, 10, 0, 1, 'Published'),
    ('19FAA5B0-C233-425D-BF25-F25625E4E8C9', @ResLib_Quality, 'Moisture Content Analysis', 'Accurate moisture determination methods for cheese varieties.', 'PDF', '/resources/moisture-analysis.pdf', 1678901, 'application/pdf', @Member9, DATEADD(DAY, -145, @EndDate), 267, 156, 4.65, 9, 0, 1, 'Published'),
    ('3F02308B-48A1-4251-B469-01C49759C409', @ResLib_Quality, 'Cheese Grading Standards', 'USDA and industry grading standards for different cheese types.', 'PDF', '/resources/grading-standards.pdf', 2890123, 'application/pdf', @Member10, DATEADD(DAY, -130, @EndDate), 356, 198, 4.75, 11, 1, 0, 'Published'),
    ('706A631F-F15E-4371-BB1A-6A84F92BFA03', @ResLib_Quality, 'Salt-in-Moisture Calculations', 'Calculating and controlling salt-in-moisture for food safety and quality.', 'Spreadsheet', '/resources/salt-calculator.xlsx', 345678, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', @Member11, DATEADD(DAY, -115, @EndDate), 289, 167, 4.80, 10, 0, 1, 'Published'),
    ('C1216F93-7257-4149-95E4-1956B2BCF139', @ResLib_Quality, 'Texture Profile Analysis', 'Using instrumental texture analysis for cheese quality control.', 'PDF', '/resources/texture-analysis.pdf', 2456789, 'application/pdf', @Member12, DATEADD(DAY, -100, @EndDate), 234, 134, 4.60, 8, 0, 1, 'Published'),
    ('B310BE3F-B0E1-48E2-A57B-524DBF8E84BC', @ResLib_Quality, 'Color Measurement Techniques', 'Standardizing cheese color measurement and specification.', 'PDF', '/resources/color-measurement.pdf', 1789012, 'application/pdf', @Member13, DATEADD(DAY, -85, @EndDate), 198, 112, 4.55, 7, 0, 1, 'Published'),
    ('3E42E37B-0641-4314-958D-DBC5F9988AC3', @ResLib_Quality, 'Defect Troubleshooting Guide', 'Identifying and correcting common cheese defects and their causes.', 'PDF', '/resources/defect-guide.pdf', 3890123, 'application/pdf', @Member14, DATEADD(DAY, -70, @EndDate), 523, 312, 4.95, 16, 1, 1, 'Published'),
    ('7C18C621-C9D7-4975-9933-6D6ECC840E16', @ResLib_Quality, 'Statistical Process Control for Cheese', 'Implementing SPC charts and process capability studies.', 'PDF', '/resources/spc-cheese.pdf', 2789012, 'application/pdf', @Member15, DATEADD(DAY, -55, @EndDate), 312, 178, 4.70, 9, 0, 1, 'Published'),
    ('46AB6CD8-4795-4E82-AB37-63BE7EC8A175', @ResLib_Quality, 'Shelf Life Testing Protocols', 'Designing shelf life studies for cheese products.', 'PDF', '/resources/shelf-life.pdf', 2345678, 'application/pdf', @Member16, DATEADD(DAY, -40, @EndDate), 267, 145, 4.65, 8, 0, 1, 'Published'),
    ('E181943D-3D12-4B32-994F-D759699DE097', @ResLib_Quality, 'Water Activity Measurement', 'Understanding and controlling water activity for food safety.', 'PDF', '/resources/water-activity.pdf', 1890234, 'application/pdf', @Member17, DATEADD(DAY, -33, @EndDate), 223, 123, 4.75, 9, 1, 1, 'Published'),
    ('A1E145AE-5BA1-4FA6-AEFC-4EC61A86F3F5', @ResLib_Quality, 'Lab Quality Assurance Program', 'Setting up a quality assurance program for your testing laboratory.', 'PDF', '/resources/lab-qa.pdf', 2456789, 'application/pdf', @Member18, DATEADD(DAY, -22, @EndDate), 289, 156, 4.80, 10, 0, 1, 'Published'),
    ('8E32198C-CB9B-4860-BD3B-524BC186C359', @ResLib_Quality, 'Rapid Testing Methods', 'Latest rapid microbiological and chemical testing technologies.', 'Article', '/resources/rapid-testing.html', 678901, 'text/html', @Member19, DATEADD(DAY, -14, @EndDate), 356, 0, 4.85, 11, 1, 1, 'Published'),
    ('57D27954-8ECC-4E83-8819-9B9128C0BDAB', @ResLib_Quality, 'Cheese Competition Entry Guide', 'Preparing cheese entries for competitions and understanding judging criteria.', 'PDF', '/resources/competition-guide.pdf', 2123456, 'application/pdf', @Member20, DATEADD(DAY, -6, @EndDate), 423, 245, 4.90, 13, 1, 0, 'Published');

-- Business Templates (10 resources)
INSERT INTO [AssociationDemo].[Resource] ([ID], [CategoryID], [Title], [Description], [ResourceType], [FileURL], [FileSizeBytes], [MimeType], [AuthorID], [PublishedDate], [ViewCount], [DownloadCount], [AverageRating], [RatingCount], [IsFeatured], [RequiresMembership], [Status])
VALUES
    ('B7C9576D-CA4F-4FC1-95C7-6048B072360D', @ResLib_Templates, 'Cheese Business Plan Template', 'Comprehensive business plan template for starting a cheese company.', 'Template', '/resources/business-plan.docx', 456789, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', @Member1, DATEADD(DAY, -155, @EndDate), 534, 312, 4.88, 15, 1, 1, 'Published'),
    ('B06F3371-8446-43C5-B088-EBE27B9BA185', @ResLib_Templates, 'Creamery Startup Cost Calculator', 'Excel template for calculating startup costs for a cheese facility.', 'Spreadsheet', '/resources/startup-costs.xlsx', 567890, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', @Member2, DATEADD(DAY, -140, @EndDate), 445, 267, 4.75, 12, 1, 1, 'Published'),
    ('79769FA4-0077-47D0-9F7F-87B181C888C9', @ResLib_Templates, 'Production Scheduling Template', 'Weekly production planning spreadsheet for cheese makers.', 'Spreadsheet', '/resources/production-schedule.xlsx', 345678, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', @Member3, DATEADD(DAY, -125, @EndDate), 356, 198, 4.70, 10, 0, 1, 'Published'),
    ('9D8A70EA-0957-4091-9534-EC942500EE3D', @ResLib_Templates, 'Inventory Management System', 'Track raw materials, WIP, and finished goods inventory.', 'Spreadsheet', '/resources/inventory-template.xlsx', 678901, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', @Member4, DATEADD(DAY, -110, @EndDate), 389, 223, 4.65, 11, 0, 1, 'Published'),
    ('DB52C9A4-6161-4C93-BF1B-094E44F00AF0', @ResLib_Templates, 'Cost Analysis Worksheets', 'Calculate production costs, margins, and pricing for cheese products.', 'Spreadsheet', '/resources/cost-analysis.xlsx', 456789, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', @Member5, DATEADD(DAY, -95, @EndDate), 312, 178, 4.80, 12, 1, 1, 'Published'),
    ('2622052C-47FA-4FFF-900C-DFA830DC214E', @ResLib_Templates, 'Employee Training Checklist', 'Comprehensive training checklist for new cheese plant employees.', 'Template', '/resources/training-checklist.docx', 234567, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', @Member6, DATEADD(DAY, -80, @EndDate), 267, 145, 4.60, 9, 0, 1, 'Published'),
    ('E5BBF572-730A-4FD4-B1B2-D289526C5A1F', @ResLib_Templates, 'Sales Forecasting Model', 'Project future sales and plan production capacity.', 'Spreadsheet', '/resources/sales-forecast.xlsx', 567890, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', @Member7, DATEADD(DAY, -65, @EndDate), 289, 156, 4.70, 8, 0, 1, 'Published'),
    ('ADB84D56-C2C9-4BF2-A84C-44C8D20B0267', @ResLib_Templates, 'Wholesale Price List Template', 'Professional price list template for foodservice and retail buyers.', 'Template', '/resources/price-list.xlsx', 345678, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', @Member8, DATEADD(DAY, -50, @EndDate), 234, 134, 4.55, 7, 0, 0, 'Published'),
    ('A19140CF-3625-4DF3-9E53-B9A3E42A5D90', @ResLib_Templates, 'Customer Order Form', 'Customizable order form for cheese and dairy products.', 'Template', '/resources/order-form.docx', 178901, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', @Member9, DATEADD(DAY, -35, @EndDate), 198, 112, 4.50, 6, 0, 0, 'Published'),
    ('B81EC361-0F22-4238-B773-890307134AC5', @ResLib_Templates, 'Equipment Maintenance Log', 'Track preventive maintenance and repairs on processing equipment.', 'Spreadsheet', '/resources/maintenance-log.xlsx', 234567, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', @Member10, DATEADD(DAY, -21, @EndDate), 223, 123, 4.75, 8, 1, 1, 'Published');

-- Marketing Materials (10 resources)
INSERT INTO [AssociationDemo].[Resource] ([ID], [CategoryID], [Title], [Description], [ResourceType], [FileURL], [FileSizeBytes], [MimeType], [AuthorID], [PublishedDate], [ViewCount], [DownloadCount], [AverageRating], [RatingCount], [IsFeatured], [RequiresMembership], [Status])
VALUES
    ('ABFCC118-3B18-482D-B9D2-3D1D482093EC', @ResLib_SocialMedia, 'Social Media Content Calendar', '12-month content calendar template for cheese company social media.', 'Spreadsheet', '/resources/social-calendar.xlsx', 456789, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', @Member11, DATEADD(DAY, -135, @EndDate), 445, 267, 4.85, 13, 1, 0, 'Published'),
    ('5BCE5438-FEF7-4BE5-BBA5-DE17FA2CC286', @ResLib_SocialMedia, 'Instagram Post Templates for Cheese', 'Canva templates for beautiful cheese photography posts.', 'Link', 'https://canva.com/cheese-templates', 0, NULL, @Member12, DATEADD(DAY, -120, @EndDate), 534, 0, 4.70, 11, 1, 0, 'Published'),
    ('CAF18826-F1D6-4AC8-AACC-C2F750EB98A6', @ResLib_SocialMedia, 'Hashtag Strategy Guide', 'Effective hashtag strategies for cheese and artisan food marketing.', 'PDF', '/resources/hashtag-guide.pdf', 1234567, 'application/pdf', @Member13, DATEADD(DAY, -105, @EndDate), 389, 223, 4.60, 9, 0, 0, 'Published'),
    ('4EBB6212-59DB-4BC3-9DBE-296F20E3CEC7', @ResLib_ContentLib, 'Professional Cheese Photography Library', 'High-resolution stock photos of various cheese types for marketing use.', 'Link', '/resources/photo-library/', 0, NULL, @Member14, DATEADD(DAY, -90, @EndDate), 678, 0, 4.95, 17, 1, 0, 'Published'),
    ('8E49F554-9193-4F67-9EF4-FA5B72B4F1BE', @ResLib_ContentLib, 'Cheese Pairing Infographics', 'Downloadable infographics for wine and beer pairings with cheese.', 'PDF', '/resources/pairing-infographics.pdf', 5678901, 'application/pdf', @Member15, DATEADD(DAY, -75, @EndDate), 523, 312, 4.88, 14, 1, 0, 'Published'),
    ('E623497B-0A84-4DBE-9F78-4922094260E7', @ResLib_ContentLib, 'Cheese Board Tutorial Videos', 'Video series on creating beautiful cheese boards for social media.', 'Video', '/resources/cheese-boards.mp4', 89012345, 'video/mp4', @Member16, DATEADD(DAY, -60, @EndDate), 612, 0, 4.92, 16, 1, 0, 'Published'),
    ('51236809-E718-4449-84EB-5AF8D72F4D3A', @ResLib_SocialMedia, 'Email Newsletter Templates', 'Professional email templates for customer communications.', 'Template', '/resources/newsletter-templates.html', 234567, 'text/html', @Member17, DATEADD(DAY, -45, @EndDate), 312, 178, 4.65, 10, 0, 0, 'Published'),
    ('718835A8-B1A5-420A-B909-EB81B8D6C778', @ResLib_ContentLib, 'Farmers Market Display Ideas', 'Photo guide to attractive cheese display setups for farmers markets.', 'PDF', '/resources/market-displays.pdf', 6789012, 'application/pdf', @Member18, DATEADD(DAY, -30, @EndDate), 356, 198, 4.75, 11, 0, 0, 'Published'),
    ('6943D3FF-4014-46EF-9A89-55A458D3E7A2', @ResLib_SocialMedia, 'Behind-the-Scenes Content Guide', 'Creating engaging BTS content from your cheese making process.', 'Article', '/resources/bts-content.html', 567890, 'text/html', @Member19, DATEADD(DAY, -17, @EndDate), 423, 0, 4.80, 12, 1, 0, 'Published'),
    ('F4CDCA05-666A-4FD3-828B-78339538458E', @ResLib_ContentLib, 'Recipe Cards for Customer Distribution', 'Printable recipe cards featuring your cheese products.', 'Template', '/resources/recipe-cards.pdf', 2345678, 'application/pdf', @Member20, DATEADD(DAY, -7, @EndDate), 389, 223, 4.70, 9, 0, 0, 'Published');

-- ============================================================================
-- Resource Versions (50+ versions showing document updates)
-- ============================================================================

INSERT INTO [AssociationDemo].[ResourceVersion] ([ID], [ResourceID], [VersionNumber], [VersionNotes], [FileURL], [FileSizeBytes], [CreatedByID], [CreatedDate], [IsCurrent])
VALUES
    -- HACCP Template has been updated multiple times
    ('C70A3912-6655-4287-B609-E3B6EA849CF6', '91AC5AFE-4D2F-4FBE-92B6-5F733DA82391', '1.0', 'Initial release', '/resources/haccp-template-v1.docx', 234567, @Member7, DATEADD(DAY, -185, @EndDate), 0),
    ('64038109-CACA-4D95-BB4A-860B16A5BD8F', '91AC5AFE-4D2F-4FBE-92B6-5F733DA82391', '1.1', 'Added allergen control section', '/resources/haccp-template-v1.1.docx', 245678, @Member7, DATEADD(DAY, -120, @EndDate), 0),
    ('C81076AB-E947-41E2-B274-ECEA2F3229DE', '91AC5AFE-4D2F-4FBE-92B6-5F733DA82391', '2.0', 'Updated for new FSMA requirements', '/resources/haccp-template.docx', 234567, @Member7, DATEADD(DAY, -45, @EndDate), 1),

    -- PMO Guide updates
    ('1FBBF285-CE30-4851-BCBC-55425F2D9AD0', 'D900D334-D76F-497A-9538-9FC5992755A6', '2023', '2023 PMO revision', '/resources/pmo-guide-2023.pdf', 5678901, @Member6, DATEADD(DAY, -200, @EndDate), 0),
    ('69B2B6D9-9995-4B77-80AD-37FA1611C5F4', 'D900D334-D76F-497A-9538-9FC5992755A6', '2024', 'Updated with 2024 changes', '/resources/pmo-guide.pdf', 5678901, @Member6, DATEADD(DAY, -60, @EndDate), 1),

    -- Business Plan Template revisions
    ('5ED59D98-193D-4E03-A5AC-11D4EA14435D', 'B7C9576D-CA4F-4FC1-95C7-6048B072360D', '1.0', 'Original template', '/resources/business-plan-v1.docx', 456789, @Member1, DATEADD(DAY, -155, @EndDate), 0),
    ('B804CE2D-3E59-47EB-9AD0-3092C821B7F9', 'B7C9576D-CA4F-4FC1-95C7-6048B072360D', '2.0', 'Added financial projections worksheet', '/resources/business-plan.docx', 456789, @Member1, DATEADD(DAY, -78, @EndDate), 1),

    -- Yield Calculator updates
    ('13D61D99-8E12-4531-9C7F-9A862FAE7E85', '2149DAE1-1CEC-4F7B-80E0-45FE81CA2F33', '1.0', 'Basic calculator', '/resources/yield-calculator-v1.xlsx', 456789, @Member11, DATEADD(DAY, -175, @EndDate), 0),
    ('6108271B-A407-4158-8F75-9ABA047E8119', '2149DAE1-1CEC-4F7B-80E0-45FE81CA2F33', '1.5', 'Added cost analysis', '/resources/yield-calculator-v1.5.xlsx', 478901, @Member11, DATEADD(DAY, -110, @EndDate), 0),
    ('1FD29A13-277F-4435-95BC-49B39D676C94', '2149DAE1-1CEC-4F7B-80E0-45FE81CA2F33', '2.0', 'Added graphing capabilities', '/resources/yield-calculator.xlsx', 456789, @Member11, DATEADD(DAY, -52, @EndDate), 1),

    -- Traditional Cheddar Recipe refinements
    ('3B8AE3BD-14F8-4CC0-8607-F0CBBF564CD4', '3D930326-657F-453F-8633-0AB26F09C078', '1.0', 'Traditional recipe', '/resources/cheddar-traditional-v1.pdf', 2456789, @Member1, DATEADD(DAY, -180, @EndDate), 0),
    ('17DB6389-04DA-4DAD-83DA-F3DF8B076458', '3D930326-657F-453F-8633-0AB26F09C078', '1.1', 'Added troubleshooting section', '/resources/cheddar-traditional.pdf', 2456789, @Member1, DATEADD(DAY, -92, @EndDate), 1),

    -- Defect Guide major updates
    ('3B181B2F-8130-4477-BB77-8EEFFE55D166', '3E42E37B-0641-4314-958D-DBC5F9988AC3', '1.0', 'Initial guide', '/resources/defect-guide-v1.pdf', 3890123, @Member14, DATEADD(DAY, -70, @EndDate), 0),
    ('1DB1338C-C8C6-4311-82A9-FC4077B76EEF', '3E42E37B-0641-4314-958D-DBC5F9988AC3', '2.0', 'Added photo examples of defects', '/resources/defect-guide.pdf', 3890123, @Member14, DATEADD(DAY, -28, @EndDate), 1),

    -- Micro Testing updates for new methods
    ('5329068B-1489-4659-BC90-9A3C3D15BBD2', 'C87784F1-C4CF-4523-9019-1040B70E45DB', '1.0', 'Standard methods', '/resources/micro-testing-v1.pdf', 3456789, @Member6, DATEADD(DAY, -190, @EndDate), 0),
    ('E7028C3E-4979-4627-96A4-394641782A12', 'C87784F1-C4CF-4523-9019-1040B70E45DB', '2.0', 'Added rapid testing methods', '/resources/micro-testing.pdf', 3456789, @Member6, DATEADD(DAY, -65, @EndDate), 1),

    -- Additional version tracking for popular resources (showing ongoing maintenance)
    ('338F298E-707E-40AC-806F-0AA851B08167', '1407E135-1FA1-439F-A6BB-DEDBB74C00A7', '1.0', 'Original manual', '/resources/swiss-manual-v1.pdf', 4567890, @Member3, DATEADD(DAY, -150, @EndDate), 1),
    ('47C8EF17-CB43-4765-BAEE-2592B60B1A64', '27F98A70-A8DF-4C52-8426-5D60D94DAC21', '1.0', 'Initial release', '/resources/parmesan-24-v1.pdf', 3789012, @Member8, DATEADD(DAY, -75, @EndDate), 1),
    ('DF0E3E7F-99DF-4550-93DA-1F80F471D883', '7D13C842-EE91-44A2-9B86-095C2F04AA08', '1.0', 'Original guide', '/resources/greek-yogurt-v1.pdf', 2789456, @Member16, DATEADD(DAY, -140, @EndDate), 0),
    ('5397E939-BAC2-43BA-B0C8-6BC07F1585AF', '7D13C842-EE91-44A2-9B86-095C2F04AA08', '1.1', 'Updated equipment recommendations', '/resources/greek-yogurt.pdf', 2789456, @Member16, DATEADD(DAY, -84, @EndDate), 1),
    ('CBA03A42-6BCD-4327-89C5-F7C7E194A379', 'BFB45369-CFFC-4638-8296-8E0392791AEA', '1.0', 'Initial FSMA guide', '/resources/fsma-preventive-v1.pdf', 4123456, @Member8, DATEADD(DAY, -170, @EndDate), 0),
    ('564B2C13-7ADD-4646-BD83-62B6AA538B34', 'BFB45369-CFFC-4638-8296-8E0392791AEA', '2.0', '2024 regulatory updates', '/resources/fsma-preventive.pdf', 4123456, @Member8, DATEADD(DAY, -38, @EndDate), 1),
    ('1113BA64-8F9A-4B12-A38C-4C3FEAD800C7', '13867E15-4ED7-4689-8EC3-D99FD03A766F', '1.0', 'Basic monitoring program', '/resources/listeria-monitoring-v1.pdf', 3456789, @Member9, DATEADD(DAY, -155, @EndDate), 0),
    ('7A7BBBBC-A843-45EA-903F-0BA4DC6AB4E6', '13867E15-4ED7-4689-8EC3-D99FD03A766F', '1.5', 'Added sampling plan', '/resources/listeria-monitoring.pdf', 3456789, @Member9, DATEADD(DAY, -71, @EndDate), 1),
    ('70D63C95-28E1-453E-BD9E-E1543C63B953', '25927717-DEE0-4958-8459-F734CD593FF1', '1.0', 'Basic recall procedures', '/resources/recall-procedures-v1.pdf', 2123456, @Member14, DATEADD(DAY, -80, @EndDate), 0),
    ('BFF5358A-05D8-4718-B5E6-C4CF7AA806E0', '25927717-DEE0-4958-8459-F734CD593FF1', '1.1', 'Added communication templates', '/resources/recall-procedures.pdf', 2123456, @Member14, DATEADD(DAY, -42, @EndDate), 1),
    ('CF935D1E-7097-436F-9BDD-1C9734840B21', '267A36E2-DF9E-47DE-93AE-A7442A683501', '1.0', 'Initial checklist', '/resources/eu-export-checklist-v1.pdf', 1234567, @Member1, DATEADD(DAY, -160, @EndDate), 0),
    ('3C011439-42BD-451A-A8A3-DF14AFD19CCD', '267A36E2-DF9E-47DE-93AE-A7442A683501', '2.0', 'Updated for Brexit changes', '/resources/eu-export-checklist.pdf', 1234567, @Member1, DATEADD(DAY, -56, @EndDate), 1),
    ('AA7D2793-F377-4827-B952-C69DDA3E8669', '93F74D3A-BDD1-4151-A4C0-B5C7BFBD78F7', '1.0', 'Original guide', '/resources/starter-culture-v1.pdf', 2890123, @Member13, DATEADD(DAY, -145, @EndDate), 0),
    ('9DBE0AC1-7C32-45AE-A89F-20B23306B5C8', '93F74D3A-BDD1-4151-A4C0-B5C7BFBD78F7', '2.0', 'Major revision with new cultures', '/resources/starter-culture.pdf', 2890123, @Member13, DATEADD(DAY, -67, @EndDate), 1),
    ('59BE120D-25CE-411F-B0B5-E738DBB1BBCE', '1BE1C901-18CD-4876-A141-EEBB5A4ECA8B', '1.0', 'Initial cave management guide', '/resources/cave-management-v1.pdf', 3123456, @Member15, DATEADD(DAY, -115, @EndDate), 1),
    ('F573B00E-C0DB-4BE6-94A4-78EEF3B4A7A4', 'E59905F7-026B-4EEE-A08E-2858E5D17936', '1.0', 'Training manual v1', '/resources/sensory-evaluation-v1.pdf', 4123456, @Member7, DATEADD(DAY, -175, @EndDate), 0),
    ('E71538FF-E2AB-4812-969A-9AC04C912E1D', 'E59905F7-026B-4EEE-A08E-2858E5D17936', '1.5', 'Added grading forms', '/resources/sensory-evaluation.pdf', 4123456, @Member7, DATEADD(DAY, -89, @EndDate), 1),
    ('C92007CA-8A99-4C7C-BB67-E7C41A44CAA8', '3F02308B-48A1-4251-B469-01C49759C409', '2023', '2023 USDA standards', '/resources/grading-standards-2023.pdf', 2890123, @Member10, DATEADD(DAY, -130, @EndDate), 0),
    ('6C4DFC5D-6999-4A85-AC38-30B2078C64FA', '3F02308B-48A1-4251-B469-01C49759C409', '2024', 'Updated standards', '/resources/grading-standards.pdf', 2890123, @Member10, DATEADD(DAY, -48, @EndDate), 1),
    ('33AE31C0-0981-4F27-BD2B-ACD27F779193', 'B06F3371-8446-43C5-B088-EBE27B9BA185', '1.0', 'Initial calculator', '/resources/startup-costs-v1.xlsx', 567890, @Member2, DATEADD(DAY, -140, @EndDate), 0),
    ('6B791AF1-B577-4A6A-94BE-D6B99201B7D6', 'B06F3371-8446-43C5-B088-EBE27B9BA185', '1.2', 'Updated equipment costs', '/resources/startup-costs.xlsx', 567890, @Member2, DATEADD(DAY, -73, @EndDate), 1),
    ('9740EFCC-2D16-42A6-873C-4EDDEEB6951F', '9D8A70EA-0957-4091-9534-EC942500EE3D', '1.0', 'Basic inventory template', '/resources/inventory-template-v1.xlsx', 678901, @Member4, DATEADD(DAY, -110, @EndDate), 0),
    ('F28447A6-4A20-49C4-83C5-38AC3AFE4BD2', '9D8A70EA-0957-4091-9534-EC942500EE3D', '2.0', 'Added automated alerts', '/resources/inventory-template.xlsx', 678901, @Member4, DATEADD(DAY, -51, @EndDate), 1),
    ('1FA53FE0-7C4E-4255-99FF-738AA4E43F65', 'DB52C9A4-6161-4C93-BF1B-094E44F00AF0', '1.0', 'Initial worksheets', '/resources/cost-analysis-v1.xlsx', 456789, @Member5, DATEADD(DAY, -95, @EndDate), 0),
    ('08EBB5E6-8C1F-4FC0-A286-CF24E8C31BAA', 'DB52C9A4-6161-4C93-BF1B-094E44F00AF0', '1.5', 'Added margin calculator', '/resources/cost-analysis.xlsx', 456789, @Member5, DATEADD(DAY, -44, @EndDate), 1),
    ('86E9B6C0-6E10-421F-9A5C-FBF1FDCFA3F0', 'ABFCC118-3B18-482D-B9D2-3D1D482093EC', '2024-Q1', 'Q1 content calendar', '/resources/social-calendar-q1.xlsx', 456789, @Member11, DATEADD(DAY, -135, @EndDate), 0),
    ('9EFE9FAD-14E0-445C-BC86-7EFFA6507F99', 'ABFCC118-3B18-482D-B9D2-3D1D482093EC', '2024-Full', 'Complete 2024 calendar', '/resources/social-calendar.xlsx', 456789, @Member11, DATEADD(DAY, -62, @EndDate), 1),
    ('1FBD1DED-2D0E-46A0-A7E3-995C04529D52', '8E49F554-9193-4F67-9EF4-FA5B72B4F1BE', '1.0', 'Wine pairings only', '/resources/pairing-infographics-v1.pdf', 5678901, @Member15, DATEADD(DAY, -75, @EndDate), 0),
    ('2A4D3534-4F75-4948-8ED6-8913D7EF0933', '8E49F554-9193-4F67-9EF4-FA5B72B4F1BE', '2.0', 'Added beer and cider pairings', '/resources/pairing-infographics.pdf', 5678901, @Member15, DATEADD(DAY, -34, @EndDate), 1),
    ('254D0324-B337-4A71-9C92-063046989115', '2E25C5CE-77C1-488E-801E-4B6A71E8288A', '1.0', 'Basic ricotta guide', '/resources/ricotta-whey-v1.pdf', 1789012, @Member13, DATEADD(DAY, -20, @EndDate), 1),
    ('38DD8943-699B-423F-9AA3-F0754FEED2B9', '91D2FD7E-7EF3-4319-B52B-F4DB0C151298', '1.0', 'Workshop recording', '/resources/yogurt-flavors-v1.mp4', 45678901, @Member1, DATEADD(DAY, -65, @EndDate), 1),
    ('51A5FE3C-E965-47F0-8DA4-FBF1DDD41179', 'EDE85BC9-6A01-450A-B9F3-7411D6B89AB3', '1.0', 'Initial plant-based guide', '/resources/plant-yogurt-v1.pdf', 2456789, @Member5, DATEADD(DAY, -5, @EndDate), 1),
    ('51CE7FA1-07C2-43D2-9100-09F9F889505C', '80A26234-E25C-40F5-BE59-4552EF103ABD', '1.0', 'Halal certification guide', '/resources/halal-certification-v1.pdf', 1890234, @Member5, DATEADD(DAY, -100, @EndDate), 1),
    ('8E6710C6-198E-4E9C-A7F6-BE264409CDF1', '44DDD774-F313-4E50-815B-80F32F26C3EB', '2023', '2023 regulations', '/resources/japan-import-2023.pdf', 2456789, @Member8, DATEADD(DAY, -55, @EndDate), 0),
    ('5AF0272C-837E-4DE5-A98E-0AB8F890D197', '44DDD774-F313-4E50-815B-80F32F26C3EB', '2024', '2024 updates', '/resources/japan-import.pdf', 2456789, @Member8, DATEADD(DAY, -19, @EndDate), 1);

-- ============================================================================
-- Resource Downloads (200 download records)
-- ============================================================================

-- Generate 200 downloads across popular resources using random members and dates
-- Most popular: HACCP Template, PMO Guide, Yield Calculator, Defect Guide, Business Plan

INSERT INTO [AssociationDemo].[ResourceDownload] ([ResourceID], [MemberID], [DownloadDate], [IPAddress], [UserAgent])
SELECT TOP 200
    ResourceID,
    MemberID,
    DownloadDate,
    '192.168.' + CAST(ABS(CHECKSUM(NEWID())) % 255 AS VARCHAR) + '.' + CAST(ABS(CHECKSUM(NEWID())) % 255 AS VARCHAR) AS IPAddress,
    CASE ABS(CHECKSUM(NEWID())) % 3
        WHEN 0 THEN 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        WHEN 1 THEN 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        ELSE 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
    END AS UserAgent
FROM (
    -- HACCP Template (most popular - 50 downloads)
    SELECT TOP 50 '91AC5AFE-4D2F-4FBE-92B6-5F733DA82391' AS ResourceID, ID AS MemberID,
           DATEADD(DAY, -ABS(CHECKSUM(NEWID())) % 185, @EndDate) AS DownloadDate
    FROM [AssociationDemo].[Member]
    UNION ALL
    -- PMO Guide (40 downloads)
    SELECT TOP 40 'D900D334-D76F-497A-9538-9FC5992755A6', ID,
           DATEADD(DAY, -ABS(CHECKSUM(NEWID())) % 200, @EndDate)
    FROM [AssociationDemo].[Member]
    UNION ALL
    -- Yield Calculator (35 downloads)
    SELECT TOP 35 '2149DAE1-1CEC-4F7B-80E0-45FE81CA2F33', ID,
           DATEADD(DAY, -ABS(CHECKSUM(NEWID())) % 175, @EndDate)
    FROM [AssociationDemo].[Member]
    UNION ALL
    -- Defect Troubleshooting Guide (30 downloads)
    SELECT TOP 30 '3E42E37B-0641-4314-958D-DBC5F9988AC3', ID,
           DATEADD(DAY, -ABS(CHECKSUM(NEWID())) % 70, @EndDate)
    FROM [AssociationDemo].[Member]
    UNION ALL
    -- Business Plan Template (25 downloads)
    SELECT TOP 25 'B7C9576D-CA4F-4FC1-95C7-6048B072360D', ID,
           DATEADD(DAY, -ABS(CHECKSUM(NEWID())) % 155, @EndDate)
    FROM [AssociationDemo].[Member]
    UNION ALL
    -- Various other resources (20 downloads)
    SELECT TOP 20 '2E25C5CE-77C1-488E-801E-4B6A71E8288A', ID,
           DATEADD(DAY, -ABS(CHECKSUM(NEWID())) % 20, @EndDate)
    FROM [AssociationDemo].[Member]
) AS Downloads;

-- ============================================================================
-- Resource Ratings (75 ratings with reviews)
-- ============================================================================

INSERT INTO [AssociationDemo].[ResourceRating] ([ResourceID], [MemberID], [Rating], [Review], [CreatedDate], [IsHelpful])
VALUES
    -- HACCP Template ratings (highly rated)
    ('91AC5AFE-4D2F-4FBE-92B6-5F733DA82391', @Member1, 5, 'Excellent template! Saved me weeks of work setting up our HACCP program. Very thorough and FDA-compliant.', DATEADD(DAY, -178, @EndDate), 1),
    ('91AC5AFE-4D2F-4FBE-92B6-5F733DA82391', @Member3, 5, 'Our consultant approved this template immediately. Well worth downloading.', DATEADD(DAY, -165, @EndDate), 1),
    ('91AC5AFE-4D2F-4FBE-92B6-5F733DA82391', @Member7, 5, 'Clear, comprehensive, and easy to customize for our operation.', DATEADD(DAY, -142, @EndDate), 1),
    ('91AC5AFE-4D2F-4FBE-92B6-5F733DA82391', @Member12, 4, 'Very good template. Had to modify slightly for our artisan operation but great starting point.', DATEADD(DAY, -98, @EndDate), 1),
    ('91AC5AFE-4D2F-4FBE-92B6-5F733DA82391', @Member18, 5, 'Passed our FDA inspection with flying colors using this HACCP plan!', DATEADD(DAY, -67, @EndDate), 1),

    -- PMO Guide ratings
    ('D900D334-D76F-497A-9538-9FC5992755A6', @Member2, 5, 'Essential reference for anyone making Grade A dairy products. Always up to date.', DATEADD(DAY, -195, @EndDate), 1),
    ('D900D334-D76F-497A-9538-9FC5992755A6', @Member8, 5, 'Better than the actual PMO document - this guide explains everything clearly.', DATEADD(DAY, -171, @EndDate), 1),
    ('D900D334-D76F-497A-9538-9FC5992755A6', @Member14, 4, 'Comprehensive guide. Would love to see more examples but still excellent.', DATEADD(DAY, -134, @EndDate), 1),

    -- Yield Calculator ratings
    ('2149DAE1-1CEC-4F7B-80E0-45FE81CA2F33', @Member4, 5, 'Increased our cheese yield by 2% in the first month! The calculator identified inefficiencies we had missed.', DATEADD(DAY, -168, @EndDate), 1),
    ('2149DAE1-1CEC-4F7B-80E0-45FE81CA2F33', @Member9, 4, 'Great tool for tracking and optimizing yields. Takes some time to input all data but worth it.', DATEADD(DAY, -145, @EndDate), 1),
    ('2149DAE1-1CEC-4F7B-80E0-45FE81CA2F33', @Member16, 5, 'This calculator paid for our membership in one month. Fantastic resource.', DATEADD(DAY, -89, @EndDate), 1),
    ('2149DAE1-1CEC-4F7B-80E0-45FE81CA2F33', @Member20, 5, 'Easy to use and incredibly valuable for cost control.', DATEADD(DAY, -56, @EndDate), 1),

    -- Defect Troubleshooting Guide ratings
    ('3E42E37B-0641-4314-958D-DBC5F9988AC3', @Member5, 5, 'Solved our bitterness problem! The photos helped us identify the exact cause.', DATEADD(DAY, -63, @EndDate), 1),
    ('3E42E37B-0641-4314-958D-DBC5F9988AC3', @Member11, 5, 'Best defect guide I have ever seen. Clear photos and actionable solutions.', DATEADD(DAY, -51, @EndDate), 1),
    ('3E42E37B-0641-4314-958D-DBC5F9988AC3', @Member17, 5, 'Every cheese maker needs this guide. Comprehensive and practical.', DATEADD(DAY, -38, @EndDate), 1),
    ('3E42E37B-0641-4314-958D-DBC5F9988AC3', @Member19, 4, 'Excellent resource. Covers all common defects and many unusual ones.', DATEADD(DAY, -22, @EndDate), 1),

    -- Cheddar Recipe ratings
    ('3D930326-657F-453F-8633-0AB26F09C078', @Member6, 5, 'Authentic traditional method. Our cheddar has never been better!', DATEADD(DAY, -173, @EndDate), 1),
    ('3D930326-657F-453F-8633-0AB26F09C078', @Member10, 4, 'Great recipe, though it takes practice to master the cheddaring process.', DATEADD(DAY, -156, @EndDate), 1),
    ('3D930326-657F-453F-8633-0AB26F09C078', @Member15, 5, 'Customers love our cheddar made with this recipe. Worth the effort!', DATEADD(DAY, -121, @EndDate), 1),

    -- Business Plan Template ratings
    ('B7C9576D-CA4F-4FC1-95C7-6048B072360D', @Member13, 5, 'Got funding from our bank using this business plan template. Very professional.', DATEADD(DAY, -147, @EndDate), 1),
    ('B7C9576D-CA4F-4FC1-95C7-6048B072360D', @Member2, 4, 'Comprehensive template that covers everything needed for a cheese business plan.', DATEADD(DAY, -129, @EndDate), 1),
    ('B7C9576D-CA4F-4FC1-95C7-6048B072360D', @Member8, 5, 'Saved us thousands in consulting fees. Excellent template.', DATEADD(DAY, -94, @EndDate), 1),

    -- Greek Yogurt Production ratings
    ('7D13C842-EE91-44A2-9B86-095C2F04AA08', @Member1, 5, 'Perfect texture every time now. The straining guidance was key.', DATEADD(DAY, -132, @EndDate), 1),
    ('7D13C842-EE91-44A2-9B86-095C2F04AA08', @Member7, 4, 'Good production guide. Equipment recommendations were especially helpful.', DATEADD(DAY, -108, @EndDate), 1),
    ('7D13C842-EE91-44A2-9B86-095C2F04AA08', @Member14, 5, 'Our Greek yogurt sales doubled after following this guide!', DATEADD(DAY, -76, @EndDate), 1),

    -- FSMA Preventive Controls ratings
    ('BFB45369-CFFC-4638-8296-8E0392791AEA', @Member3, 5, 'Made FSMA compliance much less intimidating. Clear and practical.', DATEADD(DAY, -163, @EndDate), 1),
    ('BFB45369-CFFC-4638-8296-8E0392791AEA', @Member9, 4, 'Comprehensive guide to preventive controls. Very useful.', DATEADD(DAY, -137, @EndDate), 1),

    -- Listeria Monitoring ratings
    ('13867E15-4ED7-4689-8EC3-D99FD03A766F', @Member4, 5, 'Implementing this program gave us confidence in our food safety.', DATEADD(DAY, -148, @EndDate), 1),
    ('13867E15-4ED7-4689-8EC3-D99FD03A766F', @Member11, 5, 'Best practices clearly explained. Our inspectors were impressed.', DATEADD(DAY, -119, @EndDate), 1),
    ('13867E15-4ED7-4689-8EC3-D99FD03A766F', @Member16, 4, 'Solid environmental monitoring program. Easy to implement.', DATEADD(DAY, -87, @EndDate), 1),

    -- Starter Culture Management ratings
    ('93F74D3A-BDD1-4151-A4C0-B5C7BFBD78F7', @Member5, 5, 'Solved all our culture activity issues! Great troubleshooting section.', DATEADD(DAY, -138, @EndDate), 1),
    ('93F74D3A-BDD1-4151-A4C0-B5C7BFBD78F7', @Member12, 5, 'Our culture performance is now consistent thanks to this guide.', DATEADD(DAY, -103, @EndDate), 1),
    ('93F74D3A-BDD1-4151-A4C0-B5C7BFBD78F7', @Member19, 4, 'Very helpful for culture maintenance. Good technical detail.', DATEADD(DAY, -69, @EndDate), 1),

    -- Micro Testing Protocols ratings
    ('C87784F1-C4CF-4523-9019-1040B70E45DB', @Member6, 5, 'Standard methods clearly explained. Perfect for training lab techs.', DATEADD(DAY, -183, @EndDate), 1),
    ('C87784F1-C4CF-4523-9019-1040B70E45DB', @Member13, 4, 'Comprehensive testing protocols. Updated with latest methods.', DATEADD(DAY, -157, @EndDate), 1),

    -- Sensory Evaluation Manual ratings
    ('E59905F7-026B-4EEE-A08E-2858E5D17936', @Member7, 5, 'Trained our entire team using this manual. Excellent resource.', DATEADD(DAY, -168, @EndDate), 1),
    ('E59905F7-026B-4EEE-A08E-2858E5D17936', @Member15, 5, 'Our cheese quality improved dramatically after implementing this program.', DATEADD(DAY, -124, @EndDate), 1),

    -- EU Export Checklist ratings
    ('267A36E2-DF9E-47DE-93AE-A7442A683501', @Member8, 5, 'Successfully exported to Germany using this checklist. Very thorough!', DATEADD(DAY, -153, @EndDate), 1),
    ('267A36E2-DF9E-47DE-93AE-A7442A683501', @Member14, 4, 'Helpful checklist though EU requirements keep changing.', DATEADD(DAY, -117, @EndDate), 1),

    -- Recall Procedures ratings
    ('25927717-DEE0-4958-8459-F734CD593FF1', @Member9, 5, 'Hope we never need this but glad we have procedures in place now.', DATEADD(DAY, -73, @EndDate), 1),
    ('25927717-DEE0-4958-8459-F734CD593FF1', @Member18, 5, 'Mock recall went smoothly thanks to these templates.', DATEADD(DAY, -49, @EndDate), 1),

    -- Ricotta from Whey ratings
    ('2E25C5CE-77C1-488E-801E-4B6A71E8288A', @Member10, 5, 'Turning waste into profit! Excellent sustainability guide.', DATEADD(DAY, -15, @EndDate), 1),
    ('2E25C5CE-77C1-488E-801E-4B6A71E8288A', @Member1, 5, 'Great ricotta recipe and good for the environment. Win-win!', DATEADD(DAY, -8, @EndDate), 1),

    -- Mozzarella Quick Guide ratings
    ('13F8939A-AF69-4FFF-B597-2E9FC87E235D', @Member2, 5, 'Fast and foolproof method. Perfect for demos and classes.', DATEADD(DAY, -128, @EndDate), 1),
    ('13F8939A-AF69-4FFF-B597-2E9FC87E235D', @Member11, 4, 'Good quick method though traditional mozzarella has better flavor.', DATEADD(DAY, -97, @EndDate), 1),
    ('13F8939A-AF69-4FFF-B597-2E9FC87E235D', @Member17, 5, 'Making fresh mozz for farmers market every week with this recipe!', DATEADD(DAY, -61, @EndDate), 1),

    -- Blue Cheese Cultivation ratings
    ('A74ABAD3-1629-4245-BE28-C343D7148918', @Member3, 5, 'Finally got consistent blue veining! This guide is gold.', DATEADD(DAY, -113, @EndDate), 1),
    ('A74ABAD3-1629-4245-BE28-C343D7148918', @Member16, 4, 'Advanced techniques but well explained. Takes practice.', DATEADD(DAY, -84, @EndDate), 1),

    -- Brie Guide ratings
    ('02FF29AC-90DF-44E0-A9E3-62AC68B6E2E9', @Member4, 5, 'Our brie bloomy rind is perfect now. Excellent guide!', DATEADD(DAY, -158, @EndDate), 1),
    ('02FF29AC-90DF-44E0-A9E3-62AC68B6E2E9', @Member12, 4, 'Good soft-ripened cheese guide. Helpful troubleshooting section.', DATEADD(DAY, -126, @EndDate), 1),

    -- Cost Analysis Worksheets ratings
    ('DB52C9A4-6161-4C93-BF1B-094E44F00AF0', @Member5, 5, 'Realized we were underpricing! This tool helped us set proper margins.', DATEADD(DAY, -88, @EndDate), 1),
    ('DB52C9A4-6161-4C93-BF1B-094E44F00AF0', @Member19, 5, 'Essential for pricing strategy. Very comprehensive.', DATEADD(DAY, -53, @EndDate), 1),

    -- Social Media Calendar ratings
    ('ABFCC118-3B18-482D-B9D2-3D1D482093EC', @Member6, 4, 'Great content ideas. Helped us stay consistent on Instagram.', DATEADD(DAY, -127, @EndDate), 1),
    ('ABFCC118-3B18-482D-B9D2-3D1D482093EC', @Member13, 5, 'Our social media engagement doubled! Love the seasonal themes.', DATEADD(DAY, -92, @EndDate), 1),

    -- Cheese Pairing Infographics ratings
    ('8E49F554-9193-4F67-9EF4-FA5B72B4F1BE', @Member7, 5, 'Customers love these pairing suggestions. Beautiful infographics!', DATEADD(DAY, -68, @EndDate), 1),
    ('8E49F554-9193-4F67-9EF4-FA5B72B4F1BE', @Member15, 5, 'Perfect for our tasting room. Professional and informative.', DATEADD(DAY, -41, @EndDate), 1),

    -- Cheese Board Tutorial Videos ratings
    ('E623497B-0A84-4DBE-9F78-4922094260E7', @Member8, 5, 'Amazing video series! Our cheese boards look restaurant-quality now.', DATEADD(DAY, -54, @EndDate), 1),
    ('E623497B-0A84-4DBE-9F78-4922094260E7', @Member20, 5, 'Get so many compliments on our presentation. These videos are fantastic.', DATEADD(DAY, -29, @EndDate), 1),

    -- Cave Management ratings
    ('1BE1C901-18CD-4876-A141-EEBB5A4ECA8B', @Member9, 5, 'Our aging cave is running perfectly now. Great guidance on humidity control.', DATEADD(DAY, -108, @EndDate), 1),
    ('1BE1C901-18CD-4876-A141-EEBB5A4ECA8B', @Member14, 4, 'Helpful cave management guide. Solved our airflow issues.', DATEADD(DAY, -79, @EndDate), 1),

    -- Grading Standards ratings
    ('3F02308B-48A1-4251-B469-01C49759C409', @Member10, 5, 'Improved our cheese quality significantly by understanding grading criteria.', DATEADD(DAY, -123, @EndDate), 1),
    ('3F02308B-48A1-4251-B469-01C49759C409', @Member18, 4, 'Clear explanation of USDA standards. Very useful.', DATEADD(DAY, -96, @EndDate), 1),

    -- Plant-Based Yogurt ratings
    ('EDE85BC9-6A01-450A-B9F3-7411D6B89AB3', @Member11, 4, 'Expanding into plant-based market. Good formulation guide.', DATEADD(DAY, -3, @EndDate), 1),
    ('EDE85BC9-6A01-450A-B9F3-7411D6B89AB3', @Member1, 5, 'Coconut yogurt turned out great! Following this recipe exactly.', DATEADD(DAY, -2, @EndDate), 1),

    -- Competition Entry Guide ratings
    ('57D27954-8ECC-4E83-8819-9B9128C0BDAB', @Member16, 5, 'Won Best of Show at state fair using this guide! Preparation tips were invaluable.', DATEADD(DAY, -4, @EndDate), 1),
    ('57D27954-8ECC-4E83-8819-9B9128C0BDAB', @Member2, 5, 'Understanding judging criteria helped us improve our cheese quality dramatically.', DATEADD(DAY, -2, @EndDate), 1),

    -- Halal Certification ratings
    ('80A26234-E25C-40F5-BE59-4552EF103ABD', @Member17, 5, 'Opened new export markets for us. Clear certification process.', DATEADD(DAY, -93, @EndDate), 1),
    ('80A26234-E25C-40F5-BE59-4552EF103ABD', @Member3, 4, 'Helpful guide for halal certification. Good agency contacts.', DATEADD(DAY, -71, @EndDate), 1),

    -- Inventory Management ratings
    ('9D8A70EA-0957-4091-9534-EC942500EE3D', @Member12, 5, 'Reduced waste by 15% with this inventory system. Excellent tool!', DATEADD(DAY, -104, @EndDate), 1),
    ('9D8A70EA-0957-4091-9534-EC942500EE3D', @Member20, 4, 'Good inventory template. Automated alerts are very helpful.', DATEADD(DAY, -78, @EndDate), 1),

    -- Some lower ratings for variety
    ('BBA5BD0E-4E11-4B87-BF6A-1988972B3452', @Member4, 3, 'Processed cheese guide is OK but could use more formulation examples.', DATEADD(DAY, -24, @EndDate), 1),
    ('1046C8D2-4BA5-4D2C-B130-A2B5AF6F9B58', @Member5, 4, 'Annatto guide is good but basic. Would like more technical depth.', DATEADD(DAY, -35, @EndDate), 1);

-- ============================================================================
-- Resource Tags (150+ tags for searchability)
-- ============================================================================

INSERT INTO [AssociationDemo].[ResourceTag] ([ResourceID], [TagName], [CreatedDate])
VALUES
    -- Cheddar Recipe tags
    ('3D930326-657F-453F-8633-0AB26F09C078', 'cheddar', DATEADD(DAY, -180, @EndDate)),
    ('3D930326-657F-453F-8633-0AB26F09C078', 'traditional', DATEADD(DAY, -180, @EndDate)),
    ('3D930326-657F-453F-8633-0AB26F09C078', 'hard-cheese', DATEADD(DAY, -180, @EndDate)),
    ('3D930326-657F-453F-8633-0AB26F09C078', 'cheddaring', DATEADD(DAY, -180, @EndDate)),
    ('3D930326-657F-453F-8633-0AB26F09C078', 'aged-cheese', DATEADD(DAY, -180, @EndDate)),

    -- Brie tags
    ('02FF29AC-90DF-44E0-A9E3-62AC68B6E2E9', 'brie', DATEADD(DAY, -165, @EndDate)),
    ('02FF29AC-90DF-44E0-A9E3-62AC68B6E2E9', 'soft-ripened', DATEADD(DAY, -165, @EndDate)),
    ('02FF29AC-90DF-44E0-A9E3-62AC68B6E2E9', 'bloomy-rind', DATEADD(DAY, -165, @EndDate)),
    ('02FF29AC-90DF-44E0-A9E3-62AC68B6E2E9', 'penicillium', DATEADD(DAY, -165, @EndDate)),

    -- Mozzarella tags
    ('13F8939A-AF69-4FFF-B597-2E9FC87E235D', 'mozzarella', DATEADD(DAY, -135, @EndDate)),
    ('13F8939A-AF69-4FFF-B597-2E9FC87E235D', 'fresh-cheese', DATEADD(DAY, -135, @EndDate)),
    ('13F8939A-AF69-4FFF-B597-2E9FC87E235D', 'pasta-filata', DATEADD(DAY, -135, @EndDate)),
    ('13F8939A-AF69-4FFF-B597-2E9FC87E235D', 'quick-recipe', DATEADD(DAY, -135, @EndDate)),

    -- Blue Cheese tags
    ('A74ABAD3-1629-4245-BE28-C343D7148918', 'blue-cheese', DATEADD(DAY, -120, @EndDate)),
    ('A74ABAD3-1629-4245-BE28-C343D7148918', 'roqueforti', DATEADD(DAY, -120, @EndDate)),
    ('A74ABAD3-1629-4245-BE28-C343D7148918', 'mold-ripened', DATEADD(DAY, -120, @EndDate)),
    ('A74ABAD3-1629-4245-BE28-C343D7148918', 'advanced', DATEADD(DAY, -120, @EndDate)),

    -- PMO Guide tags
    ('D900D334-D76F-497A-9538-9FC5992755A6', 'pmo', DATEADD(DAY, -200, @EndDate)),
    ('D900D334-D76F-497A-9538-9FC5992755A6', 'fda', DATEADD(DAY, -200, @EndDate)),
    ('D900D334-D76F-497A-9538-9FC5992755A6', 'grade-a', DATEADD(DAY, -200, @EndDate)),
    ('D900D334-D76F-497A-9538-9FC5992755A6', 'regulations', DATEADD(DAY, -200, @EndDate)),
    ('D900D334-D76F-497A-9538-9FC5992755A6', 'compliance', DATEADD(DAY, -200, @EndDate)),

    -- HACCP Template tags
    ('91AC5AFE-4D2F-4FBE-92B6-5F733DA82391', 'haccp', DATEADD(DAY, -185, @EndDate)),
    ('91AC5AFE-4D2F-4FBE-92B6-5F733DA82391', 'food-safety', DATEADD(DAY, -185, @EndDate)),
    ('91AC5AFE-4D2F-4FBE-92B6-5F733DA82391', 'template', DATEADD(DAY, -185, @EndDate)),
    ('91AC5AFE-4D2F-4FBE-92B6-5F733DA82391', 'fda-compliance', DATEADD(DAY, -185, @EndDate)),
    ('91AC5AFE-4D2F-4FBE-92B6-5F733DA82391', 'preventive-controls', DATEADD(DAY, -185, @EndDate)),

    -- FSMA tags
    ('BFB45369-CFFC-4638-8296-8E0392791AEA', 'fsma', DATEADD(DAY, -170, @EndDate)),
    ('BFB45369-CFFC-4638-8296-8E0392791AEA', 'preventive-controls', DATEADD(DAY, -170, @EndDate)),
    ('BFB45369-CFFC-4638-8296-8E0392791AEA', 'food-safety', DATEADD(DAY, -170, @EndDate)),
    ('BFB45369-CFFC-4638-8296-8E0392791AEA', 'regulations', DATEADD(DAY, -170, @EndDate)),

    -- Listeria tags
    ('13867E15-4ED7-4689-8EC3-D99FD03A766F', 'listeria', DATEADD(DAY, -155, @EndDate)),
    ('13867E15-4ED7-4689-8EC3-D99FD03A766F', 'environmental-monitoring', DATEADD(DAY, -155, @EndDate)),
    ('13867E15-4ED7-4689-8EC3-D99FD03A766F', 'food-safety', DATEADD(DAY, -155, @EndDate)),
    ('13867E15-4ED7-4689-8EC3-D99FD03A766F', 'pathogen', DATEADD(DAY, -155, @EndDate)),

    -- Greek Yogurt tags
    ('7D13C842-EE91-44A2-9B86-095C2F04AA08', 'greek-yogurt', DATEADD(DAY, -140, @EndDate)),
    ('7D13C842-EE91-44A2-9B86-095C2F04AA08', 'yogurt', DATEADD(DAY, -140, @EndDate)),
    ('7D13C842-EE91-44A2-9B86-095C2F04AA08', 'cultured-dairy', DATEADD(DAY, -140, @EndDate)),
    ('7D13C842-EE91-44A2-9B86-095C2F04AA08', 'straining', DATEADD(DAY, -140, @EndDate)),

    -- Yield Calculator tags
    ('2149DAE1-1CEC-4F7B-80E0-45FE81CA2F33', 'yield', DATEADD(DAY, -175, @EndDate)),
    ('2149DAE1-1CEC-4F7B-80E0-45FE81CA2F33', 'calculator', DATEADD(DAY, -175, @EndDate)),
    ('2149DAE1-1CEC-4F7B-80E0-45FE81CA2F33', 'optimization', DATEADD(DAY, -175, @EndDate)),
    ('2149DAE1-1CEC-4F7B-80E0-45FE81CA2F33', 'cost-control', DATEADD(DAY, -175, @EndDate)),
    ('2149DAE1-1CEC-4F7B-80E0-45FE81CA2F33', 'efficiency', DATEADD(DAY, -175, @EndDate)),

    -- Starter Culture tags
    ('93F74D3A-BDD1-4151-A4C0-B5C7BFBD78F7', 'starter-culture', DATEADD(DAY, -145, @EndDate)),
    ('93F74D3A-BDD1-4151-A4C0-B5C7BFBD78F7', 'cultures', DATEADD(DAY, -145, @EndDate)),
    ('93F74D3A-BDD1-4151-A4C0-B5C7BFBD78F7', 'mother-culture', DATEADD(DAY, -145, @EndDate)),
    ('93F74D3A-BDD1-4151-A4C0-B5C7BFBD78F7', 'troubleshooting', DATEADD(DAY, -145, @EndDate)),

    -- Micro Testing tags
    ('C87784F1-C4CF-4523-9019-1040B70E45DB', 'microbiology', DATEADD(DAY, -190, @EndDate)),
    ('C87784F1-C4CF-4523-9019-1040B70E45DB', 'testing', DATEADD(DAY, -190, @EndDate)),
    ('C87784F1-C4CF-4523-9019-1040B70E45DB', 'laboratory', DATEADD(DAY, -190, @EndDate)),
    ('C87784F1-C4CF-4523-9019-1040B70E45DB', 'quality-control', DATEADD(DAY, -190, @EndDate)),

    -- Sensory Evaluation tags
    ('E59905F7-026B-4EEE-A08E-2858E5D17936', 'sensory', DATEADD(DAY, -175, @EndDate)),
    ('E59905F7-026B-4EEE-A08E-2858E5D17936', 'grading', DATEADD(DAY, -175, @EndDate)),
    ('E59905F7-026B-4EEE-A08E-2858E5D17936', 'evaluation', DATEADD(DAY, -175, @EndDate)),
    ('E59905F7-026B-4EEE-A08E-2858E5D17936', 'quality', DATEADD(DAY, -175, @EndDate)),
    ('E59905F7-026B-4EEE-A08E-2858E5D17936', 'training', DATEADD(DAY, -175, @EndDate)),

    -- Defect Guide tags
    ('3E42E37B-0641-4314-958D-DBC5F9988AC3', 'defects', DATEADD(DAY, -70, @EndDate)),
    ('3E42E37B-0641-4314-958D-DBC5F9988AC3', 'troubleshooting', DATEADD(DAY, -70, @EndDate)),
    ('3E42E37B-0641-4314-958D-DBC5F9988AC3', 'quality-issues', DATEADD(DAY, -70, @EndDate)),
    ('3E42E37B-0641-4314-958D-DBC5F9988AC3', 'problem-solving', DATEADD(DAY, -70, @EndDate)),

    -- Business Plan tags
    ('B7C9576D-CA4F-4FC1-95C7-6048B072360D', 'business-plan', DATEADD(DAY, -155, @EndDate)),
    ('B7C9576D-CA4F-4FC1-95C7-6048B072360D', 'template', DATEADD(DAY, -155, @EndDate)),
    ('B7C9576D-CA4F-4FC1-95C7-6048B072360D', 'startup', DATEADD(DAY, -155, @EndDate)),
    ('B7C9576D-CA4F-4FC1-95C7-6048B072360D', 'financing', DATEADD(DAY, -155, @EndDate)),

    -- EU Export tags
    ('267A36E2-DF9E-47DE-93AE-A7442A683501', 'export', DATEADD(DAY, -160, @EndDate)),
    ('267A36E2-DF9E-47DE-93AE-A7442A683501', 'eu', DATEADD(DAY, -160, @EndDate)),
    ('267A36E2-DF9E-47DE-93AE-A7442A683501', 'international', DATEADD(DAY, -160, @EndDate)),
    ('267A36E2-DF9E-47DE-93AE-A7442A683501', 'compliance', DATEADD(DAY, -160, @EndDate)),

    -- Ricotta tags
    ('2E25C5CE-77C1-488E-801E-4B6A71E8288A', 'ricotta', DATEADD(DAY, -20, @EndDate)),
    ('2E25C5CE-77C1-488E-801E-4B6A71E8288A', 'whey', DATEADD(DAY, -20, @EndDate)),
    ('2E25C5CE-77C1-488E-801E-4B6A71E8288A', 'sustainability', DATEADD(DAY, -20, @EndDate)),
    ('2E25C5CE-77C1-488E-801E-4B6A71E8288A', 'zero-waste', DATEADD(DAY, -20, @EndDate)),

    -- Social Media Calendar tags
    ('ABFCC118-3B18-482D-B9D2-3D1D482093EC', 'social-media', DATEADD(DAY, -135, @EndDate)),
    ('ABFCC118-3B18-482D-B9D2-3D1D482093EC', 'marketing', DATEADD(DAY, -135, @EndDate)),
    ('ABFCC118-3B18-482D-B9D2-3D1D482093EC', 'content-calendar', DATEADD(DAY, -135, @EndDate)),
    ('ABFCC118-3B18-482D-B9D2-3D1D482093EC', 'instagram', DATEADD(DAY, -135, @EndDate)),

    -- Pairing Infographics tags
    ('8E49F554-9193-4F67-9EF4-FA5B72B4F1BE', 'wine-pairing', DATEADD(DAY, -75, @EndDate)),
    ('8E49F554-9193-4F67-9EF4-FA5B72B4F1BE', 'beer-pairing', DATEADD(DAY, -75, @EndDate)),
    ('8E49F554-9193-4F67-9EF4-FA5B72B4F1BE', 'infographic', DATEADD(DAY, -75, @EndDate)),
    ('8E49F554-9193-4F67-9EF4-FA5B72B4F1BE', 'education', DATEADD(DAY, -75, @EndDate)),

    -- Additional tags for other resources
    ('1407E135-1FA1-439F-A6BB-DEDBB74C00A7', 'swiss', DATEADD(DAY, -150, @EndDate)),
    ('1407E135-1FA1-439F-A6BB-DEDBB74C00A7', 'eyes', DATEADD(DAY, -150, @EndDate)),
    ('1407E135-1FA1-439F-A6BB-DEDBB74C00A7', 'propionic', DATEADD(DAY, -150, @EndDate)),
    ('D141DB84-C80E-4BEB-BFA2-908A3084E2F4', 'gouda', DATEADD(DAY, -105, @EndDate)),
    ('D141DB84-C80E-4BEB-BFA2-908A3084E2F4', 'aging', DATEADD(DAY, -105, @EndDate)),
    ('44BF10A5-3724-4048-9F2E-67C5BA081985', 'feta', DATEADD(DAY, -90, @EndDate)),
    ('44BF10A5-3724-4048-9F2E-67C5BA081985', 'brine', DATEADD(DAY, -90, @EndDate)),
    ('44BF10A5-3724-4048-9F2E-67C5BA081985', 'greek', DATEADD(DAY, -90, @EndDate)),
    ('27F98A70-A8DF-4C52-8426-5D60D94DAC21', 'parmesan', DATEADD(DAY, -75, @EndDate)),
    ('27F98A70-A8DF-4C52-8426-5D60D94DAC21', 'hard-cheese', DATEADD(DAY, -75, @EndDate)),
    ('27F98A70-A8DF-4C52-8426-5D60D94DAC21', 'long-aged', DATEADD(DAY, -75, @EndDate)),
    ('24A2D48B-95C5-40C4-A1A5-BEA76AE54474', 'cream-cheese', DATEADD(DAY, -60, @EndDate)),
    ('24A2D48B-95C5-40C4-A1A5-BEA76AE54474', 'spreads', DATEADD(DAY, -60, @EndDate)),
    ('60B5DDD4-7B0D-4A2D-A4D7-8F0CC51109FD', 'washed-rind', DATEADD(DAY, -45, @EndDate)),
    ('60B5DDD4-7B0D-4A2D-A4D7-8F0CC51109FD', 'smear-ripened', DATEADD(DAY, -45, @EndDate)),
    ('47641855-0BE8-4626-896F-DCA12AAB5A31', 'kefir', DATEADD(DAY, -125, @EndDate)),
    ('47641855-0BE8-4626-896F-DCA12AAB5A31', 'grains', DATEADD(DAY, -125, @EndDate)),
    ('47641855-0BE8-4626-896F-DCA12AAB5A31', 'probiotics', DATEADD(DAY, -125, @EndDate)),
    ('084E8A8B-89B0-42A8-ACA7-06A81B1A463D', 'skyr', DATEADD(DAY, -110, @EndDate)),
    ('084E8A8B-89B0-42A8-ACA7-06A81B1A463D', 'icelandic', DATEADD(DAY, -110, @EndDate)),
    ('58E0A4A0-5AA7-4B81-941C-69ABB7508FE8', 'probiotics', DATEADD(DAY, -95, @EndDate)),
    ('58E0A4A0-5AA7-4B81-941C-69ABB7508FE8', 'cultures', DATEADD(DAY, -95, @EndDate)),
    ('58E0A4A0-5AA7-4B81-941C-69ABB7508FE8', 'health', DATEADD(DAY, -95, @EndDate)),
    ('EDE85BC9-6A01-450A-B9F3-7411D6B89AB3', 'plant-based', DATEADD(DAY, -5, @EndDate)),
    ('EDE85BC9-6A01-450A-B9F3-7411D6B89AB3', 'vegan', DATEADD(DAY, -5, @EndDate)),
    ('EDE85BC9-6A01-450A-B9F3-7411D6B89AB3', 'alternative', DATEADD(DAY, -5, @EndDate)),
    ('E461CE45-7945-432F-A00C-F210ABB44F7C', 'raw-milk', DATEADD(DAY, -140, @EndDate)),
    ('E461CE45-7945-432F-A00C-F210ABB44F7C', '60-day-rule', DATEADD(DAY, -140, @EndDate)),
    ('E461CE45-7945-432F-A00C-F210ABB44F7C', 'regulations', DATEADD(DAY, -140, @EndDate)),
    ('25927717-DEE0-4958-8459-F734CD593FF1', 'recall', DATEADD(DAY, -80, @EndDate)),
    ('25927717-DEE0-4958-8459-F734CD593FF1', 'emergency', DATEADD(DAY, -80, @EndDate)),
    ('25927717-DEE0-4958-8459-F734CD593FF1', 'traceability', DATEADD(DAY, -80, @EndDate)),
    ('80A26234-E25C-40F5-BE59-4552EF103ABD', 'halal', DATEADD(DAY, -100, @EndDate)),
    ('80A26234-E25C-40F5-BE59-4552EF103ABD', 'certification', DATEADD(DAY, -100, @EndDate)),
    ('80A26234-E25C-40F5-BE59-4552EF103ABD', 'export', DATEADD(DAY, -100, @EndDate)),
    ('D132960A-CF31-416E-A861-88F37514061D', 'kosher', DATEADD(DAY, -85, @EndDate)),
    ('D132960A-CF31-416E-A861-88F37514061D', 'certification', DATEADD(DAY, -85, @EndDate)),
    ('1BE1C901-18CD-4876-A141-EEBB5A4ECA8B', 'cave', DATEADD(DAY, -115, @EndDate)),
    ('1BE1C901-18CD-4876-A141-EEBB5A4ECA8B', 'aging', DATEADD(DAY, -115, @EndDate)),
    ('1BE1C901-18CD-4876-A141-EEBB5A4ECA8B', 'humidity', DATEADD(DAY, -115, @EndDate)),
    ('1BE1C901-18CD-4876-A141-EEBB5A4ECA8B', 'temperature', DATEADD(DAY, -115, @EndDate)),
    ('3F02308B-48A1-4251-B469-01C49759C409', 'usda', DATEADD(DAY, -130, @EndDate)),
    ('3F02308B-48A1-4251-B469-01C49759C409', 'grading', DATEADD(DAY, -130, @EndDate)),
    ('3F02308B-48A1-4251-B469-01C49759C409', 'standards', DATEADD(DAY, -130, @EndDate)),
    ('57D27954-8ECC-4E83-8819-9B9128C0BDAB', 'competition', DATEADD(DAY, -6, @EndDate)),
    ('57D27954-8ECC-4E83-8819-9B9128C0BDAB', 'judging', DATEADD(DAY, -6, @EndDate)),
    ('57D27954-8ECC-4E83-8819-9B9128C0BDAB', 'awards', DATEADD(DAY, -6, @EndDate)),
    ('B06F3371-8446-43C5-B088-EBE27B9BA185', 'startup-costs', DATEADD(DAY, -140, @EndDate)),
    ('B06F3371-8446-43C5-B088-EBE27B9BA185', 'financing', DATEADD(DAY, -140, @EndDate)),
    ('B06F3371-8446-43C5-B088-EBE27B9BA185', 'budget', DATEADD(DAY, -140, @EndDate)),
    ('9D8A70EA-0957-4091-9534-EC942500EE3D', 'inventory', DATEADD(DAY, -110, @EndDate)),
    ('9D8A70EA-0957-4091-9534-EC942500EE3D', 'management', DATEADD(DAY, -110, @EndDate)),
    ('9D8A70EA-0957-4091-9534-EC942500EE3D', 'tracking', DATEADD(DAY, -110, @EndDate)),
    ('DB52C9A4-6161-4C93-BF1B-094E44F00AF0', 'costing', DATEADD(DAY, -95, @EndDate)),
    ('DB52C9A4-6161-4C93-BF1B-094E44F00AF0', 'pricing', DATEADD(DAY, -95, @EndDate)),
    ('DB52C9A4-6161-4C93-BF1B-094E44F00AF0', 'margins', DATEADD(DAY, -95, @EndDate)),
    ('E623497B-0A84-4DBE-9F78-4922094260E7', 'cheese-board', DATEADD(DAY, -60, @EndDate)),
    ('E623497B-0A84-4DBE-9F78-4922094260E7', 'presentation', DATEADD(DAY, -60, @EndDate)),
    ('E623497B-0A84-4DBE-9F78-4922094260E7', 'video', DATEADD(DAY, -60, @EndDate));

PRINT '  Resource Library Data Populated Successfully';
PRINT '  - Resource Categories: 15';
PRINT '  - Resources: 100';
PRINT '  - Resource Versions: 51';
PRINT '  - Resource Downloads: 200';
PRINT '  - Resource Ratings: 75';
PRINT '  - Resource Tags: 150+';
