-- ============================================================================
-- PG-ONLY: align EntityPermission IDs with SQL Server (baseline divergence heal)
--
-- WHY THIS FILE EXISTS. V202609111000 adds UNIQUE (EntityID, RoleID, Type) to EntityPermission,
-- which field-level security needs so a field permission can be tied to exactly one entity
-- permission. That constraint is correct, and it is also what turns a long-latent SS/PG divergence
-- into a hard failure on PostgreSQL:
--
--     mj sync push  ->  duplicate key value violates unique constraint
--                       "UQ_EntityPermission_EntityID_RoleID_Type"
--
-- The permission IDs that `metadata/entity-permissions/**` declares are seeded by the SQL Server
-- v5.46 baseline (B202607091514__v5.46.x__Baseline.sql). They are seeded NOWHERE in the PostgreSQL
-- ledger -- grep the whole of migrations-pg/ for 4B2C433E-F36B-1410-8595-00C8AD7ACEA2 and you get
-- nothing. On PostgreSQL those permission rows have therefore only ever existed as CodeGen
-- default-permission grants, minted with fresh random UUIDs at whatever point each entity was
-- created.
--
-- Until now that was invisible. `mj sync push` would simply INSERT its own fixed-ID row alongside
-- the CodeGen one, and EntityInfo.GetUserPermisions OR-merges duplicate (entity, role, type) rows
-- at read time, so the effective permissions were identical and nothing complained. With the
-- uniqueness constraint in place the INSERT can no longer land, and the push fails on PostgreSQL
-- while succeeding on SQL Server.
--
-- WHAT THIS DOES. Re-points 225 EntityPermission rows to the ID SQL Server uses for the same
-- (Entity, Role, Type). After it runs, `mj sync push` matches those rows by primary key and updates
-- them instead of trying to insert a colliding twin, and the two platforms agree on identity.
--
-- WHY RE-ID RATHER THAN DELETE-AND-RESEED. Deleting the PG rows so the push can insert its own
-- would revoke every grant for the length of the transaction and lose any local edit folded into
-- them by V202609111000's merge. Re-pointing the identifier preserves the row, its flags, its RLS
-- filter columns and its __mj_CreatedAt.
--
-- SAFETY. Verified against the release databases before this file was written:
--   * NOTHING has a foreign key to EntityPermission -- checked pg_constraint; the re-ID cascades
--     nowhere. (EntityFieldPermission, new in this release, associates by EntityID/EntityFieldID.)
--   * None of the 225 target IDs is already in use on PostgreSQL by a DIFFERENT
--     (Entity, Role, Type) -- so no re-ID can collide with another row.
--   * The PG-side random IDs being replaced appear nowhere in metadata/.
--   * 1,189 natural keys exist on both platforms; 225 disagree on ID. The remainder are
--     already aligned and are left untouched.
--
-- IDEMPOTENT. Each row is re-pointed only when it does not already carry the canonical ID and the
-- canonical ID is not already present. Re-running is a no-op, and applying it to a database that
-- was never divergent changes nothing.
--
-- PG-ONLY BY CONSTRUCTION. SQL Server already holds these IDs -- they are its own baseline's. There
-- is no T-SQL counterpart to write.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

