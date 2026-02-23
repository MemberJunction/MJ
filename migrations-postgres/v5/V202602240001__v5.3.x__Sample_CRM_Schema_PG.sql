/* ============================================================================ */ /* Sample CRM Schema for PostgreSQL Parity Testing */ /* ============================================================================ */ /* Purpose: Creates a realistic CRM application schema with 12 tables to */ /*          validate that MemberJunction produces identical results whether */ /*          backed by SQL Server or PostgreSQL. */ /* Schema:  sample_crm */ /* Tables:  Company, Contact, Deal, Activity, Product, DealProduct, */ /*          Tag, CompanyTag, ContactTag, DealTag, Pipeline, PipelineStage */ /* ============================================================================ */ /* Register the schema */
CREATE SCHEMA sample_crm;

/* Register in SchemaInfo so CodeGen discovers it */
INSERT INTO "${flyway:defaultSchema}"."SchemaInfo" (
  "ID",
  "SchemaName",
  "EntityIDMin",
  "EntityIDMax",
  "Comments",
  "Description"
)
VALUES
  (
    'A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
    'sample_crm',
    2000001,
    3000000,
    'Sample CRM schema for PostgreSQL parity testing',
    'A realistic CRM application schema used to validate cross-database parity between SQL Server and PostgreSQL.'
  );

/* ============================================================================ */ /* 1. Company */ /* ============================================================================ */
CREATE TABLE "sample_crm"."Company" (
  "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
  "Name" VARCHAR(200) NOT NULL,
  "Industry" VARCHAR(100) NULL,
  "Website" VARCHAR(500) NULL,
  "Phone" VARCHAR(50) NULL,
  "AnnualRevenue" DECIMAL(18, 2) NULL,
  "EmployeeCount" INT NULL,
  "Status" VARCHAR(20) NOT NULL CONSTRAINT "CK_Company_Status" CHECK ("Status" IN ('Active', 'Inactive', 'Prospect', 'Churned')),
  "Notes" TEXT NULL,
  "CreatedByUserID" UUID NULL REFERENCES "${flyway:defaultSchema}"."User" (
    "ID"
  ),
  CONSTRAINT "PK_Company" PRIMARY KEY ("ID")
);

/* Company extended properties */
COMMENT ON TABLE sample_crm."Company" IS 'Organizations that are customers, prospects, or partners';

COMMENT ON COLUMN sample_crm."Company"."ID" IS 'Primary key for the company record';

COMMENT ON COLUMN sample_crm."Company"."Name" IS 'Legal or trading name of the company';

COMMENT ON COLUMN sample_crm."Company"."Industry" IS 'Industry vertical the company operates in';

COMMENT ON COLUMN sample_crm."Company"."Website" IS 'Company website URL';

COMMENT ON COLUMN sample_crm."Company"."Phone" IS 'Main phone number';

COMMENT ON COLUMN sample_crm."Company"."AnnualRevenue" IS 'Estimated annual revenue in USD';

COMMENT ON COLUMN sample_crm."Company"."EmployeeCount" IS 'Approximate number of employees';

COMMENT ON COLUMN sample_crm."Company"."Status" IS 'Current relationship status: Active, Inactive, Prospect, or Churned';

COMMENT ON COLUMN sample_crm."Company"."Notes" IS 'Free-form notes about the company';

COMMENT ON COLUMN sample_crm."Company"."CreatedByUserID" IS 'User who created this company record';

/* ============================================================================ */ /* 2. Contact */ /* ============================================================================ */
CREATE TABLE "sample_crm"."Contact" (
  "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
  "CompanyID" UUID NOT NULL REFERENCES "sample_crm"."Company" (
    "ID"
  ),
  "FirstName" VARCHAR(100) NOT NULL,
  "LastName" VARCHAR(100) NOT NULL,
  "Email" VARCHAR(200) NULL,
  "Phone" VARCHAR(50) NULL,
  "Title" VARCHAR(100) NULL,
  "Department" VARCHAR(100) NULL,
  "ReportsToContactID" UUID NULL REFERENCES "sample_crm"."Contact" (
    "ID"
  ),
  "IsPrimary" BOOLEAN NOT NULL DEFAULT false,
  "Status" VARCHAR(20) NOT NULL CONSTRAINT "CK_Contact_Status" CHECK ("Status" IN ('Active', 'Inactive', 'Prospect', 'Churned')),
  "Notes" TEXT NULL,
  "CreatedByUserID" UUID NULL REFERENCES "${flyway:defaultSchema}"."User" (
    "ID"
  ),
  CONSTRAINT "PK_Contact" PRIMARY KEY ("ID")
);

/* Contact extended properties */
COMMENT ON TABLE sample_crm."Contact" IS 'Individual people associated with companies';

COMMENT ON COLUMN sample_crm."Contact"."ID" IS 'Primary key for the contact record';

COMMENT ON COLUMN sample_crm."Contact"."CompanyID" IS 'Company this contact belongs to';

COMMENT ON COLUMN sample_crm."Contact"."FirstName" IS 'Contact first name';

