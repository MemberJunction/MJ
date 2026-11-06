import { GeminiLLM } from '@memberjunction/ai-gemini';
import { GoogleGenAI } from '@google/genai';
import { RegisterClass } from '@memberjunction/global';
import { BaseLLM } from '@memberjunction/ai';
import { ParseVertexAICredentials, VertexKeySourceOf, type VertexAICredentials, type VertexKeySource } from '../vertexCredentials';
import { VertexGenAIOptions } from '../vertexAuthClient';

// The credential shapes moved to ../vertexCredentials (shared with the realtime driver); this module still exports the type.
export type { VertexAICredentials } from '../vertexCredentials';

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
 * // Option 4: Key file path reference. Honoured only when this JSON is the platform's environment key
 * // (AI_VENDOR_API_KEY__VertexLLM); any other key that names a key file is refused when the client is created.
 * const llm = new VertexLLM(JSON.stringify({
 *   keyFilePath: '/path/to/service-account.json',
 *   project: 'my-project',
 *   location: 'us-central1'
 * }));
 */
@RegisterClass(BaseLLM, "VertexLLM")
export class VertexLLM extends GeminiLLM {
  private _credentials: VertexAICredentials;
  /** Whether the key is the platform's environment key (`AI_VENDOR_API_KEY__VertexLLM`), the only key that may name a key file. */
  private _keySource: VertexKeySource;

  /** Thought signatures minted by Vertex AI do not validate on Google AI Studio, and vice versa. */
  protected override get ThoughtSignatureEndpoint(): string {
    return 'vertex';
  }

  /**
   * Create a new VertexLLM instance
   *
   * @param credentialsJson - JSON string containing Vertex AI credentials.
   *   Must include at minimum: { project: 'id', location?: 'region' }
   *   Can include full service account JSON or keyFilePath for authentication (keyFilePath only in the
   *   environment key, AI_VENDOR_API_KEY__VertexLLM).
   *
   *   If neither service account fields nor keyFilePath are provided,
   *   will use Application Default Credentials (ADC).
   */
  constructor(credentialsJson: string) {
    // Parse and normalize the credentials (project and location always set); throws on a malformed key.
    const credentials = ParseVertexAICredentials(credentialsJson);

    // Call parent constructor with project ID (BaseLLM stores this as apiKey)
    super(credentials.project);

    // Set credentials after super() call
    // Parent constructor doesn't initialize the client, so this is safe
    this._credentials = credentials;
    this._keySource = VertexKeySourceOf('VertexLLM', credentialsJson);
  }

  /**
   * Override parent's createClient() factory method to create Vertex AI client
   *
   * This factory method is called lazily on first use, so _credentials will always be set.
   * The rest of the functionality (chat, streaming, etc.) remains identical.
   */
  protected async createClient(): Promise<GoogleGenAI> {
    // An inline service account (a JWT client), a key file (only from the environment key), or Application Default
    // Credentials. A key that names a key file and is not the environment key is refused here (VertexCredentialsError).
    return new GoogleGenAI(await VertexGenAIOptions(this._credentials, this._keySource));
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
