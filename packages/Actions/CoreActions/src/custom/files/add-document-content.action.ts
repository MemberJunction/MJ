import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from '@memberjunction/actions';
import { BaseFileHandlerAction } from "../utilities/base-file-handler";
import { ArtifactBuilderService, DocumentOperation } from "../utilities/artifact-builder-service";
import { JSONParamHelper } from "../utilities/json-param-helper";

/**
 * Appends content operations to an existing in-progress document.
 * Each call creates a new section that can later be modified or removed by ID.
 *
 * Parameters:
 *   - Handle (required): the document handle from Create Document
 *   - Operations (required, JSON array): array of DocumentOperation objects
 *     Each operation has a "type" field: heading, paragraph, table, list, image, hr, pageBreak,
 *     sheet (Excel), formula (Excel)
 *
 * Output:
 *   - sectionIds: array of section IDs created
 *   - totalSections: total number of sections in the document
 */
@RegisterClass(BaseAction, "__AddDocumentContent")
export class AddDocumentContentAction extends BaseFileHandlerAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const handle = this.getParamValue(params, 'handle');
            if (!handle) {
                return { Success: false, Message: "Handle parameter is required", ResultCode: "MISSING_HANDLE" };
            }

            let operations: DocumentOperation[];
            try {
                operations = JSONParamHelper.getRequiredJSONParam(params, 'operations');
            } catch (error) {
                return {
                    Success: false,
                    Message: error instanceof Error ? error.message : String(error),
                    ResultCode: "MISSING_OPERATIONS"
                };
            }

            if (!Array.isArray(operations) || operations.length === 0) {
                return { Success: false, Message: "Operations must be a non-empty array", ResultCode: "INVALID_OPERATIONS" };
            }

            const service = ArtifactBuilderService.Instance;
            const sectionIds = service.AddContent(handle.toString(), operations);
            const preview = service.GetPreview(handle.toString());

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify({
                    message: `Added ${operations.length} operation(s) as a new section. Document now has ${preview.sectionCount} section(s).`,
                    sectionIds,
                    totalSections: preview.sectionCount,
                    totalOperations: preview.totalOperations,
                }, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to add content: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "ADD_FAILED"
            };
        }
    }
}
