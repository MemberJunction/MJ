/**
 * Read-only writeback strategy.
 * Used by connectors that do not support write operations.
 * All write methods throw an error indicating the operation is unsupported.
 */
import type { WritebackStrategy } from '../../WritebackStrategy.js';
import type { CRUDResult, CreateRecordContext, UpdateRecordContext, DeleteRecordContext } from '../../../types.js';

export class ReadOnlyWriteback implements WritebackStrategy {
    public readonly SupportsCreate = false;
    public readonly SupportsUpdate = false;
    public readonly SupportsDelete = false;
    public readonly SupportsUpsert = false;

    public async Create(_context: CreateRecordContext): Promise<CRUDResult> {
        throw new Error('Write operations not supported by this connector');
    }

    public async Update(_context: UpdateRecordContext): Promise<CRUDResult> {
        throw new Error('Write operations not supported by this connector');
    }

    public async Delete(_context: DeleteRecordContext): Promise<CRUDResult> {
        throw new Error('Write operations not supported by this connector');
    }

    public async Upsert(_context: UpdateRecordContext): Promise<CRUDResult> {
        throw new Error('Write operations not supported by this connector');
    }
}
