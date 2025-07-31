-- ---------------------------------------------------------------------------
-- FIX: use Type == 'Inference Provider' to filter vendors to only inference providres as that's where we get the driverclass
-- Custom view for backward compatibility bringing in top priotiy for AIModelVendor - now using TOP 1 to handle ties
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS ${flyway:defaultSchema}.vwAIModels;
GO
CREATE VIEW [${flyway:defaultSchema}].[vwAIModels]
AS
SELECT 
	m.*,
	AIModelType_AIModelTypeID.[Name] AS [AIModelType],
	v.[Name] AS [Vendor],
	mv.[DriverClass],
	mv.[DriverImportPath],
	mv.[APIName],
	mv.[MaxInputTokens] AS [InputTokenLimit],
	mv.[SupportedResponseFormats],
	mv.[SupportsEffortLevel]
FROM 
	[${flyway:defaultSchema}].[AIModel] m
INNER JOIN
	[${flyway:defaultSchema}].[AIModelType] AS AIModelType_AIModelTypeID
	ON
	[m].[AIModelTypeID] = AIModelType_AIModelTypeID.[ID]
OUTER APPLY (
	SELECT TOP 1
		mv.[ModelID],
		mv.[DriverClass],
		mv.[DriverImportPath],
		mv.[APIName],
		mv.[MaxInputTokens],
		mv.[SupportedResponseFormats],
		mv.[SupportsEffortLevel],
		mv.[VendorID]
	FROM 
		[${flyway:defaultSchema}].[vwAIModelVendors] mv
	WHERE
		mv.[ModelID] = m.[ID]
		AND mv.[Status] = 'Active'
        AND mv.[Type] = 'Inference Provider' -- Filter to only inference providers
	ORDER BY 
		mv.[Priority] DESC
) mv
LEFT JOIN [${flyway:defaultSchema}].[AIVendor] v ON mv.[VendorID] = v.[ID]
GO


-- Fix model priorities to set higher priority for Groq on these 3 models
UPDATE ${flyway:defaultSchema}.AIModelVendor SET Priority=1 WHERE ID IN (
'9A558E9B-FDEA-4EA6-A0E8-8E94472DFECF', -- Qwen 3 32B - Groq
'6A52443E-F36B-1410-8DBA-00021F8B792E', -- Llama 3.3 70B - Groq
'5B52443E-F36B-1410-8DBA-00021F8B792E'  -- Llama 4 Scout - Groq
)