-- AI Model Cost Tracking Schema
-- Creates tables for tracking AI model pricing across vendors with temporal support
-- All tables created in __mj schema to align with existing MJ platform structure

-- =====================================================
-- AIModelPriceType Table
-- =====================================================
CREATE TABLE __mj.AIModelPriceType (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(500) NULL,
    
    CONSTRAINT chk_AIModelPriceType_Name CHECK (LEN(LTRIM(RTRIM(Name))) > 0),
    CONSTRAINT uq_AIModelPriceType_Name UNIQUE (Name)
);

-- =====================================================
-- AIModelPriceUnitType Table  
-- =====================================================
CREATE TABLE __mj.AIModelPriceUnitType (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(500) NULL,
    DriverClass NVARCHAR(200) NOT NULL,
    
    CONSTRAINT chk_AIModelPriceUnitType_Name CHECK (LEN(LTRIM(RTRIM(Name))) > 0),
    CONSTRAINT chk_AIModelPriceUnitType_DriverClass CHECK (LEN(LTRIM(RTRIM(DriverClass))) > 0),
    CONSTRAINT uq_AIModelPriceUnitType_Name UNIQUE (Name),
    CONSTRAINT uq_AIModelPriceUnitType_DriverClass UNIQUE (DriverClass)
);

-- =====================================================
-- AIModelCost Table
-- =====================================================
CREATE TABLE __mj.AIModelCost (
    ID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    ModelID UNIQUEIDENTIFIER NOT NULL,
    VendorID UNIQUEIDENTIFIER NOT NULL,
    StartedAt DATETIMEOFFSET(7) NULL DEFAULT SYSDATETIMEOFFSET(),
    EndedAt DATETIMEOFFSET(7) NULL,
    Status NVARCHAR(20) NOT NULL,
    Currency NCHAR(3) NOT NULL,
    PriceTypeID UNIQUEIDENTIFIER NOT NULL,
    InputPricePerUnit DECIMAL(18,8) NOT NULL,
    OutputPricePerUnit DECIMAL(18,8) NOT NULL,
    UnitTypeID UNIQUEIDENTIFIER NOT NULL,
    ProcessingType NVARCHAR(20) NOT NULL,
    Comments NVARCHAR(1000) NULL,
    
    -- Check Constraints
    CONSTRAINT chk_AIModelCost_Status CHECK (Status IN ('Active', 'Pending', 'Expired', 'Invalid')),
    CONSTRAINT chk_AIModelCost_Currency CHECK (LEN(Currency) = 3 AND Currency = UPPER(Currency)),
    CONSTRAINT chk_AIModelCost_ProcessingType CHECK (ProcessingType IN ('Realtime', 'Batch')),
    CONSTRAINT chk_AIModelCost_InputPrice CHECK (InputPricePerUnit >= 0),
    CONSTRAINT chk_AIModelCost_OutputPrice CHECK (OutputPricePerUnit >= 0),
    CONSTRAINT chk_AIModelCost_DateRange CHECK (EndedAt IS NULL OR StartedAt IS NULL OR EndedAt > StartedAt),
    
    -- Foreign Keys
    CONSTRAINT fk_AIModelCost_ModelID FOREIGN KEY (ModelID) REFERENCES __mj.AIModel(ID),
    CONSTRAINT fk_AIModelCost_VendorID FOREIGN KEY (VendorID) REFERENCES __mj.AIVendor(ID),
    CONSTRAINT fk_AIModelCost_PriceTypeID FOREIGN KEY (PriceTypeID) REFERENCES __mj.AIModelPriceType(ID),
    CONSTRAINT fk_AIModelCost_UnitTypeID FOREIGN KEY (UnitTypeID) REFERENCES __mj.AIModelPriceUnitType(ID)
);

-- =====================================================
-- Extended Properties Documentation
-- =====================================================

-- AIModelPriceType Table Documentation
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Defines the different types of pricing metrics used by AI model vendors (e.g., Tokens, Minutes, Characters, API Calls)',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIModelPriceType';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Short, descriptive name for the price type (e.g., "Tokens", "Minutes", "Characters")',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIModelPriceType',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Detailed description of what this price type represents and how it is measured',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIModelPriceType',
    @level2type = N'COLUMN', @level2name = N'Description';

-- AIModelPriceUnitType Table Documentation
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Defines the unit scales used for pricing (e.g., Per 1M Tokens, Per 1K Tokens, Per Minute). Includes driver class for normalization calculations',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIModelPriceUnitType';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Display name for the pricing unit (e.g., "Per 1M Tokens", "Per 1K Tokens", "Per Minute")',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIModelPriceUnitType',
    @level2type = N'COLUMN', @level2name = N'Name';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Detailed explanation of the unit scale and any special considerations for this pricing unit',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIModelPriceUnitType',
    @level2type = N'COLUMN', @level2name = N'Description';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Fully qualified class name that handles cost calculations and unit normalization for this pricing unit (e.g., "TokenPer1M", "TokenPer1K")',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIModelPriceUnitType',
    @level2type = N'COLUMN', @level2name = N'DriverClass';

-- AIModelCost Table Documentation
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Stores historical and current pricing information for AI models across different vendors, with optional temporal tracking and support for different processing types',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIModelCost';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Date and time with timezone when this pricing became effective. NULL disables temporal tracking. Defaults to current UTC time when record is created',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIModelCost',
    @level2type = N'COLUMN', @level2name = N'StartedAt';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Date and time with timezone when this pricing expired or will expire. NULL indicates currently active pricing',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIModelCost',
    @level2type = N'COLUMN', @level2name = N'EndedAt';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Current status of this pricing record. Active=currently in use, Pending=scheduled for future, Expired=no longer valid, Invalid=data error',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIModelCost',
    @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'ISO 4217 three-letter currency code (e.g., USD, EUR, GBP) in uppercase',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIModelCost',
    @level2type = N'COLUMN', @level2name = N'Currency';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Price per unit for input tokens/requests. Must be non-negative. Precision allows for micro-pricing scenarios',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIModelCost',
    @level2type = N'COLUMN', @level2name = N'InputPricePerUnit';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Price per unit for output tokens/responses. Must be non-negative. Often higher than input pricing',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIModelCost',
    @level2type = N'COLUMN', @level2name = N'OutputPricePerUnit';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Processing method that affects pricing. Realtime=immediate response, Batch=delayed processing often with discounts',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIModelCost',
    @level2type = N'COLUMN', @level2name = N'ProcessingType';

EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Optional notes about pricing context, source, special conditions, or vendor-specific details',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'AIModelCost',
    @level2type = N'COLUMN', @level2name = N'Comments';