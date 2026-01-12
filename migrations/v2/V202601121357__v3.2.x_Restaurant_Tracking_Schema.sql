-- =============================================
-- Migration: Foodie Application Schema
-- Description: Creates schema and tables for restaurant tracking demo app
-- Version: v3.2.x
-- =============================================

-- Create the Foodie schema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'Foodie')
BEGIN
    EXEC('CREATE SCHEMA Foodie');
END
GO

-- =============================================
-- TABLE: CuisineType
-- =============================================
CREATE TABLE Foodie.CuisineType (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(50) NOT NULL,
    Description NVARCHAR(255) NULL,
    CONSTRAINT PK_CuisineType PRIMARY KEY (ID),
    CONSTRAINT UQ_CuisineType_Name UNIQUE (Name)
);
GO

-- =============================================
-- TABLE: Restaurant
-- =============================================
CREATE TABLE Foodie.Restaurant (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    StreetAddress NVARCHAR(200) NULL,
    City NVARCHAR(100) NULL,
    State NVARCHAR(2) NULL,
    ZipCode NVARCHAR(10) NULL,
    Phone NVARCHAR(20) NULL,
    Website NVARCHAR(255) NULL,
    CuisineTypeID UNIQUEIDENTIFIER NULL,
    PriceRange NVARCHAR(10) NULL CHECK (PriceRange IN ('$', '$$', '$$$', '$$$$')),
    Latitude DECIMAL(10, 7) NULL,
    Longitude DECIMAL(10, 7) NULL,
    HoursOfOperation NVARCHAR(500) NULL,
    CONSTRAINT PK_Restaurant PRIMARY KEY (ID),
    CONSTRAINT FK_Restaurant_CuisineType FOREIGN KEY (CuisineTypeID) REFERENCES Foodie.CuisineType(ID)
);
GO

-- =============================================
-- TABLE: Member
-- =============================================
CREATE TABLE Foodie.Member (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    Email NVARCHAR(255) NOT NULL,
    JoinDate DATETIME NOT NULL DEFAULT GETDATE(),
    DietaryRestrictions NVARCHAR(500) NULL,
    CONSTRAINT PK_Member PRIMARY KEY (ID),
    CONSTRAINT UQ_Member_Email UNIQUE (Email)
);
GO

-- =============================================
-- TABLE: RestaurantVisit
-- =============================================
CREATE TABLE Foodie.RestaurantVisit (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    RestaurantID UNIQUEIDENTIFIER NOT NULL,
    MemberID UNIQUEIDENTIFIER NOT NULL,
    VisitDate DATETIME NOT NULL,
    Rating INT NULL CHECK (Rating BETWEEN 1 AND 5),
    Comments NVARCHAR(MAX) NULL,
    DishesOrdered NVARCHAR(MAX) NULL,
    WouldReturn BIT NULL,
    PhotoURLs NVARCHAR(MAX) NULL,
    CONSTRAINT PK_RestaurantVisit PRIMARY KEY (ID),
    CONSTRAINT FK_RestaurantVisit_Restaurant FOREIGN KEY (RestaurantID) REFERENCES Foodie.Restaurant(ID),
    CONSTRAINT FK_RestaurantVisit_Member FOREIGN KEY (MemberID) REFERENCES Foodie.Member(ID)
);
GO

-- =============================================
-- TABLE: RestaurantTag
-- =============================================
CREATE TABLE Foodie.RestaurantTag (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    RestaurantID UNIQUEIDENTIFIER NOT NULL,
    TagName NVARCHAR(50) NOT NULL,
    CONSTRAINT PK_RestaurantTag PRIMARY KEY (ID),
    CONSTRAINT FK_RestaurantTag_Restaurant FOREIGN KEY (RestaurantID) REFERENCES Foodie.Restaurant(ID),
    CONSTRAINT UQ_RestaurantTag UNIQUE (RestaurantID, TagName)
);
GO

