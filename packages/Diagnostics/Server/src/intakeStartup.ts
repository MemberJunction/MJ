import { IMetadataProvider, LogError, LogStatus, LogWarning, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { CredentialEngine } from '@memberjunction/credentials';
import { ActionEngineServer } from '@memberjunction/actions';
import { DiagnosticKeyPair } from '@memberjunction/diagnostics';
import { DiagnosticIntakeService, IDiagnosticStorageBridge, OnBundleReceivedHook } from './intakeService.js';
import { MJStorageIntakeBridge } from './intakeStorageBridge.js';
import { DIAGNOSTICS_SETTING_KEYS, DiagnosticsSettings } from './settings.js';

/** Values the `Diagnostics.Intake.KeyPairCredentialID` credential holds. */
interface IntakeKeyCredentialValues extends Record<string, string> {
  keyId: string;
  publicKey: string;
  privateKey: string;
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
  const keyPair = await loadIntakeKeyPair(settings.IntakeKeyPairCredentialID, contextUser);
  if (!keyPair) {
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
  intake.RegisterKeyPair(keyPair, undefined, true);
  intake.Configure({
    enabled: true,
    decryptOnIngest: settings.IntakeDecryptOnIngest,
    retentionDays: settings.IntakeRetentionDays,
    storageBridge,
    onBundleReceivedHook: createOnBundleReceivedHook(settings.IntakeOnBundleReceivedActionID, contextUser)
  });
  LogStatus(`Diagnostics intake enabled with receiver key '${keyPair.keyId}'.`);
}

async function loadIntakeKeyPair(credentialId: string, contextUser?: UserInfo): Promise<DiagnosticKeyPair | null> {
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
    return toKeyPair(resolved.values);
  } catch (err) {
    LogError(
      `Diagnostic intake stays disabled: the receiver key credential '${credentialId}' could not be loaded: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

function toKeyPair(values: IntakeKeyCredentialValues): DiagnosticKeyPair {
  if (!values.keyId || !values.publicKey || !values.privateKey) {
    throw new Error('the credential must hold keyId, publicKey and privateKey');
  }
  return {
    algorithm: 'X25519',
    keyId: values.keyId,
    publicKeyBase64: values.publicKey,
    privateKeyBase64: values.privateKey
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
