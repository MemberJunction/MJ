-- Create the CRM schema
CREATE SCHEMA CRM;
GO

-- Account table - stores information about customer organizations/companies
CREATE TABLE CRM.Account (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    AccountName NVARCHAR(100) NOT NULL,
    Industry NVARCHAR(50),
    AnnualRevenue DECIMAL(18,2),
    Website NVARCHAR(255),
    Phone NVARCHAR(20),
    Fax NVARCHAR(20),
    BillingStreet NVARCHAR(100),
    BillingCity NVARCHAR(50),
    BillingState NVARCHAR(50),
    BillingPostalCode NVARCHAR(20),
    BillingCountry NVARCHAR(50),
    ShippingStreet NVARCHAR(100),
    ShippingCity NVARCHAR(50),
    ShippingState NVARCHAR(50),
    ShippingPostalCode NVARCHAR(20),
    ShippingCountry NVARCHAR(50),
    AccountType NVARCHAR(50),
    AccountStatus NVARCHAR(20),
    IsActive BIT DEFAULT 1,
    CONSTRAINT CHK_Account_Type CHECK (AccountType IN ('Prospect', 'Customer', 'Vendor', 'Partner', 'Competitor', 'Other')),
    CONSTRAINT CHK_Account_Status CHECK (AccountStatus IN ('Active', 'Inactive', 'On Hold', 'Closed'))
);

-- Contact table - stores information about individual people associated with accounts
CREATE TABLE CRM.Contact (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    AccountID INT,
    Salutation NVARCHAR(10),
    FirstName NVARCHAR(50) NOT NULL,
    LastName NVARCHAR(50) NOT NULL,
    FullName AS (FirstName + ' ' + LastName) PERSISTED,
    Title NVARCHAR(100),
    Department NVARCHAR(100),
    Email NVARCHAR(100),
    Phone NVARCHAR(20),
    Mobile NVARCHAR(20),
    ReportsToID INT,
    MailingStreet NVARCHAR(100),
    MailingCity NVARCHAR(50),
    MailingState NVARCHAR(50),
    MailingPostalCode NVARCHAR(20),
    MailingCountry NVARCHAR(50),
    BirthDate DATE,
    PreferredContactMethod NVARCHAR(20),
    IsActive BIT DEFAULT 1,
    CONSTRAINT FK_Contact_Account FOREIGN KEY (AccountID) REFERENCES CRM.Account(ID),
    CONSTRAINT FK_Contact_ReportsTo FOREIGN KEY (ReportsToID) REFERENCES CRM.Contact(ID),
    CONSTRAINT CHK_Contact_PreferredMethod CHECK (PreferredContactMethod IN ('Email', 'Phone', 'Mobile', 'Mail', 'None'))
);

-- Activity table - tracks interactions with contacts and accounts
CREATE TABLE CRM.Activity (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    AccountID INT,
    ContactID INT,
    ActivityType NVARCHAR(50) NOT NULL,
    Subject NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX),
    StartDate DATETIME NOT NULL,
    EndDate DATETIME,
    Status NVARCHAR(20) NOT NULL,
    Priority NVARCHAR(10),
    Direction NVARCHAR(10),
    Location NVARCHAR(100),
    Result NVARCHAR(100),
    CONSTRAINT FK_Activity_Account FOREIGN KEY (AccountID) REFERENCES CRM.Account(ID),
    CONSTRAINT FK_Activity_Contact FOREIGN KEY (ContactID) REFERENCES CRM.Contact(ID),
    CONSTRAINT CHK_Activity_Type CHECK (ActivityType IN ('Call', 'Email', 'Meeting', 'Task', 'Note', 'Demo', 'Site Visit', 'Other')),
    CONSTRAINT CHK_Activity_Status CHECK (Status IN ('Planned', 'In Progress', 'Completed', 'Canceled', 'Deferred')),
    CONSTRAINT CHK_Activity_Priority CHECK (Priority IN ('High', 'Medium', 'Low')),
    CONSTRAINT CHK_Activity_Direction CHECK (Direction IN ('Inbound', 'Outbound', 'Internal'))
);

-- Lookup tables for standardizing values

-- Industry lookup
CREATE TABLE CRM.Industry (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    IndustryName NVARCHAR(50) NOT NULL
);

-- Account Type lookup
CREATE TABLE CRM.AccountType (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    TypeName NVARCHAR(50) NOT NULL,
    CONSTRAINT CHK_AccountType_Name CHECK (TypeName IN ('Prospect', 'Customer', 'Vendor', 'Partner', 'Competitor', 'Other'))
);

-- Account Status lookup
CREATE TABLE CRM.AccountStatus (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    StatusName NVARCHAR(20) NOT NULL,
    CONSTRAINT CHK_AccountStatus_Name CHECK (StatusName IN ('Active', 'Inactive', 'On Hold', 'Closed'))
);

-- Activity Type lookup
CREATE TABLE CRM.ActivityType (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    TypeName NVARCHAR(50) NOT NULL,
    CONSTRAINT CHK_ActivityType_Name CHECK (TypeName IN ('Call', 'Email', 'Meeting', 'Task', 'Note', 'Demo', 'Site Visit', 'Other'))
);


-- RelationshipType table - defines relationship types and their inverse relationships
CREATE TABLE CRM.RelationshipType (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    TypeName NVARCHAR(50) NOT NULL,
    IsBidirectional BIT NOT NULL DEFAULT 0,
    InverseRelationshipID INT NULL,
    CONSTRAINT UQ_RelationshipType_Name UNIQUE (TypeName),
    CONSTRAINT FK_RelationshipType_InverseRelationship FOREIGN KEY (InverseRelationshipID) 
        REFERENCES CRM.RelationshipType(ID)
);

-- ContactRelationship table - links two contacts with a specific relationship type
CREATE TABLE CRM.ContactRelationship (
    ID INT IDENTITY(1,1) PRIMARY KEY,
    PrimaryContactID INT NOT NULL,
    RelatedContactID INT NOT NULL,
    RelationshipTypeID INT NOT NULL,
    StartDate DATE NULL,
    EndDate DATE NULL,
    Notes NVARCHAR(500) NULL,
    IsActive BIT DEFAULT 1,
    CONSTRAINT FK_ContactRelationship_PrimaryContact FOREIGN KEY (PrimaryContactID) 
        REFERENCES CRM.Contact(ID),
    CONSTRAINT FK_ContactRelationship_RelatedContact FOREIGN KEY (RelatedContactID) 
        REFERENCES CRM.Contact(ID),
    CONSTRAINT FK_ContactRelationship_RelationshipType FOREIGN KEY (RelationshipTypeID) 
        REFERENCES CRM.RelationshipType(ID),
    CONSTRAINT CHK_ContactRelationship_DifferentContacts CHECK (PrimaryContactID <> RelatedContactID),
    CONSTRAINT CHK_ContactRelationship_DateRange CHECK (EndDate IS NULL OR EndDate >= StartDate)
);

-- Add extended properties for documentation

-- Table: RelationshipType
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Lookup table for defining relationship types between contacts and their inverse relationships',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'RelationshipType';
GO

-- RelationshipType columns
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the relationship type (e.g., Parent, Child, Spouse)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'RelationshipType',
    @level2type = N'COLUMN', @level2name = N'TypeName';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates if the relationship is the same in both directions (e.g., Spouse, Friend)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'RelationshipType',
    @level2type = N'COLUMN', @level2name = N'IsBidirectional';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ID of the inverse relationship type (e.g., Parent → Child)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'RelationshipType',
    @level2type = N'COLUMN', @level2name = N'InverseRelationshipID';
GO

-- Table: ContactRelationship
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores relationship connections between contacts',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'ContactRelationship';
GO

-- ContactRelationship columns
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ID of the primary contact in the relationship (e.g., the parent)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'ContactRelationship',
    @level2type = N'COLUMN', @level2name = N'PrimaryContactID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ID of the related contact in the relationship (e.g., the child)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'ContactRelationship',
    @level2type = N'COLUMN', @level2name = N'RelatedContactID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'ID of the relationship type defining how contacts are related',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'ContactRelationship',
    @level2type = N'COLUMN', @level2name = N'RelationshipTypeID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date when the relationship started',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'ContactRelationship',
    @level2type = N'COLUMN', @level2name = N'StartDate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date when the relationship ended (if applicable)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'ContactRelationship',
    @level2type = N'COLUMN', @level2name = N'EndDate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Additional notes or details about the relationship',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'ContactRelationship',
    @level2type = N'COLUMN', @level2name = N'Notes';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the relationship is currently active',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'ContactRelationship',
    @level2type = N'COLUMN', @level2name = N'IsActive';
