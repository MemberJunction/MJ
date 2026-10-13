/* ==============================================================================================
   Stop four entities asking for a name column that MJ: Entity Actions does not have.

   MJ's convention: a foreign key with IncludeRelatedEntityNameFieldInBaseView = 1 gets a
   denormalized display column in the base view, named after the TARGET entity, carrying that
   record's name — so a grid shows a readable value instead of a UUID.

   Four entities set that flag on their EntityActionID FK:

      MJ: Action Execution Logs
      MJ: Entity Action Filters
      MJ: Entity Action Invocations
      MJ: Entity Action Params

   The target, MJ: Entity Actions, is a pure junction — EntityID + ActionID + Status. It has no
   name column and no field flagged IsNameField, so there is nothing for the join to select.
   CodeGen therefore creates the EntityField row announcing an `EntityAction` column, and then
   cannot emit that column into the view. Anything selecting it gets:

      Invalid column name 'EntityAction'

   The same request also breaks the entity's field ordering, because the metadata carries a field
   the view does not, which is what surfaced it: CodeGen's entityFieldsSequenceCheck reports a
   metadata/view mismatch at positions 8 and 9 of vwEntityActionInvocations, and integration bundle
   IT50 (oracle codegen-determinism.CD3) fails naming all four.

   Note this was invisible on long-lived databases: a previous CodeGen run had deleted the orphan
   EntityField rows there, so the mismatch — and IT50 — silently disappeared. It reproduces exactly
   on a database built only from migrations, which is where it was found.

   The fix is to stop asking. Sibling FKs are unaffected: InvocationTypeID keeps its flag and its
   working `InvocationType` column, because MJ: Entity Action Invocation Types does have a name.

   Targeted by (EntityID, Name) rather than by EntityField.ID, because the orphan rows are created
   by CodeGen and their IDs differ per database — on some they do not exist at all.
   ============================================================================================== */

DECLARE @EntityActionConsumers TABLE (EntityID uniqueidentifier PRIMARY KEY);
INSERT INTO @EntityActionConsumers (EntityID)
VALUES
   ('3E248F34-2837-EF11-86D4-6045BDEE16E6'),  -- MJ: Action Execution Logs
   ('39248F34-2837-EF11-86D4-6045BDEE16E6'),  -- MJ: Entity Action Filters
   ('35248F34-2837-EF11-86D4-6045BDEE16E6'),  -- MJ: Entity Action Invocations
   ('56248F34-2837-EF11-86D4-6045BDEE16E6');  -- MJ: Entity Action Params

/* 1. Stop the request. Without this, the next CodeGen run recreates the orphan field. */
UPDATE ef
   SET ef.[IncludeRelatedEntityNameFieldInBaseView] = 0,
       ef.[__mj_UpdatedAt] = GETUTCDATE()
FROM [${flyway:defaultSchema}].[EntityField] ef
JOIN @EntityActionConsumers c ON c.EntityID = ef.[EntityID]
WHERE ef.[Name] = 'EntityActionID'
  AND ef.[IncludeRelatedEntityNameFieldInBaseView] = 1;

/* 2. Remove the orphan virtual fields already created. Scoped to virtual fields named
      'EntityAction' on those four entities only — a real, view-backed column is never IsVirtual,
      so this cannot remove a working field. */
DELETE ef
FROM [${flyway:defaultSchema}].[EntityField] ef
JOIN @EntityActionConsumers c ON c.EntityID = ef.[EntityID]
WHERE ef.[Name] = 'EntityAction'
  AND ef.[IsVirtual] = 1;
