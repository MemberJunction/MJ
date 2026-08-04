import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { BaseSignatureAction } from './base-esignature.action';

/**
 * Action: "Void Signature Request".
 *
 * Voids/cancels an in-flight signature request with a reason. Thin wrapper over
 * {@link SignatureEngine.Void}.
 *
 * Inputs: SignatureRequestID (required), Reason (required).
 * Outputs: Status.
 */
@RegisterClass(BaseAction, 'Void Signature Request')
export class VoidSignatureRequestAction extends BaseSignatureAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const requestId = this.getStringParam(params, 'SignatureRequestID');
        const reason = this.getStringParam(params, 'Reason');
        if (!requestId) {
            return { Success: false, ResultCode: 'PROVIDER_ERROR', Message: "Parameter 'SignatureRequestID' is required." };
        }
        if (!reason) {
            return { Success: false, ResultCode: 'PROVIDER_ERROR', Message: "Parameter 'Reason' is required." };
        }

        try {
            const engine = await this.ensureEngine(params);
            const result = await engine.Void(requestId, reason, params.ContextUser);

            if (!result.Success) {
                return { Success: false, ResultCode: 'PROVIDER_ERROR', Message: result.ErrorMessage ?? 'Void failed.' };
            }

            this.addOutput(params, 'Status', 'Voided');
            return { Success: true, ResultCode: 'VOIDED', Message: 'Signature request voided.', Params: params.Params };
        } catch (e) {
            return { Success: false, ResultCode: 'PROVIDER_ERROR', Message: e instanceof Error ? e.message : String(e) };
        }
    }
}