GO


-- Add documentation using sp_addextendedproperty
-- Schema documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Schema for Customer Relationship Management (CRM) system',
    @level0type = N'SCHEMA',
    @level0name = N'CRM';
GO

-- Table: Account
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores information about customer organizations and companies',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Account';
GO

-- Account columns
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Official name of the organization or company',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Account',
    @level2type = N'COLUMN', @level2name = N'AccountName';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Industry sector the account belongs to',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Account',
    @level2type = N'COLUMN', @level2name = N'Industry';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Estimated annual revenue of the account in local currency',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Account',
    @level2type = N'COLUMN', @level2name = N'AnnualRevenue';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary website URL of the account',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Account',
    @level2type = N'COLUMN', @level2name = N'Website';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Main phone number for the account',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Account',
    @level2type = N'COLUMN', @level2name = N'Phone';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Fax number for the account',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Account',
    @level2type = N'COLUMN', @level2name = N'Fax';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Street address for billing',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Account',
    @level2type = N'COLUMN', @level2name = N'BillingStreet';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'City for billing address',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Account',
    @level2type = N'COLUMN', @level2name = N'BillingCity';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'State/province for billing address',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Account',
    @level2type = N'COLUMN', @level2name = N'BillingState';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Postal/ZIP code for billing address',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Account',
    @level2type = N'COLUMN', @level2name = N'BillingPostalCode';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Country for billing address',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Account',
    @level2type = N'COLUMN', @level2name = N'BillingCountry';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Street address for shipping',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Account',
    @level2type = N'COLUMN', @level2name = N'ShippingStreet';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'City for shipping address',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Account',
    @level2type = N'COLUMN', @level2name = N'ShippingCity';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'State/province for shipping address',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Account',
    @level2type = N'COLUMN', @level2name = N'ShippingState';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Postal/ZIP code for shipping address',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Account',
    @level2type = N'COLUMN', @level2name = N'ShippingPostalCode';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Country for shipping address',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Account',
    @level2type = N'COLUMN', @level2name = N'ShippingCountry';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Type of relationship with the account (Prospect, Customer, etc.)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Account',
    @level2type = N'COLUMN', @level2name = N'AccountType';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current status of the account (Active, Inactive, etc.)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Account',
    @level2type = N'COLUMN', @level2name = N'AccountStatus';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the account is currently active',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Account',
    @level2type = N'COLUMN', @level2name = N'IsActive';
GO

-- Table: Contact
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Stores information about individual people associated with accounts',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Contact';
GO

-- Contact columns
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Salutation or title prefix (Mr., Ms., Dr., etc.)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Contact',
    @level2type = N'COLUMN', @level2name = N'Salutation';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'First name of the contact',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Contact',
    @level2type = N'COLUMN', @level2name = N'FirstName';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Last name of the contact',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Contact',
    @level2type = N'COLUMN', @level2name = N'LastName';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Full name of the contact (computed column)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Contact',
    @level2type = N'COLUMN', @level2name = N'FullName';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Job title of the contact',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Contact',
    @level2type = N'COLUMN', @level2name = N'Title';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Department the contact works in',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Contact',
    @level2type = N'COLUMN', @level2name = N'Department';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Email address of the contact',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Contact',
    @level2type = N'COLUMN', @level2name = N'Email';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Primary work phone number of the contact',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Contact',
    @level2type = N'COLUMN', @level2name = N'Phone';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Mobile phone number of the contact',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Contact',
    @level2type = N'COLUMN', @level2name = N'Mobile';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Street address for mailing',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Contact',
    @level2type = N'COLUMN', @level2name = N'MailingStreet';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'City for mailing address',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Contact',
    @level2type = N'COLUMN', @level2name = N'MailingCity';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'State/province for mailing address',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Contact',
    @level2type = N'COLUMN', @level2name = N'MailingState';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Postal/ZIP code for mailing address',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Contact',
    @level2type = N'COLUMN', @level2name = N'MailingPostalCode';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Country for mailing address',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Contact',
    @level2type = N'COLUMN', @level2name = N'MailingCountry';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Birth date of the contact',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Contact',
    @level2type = N'COLUMN', @level2name = N'BirthDate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Preferred method of communication (Email, Phone, Mobile, etc.)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Contact',
    @level2type = N'COLUMN', @level2name = N'PreferredContactMethod';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether the contact is currently active',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Contact',
    @level2type = N'COLUMN', @level2name = N'IsActive';
GO

-- Table: Activity
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Tracks interactions with contacts and accounts',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Activity';
GO

-- Activity columns
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Type of activity (Call, Email, Meeting, etc.)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Activity',
    @level2type = N'COLUMN', @level2name = N'ActivityType';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Brief description of the activity',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Activity',
    @level2type = N'COLUMN', @level2name = N'Subject';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed description or notes about the activity',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Activity',
    @level2type = N'COLUMN', @level2name = N'Description';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date and time when the activity starts',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Activity',
    @level2type = N'COLUMN', @level2name = N'StartDate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date and time when the activity ends',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Activity',
    @level2type = N'COLUMN', @level2name = N'EndDate';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current status of the activity (Planned, Completed, etc.)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Activity',
    @level2type = N'COLUMN', @level2name = N'Status';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Priority level of the activity (High, Medium, Low)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Activity',
    @level2type = N'COLUMN', @level2name = N'Priority';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Direction of communication (Inbound, Outbound, Internal)',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Activity',
    @level2type = N'COLUMN', @level2name = N'Direction';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Physical or virtual location of the activity',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Activity',
    @level2type = N'COLUMN', @level2name = N'Location';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Outcome or result of the activity',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Activity',
    @level2type = N'COLUMN', @level2name = N'Result';
GO

-- Table: Industry
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Lookup table for standardizing industry values',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Industry';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the industry',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Industry',
    @level2type = N'COLUMN', @level2name = N'IndustryName';
GO

-- Table: AccountType
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Lookup table for standardizing account type values',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'AccountType';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the account type',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'AccountType',
    @level2type = N'COLUMN', @level2name = N'TypeName';
GO

-- Table: AccountStatus
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Lookup table for standardizing account status values',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'AccountStatus';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the account status',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'AccountStatus',
    @level2type = N'COLUMN', @level2name = N'StatusName';
GO

-- Table: ActivityType
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Lookup table for standardizing activity type values',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'ActivityType';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the activity type',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'ActivityType',
    @level2type = N'COLUMN', @level2name = N'TypeName';
GO




-- Sample data for Industry lookup table
INSERT INTO CRM.Industry (IndustryName) VALUES 
('Technology'),
('Healthcare'),
('Financial Services'),
('Manufacturing'),
('Retail'),
('Education'),
('Hospitality'),
('Real Estate'),
('Construction'),
('Energy'),
('Telecommunications'),
('Transportation'),
('Media & Entertainment'),
('Agriculture'),
('Automotive'),
('Consulting'),
('Government'),
('Legal Services'),
('Nonprofit'),
('Pharmaceutical'),
('Aerospace & Defense');

-- Sample data for AccountType lookup table
INSERT INTO CRM.AccountType (TypeName) VALUES 
('Prospect'),
('Customer'),
('Vendor'),
('Partner'),
('Competitor'),
('Other');

-- Sample data for AccountStatus lookup table
INSERT INTO CRM.AccountStatus (StatusName) VALUES 
('Active'),
('Inactive'),
('On Hold'),
('Closed');

-- Sample data for ActivityType lookup table
INSERT INTO CRM.ActivityType (TypeName) VALUES 
('Call'),
('Email'),
('Meeting'),
('Task'),
('Note'),
('Demo'),
('Site Visit'),
('Other');




-- Enable IDENTITY_INSERT for RelationshipType to ensure specific IDs for inverse relationships
SET IDENTITY_INSERT CRM.RelationshipType ON;

-- Insert relationship types with their inverse relationships
INSERT INTO CRM.RelationshipType (ID, TypeName, IsBidirectional, InverseRelationshipID) 
VALUES (1, 'Parent', 0, NULL);

INSERT INTO CRM.RelationshipType (ID, TypeName, IsBidirectional, InverseRelationshipID) 
VALUES (2, 'Child', 0, 1);

-- Update Parent to point to Child as its inverse
UPDATE CRM.RelationshipType SET InverseRelationshipID = 2 WHERE ID = 1;

-- Continue with other relationship types
INSERT INTO CRM.RelationshipType (ID, TypeName, IsBidirectional, InverseRelationshipID) 
VALUES (3, 'Spouse', 1, NULL);

