import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { SignatureDocumentInput, SignatureRecipientInput } from '@memberjunction/esignature';
import { BaseSignatureAction } from './base-esignature.action';

/** Shape of a document entry supplied to the action (bytes are base64). */
interface DocumentParamInput {
    filename: string;
    contentType?: string;
    /** Base64-encoded document bytes. */
    contentBase64: string;
}

/**
 * Action: "Send Document for Signature".
 *
 * Sends one or more documents through a configured signature account/provider and records the
 * envelope lifecycle. Thin wrapper over {@link SignatureEngine.SendForSignature}.
 *
 * Inputs:
 *   - SignatureAccountID (required)
 *   - Title (required)
 *   - Documents (required) — array of `{ filename, contentType?, contentBase64 }`
 *   - Recipients (required) — array of `{ email, name?, routingOrder?, role? }`
 *   - Message?, EntityID?, RecordID?, ArtifactID?, ArtifactVersionID?, SendImmediately?, Metadata?
 *
 * Outputs: SignatureRequestID, ExternalEnvelopeID, Status.
 */
@RegisterClass(BaseAction, 'Send Document for Signature')
export class SendDocumentForSignatureAction extends BaseSignatureAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const signatureAccountId = this.getStringParam(params, 'SignatureAccountID');
        const title = this.getStringParam(params, 'Title');
        const documents = this.parseDocuments(params);
        const recipients = this.parseRecipients(params);

        if (!signatureAccountId) {
            return this.fail('ACCOUNT_NOT_FOUND', "Parameter 'SignatureAccountID' is required.");
        }
        if (!title) {
            return this.fail('PROVIDER_ERROR', "Parameter 'Title' is required.");
        }
        if (!documents.length) {
            return this.fail('MISSING_DOCUMENT', "Parameter 'Documents' must contain at least one document with contentBase64.");
        }
        if (!recipients.length) {
            return this.fail('PROVIDER_ERROR', "Parameter 'Recipients' must contain at least one recipient with an email.");
        }

        try {
            const engine = await this.ensureEngine(params);
            const result = await engine.SendForSignature({
                signatureAccountId,
                title,
                message: this.getStringParam(params, 'Message'),
                documents,
                recipients,
                artifactId: this.getStringParam(params, 'ArtifactID'),
                artifactVersionId: this.getStringParam(params, 'ArtifactVersionID'),
                entityId: this.getStringParam(params, 'EntityID'),
                recordId: this.getStringParam(params, 'RecordID'),
                sendImmediately: this.getBooleanParam(params, 'SendImmediately', true),
                metadata: this.getObjectParam<Record<string, string>>(params, 'Metadata'),
                contextUser: params.ContextUser,
            });

            if (!result.Success) {
                return this.fail('PROVIDER_ERROR', result.ErrorMessage ?? 'Send failed.', params, result.signatureRequestId);
            }

            this.addOutput(params, 'SignatureRequestID', result.signatureRequestId);
            this.addOutput(params, 'ExternalEnvelopeID', result.externalEnvelopeId);
            this.addOutput(params, 'Status', result.status);

            const sentImmediately = this.getBooleanParam(params, 'SendImmediately', true);
            return {
                Success: true,
                ResultCode: sentImmediately ? 'SENT' : 'DRAFT_CREATED',
                Message: `Signature request ${result.signatureRequestId} (${result.status}).`,
                Params: params.Params,
            };
        } catch (e) {
            return this.fail('PROVIDER_ERROR', e instanceof Error ? e.message : String(e), params);
        }
    }

    private parseDocuments(params: RunActionParams): SignatureDocumentInput[] {
        const raw = this.getObjectParam<DocumentParamInput[]>(params, 'Documents');
        if (!Array.isArray(raw)) {
            return [];
        }
        return raw
            .filter((d) => d && d.filename && d.contentBase64)
            .map((d) => ({
                filename: d.filename,
                contentType: d.contentType ?? 'application/pdf',
                bytes: Buffer.from(d.contentBase64, 'base64'),
            }));
    }

    private parseRecipients(params: RunActionParams): SignatureRecipientInput[] {
        const raw = this.getObjectParam<SignatureRecipientInput[]>(params, 'Recipients');
        if (!Array.isArray(raw)) {
            return [];
        }
        return raw.filter((r) => r && r.email);
    }

    private fail(resultCode: string, message: string, params?: RunActionParams, signatureRequestId?: string): ActionResultSimple {
        if (params && signatureRequestId) {
            this.addOutput(params, 'SignatureRequestID', signatureRequestId);
        }
        return { Success: false, ResultCode: resultCode, Message: message, Params: params?.Params };
    }
}
