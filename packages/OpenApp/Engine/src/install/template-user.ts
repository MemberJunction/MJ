/**
 * Offers an app's template user to the person installing it (manifest `templateUser`).
 *
 * An app can ship a template user (`User.IsTemplate`): an account configured to be copied, with
 * pinned apps, views, dashboards and conversations. Everyone signs in as themselves, so without a
 * copy nobody sees that work. After install this:
 *
 *   1. creates the installer's own user as a copy of the template (record cloning's template
 *      preset), from `MJ_INSTALL_USER_EMAIL` / `_FIRST_NAME` / `_LAST_NAME` or prompts, and
 *   2. makes the template the one MJAPI copies for everyone who signs in later
 *      (`userHandling.newUserTemplate` in mj.config.cjs), as the manifest's `newUsers` says,
 *      overridable with `MJ_INSTALL_TEMPLATE_FOR_NEW_USERS`.
 *
 * It never throws: whatever goes wrong is a warning, and the install it follows has already
 * succeeded. The same copy can be made later with `mj user clone`.
 *
 * @module install/template-user
 */
import { CompositeKey, RunView, type DatabaseProviderBase, type UserInfo } from '@memberjunction/core';
import type { MJUserEntity } from '@memberjunction/core-entities';
import { RecordCloneEngine } from '@memberjunction/record-cloning';
import type { AppInstallCallbacks } from '../types/open-app-types.js';
import type { MJAppManifest } from '../manifest/manifest-schema.js';
import { SetNewUserTemplate } from './config-manager.js';

/** Environment variables a non-interactive install sets to receive the template. */
export const TEMPLATE_USER_ENV = {
    Email: 'MJ_INSTALL_USER_EMAIL',
    FirstName: 'MJ_INSTALL_USER_FIRST_NAME',
    LastName: 'MJ_INSTALL_USER_LAST_NAME',
    ForNewUsers: 'MJ_INSTALL_TEMPLATE_FOR_NEW_USERS',
} as const;

const PHASE = 'Template User';

/** What the template-user step needs from the orchestrator. */
export interface TemplateUserContext {
    DatabaseProvider: DatabaseProviderBase;
    ContextUser: UserInfo;
    RepoRoot: string;
    ServerPackagePath?: string;
    Callbacks?: AppInstallCallbacks;
}

/** The person to create, as far as we know them. */
interface InstallerIdentity {
    Email: string;
    FirstName: string;
    LastName: string;
}

interface UserRow {
    ID: string;
    IsTemplate: boolean;
}

/** Runs both parts of the template-user step for `manifest`. Never throws. */
export async function OfferTemplateUser(manifest: MJAppManifest, context: TemplateUserContext): Promise<void> {
    const spec = manifest.templateUser;
    if (!spec) return;
    const callbacks = context.Callbacks;
    try {
        const template = await FindUser(context, spec.email);
        if (!template || !template.IsTemplate) {
            callbacks?.OnWarn?.(
                PHASE,
                `${manifest.displayName} declares the template user ${spec.email}, but ${template ? 'it is not marked IsTemplate' : 'no such user exists'}; skipping.`
            );
            return;
        }
        const preset = spec.preset ?? 'template';
        await CopyForInstaller(manifest, context, template.ID, spec.email, preset, spec.description);
        await OfferForNewUsers(manifest, context, spec.email, preset, spec.newUsers ?? 'offer');
    } catch (err) {
        callbacks?.OnWarn?.(PHASE, `Could not set up ${manifest.displayName}'s template user: ${err instanceof Error ? err.message : String(err)}`);
    }
}