COMMENT ON COLUMN sample_crm."Contact"."LastName" IS 'Contact last name';

COMMENT ON COLUMN sample_crm."Contact"."Email" IS 'Email address';

COMMENT ON COLUMN sample_crm."Contact"."Phone" IS 'Direct phone number';

COMMENT ON COLUMN sample_crm."Contact"."Title" IS 'Job title';

COMMENT ON COLUMN sample_crm."Contact"."Department" IS 'Department within the company';

COMMENT ON COLUMN sample_crm."Contact"."ReportsToContactID" IS 'Self-referential FK to the contact this person reports to';

COMMENT ON COLUMN sample_crm."Contact"."IsPrimary" IS 'Whether this is the primary contact for the company';

COMMENT ON COLUMN sample_crm."Contact"."Status" IS 'Current status: Active, Inactive, Prospect, or Churned';

COMMENT ON COLUMN sample_crm."Contact"."Notes" IS 'Free-form notes about the contact';

COMMENT ON COLUMN sample_crm."Contact"."CreatedByUserID" IS 'User who created this contact record';

/* ============================================================================ */ /* 3. Deal */ /* ============================================================================ */
CREATE TABLE "sample_crm"."Deal" (
  "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
  "CompanyID" UUID NOT NULL REFERENCES "sample_crm"."Company" (
    "ID"
  ),
  "ContactID" UUID NOT NULL REFERENCES "sample_crm"."Contact" (
    "ID"
  ),
  "Name" VARCHAR(200) NOT NULL,
  "Amount" DECIMAL(18, 2) NULL,
  "Stage" VARCHAR(50) NOT NULL CONSTRAINT "CK_Deal_Stage" CHECK ("Stage" IN ('Lead', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost')),
  "Probability" INT NULL CONSTRAINT "CK_Deal_Probability" CHECK ("Probability" >= 0 AND "Probability" <= 100),
  "ExpectedCloseDate" TIMESTAMP NULL,
  "ActualCloseDate" TIMESTAMP NULL,
  "AssignedToUserID" UUID NULL REFERENCES "${flyway:defaultSchema}"."User" (
    "ID"
  ),
  "Notes" TEXT NULL,
  "CreatedByUserID" UUID NULL REFERENCES "${flyway:defaultSchema}"."User" (
    "ID"
  ),
  CONSTRAINT "PK_Deal" PRIMARY KEY ("ID")
);

/* Deal extended properties */
COMMENT ON TABLE sample_crm."Deal" IS 'Sales opportunities being pursued with companies';

COMMENT ON COLUMN sample_crm."Deal"."ID" IS 'Primary key for the deal record';

COMMENT ON COLUMN sample_crm."Deal"."CompanyID" IS 'Company this deal is associated with';

COMMENT ON COLUMN sample_crm."Deal"."ContactID" IS 'Primary contact for this deal';

COMMENT ON COLUMN sample_crm."Deal"."Name" IS 'Short name or title of the deal';

COMMENT ON COLUMN sample_crm."Deal"."Amount" IS 'Total deal value in USD';

COMMENT ON COLUMN sample_crm."Deal"."Stage" IS 'Current sales stage: Lead, Qualified, Proposal, Negotiation, Closed Won, or Closed Lost';

COMMENT ON COLUMN sample_crm."Deal"."Probability" IS 'Win probability percentage from 0 to 100';

COMMENT ON COLUMN sample_crm."Deal"."ExpectedCloseDate" IS 'Projected close date';

COMMENT ON COLUMN sample_crm."Deal"."ActualCloseDate" IS 'Date the deal was actually closed, null if still open';

COMMENT ON COLUMN sample_crm."Deal"."AssignedToUserID" IS 'Sales rep assigned to this deal';

COMMENT ON COLUMN sample_crm."Deal"."Notes" IS 'Free-form notes about the deal';

COMMENT ON COLUMN sample_crm."Deal"."CreatedByUserID" IS 'User who created this deal record';

/* ============================================================================ */ /* 4. Activity */ /* ============================================================================ */
CREATE TABLE "sample_crm"."Activity" (
  "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
  "Type" VARCHAR(20) NOT NULL CONSTRAINT "CK_Activity_Type" CHECK ("Type" IN ('Call', 'Email', 'Meeting', 'Note', 'Task')),
  "Subject" VARCHAR(500) NOT NULL,
  "Description" TEXT NULL,
  "ActivityDate" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
  "DurationMinutes" INT NULL,
  "CompanyID" UUID NULL REFERENCES "sample_crm"."Company" (
    "ID"
  ),
  "ContactID" UUID NULL REFERENCES "sample_crm"."Contact" (
    "ID"
  ),
  "DealID" UUID NULL REFERENCES "sample_crm"."Deal" (
    "ID"
  ),
  "CompletedAt" TIMESTAMP NULL,
  "CreatedByUserID" UUID NULL REFERENCES "${flyway:defaultSchema}"."User" (
    "ID"
  ),
  CONSTRAINT "PK_Activity" PRIMARY KEY ("ID")
);

/* Activity extended properties */
COMMENT ON TABLE sample_crm."Activity" IS 'Interactions and tasks related to CRM entities such as calls, emails, meetings, notes, and tasks';

COMMENT ON COLUMN sample_crm."Activity"."ID" IS 'Primary key for the activity record';

COMMENT ON COLUMN sample_crm."Activity"."Type" IS 'Activity type: Call, Email, Meeting, Note, or Task';

COMMENT ON COLUMN sample_crm."Activity"."Subject" IS 'Brief subject line for the activity';

COMMENT ON COLUMN sample_crm."Activity"."Description" IS 'Detailed description or body of the activity';

COMMENT ON COLUMN sample_crm."Activity"."ActivityDate" IS 'When the activity occurred or is scheduled';

COMMENT ON COLUMN sample_crm."Activity"."DurationMinutes" IS 'Duration of the activity in minutes';

COMMENT ON COLUMN sample_crm."Activity"."CompanyID" IS 'Optional link to a company';

COMMENT ON COLUMN sample_crm."Activity"."ContactID" IS 'Optional link to a contact';

COMMENT ON COLUMN sample_crm."Activity"."DealID" IS 'Optional link to a deal';

COMMENT ON COLUMN sample_crm."Activity"."CompletedAt" IS 'Timestamp when the activity was completed, null if pending';

COMMENT ON COLUMN sample_crm."Activity"."CreatedByUserID" IS 'User who created this activity record';

/* ============================================================================ */ /* 5. Product */ /* ============================================================================ */
CREATE TABLE "sample_crm"."Product" (
  "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
  "Name" VARCHAR(200) NOT NULL,
  "SKU" VARCHAR(50) NULL,
  "Description" TEXT NULL,
  "UnitPrice" DECIMAL(18, 2) NOT NULL,
  "IsActive" BOOLEAN NOT NULL DEFAULT true,
  "Category" VARCHAR(100) NULL,
  CONSTRAINT "PK_Product" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_Product_SKU" UNIQUE (
    "SKU"
  )
);

/* Product extended properties */
COMMENT ON TABLE sample_crm."Product" IS 'Products and services available for sale in deals';

COMMENT ON COLUMN sample_crm."Product"."ID" IS 'Primary key for the product record';

COMMENT ON COLUMN sample_crm."Product"."Name" IS 'Product display name';

COMMENT ON COLUMN sample_crm."Product"."SKU" IS 'Stock keeping unit, unique product identifier';

COMMENT ON COLUMN sample_crm."Product"."Description" IS 'Detailed product description';

COMMENT ON COLUMN sample_crm."Product"."UnitPrice" IS 'Standard unit price in USD';

COMMENT ON COLUMN sample_crm."Product"."IsActive" IS 'Whether the product is currently available for sale';

COMMENT ON COLUMN sample_crm."Product"."Category" IS 'Product category for grouping and filtering';

/* ============================================================================ */ /* 6. DealProduct */ /* ============================================================================ */
CREATE TABLE "sample_crm"."DealProduct" (
  "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
  "DealID" UUID NOT NULL REFERENCES "sample_crm"."Deal" (
    "ID"
  ),
  "ProductID" UUID NOT NULL REFERENCES "sample_crm"."Product" (
    "ID"
  ),
  "Quantity" INT NOT NULL DEFAULT 1,
  "UnitPrice" DECIMAL(18, 2) NOT NULL,
  "Discount" DECIMAL(5, 2) NOT NULL DEFAULT 0 CONSTRAINT "CK_DealProduct_Discount" CHECK ("Discount" >= 0 AND "Discount" <= 100),
  CONSTRAINT "PK_DealProduct" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_DealProduct" UNIQUE (
    "DealID",
    "ProductID"
  )
);

