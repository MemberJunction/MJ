/******************************************************************************
 * Association Sample Database - Product Showcase & Awards Data
 * File: 10_product_showcase_data.sql
 *
 * This file populates the product showcase and competition management tables
 * with realistic sample data for cheese industry products and awards.
 *
 * Data includes:
 * - 15 Product Categories (hierarchical cheese classifications)
 * - 100+ Cheese Products from members
 * - 5 Major Competitions (annual cheese contests)
 * - 200+ Competition Entries
 * - 50+ Competition Judges
 * - 150+ Product Awards
 *
 * All UUIDs are real (generated via uuidgen)
 * All dates are parameterized using @EndDate
 ******************************************************************************/

-- Redeclare @EndDate for this batch
DECLARE @EndDate DATE = GETDATE();

-- ============================================================================
-- PRODUCT CATEGORIES
-- ============================================================================

PRINT 'Populating Product Categories...';

-- Top-level categories
INSERT INTO [AssociationDemo].[ProductCategory]
    ([ID], [Name], [Description], [ParentCategoryID], [DisplayOrder], [IsActive])
VALUES
    ('0C2C7636-9FDF-44AC-93C0-E733EE2DCC69', 'Fresh Cheese',
     'Soft, young cheeses with high moisture content, typically unaged', NULL, 1, 1),
    ('B37F979E-C72D-47FB-A453-AA3AE19553E7', 'Soft-Ripened Cheese',
     'Cheeses with edible white or bloomy rinds, aged from outside in', NULL, 2, 1),
    ('F117C0AC-D38E-4CDD-8D92-6AF778DC0992', 'Semi-Soft Cheese',
     'Cheeses with moderate moisture, often washed rind or smear-ripened', NULL, 3, 1),
    ('B83FD6BD-3AAC-4BE7-BFC9-961892C8D5CC', 'Semi-Hard Cheese',
     'Firm, sliceable cheeses with moderate aging', NULL, 4, 1),
    ('DBBFB8AA-1062-4DA0-9451-694BB3ED09D5', 'Hard Cheese',
     'Aged, firm cheeses with low moisture content', NULL, 5, 1),
    ('CFE904C4-0FCC-433D-84C5-BA387A383190', 'Blue Cheese',
     'Cheeses with blue or green mold veining throughout', NULL, 6, 1),
    ('F41FBEAD-3D56-4D74-99D3-CD5FE997E1E2', 'Washed Rind Cheese',
     'Cheeses with rinds washed in brine, beer, wine, or spirits', NULL, 7, 1);

-- Sub-categories
INSERT INTO [AssociationDemo].[ProductCategory]
    ([ID], [Name], [Description], [ParentCategoryID], [DisplayOrder], [IsActive])
VALUES
    ('C7E8F019-CFCA-4614-B460-DF7147FD90AD', 'Chevre',
     'Fresh goat milk cheese', '0C2C7636-9FDF-44AC-93C0-E733EE2DCC69', 1, 1),
    ('95BA6E22-B3BC-44DF-849A-6B4037FB9810', 'Mozzarella',
     'Fresh Italian stretched-curd cheese', '0C2C7636-9FDF-44AC-93C0-E733EE2DCC69', 2, 1),
    ('70E99869-2AA6-4B6B-A43B-34AC3EFB9490', 'Brie-Style',
     'Soft-ripened cheese with white bloomy rind', 'B37F979E-C72D-47FB-A453-AA3AE19553E7', 1, 1),
    ('132F07D7-EE86-4CB9-A961-41E6C4D0A164', 'Camembert-Style',
     'Small soft-ripened rounds with white rind', 'B37F979E-C72D-47FB-A453-AA3AE19553E7', 2, 1),
    ('A63CEA9C-BC01-460A-96A2-013CE470E7B5', 'Cheddar',
     'English-style firm cheese, aged', 'B83FD6BD-3AAC-4BE7-BFC9-961892C8D5CC', 1, 1),
    ('50D64C4A-2CDF-4F1D-8647-1A19C26C3E9C', 'Alpine-Style',
     'Swiss and Alpine cheeses like Gruyere', 'DBBFB8AA-1062-4DA0-9451-694BB3ED09D5', 1, 1),
    ('8CA86067-DF1E-4995-94C2-E27EF489A662', 'Parmesan-Style',
     'Hard Italian grana cheeses', 'DBBFB8AA-1062-4DA0-9451-694BB3ED09D5', 2, 1),
    ('8D89C4E2-2512-4ED8-A5E4-7C4D0CC3533A', 'Gorgonzola-Style',
     'Italian blue cheese', 'CFE904C4-0FCC-433D-84C5-BA387A383190', 1, 1);