WITH canonical (entity_name, role_name, perm_type, canonical_id) AS (
  VALUES
    ('MJ: AI Agent Channels', 'Developer', 'Allow', '542a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Agent Channels', 'Integration', 'Allow', '5a2a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Agent Channels', 'UI', 'Allow', '4e2a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Agent Co Agents', 'Developer', 'Allow', '9c2a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Agent Co Agents', 'Integration', 'Allow', 'a22a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Agent Co Agents', 'UI', 'Allow', '962a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Agent Credentials', 'Developer', 'Allow', 'ab9d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: AI Agent Credentials', 'Integration', 'Allow', 'b09d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: AI Agent Credentials', 'UI', 'Allow', 'a69d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: AI Agent Harnesses', 'Developer', 'Allow', '979d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: AI Agent Harnesses', 'Integration', 'Allow', '9c9d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: AI Agent Harnesses', 'UI', 'Allow', '929d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: AI Agent Personas', 'Developer', 'Allow', 'ac9e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: AI Agent Personas', 'Integration', 'Allow', 'b29e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: AI Agent Personas', 'UI', 'Allow', 'a69e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: AI Agent Session Bridge Participants', 'Developer', 'Allow', 'd52a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Agent Session Bridge Participants', 'Integration', 'Allow', 'dc2a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Agent Session Bridge Participants', 'UI', 'Allow', 'ce2a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Agent Session Bridges', 'Developer', 'Allow', 'b92a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Agent Session Bridges', 'Integration', 'Allow', 'c02a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Agent Session Bridges', 'UI', 'Allow', 'b22a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Agent Session Channels', 'Developer', 'Allow', '842a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Agent Session Channels', 'Integration', 'Allow', '8a2a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Agent Session Channels', 'UI', 'Allow', '7e2a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Agent Sessions', 'Developer', 'Allow', '6c2a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Agent Sessions', 'Integration', 'Allow', '722a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Agent Sessions', 'UI', 'Allow', '662a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Agent Skills', 'Developer', 'Allow', '302c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Agent Skills', 'Integration', 'Allow', '332c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Agent Skills', 'UI', 'Allow', '2d2c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Bridge Agent Identities', 'Developer', 'Allow', '0d2b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Bridge Agent Identities', 'Integration', 'Allow', '142b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Bridge Agent Identities', 'UI', 'Allow', '062b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Bridge Provider Channels', 'Developer', 'Allow', '292b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Bridge Provider Channels', 'Integration', 'Allow', '302b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Bridge Provider Channels', 'UI', 'Allow', '222b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Bridge Providers', 'Developer', 'Allow', 'f12a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Bridge Providers', 'Integration', 'Allow', 'f82a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Bridge Providers', 'UI', 'Allow', 'ea2a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Model Personas', 'Developer', 'Allow', '949e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: AI Model Personas', 'Integration', 'Allow', '9a9e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: AI Model Personas', 'UI', 'Allow', '8e9e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: AI Persona Vendors', 'Developer', 'Allow', '7c9e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: AI Persona Vendors', 'Integration', 'Allow', '829e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: AI Persona Vendors', 'UI', 'Allow', '769e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: AI Personas', 'Developer', 'Allow', '649e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: AI Personas', 'Integration', 'Allow', '6a9e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: AI Personas', 'UI', 'Allow', '5e9e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: AI Remote Browser Providers', 'Developer', 'Allow', '3c2b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Remote Browser Providers', 'Integration', 'Allow', '402b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Remote Browser Providers', 'UI', 'Allow', '382b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Skill Actions', 'Developer', 'Allow', '182c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Skill Actions', 'Integration', 'Allow', '1b2c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Skill Actions', 'UI', 'Allow', '152c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Skill Permissions', 'Developer', 'Allow', '3c2c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Skill Permissions', 'Integration', 'Allow', '3f2c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Skill Permissions', 'UI', 'Allow', '392c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Skill Search Scopes', 'Developer', 'Allow', '7a9d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: AI Skill Search Scopes', 'Integration', 'Allow', '7b9d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: AI Skill Search Scopes', 'UI', 'Allow', '799d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: AI Skill Sub Agents', 'Developer', 'Allow', '242c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Skill Sub Agents', 'Integration', 'Allow', '272c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Skill Sub Agents', 'UI', 'Allow', '212c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Skills', 'Developer', 'Allow', '0c2c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Skills', 'Integration', 'Allow', '0f2c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Skills', 'UI', 'Allow', '092c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: AI Usage Types', 'Developer', 'Allow', '309e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: AI Usage Types', 'Integration', 'Allow', '329e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: AI Usage Types', 'UI', 'Allow', '2e9e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Authentication Providers', 'Developer', 'Allow', '019e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Authentication Providers', 'Integration', 'Allow', '049e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Authentication Providers', 'UI', 'Allow', 'fe9d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Cluster Analysis', 'Developer', 'Allow', '8c29433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Cluster Analysis', 'Integration', 'Allow', '9029433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Cluster Analysis', 'UI', 'Allow', '8829433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Cluster Analysis Clusters', 'Developer', 'Allow', '9c29433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Cluster Analysis Clusters', 'Integration', 'Allow', 'a029433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Cluster Analysis Clusters', 'UI', 'Allow', '9829433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Content Item Chunks', 'Developer', 'Allow', '569d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Content Item Chunks', 'Integration', 'Allow', '599d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Content Item Chunks', 'UI', 'Allow', '539d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Conversation Compaction Runs', 'Developer', 'Allow', '629d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Conversation Compaction Runs', 'Integration', 'Allow', '659d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Conversation Compaction Runs', 'UI', 'Allow', '5f9d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Conversation Skills', 'Developer', 'Allow', '449e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Conversation Skills', 'Integration', 'Allow', '4a9e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Conversation Skills', 'UI', 'Allow', '3e9e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Conversation Widget Instances', 'Developer', 'Allow', 'b32c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Conversation Widget Instances', 'Integration', 'Allow', 'b72c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Conversation Widget Instances', 'UI', 'Allow', 'af2c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Entity Field Permissions', 'Developer', 'Allow', '509e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Entity Field Permissions', 'Integration', 'Allow', '529e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Entity Field Permissions', 'UI', 'Allow', '4e9e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Experiment Session Iterations', 'Developer', 'Allow', 'e22b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Experiment Session Iterations', 'Integration', 'Allow', 'e42b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Experiment Session Iterations', 'UI', 'Allow', 'e02b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Experiment Sessions', 'Developer', 'Allow', 'da2b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Experiment Sessions', 'Integration', 'Allow', 'dc2b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Experiment Sessions', 'UI', 'Allow', 'd82b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Experiments', 'Developer', 'Allow', 'd22b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Experiments', 'Integration', 'Allow', 'd42b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Experiments', 'UI', 'Allow', 'd02b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: External Data Source Types', 'Developer', 'Allow', '932c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: External Data Source Types', 'Integration', 'Allow', '972c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: External Data Source Types', 'UI', 'Allow', '8f2c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: External Data Sources', 'Developer', 'Allow', 'a32c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: External Data Sources', 'Integration', 'Allow', 'a72c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: External Data Sources', 'UI', 'Allow', '9f2c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Form Chrome Rules', 'Developer', 'Allow', '139e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Form Chrome Rules', 'Integration', 'Allow', '189e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Form Chrome Rules', 'UI', 'Allow', '0e9e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Identity Claim Types', 'Developer', 'Allow', '299e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Identity Claim Types', 'Integration', 'Allow', '2a9e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Identity Claim Types', 'UI', 'Allow', '289e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Identity Claims', 'Developer', 'Allow', '229e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Identity Claims', 'Integration', 'Allow', '279e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Identity Claims', 'UI', 'Allow', '1d9e473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: ML Algorithm Use Case Rankings', 'Developer', 'Allow', 'ba2b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: ML Algorithm Use Case Rankings', 'Integration', 'Allow', 'bc2b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: ML Algorithm Use Case Rankings', 'UI', 'Allow', 'b82b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: ML Algorithm Use Cases', 'Developer', 'Allow', 'b22b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: ML Algorithm Use Cases', 'Integration', 'Allow', 'b42b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: ML Algorithm Use Cases', 'UI', 'Allow', 'b02b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: ML Algorithms', 'Developer', 'Allow', 'aa2b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: ML Algorithms', 'Integration', 'Allow', 'ac2b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: ML Algorithms', 'UI', 'Allow', 'a82b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: ML Model Scoring Bindings', 'Developer', 'Allow', 'a22b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: ML Model Scoring Bindings', 'Integration', 'Allow', 'a42b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: ML Model Scoring Bindings', 'UI', 'Allow', 'a02b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: ML Models', 'Developer', 'Allow', 'ca2b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: ML Models', 'Integration', 'Allow', 'cc2b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: ML Models', 'UI', 'Allow', 'c82b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: ML Training Pipelines', 'Developer', 'Allow', 'c22b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: ML Training Pipelines', 'Integration', 'Allow', 'c42b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: ML Training Pipelines', 'UI', 'Allow', 'c02b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: ML Training Runs', 'Developer', 'Allow', '9a2b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: ML Training Runs', 'Integration', 'Allow', '9c2b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: ML Training Runs', 'UI', 'Allow', '982b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Magic Link Invite Allowed Domains', 'Developer', 'Allow', 'c329433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Magic Link Invite Allowed Domains', 'Integration', 'Allow', 'c429433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Magic Link Invite Allowed Domains', 'UI', 'Allow', 'c229433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Magic Link Invite Allowed Paths', 'Developer', 'Allow', 'c729433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Magic Link Invite Allowed Paths', 'Integration', 'Allow', 'c829433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Magic Link Invite Allowed Paths', 'UI', 'Allow', 'c629433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Magic Link Invite Applications', 'Developer', 'Allow', 'bb29433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Magic Link Invite Applications', 'Integration', 'Allow', 'bc29433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Magic Link Invite Applications', 'UI', 'Allow', 'ba29433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Magic Link Invite Roles', 'Developer', 'Allow', 'bf29433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Magic Link Invite Roles', 'Integration', 'Allow', 'c029433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Magic Link Invite Roles', 'UI', 'Allow', 'be29433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Magic Link Invites', 'Developer', 'Allow', 'b329433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Magic Link Invites', 'Integration', 'Allow', 'b429433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Magic Link Invites', 'UI', 'Allow', 'b229433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Magic Link Redemptions', 'Developer', 'Allow', 'b729433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Magic Link Redemptions', 'Integration', 'Allow', 'b829433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Magic Link Redemptions', 'UI', 'Allow', 'b629433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Materialized Result Queries', 'Developer', 'Allow', 'db9d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Materialized Result Queries', 'Integration', 'Allow', 'e09d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Materialized Result Queries', 'UI', 'Allow', 'd69d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Materialized Results', 'Developer', 'Allow', 'c79d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Materialized Results', 'Integration', 'Allow', 'cc9d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Materialized Results', 'UI', 'Allow', 'c29d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Process Run Details', 'Developer', 'Allow', '6d2b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Process Run Details', 'Integration', 'Allow', '702b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Process Run Details', 'UI', 'Allow', '6a2b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Process Runs', 'Developer', 'Allow', '612b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Process Runs', 'Integration', 'Allow', '642b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Process Runs', 'UI', 'Allow', '5e2b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: RSU Pending Works', 'Developer', 'Allow', 'f29d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: RSU Pending Works', 'Integration', 'Allow', 'f89d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: RSU Pending Works', 'UI', 'Allow', 'ec9d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Record Process Categories', 'Developer', 'Allow', '492b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Record Process Categories', 'Integration', 'Allow', '4c2b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Record Process Categories', 'UI', 'Allow', '462b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Record Process Watermarks', 'Developer', 'Allow', '792b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Record Process Watermarks', 'Integration', 'Allow', '7c2b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Record Process Watermarks', 'UI', 'Allow', '762b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Record Processes', 'Developer', 'Allow', '552b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Record Processes', 'Integration', 'Allow', '582b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Record Processes', 'UI', 'Allow', '522b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Remote Operation Categories', 'Developer', 'Allow', '852b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Remote Operation Categories', 'Integration', 'Allow', '882b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Remote Operation Categories', 'UI', 'Allow', '822b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Remote Operations', 'Developer', 'Allow', '912b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Remote Operations', 'Integration', 'Allow', '942b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Remote Operations', 'UI', 'Allow', '8e2b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Scoped Prompt Configs', 'Developer', 'Allow', 'd22c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Scoped Prompt Configs', 'Integration', 'Allow', 'd72c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Scoped Prompt Configs', 'UI', 'Allow', 'cd2c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Scoped Prompt Parts', 'Developer', 'Allow', 'fd2b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Scoped Prompt Parts', 'Integration', 'Allow', '032c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Scoped Prompt Parts', 'UI', 'Allow', 'f72b433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Signature Accounts', 'Developer', 'Allow', 'ed29433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Signature Accounts', 'Integration', 'Allow', 'f229433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Signature Accounts', 'UI', 'Allow', 'e829433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Signature Providers', 'Developer', 'Allow', 'd929433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Signature Providers', 'Integration', 'Allow', 'de29433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Signature Providers', 'UI', 'Allow', 'd429433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Signature Request Documents', 'Developer', 'Allow', '152a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Signature Request Documents', 'Integration', 'Allow', '1a2a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Signature Request Documents', 'UI', 'Allow', '102a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Signature Request Logs', 'Developer', 'Allow', '3d2a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Signature Request Logs', 'Integration', 'Allow', '422a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Signature Request Logs', 'UI', 'Allow', '382a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Signature Request Recipients', 'Developer', 'Allow', '292a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Signature Request Recipients', 'Integration', 'Allow', '2e2a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Signature Request Recipients', 'UI', 'Allow', '242a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Signature Requests', 'Developer', 'Allow', '012a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Signature Requests', 'Integration', 'Allow', '062a433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Signature Requests', 'UI', 'Allow', 'fc29433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: Themes', 'Developer', 'Allow', '489d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Themes', 'Integration', 'Allow', '4d9d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: Themes', 'UI', 'Allow', '439d473e-f36b-1410-8bf7-005545d9d21b'::uuid),
    ('MJ: User Routine Recipients', 'Developer', 'Allow', '692c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: User Routine Recipients', 'Integration', 'Allow', '6f2c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: User Routine Recipients', 'UI', 'Allow', '632c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: User Routine Runs', 'Developer', 'Allow', '812c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: User Routine Runs', 'Integration', 'Allow', '872c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: User Routine Runs', 'UI', 'Allow', '7b2c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: User Routines', 'Developer', 'Allow', '512c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: User Routines', 'Integration', 'Allow', '572c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: User Routines', 'UI', 'Allow', '4b2c433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: View Types', 'Developer', 'Allow', 'ac29433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: View Types', 'Integration', 'Allow', 'b029433e-f36b-1410-8595-00c8ad7acea2'::uuid),
    ('MJ: View Types', 'UI', 'Allow', 'a829433e-f36b-1410-8595-00c8ad7acea2'::uuid)
)
UPDATE __mj."EntityPermission" p
   SET "ID" = c.canonical_id
  FROM canonical c
  JOIN __mj."Entity" e ON e."Name" = c.entity_name
  JOIN __mj."Role"   r ON r."Name" = c.role_name
 WHERE p."EntityID" = e."ID"
   AND p."RoleID"   = r."ID"
   AND p."Type"     = c.perm_type
   AND p."ID"      <> c.canonical_id
   AND NOT EXISTS (SELECT 1 FROM __mj."EntityPermission" x WHERE x."ID" = c.canonical_id);
