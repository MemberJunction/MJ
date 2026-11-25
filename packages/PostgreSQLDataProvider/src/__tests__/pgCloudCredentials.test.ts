import { describe, it, expect } from 'vitest';
import {
    AZURE_POSTGRES_TOKEN_SCOPE,
    AwsRdsIamPgCredentialProvider,
    AzureEntraPgCredentialProvider,
    AzureTokenCredential,
    RdsTokenSigner,
} from '../pgCloudCredentials.js';
import { PgCredentialProviders, PgCredentialRequest } from '../pgCredentials.js';

const request: PgCredentialRequest = { Host: 'mj.postgres.database.azure.com', Port: 5432, User: 'mj-api-identity', Database: 'mj' };

class FakeAzure extends AzureEntraPgCredentialProvider {
    public Scopes: string[] = [];
    public Created = 0;
    public constructor(private readonly expiresInMs: number, private readonly returnNull = false) {
        super();
    }
    protected override async CreateCredential(): Promise<AzureTokenCredential> {
        this.Created++;
        return {
            getToken: async (scope: string) => {
                this.Scopes.push(scope);
                return this.returnNull ? null : { token: `entra-${this.Scopes.length}`, expiresOnTimestamp: Date.now() + this.expiresInMs };
            },
        };
    }
}

class FakeRds extends AwsRdsIamPgCredentialProvider {
    public Requests: PgCredentialRequest[] = [];
    protected override async CreateSigner(req: PgCredentialRequest): Promise<RdsTokenSigner> {
        this.Requests.push(req);
        return { getAuthToken: async () => `rds-token-for-${req.User}` };
    }
}

describe('AzureEntraPgCredentialProvider', () => {
    it('asks for the Azure Database for PostgreSQL scope and caches the token', async () => {
        const provider = new FakeAzure(60 * 60 * 1000);
        expect(await provider.GetPassword(request)).toBe('entra-1');
        expect(await provider.GetPassword(request)).toBe('entra-1');
        expect(provider.Scopes).toEqual([AZURE_POSTGRES_TOKEN_SCOPE]);
        expect(provider.Created).toBe(1);
    });

    it('fetches again when the token is inside the refresh margin', async () => {
        const provider = new FakeAzure(60 * 1000); // expires before the 5-minute margin
        await provider.GetPassword(request);
        await provider.GetPassword(request);
        expect(provider.Scopes).toHaveLength(2);
        expect(provider.Created).toBe(1);
    });

    it('fails clearly when Entra returns no token', async () => {
        await expect(new FakeAzure(1, true).GetPassword(request)).rejects.toThrow(/returned no token/);
    });
});

describe('AwsRdsIamPgCredentialProvider', () => {
    it('signs for the host, port and user of the login', async () => {
        const provider = new FakeRds();
        expect(await provider.GetPassword(request)).toBe('rds-token-for-mj-api-identity');
        expect(provider.Requests).toEqual([request]);
    });
});

describe('registration', () => {
    it('registers both cloud modes under their PG_AUTH_MODE keys', () => {
        expect(PgCredentialProviders.Instance.Get('azure-entra')).toBeInstanceOf(AzureEntraPgCredentialProvider);
        expect(PgCredentialProviders.Instance.Get('aws-rds-iam')).toBeInstanceOf(AwsRdsIamPgCredentialProvider);
    });
});
