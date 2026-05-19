import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from '@memberjunction/actions';
import { BaseFileHandlerAction } from "../utilities/base-file-handler";
import { ArtifactBuilderService } from "../utilities/artifact-builder-service";

/**
 * Finalizes an in-progress document: renders it to a binary file, saves to MJStorage,
 * and outputs the FileOutput param for automatic artifact creation.
 *
 * After finalization, the document handle is disposed and cannot be used again.
 *
 * Parameters:
 *   - Handle (required): the document handle
 *   - FileName (optional): override the filename set at creation
 *   - StorageAccountName (optional): name of the storage account to use
 *   - StoragePath (optional): custom storage path prefix
 *
 * Output:
 *   - FileOutput: { fileName, mimeType, sizeBytes, fileId }
 */
@RegisterClass(BaseAction, "__FinalizeDocument")
export class FinalizeDocumentAction extends BaseFileHandlerAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const handle = this.getParamValue(params, 'handle');
            if (!handle) {
                return { Success: false, Message: "Handle parameter is required", ResultCode: "MISSING_HANDLE" };
            }

            const fileNameOverride = this.getParamValue(params, 'filename');
            const storageAccountName = this.getParamValue(params, 'storageaccountname');
            const storagePath = this.getParamValue(params, 'storagepath');

            const service = ArtifactBuilderService.Instance;
            const result = await service.Finalize(handle.toString());

            const fileName = fileNameOverride?.toString() || result.fileName;

            // Save to MJStorage
            try {
                const fileId = await this.saveToMJStorage(
                    result.buffer,
                    fileName,
                    result.mimeType,
                    params,
                    storageAccountName?.toString(),
                    storagePath?.toString()
                );

                params.Params.push({
                    Name: 'FileOutput',
                    Type: 'Output',
                    Value: { fileName, mimeType: result.mimeType, sizeBytes: result.buffer.length, fileId }
                });

                return {
                    Success: true,
                    ResultCode: "SUCCESS_SAVED",
                    Message: JSON.stringify({
                        message: "Document finalized and saved successfully",
                        fileId,
                        fileName,
                        mimeType: result.mimeType,
                        sizeBytes: result.buffer.length,
                    }, null, 2)
                };
            } catch (storageError) {
                // Fall back to base64 if storage fails
                console.error('Failed to save to storage:', storageError);
                const base64Data = result.buffer.toString('base64');
                params.Params.push({
                    Name: 'FileOutput',
                    Type: 'Output',
                    Value: { fileName, mimeType: result.mimeType, sizeBytes: result.buffer.length, fileData: base64Data }
                });

                return {
                    Success: true,
                    ResultCode: "SUCCESS",
                    Message: JSON.stringify({
                        message: "Document finalized (base64 fallback)",
                        fileName,
                        mimeType: result.mimeType,
                        sizeBytes: result.buffer.length,
                        base64Length: base64Data.length,
                    }, null, 2)
                };
            }

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to finalize document: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "FINALIZE_FAILED"
            };
        }
    }
}