/* DealProduct extended properties */
COMMENT ON TABLE sample_crm."DealProduct" IS 'Junction table linking products to deals with pricing and quantity details';

COMMENT ON COLUMN sample_crm."DealProduct"."ID" IS 'Primary key for the deal-product link';

COMMENT ON COLUMN sample_crm."DealProduct"."DealID" IS 'Deal this product is part of';

COMMENT ON COLUMN sample_crm."DealProduct"."ProductID" IS 'Product being sold in this deal';

COMMENT ON COLUMN sample_crm."DealProduct"."Quantity" IS 'Number of units included in the deal';

COMMENT ON COLUMN sample_crm."DealProduct"."UnitPrice" IS 'Price per unit for this deal, may differ from catalog price';

COMMENT ON COLUMN sample_crm."DealProduct"."Discount" IS 'Discount percentage from 0 to 100';

/* ============================================================================ */ /* 7. Tag */ /* ============================================================================ */
CREATE TABLE "sample_crm"."Tag" (
  "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
  "Name" VARCHAR(100) NOT NULL,
  "Color" VARCHAR(7) NULL,
  CONSTRAINT "PK_Tag" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_Tag_Name" UNIQUE (
    "Name"
  )
);

COMMENT ON TABLE sample_crm."Tag" IS 'Labels for categorizing and filtering CRM records';

COMMENT ON COLUMN sample_crm."Tag"."ID" IS 'Primary key for the tag';