GO

-- ============================================================================
-- COMPETITIONS
-- ============================================================================

-- Redeclare @EndDate for this batch
DECLARE @EndDate DATE = GETDATE();

PRINT 'Populating Competitions...';

INSERT INTO [AssociationDemo].[Competition]
    ([ID], [Name], [Year], [Description], [StartDate], [EndDate], [JudgingDate], [AwardsDate],
     [Location], [EntryDeadline], [EntryFee], [Status], [TotalCategories], [IsAnnual], [IsInternational])
VALUES
    ('2C40EDD4-ECD3-47CB-A6ED-BF728C78DF56',
     'American Cheese Society Competition', YEAR(@EndDate),
     'The largest and most prestigious cheese, butter, and cultured product competition in North America.',
     DATEADD(MONTH, 7, DATEFROMPARTS(YEAR(@EndDate), 1, 1)),
     DATEADD(MONTH, 7, DATEFROMPARTS(YEAR(@EndDate), 1, 4)),
     DATEADD(MONTH, 7, DATEFROMPARTS(YEAR(@EndDate), 1, 2)),
     DATEADD(MONTH, 7, DATEFROMPARTS(YEAR(@EndDate), 1, 4)),
     'Portland, OR', DATEADD(MONTH, 6, DATEFROMPARTS(YEAR(@EndDate), 1, 15)),
     295.00, 'Completed', 120, 1, 1),

    ('C4E5D7B5-BFF1-4B56-9315-A7B384DEA6BE',
     'World Championship Cheese Contest', YEAR(@EndDate) - 1,
     'Biennial cheese competition showcasing the finest cheeses from around the world.',
     DATEFROMPARTS(YEAR(@EndDate) - 1, 3, 5),
     DATEFROMPARTS(YEAR(@EndDate) - 1, 3, 7),
     DATEFROMPARTS(YEAR(@EndDate) - 1, 3, 6),
     DATEFROMPARTS(YEAR(@EndDate) - 1, 3, 7),
     'Madison, WI', DATEFROMPARTS(YEAR(@EndDate) - 1, 1, 15),
     175.00, 'Completed', 141, 0, 1),

    ('04422AD6-BB6B-4DFF-9939-46FEFC6785BA',
     'International Cheese & Dairy Awards', YEAR(@EndDate),
     'One of the world''s most respected cheese competitions held annually in the UK.',
     DATEADD(MONTH, 9, DATEFROMPARTS(YEAR(@EndDate), 1, 10)),
     DATEADD(MONTH, 9, DATEFROMPARTS(YEAR(@EndDate), 1, 11)),
     DATEADD(MONTH, 9, DATEFROMPARTS(YEAR(@EndDate), 1, 11)),
     DATEADD(MONTH, 9, DATEFROMPARTS(YEAR(@EndDate), 1, 11)),
     'Nantwich, UK', DATEADD(MONTH, 8, DATEFROMPARTS(YEAR(@EndDate), 1, 1)),
     225.00, 'Completed', 89, 1, 1),

    ('979C1F67-0E27-4519-B8F9-CC2E778114B9',
     'Good Food Awards', YEAR(@EndDate),
     'Celebrating American craft food including artisan cheese across multiple categories.',
     DATEADD(MONTH, 1, DATEFROMPARTS(YEAR(@EndDate), 1, 15)),
     DATEADD(MONTH, 1, DATEFROMPARTS(YEAR(@EndDate), 1, 17)),
     DATEADD(MONTH, 1, DATEFROMPARTS(YEAR(@EndDate), 1, 16)),
     DATEADD(MONTH, 1, DATEFROMPARTS(YEAR(@EndDate), 1, 17)),
     'San Francisco, CA', DATEFROMPARTS(YEAR(@EndDate) - 1, 10, 31),
     95.00, 'Completed', 25, 1, 0),

    ('A9D90718-AE90-4984-AF3E-9BAE4850B6B9',
     'U.S. Championship Cheese Contest', YEAR(@EndDate),
     'The nation''s longest-running technical cheese, butter, and yogurt competition.',
     DATEADD(MONTH, 3, DATEFROMPARTS(YEAR(@EndDate), 1, 18)),
     DATEADD(MONTH, 3, DATEFROMPARTS(YEAR(@EndDate), 1, 19)),
     DATEADD(MONTH, 3, DATEFROMPARTS(YEAR(@EndDate), 1, 19)),
     DATEADD(MONTH, 3, DATEFROMPARTS(YEAR(@EndDate), 1, 19)),
     'Green Bay, WI', DATEADD(MONTH, 2, DATEFROMPARTS(YEAR(@EndDate), 1, 28)),
     125.00, 'Completed', 94, 1, 0);
