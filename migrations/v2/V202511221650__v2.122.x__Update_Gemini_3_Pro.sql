-- Correct the Driver Class for the Gemini 3 Pro (Preview) model on Google
-- Was set to GoogleLLM when it should be GeminiLLM

-- Use existing Google Vendor ID
DECLARE @ModelVendorID UNIQUEIDENTIFIER = 'F261666C-7272-476A-847B-E2BF01316E22'; -- Gemini 3 Pro Model and Google Vendor (existing)

-- Update the AI Model Vendor association for Gemini 3 Pro with Google as inference provider
-- to set the Driver Class to GeminiLLM.
UPDATE [${flyway:defaultSchema}].[AIModelVendor]
SET DriverClass='GeminiLLM'
WHERE
    ID = @ModelVendorID;