COMMENT ON COLUMN sample_crm."Tag"."Name" IS 'Display name of the tag, must be unique';

COMMENT ON COLUMN sample_crm."Tag"."Color" IS 'Hex color code for visual display, e.g. #FF5733';

/* ============================================================================ */ /* 8. CompanyTag */ /* ============================================================================ */
CREATE TABLE "sample_crm"."CompanyTag" (
  "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
  "CompanyID" UUID NOT NULL REFERENCES "sample_crm"."Company" (
    "ID"
  ),
  "TagID" UUID NOT NULL REFERENCES "sample_crm"."Tag" (
    "ID"
  ),
  CONSTRAINT "PK_CompanyTag" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_CompanyTag" UNIQUE (
    "CompanyID",
    "TagID"
  )
);

COMMENT ON TABLE sample_crm."CompanyTag" IS 'Junction table linking tags to companies';

COMMENT ON COLUMN sample_crm."CompanyTag"."ID" IS 'Primary key';

COMMENT ON COLUMN sample_crm."CompanyTag"."CompanyID" IS 'The company being tagged';

COMMENT ON COLUMN sample_crm."CompanyTag"."TagID" IS 'The tag applied to the company';

/* ============================================================================ */ /* 9. ContactTag */ /* ============================================================================ */
CREATE TABLE "sample_crm"."ContactTag" (
  "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ContactID" UUID NOT NULL REFERENCES "sample_crm"."Contact" (
    "ID"
  ),
  "TagID" UUID NOT NULL REFERENCES "sample_crm"."Tag" (
    "ID"
  ),
  CONSTRAINT "PK_ContactTag" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_ContactTag" UNIQUE (
    "ContactID",
    "TagID"
  )
);

COMMENT ON TABLE sample_crm."ContactTag" IS 'Junction table linking tags to contacts';

COMMENT ON COLUMN sample_crm."ContactTag"."ID" IS 'Primary key';

COMMENT ON COLUMN sample_crm."ContactTag"."ContactID" IS 'The contact being tagged';

COMMENT ON COLUMN sample_crm."ContactTag"."TagID" IS 'The tag applied to the contact';

/* ============================================================================ */ /* 10. DealTag */ /* ============================================================================ */
CREATE TABLE "sample_crm"."DealTag" (
  "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
  "DealID" UUID NOT NULL REFERENCES "sample_crm"."Deal" (
    "ID"
  ),
  "TagID" UUID NOT NULL REFERENCES "sample_crm"."Tag" (
    "ID"
  ),
  CONSTRAINT "PK_DealTag" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_DealTag" UNIQUE (
    "DealID",
    "TagID"
  )
);

COMMENT ON TABLE sample_crm."DealTag" IS 'Junction table linking tags to deals';

COMMENT ON COLUMN sample_crm."DealTag"."ID" IS 'Primary key';

COMMENT ON COLUMN sample_crm."DealTag"."DealID" IS 'The deal being tagged';

COMMENT ON COLUMN sample_crm."DealTag"."TagID" IS 'The tag applied to the deal';

/* ============================================================================ */ /* 11. Pipeline */ /* ============================================================================ */
CREATE TABLE "sample_crm"."Pipeline" (
  "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
  "Name" VARCHAR(200) NOT NULL,
  "Description" TEXT NULL,
  "IsDefault" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "PK_Pipeline" PRIMARY KEY ("ID")
);

COMMENT ON TABLE sample_crm."Pipeline" IS 'Sales pipelines defining the stages deals progress through';

COMMENT ON COLUMN sample_crm."Pipeline"."ID" IS 'Primary key for the pipeline';

COMMENT ON COLUMN sample_crm."Pipeline"."Name" IS 'Display name of the pipeline';

COMMENT ON COLUMN sample_crm."Pipeline"."Description" IS 'Description of the pipeline purpose and usage';

COMMENT ON COLUMN sample_crm."Pipeline"."IsDefault" IS 'Whether this is the default pipeline for new deals';

/* ============================================================================ */ /* 12. PipelineStage */ /* ============================================================================ */
CREATE TABLE "sample_crm"."PipelineStage" (
  "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
  "PipelineID" UUID NOT NULL REFERENCES "sample_crm"."Pipeline" (
    "ID"
  ),
  "Name" VARCHAR(100) NOT NULL,
  "DisplayOrder" INT NOT NULL,
  "Probability" INT NOT NULL DEFAULT 0 CONSTRAINT "CK_PipelineStage_Probability" CHECK ("Probability" >= 0 AND "Probability" <= 100),
  CONSTRAINT "PK_PipelineStage" PRIMARY KEY ("ID"),
  CONSTRAINT "UQ_PipelineStage" UNIQUE (
    "PipelineID",
    "Name"
  )
);

COMMENT ON TABLE sample_crm."PipelineStage" IS 'Ordered stages within a sales pipeline';

COMMENT ON COLUMN sample_crm."PipelineStage"."ID" IS 'Primary key for the pipeline stage';

COMMENT ON COLUMN sample_crm."PipelineStage"."PipelineID" IS 'Pipeline this stage belongs to';

