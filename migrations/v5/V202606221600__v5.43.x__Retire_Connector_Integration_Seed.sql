-- RELEASE B (subtractive): retire the seeded vendor connector catalog from MJ core.
-- Vendor connectors now live in MemberJunction/Integrations and seed their own
-- Integration / IntegrationObject / IntegrationObjectField rows on install. This nets the
-- baseline-seeded rows out of a FRESH install while LEAVING ALONE anything an existing
-- install is actually using (referenced by CompanyIntegration), so upgrades never lose data.
-- Keyed on Integration.ClassName (stable across seeds), reverse-FK order, idempotent.
--
-- NOTE: must ship only AFTER MemberJunction/Integrations is published and the additive
-- release A (multi-app + connector-profile install) is live. See PR for sequencing.

-- The set of seeded vendor-connector Integration IDs that NO company is using.
DECLARE @Unused TABLE (ID UNIQUEIDENTIFIER PRIMARY KEY);
INSERT INTO @Unused (ID)
SELECT i.ID
FROM [${flyway:defaultSchema}].[Integration] i
WHERE i.ClassName IN (
        'AptifyConnector',
        'BlackbaudConnector',
        'ConstantContactConnector',
        'CventConnector',
        'DynamicsDataverseConnector',
        'FontevaConnector',
        'GrowthZoneConnector',
        'HivebriteConnector',
        'HubSpotConnector',
        'IMISConnector',
        'MJToMJConnector',
        'MagnetMailConnector',
        'MailchimpConnector',
        'MemberSuiteConnector',
        'NeonCRMConnector',
        'NetForumConnector',
        'NetSuiteConnector',
        'NimbleAMSConnector',
        'NoviConnector',
        'ORCIDConnector',
        'OpenWaterConnector',
        'PathLMSConnector',
        'PheedLoopConnector',
        'PropFuelConnector',
        'QuickBooksConnector',
        'RasaConnector',
        'Reach360Connector',
        'RhythmConnector',
        'SageIntacctConnector',
        'SalesforceConnector',
        'SharePointConnector',
        'WicketConnector',
        'WildApricotConnector',
        'YourMembershipConnector'
)
AND NOT EXISTS (
    SELECT 1 FROM [${flyway:defaultSchema}].[CompanyIntegration] ci WHERE ci.IntegrationID = i.ID
);

-- IntegrationObjectField rows of unused integrations' objects.
DELETE iof
FROM [${flyway:defaultSchema}].[IntegrationObjectField] iof
INNER JOIN [${flyway:defaultSchema}].[IntegrationObject] io ON io.ID = iof.IntegrationObjectID
WHERE io.IntegrationID IN (SELECT ID FROM @Unused);

-- IntegrationObject rows of unused integrations.
DELETE io
FROM [${flyway:defaultSchema}].[IntegrationObject] io
WHERE io.IntegrationID IN (SELECT ID FROM @Unused);

-- The unused Integration rows themselves.
DELETE i
FROM [${flyway:defaultSchema}].[Integration] i
WHERE i.ID IN (SELECT ID FROM @Unused);
