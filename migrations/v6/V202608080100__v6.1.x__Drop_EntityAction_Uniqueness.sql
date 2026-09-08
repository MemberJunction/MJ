/*
    Drop UQ_EntityAction_ActionID_EntityID.

    An entity may bind the same Action more than once. Three independent reasons say so, and the
    third is the one that makes this a correction rather than a preference.

    1. THE CONSTRAINT WAS APPLIED OUTSIDE ITS OWN DECLARED SCOPE.
       V202605221002__v5.37.x__Add_Unique_Constraints_To_MJ_Junction_Tables states its scope as
       "pure junction tables ... two foreign-key columns plus ID/Sequence/timestamps, with no other
       meaningful data columns." EntityAction already carried Status, Sequence and LoggingMode, and
       owned three child collections (EntityActionInvocation, EntityActionParam, EntityActionFilter).
       It is an association-with-attributes, not a link table, and did not meet that predicate on the
       day the constraint was added.

    2. A LATER MIGRATION MADE THE CONSTRAINT SELF-DEFEATING.
       V202608042200__v6.1.x__EntityAction_Workflow_Extensions added ScopeEntityID/ScopeRecordID so a
       binding can attach to one specific record ("this Deal Type"). Under a uniqueness rule on
       (ActionID, EntityID) there can only ever be ONE scope per action per entity — so "every Deal"
       and "this Deal Type" cannot coexist, and the scope columns cannot do the job they were added
       for. The columns are the newer, deliberate design; the uniqueness is the older assumption they
       invalidated.

    3. PARAMS, FILTERS AND SCOPE HANG OFF THE BINDING; INVOCATIONS HANG OFF IT TOO.
       One row per (entity, action) therefore forces ONE parameter set, ONE filter set and ONE scope
       to be shared across every event that action responds to. "On create run agent X, on update run
       agent Y" is unexpressible. That is an ordinary requirement, not an exotic one — it is also
       exactly what blocks more than one entity-triggered workflow per entity, since every workflow
       dispatches through the single shared 'Execute Agent' action.

    NO REPLACEMENT CONSTRAINT. A narrower unique index on
    (ActionID, EntityID, ScopeEntityID, ScopeRecordID) was considered and rejected: it would still
    refuse two unscoped bindings that differ only by invocation type, which is reason 3 above. The
    duplicate protection the v5.37 sweep wanted belongs in the writers, which is where it now lives —
    e.g. WorkflowSpecSync matches its own binding by the agent it dispatches to before creating one.

    NOTHING IN THE RUNTIME ASSUMED UNIQUENESS. Every accessor already returns a collection
    (GetActionsByEntityName, GetActionsByEntityID, GetActionsByEntityNameAndInvocationType) and
    GenericDatabaseProvider.HandleEntityActions already iterates them, so this is a schema-only
    change with no consumer rewrite.

    ONE-WAY NOTE FOR OPERATORS. The v5.37 sweep did not merely add the constraint — it first DELETED
    pre-existing duplicate (ActionID, EntityID) rows, keeping the earliest by __mj_CreatedAt. Dropping
    the constraint does not restore those rows. In practice there was little reason to have had them:
    per-record scoping did not exist until v6.1.x, three months later. Installs that relied on
    duplicate bindings before v5.37 should check the migration log from that upgrade.
*/

-- =====================================================================================
-- EntityAction: allow multiple bindings of one Action to one Entity
-- =====================================================================================
IF EXISTS (
    SELECT 1
    FROM sys.key_constraints kc
    INNER JOIN sys.schemas s ON s.schema_id = kc.schema_id
    INNER JOIN sys.tables t ON t.object_id = kc.parent_object_id
    WHERE kc.name = N'UQ_EntityAction_ActionID_EntityID'
      AND s.name = N'${flyway:defaultSchema}'
      AND t.name = N'EntityAction'
)
BEGIN
    ALTER TABLE ${flyway:defaultSchema}.EntityAction
        DROP CONSTRAINT UQ_EntityAction_ActionID_EntityID;

    PRINT N'__mj.EntityAction: dropped UQ_EntityAction_ActionID_EntityID — an entity may now bind the same action more than once (different events, params, filters or scopes).';
END
ELSE
BEGIN
    PRINT N'__mj.EntityAction: UQ_EntityAction_ActionID_EntityID not present — nothing to drop.';
END
GO
