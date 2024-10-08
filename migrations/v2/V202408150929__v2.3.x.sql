-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Error Logs
-- Item: spCreateErrorLog
-- Generated: 8/15/2024, 9:14:48 PM
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ErrorLog
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateErrorLog]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateErrorLog]
    @CompanyIntegrationRunID uniqueidentifier,
    @CompanyIntegrationRunDetailID uniqueidentifier,
    @Code nchar(20),
    @Message nvarchar(MAX),
    @CreatedBy nvarchar(50),
    @Status nvarchar(10),
    @Category nvarchar(20),
    @Details nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO 
    [${flyway:defaultSchema}].[ErrorLog]
        (
            [CompanyIntegrationRunID],
            [CompanyIntegrationRunDetailID],
            [Code],
            [Message],
            [CreatedBy],
            [Status],
            [Category],
            [Details]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @CompanyIntegrationRunID,
            @CompanyIntegrationRunDetailID,
            @Code,
            @Message,
            @CreatedBy,
            @Status,
            @Category,
            @Details
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwErrorLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateErrorLog] TO [cdp_Integration], [cdp_Developer]
    