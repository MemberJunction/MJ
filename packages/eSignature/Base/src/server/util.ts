import { LogStatus, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { CredentialEngine } from '@memberjunction/credentials';
import { MJSignatureAccountEntity, MJSignatureProviderEntity } from '@memberjunction/core-entities';
import { BaseSignatureProvider } from '../BaseSignatureProvider';
import { SignatureProviderConfig, SignatureTokenRefreshCallback } from '../types';

/** Options for initializing a signature driver from an account + provider pair. */
export interface AccountSignatureDriverOptions {
    /** The signature account entity (carries CredentialID + Configuration). */
    accountEntity: MJSignatureAccountEntity;
    /** The signature provider entity (carries ServerDriverKey + Configuration). */
    providerEntity: MJSignatureProviderEntity;
    /** Context user for DB operations and credential decryption. */
    contextUser: UserInfo;
}

/**
 * Resolve + initialize a signature provider driver for an account, using the Credential Engine.
 *
 * Mirrors MJStorage's `initializeDriverWithAccountCredentials`:
 * 1. Resolve the driver by `provider.ServerDriverKey` via `MJGlobal.ClassFactory`.
 * 2. Merge provider Configuration (defaults) + account Configuration (overrides) into the base config.
 * 3. If the account has a CredentialID, decrypt it via the Credential Engine and overlay the values,
 *    wiring an `onTokenRefresh` callback that persists rotated tokens back via `updateCredential`.
 * 4. Call `driver.initialize(...)`.
 *
 * Credential values take precedence over Configuration, matching the Storage merge order.
 */
export async function initializeDriverWithAccountCredentials(
    options: AccountSignatureDriverOptions,
): Promise<BaseSignatureProvider> {
    const { accountEntity, providerEntity, contextUser } = options;

    const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseSignatureProvider>(
        BaseSignatureProvider,
        providerEntity.ServerDriverKey,
    );
    if (!driver) {
        throw new Error(
            `Failed to create signature driver for provider "${providerEntity.Name}" ` +
                `with driver key "${providerEntity.ServerDriverKey}".`,
        );
    }

    const baseConfig = buildBaseConfig(accountEntity, providerEntity);

    if (accountEntity.CredentialID) {
        await applyCredentialValues(driver, baseConfig, accountEntity, contextUser);
    } else {
        await driver.initialize(baseConfig);
        LogStatus(
            `[eSignature] Initialized account "${accountEntity.Name}" from Configuration only (no credential set).`,
        );
    }

    return driver;
}

/** Build the non-secret base config: account identity + merged provider/account Configuration JSON. */
function buildBaseConfig(
    accountEntity: MJSignatureAccountEntity,
    providerEntity: MJSignatureProviderEntity,
): SignatureProviderConfig {
    return {
        accountId: accountEntity.ID,
        accountName: accountEntity.Name,
        ...parseConfiguration(providerEntity.Configuration, `provider "${providerEntity.Name}"`),
        ...parseConfiguration(accountEntity.Configuration, `account "${accountEntity.Name}"`),
    };
}

/** Decrypt the account's credential, overlay its values, and initialize the driver with token refresh. */
async function applyCredentialValues(
    driver: BaseSignatureProvider,
    baseConfig: SignatureProviderConfig,
    accountEntity: MJSignatureAccountEntity,
    contextUser: UserInfo,
): Promise<void> {
    await CredentialEngine.Instance.Config(false, contextUser);

    const credentialEntity = CredentialEngine.Instance.getCredentialById(accountEntity.CredentialID);
    if (!credentialEntity) {
        throw new Error(
            `Credential with ID ${accountEntity.CredentialID} not found for account "${accountEntity.Name}".`,
        );
    }

    const resolved = await CredentialEngine.Instance.getCredential(credentialEntity.Name, {
        credentialId: accountEntity.CredentialID,
        contextUser,
        subsystem: 'eSignature',
    });

    const onTokenRefresh = buildTokenRefreshCallback(accountEntity, resolved.values, contextUser);

    await driver.initialize({
        ...baseConfig,
        ...resolved.values,
        onTokenRefresh,
    });
}

/** Build a callback that persists rotated OAuth tokens back to the Credential Engine. */
function buildTokenRefreshCallback(
    accountEntity: MJSignatureAccountEntity,
    currentValues: Record<string, string>,
    contextUser: UserInfo,
): SignatureTokenRefreshCallback {
    return async (newRefreshToken: string, newAccessToken?: string) => {
        try {
            const updatedValues: Record<string, string> = { ...currentValues, refreshToken: newRefreshToken };
            if (newAccessToken) {
                updatedValues.accessToken = newAccessToken;
            }
            await CredentialEngine.Instance.updateCredential(accountEntity.CredentialID, updatedValues, contextUser);
            LogStatus(`[eSignature] Persisted refreshed tokens for account "${accountEntity.Name}".`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(
                `[eSignature] Failed to persist refreshed tokens for account "${accountEntity.Name}": ${message}. ` +
                    `Authentication may fail after server restart.`,
            );
        }
    };
}

/** Parse a Configuration JSON string into an object; returns {} on null/invalid (logged). */
function parseConfiguration(configJson: string | null, label: string): Record<string, unknown> {
    if (!configJson) {
        return {};
    }
    try {
        const parsed = JSON.parse(configJson);
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
        LogStatus(`[eSignature] Ignoring invalid Configuration JSON on ${label}.`);
        return {};
    }
}
