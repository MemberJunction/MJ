import { BaseEntity, CompositeKey, EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { EntityAIActionParams } from '@memberjunction/aiengine';

export const ENTITY_AI_ACTION_REFERENCE_KIND = 'EntityAIActionReference';

/**
 * Serialisable stand-in for EntityAIActionParams. The live BaseEntity is replaced by the entity name and the
 * record's canonical RecordID (CompositeKey.ToRecordID), so the task can be stored as JSON and executed later,
 * in another process, against the record's current state.
 */
export type EntityAIActionTaskReference = {
    kind: typeof ENTITY_AI_ACTION_REFERENCE_KIND;
    entityAIActionId: string;
    actionId: string;
    modelId: string;
    entityName: string;
    recordID: string;
};

const STRING_FIELDS = ['entityAIActionId', 'actionId', 'modelId', 'entityName', 'recordID'] as const;

/**
 * A reference that can never resolve: unknown entity, a recordID that does not match the entity's primary key, or
 * task data that is not a reference at all. Retrying cannot help, so durable callers dead-letter it immediately.
 */
export class EntityAIActionReferenceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'EntityAIActionReferenceError';
    }
}

export function ToEntityAIActionTaskReference(params: EntityAIActionParams): EntityAIActionTaskReference {
    const record = params.entityRecord;
    return {
        kind: ENTITY_AI_ACTION_REFERENCE_KIND,
        entityAIActionId: params.entityAIActionId,
        actionId: params.actionId,
        modelId: params.modelId,
        entityName: record.EntityInfo.Name,
        recordID: record.PrimaryKey.ToRecordID(),
    };
}

export function IsEntityAIActionTaskReference(value: unknown): value is EntityAIActionTaskReference {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    const candidate = value as Record<string, unknown>;
    return candidate.kind === ENTITY_AI_ACTION_REFERENCE_KIND
        && STRING_FIELDS.every((field) => typeof candidate[field] === 'string');
}

/**
 * Loads the referenced record and rebuilds EntityAIActionParams. Returns null when the record cannot be loaded:
 * it was deleted since the task was enqueued, or — on PostgreSQL, which enqueues before its transaction commits —
 * it is not visible yet. Callers that can retry should.
 */
export async function ResolveEntityAIActionTaskReference(
    reference: EntityAIActionTaskReference,
    provider: IMetadataProvider,
    contextUser: UserInfo,
): Promise<EntityAIActionParams | null> {
    const entityInfo = provider.EntityByName(reference.entityName);
    if (!entityInfo) {
        throw new EntityAIActionReferenceError(`Entity '${reference.entityName}' referenced by an Entity AI Action task was not found in metadata`);
    }
    const key = keyFor(entityInfo, reference);
    const record = await provider.GetEntityObject<BaseEntity>(reference.entityName, contextUser);
    if (!(await record.InnerLoad(key))) {
        return null;
    }
    return {
        entityAIActionId: reference.entityAIActionId,
        actionId: reference.actionId,
        modelId: reference.modelId,
        entityRecord: record,
    };
}

/** CompositeKey.FromRecordID validates the recordID against the entity's primary key and throws on a mismatch. */
function keyFor(entityInfo: EntityInfo, reference: EntityAIActionTaskReference): CompositeKey {
    try {
        return CompositeKey.FromRecordID(entityInfo, reference.recordID);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new EntityAIActionReferenceError(`RecordID '${reference.recordID}' is not a valid key for entity '${reference.entityName}': ${message}`);
    }
}