INSERT INTO CRM.RelationshipType (ID, TypeName, IsBidirectional, InverseRelationshipID) 
VALUES (4, 'Supervisor', 0, NULL);

INSERT INTO CRM.RelationshipType (ID, TypeName, IsBidirectional, InverseRelationshipID) 
VALUES (5, 'Subordinate', 0, 4);

-- Update Supervisor to point to Subordinate as its inverse
UPDATE CRM.RelationshipType SET InverseRelationshipID = 5 WHERE ID = 4;

INSERT INTO CRM.RelationshipType (ID, TypeName, IsBidirectional, InverseRelationshipID) 
VALUES (6, 'Friend', 1, NULL);

INSERT INTO CRM.RelationshipType (ID, TypeName, IsBidirectional, InverseRelationshipID) 
VALUES (7, 'Sibling', 1, NULL);

INSERT INTO CRM.RelationshipType (ID, TypeName, IsBidirectional, InverseRelationshipID) 
VALUES (8, 'Colleague', 1, NULL);

INSERT INTO CRM.RelationshipType (ID, TypeName, IsBidirectional, InverseRelationshipID) 
VALUES (9, 'Mentor', 0, NULL);

INSERT INTO CRM.RelationshipType (ID, TypeName, IsBidirectional, InverseRelationshipID) 
VALUES (10, 'Mentee', 0, 9);

-- Update Mentor to point to Mentee as its inverse
UPDATE CRM.RelationshipType SET InverseRelationshipID = 10 WHERE ID = 9;

SET IDENTITY_INSERT CRM.RelationshipType OFF;

-- Insert sample Accounts (35 accounts)

-- Enable IDENTITY_INSERT for Account table
SET IDENTITY_INSERT CRM.Account ON;

INSERT INTO CRM.Account (ID, AccountName, Industry, AnnualRevenue, Website, Phone, Fax, 
                        BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry,
                        ShippingStreet, ShippingCity, ShippingState, ShippingPostalCode, ShippingCountry,
                        AccountType, AccountStatus, IsActive)
VALUES
-- Technology Companies
(1, 'TechNova Systems', 'Technology', 12500000.00, 'www.technovasystems.com', '(415) 555-1234', '(415) 555-1235', 
 '123 Innovation Way', 'San Francisco', 'CA', '94105', 'USA',
 '123 Innovation Way', 'San Francisco', 'CA', '94105', 'USA',
 'Customer', 'Active', 1),

(2, 'Quantum Computing Inc', 'Technology', 75000000.00, 'www.quantumcomputing.com', '(206) 555-9876', '(206) 555-9877', 
 '456 Tech Boulevard', 'Seattle', 'WA', '98101', 'USA',
 '456 Tech Boulevard', 'Seattle', 'WA', '98101', 'USA',
 'Customer', 'Active', 1),

(3, 'CyberShield Solutions', 'Technology', 45000000.00, 'www.cybershieldsolutions.com', '(408) 555-5678', '(408) 555-5679', 
 '789 Security Drive', 'San Jose', 'CA', '95113', 'USA',
 '789 Security Drive', 'San Jose', 'CA', '95113', 'USA',
 'Customer', 'Active', 1),

(4, 'DataSphere Analytics', 'Technology', 28000000.00, 'www.datasphereanalytics.com', '(512) 555-4321', '(512) 555-4322', 
 '101 Data Lane', 'Austin', 'TX', '78701', 'USA',
 '101 Data Lane', 'Austin', 'TX', '78701', 'USA',
 'Prospect', 'Active', 1),

(5, 'CloudFusion Networks', 'Telecommunications', 120000000.00, 'www.cloudfusion.com', '(312) 555-8765', '(312) 555-8766', 
 '555 Cloud Street', 'Chicago', 'IL', '60601', 'USA',
 '555 Cloud Street', 'Chicago', 'IL', '60601', 'USA',
 'Customer', 'Active', 1),

-- Healthcare Companies
(6, 'MediLife Healthcare', 'Healthcare', 215000000.00, 'www.medilifehealthcare.com', '(617) 555-2468', '(617) 555-2469', 
 '200 Wellness Avenue', 'Boston', 'MA', '02110', 'USA',
 '200 Wellness Avenue', 'Boston', 'MA', '02110', 'USA',
 'Customer', 'Active', 1),

(7, 'PrecisionCare Labs', 'Healthcare', 55000000.00, 'www.precisioncarelabs.com', '(713) 555-1357', '(713) 555-1358', 
 '300 Medical Center Blvd', 'Houston', 'TX', '77030', 'USA',
 '300 Medical Center Blvd', 'Houston', 'TX', '77030', 'USA',
 'Customer', 'Active', 1),

(8, 'VitalSource Pharmaceuticals', 'Pharmaceutical', 320000000.00, 'www.vitalsourcepharma.com', '(858) 555-9753', '(858) 555-9754', 
 '400 Research Park', 'San Diego', 'CA', '92121', 'USA',
 '400 Research Park', 'San Diego', 'CA', '92121', 'USA',
 'Prospect', 'Active', 1),

(9, 'HealthTrack Systems', 'Healthcare', 42000000.00, 'www.healthtracksystems.com', '(612) 555-3698', '(612) 555-3699', 
 '500 Innovation Drive', 'Minneapolis', 'MN', '55401', 'USA',
 '500 Innovation Drive', 'Minneapolis', 'MN', '55401', 'USA',
 'Customer', 'Active', 1),

-- Financial Services Companies
(10, 'Summit Financial Group', 'Financial Services', 560000000.00, 'www.summitfinancial.com', '(212) 555-7539', '(212) 555-7540', 
 '800 Wall Street', 'New York', 'NY', '10005', 'USA',
 '800 Wall Street', 'New York', 'NY', '10005', 'USA',
 'Customer', 'Active', 1),

(11, 'Prairie Trust Bank', 'Financial Services', 125000000.00, 'www.prairietrust.com', '(816) 555-9514', '(816) 555-9515', 
 '900 Main Street', 'Kansas City', 'MO', '64105', 'USA',
 '900 Main Street', 'Kansas City', 'MO', '64105', 'USA',
 'Customer', 'Active', 1),

(12, 'Meridian Investments', 'Financial Services', 275000000.00, 'www.meridianinvest.com', '(704) 555-1598', '(704) 555-1599', 
 '1000 Finance Way', 'Charlotte', 'NC', '28202', 'USA',
 '1000 Finance Way', 'Charlotte', 'NC', '28202', 'USA',
 'Customer', 'Active', 1),

(13, 'Global Capital Partners', 'Financial Services', 890000000.00, 'www.globalcapitalpartners.com', '(312) 555-7412', '(312) 555-7413', 
 '1100 Market Square', 'Chicago', 'IL', '60602', 'USA',
 '1100 Market Square', 'Chicago', 'IL', '60602', 'USA',
 'Prospect', 'Active', 1),

-- Manufacturing Companies
(14, 'Precision Engineering Corp', 'Manufacturing', 95000000.00, 'www.precisionengineering.com', '(734) 555-8523', '(734) 555-8524', 
 '1200 Factory Lane', 'Detroit', 'MI', '48201', 'USA',
 '1200 Factory Lane', 'Detroit', 'MI', '48201', 'USA',
 'Customer', 'Active', 1),

(15, 'Atlas Industrial Systems', 'Manufacturing', 135000000.00, 'www.atlasindustrial.com', '(412) 555-9637', '(412) 555-9638', 
 '1300 Steel Avenue', 'Pittsburgh', 'PA', '15222', 'USA',
 '1300 Steel Avenue', 'Pittsburgh', 'PA', '15222', 'USA',
 'Customer', 'Active', 1),

(16, 'Evergreen Materials', 'Manufacturing', 65000000.00, 'www.evergreenmaterials.com', '(503) 555-4826', '(503) 555-4827', 
 '1400 Production Road', 'Portland', 'OR', '97201', 'USA',
 '1400 Production Road', 'Portland', 'OR', '97201', 'USA',
 'Customer', 'Active', 1),

(17, 'Dynamic Components Ltd', 'Manufacturing', 48000000.00, 'www.dynamiccomponents.com', '(336) 555-7159', '(336) 555-7160', 
 '1500 Assembly Drive', 'Greensboro', 'NC', '27401', 'USA',
 '1500 Assembly Drive', 'Greensboro', 'NC', '27401', 'USA',
 'Prospect', 'Active', 1),