COMMENT ON COLUMN sample_crm."PipelineStage"."Name" IS 'Stage display name';

COMMENT ON COLUMN sample_crm."PipelineStage"."DisplayOrder" IS 'Ordering position within the pipeline, lower numbers appear first';

COMMENT ON COLUMN sample_crm."PipelineStage"."Probability" IS 'Default win probability percentage for deals entering this stage';

/* ============================================================================ */ /* SEED DATA */ /* ============================================================================ */ /* All UUIDs are hardcoded for deterministic, reproducible testing. */ /* Companies (5) */
INSERT INTO "sample_crm"."Company" (
  "ID",
  "Name",
  "Industry",
  "Website",
  "Phone",
  "AnnualRevenue",
  "EmployeeCount",
  "Status",
  "Notes"
)
VALUES
  (
    '10000001-0001-0001-0001-000000000001',
    'Acme Corporation',
    'Manufacturing',
    'https://acme.example.com',
    '+1-555-0101',
    50000000.00,
    500,
    'Active',
    'Long-standing customer since 2018'
  ),
  (
    '10000001-0001-0001-0001-000000000002',
    'Globex Industries',
    'Technology',
    'https://globex.example.com',
    '+1-555-0102',
    120000000.00,
    2000,
    'Active',
    'Enterprise account, multi-year contract'
  ),
  (
    '10000001-0001-0001-0001-000000000003',
    'Initech Solutions',
    'Consulting',
    'https://initech.example.com',
    '+1-555-0103',
    15000000.00,
    150,
    'Prospect',
    'Initial discovery call completed'
  ),
  (
    '10000001-0001-0001-0001-000000000004',
    'Umbrella Health',
    'Healthcare',
    'https://umbrella.example.com',
    '+1-555-0104',
    80000000.00,
    1200,
    'Active',
    'Key account in healthcare vertical'
  ),
  (
    '10000001-0001-0001-0001-000000000005',
    'Stark Renewable',
    'Energy',
    'https://stark.example.com',
    '+1-555-0105',
    200000000.00,
    5000,
    'Inactive',
    'Paused engagement, revisit Q3'
  );

/* Contacts (10) */
INSERT INTO "sample_crm"."Contact" (
  "ID",
  "CompanyID",
  "FirstName",
  "LastName",
  "Email",
  "Phone",
  "Title",
  "Department",
  "ReportsToContactID",
  "IsPrimary",
  "Status"
)
VALUES
  (
    '20000001-0001-0001-0001-000000000001',
    '10000001-0001-0001-0001-000000000001',
    'Alice',
    'Johnson',
    'alice.johnson@acme.example.com',
    '+1-555-1001',
    'VP of Engineering',
    'Engineering',
    NULL,
    true,
    'Active'
  ),
  (
    '20000001-0001-0001-0001-000000000002',
    '10000001-0001-0001-0001-000000000001',
    'Bob',
    'Smith',
    'bob.smith@acme.example.com',
    '+1-555-1002',
    'Director of IT',
    'IT',
    '20000001-0001-0001-0001-000000000001',
    false,
    'Active'
  ),
  (
    '20000001-0001-0001-0001-000000000003',
    '10000001-0001-0001-0001-000000000002',
    'Carol',
    'Williams',
    'carol.williams@globex.example.com',
    '+1-555-1003',
    'CTO',
    'Technology',
    NULL,
    true,
    'Active'
  ),
  (
    '20000001-0001-0001-0001-000000000004',
    '10000001-0001-0001-0001-000000000002',
    'David',
    'Brown',
    'david.brown@globex.example.com',
    '+1-555-1004',
    'Senior Architect',
    'Technology',
    '20000001-0001-0001-0001-000000000003',
    false,
    'Active'
  ),
  (
    '20000001-0001-0001-0001-000000000005',
    '10000001-0001-0001-0001-000000000002',
    'Emma',
    'Davis',
    'emma.davis@globex.example.com',
    '+1-555-1005',
    'Procurement Manager',
    'Procurement',
    NULL,
    false,
    'Active'
  ),
  (
    '20000001-0001-0001-0001-000000000006',
    '10000001-0001-0001-0001-000000000003',
    'Frank',
    'Miller',
    'frank.miller@initech.example.com',
    '+1-555-1006',
    'CEO',
    'Executive',
    NULL,
    true,
    'Prospect'
  ),
  (
    '20000001-0001-0001-0001-000000000007',
    '10000001-0001-0001-0001-000000000003',
    'Grace',
    'Wilson',
    'grace.wilson@initech.example.com',
    '+1-555-1007',
    'Head of Operations',
    'Operations',
    '20000001-0001-0001-0001-000000000006',
    false,
    'Prospect'
  ),
  (
    '20000001-0001-0001-0001-000000000008',
    '10000001-0001-0001-0001-000000000004',
    'Henry',
    'Taylor',
    'henry.taylor@umbrella.example.com',
    '+1-555-1008',
    'Chief Medical Officer',
    'Medical',
    NULL,
    true,
    'Active'
  ),
  (
    '20000001-0001-0001-0001-000000000009',
    '10000001-0001-0001-0001-000000000004',
    'Ivy',
    'Anderson',
    'ivy.anderson@umbrella.example.com',
    '+1-555-1009',
    'IT Director',
    'IT',
    NULL,
    false,
    'Active'
  ),
  (
    '20000001-0001-0001-0001-000000000010',
    '10000001-0001-0001-0001-000000000005',
    'Jack',
    'Thomas',
    'jack.thomas@stark.example.com',
    '+1-555-1010',
    'VP of Partnerships',
    'Business Dev',
    NULL,
    true,
    'Inactive'
  );