GO

-- ============================================================================
-- PRODUCTS
-- ============================================================================

PRINT 'Populating Products...';

-- Redeclare @EndDate after GO
DECLARE @EndDate DATE = GETDATE();

-- Fresh Cheeses (20 products)
INSERT INTO [AssociationDemo].[Product]
    ([ID], [MemberID], [CategoryID], [Name], [Description], [CheeseType], [MilkSource],
     [AgeMonths], [Weight], [RetailPrice], [IsOrganic], [IsRawMilk], [DateIntroduced], [Status],
     [TastingNotes], [PairingNotes])
SELECT TOP 20
    NEWID(),
    m.ID,
    CASE (ABS(CHECKSUM(NEWID())) % 2)
        WHEN 0 THEN 'C7E8F019-CFCA-4614-B460-DF7147FD90AD' -- Chevre
        ELSE '95BA6E22-B3BC-44DF-849A-6B4037FB9810' -- Mozzarella
    END,
    CASE (ABS(CHECKSUM(NEWID())) % 15)
        WHEN 0 THEN 'Plain Chevre'
        WHEN 1 THEN 'Herb Chevre Log'
        WHEN 2 THEN 'Honey Lavender Chevre'
        WHEN 3 THEN 'Fresh Mozzarella'
        WHEN 4 THEN 'Burrata'
        WHEN 5 THEN 'Smoked Mozzarella'
        WHEN 6 THEN 'Ash-Ripened Chevre'
        WHEN 7 THEN 'Cranberry Walnut Chevre'
        WHEN 8 THEN 'Buffalo Mozzarella'
        WHEN 9 THEN 'Lemon Pepper Chevre'
        WHEN 10 THEN 'Ciliegine Mozzarella'
        WHEN 11 THEN 'Truffle Chevre'
        WHEN 12 THEN 'Garlic & Herb Chevre'
        WHEN 13 THEN 'Bocconcini'
        ELSE 'Fig & Thyme Chevre'
    END,
    'Fresh, creamy cheese with delicate flavor and smooth texture',
    'Fresh',
    CASE (ABS(CHECKSUM(NEWID())) % 3) WHEN 0 THEN 'Goat' WHEN 1 THEN 'Cow' ELSE 'Buffalo' END,
    0,
    4.0 + (ABS(CHECKSUM(NEWID())) % 8),
    8.99 + (ABS(CHECKSUM(NEWID())) % 12),
    CASE WHEN (ABS(CHECKSUM(NEWID())) % 100) < 30 THEN 1 ELSE 0 END,
    0,
    DATEADD(MONTH, -(ABS(CHECKSUM(NEWID())) % 24), @EndDate),
    'Active',
    CASE (ABS(CHECKSUM(NEWID())) % 5)
        WHEN 0 THEN 'Bright, tangy, with clean fresh milk flavors'
        WHEN 1 THEN 'Creamy, mild, with subtle sweetness'
        WHEN 2 THEN 'Delicate, smooth, with grassy notes'
        WHEN 3 THEN 'Fresh, milky, with pleasant acidity'
        ELSE 'Soft, spreadable, with balanced richness'
    END,
    'Fresh fruits, crusty bread, white wines, salads'
FROM [AssociationDemo].[Member] m
WHERE EXISTS (SELECT 1 FROM [AssociationDemo].[Organization] o WHERE o.ID = m.OrganizationID)
ORDER BY NEWID();

-- Soft-Ripened Cheeses (25 products)
INSERT INTO [AssociationDemo].[Product]
    ([ID], [MemberID], [CategoryID], [Name], [Description], [CheeseType], [MilkSource],
     [AgeMonths], [Weight], [RetailPrice], [IsOrganic], [IsRawMilk], [DateIntroduced], [Status],
     [TastingNotes], [PairingNotes])