-- =============================================
-- TABLE: WishList
-- =============================================
CREATE TABLE Foodie.WishList (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    RestaurantID UNIQUEIDENTIFIER NOT NULL,
    MemberID UNIQUEIDENTIFIER NOT NULL,
    Priority NVARCHAR(20) NOT NULL CHECK (Priority IN ('Low', 'Medium', 'High')),
    SuggestedBy NVARCHAR(100) NULL,
    Notes NVARCHAR(500) NULL,
    AddedDate DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_WishList PRIMARY KEY (ID),
    CONSTRAINT FK_WishList_Restaurant FOREIGN KEY (RestaurantID) REFERENCES Foodie.Restaurant(ID),
    CONSTRAINT FK_WishList_Member FOREIGN KEY (MemberID) REFERENCES Foodie.Member(ID)
);
GO

-- =============================================
-- TABLE: GroupVisit
-- =============================================
CREATE TABLE Foodie.GroupVisit (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    RestaurantID UNIQUEIDENTIFIER NOT NULL,
    VisitDate DATETIME NOT NULL,
    TotalCost DECIMAL(10, 2) NULL,
    GroupRating INT NULL CHECK (GroupRating BETWEEN 1 AND 5),
    Notes NVARCHAR(MAX) NULL,
    CONSTRAINT PK_GroupVisit PRIMARY KEY (ID),
    CONSTRAINT FK_GroupVisit_Restaurant FOREIGN KEY (RestaurantID) REFERENCES Foodie.Restaurant(ID)
);
GO

-- =============================================
-- TABLE: GroupVisitMember
-- =============================================
CREATE TABLE Foodie.GroupVisitMember (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    GroupVisitID UNIQUEIDENTIFIER NOT NULL,
    MemberID UNIQUEIDENTIFIER NOT NULL,
    AmountPaid DECIMAL(10, 2) NULL,
    CONSTRAINT PK_GroupVisitMember PRIMARY KEY (ID),
    CONSTRAINT FK_GroupVisitMember_GroupVisit FOREIGN KEY (GroupVisitID) REFERENCES Foodie.GroupVisit(ID),
    CONSTRAINT FK_GroupVisitMember_Member FOREIGN KEY (MemberID) REFERENCES Foodie.Member(ID),
    CONSTRAINT UQ_GroupVisitMember UNIQUE (GroupVisitID, MemberID)
);
GO

-- =============================================
-- Extended Properties for CuisineType Table
-- =============================================
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores types of cuisine (Italian, Mexican, Japanese, etc.)',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'CuisineType';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for the cuisine type',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'CuisineType',
    @level2type = N'COLUMN', @level2name = 'ID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the cuisine type',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'CuisineType',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Description of the cuisine type',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'CuisineType',
    @level2type = N'COLUMN', @level2name = 'Description';

-- =============================================
-- Extended Properties for Restaurant Table
-- =============================================
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores information about restaurants',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'Restaurant';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for the restaurant',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'Restaurant',
    @level2type = N'COLUMN', @level2name = 'ID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the restaurant',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'Restaurant',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Street address of the restaurant',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'Restaurant',
    @level2type = N'COLUMN', @level2name = 'StreetAddress';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'City where the restaurant is located',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'Restaurant',
    @level2type = N'COLUMN', @level2name = 'City';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'State where the restaurant is located',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'Restaurant',
    @level2type = N'COLUMN', @level2name = 'State';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Zip code of the restaurant location',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'Restaurant',
    @level2type = N'COLUMN', @level2name = 'ZipCode';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Phone number of the restaurant',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'Restaurant',
    @level2type = N'COLUMN', @level2name = 'Phone';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Website URL of the restaurant',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'Restaurant',
    @level2type = N'COLUMN', @level2name = 'Website';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the CuisineType table',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'Restaurant',
    @level2type = N'COLUMN', @level2name = 'CuisineTypeID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Price range indicator ($ to $$$$)',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'Restaurant',
    @level2type = N'COLUMN', @level2name = 'PriceRange';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Latitude coordinate for mapping',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'Restaurant',
    @level2type = N'COLUMN', @level2name = 'Latitude';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Longitude coordinate for mapping',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'Restaurant',
    @level2type = N'COLUMN', @level2name = 'Longitude';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Hours of operation text (e.g., Mon-Fri 11am-10pm)',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'Restaurant',
    @level2type = N'COLUMN', @level2name = 'HoursOfOperation';