/* Deals (6) */
INSERT INTO "sample_crm"."Deal" (
  "ID",
  "CompanyID",
  "ContactID",
  "Name",
  "Amount",
  "Stage",
  "Probability",
  "ExpectedCloseDate",
  "ActualCloseDate",
  "Notes"
)
VALUES
  (
    '30000001-0001-0001-0001-000000000001',
    '10000001-0001-0001-0001-000000000001',
    '20000001-0001-0001-0001-000000000001',
    'Acme Platform Upgrade',
    250000.00,
    'Negotiation',
    75,
    '2026-04-15',
    NULL,
    'Final pricing under review'
  ),
  (
    '30000001-0001-0001-0001-000000000002',
    '10000001-0001-0001-0001-000000000002',
    '20000001-0001-0001-0001-000000000003',
    'Globex Enterprise License',
    1200000.00,
    'Closed Won',
    100,
    '2026-01-30',
    '2026-01-28',
    'Multi-year enterprise agreement signed'
  ),
  (
    '30000001-0001-0001-0001-000000000003',
    '10000001-0001-0001-0001-000000000002',
    '20000001-0001-0001-0001-000000000005',
    'Globex Add-On Services',
    180000.00,
    'Proposal',
    50,
    '2026-05-01',
    NULL,
    'Scope being finalized'
  ),
  (
    '30000001-0001-0001-0001-000000000004',
    '10000001-0001-0001-0001-000000000003',
    '20000001-0001-0001-0001-000000000006',
    'Initech Discovery Package',
    75000.00,
    'Qualified',
    30,
    '2026-06-30',
    NULL,
    'Initial assessment phase'
  ),
  (
    '30000001-0001-0001-0001-000000000005',
    '10000001-0001-0001-0001-000000000004',
    '20000001-0001-0001-0001-000000000008',
    'Umbrella Data Integration',
    500000.00,
    'Proposal',
    60,
    '2026-03-31',
    NULL,
    'Technical POC in progress'
  ),
  (
    '30000001-0001-0001-0001-000000000006',
    '10000001-0001-0001-0001-000000000005',
    '20000001-0001-0001-0001-000000000010',
    'Stark Renewal FY2026',
    350000.00,
    'Closed Lost',
    0,
    '2026-02-01',
    '2026-02-05',
    'Lost to competitor, price sensitivity'
  );

/* Products (5) */
INSERT INTO "sample_crm"."Product" (
  "ID",
  "Name",
  "SKU",
  "Description",
  "UnitPrice",
  "IsActive",
  "Category"
)
VALUES
  (
    '40000001-0001-0001-0001-000000000001',
    'Platform License',
    'PLT-001',
    'Annual platform subscription license',
    50000.00,
    true,
    'Software'
  ),
  (
    '40000001-0001-0001-0001-000000000002',
    'Professional Services',
    'SVC-001',
    'Implementation and consulting services',
    200.00,
    true,
    'Services'
  ),
  (
    '40000001-0001-0001-0001-000000000003',
    'Data Integration',
    'INT-001',
    'Data integration module add-on',
    25000.00,
    true,
    'Software'
  ),
  (
    '40000001-0001-0001-0001-000000000004',
    'Training Package',
    'TRN-001',
    '5-day on-site training for up to 20 users',
    15000.00,
    true,
    'Services'
  ),
  (
    '40000001-0001-0001-0001-000000000005',
    'Premium Support',
    'SUP-001',
    '24/7 premium support plan',
    10000.00,
    true,
    'Support'
  );

/* DealProducts (8) */
INSERT INTO "sample_crm"."DealProduct" (
  "ID",
  "DealID",
  "ProductID",
  "Quantity",
  "UnitPrice",
  "Discount"
)
VALUES
  (
    '50000001-0001-0001-0001-000000000001',
    '30000001-0001-0001-0001-000000000001',
    '40000001-0001-0001-0001-000000000001',
    3,
    50000.00,
    10.00
  ),
  (
    '50000001-0001-0001-0001-000000000002',
    '30000001-0001-0001-0001-000000000001',
    '40000001-0001-0001-0001-000000000002',
    100,
    200.00,
    0.00
  ),
  (
    '50000001-0001-0001-0001-000000000003',
    '30000001-0001-0001-0001-000000000002',
    '40000001-0001-0001-0001-000000000001',
    20,
    50000.00,
    15.00
  ),
  (
    '50000001-0001-0001-0001-000000000004',
    '30000001-0001-0001-0001-000000000002',
    '40000001-0001-0001-0001-000000000003',
    5,
    25000.00,
    5.00
  ),
  (
    '50000001-0001-0001-0001-000000000005',
    '30000001-0001-0001-0001-000000000002',
    '40000001-0001-0001-0001-000000000005',
    1,
    10000.00,
    0.00
  ),
  (
    '50000001-0001-0001-0001-000000000006',
    '30000001-0001-0001-0001-000000000003',
    '40000001-0001-0001-0001-000000000002',
    50,
    200.00,
    0.00
  ),
  (
    '50000001-0001-0001-0001-000000000007',
    '30000001-0001-0001-0001-000000000004',
    '40000001-0001-0001-0001-000000000004',
    1,
    15000.00,
    0.00
  ),
  (
    '50000001-0001-0001-0001-000000000008',
    '30000001-0001-0001-0001-000000000005',
    '40000001-0001-0001-0001-000000000003',
    10,
    25000.00,
    8.00
  );