SELECT TOP 25
    NEWID(),
    m.ID,
    CASE (ABS(CHECKSUM(NEWID())) % 2)
        WHEN 0 THEN '70E99869-2AA6-4B6B-A43B-34AC3EFB9490' -- Brie-Style
        ELSE '132F07D7-EE86-4CB9-A961-41E6C4D0A164' -- Camembert-Style
    END,
    CASE (ABS(CHECKSUM(NEWID())) % 12)
        WHEN 0 THEN 'Bloomy Brie'
        WHEN 1 THEN 'Triple Cream Brie'
        WHEN 2 THEN 'Truffle Brie'
        WHEN 3 THEN 'Camembert Tradition'
        WHEN 4 THEN 'Ash Camembert'
        WHEN 5 THEN 'Brie de Meaux Style'
        WHEN 6 THEN 'Mini Camembert'
        WHEN 7 THEN 'Herb Crusted Brie'
        WHEN 8 THEN 'Double Cream Camembert'
        WHEN 9 THEN 'Wild Mushroom Brie'
        WHEN 10 THEN 'Calvados Camembert'
        ELSE 'Farmstead Brie'
    END,
    'Soft-ripened cheese with edible white bloomy rind, creamy interior',
    'Soft-Ripened',
    CASE (ABS(CHECKSUM(NEWID())) % 4) WHEN 0 THEN 'Cow' WHEN 1 THEN 'Goat' WHEN 2 THEN 'Sheep' ELSE 'Cow' END,
    1 + (ABS(CHECKSUM(NEWID())) % 3),
    6.0 + (ABS(CHECKSUM(NEWID())) % 10),
    14.99 + (ABS(CHECKSUM(NEWID())) % 20),
    CASE WHEN (ABS(CHECKSUM(NEWID())) % 100) < 25 THEN 1 ELSE 0 END,
    CASE WHEN (ABS(CHECKSUM(NEWID())) % 100) < 15 THEN 1 ELSE 0 END,
    DATEADD(MONTH, -(ABS(CHECKSUM(NEWID())) % 36), @EndDate),
    'Active',
    'Buttery, mushroomy, with earthy undertones and creamy texture that becomes more pronounced with age',
    'Champagne, Chardonnay, fresh baguette, apples, walnuts'
FROM [AssociationDemo].[Member] m
WHERE EXISTS (SELECT 1 FROM [AssociationDemo].[Organization] o WHERE o.ID = m.OrganizationID)
ORDER BY NEWID();

-- Cheddar (30 products)
INSERT INTO [AssociationDemo].[Product]
    ([ID], [MemberID], [CategoryID], [Name], [Description], [CheeseType], [MilkSource],
     [AgeMonths], [Weight], [RetailPrice], [IsOrganic], [IsRawMilk], [DateIntroduced], [Status],
     [TastingNotes], [PairingNotes], [IsAwardWinner])
SELECT TOP 30
    NEWID(),
    m.ID,
    'A63CEA9C-BC01-460A-96A2-013CE470E7B5', -- Cheddar
    CASE (ABS(CHECKSUM(NEWID())) % 18)
        WHEN 0 THEN 'Extra Sharp Cheddar'
        WHEN 1 THEN 'Smoked Cheddar'
        WHEN 2 THEN 'White Cheddar Reserve'
        WHEN 3 THEN 'Aged Clothbound Cheddar'
        WHEN 4 THEN 'Vintage Cheddar'
        WHEN 5 THEN 'Farmhouse Cheddar'
        WHEN 6 THEN 'Cave-Aged Cheddar'
        WHEN 7 THEN 'Alpine Cheddar'
        WHEN 8 THEN 'Horseradish Cheddar'
        WHEN 9 THEN 'Black Pepper Cheddar'
        WHEN 10 THEN 'Habanero Cheddar'
        WHEN 11 THEN 'Garlic Cheddar'
        WHEN 12 THEN 'Cranberry Cheddar'
        WHEN 13 THEN 'Reserve Cheddar'
        WHEN 14 THEN 'Raw Milk Cheddar'
        WHEN 15 THEN 'Caramelized Onion Cheddar'
        WHEN 16 THEN 'Maple Smoked Cheddar'
        ELSE 'Heritage Cheddar'
    END,
    'Traditional English-style cheddar, aged to develop complex flavors',
    'Cheddar',
    'Cow',
    6 + (ABS(CHECKSUM(NEWID())) % 30),
    8.0 + (ABS(CHECKSUM(NEWID())) % 24),
    12.99 + (ABS(CHECKSUM(NEWID())) % 25),
    CASE WHEN (ABS(CHECKSUM(NEWID())) % 100) < 20 THEN 1 ELSE 0 END,
    CASE WHEN (ABS(CHECKSUM(NEWID())) % 100) < 25 THEN 1 ELSE 0 END,
    DATEADD(MONTH, -(ABS(CHECKSUM(NEWID())) % 48), @EndDate),
    CASE WHEN (ABS(CHECKSUM(NEWID())) % 100) < 95 THEN 'Active' ELSE 'Seasonal' END,
    CASE (ABS(CHECKSUM(NEWID())) % 5)
        WHEN 0 THEN 'Sharp, nutty, with crystalline texture and long finish'
        WHEN 1 THEN 'Rich, complex, with caramel notes and crumbly texture'
        WHEN 2 THEN 'Bold, tangy, with savory depth and smooth mouthfeel'
        WHEN 3 THEN 'Robust, buttery, with hints of hazelnut and earthy undertones'
        ELSE 'Intense, complex, with balanced sharpness and creamy notes'
    END,
    'IPA, Cabernet, aged port, apples, crackers, charcuterie',
    CASE WHEN (ABS(CHECKSUM(NEWID())) % 100) < 40 THEN 1 ELSE 0 END
