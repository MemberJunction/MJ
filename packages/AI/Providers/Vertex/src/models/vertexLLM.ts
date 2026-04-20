import { GeminiLLM } from '@memberjunction/ai-gemini';
import { GoogleGenAI } from '@google/genai';
import { RegisterClass } from '@memberjunction/global';
import { BaseLLM } from '@memberjunction/ai';

/**
 * Credentials format for Vertex AI authentication
 *
 * This interface supports four authentication methods:
 * 1. Application Default Credentials (ADC) - Just provide project and location
 * 2. Service Account JSON String - Provide serviceAccountJson with full JSON as string
 * 3. Service Account JSON Inline - Provide full service account fields directly
 * 4. Key File Path - Provide path to service account JSON file
 */
export interface VertexAICredentials {
  /** GCP Project ID (required) */
  project: string;

  /** GCP Location/Region (default: 'us-central1') */
  location?: string;

  // Option 2: Service account JSON as string (from credential schema)
  serviceAccountJson?: string;

  // Option 3: Full service account JSON fields (inline)
  type?: 'service_account';
  project_id?: string;
  private_key_id?: string;
  private_key?: string;
  client_email?: string;
  client_id?: string;
  auth_uri?: string;
  token_uri?: string;
  auth_provider_x509_cert_url?: string;
  client_x509_cert_url?: string;

  // Option 4: Key file path reference
  keyFilePath?: string;
}

/**
 * VertexLLM - Google Vertex AI implementation
 *
 * Extends GeminiLLM and reuses all its logic (chat, streaming, thinking, parameters,
 * multimodal content, message alternation, error handling, etc.).
 *
 * The only difference is authentication - this class overrides the constructor to
 * handle GCP authentication instead of API keys.
 *
 * @example
 * // Option 1: ADC (Application Default Credentials)
 * // Set GOOGLE_APPLICATION_CREDENTIALS env var or use gcloud auth
 * const llm = new VertexLLM(JSON.stringify({
 *   project: 'my-project',
 *   location: 'us-central1'
 * }));
 *
 * @example
 * // Option 2: Service account JSON as string (from credential system)
 * const serviceAccountJson = JSON.stringify({
 *   type: 'service_account',
 *   project_id: 'my-project',
 *   private_key: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n',
 *   client_email: 'sa@my-project.iam.gserviceaccount.com',
 *   client_id: '123456789'
 *   // ... other service account fields
 * });
 * const llm = new VertexLLM(JSON.stringify({
 *   project: 'my-project',
 *   location: 'us-central1',
 *   serviceAccountJson: serviceAccountJson
 * }));
 *
 * @example
 * // Option 3: Service account JSON inline
 * const llm = new VertexLLM(JSON.stringify({
 *   type: 'service_account',
 *   project_id: 'my-project',
 *   private_key: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n',
 *   client_email: 'sa@my-project.iam.gserviceaccount.com',
 *   client_id: '123456789',
 *   // ... other service account fields
 *   location: 'us-central1'
 * }));
 *
 * @example
 * // Option 4: Key file path reference
 * const llm = new VertexLLM(JSON.stringify({
 *   keyFilePath: '/path/to/service-account.json',
 *   project: 'my-project',
 *   location: 'us-central1'
 * }));
 */
@RegisterClass(BaseLLM, "VertexLLM")
export class VertexLLM extends GeminiLLM {
  private _credentials: VertexAICredentials;

  /**
   * Create a new VertexLLM instance
   *
   * @param credentialsJson - JSON string containing Vertex AI credentials.
   *   Must include at minimum: { project: 'id', location?: 'region' }
   *   Can include full service account JSON or keyFilePath for authentication.
   *
   *   If neither service account fields nor keyFilePath are provided,
   *   will use Application Default Credentials (ADC).
   */
  constructor(credentialsJson: string) {
    // Parse credentials
    let credentials: VertexAICredentials;
    try {
      credentials = JSON.parse(credentialsJson);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Invalid Vertex AI credentials JSON: ${message}`);
    }

    // If serviceAccountJson is provided as a string, parse it and merge with credentials
    if (credentials.serviceAccountJson) {
      try {
        const serviceAccount = JSON.parse(credentials.serviceAccountJson);
        // Merge service account fields into credentials (serviceAccountJson fields take precedence)
        credentials = {
          ...credentials,
          ...serviceAccount,
          // Keep top-level project and location if they exist
          project: credentials.project || serviceAccount.project_id,
          location: credentials.location
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Invalid serviceAccountJson: ${message}`);
      }
    }

    // Validate required fields
    if (!credentials.project && !credentials.project_id) {
      throw new Error('Vertex AI credentials must include "project" or "project_id"');
    }

    // Use project_id if provided, otherwise use project
    const projectId = credentials.project_id || credentials.project;
    const location = credentials.location || 'us-central1';

    // Normalize credentials
    credentials.project = projectId;
    credentials.location = location;

    // Call parent constructor with project ID (BaseLLM stores this as apiKey)
    super(projectId);

    // Set credentials after super() call
    // Parent constructor doesn't initialize the client, so this is safe
    this._credentials = credentials;
  }

  /**
   * Override parent's createClient() factory method to create Vertex AI client
   *
   * This factory method is called lazily on first use, so _credentials will always be set.
   * The rest of the functionality (chat, streaming, etc.) remains identical.
   */
  protected async createClient(): Promise<GoogleGenAI> {
    // Build Vertex AI config
    const config: {
      vertexai: boolean;
      project: string;
      location: string;
      googleAuthOptions?: {
        keyFile?: string;
        credentials?: Record<string, string>;
      };
    } = {
      vertexai: true,
      project: this._credentials.project,
      location: this._credentials.location
    };

    // If keyFilePath is provided, configure file-based auth
    if (this._credentials.keyFilePath) {
      config.googleAuthOptions = {
        keyFile: this._credentials.keyFilePath
      };
    }
    // If full service account JSON is provided, use inline credentials
    else if (this._credentials.type === 'service_account' && this._credentials.private_key) {
      config.googleAuthOptions = {
        credentials: {
          type: this._credentials.type,
          project_id: this._credentials.project_id || this._credentials.project,
          private_key_id: this._credentials.private_key_id || '',
          private_key: this._credentials.private_key,
          client_email: this._credentials.client_email || '',
          client_id: this._credentials.client_id || '',
          auth_uri: this._credentials.auth_uri || 'https://accounts.google.com/o/oauth2/auth',
          token_uri: this._credentials.token_uri || 'https://oauth2.googleapis.com/token',
          auth_provider_x509_cert_url: this._credentials.auth_provider_x509_cert_url || 'https://www.googleapis.com/oauth2/v1/certs',
          client_x509_cert_url: this._credentials.client_x509_cert_url || ''
        }
      };
    }
    // Otherwise, use Application Default Credentials (ADC)
    // This will look for:
    // 1. GOOGLE_APPLICATION_CREDENTIALS environment variable pointing to key file
    // 2. gcloud auth application-default login credentials
    // 3. GCE/GKE/Cloud Run service account (when running in Google Cloud)

    // Create Vertex AI client with the configured options
    return new GoogleGenAI(config);
  }

  /**
   * Get Vertex AI credentials (for debugging/logging)
   *
   * Note: Returns a copy to prevent external modification.
   * Sensitive fields like private_key are included, so be careful when logging.
   */
  public get Credentials(): VertexAICredentials {
    return { ...this._credentials };
  }
}
