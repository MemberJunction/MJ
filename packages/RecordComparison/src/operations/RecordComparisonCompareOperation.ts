/**
 * @fileoverview Server implementation of the `RecordComparison.Compare` Remote Operation — loads a
 * set of an entity's records by composite key and computes the field-level delta matrix between them.
 *
 * Extends the CodeGen-emitted {@link RecordComparisonCompareOperation} base in
 * `@memberjunction/core-entities` (`generated/remote_operations.ts` — operation key + typed I/O, from
 * the `MJ: Remote Operations` row) and supplies the server body via {@link RecordComparisonEngine}.
 * Registered under `RecordComparison.Compare`; replaces the bespoke `GetRecordComparison` GraphQL
 * resolver + the hand-written `GraphQLRecordComparisonClient` transport.
 *
 * @module @memberjunction/record-comparison
 */
import { RegisterClass } from '@memberjunction/global';
import { BaseRemotableOperation, CompositeKey, IMetadataProvider, KeyValuePair, UserInfo } from '@memberjunction/core';
import {
    RecordComparisonCompareOperation,
    type RecordComparisonCompareInput,
    type RecordComparisonCompareOutput,
    type RecordComparisonKey,
} from '@memberjunction/core-entities';
import { RecordComparisonEngine, RecordComparisonInput } from '../RecordComparisonEngine';

@RegisterClass(BaseRemotableOperation, 'RecordComparison.Compare')
export class RecordComparisonCompareServerOperation extends RecordComparisonCompareOperation {
    protected async InternalExecute(
        input: RecordComparisonCompareInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<RecordComparisonCompareOutput> {
        if (!input?.EntityName) {
            throw new Error('EntityName is required');
        }

        const engineInput: RecordComparisonInput = {
            EntityName: input.EntityName,
            Keys: (input.Keys ?? []).map((k) => this.toCompositeKey(k)),
            IncludeFields: input.IncludeFields,
        };

        const result = await new RecordComparisonEngine().CompareRecords(engineInput, user, provider);
        if (!result.Success) {
            // Surface as a logical failure on the wrapping RemoteOpResult.
            throw new Error(result.ErrorMessage ?? 'Record comparison failed');
        }

        return {
            EntityName: result.EntityName,
            Records: result.Records ?? [],
            Fields: result.Fields ?? [],
        };
    }

    /** Builds a {@link CompositeKey} from a wire-form comparison key. */
    private toCompositeKey(key: RecordComparisonKey): CompositeKey {
        const pairs = (key.KeyValuePairs ?? []).map((kvp) => {
            const pair = new KeyValuePair();
            pair.FieldName = kvp.FieldName;
            pair.Value = kvp.Value;
            return pair;
        });
        return CompositeKey.FromKeyValuePairs(pairs);
    }
}

/** Tree-shaking anchor — referenced so bundlers retain the `@RegisterClass` registration. */
export function LoadRecordComparisonCompareOperation(): void {
    // intentionally empty
}
