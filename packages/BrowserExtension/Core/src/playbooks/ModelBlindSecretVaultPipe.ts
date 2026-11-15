/**
 * @fileoverview `ModelBlindSecretVaultPipe` — Model-Blind Secret Capture & Vaulting Pipe
 * for Guided Admin Playbooks in the MemberJunction Browser Extension.
 *
 * When a user generates an OAuth Client Secret, API Key, or Tenant Secret in a third-party
 * admin portal (e.g., HubSpot Developer Portal, Microsoft Entra ID, Stripe, Google Cloud Console),
 * this pipe reads the secret value directly from the DOM selector inside the Content Script and
 * transmits it over an authenticated GraphQL mutation straight to the MemberJunction Credential Vault.
 *
 * **Security Invariant:** The plaintext secret value is NEVER returned to the LLM context, tool
 * result payload, or conversation transcript. The returned {@link ModelBlindSecretVaultResult}
 * carries only `{ CredentialID, VaultTargetFieldName, SecretByteLength, RedactedPreview: '••••••••', ModelBlindVerified: true }`.
 *
 * @module @memberjunction/browser-extension-core
 */

import type {
    IContentScriptDomBridge,
    ModelBlindSecretVaultRequest,
    ModelBlindSecretVaultResult,
} from '../types/extension-types.js';
import { REDACTED_SENTINEL } from '../security/SensitivePageGuard.js';

/**
 * Interface for persisting a captured secret directly into the MemberJunction Credential Vault.
 */
export interface IMJCredentialVaultWriter {
    WriteSecretToVault(params: {
        CredentialName: string;
        CredentialTypeName?: string;
        TargetFieldName: string;
        PlaintextSecretValue: string;
    }): Promise<{ Success: boolean; CredentialID?: string; ErrorMessage?: string }>;
}

/**
 * Model-Blind Secret Vault Pipe (`CopySecretToMJVault`).
 */
export class ModelBlindSecretVaultPipe {
    private readonly domBridge: IContentScriptDomBridge;
    private readonly vaultWriter: IMJCredentialVaultWriter;

    public constructor(options: {
        DomBridge: IContentScriptDomBridge;
        VaultWriter: IMJCredentialVaultWriter;
    }) {
        this.domBridge = options.DomBridge;
        this.vaultWriter = options.VaultWriter;
    }

    /**
     * Reads a secret from `request.SourceSelector` via the Content Script DOM bridge and writes it
     * directly to the MemberJunction Credential Vault without exposing the plaintext secret in the
     * returned result object.
     */
    public async CopySecretToMJVault(
        request: ModelBlindSecretVaultRequest
    ): Promise<ModelBlindSecretVaultResult> {
        const extracted = await this.domBridge.ExtractSecretValue(request.SourceSelector);
        if (!extracted || extracted.trim().length === 0) {
            return {
                Success: false,
                VaultTargetFieldName: request.VaultTargetFieldName,
                SecretByteLength: 0,
                RedactedPreview: REDACTED_SENTINEL,
                ModelBlindVerified: true,
                ErrorMessage: `No secret value found at selector "${request.SourceSelector}".`,
            };
        }

        const cleanSecret = extracted.trim();
        const byteLength = new TextEncoder().encode(cleanSecret).byteLength;

        const writeResult = await this.vaultWriter.WriteSecretToVault({
            CredentialName: request.VaultCredentialName,
            CredentialTypeName: request.CredentialTypeName,
            TargetFieldName: request.VaultTargetFieldName,
            PlaintextSecretValue: cleanSecret,
        });

        if (!writeResult.Success) {
            return {
                Success: false,
                VaultTargetFieldName: request.VaultTargetFieldName,
                SecretByteLength: byteLength,
                RedactedPreview: REDACTED_SENTINEL,
                ModelBlindVerified: true,
                ErrorMessage: writeResult.ErrorMessage ?? 'Failed to write secret to MJ Credential Vault.',
            };
        }

        return {
            Success: true,
            CredentialID: writeResult.CredentialID,
            VaultTargetFieldName: request.VaultTargetFieldName,
            SecretByteLength: byteLength,
            RedactedPreview: REDACTED_SENTINEL,
            ModelBlindVerified: true,
        };
    }
}