/* Activities (8) */
INSERT INTO "sample_crm"."Activity" (
  "ID",
  "Type",
  "Subject",
  "Description",
  "ActivityDate",
  "DurationMinutes",
  "CompanyID",
  "ContactID",
  "DealID",
  "CompletedAt"
)
VALUES
  (
    '60000001-0001-0001-0001-000000000001',
    'Call',
    'Initial discovery call with Acme',
    'Discussed platform needs and timeline',
    '2026-01-10 14:00:00',
    45,
    '10000001-0001-0001-0001-000000000001',
    '20000001-0001-0001-0001-000000000001',
    '30000001-0001-0001-0001-000000000001',
    '2026-01-10 14:45:00'
  ),
  (
    '60000001-0001-0001-0001-000000000002',
    'Email',
    'Proposal sent to Globex',
    'Attached enterprise license proposal v3',
    '2026-01-15 09:00:00',
    NULL,
    '10000001-0001-0001-0001-000000000002',
    '20000001-0001-0001-0001-000000000003',
    '30000001-0001-0001-0001-000000000002',
    '2026-01-15 09:05:00'
  ),
  (
    '60000001-0001-0001-0001-000000000003',
    'Meeting',
    'Technical deep-dive with Globex engineering',
    'Reviewed architecture and integration points',
    '2026-01-20 10:00:00',
    120,
    '10000001-0001-0001-0001-000000000002',
    '20000001-0001-0001-0001-000000000004',
    '30000001-0001-0001-0001-000000000002',
    '2026-01-20 12:00:00'
  ),
  (
    '60000001-0001-0001-0001-000000000004',
    'Note',
    'Initech CEO interested in pilot program',
    'Frank mentioned budget approval expected by Q2',
    '2026-02-01 16:00:00',
    NULL,
    '10000001-0001-0001-0001-000000000003',
    '20000001-0001-0001-0001-000000000006',
    '30000001-0001-0001-0001-000000000004',
    NULL
  ),
  (
    '60000001-0001-0001-0001-000000000005',
    'Task',
    'Prepare Umbrella POC environment',
    'Set up sandbox with sample health data',
    '2026-02-05 08:00:00',
    NULL,
    '10000001-0001-0001-0001-000000000004',
    '20000001-0001-0001-0001-000000000009',
    '30000001-0001-0001-0001-000000000005',
    NULL
  ),
  (
    '60000001-0001-0001-0001-000000000006',
    'Call',
    'Stark renewal negotiation',
    'Discussed pricing concerns with Jack',
    '2026-01-25 11:00:00',
    30,
    '10000001-0001-0001-0001-000000000005',
    '20000001-0001-0001-0001-000000000010',
    '30000001-0001-0001-0001-000000000006',
    '2026-01-25 11:30:00'
  ),
  (
    '60000001-0001-0001-0001-000000000007',
    'Email',
    'Follow-up with Acme on pricing',
    'Sent revised pricing sheet per Alices request',
    '2026-02-10 13:00:00',
    NULL,
    '10000001-0001-0001-0001-000000000001',
    '20000001-0001-0001-0001-000000000001',
    '30000001-0001-0001-0001-000000000001',
    '2026-02-10 13:02:00'
  ),
  (
    '60000001-0001-0001-0001-000000000008',
    'Meeting',
    'Quarterly business review with Umbrella',
    'Reviewed engagement metrics and roadmap',
    '2026-02-15 14:00:00',
    90,
    '10000001-0001-0001-0001-000000000004',
    '20000001-0001-0001-0001-000000000008',
    NULL,
    '2026-02-15 15:30:00'
  );

/* Tags (4) */
INSERT INTO "sample_crm"."Tag" (
  "ID",
  "Name",
  "Color"
)
VALUES
  ('70000001-0001-0001-0001-000000000001', 'Enterprise', '#1E90FF'),
  ('70000001-0001-0001-0001-000000000002', 'Strategic', '#FF4500'),
  ('70000001-0001-0001-0001-000000000003', 'Healthcare', '#32CD32'),
  ('70000001-0001-0001-0001-000000000004', 'At Risk', '#FFD700');