/** Creates the installer's user as a copy of the template, if we learn who they are. */
async function CopyForInstaller(
    manifest: MJAppManifest,
    context: TemplateUserContext,
    templateId: string,
    templateEmail: string,
    preset: string,
    description: string | undefined
): Promise<void> {
    const callbacks = context.Callbacks;
    const identity = await ResolveInstallerIdentity(manifest, context, description);
    const later = `mj user clone --from ${templateEmail} --email <you> --first <First> --last <Last>`;
    if (!identity) {
        callbacks?.OnLog?.(`To give someone ${manifest.displayName}'s template setup later: ${later}`);
        return;
    }
    if (await FindUser(context, identity.Email)) {
        callbacks?.OnWarn?.(
            PHASE,
            `${identity.Email} already has a user, and a copy is always a new user. Sign in with another email, or remove that user and run: ${later}`
        );
        return;
    }

    const result = await new RecordCloneEngine(context.DatabaseProvider).Clone(
        {
            EntityName: 'MJ: Users',
            SourceRecordKey: CompositeKey.FromID(templateId),
            Preset: preset,
            PromptedValues: { Email: identity.Email, FirstName: identity.FirstName, LastName: identity.LastName },
            Options: { Reason: `${manifest.displayName} install: user for ${identity.Email} from template ${templateEmail}` },
        },
        context.ContextUser
    );
    const newId = result.Roots?.[0]?.TargetKey.KeyValuePairs.find((kvp) => kvp.FieldName === 'ID')?.Value;
    if (!result.Success || !newId) {
        const reasons = result.Warnings.filter((w) => w.Severity === 'Error').map((w) => w.Message).join('; ');
        callbacks?.OnWarn?.(PHASE, `Could not copy ${templateEmail} for ${identity.Email}: ${result.ErrorMessage || reasons || result.ResultCode}. Try later: ${later}`);
        return;
    }

    // The clone engine creates users inactive for review; this one is the installer, about to sign in.
    const user = await context.DatabaseProvider.GetEntityObject<MJUserEntity>('MJ: Users', context.ContextUser);
    if (!(await user.Load(String(newId)))) {
        callbacks?.OnWarn?.(PHASE, `Created ${identity.Email} from ${templateEmail}, but could not load it to activate it. Activate it in Explorer.`);
        return;
    }
    user.IsActive = true;
    if (!(await user.Save())) {
        callbacks?.OnWarn?.(PHASE, `Created ${identity.Email} from ${templateEmail}, but could not activate it: ${user.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        return;
    }
    callbacks?.OnSuccess?.(PHASE, `Created ${identity.Email} with ${manifest.displayName}'s template setup (${result.RecordsCloned ?? result.Created?.length ?? 0} records). Sign in with that email.`);
}

/** Who to create: from the environment, else by asking (interactive installs only). */
async function ResolveInstallerIdentity(
    manifest: MJAppManifest,
    context: TemplateUserContext,
    description: string | undefined
): Promise<InstallerIdentity | null> {
    const env = process.env;
    const callbacks = context.Callbacks;
    let email = env[TEMPLATE_USER_ENV.Email]?.trim() ?? '';
    let firstName = env[TEMPLATE_USER_ENV.FirstName]?.trim() ?? '';
    let lastName = env[TEMPLATE_USER_ENV.LastName]?.trim() ?? '';

    if (!email && callbacks?.OnPromptInput) {
        const what = description ? ` (${description})` : '';
        email = (
            await callbacks.OnPromptInput(
                `${manifest.displayName} ships a ready-made demo user${what}. Enter the email you sign in to Explorer with to get a copy, or leave it empty to skip:`,
                { default: '' }
            )
        ).trim();
        if (email) {
            const guess = NamesFromEmail(email);
            firstName = firstName || (await callbacks.OnPromptInput('Your first name:', { default: guess.FirstName })).trim();
            lastName = lastName || (await callbacks.OnPromptInput('Your last name:', { default: guess.LastName })).trim();
        }
    }
    if (!email) return null;
    const guess = NamesFromEmail(email);
    return { Email: email, FirstName: firstName || guess.FirstName, LastName: lastName || guess.LastName };
}

/** Makes the template the one MJAPI copies at first sign-in, as `newUsers` (and the environment) say. */
async function OfferForNewUsers(
    manifest: MJAppManifest,
    context: TemplateUserContext,
    templateEmail: string,
    preset: string,
    newUsers: 'offer' | 'always' | 'never'
): Promise<void> {
    const callbacks = context.Callbacks;
    const fromEnv = ParseYesNo(process.env[TEMPLATE_USER_ENV.ForNewUsers]);
    let apply: boolean;
    if (fromEnv !== undefined) apply = fromEnv;
    else if (newUsers === 'always') apply = true;
    else if (newUsers === 'never') apply = false;
    else if (callbacks?.OnPromptConfirm) {
        apply = await callbacks.OnPromptConfirm(
            `Give everyone who signs in for the first time ${manifest.displayName}'s template setup too? (copies ${templateEmail} for each new user)`,
            { default: true }
        );
    } else apply = false;
    if (!apply) return;

    const result = SetNewUserTemplate(context.RepoRoot, templateEmail, preset, context.ServerPackagePath);
    if (!result.Success) {
        callbacks?.OnWarn?.(PHASE, `Could not set userHandling.newUserTemplate in mj.config.cjs: ${result.ErrorMessage}`);
        return;
    }
    callbacks?.OnSuccess?.(
        PHASE,
        `New users will start as copies of ${templateEmail} (userHandling.newUserTemplate in mj.config.cjs; they are created only when userHandling.autoCreateNewUsers is on). Restart MJAPI to apply.`
    );
}

/** The user with this email, if any. */
async function FindUser(context: TemplateUserContext, email: string): Promise<UserRow | undefined> {
    const result = await RunView.FromMetadataProvider(context.DatabaseProvider).RunView<UserRow>(
        {
            EntityName: 'MJ: Users',
            ExtraFilter: `Email = '${email.replace(/'/g, "''")}'`,
            Fields: ['ID', 'IsTemplate'],
            ResultType: 'simple',
            MaxRows: 1,
        },
        context.ContextUser
    );
    if (!result.Success) throw new Error(result.ErrorMessage || 'could not read MJ: Users');
    return result.Results[0];
}

/** Names guessed from an email's local part: "jane.doe@x" → Jane / Doe, "jane@x" → Jane / User. */
export function NamesFromEmail(email: string): { FirstName: string; LastName: string } {
    const parts = (email.split('@')[0] ?? '').split(/[._-]+/).filter(Boolean);
    const cap = (p: string) => p[0].toUpperCase() + p.slice(1);
    return { FirstName: parts[0] ? cap(parts[0]) : 'New', LastName: parts.length > 1 ? cap(parts[parts.length - 1]) : 'User' };
}

/** "1"/"true"/"yes" → true, "0"/"false"/"no" → false, anything else → undefined. */
function ParseYesNo(value: string | undefined): boolean | undefined {
    const v = value?.trim().toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes') return true;
    if (v === '0' || v === 'false' || v === 'no') return false;
    return undefined;
}