-- Retail Companies
(18, 'Urban Essentials', 'Retail', 75000000.00, 'www.urbanessentials.com', '(213) 555-3698', '(213) 555-3699', 
 '1600 Fashion Boulevard', 'Los Angeles', 'CA', '90015', 'USA',
 '1600 Fashion Boulevard', 'Los Angeles', 'CA', '90015', 'USA',
 'Customer', 'Active', 1),

(19, 'Summit Outdoor Gear', 'Retail', 42000000.00, 'www.summitoutdoorgear.com', '(303) 555-9514', '(303) 555-9515', 
 '1700 Adventure Lane', 'Denver', 'CO', '80202', 'USA',
 '1700 Adventure Lane', 'Denver', 'CO', '80202', 'USA',
 'Customer', 'Active', 1),

(20, 'Gourmet Provisions', 'Retail', 28000000.00, 'www.gourmetprovisions.com', '(415) 555-7531', '(415) 555-7532', 
 '1800 Culinary Street', 'San Francisco', 'CA', '94110', 'USA',
 '1800 Culinary Street', 'San Francisco', 'CA', '94110', 'USA',
 'Customer', 'On Hold', 1),

(21, 'Elegant Home Designs', 'Retail', 38000000.00, 'www.eleganthomedesigns.com', '(305) 555-8246', '(305) 555-8247', 
 '1900 Decor Plaza', 'Miami', 'FL', '33131', 'USA',
 '1900 Decor Plaza', 'Miami', 'FL', '33131', 'USA',
 'Customer', 'Active', 1),

-- Education Companies
(22, 'Innovative Learning Solutions', 'Education', 22000000.00, 'www.innovativelearning.org', '(617) 555-1593', '(617) 555-1594', 
 '2000 Education Way', 'Cambridge', 'MA', '02142', 'USA',
 '2000 Education Way', 'Cambridge', 'MA', '02142', 'USA',
 'Customer', 'Active', 1),

(23, 'Global Knowledge Institute', 'Education', 18000000.00, 'www.globalknowledgeinstitute.org', '(919) 555-7536', '(919) 555-7537', 
 '2100 Scholar Lane', 'Raleigh', 'NC', '27601', 'USA',
 '2100 Scholar Lane', 'Raleigh', 'NC', '27601', 'USA',
 'Prospect', 'Active', 1),

-- Energy Companies
(24, 'Horizon Energy Solutions', 'Energy', 420000000.00, 'www.horizonenergy.com', '(713) 555-9517', '(713) 555-9518', 
 '2200 Power Drive', 'Houston', 'TX', '77002', 'USA',
 '2200 Power Drive', 'Houston', 'TX', '77002', 'USA',
 'Customer', 'Active', 1),

(25, 'SolarPeak Technologies', 'Energy', 85000000.00, 'www.solarpeaktech.com', '(480) 555-3579', '(480) 555-3580', 
 '2300 Renewable Road', 'Phoenix', 'AZ', '85004', 'USA',
 '2300 Renewable Road', 'Phoenix', 'AZ', '85004', 'USA',
 'Customer', 'Active', 1),

-- Transportation Companies
(26, 'Pacific Shipping Logistics', 'Transportation', 110000000.00, 'www.pacificshipping.com', '(206) 555-7539', '(206) 555-7540', 
 '2400 Harbor Boulevard', 'Seattle', 'WA', '98104', 'USA',
 '2400 Harbor Boulevard', 'Seattle', 'WA', '98104', 'USA',
 'Customer', 'Active', 1),

(27, 'Express Cargo Systems', 'Transportation', 75000000.00, 'www.expresscargo.com', '(901) 555-1593', '(901) 555-1594', 
 '2500 Freight Way', 'Memphis', 'TN', '38103', 'USA',
 '2500 Freight Way', 'Memphis', 'TN', '38103', 'USA',
 'Customer', 'Active', 1),

-- Consulting Companies
(28, 'Strategic Insights Consulting', 'Consulting', 65000000.00, 'www.strategicinsights.com', '(312) 555-9517', '(312) 555-9518', 
 '2600 Consulting Plaza', 'Chicago', 'IL', '60603', 'USA',
 '2600 Consulting Plaza', 'Chicago', 'IL', '60603', 'USA',
 'Customer', 'Active', 1),

(29, 'Innovation Advisory Group', 'Consulting', 48000000.00, 'www.innovationadvisory.com', '(212) 555-3579', '(212) 555-3580', 
 '2700 Advisor Avenue', 'New York', 'NY', '10022', 'USA',
 '2700 Advisor Avenue', 'New York', 'NY', '10022', 'USA',
 'Customer', 'Active', 1),

-- Legal Services Companies
(30, 'Justice & Associates', 'Legal Services', 35000000.00, 'www.justicelaw.com', '(404) 555-7539', '(404) 555-7540', 
 '2800 Legal Parkway', 'Atlanta', 'GA', '30303', 'USA',
 '2800 Legal Parkway', 'Atlanta', 'GA', '30303', 'USA',
 'Customer', 'Active', 1),

(31, 'Integrity Legal Solutions', 'Legal Services', 22000000.00, 'www.integritylegal.com', '(213) 555-1593', '(213) 555-1594', 
 '2900 Justice Circle', 'Los Angeles', 'CA', '90071', 'USA',
 '2900 Justice Circle', 'Los Angeles', 'CA', '90071', 'USA',
 'Customer', 'Inactive', 0),

-- Real Estate Companies
(32, 'Heritage Properties Group', 'Real Estate', 85000000.00, 'www.heritageproperties.com', '(305) 555-9517', '(305) 555-9518', 
 '3000 Realty Drive', 'Miami', 'FL', '33132', 'USA',
 '3000 Realty Drive', 'Miami', 'FL', '33132', 'USA',
 'Customer', 'Active', 1),

(33, 'Urban Development Ventures', 'Real Estate', 120000000.00, 'www.urbandevelopment.com', '(212) 555-3579', '(212) 555-3580', 
 '3100 Property Lane', 'New York', 'NY', '10017', 'USA',
 '3100 Property Lane', 'New York', 'NY', '10017', 'USA',
 'Prospect', 'Active', 1),

-- International Companies
(34, 'Transcontinental Partners', 'Consulting', 180000000.00, 'www.transcontinentalpartners.com', '+44 20 5555 1234', '+44 20 5555 1235', 
 '123 Global Avenue', 'London', '', 'EC2N 4AY', 'United Kingdom',
 '123 Global Avenue', 'London', '', 'EC2N 4AY', 'United Kingdom',
 'Customer', 'Active', 1),

(35, 'EuroTech Innovations', 'Technology', 95000000.00, 'www.eurotechinnovations.com', '+49 30 5555 6789', '+49 30 5555 6790', 
 '456 Tech Strasse', 'Berlin', '', '10117', 'Germany',
 '456 Tech Strasse', 'Berlin', '', '10117', 'Germany',
 'Customer', 'Active', 1);

SET IDENTITY_INSERT CRM.Account OFF;

-- Insert sample Contacts (65 contacts)

-- Enable IDENTITY_INSERT for Contact table
SET IDENTITY_INSERT CRM.Contact ON;

INSERT INTO CRM.Contact (ID, AccountID, Salutation, FirstName, LastName, Title, Department, Email, Phone, Mobile, 
                         ReportsToID, MailingStreet, MailingCity, MailingState, MailingPostalCode, MailingCountry, 
                         BirthDate, PreferredContactMethod, IsActive)
VALUES
-- TechNova Systems contacts
(1, 1, 'Mr.', 'James', 'Wilson', 'CEO', 'Executive', 'jwilson@technovasystems.com', '(415) 555-1241', '(415) 555-1242', 
 NULL, '123 Innovation Way', 'San Francisco', 'CA', '94105', 'USA', 
 '1975-06-15', 'Email', 1),

(2, 1, 'Ms.', 'Sarah', 'Chen', 'CTO', 'Technology', 'schen@technovasystems.com', '(415) 555-1243', '(415) 555-1244', 
 1, '123 Innovation Way', 'San Francisco', 'CA', '94105', 'USA', 
 '1980-03-22', 'Email', 1),

(3, 1, 'Mr.', 'David', 'Rodriguez', 'CFO', 'Finance', 'drodriguez@technovasystems.com', '(415) 555-1245', '(415) 555-1246', 
 1, '123 Innovation Way', 'San Francisco', 'CA', '94105', 'USA', 
 '1978-11-10', 'Phone', 1),

-- Quantum Computing Inc contacts
(4, 2, 'Dr.', 'Elizabeth', 'Taylor', 'CEO', 'Executive', 'etaylor@quantumcomputing.com', '(206) 555-9880', '(206) 555-9881', 
 NULL, '456 Tech Boulevard', 'Seattle', 'WA', '98101', 'USA', 
 '1972-09-05', 'Email', 1),