FROM [AssociationDemo].[Member] m
WHERE EXISTS (SELECT 1 FROM [AssociationDemo].[Organization] o WHERE o.ID = m.OrganizationID)
ORDER BY NEWID();

-- Alpine-Style and Hard Cheeses (20 products)
INSERT INTO [AssociationDemo].[Product]
    ([ID], [MemberID], [CategoryID], [Name], [Description], [CheeseType], [MilkSource],
     [AgeMonths], [Weight], [RetailPrice], [IsOrganic], [IsRawMilk], [DateIntroduced], [Status],
     [TastingNotes], [PairingNotes], [IsAwardWinner])
SELECT TOP 20
    NEWID(),
    m.ID,
    CASE (ABS(CHECKSUM(NEWID())) % 2)
        WHEN 0 THEN '50D64C4A-2CDF-4F1D-8647-1A19C26C3E9C' -- Alpine-Style
        ELSE '8CA86067-DF1E-4995-94C2-E27EF489A662' -- Parmesan-Style
    END,
    CASE (ABS(CHECKSUM(NEWID())) % 15)
        WHEN 0 THEN 'Alpine Reserve'
        WHEN 1 THEN 'Mountain Gruyere'
        WHEN 2 THEN 'Farmstead Parmesan'
        WHEN 3 THEN 'Aged Asiago'
        WHEN 4 THEN 'Emmentaler Style'
        WHEN 5 THEN 'Comte Reserve'
        WHEN 6 THEN 'Grana Padano Style'
        WHEN 7 THEN 'Beaufort Style'
        WHEN 8 THEN 'Pecorino Romano Style'
        WHEN 9 THEN 'Alpine Tomme'
        WHEN 10 THEN 'Manchego Style'
        WHEN 11 THEN 'Aged Gruyere'
        WHEN 12 THEN 'Surchoix Alpine'
        WHEN 13 THEN 'Parmesan Reggiano Style'
        ELSE 'Mountain Pass Reserve'
    END,
    'Aged alpine or Italian-style hard cheese with complex nutty flavors',
    'Hard',
    CASE (ABS(CHECKSUM(NEWID())) % 4) WHEN 0 THEN 'Cow' WHEN 1 THEN 'Sheep' WHEN 2 THEN 'Cow' ELSE 'Cow' END,
    12 + (ABS(CHECKSUM(NEWID())) % 36),
    10.0 + (ABS(CHECKSUM(NEWID())) % 30),
    18.99 + (ABS(CHECKSUM(NEWID())) % 35),
    CASE WHEN (ABS(CHECKSUM(NEWID())) % 100) < 15 THEN 1 ELSE 0 END,
    CASE WHEN (ABS(CHECKSUM(NEWID())) % 100) < 30 THEN 1 ELSE 0 END,
    DATEADD(MONTH, -(ABS(CHECKSUM(NEWID())) % 60), @EndDate),
    'Active',
    'Nutty, fruity, with crystalline texture and long complex finish. Notes of browned butter and caramel',
    'Bold reds, aged whiskey, dried fruits, honey, crusty bread',
    CASE WHEN (ABS(CHECKSUM(NEWID())) % 100) < 50 THEN 1 ELSE 0 END
