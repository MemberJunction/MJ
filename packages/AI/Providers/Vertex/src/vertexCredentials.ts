/**
 * @fileoverview The Vertex AI credential shapes, shared by the Vertex AI drivers (`VertexLLM`, `GeminiEnterpriseRealtime`).
 *
 * A driver's key is a JSON string in one of four shapes: a project with Application Default Credentials, a project with
 * an inline service-account JSON string (`serviceAccountJson`), the service-account fields inline, or a project with a
 * key-file path. {@link ParseVertexAICredentials} reads it. Only the platform's environment key may name a key file
 * ({@link VertexKeySourceOf}, {@link AssertVertexKeyFileAllowed}): a run's key or a caller's literal that names one is
 * refused, so a key from outside the platform's configuration can never point MJAPI at a file on its host.
 * `vertexAuthClient.ts` turns credentials into a `google-auth-library` client.
 *
 * @module @memberjunction/ai-vertex
 * @author MemberJunction.com
 */

import { GetAIAPIKeyGlobal } from '@memberjunction/ai';

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
 * Why Vertex AI credentials cannot be used: the key is not JSON, its `serviceAccountJson` is not JSON, it names no
 * project, it names a key file without being the platform's environment key, or its key file cannot be read or is not
 * a credential.
 */
export type VertexCredentialsProblem =
  | 'invalid-json'
  | 'invalid-service-account-json'
  | 'missing-project'
  | 'key-file-not-allowed'
  | 'unreadable-key-file'
  | 'invalid-key-file';

/**
 * Thrown for Vertex AI credentials that cannot be used. The parse messages are the ones `VertexLLM` has always thrown;
 * they can quote the JSON parser's message, which can quote the key's text, so a caller that logs or returns the reason
 * uses {@link Problem}. The key-file messages never quote the path or the file.
 */
export class VertexCredentialsError extends Error {
  /** What is wrong, without any of the key's text. */
  public readonly Problem: VertexCredentialsProblem;

  constructor(problem: VertexCredentialsProblem, message: string) {
    super(message);
    this.name = 'VertexCredentialsError';
    this.Problem = problem;
  }
}

/**
 * Where a key came from: `'environment'` when it is the platform's environment key for the driver
 * (`AI_VENDOR_API_KEY__<DriverClass>`, or a registered `AIAPIKeys` subclass's answer); `'other'` for anything else: a
 * run's key (`apiKeys`), an MJ Credential, or a key a caller passed in.
 */
export type VertexKeySource = 'environment' | 'other';

/** The location a key gets when it names none. */
const DEFAULT_VERTEX_LOCATION = 'us-central1';

/**
 * Reads a Vertex AI key. A `serviceAccountJson` string is merged in (its fields win, except the top-level project and
 * location); `project_id` wins over `project`; the location defaults to `us-central1`.
 *
 * @param credentialsJson The key, a JSON string in one of the four shapes (see {@link VertexAICredentials}).
 * @returns The credentials with `project` and `location` set.
 * @throws {VertexCredentialsError} When the key or its `serviceAccountJson` is not JSON, or it names no project.
 */
export function ParseVertexAICredentials(credentialsJson: string): VertexAICredentials {
  let credentials = parseKeyJson(credentialsJson);
  if (credentials.serviceAccountJson) {
    credentials = mergeServiceAccountJson(credentials, credentials.serviceAccountJson);
  }
  if (!credentials.project && !credentials.project_id) {
    throw new VertexCredentialsError('missing-project', 'Vertex AI credentials must include "project" or "project_id"');
  }
  credentials.project = credentials.project_id || credentials.project;
  credentials.location = credentials.location || DEFAULT_VERTEX_LOCATION;
  return credentials;
}

/**
 * Where a driver's key came from: the platform's environment key for `driverClass` when it is that key byte for byte,
 * else `'other'`. A run's key equal to the environment key names nothing the platform did not configure.
 *
 * @param driverClass The driver's class name (`VertexLLM`, `GeminiEnterpriseRealtime`): the environment key's suffix.
 * @param credentialsJson The key the driver was constructed with.
 */
export function VertexKeySourceOf(driverClass: string, credentialsJson: string): VertexKeySource {
  let environmentKey: string | undefined;
  try {
    environmentKey = GetAIAPIKeyGlobal(driverClass);
  } catch {
    environmentKey = undefined;
  }
  return environmentKey !== undefined && environmentKey.length > 0 && environmentKey === credentialsJson ? 'environment' : 'other';
}

/**
 * Refuses a key file that does not come from the platform's environment key: a run's key, an MJ Credential or a
 * caller's literal could otherwise point MJAPI at any file on its host. The message never quotes the path.
 *
 * @param credentials Credentials from {@link ParseVertexAICredentials}.
 * @param source Where the key came from ({@link VertexKeySourceOf}).
 * @throws {VertexCredentialsError} `key-file-not-allowed` when the key names a key file and is not the environment key.
 */
export function AssertVertexKeyFileAllowed(credentials: VertexAICredentials, source: VertexKeySource): void {
  if (credentials.keyFilePath && source !== 'environment') {
    throw new VertexCredentialsError(
      'key-file-not-allowed',
      'This Vertex AI key names a key file, which only the platform\'s environment key (AI_VENDOR_API_KEY__<driver>) may do. ' +
        'Use an inline service account, or Application Default Credentials.'
    );
  }
}

/** The key as JSON. */
function parseKeyJson(credentialsJson: string): VertexAICredentials {
  try {
    return JSON.parse(credentialsJson) as VertexAICredentials;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new VertexCredentialsError('invalid-json', `Invalid Vertex AI credentials JSON: ${message}`);
  }
}

/** The key with its `serviceAccountJson` merged in: the service account's fields win, except the project and location. */
function mergeServiceAccountJson(credentials: VertexAICredentials, serviceAccountJson: string): VertexAICredentials {
  try {
    const serviceAccount = JSON.parse(serviceAccountJson) as Partial<VertexAICredentials>;
    return {
      ...credentials,
      ...serviceAccount,
      // Keep the top-level project and location when they exist.
      project: credentials.project || serviceAccount.project_id || '',
      location: credentials.location,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new VertexCredentialsError('invalid-service-account-json', `Invalid serviceAccountJson: ${message}`);
  }
}
