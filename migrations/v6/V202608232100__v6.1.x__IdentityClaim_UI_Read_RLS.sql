-- =====================================================================================
-- Identity Claims — scope UI-role reads to the requesting user
-- =====================================================================================
-- V202608202300 created MJ: Identity Claims with the CodeGen default permission set
-- (UI read-only, Developer/Integration full CRUD — see CodeGenLib/src/Config/config.ts).
-- That default is right for most entities but too broad for this one: IdentityClaim rows
-- carry a guest purchaser's email (NormalizedEmail) alongside the record they bought
-- (EntityID / RecordID), so an unfiltered read grant lets any authenticated UI user
-- enumerate every guest email and its purchase linkage.
--
-- The fix follows the pattern already established in core for exactly this situation:
-- keep CanRead and attach a row-level filter, as 'UI: Own AI Agent Runs' /
-- 'UI: Own AI Prompt Runs' do. Developer and Integration keep filter-less permission
-- rows, so UserExemptFromRowLevelSecurity continues to return true for them.
--
-- Note the MetadataJSON TokenHash is NOT the exposure being addressed here: the token is
-- crypto.randomBytes(32) and is not recoverable from its SHA-256. The exposure is PII
-- enumeration.
--
-- The filter matches on ClaimedByUserID OR NormalizedEmail because ClaimedByUserID is
-- NULL until a claim is redeemed — an ID-only filter would hide every *pending* claim
-- from the very user entitled to redeem it.
-- =====================================================================================

-- Seeded in SQL rather than metadata/ + `mj sync push`: EntityPermission has no unique
-- constraint on (EntityID, RoleID), and V202608202300's INSERT omitted [ID], so the
-- existing row carries a server-generated GUID. A metadata entry with a fresh primary key
-- would ADD a second permission row for the same entity+role — and because
-- UserExemptFromRowLevelSecurity returns exempt on the first row it finds with a NULL
-- filter, that duplicate would silently cancel this fix rather than failing loudly.
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[RowLevelSecurityFilter] WHERE [ID] = 'F1CA0001-0000-4000-B000-000000000001')
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[RowLevelSecurityFilter]
        ([ID], [Name], [Description], [FilterText], [__mj_CreatedAt], [__mj_UpdatedAt])
    VALUES (
        'F1CA0001-0000-4000-B000-000000000001',
        N'UI: Own Identity Claims',
        N'Narrows MJ: Identity Claims reads to claims addressed to, or already redeemed by, the current user. Applied to the UI role''s EntityPermission.ReadRLSFilterID. Matches on NormalizedEmail as well as ClaimedByUserID because ClaimedByUserID is NULL until redemption.',
        N'[ClaimedByUserID] = ''{{UserID}}'' OR [NormalizedEmail] = LOWER(LTRIM(RTRIM(''{{UserEmail}}'')))',
        GETUTCDATE(),
        GETUTCDATE()
    );
END
GO

-- CodeGen runs AFTER migrations, so the Entity/EntityPermission rows may legitimately not
-- exist yet on a database being stood up from scratch. Skip cleanly when that is the case.
-- Only fills a NULL ReadRLSFilterID so a hand-tuned filter is never clobbered.
IF EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[Entity] WHERE [ID] = '58C8C895-E3AA-48C2-BA68-808337235873')
   AND EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[RowLevelSecurityFilter] WHERE [ID] = 'F1CA0001-0000-4000-B000-000000000001')
BEGIN
    UPDATE [${flyway:defaultSchema}].[EntityPermission]
       SET [ReadRLSFilterID] = 'F1CA0001-0000-4000-B000-000000000001',
           [__mj_UpdatedAt]  = GETUTCDATE()
     WHERE [EntityID]        = '58C8C895-E3AA-48C2-BA68-808337235873'
       AND [RoleID]          = 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E'
       AND [ReadRLSFilterID] IS NULL;
END
GO
