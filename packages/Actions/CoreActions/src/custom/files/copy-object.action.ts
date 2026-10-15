import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { StorageAccountAccess } from "@memberjunction/storage";
import { BaseFileStorageAction } from "./base-file-storage.action";

/**
 * Action for copying a file object within a storage provider.
 *
 * @example
 * ```typescript
 * await runAction({
 *   ActionName: 'Copy Storage Object',
 *   Params: [{
 *     Name: 'StorageAccount',
 *     Value: 'Azure Blob Storage'
 *   }, {
 *     Name: 'SourceObjectName',
 *     Value: 'drafts/document.pdf'
 *   }, {
 *     Name: 'DestinationObjectName',
 *     Value: 'archive/document.pdf'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "File Storage: Copy Object")
export class CopyObjectAction extends BaseFileStorageAction {

    /** {@inheritDoc BaseFileStorageAction.AccountAccess} — this action WRITES to the account. */
    protected override get AccountAccess(): StorageAccountAccess {
        return 'Write';
    }

    /**
     * Copy a file object
     *
     * @param params - The action parameters:
     *   - StorageAccount: Required - Name of the storage provider
     *   - SourceObjectName: Required - Source file path
     *   - DestinationObjectName: Required - Destination file path
     *
     * @returns Operation result with:
     *   - Success: Boolean indicating if the copy succeeded
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Get and initialize storage driver
            const { driver, account, error } = await this.getDriverFromParams(params);
            if (error) return error;

            // Get required parameters
            const sourceObjectName = this.getStringParam(params, 'sourceobjectname');
            if (!sourceObjectName) {
                return this.createErrorResult(
                    "SourceObjectName parameter is required",
                    "MISSING_SOURCE"
                );
            }

            const destinationObjectName = this.getStringParam(params, 'destinationobjectname');
            if (!destinationObjectName) {
                return this.createErrorResult(
                    "DestinationObjectName parameter is required",
                    "MISSING_DESTINATION"
                );
            }

            // Tracked-file rule on both ends: the source is read (a copy would untrack it), the destination may be overwritten
            const refused = await this.CheckObjectsReadable(account!, driver!, [sourceObjectName, destinationObjectName], params.ContextUser);
            if (refused) return refused;

            // Execute the copy operation
            const success: boolean = await driver!.CopyObject(sourceObjectName, destinationObjectName);

            // Add output parameter
            this.addOutputParam(params, 'Success', success);

            return this.createSuccessResult({
                operation: 'CopyObject',
                sourceObjectName,
                destinationObjectName,
                success
            }, params);

        } catch (error) {
            return this.createErrorResult(
                `Copy object operation failed: ${error instanceof Error ? error.message : String(error)}`,
                "OPERATION_FAILED"
            );
        }
    }
}