(5, 2, 'Dr.', 'Michael', 'Patel', 'Research Director', 'R&D', 'mpatel@quantumcomputing.com', '(206) 555-9882', '(206) 555-9883', 
 4, '456 Tech Boulevard', 'Seattle', 'WA', '98101', 'USA', 
 '1982-01-18', 'Email', 1),

(6, 2, 'Ms.', 'Jennifer', 'Wong', 'VP Marketing', 'Marketing', 'jwong@quantumcomputing.com', '(206) 555-9884', '(206) 555-9885', 
 4, '456 Tech Boulevard', 'Seattle', 'WA', '98101', 'USA', 
 '1984-07-30', 'Mobile', 1),

-- CyberShield Solutions contacts
(7, 3, 'Mr.', 'Robert', 'Johnson', 'CEO', 'Executive', 'rjohnson@cybershieldsolutions.com', '(408) 555-5680', '(408) 555-5681', 
 NULL, '789 Security Drive', 'San Jose', 'CA', '95113', 'USA', 
 '1976-12-03', 'Phone', 1),

(8, 3, 'Ms.', 'Amanda', 'Lee', 'CISO', 'Security', 'alee@cybershieldsolutions.com', '(408) 555-5682', '(408) 555-5683', 
 7, '789 Security Drive', 'San Jose', 'CA', '95113', 'USA', 
 '1983-05-25', 'Email', 1),

-- DataSphere Analytics contacts
(9, 4, 'Mr.', 'Daniel', 'Garcia', 'CEO', 'Executive', 'dgarcia@datasphereanalytics.com', '(512) 555-4325', '(512) 555-4326', 
 NULL, '101 Data Lane', 'Austin', 'TX', '78701', 'USA', 
 '1979-08-12', 'Email', 1),

(10, 4, 'Ms.', 'Emma', 'Martinez', 'Data Science Director', 'Analytics', 'emartinez@datasphereanalytics.com', '(512) 555-4327', '(512) 555-4328', 
 9, '101 Data Lane', 'Austin', 'TX', '78701', 'USA', 
 '1985-04-17', 'Mobile', 1),

-- CloudFusion Networks contacts
(11, 5, 'Ms.', 'Olivia', 'Washington', 'CEO', 'Executive', 'owashington@cloudfusion.com', '(312) 555-8770', '(312) 555-8771', 
 NULL, '555 Cloud Street', 'Chicago', 'IL', '60601', 'USA', 
 '1974-10-08', 'Email', 1),

(12, 5, 'Mr.', 'William', 'Kim', 'CTO', 'Technology', 'wkim@cloudfusion.com', '(312) 555-8772', '(312) 555-8773', 
 11, '555 Cloud Street', 'Chicago', 'IL', '60601', 'USA', 
 '1981-06-29', 'Phone', 1),

-- MediLife Healthcare contacts
(13, 6, 'Dr.', 'Richard', 'Brown', 'CEO', 'Executive', 'rbrown@medilifehealthcare.com', '(617) 555-2470', '(617) 555-2471', 
 NULL, '200 Wellness Avenue', 'Boston', 'MA', '02110', 'USA', 
 '1968-03-14', 'Phone', 1),

(14, 6, 'Dr.', 'Patricia', 'Miller', 'Medical Director', 'Medical', 'pmiller@medilifehealthcare.com', '(617) 555-2472', '(617) 555-2473', 
 13, '200 Wellness Avenue', 'Boston', 'MA', '02110', 'USA', 
 '1975-11-30', 'Email', 1),

-- PrecisionCare Labs contacts
(15, 7, 'Dr.', 'Thomas', 'Jackson', 'CEO', 'Executive', 'tjackson@precisioncarelabs.com', '(713) 555-1360', '(713) 555-1361', 
 NULL, '300 Medical Center Blvd', 'Houston', 'TX', '77030', 'USA', 
 '1970-05-22', 'Email', 1),

(16, 7, 'Dr.', 'Sophia', 'Nguyen', 'Research Director', 'R&D', 'snguyen@precisioncarelabs.com', '(713) 555-1362', '(713) 555-1363', 
 15, '300 Medical Center Blvd', 'Houston', 'TX', '77030', 'USA', 
 '1982-09-10', 'Mobile', 1),

-- VitalSource Pharmaceuticals contacts
(17, 8, 'Mr.', 'Charles', 'Wilson', 'CEO', 'Executive', 'cwilson@vitalsourcepharma.com', '(858) 555-9756', '(858) 555-9757', 
 NULL, '400 Research Park', 'San Diego', 'CA', '92121', 'USA', 
 '1967-12-18', 'Phone', 1),

(18, 8, 'Dr.', 'Grace', 'Thompson', 'Chief Research Officer', 'R&D', 'gthompson@vitalsourcepharma.com', '(858) 555-9758', '(858) 555-9759', 
 17, '400 Research Park', 'San Diego', 'CA', '92121', 'USA', 
 '1979-02-25', 'Email', 1),

-- HealthTrack Systems contacts
(19, 9, 'Ms.', 'Katherine', 'Lee', 'CEO', 'Executive', 'klee@healthtracksystems.com', '(612) 555-3700', '(612) 555-3701', 
 NULL, '500 Innovation Drive', 'Minneapolis', 'MN', '55401', 'USA', 
 '1976-08-05', 'Email', 1),

(20, 9, 'Mr.', 'Jason', 'Clark', 'CTO', 'Technology', 'jclark@healthtracksystems.com', '(612) 555-3702', '(612) 555-3703', 
 19, '500 Innovation Drive', 'Minneapolis', 'MN', '55401', 'USA', 
 '1983-04-12', 'Mobile', 1),

-- Summit Financial Group contacts
(21, 10, 'Mr.', 'Edward', 'Morgan', 'CEO', 'Executive', 'emorgan@summitfinancial.com', '(212) 555-7541', '(212) 555-7542', 
 NULL, '800 Wall Street', 'New York', 'NY', '10005', 'USA', 
 '1965-09-28', 'Phone', 1),

(22, 10, 'Ms.', 'Rachel', 'Harris', 'CFO', 'Finance', 'rharris@summitfinancial.com', '(212) 555-7543', '(212) 555-7544', 
 21, '800 Wall Street', 'New York', 'NY', '10005', 'USA', 
 '1973-06-15', 'Email', 1),

(23, 10, 'Mr.', 'Brandon', 'Scott', 'Investment Director', 'Investment', 'bscott@summitfinancial.com', '(212) 555-7545', '(212) 555-7546', 
 21, '800 Wall Street', 'New York', 'NY', '10005', 'USA', 
 '1980-11-03', 'Mobile', 1),

-- Prairie Trust Bank contacts
(24, 11, 'Ms.', 'Laura', 'Davis', 'CEO', 'Executive', 'ldavis@prairietrust.com', '(816) 555-9516', '(816) 555-9517', 
 NULL, '900 Main Street', 'Kansas City', 'MO', '64105', 'USA', 
 '1969-07-22', 'Email', 1),

(25, 11, 'Mr.', 'Steven', 'White', 'Branch Manager', 'Operations', 'swhite@prairietrust.com', '(816) 555-9518', '(816) 555-9519', 
 24, '900 Main Street', 'Kansas City', 'MO', '64105', 'USA', 
 '1978-03-10', 'Phone', 1),

-- Meridian Investments contacts
(26, 12, 'Mr.', 'Jonathan', 'Evans', 'CEO', 'Executive', 'jevans@meridianinvest.com', '(704) 555-1600', '(704) 555-1601', 
 NULL, '1000 Finance Way', 'Charlotte', 'NC', '28202', 'USA', 
 '1966-05-14', 'Mobile', 1),

(27, 12, 'Ms.', 'Michelle', 'Turner', 'CIO', 'Investment', 'mturner@meridianinvest.com', '(704) 555-1602', '(704) 555-1603', 
 26, '1000 Finance Way', 'Charlotte', 'NC', '28202', 'USA', 
 '1977-09-08', 'Email', 1),

-- Global Capital Partners contacts
(28, 13, 'Mr.', 'Benjamin', 'Adams', 'CEO', 'Executive', 'badams@globalcapitalpartners.com', '(312) 555-7414', '(312) 555-7415', 
 NULL, '1100 Market Square', 'Chicago', 'IL', '60602', 'USA', 
 '1964-11-30', 'Phone', 1),