FROM [AssociationDemo].[Member] m
WHERE EXISTS (SELECT 1 FROM [AssociationDemo].[Organization] o WHERE o.ID = m.OrganizationID)
ORDER BY NEWID();

-- Blue Cheeses (15 products)
INSERT INTO [AssociationDemo].[Product]
    ([ID], [MemberID], [CategoryID], [Name], [Description], [CheeseType], [MilkSource],
     [AgeMonths], [Weight], [RetailPrice], [IsOrganic], [IsRawMilk], [DateIntroduced], [Status],
     [TastingNotes], [PairingNotes], [IsAwardWinner])
SELECT TOP 15
    NEWID(),
    m.ID,
    '8D89C4E2-2512-4ED8-A5E4-7C4D0CC3533A', -- Gorgonzola-Style
    CASE (ABS(CHECKSUM(NEWID())) % 12)
        WHEN 0 THEN 'Creamy Blue'
        WHEN 1 THEN 'Stilton Style Blue'
        WHEN 2 THEN 'Roquefort Style'
        WHEN 3 THEN 'Danish Blue'
        WHEN 4 THEN 'Gorgonzola Dolce'
        WHEN 5 THEN 'Mountain Gorgonzola'
        WHEN 6 THEN 'Blue Moon'
        WHEN 7 THEN 'Smokey Blue'
        WHEN 8 THEN 'Cave-Aged Blue'
        WHEN 9 THEN 'Point Reyes Blue'
        WHEN 10 THEN 'Valdeon Style'
        ELSE 'Artisan Blue Reserve'
    END,
    'Blue-veined cheese with distinctive bold flavor and creamy texture',
    'Blue',
    CASE (ABS(CHECKSUM(NEWID())) % 4) WHEN 0 THEN 'Cow' WHEN 1 THEN 'Sheep' WHEN 2 THEN 'Goat' ELSE 'Cow' END,
    3 + (ABS(CHECKSUM(NEWID())) % 8),
    6.0 + (ABS(CHECKSUM(NEWID())) % 10),
    16.99 + (ABS(CHECKSUM(NEWID())) % 22),
    CASE WHEN (ABS(CHECKSUM(NEWID())) % 100) < 18 THEN 1 ELSE 0 END,
    CASE WHEN (ABS(CHECKSUM(NEWID())) % 100) < 20 THEN 1 ELSE 0 END,
    DATEADD(MONTH, -(ABS(CHECKSUM(NEWID())) % 40), @EndDate),
    'Active',
    'Bold, tangy, with rich blue mold flavors. Creamy texture with spicy, piquant finish',
    'Port, sweet wines, pears, honey, walnuts, dark chocolate',
    CASE WHEN (ABS(CHECKSUM(NEWID())) % 100) < 45 THEN 1 ELSE 0 END
FROM [AssociationDemo].[Member] m
WHERE EXISTS (SELECT 1 FROM [AssociationDemo].[Organization] o WHERE o.ID = m.OrganizationID)
ORDER BY NEWID();

GO

PRINT 'Product Showcase data population complete!';
PRINT '';
GO
-- ============================================================================
-- COMPETITION ENTRIES
-- ============================================================================

PRINT 'Populating Competition Entries...';

-- Redeclare @EndDate for this batch
DECLARE @EndDate DATE = GETDATE();

-- Create entries for products in competitions
INSERT INTO [AssociationDemo].[CompetitionEntry]
    ([ID], [CompetitionID], [ProductID], [CategoryID], [EntryNumber], [SubmittedDate],
     [Status], [Score], [Ranking], [AwardLevel], [EntryFee], [PaymentStatus])
