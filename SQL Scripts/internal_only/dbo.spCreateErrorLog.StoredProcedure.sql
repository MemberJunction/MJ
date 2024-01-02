/****** Object:  StoredProcedure [dbo].[spCreateErrorLog]    Script Date: 1/30/2023 10:12:00 AM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE PROC [dbo].[spCreateErrorLog]
(
@CompanyIntegrationRunID AS INT = NULL,
@CompanyIntegrationRunDetailID AS INT = NULL,
@Code AS NCHAR(20) = NULL,
@Status AS NVARCHAR(10) = NULL,
@Category AS NVARCHAR(20) = NULL,
@Message AS NVARCHAR(MAX) = NULL,
@Details AS NVARCHAR(MAX) = NULL,
@ErrorLogID AS INT OUTPUT
)
AS


INSERT INTO [admin].[ErrorLog]
           ([CompanyIntegrationRunID]
           ,[CompanyIntegrationRunDetailID]
           ,[Code]
		   ,[Status]
		   ,[Category]
           ,[Message]
		   ,[Details])
     VALUES
           (@CompanyIntegrationRunID,
           @CompanyIntegrationRunDetailID,
           @Code,
		   @Status,
		   @Category,
           @Message,
		   @Details)

	--Get the ID of the new ErrorLog record
	SELECT @ErrorLogID = SCOPE_IDENTITY();
GO


