/**
 * Strategy interfaces for writing data back to external systems.
 * Connectors declare which CRUD operations they support; read-only
 * connectors use ReadOnlyWriteback which throws on any write call.
 */

import type { CRUDResult, CreateRecordContext, UpdateRecordContext, DeleteRecordContext } from '../types.js';

/** A writeback strategy implementation */
export interface WritebackStrategy {
    /** Whether this connector supports creating records */
    SupportsCreate: boolean;
    /** Whether this connector supports updating records */
    SupportsUpdate: boolean;
    /** Whether this connector supports deleting records */
    SupportsDelete: boolean;
    /** Whether this connector supports upsert (create-or-update) */
    SupportsUpsert: boolean;
    /**
     * Create a new record in the external system.
     * @throws if SupportsCreate is false
     */
    Create(context: CreateRecordContext): Promise<CRUDResult>;
    /**
     * Update an existing record in the external system.
     * @throws if SupportsUpdate is false
     */
    Update(context: UpdateRecordContext): Promise<CRUDResult>;
    /**
     * Delete a record from the external system.
     * @throws if SupportsDelete is false
     */
    Delete(context: DeleteRecordContext): Promise<CRUDResult>;
    /**
     * Create or update a record (upsert) in the external system.
     * @throws if SupportsUpsert is false
     */
    Upsert?(context: UpdateRecordContext): Promise<CRUDResult>;
}
