/**
 * Bearer token authentication strategy.
 * Reads an access token from the CompanyIntegration's Configuration JSON
 * and sends it as an Authorization: Bearer header on every request.
 */
import type { AuthStrategy, AuthContext, AuthType } from '../../AuthStrategy.js';
import type { UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';

export class BearerTokenAuth implements AuthStrategy {
    public readonly Type: AuthType = 'Bearer';

    public async Authenticate(companyIntegration: MJCompanyIntegrationEntity, _contextUser: UserInfo): Promise<AuthContext> {
        const token = this.extractTokenFromConfiguration(companyIntegration);
        return { Token: token };
    }

    public BuildHeaders(auth: AuthContext): Record<string, string> {
        if (!auth.Token) {
            return {};
        }
        return { Authorization: `Bearer ${auth.Token}` };
    }

    public IsExpired(auth: AuthContext): boolean {
        if (auth.ExpiresAt) {
            return new Date() >= auth.ExpiresAt;
        }
        // Static bearer tokens do not expire
        return false;
    }

    public async Refresh(_auth: AuthContext, companyIntegration: MJCompanyIntegrationEntity): Promise<AuthContext> {
        // Bearer tokens are static; re-read from configuration
        const token = this.extractTokenFromConfiguration(companyIntegration);
        return { Token: token };
    }

    /**
     * Extract the bearer token from the CompanyIntegration's Configuration JSON.
     * Looks for AccessToken, Token, or ApiKey fields in the parsed configuration.
     */
    private extractTokenFromConfiguration(companyIntegration: MJCompanyIntegrationEntity): string {
        const configRaw = companyIntegration.Get('Configuration') as string | null;
        if (!configRaw) {
            return '';
        }
        try {
            const config = JSON.parse(configRaw) as Record<string, unknown>;
            const token = config['AccessToken'] ?? config['Token'] ?? config['ApiKey'];
            if (typeof token === 'string') {
                return token;
            }
            return '';
        } catch {
            return '';
        }
    }
}
