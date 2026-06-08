import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { BaseSignatureAction } from './base-esignature.action';

/**
 * Action: "Get Signature Status".
 *
 * Polls the provider for the current envelope status of a signature request and persists it.
 * Thin wrapper over {@link SignatureEngine.RefreshStatus}.
 *
 * Inputs: SignatureRequestID (required).
 * Outputs: Status.
 */
@RegisterClass(BaseAction, 'Get Signature Status')
export class GetSignatureStatusAction extends BaseSignatureAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const requestId = this.getStringParam(params, 'SignatureRequestID');
        if (!requestId) {
            return { Success: false, ResultCode: 'PROVIDER_ERROR', Message: "Parameter 'SignatureRequestID' is required." };
        }

        try {
            const engine = await this.ensureEngine(params);
            const result = await engine.RefreshStatus(requestId, params.ContextUser);

            if (!result.Success) {
                const notSent = (result.ErrorMessage ?? '').includes('not been sent');
                return {
                    Success: false,
                    ResultCode: notSent ? 'NOT_SENT' : 'PROVIDER_ERROR',
                    Message: result.ErrorMessage ?? 'Status check failed.',
                };
            }

            this.addOutput(params, 'Status', result.status);
            return { Success: true, ResultCode: 'OK', Message: `Status: ${result.status}.`, Params: params.Params };
        } catch (e) {
            return { Success: false, ResultCode: 'PROVIDER_ERROR', Message: e instanceof Error ? e.message : String(e) };
        }
    }
}
