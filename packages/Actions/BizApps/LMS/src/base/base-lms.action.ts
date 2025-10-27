import { ActionParam } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass } from '@memberjunction/global';
import { UserInfo } from '@memberjunction/global';
import { CompanyIntegrationEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/global';

/**
 * Base class for all LMS-related actions.
 * Provides common functionality and patterns for interacting with Learning Management Systems.
 */
@RegisterClass(BaseAction, 'BaseLMSAction')
export abstract class BaseLMSAction extends BaseAction {
  /**
   * The LMS provider this action is designed for (e.g., 'LearnWorlds', 'Moodle', etc.)
   */
  protected abstract lmsProvider: string;

  /**
   * The integration name to look up in the Integration entity
   */
  protected abstract integrationName: string;

  /**
   * Cached company integration for the current execution
   */
  private _companyIntegration: CompanyIntegrationEntity | null = null;

  /**
   * Common LMS parameters that many actions will need
   */
  protected getCommonLMSParams(): ActionParam[] {
    return [
      {
        Name: 'CompanyID',
        Type: 'Input',
        Value: null,
      },
    ];
  }

  /**
   * Gets the company integration record for the specified company and LMS
   */
  protected async getCompanyIntegration(companyId: string, contextUser: UserInfo): Promise<CompanyIntegrationEntity> {
    // Check cache first
    if (this._companyIntegration && this._companyIntegration.CompanyID === companyId) {
      return this._companyIntegration;
    }

    const rv = new RunView();
    const result = await rv.RunView<CompanyIntegrationEntity>(
      {
        EntityName: 'Company Integrations',
        ExtraFilter: `CompanyID = '${companyId}' AND Integration.Name = '${this.integrationName}'`,
        ResultType: 'entity_object',
      },
      contextUser
    );

    if (!result.Success) {
      throw new Error(`Failed to retrieve company integration: ${result.ErrorMessage}`);
    }

    if (!result.Results || result.Results.length === 0) {
      throw new Error(`No ${this.integrationName} integration found for company ${companyId}. Please configure the integration first.`);
    }

    this._companyIntegration = result.Results[0];
    return this._companyIntegration;
  }

  /**
   * Gets credentials from environment variables
   * Format: BIZAPPS_{PROVIDER}_{COMPANY_ID}_{CREDENTIAL_TYPE}
   * Example: BIZAPPS_LEARNWORLDS_12345_API_KEY
   */
  protected getCredentialFromEnv(companyId: string, credentialType: string): string | undefined {
    const envKey = `BIZAPPS_${this.lmsProvider.toUpperCase().replace(/\s+/g, '_')}_${companyId}_${credentialType.toUpperCase()}`;
    return process.env[envKey];
  }

  /**
   * Gets API credentials - first tries environment variables, then falls back to database
   */
  protected async getAPICredentials(
    integration: CompanyIntegrationEntity
  ): Promise<{ apiKey?: string; apiSecret?: string; accessToken?: string }> {
    const companyId = integration.CompanyID;

    // Try environment variables first
    const envApiKey = this.getCredentialFromEnv(companyId, 'API_KEY');
    const envApiSecret = this.getCredentialFromEnv(companyId, 'API_SECRET');
    const envAccessToken = this.getCredentialFromEnv(companyId, 'ACCESS_TOKEN');

    if (envApiKey || envAccessToken) {
      return {
        apiKey: envApiKey,
        apiSecret: envApiSecret,
        accessToken: envAccessToken,
      };
    }

    // Fall back to database (for backwards compatibility)
    if (!integration.APIKey && !integration.AccessToken) {
      throw new Error(
        `No API credentials found for ${this.integrationName} integration. Please set environment variables or configure in database.`
      );
    }

    return {
      apiKey: integration.APIKey || undefined,
      accessToken: integration.AccessToken || undefined,
    };
  }

  /**
   * Gets the base URL for API calls
   */
  protected async getAPIBaseURL(integration: CompanyIntegrationEntity): Promise<string> {
    // Check if custom URL is stored in the integration
    if (integration.CustomAttribute1) {
      return integration.CustomAttribute1;
    }

    // Return empty string - derived classes should override this
    return '';
  }

  /**
   * Helper to get parameter value with type safety
   */
  protected getParamValue(params: ActionParam[], paramName: string): any {
    const param = params.find((p) => p.Name === paramName);
    return param?.Value;
  }

  /**
   * Standard date format for LMS systems (ISO 8601)
   */
  protected formatLMSDate(date: Date): string {
    return date.toISOString();
  }

  /**
   * Parse date from LMS format
   */
  protected parseLMSDate(dateString: string): Date {
    return new Date(dateString);
  }

  /**
   * Calculate progress percentage
   */
  protected calculateProgressPercentage(completed: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
  }

  /**
   * Format duration in seconds to human readable format
   */
  protected formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  /**
   * Helper to build consistent error messages for LMS operations
   */
  protected buildLMSErrorMessage(operation: string, details: string, systemError?: any): string {
    let message = `LMS operation failed: ${operation}. ${details}`;
    if (systemError) {
      message += ` System error: ${systemError.message || systemError}`;
    }
    return message;
  }

  /**
   * Common enrollment status mapping
   */
  protected mapEnrollmentStatus(status: string): 'active' | 'completed' | 'expired' | 'suspended' | 'unknown' {
    const statusMap: Record<string, 'active' | 'completed' | 'expired' | 'suspended' | 'unknown'> = {
      active: 'active',
      completed: 'completed',
      finished: 'completed',
      expired: 'expired',
      suspended: 'suspended',
      paused: 'suspended',
      inactive: 'suspended',
    };

    return statusMap[status.toLowerCase()] || 'unknown';
  }
}
