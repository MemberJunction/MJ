/**
 * @fileoverview Reference Guided Cross-Site Playbooks for MemberJunction Central OAuth &
 * Integration Setup (`HubSpot OAuth 2.0` and `Microsoft Entra ID App Registration`).
 *
 * Demonstrates:
 * - Coach-Mark Spotlight visual guidance (`HighlightElement` + `WaitForUserAction` on login/MFA/consent)
 * - `ComputerUse` DOM replay with `ExpectedFingerprint` target healing (`ReresolveTarget` + `ShouldAcceptHeal`)
 * - Model-Blind Secret Vault Pipe (`CopySecretToMJVault`) capturing `ClientID` and `ClientSecret`
 *   directly into the MemberJunction Credential Vault without entering LLM context.
 *
 * @module @memberjunction/browser-extension-core
 */

import type { BrowserPlaybookDefinition } from '../types/extension-types.js';

/**
 * Reference Guided Playbook 1: HubSpot OAuth 2.0 Developer App Registration & MJ Vault Setup.
 */
export const HUBSPOT_OAUTH_PLAYBOOK: BrowserPlaybookDefinition = {
    Id: 'hubspot-oauth-setup',
    Name: 'HubSpot OAuth 2.0 App Registration',
    Description:
        'Guides an administrator through creating a HubSpot Developer OAuth 2.0 App, configuring the MemberJunction OAuth Redirect URI and CRM scopes, and securely vaulting the Client ID and Client Secret into MJ Central.',
    StartUrl: 'https://app.hubspot.com/developer',
    PreferredBackend: 'content-script',
    Steps: [
        {
            StepId: 'hubspot-step-1-login-gate',
            Title: 'Sign in to HubSpot Developer Portal',
            Instruction:
                'Sign in to your HubSpot Developer account and complete any MFA verification. The assistant pauses automatically on login screens.',
            Kind: 'WaitForUserAction',
            WaitForActionKind: 'navigation',
            ExpectedUrlPattern: '*://app.hubspot.com/*',
        },
        {
            StepId: 'hubspot-step-2-highlight-apps',
            Title: 'Open "Apps" in Developer Navigation',
            Instruction: 'Click "Apps" in the top developer navigation bar to view or create your HubSpot app.',
            Kind: 'HighlightElement',
            TargetSelector: 'a[data-test-id="nav-apps"], nav a[href*="/apps"]',
            ExpectedFingerprint: {
                Role: 'link',
                Name: 'Apps',
                BoundingBox: { XMin: 240, YMin: 24, XMax: 320, YMax: 60 },
            },
            CalloutPosition: 'bottom',
        },
        {
            StepId: 'hubspot-step-3-click-create-app',
            Title: 'Create or Open MemberJunction Integration App',
            Instruction: 'Click "Create app" to initialize a new HubSpot OAuth application.',
            Kind: 'ClickElement',
            TargetSelector: 'button[data-test-id="create-app-btn"], button.create-app',
            ExpectedFingerprint: {
                Role: 'button',
                Name: 'Create app',
                BoundingBox: { XMin: 980, YMin: 110, XMax: 1100, YMax: 150 },
            },
        },
        {
            StepId: 'hubspot-step-4-fill-redirect-uri',
            Title: 'Configure MemberJunction OAuth Redirect URI',
            Instruction: 'Set the Redirect URL to your MemberJunction OAuth callback endpoint.',
            Kind: 'FillInput',
            TargetSelector: 'input[name="redirectUrl"], input[data-test-id="redirect-url-input"]',
            InputValue: 'https://api.memberjunction.example.com/oauth/callback/hubspot',
            ExpectedFingerprint: {
                Role: 'textbox',
                Name: 'Redirect URL',
                BoundingBox: { XMin: 360, YMin: 380, XMax: 780, YMax: 418 },
            },
        },
        {
            StepId: 'hubspot-step-5-vault-client-id',
            Title: 'Save HubSpot Client ID to MJ Credential Vault',
            Instruction: 'Copy the generated HubSpot Client ID directly into the MemberJunction Credential Vault.',
            Kind: 'CopySecretToMJVault',
            TargetSelector: '[data-test-id="client-id-value"], input#hubspot-client-id',
            VaultCredentialName: 'HubSpot CRM OAuth Production',
            VaultTargetFieldName: 'ClientID',
        },
        {
            StepId: 'hubspot-step-6-vault-client-secret',
            Title: 'Vault HubSpot Client Secret (Model-Blind)',
            Instruction:
                'Securely pipe the HubSpot Client Secret directly from the page into the MemberJunction Credential Vault without exposing it to the AI model.',
            Kind: 'CopySecretToMJVault',
            TargetSelector: '[data-test-id="client-secret-value"], input#hubspot-client-secret',
            RequiresConfirmationGate: true,
            VaultCredentialName: 'HubSpot CRM OAuth Production',
            VaultTargetFieldName: 'ClientSecret',
        },
    ],
};