/* CompanyTags (5) */
INSERT INTO "sample_crm"."CompanyTag" (
  "ID",
  "CompanyID",
  "TagID"
)
VALUES
  (
    '80000001-0001-0001-0001-000000000001',
    '10000001-0001-0001-0001-000000000001',
    '70000001-0001-0001-0001-000000000001'
  ),
  (
    '80000001-0001-0001-0001-000000000002',
    '10000001-0001-0001-0001-000000000002',
    '70000001-0001-0001-0001-000000000001'
  ),
  (
    '80000001-0001-0001-0001-000000000003',
    '10000001-0001-0001-0001-000000000002',
    '70000001-0001-0001-0001-000000000002'
  ),
  (
    '80000001-0001-0001-0001-000000000004',
    '10000001-0001-0001-0001-000000000004',
    '70000001-0001-0001-0001-000000000003'
  ),
  (
    '80000001-0001-0001-0001-000000000005',
    '10000001-0001-0001-0001-000000000005',
    '70000001-0001-0001-0001-000000000004'
  );

/* ContactTags (4) */
INSERT INTO "sample_crm"."ContactTag" (
  "ID",
  "ContactID",
  "TagID"
)
VALUES
  (
    '81000001-0001-0001-0001-000000000001',
    '20000001-0001-0001-0001-000000000001',
    '70000001-0001-0001-0001-000000000001'
  ),
  (
    '81000001-0001-0001-0001-000000000002',
    '20000001-0001-0001-0001-000000000003',
    '70000001-0001-0001-0001-000000000002'
  ),
  (
    '81000001-0001-0001-0001-000000000003',
    '20000001-0001-0001-0001-000000000008',
    '70000001-0001-0001-0001-000000000003'
  ),
  (
    '81000001-0001-0001-0001-000000000004',
    '20000001-0001-0001-0001-000000000010',
    '70000001-0001-0001-0001-000000000004'
  );

/* DealTags (4) */
INSERT INTO "sample_crm"."DealTag" (
  "ID",
  "DealID",
  "TagID"
)
VALUES
  (
    '82000001-0001-0001-0001-000000000001',
    '30000001-0001-0001-0001-000000000001',
    '70000001-0001-0001-0001-000000000001'
  ),
  (
    '82000001-0001-0001-0001-000000000002',
    '30000001-0001-0001-0001-000000000002',
    '70000001-0001-0001-0001-000000000002'
  ),
  (
    '82000001-0001-0001-0001-000000000003',
    '30000001-0001-0001-0001-000000000005',
    '70000001-0001-0001-0001-000000000003'
  ),
  (
    '82000001-0001-0001-0001-000000000004',
    '30000001-0001-0001-0001-000000000006',
    '70000001-0001-0001-0001-000000000004'
  );

/* Pipelines (2) */
INSERT INTO "sample_crm"."Pipeline" (
  "ID",
  "Name",
  "Description",
  "IsDefault"
)
VALUES
  (
    '90000001-0001-0001-0001-000000000001',
    'Standard Sales',
    'Default pipeline for standard B2B sales cycles',
    true
  ),
  (
    '90000001-0001-0001-0001-000000000002',
    'Enterprise Sales',
    'Extended pipeline for large enterprise engagements',
    false
  );

/* PipelineStages (10 = 5 per pipeline) */
INSERT INTO "sample_crm"."PipelineStage" (
  "ID",
  "PipelineID",
  "Name",
  "DisplayOrder",
  "Probability"
)
VALUES
  (
    '91000001-0001-0001-0001-000000000001',
    '90000001-0001-0001-0001-000000000001',
    'Lead',
    1,
    10
  ),
  (
    '91000001-0001-0001-0001-000000000002',
    '90000001-0001-0001-0001-000000000001',
    'Qualified',
    2,
    25
  ),
  (
    '91000001-0001-0001-0001-000000000003',
    '90000001-0001-0001-0001-000000000001',
    'Proposal',
    3,
    50
  ),
  (
    '91000001-0001-0001-0001-000000000004',
    '90000001-0001-0001-0001-000000000001',
    'Negotiation',
    4,
    75
  ),
  (
    '91000001-0001-0001-0001-000000000005',
    '90000001-0001-0001-0001-000000000001',
    'Closed',
    5,
    100
  ),
  (
    '91000001-0001-0001-0001-000000000006',
    '90000001-0001-0001-0001-000000000002',
    'Discovery',
    1,
    5
  ),
  (
    '91000001-0001-0001-0001-000000000007',
    '90000001-0001-0001-0001-000000000002',
    'Solution Design',
    2,
    20
  ),
  (
    '91000001-0001-0001-0001-000000000008',
    '90000001-0001-0001-0001-000000000002',
    'Proof of Concept',
    3,
    40
  ),
  (
    '91000001-0001-0001-0001-000000000009',
    '90000001-0001-0001-0001-000000000002',
    'Procurement',
    4,
    70
  ),
  (
    '91000001-0001-0001-0001-000000000010',
    '90000001-0001-0001-0001-000000000002',
    'Contract',
    5,
    90
  );

-- Sample CRM schema created successfully with 12 tables and seed data.