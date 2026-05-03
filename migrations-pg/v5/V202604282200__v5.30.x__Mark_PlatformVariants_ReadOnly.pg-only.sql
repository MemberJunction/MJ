-- Mark the PlatformVariants EntityField rows (registered in V202604281900) as
-- read-only via AllowUpdateAPI=false. This keeps the field visible to entity
-- metadata (so BaseEntity.SetMany doesn't throw on rows loaded from vwQueries
-- where the column is exposed) but excludes it from the writable-fields list
-- the PG provider sends to spUpdate*. The underlying sproc was generated
-- before PlatformVariants existed and would otherwise fail with
--   "function ... does not exist" because the parameter set didn't match.
--
-- Long-term cleanup (post-ship) is to drop the PG-only PlatformVariants column
-- altogether — the runtime path that consumed it migrated to the MJ: Query SQLs
-- child table. Until then, marking it read-only keeps the column harmless.

UPDATE __mj."EntityField"
SET "AllowUpdateAPI" = false
WHERE "Name" = 'PlatformVariants'
  AND "EntityID" IN (
    SELECT "ID" FROM __mj."Entity"
    WHERE "Name" IN ('MJ: Queries', 'MJ: User Views', 'MJ: Row Level Security Filters')
  );