-- =============================================
-- Extended Properties for Member Table
-- =============================================
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores information about members who track restaurants',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'Member';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for the member',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'Member',
    @level2type = N'COLUMN', @level2name = 'ID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the member',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'Member',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Email address of the member',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'Member',
    @level2type = N'COLUMN', @level2name = 'Email';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date when the member joined the tracking system',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'Member',
    @level2type = N'COLUMN', @level2name = 'JoinDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Dietary restrictions or preferences (vegetarian, vegan, gluten-free, etc.)',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'Member',
    @level2type = N'COLUMN', @level2name = 'DietaryRestrictions';

-- =============================================
-- Extended Properties for RestaurantVisit Table
-- =============================================
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores individual member visits to restaurants with ratings and reviews',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'RestaurantVisit';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for the visit record',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'RestaurantVisit',
    @level2type = N'COLUMN', @level2name = 'ID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the Restaurant table',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'RestaurantVisit',
    @level2type = N'COLUMN', @level2name = 'RestaurantID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the Member table',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'RestaurantVisit',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date and time of the restaurant visit',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'RestaurantVisit',
    @level2type = N'COLUMN', @level2name = 'VisitDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Rating from 1 to 5 stars',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'RestaurantVisit',
    @level2type = N'COLUMN', @level2name = 'Rating';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Member comments and review of the visit',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'RestaurantVisit',
    @level2type = N'COLUMN', @level2name = 'Comments';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Description of dishes ordered during the visit',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'RestaurantVisit',
    @level2type = N'COLUMN', @level2name = 'DishesOrdered';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the member would return to this restaurant',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'RestaurantVisit',
    @level2type = N'COLUMN', @level2name = 'WouldReturn';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Comma-separated URLs to photos from the visit',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'RestaurantVisit',
    @level2type = N'COLUMN', @level2name = 'PhotoURLs';

-- =============================================
-- Extended Properties for RestaurantTag Table
-- =============================================
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores tags and categories for restaurants (casual dining, outdoor seating, etc.)',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'RestaurantTag';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for the tag record',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'RestaurantTag',
    @level2type = N'COLUMN', @level2name = 'ID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the Restaurant table',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'RestaurantTag',
    @level2type = N'COLUMN', @level2name = 'RestaurantID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the tag (e.g., Casual Dining, Outdoor Seating, Good for Groups)',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'RestaurantTag',
    @level2type = N'COLUMN', @level2name = 'TagName';

-- =============================================
-- Extended Properties for WishList Table
-- =============================================
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores restaurants that members want to try in the future',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'WishList';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for the wishlist entry',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'WishList',
    @level2type = N'COLUMN', @level2name = 'ID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the Restaurant table',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'WishList',
    @level2type = N'COLUMN', @level2name = 'RestaurantID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the Member table',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'WishList',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Priority level for trying this restaurant (Low, Medium, High)',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'WishList',
    @level2type = N'COLUMN', @level2name = 'Priority';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the person who suggested this restaurant',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'WishList',
    @level2type = N'COLUMN', @level2name = 'SuggestedBy';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Additional notes about why this restaurant is on the wishlist',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'WishList',
    @level2type = N'COLUMN', @level2name = 'Notes';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date when the restaurant was added to the wishlist',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'WishList',
    @level2type = N'COLUMN', @level2name = 'AddedDate';

-- =============================================
-- Extended Properties for GroupVisit Table
-- =============================================
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores information about group visits to restaurants',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'GroupVisit';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for the group visit',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'GroupVisit',
    @level2type = N'COLUMN', @level2name = 'ID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name or description of the group visit event',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'GroupVisit',
    @level2type = N'COLUMN', @level2name = 'Name';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the Restaurant table',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'GroupVisit',
    @level2type = N'COLUMN', @level2name = 'RestaurantID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date and time of the group visit',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'GroupVisit',
    @level2type = N'COLUMN', @level2name = 'VisitDate';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total cost of the group visit',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'GroupVisit',
    @level2type = N'COLUMN', @level2name = 'TotalCost';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Overall group consensus rating from 1 to 5 stars',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'GroupVisit',
    @level2type = N'COLUMN', @level2name = 'GroupRating';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Notes about the group visit',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'GroupVisit',
    @level2type = N'COLUMN', @level2name = 'Notes';