(29, 13, 'Ms.', 'Nicole', 'Walker', 'Head of M&A', 'Mergers & Acquisitions', 'nwalker@globalcapitalpartners.com', '(312) 555-7416', '(312) 555-7417', 
 28, '1100 Market Square', 'Chicago', 'IL', '60602', 'USA', 
 '1975-02-17', 'Email', 1),

-- Precision Engineering Corp contacts
(30, 14, 'Mr.', 'George', 'Mitchell', 'CEO', 'Executive', 'gmitchell@precisionengineering.com', '(734) 555-8525', '(734) 555-8526', 
 NULL, '1200 Factory Lane', 'Detroit', 'MI', '48201', 'USA', 
 '1962-08-07', 'Phone', 1),

(31, 14, 'Ms.', 'Diana', 'Cooper', 'Operations Director', 'Operations', 'dcooper@precisionengineering.com', '(734) 555-8527', '(734) 555-8528', 
 30, '1200 Factory Lane', 'Detroit', 'MI', '48201', 'USA', 
 '1974-04-25', 'Email', 1),

-- Atlas Industrial Systems contacts
(32, 15, 'Mr.', 'Mark', 'Roberts', 'CEO', 'Executive', 'mroberts@atlasindustrial.com', '(412) 555-9639', '(412) 555-9640', 
 NULL, '1300 Steel Avenue', 'Pittsburgh', 'PA', '15222', 'USA', 
 '1967-01-12', 'Mobile', 1),

(33, 15, 'Ms.', 'Olivia', 'Hayes', 'Supply Chain Manager', 'Supply Chain', 'ohayes@atlasindustrial.com', '(412) 555-9641', '(412) 555-9642', 
 32, '1300 Steel Avenue', 'Pittsburgh', 'PA', '15222', 'USA', 
 '1979-06-30', 'Email', 1),

-- Evergreen Materials contacts
(34, 16, 'Mr.', 'Andrew', 'Phillips', 'CEO', 'Executive', 'aphillips@evergreenmaterials.com', '(503) 555-4828', '(503) 555-4829', 
 NULL, '1400 Production Road', 'Portland', 'OR', '97201', 'USA', 
 '1970-10-05', 'Email', 1),

(35, 16, 'Ms.', 'Emily', 'Foster', 'Sustainability Director', 'Environmental', 'efoster@evergreenmaterials.com', '(503) 555-4830', '(503) 555-4831', 
 34, '1400 Production Road', 'Portland', 'OR', '97201', 'USA', 
 '1982-12-18', 'Phone', 1),

-- Urban Essentials contacts
(36, 18, 'Ms.', 'Sophia', 'Rivera', 'CEO', 'Executive', 'srivera@urbanessentials.com', '(213) 555-3700', '(213) 555-3701', 
 NULL, '1600 Fashion Boulevard', 'Los Angeles', 'CA', '90015', 'USA', 
 '1972-05-28', 'Mobile', 1),

(37, 18, 'Mr.', 'Daniel', 'Lopez', 'Retail Operations Manager', 'Operations', 'dlopez@urbanessentials.com', '(213) 555-3702', '(213) 555-3703', 
 36, '1600 Fashion Boulevard', 'Los Angeles', 'CA', '90015', 'USA', 
 '1980-09-14', 'Email', 1),

-- Summit Outdoor Gear contacts
(38, 19, 'Mr.', 'Christopher', 'Young', 'CEO', 'Executive', 'cyoung@summitoutdoorgear.com', '(303) 555-9516', '(303) 555-9517', 
 NULL, '1700 Adventure Lane', 'Denver', 'CO', '80202', 'USA', 
 '1968-07-02', 'Phone', 1),

(39, 19, 'Ms.', 'Lauren', 'Reed', 'Marketing Director', 'Marketing', 'lreed@summitoutdoorgear.com', '(303) 555-9518', '(303) 555-9519', 
 38, '1700 Adventure Lane', 'Denver', 'CO', '80202', 'USA', 
 '1981-03-19', 'Email', 1),

-- Gourmet Provisions contacts
(40, 20, 'Mr.', 'Matthew', 'Baker', 'CEO', 'Executive', 'mbaker@gourmetprovisions.com', '(415) 555-7533', '(415) 555-7534', 
 NULL, '1800 Culinary Street', 'San Francisco', 'CA', '94110', 'USA', 
 '1971-11-11', 'Email', 1),

(41, 20, 'Ms.', 'Sophie', 'Anderson', 'Culinary Director', 'Product Development', 'sanderson@gourmetprovisions.com', '(415) 555-7535', '(415) 555-7536', 
 40, '1800 Culinary Street', 'San Francisco', 'CA', '94110', 'USA', 
 '1978-06-27', 'Mobile', 1),

-- Innovative Learning Solutions contacts
(42, 22, 'Dr.', 'Alexander', 'Wright', 'CEO', 'Executive', 'awright@innovativelearning.org', '(617) 555-1595', '(617) 555-1596', 
 NULL, '2000 Education Way', 'Cambridge', 'MA', '02142', 'USA', 
 '1966-03-08', 'Email', 1),

(43, 22, 'Dr.', 'Julia', 'Bennett', 'Academic Director', 'Academics', 'jbennett@innovativelearning.org', '(617) 555-1597', '(617) 555-1598', 
 42, '2000 Education Way', 'Cambridge', 'MA', '02142', 'USA', 
 '1975-08-22', 'Phone', 1),

-- Global Knowledge Institute contacts
(44, 23, 'Dr.', 'Robert', 'Collins', 'President', 'Executive', 'rcollins@globalknowledgeinstitute.org', '(919) 555-7538', '(919) 555-7539', 
 NULL, '2100 Scholar Lane', 'Raleigh', 'NC', '27601', 'USA', 
 '1964-12-10', 'Email', 1),

(45, 23, 'Dr.', 'Natalie', 'Martinez', 'Research Director', 'Research', 'nmartinez@globalknowledgeinstitute.org', '(919) 555-7540', '(919) 555-7541', 
 44, '2100 Scholar Lane', 'Raleigh', 'NC', '27601', 'USA', 
 '1977-04-15', 'Mobile', 1),

-- Horizon Energy Solutions contacts
(46, 24, 'Mr.', 'William', 'Thompson', 'CEO', 'Executive', 'wthompson@horizonenergy.com', '(713) 555-9519', '(713) 555-9520', 
 NULL, '2200 Power Drive', 'Houston', 'TX', '77002', 'USA', 
 '1963-09-29', 'Phone', 1),

(47, 24, 'Ms.', 'Victoria', 'Campbell', 'Operations Director', 'Operations', 'vcampbell@horizonenergy.com', '(713) 555-9521', '(713) 555-9522', 
 46, '2200 Power Drive', 'Houston', 'TX', '77002', 'USA', 
 '1974-05-12', 'Email', 1),

-- SolarPeak Technologies contacts
(48, 25, 'Dr.', 'Brian', 'Howard', 'CEO', 'Executive', 'bhoward@solarpeaktech.com', '(480) 555-3581', '(480) 555-3582', 
 NULL, '2300 Renewable Road', 'Phoenix', 'AZ', '85004', 'USA', 
 '1969-07-07', 'Email', 1),

(49, 25, 'Ms.', 'Karen', 'Schmidt', 'Innovation Director', 'R&D', 'kschmidt@solarpeaktech.com', '(480) 555-3583', '(480) 555-3584', 
 48, '2300 Renewable Road', 'Phoenix', 'AZ', '85004', 'USA', 
 '1980-01-21', 'Mobile', 1),

-- Pacific Shipping Logistics contacts
(50, 26, 'Mr.', 'Thomas', 'Nelson', 'CEO', 'Executive', 'tnelson@pacificshipping.com', '(206) 555-7541', '(206) 555-7542', 
 NULL, '2400 Harbor Boulevard', 'Seattle', 'WA', '98104', 'USA', 
 '1965-03-18', 'Phone', 1),

(51, 26, 'Ms.', 'Angela', 'Cooper', 'Logistics Director', 'Operations', 'acooper@pacificshipping.com', '(206) 555-7543', '(206) 555-7544', 
 50, '2400 Harbor Boulevard', 'Seattle', 'WA', '98104', 'USA', 
 '1976-10-05', 'Email', 1),

-- Express Cargo Systems contacts
(52, 27, 'Mr.', 'Paul', 'Rogers', 'CEO', 'Executive', 'progers@expresscargo.com', '(901) 555-1595', '(901) 555-1596', 
 NULL, '2500 Freight Way', 'Memphis', 'TN', '38103', 'USA', 
 '1968-12-15', 'Mobile', 1),

