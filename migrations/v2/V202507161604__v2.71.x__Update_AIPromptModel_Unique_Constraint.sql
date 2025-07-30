/*
 * Migration: Update AIPromptModel Unique Constraint to Include ConfigurationID
 * Version: v2.71.x
 * Date: 2025-07-16
 * 
 * This migration:
 * 1. Drops the old unique constraint UQ_AIPromptModel_Prompt_Model_Vendor_Config
 * 2. Adds a new unique constraint that includes ConfigurationID
 * 
 * The new constraint allows the same prompt/model/vendor combination to exist 
 * with different configurations, while preventing duplicates within the same 
 * configuration (including when ConfigurationID is NULL).
 * 
 * This enables having different model configurations (e.g., Production vs Development)
 * for the same prompt/model/vendor combination.
 */

BEGIN TRY
    BEGIN TRANSACTION;

    -- Drop the old unique constraint if it exists
    IF EXISTS (SELECT * FROM sys.key_constraints 
               WHERE name = 'UQ_AIPromptModel_Prompt_Model_Vendor_Config' 
               AND parent_object_id = OBJECT_ID('${flyway:defaultSchema}.AIPromptModel'))
    BEGIN
        ALTER TABLE ${flyway:defaultSchema}.AIPromptModel 
        DROP CONSTRAINT UQ_AIPromptModel_Prompt_Model_Vendor_Config;
        
        PRINT 'Successfully dropped old constraint UQ_AIPromptModel_Prompt_Model_Vendor_Config';
    END
    ELSE
    BEGIN
        PRINT 'Old constraint UQ_AIPromptModel_Prompt_Model_Vendor_Config does not exist - skipping drop';
    END

    -- Add the new unique constraint that includes ConfigurationID
    -- This allows same prompt/model/vendor for different configurations
    -- but prevents duplicates within the same configuration (including NULL)
    ALTER TABLE ${flyway:defaultSchema}.AIPromptModel
    ADD CONSTRAINT UQ_AIPromptModel_Prompt_Model_Vendor_ConfigID 
    UNIQUE (PromptID, ModelID, VendorID, ConfigurationID);

    PRINT 'Successfully added new constraint UQ_AIPromptModel_Prompt_Model_Vendor_ConfigID';

    COMMIT TRANSACTION;
    PRINT 'Migration completed successfully.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    PRINT 'Error in migration: ' + ERROR_MESSAGE();
    THROW;
END CATCH;