-- =============================================
-- Extended Properties for GroupVisitMember Table
-- =============================================
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Junction table linking members to group visits with payment tracking',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'GroupVisitMember';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique identifier for the group visit member record',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'GroupVisitMember',
    @level2type = N'COLUMN', @level2name = 'ID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the GroupVisit table',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'GroupVisitMember',
    @level2type = N'COLUMN', @level2name = 'GroupVisitID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to the Member table',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'GroupVisitMember',
    @level2type = N'COLUMN', @level2name = 'MemberID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Amount paid by this member for the group visit',
    @level0type = N'SCHEMA', @level0name = 'Foodie',
    @level1type = N'TABLE', @level1name = 'GroupVisitMember',
    @level2type = N'COLUMN', @level2name = 'AmountPaid';
GO

-- =============================================
-- SAMPLE DATA
-- =============================================

-- Declare UUIDs for sample data
DECLARE @CuisineItalian UNIQUEIDENTIFIER = 'A47227D8-5C27-4A6B-8E5B-B3491069B7CB';
DECLARE @CuisineMexican UNIQUEIDENTIFIER = 'ECB6D801-AC83-49E9-9A4A-59ADF7CF6507';
DECLARE @CuisineJapanese UNIQUEIDENTIFIER = '0657A232-6FEF-467E-8735-3933475F7C42';
DECLARE @CuisineAmerican UNIQUEIDENTIFIER = '9DDBB5F0-DEAA-4FF8-8FDD-F7BDBC899431';
DECLARE @CuisineThai UNIQUEIDENTIFIER = '2051D544-FDD1-45DD-9D03-BF135A3C004E';
DECLARE @CuisineIndian UNIQUEIDENTIFIER = 'B1B96CAA-D260-4E2F-A054-A2286A75ECC5';

DECLARE @Restaurant1 UNIQUEIDENTIFIER = 'DA64C482-401A-41D1-A449-3CAAFA1E6ADD';
DECLARE @Restaurant2 UNIQUEIDENTIFIER = '1DFF0948-8587-493A-A9DD-714B90CC1AC5';
DECLARE @Restaurant3 UNIQUEIDENTIFIER = 'E484ACB9-D50D-4035-94C2-5FE8825C8F17';
DECLARE @Restaurant4 UNIQUEIDENTIFIER = '900B3711-FA09-471C-B31E-CF3ABB8BCFD7';
DECLARE @Restaurant5 UNIQUEIDENTIFIER = 'B307F1AD-520A-4D3E-9D92-2028941EFF0C';
DECLARE @Restaurant6 UNIQUEIDENTIFIER = 'A0A68473-8E89-4477-8FBD-45337EB653A9';
DECLARE @Restaurant7 UNIQUEIDENTIFIER = 'FC24AF6B-7DBD-4A3E-80AC-416EBE2F04F4';
DECLARE @Restaurant8 UNIQUEIDENTIFIER = 'C8D40D8B-D369-4FF0-913E-5AE6127A5409';

DECLARE @Member1 UNIQUEIDENTIFIER = '53A59FE6-BB9C-4403-BD40-1D447EDE825F';
DECLARE @Member2 UNIQUEIDENTIFIER = '60A000FD-58F4-4008-BD02-FCF939692219';
DECLARE @Member3 UNIQUEIDENTIFIER = 'EF7FA099-9C6A-47A8-B466-F8326D6D397A';
DECLARE @Member4 UNIQUEIDENTIFIER = '9457B04A-4344-4BB7-A950-7C2E7D9797CD';

DECLARE @Visit1 UNIQUEIDENTIFIER = 'EB1C97D2-7041-4CB0-A7D0-0EDABC0FA544';
DECLARE @Visit2 UNIQUEIDENTIFIER = '6D36085F-7F1A-4264-BD82-EE413940689F';
DECLARE @Visit3 UNIQUEIDENTIFIER = '94AD6D92-168C-4D92-B9E3-D56B10A05180';
DECLARE @Visit4 UNIQUEIDENTIFIER = '7A18B762-BD6C-44BA-9218-551E4CC2E1E6';
DECLARE @Visit5 UNIQUEIDENTIFIER = '6D288546-B7C5-4BA1-B44A-59AA45020386';
DECLARE @Visit6 UNIQUEIDENTIFIER = '7C511FBC-DE37-4B3F-8B67-320C12F4CD6D';