(53, 27, 'Ms.', 'Samantha', 'Price', 'Fleet Manager', 'Operations', 'sprice@expresscargo.com', '(901) 555-1597', '(901) 555-1598', 
 52, '2500 Freight Way', 'Memphis', 'TN', '38103', 'USA', 
 '1979-08-28', 'Phone', 1),

-- Strategic Insights Consulting contacts
(54, 28, 'Ms.', 'Catherine', 'Lewis', 'CEO', 'Executive', 'clewis@strategicinsights.com', '(312) 555-9519', '(312) 555-9520', 
 NULL, '2600 Consulting Plaza', 'Chicago', 'IL', '60603', 'USA', 
 '1967-05-20', 'Email', 1),

(55, 28, 'Mr.', 'Eric', 'Chen', 'Senior Consultant', 'Consulting', 'echen@strategicinsights.com', '(312) 555-9521', '(312) 555-9522', 
 54, '2600 Consulting Plaza', 'Chicago', 'IL', '60603', 'USA', 
 '1978-02-17', 'Mobile', 1),

-- Innovation Advisory Group contacts
(56, 29, 'Mr.', 'Kevin', 'Murphy', 'CEO', 'Executive', 'kmurphy@innovationadvisory.com', '(212) 555-3581', '(212) 555-3582', 
 NULL, '2700 Advisor Avenue', 'New York', 'NY', '10022', 'USA', 
 '1969-11-08', 'Phone', 1),

(57, 29, 'Ms.', 'Melissa', 'Garcia', 'Strategy Director', 'Strategy', 'mgarcia@innovationadvisory.com', '(212) 555-3583', '(212) 555-3584', 
 56, '2700 Advisor Avenue', 'New York', 'NY', '10022', 'USA', 
 '1977-07-23', 'Email', 1),

-- Justice & Associates contacts
(58, 30, 'Mr.', 'Douglas', 'Barnes', 'Managing Partner', 'Executive', 'dbarnes@justicelaw.com', '(404) 555-7541', '(404) 555-7542', 
 NULL, '2800 Legal Parkway', 'Atlanta', 'GA', '30303', 'USA', 
 '1962-06-14', 'Email', 1),

(59, 30, 'Ms.', 'Rebecca', 'Hall', 'Senior Attorney', 'Legal', 'rhall@justicelaw.com', '(404) 555-7543', '(404) 555-7544', 
 58, '2800 Legal Parkway', 'Atlanta', 'GA', '30303', 'USA', 
 '1973-09-29', 'Phone', 1),

-- Heritage Properties Group contacts
(60, 32, 'Mr.', 'Alan', 'Green', 'CEO', 'Executive', 'agreen@heritageproperties.com', '(305) 555-9519', '(305) 555-9520', 
 NULL, '3000 Realty Drive', 'Miami', 'FL', '33132', 'USA', 
 '1965-08-12', 'Mobile', 1),

(61, 32, 'Ms.', 'Linda', 'Parker', 'Development Director', 'Development', 'lparker@heritageproperties.com', '(305) 555-9521', '(305) 555-9522', 
 60, '3000 Realty Drive', 'Miami', 'FL', '33132', 'USA', 
 '1976-02-28', 'Email', 1),

-- Transcontinental Partners contacts
(62, 34, 'Mr.', 'Richard', 'Hughes', 'CEO', 'Executive', 'rhughes@transcontinentalpartners.com', '+44 20 5555 1236', '+44 20 5555 1237', 
 NULL, '123 Global Avenue', 'London', '', 'EC2N 4AY', 'United Kingdom', 
 '1964-10-17', 'Email', 1),

(63, 34, 'Ms.', 'Elizabeth', 'Watson', 'International Director', 'International Relations', 'ewatson@transcontinentalpartners.com', '+44 20 5555 1238', '+44 20 5555 1239', 
 62, '123 Global Avenue', 'London', '', 'EC2N 4AY', 'United Kingdom', 
 '1975-05-03', 'Mobile', 1),

-- EuroTech Innovations contacts
(64, 35, 'Mr.', 'Stefan', 'Mueller', 'CEO', 'Executive', 'smueller@eurotechinnovations.com', '+49 30 5555 6791', '+49 30 5555 6792', 
 NULL, '456 Tech Strasse', 'Berlin', '', '10117', 'Germany', 
 '1968-04-21', 'Phone', 1),

(65, 35, 'Ms.', 'Anna', 'Schmidt', 'Innovation Director', 'R&D', 'aschmidt@eurotechinnovations.com', '+49 30 5555 6793', '+49 30 5555 6794', 
 64, '456 Tech Strasse', 'Berlin', '', '10117', 'Germany', 
 '1979-11-15', 'Email', 1);

SET IDENTITY_INSERT CRM.Contact OFF;

-- Now insert ContactRelationship records (different types of relationships)

-- Spousal relationships (bidirectional)
INSERT INTO CRM.ContactRelationship (PrimaryContactID, RelatedContactID, RelationshipTypeID, StartDate, EndDate, Notes, IsActive)
VALUES
-- Sarah Chen and Michael Patel are spouses
(2, 5, 3, '2015-06-12', NULL, 'Met at industry conference', 1)

-- Supervisor/Subordinate relationships
INSERT INTO CRM.ContactRelationship (PrimaryContactID, RelatedContactID, RelationshipTypeID, StartDate, EndDate, Notes, IsActive)
VALUES
-- James Wilson (CEO) supervises Sarah Chen (CTO)
(1, 2, 4, '2018-03-10', NULL, 'Direct reporting relationship', 1),

-- Sarah Chen (CTO) is subordinate to James Wilson (CEO)
(2, 1, 5, '2018-03-10', NULL, 'Direct reporting relationship', 1),

-- James Wilson (CEO) supervises David Rodriguez (CFO)
(1, 3, 4, '2019-01-15', NULL, 'Direct reporting relationship', 1),

-- David Rodriguez (CFO) is subordinate to James Wilson (CEO)
(3, 1, 5, '2019-01-15', NULL, 'Direct reporting relationship', 1),

-- Elizabeth Taylor (CEO) supervises Michael Patel (Research Director)
(4, 5, 4, '2017-05-22', NULL, 'Direct reporting relationship', 1),

-- Michael Patel (Research Director) is subordinate to Elizabeth Taylor (CEO)
(5, 4, 5, '2017-05-22', NULL, 'Direct reporting relationship', 1),

-- Elizabeth Taylor (CEO) supervises Jennifer Wong (VP Marketing)
(4, 6, 4, '2016-11-08', NULL, 'Direct reporting relationship', 1),

-- Jennifer Wong (VP Marketing) is subordinate to Elizabeth Taylor (CEO)
(6, 4, 5, '2016-11-08', NULL, 'Direct reporting relationship', 1);

-- Mentor/Mentee relationships
INSERT INTO CRM.ContactRelationship (PrimaryContactID, RelatedContactID, RelationshipTypeID, StartDate, EndDate, Notes, IsActive)
VALUES
-- Richard Brown (CEO) mentors Katherine Lee (CEO)
(13, 19, 9, '2020-02-15', NULL, 'Industry mentorship program', 1),

-- Katherine Lee (CEO) is mentee of Richard Brown (CEO)
(19, 13, 10, '2020-02-15', NULL, 'Industry mentorship program', 1),

-- William Thompson (CEO) mentors Brian Howard (CEO) 
(46, 48, 9, '2019-07-10', NULL, 'Energy sector leadership program', 1),

-- Brian Howard (CEO) is mentee of William Thompson (CEO)
(48, 46, 10, '2019-07-10', NULL, 'Energy sector leadership program', 1);

-- Friend relationships (bidirectional)
INSERT INTO CRM.ContactRelationship (PrimaryContactID, RelatedContactID, RelationshipTypeID, StartDate, EndDate, Notes, IsActive)
VALUES
-- Daniel Garcia and Christopher Young are friends
(9, 38, 6, '2017-09-05', NULL, 'Met at industry conference', 1),

-- Thomas Nelson and Richard Hughes are friends
(50, 62, 6, '2014-04-18', NULL, 'Former colleagues', 1),

-- James Wilson and Kevin Murphy are friends
(1, 56, 6, '2016-12-03', NULL, 'College roommates', 1),

-- Victoria Campbell and Karen Schmidt are friends
(47, 49, 6, '2018-08-22', NULL, 'Met through renewable energy alliance', 1);

-- Colleague relationships (bidirectional)
INSERT INTO CRM.ContactRelationship (PrimaryContactID, RelatedContactID, RelationshipTypeID, StartDate, EndDate, Notes, IsActive)
VALUES
-- William Kim and Michelle Turner are colleagues (worked together previously)
(12, 27, 8, '2015-10-30', '2019-05-15', 'Worked together at previous company', 1),

