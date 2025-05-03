/**
 * Configuration options for the Azure AI client
 */
export interface AzureAIConfig {
  /**
   * The Azure API key for authentication
   */
  apiKey?: string;

  /**
   * The Azure endpoint URL
   */
  endpoint: string;

  /**
   * Whether to use Azure AD authentication instead of API key
   * When true, the DefaultAzureCredential will be used
   */
  useAzureAD?: boolean;
}