DECLARE @GroupVisit1 UNIQUEIDENTIFIER = 'A547AD87-C4E4-4EEA-B62B-DB13643BA7DC';

-- Insert Cuisine Types
INSERT INTO Foodie.CuisineType (ID, Name, Description)
VALUES
    (@CuisineItalian, 'Italian', 'Traditional Italian cuisine including pasta, pizza, and Mediterranean dishes'),
    (@CuisineMexican, 'Mexican', 'Authentic Mexican food including tacos, burritos, and regional specialties'),
    (@CuisineJapanese, 'Japanese', 'Japanese cuisine including sushi, ramen, and traditional dishes'),
    (@CuisineAmerican, 'American', 'Classic American fare including burgers, steaks, and comfort food'),
    (@CuisineThai, 'Thai', 'Thai cuisine with curries, noodles, and authentic street food'),
    (@CuisineIndian, 'Indian', 'Indian cuisine with curries, tandoori, and regional specialties');

-- Insert Restaurants
INSERT INTO Foodie.Restaurant (ID, Name, StreetAddress, City, State, ZipCode, Phone, Website, CuisineTypeID, PriceRange, Latitude, Longitude, HoursOfOperation)
VALUES
    (@Restaurant1, 'Mama Mia Trattoria', '123 Main Street', 'Boston', 'MA', '02108', '617-555-0101', 'https://mamamiaboston.com', @CuisineItalian, '$$$', 42.3601000, -71.0589000, 'Mon-Sat 11:30am-10pm, Sun 12pm-9pm'),
    (@Restaurant2, 'Taco Paradise', '456 Market Ave', 'Boston', 'MA', '02109', '617-555-0102', 'https://tacoparadise.com', @CuisineMexican, '$$', 42.3656000, -71.0596000, 'Daily 11am-11pm'),
    (@Restaurant3, 'Sakura Sushi Bar', '789 Harbor Blvd', 'Cambridge', 'MA', '02139', '617-555-0103', 'https://sakurasushi.com', @CuisineJapanese, '$$$$', 42.3736000, -71.1097000, 'Tue-Sun 5pm-10pm'),
    (@Restaurant4, 'The Burger Joint', '321 College St', 'Cambridge', 'MA', '02140', '617-555-0104', NULL, @CuisineAmerican, '$', 42.3770000, -71.1167000, 'Daily 11am-9pm'),
    (@Restaurant5, 'Thai Basil Kitchen', '654 River Rd', 'Somerville', 'MA', '02143', '617-555-0105', 'https://thaibasilkitchen.com', @CuisineThai, '$$', 42.3876000, -71.0995000, 'Mon-Sat 12pm-10pm'),
    (@Restaurant6, 'Spice of India', '987 Central Ave', 'Somerville', 'MA', '02144', '617-555-0106', 'https://spiceofindia.com', @CuisineIndian, '$$', 42.3958000, -71.1056000, 'Daily 11:30am-10:30pm'),
    (@Restaurant7, 'Bella Napoli', '147 North End Way', 'Boston', 'MA', '02113', '617-555-0107', 'https://bellanapoli.com', @CuisineItalian, '$$$$', 42.3647000, -71.0542000, 'Wed-Sun 5pm-11pm'),
    (@Restaurant8, 'Tokyo Ramen House', '258 Mass Ave', 'Boston', 'MA', '02115', '617-555-0108', NULL, @CuisineJapanese, '$$', 42.3467000, -71.0841000, 'Mon-Sat 11am-10pm');

-- Insert Members
INSERT INTO Foodie.Member (ID, Name, Email, JoinDate, DietaryRestrictions)
VALUES
    (@Member1, 'Sarah Johnson', 'sarah.johnson@email.com', '2024-01-15', 'Vegetarian'),
    (@Member2, 'Mike Chen', 'mike.chen@email.com', '2024-02-20', NULL),
    (@Member3, 'Emily Rodriguez', 'emily.rodriguez@email.com', '2024-03-10', 'Gluten-free'),
    (@Member4, 'David Thompson', 'david.thompson@email.com', '2024-04-05', 'No shellfish');

