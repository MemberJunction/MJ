import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { BaseSignatureAction } from './base-esignature.action';

/**
 * Action: "Download Signed Document".
 *
 * Downloads the executed/signed document for a completed signature request and records it as a
 * `Signed`-role document. Thin wrapper over {@link SignatureEngine.DownloadSigned}.
 *
 * Inputs: SignatureRequestID (required).
 * Outputs: DocumentBase64, Filename, ContentType.
 */
@RegisterClass(BaseAction, 'Download Signed Document')
export class DownloadSignedDocumentAction extends BaseSignatureAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const requestId = this.getStringParam(params, 'SignatureRequestID');
        if (!requestId) {
            return { Success: false, ResultCode: 'PROVIDER_ERROR', Message: "Parameter 'SignatureRequestID' is required." };
        }

        try {
            const engine = await this.ensureEngine(params);
            const result = await engine.DownloadSigned(requestId, params.ContextUser);

            if (!result.Success || !result.document) {
                const notCompleted = (result.ErrorMessage ?? '').includes('not been sent');
                return {
                    Success: false,
                    ResultCode: notCompleted ? 'NOT_COMPLETED' : 'PROVIDER_ERROR',
                    Message: result.ErrorMessage ?? 'Download failed.',
                };
            }

            this.addOutput(params, 'DocumentBase64', result.document.bytes.toString('base64'));
            this.addOutput(params, 'Filename', result.document.filename);
            this.addOutput(params, 'ContentType', result.document.contentType);
            return { Success: true, ResultCode: 'OK', Message: `Downloaded ${result.document.filename}.`, Params: params.Params };
        } catch (e) {
            return { Success: false, ResultCode: 'PROVIDER_ERROR', Message: e instanceof Error ? e.message : String(e) };
        }
    }
}
