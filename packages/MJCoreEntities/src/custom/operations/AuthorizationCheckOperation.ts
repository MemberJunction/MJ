/**
 * Server body for `Authorization.Check`.
 *
 * Evaluates named MJ: Authorizations for the acting user (ancestor grants included).
 * Unknown names fail closed. Rows with UseAuditLog=1 write MJ: Audit Logs.
 */
import { RegisterClass } from '@memberjunction/global';
import {
    AuthorizationInfo,
    BaseRemotableOperation,
    IMetadataProvider,
    LogError,
    UserInfo,
} from '@memberjunction/core';
import {
    AuthorizationCheckOperation as AuthorizationCheckOperationBase,
    type AuthorizationCheckInput,
    type AuthorizationCheckOutput,
    type AuthorizationCheckResultRow,
} from '../../generated/remote_operations';
import { MJAuditLogEntity } from '../../generated/entity_subclasses';
import { AuditLogTypeEngine } from '../../engines/AuditLogTypeEngine';
import { EvaluateAuthorizationChecks } from './EvaluateAuthorizationChecks';

const AUDIT_TYPE_NAME = 'Authorization Check';

@RegisterClass(BaseRemotableOperation, 'Authorization.Check')
export class AuthorizationCheckOperation extends AuthorizationCheckOperationBase {
    protected async InternalExecute(
        input: AuthorizationCheckInput,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<AuthorizationCheckOutput> {
        const names = Array.isArray(input?.Names) ? input.Names : [];
        const authorizations: AuthorizationInfo[] = provider.Authorizations ?? [];
        const results = EvaluateAuthorizationChecks(names, user, authorizations);
        await this.writeAuditLogs(results, authorizations, provider, user);
        return { Results: results };
    }

    private async writeAuditLogs(
        results: AuthorizationCheckResultRow[],
        authorizations: AuthorizationInfo[],
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<void> {
        const toLog = results.filter((r) => !r.Unknown);
        if (toLog.length === 0) return;

        const byName = new Map(
            authorizations.map((a) => [(a.Name ?? '').trim().toLowerCase(), a] as const),
        );
        const needsAudit = toLog.filter((r) => byName.get(r.Name.trim().toLowerCase())?.UseAuditLog);
        if (needsAudit.length === 0) return;

        try {
            await AuditLogTypeEngine.Instance.Config(false, user, provider);
        } catch (e) {
            LogError(`Authorization.Check: could not load audit log types: ${e instanceof Error ? e.message : String(e)}`);
            return;
        }
        const type = AuditLogTypeEngine.Instance.ByName(AUDIT_TYPE_NAME);
        if (!type) {
            LogError(`Authorization.Check: audit log type "${AUDIT_TYPE_NAME}" is not seeded — skipping UseAuditLog writes`);
            return;
        }

        const authEntity = provider.Entities?.find((e) => e.Name === 'MJ: Authorizations');
        for (const row of needsAudit) {
            const auth = byName.get(row.Name.trim().toLowerCase());
            if (!auth) continue;
            try {
                const log = await provider.GetEntityObject<MJAuditLogEntity>('MJ: Audit Logs', user);
                log.NewRecord();
                log.UserID = user.ID;
                log.AuditLogTypeID = type.ID;
                log.AuthorizationID = auth.ID;
                log.Status = row.Allowed ? 'Success' : 'Failed';
                log.Details = row.Allowed
                    ? row.ViaAncestor
                        ? `Allowed via ancestor "${row.MatchedAuthorizationName}"`
                        : 'Allowed'
                    : 'Denied';
                if (authEntity) {
                    log.EntityID = authEntity.ID;
                    log.RecordID = auth.ID;
                }
                if (!(await log.Save())) {
                    LogError(
                        `Authorization.Check: failed to save audit log for "${row.Name}": ${log.LatestResult?.Message ?? 'unknown error'}`,
                    );
                }
            } catch (e) {
                LogError(`Authorization.Check: audit log for "${row.Name}" threw: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
    }
}

/** Tree-shaking anchor so `@RegisterClass` is retained. */
export function LoadAuthorizationCheckOperation(): void {
    // intentionally empty
}