-- Insert Restaurant Tags
INSERT INTO Foodie.RestaurantTag (RestaurantID, TagName)
VALUES
    (@Restaurant1, 'Outdoor Seating'),
    (@Restaurant1, 'Good for Groups'),
    (@Restaurant1, 'Romantic'),
    (@Restaurant2, 'Casual Dining'),
    (@Restaurant2, 'Good for Families'),
    (@Restaurant3, 'Date Night'),
    (@Restaurant3, 'Upscale'),
    (@Restaurant4, 'Quick Service'),
    (@Restaurant4, 'Good for Families'),
    (@Restaurant5, 'Vegetarian Options'),
    (@Restaurant5, 'Outdoor Seating'),
    (@Restaurant6, 'Vegetarian Options'),
    (@Restaurant6, 'Spicy Food'),
    (@Restaurant7, 'Fine Dining'),
    (@Restaurant7, 'Wine List'),
    (@Restaurant8, 'Quick Service'),
    (@Restaurant8, 'Authentic');

-- Insert Restaurant Visits
INSERT INTO Foodie.RestaurantVisit (ID, RestaurantID, MemberID, VisitDate, Rating, Comments, DishesOrdered, WouldReturn, PhotoURLs)
VALUES
    (@Visit1, @Restaurant1, @Member1, '2024-05-15 19:30:00', 5, 'Amazing pasta carbonara! The outdoor patio was perfect for a summer evening.', 'Pasta Carbonara, Caprese Salad, Tiramisu', 1, NULL),
    (@Visit2, @Restaurant2, @Member2, '2024-06-20 18:00:00', 4, 'Great tacos and margaritas. Service was a bit slow but worth the wait.', 'Fish Tacos, Carne Asada, Guacamole', 1, NULL),
    (@Visit3, @Restaurant3, @Member3, '2024-07-10 20:00:00', 5, 'Best sushi in Boston! The omakase was incredible. Pricey but worth it for special occasions.', 'Omakase Tasting Menu', 1, NULL),
    (@Visit4, @Restaurant4, @Member4, '2024-08-05 12:30:00', 3, 'Decent burgers, nothing special. Good for a quick lunch.', 'Classic Burger, Fries, Milkshake', 1, NULL),
    (@Visit5, @Restaurant5, @Member1, '2024-09-12 19:00:00', 5, 'Love their Pad Thai! Lots of vegetarian options which is perfect for me.', 'Vegetable Pad Thai, Spring Rolls, Mango Sticky Rice', 1, NULL),
    (@Visit6, @Restaurant6, @Member2, '2024-10-18 18:30:00', 4, 'Excellent curry and naan. The spice level was just right.', 'Chicken Tikka Masala, Garlic Naan, Samosas', 1, NULL);

-- Insert Wishlist Items
INSERT INTO Foodie.WishList (RestaurantID, MemberID, Priority, SuggestedBy, Notes, AddedDate)
VALUES
    (@Restaurant7, @Member1, 'High', 'Sarah Johnson', 'Heard they have amazing authentic Neapolitan pizza. Want to try for anniversary.', '2024-11-01'),
    (@Restaurant8, @Member2, 'Medium', 'Mike Chen', 'Coworker recommended their tonkotsu ramen.', '2024-11-05'),
    (@Restaurant3, @Member4, 'High', 'Emily Rodriguez', 'Emily raved about the sushi. Need to check this place out!', '2024-11-10'),
    (@Restaurant5, @Member3, 'Low', 'Friend from work', 'Want to try Thai food with more vegetarian options.', '2024-11-15');

-- Insert Group Visit
INSERT INTO Foodie.GroupVisit (ID, Name, RestaurantID, VisitDate, TotalCost, GroupRating, Notes)
VALUES
    (@GroupVisit1, 'Team Dinner Celebration', @Restaurant1, '2024-12-01 19:00:00', 285.50, 5, 'Great team bonding dinner. Everyone loved the food and atmosphere.');

-- Insert Group Visit Members
INSERT INTO Foodie.GroupVisitMember (GroupVisitID, MemberID, AmountPaid)
VALUES
    (@GroupVisit1, @Member1, 71.37),
    (@GroupVisit1, @Member2, 71.37),
    (@GroupVisit1, @Member3, 71.38),
    (@GroupVisit1, @Member4, 71.38);

GO
