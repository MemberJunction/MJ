-- =============================================================================
-- Migration: Fix SearchScopePermission unique constraints (filtered indexes)
-- Version:   v5.30.x
-- Plan:      RAG_plan.md §3 Phase 2A.2 (correction to V202604280730)
-- =============================================================================
-- The original migration (V202604280730__v5.30.x__Add_SearchScopePermission.sql)
-- created two unique CONSTRAINTS:
--
--   UQ_SearchScopePermission_User UNIQUE (SearchScopeID, UserID)
--   UQ_SearchScopePermission_Role UNIQUE (SearchScopeID, RoleID)
--
-- Intent: prevent duplicate user grants and duplicate role grants per scope.
--
-- Bug: SQL Server's UNIQUE CONSTRAINT semantics treat NULL as a value for
-- equality, so once a row exists with `RoleID = NULL` (every user grant), no
-- second user grant can be added on the same scope (both have RoleID=NULL,
-- collision). The same problem applies symmetrically to UserID=NULL on role
-- grants. Re-walking SEARCH_USAGE.md §5.1 surfaced this — adding a second
-- user grant after the auto-Manage grant fails with
-- "Violation of UNIQUE KEY constraint UQ_SearchScopePermission_Role".
--
-- Fix: drop the constraints and replace each with a FILTERED unique index that
-- only enforces uniqueness when the relevant ID is non-NULL. This preserves
-- the no-duplicates intent while allowing arbitrarily many user grants
-- (RoleID=NULL) and arbitrarily many role grants (UserID=NULL) per scope.
--
-- Note: filtered unique indexes are functionally equivalent to UNIQUE
-- CONSTRAINTs but are more permissive on NULLs. CodeGen treats them the same
-- way for entity metadata.
-- =============================================================================

ALTER TABLE ${flyway:defaultSchema}.SearchScopePermission
    DROP CONSTRAINT UQ_SearchScopePermission_User;

ALTER TABLE ${flyway:defaultSchema}.SearchScopePermission
    DROP CONSTRAINT UQ_SearchScopePermission_Role;

CREATE UNIQUE INDEX UQ_SearchScopePermission_User
    ON ${flyway:defaultSchema}.SearchScopePermission (SearchScopeID, UserID)
    WHERE UserID IS NOT NULL;

CREATE UNIQUE INDEX UQ_SearchScopePermission_Role
    ON ${flyway:defaultSchema}.SearchScopePermission (SearchScopeID, RoleID)
    WHERE RoleID IS NOT NULL;