SELECT TOP 200
    NEWID(),
    -- Select from one of the 5 competitions
    CASE (ABS(CHECKSUM(NEWID())) % 5)
        WHEN 0 THEN '2C40EDD4-ECD3-47CB-A6ED-BF728C78DF56' -- ACS Competition
        WHEN 1 THEN 'C4E5D7B5-BFF1-4B56-9315-A7B384DEA6BE' -- World Championship
        WHEN 2 THEN '04422AD6-BB6B-4DFF-9939-46FEFC6785BA' -- International Awards
        WHEN 3 THEN '979C1F67-0E27-4519-B8F9-CC2E778114B9' -- Good Food Awards
        ELSE 'A9D90718-AE90-4984-AF3E-9BAE4850B6B9' -- US Championship
    END,
    p.ID,
    p.CategoryID,
    'E-' + CAST(YEAR(@EndDate) AS VARCHAR) + '-' + RIGHT('00000' + CAST(ABS(CHECKSUM(NEWID())) % 100000 AS VARCHAR), 5),
    DATEADD(DAY, -(30 + ABS(CHECKSUM(NEWID())) % 180), @EndDate),
    CASE 
        WHEN (ABS(CHECKSUM(NEWID())) % 100) < 15 THEN 'Winner'
        WHEN (ABS(CHECKSUM(NEWID())) % 100) < 30 THEN 'Finalist'
        ELSE 'Judged'
    END,
    70.0 + (ABS(CHECKSUM(NEWID())) % 30),
    CASE WHEN (ABS(CHECKSUM(NEWID())) % 100) < 30 
         THEN 1 + (ABS(CHECKSUM(NEWID())) % 10)
         ELSE NULL END,
    CASE (ABS(CHECKSUM(NEWID())) % 100)
        WHEN 0 THEN 'Best in Show'
        WHEN 1 THEN 'Best in Show'
        ELSE CASE (ABS(CHECKSUM(NEWID())) % 10)
            WHEN 0 THEN 'Gold'
            WHEN 1 THEN 'Gold'
            WHEN 2 THEN 'Silver'
            WHEN 3 THEN 'Silver'
            WHEN 4 THEN 'Bronze'
            WHEN 5 THEN 'Honorable Mention'
            ELSE 'None'
        END
    END,
    CASE (ABS(CHECKSUM(NEWID())) % 5)
        WHEN 0 THEN 295.00
        WHEN 1 THEN 175.00
        WHEN 2 THEN 225.00
        WHEN 3 THEN 95.00
        ELSE 125.00
    END,
    CASE WHEN (ABS(CHECKSUM(NEWID())) % 100) < 95 THEN 'Paid' ELSE 'Unpaid' END
FROM [AssociationDemo].[Product] p
WHERE p.Status = 'Active'
ORDER BY NEWID();

GO

-- ============================================================================
-- COMPETITION JUDGES
-- ============================================================================

PRINT 'Populating Competition Judges...';

-- Redeclare @EndDate for this batch
DECLARE @EndDate DATE = GETDATE();

-- Add judges from members across different organizations
-- Use ROW_NUMBER to select diverse organizations
INSERT INTO [AssociationDemo].[CompetitionJudge]
    ([ID], [CompetitionID], [MemberID], [FirstName], [LastName], [Email], [Organization],
     [Credentials], [YearsExperience], [Specialty], [Role], [Status], [InvitedDate], [ConfirmedDate])
SELECT TOP 50
    NEWID(),
    CASE (ABS(CHECKSUM(NEWID())) % 5)
        WHEN 0 THEN '2C40EDD4-ECD3-47CB-A6ED-BF728C78DF56'
        WHEN 1 THEN 'C4E5D7B5-BFF1-4B56-9315-A7B384DEA6BE'
        WHEN 2 THEN '04422AD6-BB6B-4DFF-9939-46FEFC6785BA'
        WHEN 3 THEN '979C1F67-0E27-4519-B8F9-CC2E778114B9'
        ELSE 'A9D90718-AE90-4984-AF3E-9BAE4850B6B9'
    END,
    MemberID,
    FirstName,
    LastName,
    Email,
    OrgName,
    CASE (ABS(CHECKSUM(NEWID())) % 8)
        WHEN 0 THEN 'Certified Cheese Professional (CCP), Certified Cheese Grader (CCG)'
        WHEN 1 THEN 'Wisconsin Master Cheesemaker, Certified Cheese Grader'
        WHEN 2 THEN 'Certified Affineur, ACS Certified Judge'
        WHEN 3 THEN 'Certified Cheesemaker, 15+ years production experience'
        WHEN 4 THEN 'Dairy Science Professional, Sensory Evaluation Expert'
        WHEN 5 THEN 'Certified Cheese Grader, International Judge Certification'
        WHEN 6 THEN 'Master Cheesemaker, Technical Judge Certification'
        ELSE 'CCP, Food Safety Manager, Quality Assurance Specialist'
    END,
    5 + (ABS(CHECKSUM(NEWID())) % 25),
    CASE (ABS(CHECKSUM(NEWID())) % 10)
        WHEN 0 THEN 'Alpine and Hard Cheeses'
        WHEN 1 THEN 'Fresh and Soft-Ripened Cheeses'
        WHEN 2 THEN 'Blue and Surface-Ripened Cheeses'
        WHEN 3 THEN 'Cheddar and English-Style Cheeses'
        WHEN 4 THEN 'Artisan and Farmstead Cheeses'
        WHEN 5 THEN 'Aged and Cave-Ripened Cheeses'
        WHEN 6 THEN 'Italian-Style Cheeses'
        WHEN 7 THEN 'French-Style Soft Cheeses'
        WHEN 8 THEN 'Goat and Sheep Milk Cheeses'
        ELSE 'All Categories'
    END,
    CASE (ABS(CHECKSUM(NEWID())) % 10)
        WHEN 0 THEN 'Head Judge'
        WHEN 1 THEN 'Technical Judge'
        ELSE 'Sensory Judge'
    END,
    'Confirmed',
    DATEADD(DAY, -(120 + ABS(CHECKSUM(NEWID())) % 180), @EndDate),
    DATEADD(DAY, -(90 + ABS(CHECKSUM(NEWID())) % 60), @EndDate)
