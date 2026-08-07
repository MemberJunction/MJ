-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Counterpart to migrations/v6/V202608071100__v6.1.x__EntityRelationship_RelatedRecordCollection.sql
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;

-- ============================================================================
-- EntityRelationship.RelatedRecordCollection — declare a relationship as a
-- first-class, code-generated related-record collection.
--
-- MemberJunction 6.2 adds composite entity graphs: a parent record and its
-- related rows that load, validate and persist as one unit, on both tiers, from
-- a single entity.Save(). This column holds the policy half of the resulting
-- DeclareRelatedRecords(...) declaration — Name, Load, OnRemove, OrderBy,
-- Sequence, ClearAfterSave — so CodeGen can emit it instead of every
-- application hand-writing it.
--
-- RelatedEntity and RelatedEntityJoinField are deliberately NOT part of the JSON
-- shape: they are already columns on this same row, and duplicating them would
-- create two sources of truth that can disagree.
--
-- Modelled as a JSONType rather than scalar columns because the declaration is a
-- small, evolving policy object (Sequence is itself nested; Load and OnRemove are
-- growing value lists), not a set of independent facts to query or index. Adding
-- an option becomes an interface edit plus `mj sync push`, with no schema change.
--
-- ADDITIVE: NULL — every existing row — means "not a declared collection", which
-- is exactly today's behaviour.
-- ============================================================================

ALTER TABLE __mj."EntityRelationship"
  ADD COLUMN "RelatedRecordCollection" TEXT NULL;

COMMENT ON COLUMN __mj."EntityRelationship"."RelatedRecordCollection" IS 'Optional JSON policy object that declares this relationship as a first-class related-record collection, so CodeGen can emit a typed DeclareRelatedRecords(...) declaration on the entity subclass. Shape is IRelatedRecordCollectionConfig: Name (the generated property name, e.g. "Lines"), Load (''explicit'' | ''eager'' | ''never''), OnRemove (''delete'' | ''orphan'' | ''refuse''), OrderBy, Sequence ({ Field, From }), and ClearAfterSave. RelatedEntity and RelatedEntityJoinField are NOT repeated here — they are read from this row''s own columns. NULL means the relationship is not a declared collection, which is the default and reproduces pre-6.2 behaviour exactly.';
