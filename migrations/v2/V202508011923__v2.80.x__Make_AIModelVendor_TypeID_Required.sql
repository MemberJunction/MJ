-- =====================================================================================================================
-- MemberJunction v2.80 Migration
-- 
-- Description: Make AIModelVendor.TypeID column NOT NULL
-- 
-- This migration updates the AIModelVendor table to enforce that all vendors must have a TypeID.
-- TypeID distinguishes between Model Developers (companies that create/train models) and 
-- Inference Providers (services that offer API access to run models).
-- =====================================================================================================================

-- First, fix bad rows where TypeID is NULL
-- Inference Provider is default
UPDATE __mj.AIModelVendor SET TypeID='5B043EC3-1FF2-4730-B5D2-7CFDA50979B3' WHERE TypeID IS NULL

-- Drop the unique constraint if it exists
IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'UQ_AIModelVendor_ModelID_VendorID_TypeID' AND object_id = OBJECT_ID('${flyway:defaultSchema}.AIModelVendor'))
BEGIN
    ALTER TABLE ${flyway:defaultSchema}.AIModelVendor DROP CONSTRAINT UQ_AIModelVendor_ModelID_VendorID_TypeID;
END

-- Drop the foreign key index if it exists
IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'IDX_AUTO_MJ_FKEY_AIModelVendor_TypeID' AND object_id = OBJECT_ID('${flyway:defaultSchema}.AIModelVendor'))
BEGIN
    DROP INDEX IDX_AUTO_MJ_FKEY_AIModelVendor_TypeID ON ${flyway:defaultSchema}.AIModelVendor;
END

-- Alter the column to be NOT NULL
ALTER TABLE ${flyway:defaultSchema}.AIModelVendor
ALTER COLUMN TypeID UNIQUEIDENTIFIER NOT NULL;

-- Recreate the unique constraint
ALTER TABLE ${flyway:defaultSchema}.AIModelVendor 
ADD CONSTRAINT UQ_AIModelVendor_ModelID_VendorID_TypeID UNIQUE (ModelID, VendorID, TypeID);

-- Recreate the foreign key index
CREATE NONCLUSTERED INDEX IDX_AUTO_MJ_FKEY_AIModelVendor_TypeID 
ON ${flyway:defaultSchema}.AIModelVendor (TypeID);
 