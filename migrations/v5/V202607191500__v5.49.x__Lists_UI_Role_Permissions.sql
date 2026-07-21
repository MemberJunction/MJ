-- ============================================================================
-- Grant UI Role Create/Update/Delete Permissions for Lists & List Details
-- Migration: v5.49.x
-- Date: 2026-07-19
-- ============================================================================
-- Problem (client-reported bug D4): End users assigned the "UI" role cannot
-- create or populate Lists — a core self-service feature. The seeded
-- EntityPermission rows for the "Lists" and "List Details" entities grant the
-- UI role read-only access (CanCreate/CanUpdate/CanDelete = 0); only the
-- Developer and Integration roles have full CRUD. Granting Developer to end
-- users to work around this would badly over-provision them.
--
-- Fix: Two layers must be updated to stay in sync (same as the v5.6.x agent
-- permissions migration):
--   1. EntityPermission rows (application-layer check in BaseEntity.Save)
--   2. GRANT EXECUTE on the CRUD stored procedures (SQL-layer security for the
--      cdp_UI role). The baseline grants these procs only to cdp_Developer /
--      cdp_Integration; the UI role needs them too. (A future CodeGen run will
--      regenerate the same grants from the EntityPermission change above — these
--      explicit grants make the fix effective immediately.)
--
-- NOTE ON ROW-LEVEL SCOPING: these entities have no Row-Level Security filters
-- (all *RLSFilterID columns are NULL), so this grant is entity-wide. Lists carry
-- an owning UserID and the Lists UI filters by owner, but the coarse Entity
-- Permission cannot by itself restrict a UI user to only their own lists.
-- Restricting write access to a user's own lists would require RLS filters — a
-- separate, larger enhancement.
-- ============================================================================

SET NOCOUNT ON;

-- Layer 1: EntityPermission rows — grant UI role full write access to Lists & List Details.
-- Targeted by the two existing seeded permission-row IDs (UI role on Lists / List Details);
-- both rows currently hold CanCreate/CanUpdate/CanDelete = 0. Matching by row ID (rather than
-- by entity Name) is intentional — the core entity Names are MJ-prefixed as of v5.0.
UPDATE [${flyway:defaultSchema}].[EntityPermission]
   SET [CanCreate] = 1, [CanUpdate] = 1, [CanDelete] = 1
 WHERE [ID] IN (
       '3779fb77-22f5-4b77-9911-eb0bff301833',   -- UI role on Lists
       '8592f446-638d-4c82-a6b4-bc935a499c70'    -- UI role on List Details
 );

-- Layer 2: GRANT EXECUTE on the CRUD stored procedures to cdp_UI
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateList]        TO [cdp_UI];
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateList]        TO [cdp_UI];
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteList]        TO [cdp_UI];
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateListDetail]  TO [cdp_UI];
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateListDetail]  TO [cdp_UI];
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteListDetail]  TO [cdp_UI];