FROM (
    SELECT m.ID as MemberID, m.FirstName, m.LastName, m.Email, o.Name as OrgName,
           ROW_NUMBER() OVER (PARTITION BY o.ID ORDER BY NEWID()) as RowNum
    FROM [AssociationDemo].[Member] m
    INNER JOIN [AssociationDemo].[Organization] o ON m.OrganizationID = o.ID
) subq
WHERE RowNum <= 15  -- Take up to 15 judges per organization to get 50 total across 11 orgs
ORDER BY NEWID();

GO

-- ============================================================================
-- PRODUCT AWARDS
-- ============================================================================

PRINT 'Populating Product Awards...';

-- Redeclare @EndDate for this batch
DECLARE @EndDate DATE = GETDATE();

-- Create awards from winning competition entries
INSERT INTO [AssociationDemo].[ProductAward]
    ([ID], [ProductID], [CompetitionID], [CompetitionEntryID], [AwardName], [AwardLevel],
     [AwardingOrganization], [AwardDate], [Year], [Category], [Score], [IsDisplayed])
SELECT 
    NEWID(),
    ce.ProductID,
    ce.CompetitionID,
    ce.ID,
    c.Name + ' - ' + ce.AwardLevel,
    ce.AwardLevel,
    CASE ce.CompetitionID
        WHEN '2C40EDD4-ECD3-47CB-A6ED-BF728C78DF56' THEN 'American Cheese Society'
        WHEN 'C4E5D7B5-BFF1-4B56-9315-A7B384DEA6BE' THEN 'Wisconsin Cheese Makers Association'
        WHEN '04422AD6-BB6B-4DFF-9939-46FEFC6785BA' THEN 'International Cheese Awards'
        WHEN '979C1F67-0E27-4519-B8F9-CC2E778114B9' THEN 'Good Food Foundation'
        ELSE 'U.S. Championship'
    END,
    c.AwardsDate,
    c.Year,
    pc.Name,
    ce.Score,
    1
FROM [AssociationDemo].[CompetitionEntry] ce
INNER JOIN [AssociationDemo].[Competition] c ON ce.CompetitionID = c.ID
INNER JOIN [AssociationDemo].[ProductCategory] pc ON ce.CategoryID = pc.ID
WHERE ce.AwardLevel IN ('Best in Show', 'Gold', 'Silver', 'Bronze');

-- Update product award counts
UPDATE p
SET p.AwardCount = (
    SELECT COUNT(*) 
    FROM [AssociationDemo].[ProductAward] pa 
    WHERE pa.ProductID = p.ID
),
p.IsAwardWinner = CASE WHEN (
    SELECT COUNT(*) 
    FROM [AssociationDemo].[ProductAward] pa 
    WHERE pa.ProductID = p.ID
) > 0 THEN 1 ELSE 0 END
FROM [AssociationDemo].[Product] p;

GO

PRINT 'Product Showcase & Awards data population complete!';
PRINT '';
GO
