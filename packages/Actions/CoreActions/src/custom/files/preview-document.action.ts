import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from '@memberjunction/actions';
import { BaseFileHandlerAction } from "../utilities/base-file-handler";
import { ArtifactBuilderService } from "../utilities/artifact-builder-service";

/**
 * Returns a summary of the current state of an in-progress document.
 * Useful for the LLM to check what it has built so far before adding more or finalizing.
 *
 * Parameters:
 *   - Handle (required): the document handle from Create Document
 *
 * Output:
 *   - Document type, filename, section count
 *   - Per-section: ID, operation count, content summary
 */
@RegisterClass(BaseAction, "__PreviewDocument")
export class PreviewDocumentAction extends BaseFileHandlerAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const handle = this.getParamValue(params, 'handle');
            if (!handle) {
                return { Success: false, Message: "Handle parameter is required", ResultCode: "MISSING_HANDLE" };
            }

            const service = ArtifactBuilderService.Instance;
            const preview = service.GetPreview(handle.toString());

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify(preview, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to preview document: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "PREVIEW_FAILED"
            };
        }
    }
}