-- Robert Johnson and Mark Roberts are colleagues (industry collaboration)
(7, 32, 8, '2020-03-12', NULL, 'Industry cybersecurity collaboration', 1),

-- Nicole Walker and Sophia Rivera are colleagues (special project)
(29, 36, 8, '2021-06-19', NULL, 'Cross-industry innovation project', 1);

-- Sibling relationships (bidirectional)
INSERT INTO CRM.ContactRelationship (PrimaryContactID, RelatedContactID, RelationshipTypeID, StartDate, EndDate, Notes, IsActive)
VALUES
-- Laura Davis and Catherine Lewis are siblings
(24, 54, 7, '1969-07-22', NULL, 'Sisters', 1),

-- Richard Brown and Douglas Barnes are siblings
(13, 58, 7, '1962-06-14', NULL, 'Brothers', 1);

-- Parent/Child relationships
INSERT INTO CRM.ContactRelationship (PrimaryContactID, RelatedContactID, RelationshipTypeID, StartDate, EndDate, Notes, IsActive)
VALUES
-- Edward Morgan is parent of Brandon Scott (not actual parent, but mentor relationship tracked as parent/child)
(21, 23, 1, '2010-09-05', NULL, 'Mentorship tracked as parent/child relationship', 1),

-- Brandon Scott is child of Edward Morgan (not actual child, but mentee relationship tracked as parent/child)
(23, 21, 2, '2010-09-05', NULL, 'Mentorship tracked as parent/child relationship', 1);

-- Insert sample Activity records
INSERT INTO CRM.Activity (AccountID, ContactID, ActivityType, Subject, Description, StartDate, EndDate, Status, Priority, Direction, Location, Result)
VALUES
-- TechNova Systems activities
(1, 1, 'Meeting', 'Initial Sales Meeting', 'Discuss potential partnership opportunities', '2025-02-10 10:00:00', '2025-02-10 11:30:00', 'Completed', 'High', 'Outbound', 'Client Office', 'Positive reception, follow-up scheduled'),

(1, 2, 'Call', 'Technical Requirements Call', 'Review technical specifications and integration points', '2025-02-15 14:00:00', '2025-02-15 14:45:00', 'Completed', 'Medium', 'Outbound', NULL, 'Client needs additional information'),

(1, 3, 'Email', 'Proposal Follow-up', 'Send detailed pricing and implementation timeline', '2025-02-20 09:30:00', NULL, 'Completed', 'Medium', 'Outbound', NULL, 'Awaiting response'),

-- Quantum Computing Inc activities
(2, 4, 'Meeting', 'Quarterly Business Review', 'Review project progress and discuss next steps', '2025-03-05 13:00:00', '2025-03-05 15:00:00', 'Completed', 'High', 'Internal', 'Conference Room A', 'Action items assigned'),

(2, 5, 'Demo', 'Product Demonstration', 'Showcase new features and gather feedback', '2025-03-12 11:00:00', '2025-03-12 12:30:00', 'Completed', 'High', 'Outbound', 'Client Office', 'Client impressed, moving to next stage'),

-- CyberShield Solutions activities
(3, 7, 'Call', 'Security Assessment Call', 'Discuss security assessment findings', '2025-03-18 10:00:00', '2025-03-18 10:45:00', 'Completed', 'High', 'Outbound', NULL, 'Client will review report and respond'),

(3, 8, 'Email', 'Security Recommendations', 'Send detailed security improvement recommendations', '2025-03-20 16:30:00', NULL, 'Completed', 'Medium', 'Outbound', NULL, 'Awaiting client response'),

-- DataSphere Analytics activities
(4, 9, 'Meeting', 'Initial Consultation', 'Understand client needs and discuss potential solutions', '2025-04-03 09:00:00', '2025-04-03 10:30:00', 'Completed', 'Medium', 'Outbound', 'Virtual Meeting', 'Client interested in data analysis services'),

(4, 10, 'Email', 'Proposal Submission', 'Send formal proposal based on consultation', '2025-04-05 14:00:00', NULL, 'Completed', 'Medium', 'Outbound', NULL, 'Awaiting decision'),

-- CloudFusion Networks activities
(5, 11, 'Site Visit', 'Infrastructure Assessment', 'Evaluate current infrastructure and identify improvement areas', '2025-04-10 10:00:00', '2025-04-10 16:00:00', 'Completed', 'High', 'Outbound', 'Client Headquarters', 'Comprehensive assessment completed'),

(5, 12, 'Meeting', 'Findings Presentation', 'Present infrastructure assessment findings', '2025-04-15 13:30:00', '2025-04-15 15:00:00', 'Completed', 'High', 'Outbound', 'Client Conference Room', 'Client agrees with recommendations'),

-- MediLife Healthcare activities
(6, 13, 'Call', 'Partnership Discussion', 'Explore potential partnership opportunities', '2025-04-22 11:00:00', '2025-04-22 11:45:00', 'Completed', 'Medium', 'Inbound', NULL, 'Interested in further discussions'),

(6, 14, 'Meeting', 'Partnership Planning', 'Define partnership structure and objectives', '2025-04-28 14:00:00', '2025-04-28 16:00:00', 'Completed', 'High', 'Outbound', 'Our Office', 'Partnership framework established'),

-- Upcoming activities
(7, 15, 'Meeting', 'Contract Negotiation', 'Finalize contract terms and conditions', '2025-05-20 10:00:00', '2025-05-20 12:00:00', 'Planned', 'High', 'Outbound', 'Client Legal Department', NULL),

(8, 17, 'Call', 'Project Kickoff Planning', 'Discuss project kickoff details and timeline', '2025-05-18 14:30:00', '2025-05-18 15:15:00', 'Planned', 'Medium', 'Outbound', NULL, NULL),

(9, 19, 'Demo', 'New Platform Demo', 'Demonstrate new platform capabilities', '2025-05-22 13:00:00', '2025-05-22 14:30:00', 'Planned', 'High', 'Outbound', 'Client Innovation Lab', NULL),

(10, 21, 'Meeting', 'Investment Strategy Review', 'Review current investment strategy and adjust as needed', '2025-05-25 09:30:00', '2025-05-25 11:30:00', 'Planned', 'High', 'Outbound', 'Client Boardroom', NULL),

(11, 24, 'Site Visit', 'Branch Evaluation', 'Evaluate new branch location possibilities', '2025-05-27 10:00:00', '2025-05-27 16:00:00', 'Planned', 'Medium', 'Outbound', 'Potential New Locations', NULL),

-- Tasks
(12, 26, 'Task', 'Prepare Quarterly Analysis', 'Create detailed analysis of quarterly performance', '2025-05-15 09:00:00', '2025-05-17 17:00:00', 'In Progress', 'High', 'Internal', NULL, NULL),

(13, 28, 'Task', 'Update Client Presentation', 'Refresh presentation with latest market data', '2025-05-16 13:00:00', '2025-05-16 17:00:00', 'In Progress', 'Medium', 'Internal', NULL, NULL),

-- Notes
(14, 30, 'Note', 'Client Feedback Summary', 'Compiled feedback from recent client interactions', '2025-05-10 15:30:00', NULL, 'Completed', 'Low', 'Internal', NULL, 'Feedback documented for product team'),

(15, 32, 'Note', 'Competitive Analysis Notes', 'Notes on competitor''s new product release', '2025-05-12 11:45:00', NULL, 'Completed', 'Medium', 'Internal', NULL, 'Shared with product development team');

-- Sample query to verify data has been inserted correctly
SELECT 'Industry' AS TableName, COUNT(*) AS RecordCount FROM CRM.Industry
UNION ALL
SELECT 'AccountType' AS TableName, COUNT(*) AS RecordCount FROM CRM.AccountType
UNION ALL
SELECT 'AccountStatus' AS TableName, COUNT(*) AS RecordCount FROM CRM.AccountStatus
UNION ALL
SELECT 'ActivityType' AS TableName, COUNT(*) AS RecordCount FROM CRM.ActivityType
UNION ALL
SELECT 'Activity' As TableName, COUNT(*) AS RecordCount FROM CRM.Activity
UNION ALL
SELECT 'Contacts' As TableName, COUNT(*) AS RecordCount FROM CRM.Contact
UNION ALL
SELECT 'Contact Relationships' As TableName, COUNT(*) AS RecordCount FROM CRM.ContactRelationship
UNION ALL
SELECT 'Accounts' As TableName, COUNT(*) AS RecordCount FROM CRM.Account;
