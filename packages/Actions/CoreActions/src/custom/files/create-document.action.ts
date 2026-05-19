import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from '@memberjunction/actions';
import { BaseFileHandlerAction } from "../utilities/base-file-handler";
import { ArtifactBuilderService, DocumentType, DocumentOptions } from "../utilities/artifact-builder-service";
import { JSONParamHelper } from "../utilities/json-param-helper";

/**
 * Creates a new in-progress document and returns a handle for incremental building.
 * The handle is used by subsequent actions (Add Document Content, Preview Document,
 * Modify Document Section, Finalize Document) to build the document piece by piece.
 *
 * Parameters:
 *   - DocumentType (required): 'pdf', 'docx', or 'xlsx'
 *   - FileName (optional): suggested filename (e.g., 'quarterly-report.docx')
 *   - Options (optional, JSON): type-specific options (page size, margins, fonts, etc.)
 *
 * Output:
 *   - Handle: UUID for the in-progress document
 */
@RegisterClass(BaseAction, "__CreateDocument")
export class CreateDocumentAction extends BaseFileHandlerAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const documentType = (this.getParamValue(params, 'documenttype') || '').toLowerCase() as DocumentType;
            if (!['pdf', 'docx', 'xlsx'].includes(documentType)) {
                return {
                    Success: false,
                    Message: "DocumentType must be 'pdf', 'docx', or 'xlsx'",
                    ResultCode: "INVALID_DOCUMENT_TYPE"
                };
            }

            const fileName = this.getParamValue(params, 'filename');
            const options = JSONParamHelper.getJSONParam(params, 'options') as DocumentOptions | null;

            const service = ArtifactBuilderService.Instance;
            const handle = service.CreateDocument(documentType, fileName ?? undefined, options ?? undefined);

            const defaultFileNames: Record<string, string> = { pdf: 'document.pdf', docx: 'document.docx', xlsx: 'workbook.xlsx' };

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify({
                    message: `Created new ${documentType.toUpperCase()} document. Use this handle with "Add Document Content" to build it incrementally.`,
                    handle,
                    documentType,
                    fileName: fileName || defaultFileNames[documentType],
                }, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to create document: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "CREATION_FAILED"
            };
        }
    }
}