/**
 * Reference Guided Playbook 2: Microsoft Entra ID (Azure AD) App Registration & MJ Vault Setup.
 */
export const ENTRA_ID_OAUTH_PLAYBOOK: BrowserPlaybookDefinition = {
    Id: 'entra-id-oauth-setup',
    Name: 'Microsoft Entra ID OAuth App Registration',
    Description:
        'Guides an administrator through registering a new application in Microsoft Entra ID (Azure Portal), configuring Web Redirect URIs, generating a Client Secret, and piping the Tenant ID, Client ID, and Client Secret into MJ Central.',
    StartUrl: 'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
    PreferredBackend: 'auto',
    Steps: [
        {
            StepId: 'entra-step-1-login-gate',
            Title: 'Sign in to Microsoft Azure Portal',
            Instruction:
                'Sign in with your Microsoft Entra administrator account and complete MFA.',
            Kind: 'WaitForUserAction',
            WaitForActionKind: 'navigation',
            ExpectedUrlPattern: '*://portal.azure.com/*',
        },
        {
            StepId: 'entra-step-2-highlight-new-registration',
            Title: 'Click "+ New registration"',
            Instruction: 'Click "+ New registration" at the top of the App registrations blade.',
            Kind: 'HighlightElement',
            TargetSelector: 'div[ role="button"][title="New registration"], button[data-telemetryname="Command-NewRegistration"]',
            ExpectedFingerprint: {
                Role: 'button',
                Name: 'New registration',
                BoundingBox: { XMin: 280, YMin: 130, XMax: 430, YMax: 166 },
            },
            CalloutPosition: 'bottom',
        },
        {
            StepId: 'entra-step-3-fill-app-name',
            Title: 'Enter Application Display Name',
            Instruction: 'Enter "MemberJunction Enterprise SSO & Graph Integration" as the display name.',
            Kind: 'FillInput',
            TargetSelector: 'input[aria-label*="Name"], input[placeholder*="display name"]',
            InputValue: 'MemberJunction Enterprise SSO & Graph Integration',
            RequireTrustedInput: true,
            ExpectedFingerprint: {
                Role: 'textbox',
                Name: 'Name',
                BoundingBox: { XMin: 320, YMin: 240, XMax: 800, YMax: 274 },
            },
        },
        {
            StepId: 'entra-step-4-vault-client-id',
            Title: 'Save Application (Client) ID to MJ Vault',
            Instruction: 'Pipe the Entra Application (client) ID into the MemberJunction Credential Vault.',
            Kind: 'CopySecretToMJVault',
            TargetSelector: '[data-bind*="applicationId"], input#entra-client-id',
            VaultCredentialName: 'Microsoft Entra ID OAuth Production',
            VaultTargetFieldName: 'ClientID',
        },
        {
            StepId: 'entra-step-5-vault-client-secret',
            Title: 'Vault Entra Client Secret Value (Model-Blind)',
            Instruction:
                'Pipe the newly generated Client Secret Value directly into the MemberJunction Credential Vault without exposing it to the AI model.',
            Kind: 'CopySecretToMJVault',
            TargetSelector: '[data-test-id="secret-value-cell"], input#entra-client-secret',
            VaultCredentialName: 'Microsoft Entra ID OAuth Production',
            VaultTargetFieldName: 'ClientSecret',
        },
    ],
};

/**
 * All built-in reference playbooks shipped with `@memberjunction/browser-extension-core`.
 */
export const REFERENCE_BROWSER_PLAYBOOKS: BrowserPlaybookDefinition[] = [
    HUBSPOT_OAUTH_PLAYBOOK,
    ENTRA_ID_OAUTH_PLAYBOOK,
];
