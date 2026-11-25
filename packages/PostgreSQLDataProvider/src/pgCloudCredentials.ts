import { RegisterClass } from '@memberjunction/global';
import { BasePgCredentialProvider, CachingPgCredentialProvider, PgCredentialRequest } from './pgCredentials.js';

/** The Entra ID scope Azure Database for PostgreSQL and Azure HorizonDB accept tokens for. */
export const AZURE_POSTGRES_TOKEN_SCOPE = 'https://ossrdbms-aad.database.windows.net/.default';

/** How long an RDS IAM auth token is valid: 15 minutes, set by AWS. */
export const RDS_IAM_TOKEN_LIFETIME_MS = 15 * 60 * 1000;

/** The slice of `@azure/identity`'s credential this provider uses. */
export interface AzureTokenCredential {
    getToken(scope: string): Promise<{ token: string; expiresOnTimestamp: number } | null>;  // case-violation-ok-legacy-back-compat: the @azure/identity TokenCredential method, called as-is
}

/** The slice of `@aws-sdk/rds-signer`'s `Signer` this provider uses. */
export interface RdsTokenSigner {
    getAuthToken(): Promise<string>;  // case-violation-ok-legacy-back-compat: the @aws-sdk/rds-signer Signer method, called as-is
}

/**
 * `PG_AUTH_MODE=azure-entra`: logs in with a Microsoft Entra ID token, for Azure Database for
 * PostgreSQL Flexible Server and Azure HorizonDB. The credential is `DefaultAzureCredential`, so a
 * managed identity, workload identity, environment service principal or `az login` all work. The
 * database user must be the Entra principal's name, created on the server with
 * `pgaadauth_create_principal`.
 *
 * `@azure/identity` is an optional peer dependency, loaded only when this mode is selected.
 */
@RegisterClass(BasePgCredentialProvider, 'azure-entra')
export class AzureEntraPgCredentialProvider extends CachingPgCredentialProvider {
    private credential: Promise<AzureTokenCredential> | null = null;

    protected async FetchToken(): Promise<{ Token: string; ExpiresAt: number }> {
        const credential = await this.getCredential();
        const token = await credential.getToken(AZURE_POSTGRES_TOKEN_SCOPE);
        if (!token) {
            throw new Error(`Microsoft Entra ID returned no token for ${AZURE_POSTGRES_TOKEN_SCOPE}. Check the identity MJ runs as.`);
        }
        return { Token: token.token, ExpiresAt: token.expiresOnTimestamp };
    }

    /** Builds the credential once. Overridable for tests. */
    protected async CreateCredential(): Promise<AzureTokenCredential> {
        // Dynamic import: optional peer dependency, needed only in this auth mode.
        const identity = await import('@azure/identity').catch((err: Error) => {
            throw new Error(`PG_AUTH_MODE=azure-entra needs the @azure/identity package installed: ${err.message}`);
        });
        return new identity.DefaultAzureCredential();
    }

    private getCredential(): Promise<AzureTokenCredential> {
        this.credential ??= this.CreateCredential();
        return this.credential;
    }
}

/**
 * `PG_AUTH_MODE=aws-rds-iam`: logs in with an RDS IAM auth token, for Amazon RDS and Aurora
 * PostgreSQL. AWS credentials and region come from the standard AWS SDK chain (`AWS_REGION`, an
 * instance or task role, `AWS_PROFILE`). The database user needs the `rds_iam` role.
 *
 * `@aws-sdk/rds-signer` is an optional peer dependency, loaded only when this mode is selected.
 */
@RegisterClass(BasePgCredentialProvider, 'aws-rds-iam')
export class AwsRdsIamPgCredentialProvider extends CachingPgCredentialProvider {
    protected async FetchToken(request: PgCredentialRequest): Promise<{ Token: string; ExpiresAt: number }> {
        const signer = await this.CreateSigner(request);
        const token = await signer.getAuthToken();
        return { Token: token, ExpiresAt: Date.now() + RDS_IAM_TOKEN_LIFETIME_MS };
    }

    /** Builds a signer for one login. Overridable for tests. */
    protected async CreateSigner(request: PgCredentialRequest): Promise<RdsTokenSigner> {
        // Dynamic import: optional peer dependency, needed only in this auth mode.
        const rds = await import('@aws-sdk/rds-signer').catch((err: Error) => {
            throw new Error(`PG_AUTH_MODE=aws-rds-iam needs the @aws-sdk/rds-signer package installed: ${err.message}`);
        });
        return new rds.Signer({ hostname: request.Host, port: request.Port, username: request.User });
    }
}

/** Keeps the cloud providers' registrations from being tree-shaken. */
export function LoadPgCloudCredentialProviders(): void {
    // Referencing the classes is enough; their decorators register them.
    void AzureEntraPgCredentialProvider;
    void AwsRdsIamPgCredentialProvider;
}
