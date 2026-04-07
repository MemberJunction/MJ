import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from '@memberjunction/actions';
import { BaseFileHandlerAction } from "../utilities/base-file-handler";
import { ArtifactBuilderService, DocumentOperation } from "../utilities/artifact-builder-service";
import { JSONParamHelper } from "../utilities/json-param-helper";

/**
 * Replaces or removes a previously-added section in an in-progress document.
 * Section IDs are returned by Add Document Content and Preview Document.
 *
 * Parameters:
 *   - Handle (required): the document handle
 *   - SectionID (required): the section to modify
 *   - Action (required): 'replace' or 'remove'
 *   - Operations (required if Action='replace', JSON array): replacement operations
 *
 * Output:
 *   - success, updated section count
 */
@RegisterClass(BaseAction, "__ModifyDocumentSection")
export class ModifyDocumentSectionAction extends BaseFileHandlerAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const handle = this.getParamValue(params, 'handle');
            if (!handle) {
                return { Success: false, Message: "Handle parameter is required", ResultCode: "MISSING_HANDLE" };
            }

            const sectionId = this.getParamValue(params, 'sectionid');
            if (!sectionId) {
                return { Success: false, Message: "SectionID parameter is required", ResultCode: "MISSING_SECTION_ID" };
            }

            const action = (this.getParamValue(params, 'action') || '').toLowerCase();
            if (!['replace', 'remove'].includes(action)) {
                return { Success: false, Message: "Action must be 'replace' or 'remove'", ResultCode: "INVALID_ACTION" };
            }

            const service = ArtifactBuilderService.Instance;

            if (action === 'remove') {
                service.RemoveSection(handle.toString(), sectionId.toString());
            } else {
                let operations: DocumentOperation[];
                try {
                    operations = JSONParamHelper.getRequiredJSONParam(params, 'operations');
                } catch (error) {
                    return {
                        Success: false,
                        Message: "Operations parameter is required for 'replace' action",
                        ResultCode: "MISSING_OPERATIONS"
                    };
                }

                if (!Array.isArray(operations) || operations.length === 0) {
                    return { Success: false, Message: "Operations must be a non-empty array", ResultCode: "INVALID_OPERATIONS" };
                }

                service.ReplaceSection(handle.toString(), sectionId.toString(), operations);
            }

            const preview = service.GetPreview(handle.toString());

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify({
                    message: `Section ${action === 'remove' ? 'removed' : 'replaced'} successfully. Document now has ${preview.sectionCount} section(s).`,
                    totalSections: preview.sectionCount,
                    totalOperations: preview.totalOperations,
                }, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to modify section: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "MODIFY_FAILED"
            };
        }
    }
}
