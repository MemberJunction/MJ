import { IMetadataProvider, LogError, LogStatus, LogWarning, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { CredentialEngine } from '@memberjunction/credentials';
import { ActionEngineServer } from '@memberjunction/actions';
import { DiagnosticKeyPair } from '@memberjunction/diagnostics';
import { DiagnosticIntakeService, IDiagnosticStorageBridge, OnBundleReceivedHook } from './intakeService.js';
import { MJStorageIntakeBridge } from './intakeStorageBridge.js';
import { KeyPairMatches } from './intakeKeys.js';
import { DIAGNOSTICS_SETTING_KEYS, DiagnosticsSettings } from './settings.js';

/**
 * Values the `Diagnostics.Intake.KeyPairCredentialID` credential holds: the X25519 recipient key
 * pair and the Ed25519 signing key pair that signs the recipient public key.
 */
interface IntakeKeyCredentialValues extends Record<string, string> {
  keyId: string;
  publicKey: string;
  privateKey: string;
  signingPublicKey: string;
  signingPrivateKey: string;
}

/** The recipient and signing key pairs the intake loads from its credential. */
interface IntakeKeys {
  Recipient: DiagnosticKeyPair;
  Signing: DiagnosticKeyPair;
}

/**
 * Configures `DiagnosticIntakeService` from the `Diagnostics.Intake.*` settings.
 * Intake is enabled only when `Diagnostics.Intake.Enabled` is true and the receiver key loads
 * from `MJ: Credentials`; otherwise it stays disabled.
 */
export async function ConfigureIntakeFromSettings(
  settings: DiagnosticsSettings,
  contextUser?: UserInfo,
  provider?: IMetadataProvider
): Promise<void> {
  const intake = DiagnosticIntakeService.Instance;
  if (!settings.IntakeEnabled) {
    intake.Configure({ enabled: false });
    return;
  }
  const keys = await loadIntakeKeys(settings.IntakeKeyPairCredentialID, contextUser);
  if (!keys) {
    intake.Configure({ enabled: false });
    return;
  }
  let storageBridge: IDiagnosticStorageBridge | null;
  try {
    storageBridge = await createStorageBridge(settings, contextUser, provider);
  } catch (err) {
    LogError(`Diagnostic intake stays disabled: intake storage could not be set up: ${err instanceof Error ? err.message : String(err)}`);
    intake.Configure({ enabled: false });
    return;
  }
  intake.RegisterKeyPair(keys.Recipient, undefined, true);
  intake.RegisterSigningKeyPair(keys.Signing);
  intake.Configure({
    enabled: true,
    decryptOnIngest: settings.IntakeDecryptOnIngest,
    retentionDays: settings.IntakeRetentionDays,
    storageBridge,
    onBundleReceivedHook: createOnBundleReceivedHook(settings.IntakeOnBundleReceivedActionID, contextUser),
    contextUser,
    provider
  });
  LogStatus(`Diagnostics intake enabled with receiver key '${keys.Recipient.keyId}'.`);
}

async function loadIntakeKeys(credentialId: string, contextUser?: UserInfo): Promise<IntakeKeys | null> {
  if (!credentialId) {
    LogWarning(
      `${DIAGNOSTICS_SETTING_KEYS.IntakeEnabled} is true but ${DIAGNOSTICS_SETTING_KEYS.IntakeKeyPairCredentialID} is empty; diagnostic intake stays disabled.`,
      'Diagnostics'
    );
    return null;
  }
  try {
    await CredentialEngine.Instance.Config(false, contextUser);
    const resolved = await CredentialEngine.Instance.GetCredential<IntakeKeyCredentialValues>('Diagnostics Intake Key', {
      credentialId,
      contextUser,
      subsystem: 'Diagnostics Intake'
    });
    return toIntakeKeys(resolved.values);
  } catch (err) {
    LogError(
      `Diagnostic intake stays disabled: the receiver key credential '${credentialId}' could not be loaded: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

/**
 * Builds the key pairs from the credential values. Throws when a value is missing or when a
 * public key is not the one derived from its private key.
 */
function toIntakeKeys(values: IntakeKeyCredentialValues): IntakeKeys {
  if (!values.keyId || !values.publicKey || !values.privateKey) {
    throw new Error('the credential must hold keyId, publicKey and privateKey');
  }
  if (!values.signingPublicKey || !values.signingPrivateKey) {
    throw new Error('the credential must hold signingPublicKey and signingPrivateKey (the Ed25519 key that signs the public key)');
  }
  if (!KeyPairMatches(values.publicKey, values.privateKey)) {
    throw new Error('publicKey is not the public key of privateKey');
  }
  if (!KeyPairMatches(values.signingPublicKey, values.signingPrivateKey)) {
    throw new Error('signingPublicKey is not the public key of signingPrivateKey');
  }
  return {
    Recipient: { algorithm: 'X25519', keyId: values.keyId, publicKeyBase64: values.publicKey, privateKeyBase64: values.privateKey },
    Signing: { algorithm: 'Ed25519', keyId: `${values.keyId}-signing`, publicKeyBase64: values.signingPublicKey, privateKeyBase64: values.signingPrivateKey }
  };
}

async function createStorageBridge(
  settings: DiagnosticsSettings,
  contextUser?: UserInfo,
  provider?: IMetadataProvider
): Promise<IDiagnosticStorageBridge | null> {
  if (!settings.IntakeStorageProviderID) {
    return null;
  }
  return MJStorageIntakeBridge.Create(
    settings.IntakeStorageProviderID,
    settings.IntakeQuarantineStorageProviderID,
    contextUser,
    provider
  );
}

/** Returns a hook that runs the configured action after a bundle is received, or null when no action is set. */
function createOnBundleReceivedHook(actionId: string, contextUser?: UserInfo): OnBundleReceivedHook | null {
  if (!actionId) {
    return null;
  }
  if (!contextUser) {
    LogWarning(`${DIAGNOSTICS_SETTING_KEYS.IntakeOnBundleReceivedActionID} is set but no system user is available; the action will not run.`, 'Diagnostics');
    return null;
  }
  return async (payload) => {
    await ActionEngineServer.Instance.Config(false, contextUser);
    const action = ActionEngineServer.Instance.Actions.find((a) => UUIDsEqual(a.ID, actionId));
    if (!action) {
      LogError(`Diagnostics intake: action '${actionId}' (${DIAGNOSTICS_SETTING_KEYS.IntakeOnBundleReceivedActionID}) not found.`);
      return;
    }
    const result = await ActionEngineServer.Instance.RunAction({
      Action: action,
      ContextUser: contextUser,
      Filters: [],
      Params: [
        { Name: 'ReferenceID', Value: payload.referenceId, Type: 'Input' },
        { Name: 'BundleID', Value: payload.bundleId, Type: 'Input' },
        { Name: 'SenderInstallID', Value: payload.senderInstallId, Type: 'Input' },
        { Name: 'SenderMJVersion', Value: payload.senderMjVersion, Type: 'Input' },
        { Name: 'Summary', Value: payload.summary ?? null, Type: 'Input' },
        { Name: 'Contact', Value: payload.contact ?? null, Type: 'Input' },
        { Name: 'FindingsCount', Value: payload.findingsCount, Type: 'Input' },
        { Name: 'VerifiedStoragePath', Value: payload.verifiedStoragePath ?? null, Type: 'Input' }
      ]
    });
    if (!result.Success) {
      LogError(`Diagnostics intake: action '${action.Name}' failed: ${result.Message ?? 'unknown error'}`);
    }
  };
}
