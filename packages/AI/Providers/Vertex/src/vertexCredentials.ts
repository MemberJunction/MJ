/**
 * @fileoverview The Vertex AI credential shapes, shared by the Vertex AI drivers (`VertexLLM`, `GeminiEnterpriseRealtime`).
 *
 * A driver's key is a JSON string in one of five shapes: a project with Application Default Credentials, a project with
 * an inline service-account JSON string (`serviceAccountJson`), the service-account fields inline, a project with a
 * key-file path, or a Google Cloud API key (`apiKey`, with or without a project). {@link ParseVertexAICredentials} reads
 * it. Only the platform's environment key may name a key file ({@link VertexKeySourceOf},
 * {@link AssertVertexKeyFileAllowed}): a run's key or a caller's literal that names one is refused, so a key from outside
 * the platform's configuration can never point MJAPI at a file on its host. `vertexAuthClient.ts` turns credentials into
 * a `google-auth-library` client, or `@google/genai`'s API-key mode.
 *
 * Gemini Live (`GeminiEnterpriseRealtime`) also reads two optional fields that move its socket: `liveApiVersion` (the
 * API version in the socket's path, `v1` by default) and `liveHost` (the host, instead of the location's). Both are
 * checked here; a `liveHost` is honoured only in the environment key ({@link AssertVertexLiveHostAllowed}), since the
 * driver sends its bearer token (or the API key) to that host.
 *
 * @module @memberjunction/ai-vertex
 * @author MemberJunction.com
 */

import { GetAIAPIKeyGlobal, type JSONValue } from '@memberjunction/ai';

/**
 * Credentials format for Vertex AI authentication
 *
 * This interface supports four authentication methods:
 * 1. Application Default Credentials (ADC) - Just provide project and location
 * 2. Service Account JSON String - Provide serviceAccountJson with full JSON as string
 * 3. Service Account JSON Inline - Provide full service account fields directly
 * 4. Key File Path - Provide path to service account JSON file
 *
 * Or a Google Cloud API key (`apiKey`), sent as `x-goog-api-key` instead of an OAuth bearer, never beside another
 * credential. Alone, it is `@google/genai`'s API-key mode: Google's global endpoint, with the model's short name and the
 * project the key belongs to. With a `project` (and a `location`, `us-central1` by default), Gemini Live takes the
 * regional route instead: the location's host and the model's full `projects/…/locations/…` name. The SDK has no
 * regional API-key mode, so `VertexLLM` uses the global route with either shape.
 */
export interface VertexAICredentials {
  /** GCP Project ID (required; empty for an API key on Google's global route, whose key names its own project) */
  project: string;

  /** GCP Location/Region (default: 'us-central1'; none for an API key on Google's global route) */
  location?: string;

  /**
   * A Google Cloud API key, instead of OAuth: sent as the `x-goog-api-key` header, as `@google/genai` sends it in Vertex
   * mode. Never beside another credential. Without a project it takes Google's global route; with one, the regional
   * route (Gemini Live only).
   */
  apiKey?: string;

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

  /**
   * Gemini Live only: the API version in the Live socket's path (`v1` when unset), such as `v1beta1`. Lower-cased when
   * read.
   */
  liveApiVersion?: string;

  /**
   * Gemini Live only: the host of the Live socket, instead of the one the location picks. Given as a host name, with an
   * optional port, bare or as an `https://` or `wss://` URL with nothing after the host; kept as `host[:port]`, lower
   * case. The socket is always TLS. Only the platform's environment key may name one ({@link AssertVertexLiveHostAllowed}).
   */
  liveHost?: string;
}

/**
 * Why Vertex AI credentials cannot be used: the key is not JSON, its `serviceAccountJson` is not JSON, it names no
 * project, it names a key file (or a Live host) without being the platform's environment key, its key file cannot be
 * read or is not a credential, its `liveHost` or `liveApiVersion` is not one, or its `apiKey` is not one or stands
 * beside another credential.
 */
export type VertexCredentialsProblem =
  | 'invalid-json'
  | 'invalid-service-account-json'
  | 'missing-project'
  | 'key-file-not-allowed'
  | 'unreadable-key-file'
  | 'invalid-key-file'
  | 'invalid-live-host'
  | 'invalid-live-api-version'
  | 'live-host-not-allowed'
  | 'invalid-api-key'
  | 'api-key-with-credentials';

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

/** A `liveApiVersion`: `v` and a number, optionally `alpha` or `beta` and a number (`v1`, `v1beta1`, `v1alpha`). */
const LIVE_API_VERSION_PATTERN = /^v\d+(?:(?:alpha|beta)\d*)?$/;

/** One label of a host name: letters, digits and inner hyphens, at most 63 characters. */
const HOST_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** The longest host name. */
const MAX_HOST_NAME_LENGTH = 253;

/** A `liveHost` once any `https://` or `wss://` and a trailing slash are taken off: `host` or `host:port`. */
const HOST_AND_PORT_PATTERN = /^([^:/?#@\s[\]]+)(?::(\d{1,5}))?$/;

/** The only URL schemes a `liveHost` may carry: the socket is always TLS. */
const LIVE_HOST_SCHEMES: ReadonlySet<string> = new Set(['https', 'wss']);

/** An `apiKey`: visible ASCII only (it travels in a header), at most 1,024 characters. Google's keys are 39. */
const API_KEY_PATTERN = /^[\x21-\x7E]{1,1024}$/;

/**
 * Reads a Vertex AI key. A Google Cloud API key (`apiKey`) takes no other credential beside it; with no project it names
 * no location either (Google's global route), and with one the location defaults to `us-central1` (the regional route).
 * Otherwise a `serviceAccountJson` string is merged in (its fields win, except the top-level project and location);
 * `project_id` wins over `project`; the location defaults to `us-central1`. The Gemini Live fields (`liveHost`,
 * `liveApiVersion`) are checked and normalized; blank ones, and a blank `apiKey`, are dropped.
 *
 * @param credentialsJson The key, a JSON string in one of the shapes (see {@link VertexAICredentials}).
 * @returns The credentials with `project` and `location` set (an empty project and no location for an API key on
 *   Google's global route).
 * @throws {VertexCredentialsError} When the key or its `serviceAccountJson` is not JSON, it names no project (an API key
 *   may leave out both the project and the location, not the project alone), its `liveHost`, `liveApiVersion` or
 *   `apiKey` is not one, or an `apiKey` stands beside another credential (no message quotes any of these values).
 */
export function ParseVertexAICredentials(credentialsJson: string): VertexAICredentials {
  let credentials = parseKeyJson(credentialsJson);
  const apiKey = readApiKey(credentials.apiKey);
  if (apiKey !== undefined) {
    return applyLiveFields(apiKeyCredentials(credentials, apiKey));
  }
  delete credentials.apiKey;
  if (credentials.serviceAccountJson) {
    credentials = mergeServiceAccountJson(credentials, credentials.serviceAccountJson);
  }
  if (!credentials.project && !credentials.project_id) {
    throw new VertexCredentialsError('missing-project', 'Vertex AI credentials must include "project" or "project_id"');
  }
  credentials.project = credentials.project_id || credentials.project;
  credentials.location = credentials.location || DEFAULT_VERTEX_LOCATION;
  return applyLiveFields(credentials);
}

/**
 * Refuses a `liveHost` that does not come from the platform's environment key. Gemini Live sends its bearer token (or
 * the key's API key) to that host, and a key from anywhere else (a run's key, an MJ Credential) may carry no credential
 * of its own, so the token would be the platform's (Application Default Credentials). The message never quotes the host.
 *
 * @param credentials Credentials from {@link ParseVertexAICredentials}.
 * @param source Where the key came from ({@link VertexKeySourceOf}).
 * @throws {VertexCredentialsError} `live-host-not-allowed` when the key names a Live host and is not the environment key.
 */
export function AssertVertexLiveHostAllowed(credentials: VertexAICredentials, source: VertexKeySource): void {
  if (credentials.liveHost && source !== 'environment') {
    throw new VertexCredentialsError(
      'live-host-not-allowed',
      'This Vertex AI key names a liveHost, which only the platform\'s environment key (AI_VENDOR_API_KEY__<driver>) may do: ' +
        'the Live socket\'s bearer token goes to that host.'
    );
  }
}

/**
 * The credentials of a key that names an API key: the key, the Live fields, and the project and location when it names a
 * project. Another credential beside the key is refused (which one would sign?). With no project the key takes Google's
 * global route, as `@google/genai`'s API-key mode does, so a location alone is refused: it would be ignored.
 */
function apiKeyCredentials(credentials: VertexAICredentials, apiKey: string): VertexAICredentials {
  const otherCredential =
    credentials.keyFilePath || credentials.serviceAccountJson || credentials.private_key || credentials.client_email || credentials.type === 'service_account';
  if (otherCredential) {
    throw new VertexCredentialsError(
      'api-key-with-credentials',
      'This Vertex AI key names an apiKey beside another credential (a key file, a service account or serviceAccountJson). Give one.'
    );
  }
  const live = { liveHost: credentials.liveHost, liveApiVersion: credentials.liveApiVersion };
  const project = credentials.project_id || credentials.project;
  if (project) {
    return { project, location: credentials.location || DEFAULT_VERTEX_LOCATION, apiKey, ...live };
  }
  if (credentials.location) {
    throw new VertexCredentialsError(
      'missing-project',
      'This Vertex AI key names an apiKey and a location but no project: the regional route needs "project"; leave the ' +
        'location out for Google\'s global route.'
    );
  }
  return { project: '', apiKey, ...live };
}

/** An `apiKey`, trimmed; `undefined` when absent, null or blank; anything that cannot be one throws, quoting none of it. */
function readApiKey(value: JSONValue | undefined): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const text = typeof value === 'string' ? value.trim() : null;
  if (text === '') {
    return undefined;
  }
  if (text === null || !API_KEY_PATTERN.test(text)) {
    throw new VertexCredentialsError('invalid-api-key', 'The Vertex AI key\'s apiKey is not an API key: visible characters only, no spaces.');
  }
  return text;
}

/** The credentials with `liveHost` and `liveApiVersion` checked and normalized, or dropped when blank. */
function applyLiveFields(credentials: VertexAICredentials): VertexAICredentials {
  const liveHost = readLiveHost(credentials.liveHost);
  const liveApiVersion = readLiveApiVersion(credentials.liveApiVersion);
  const { liveHost: _host, liveApiVersion: _version, ...rest } = credentials;
  return {
    ...rest,
    ...(liveHost ? { liveHost } : {}),
    ...(liveApiVersion ? { liveApiVersion } : {}),
  };
}

/** A `liveHost` as `host[:port]` in lower case, `undefined` when absent or blank; throws on anything else. */
function readLiveHost(value: JSONValue | undefined): string | undefined {
  const text = blankToUndefined(value, 'invalid-live-host');
  if (text === undefined) {
    return undefined;
  }
  const match = HOST_AND_PORT_PATTERN.exec(stripLiveHostScheme(text.toLowerCase()));
  const host = match?.[1] ?? '';
  const port = match?.[2] === undefined ? null : Number(match[2]);
  const hostIsName = host.length > 0 && host.length <= MAX_HOST_NAME_LENGTH && host.split('.').every((label) => HOST_LABEL_PATTERN.test(label));
  if (!match || !hostIsName || (port !== null && (port < 1 || port > 65535))) {
    throw invalidLiveHost();
  }
  return port === null ? host : `${host}:${port}`;
}

/** The host part of a `liveHost`: an `https://` or `wss://` scheme and one trailing slash taken off; any other scheme throws. */
function stripLiveHostScheme(text: string): string {
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//.exec(text);
  if (!scheme) {
    return text;
  }
  if (!LIVE_HOST_SCHEMES.has(scheme[1])) {
    throw invalidLiveHost();
  }
  const rest = text.slice(scheme[0].length);
  return rest.endsWith('/') ? rest.slice(0, -1) : rest;
}

/** A `liveApiVersion` in lower case, `undefined` when absent or blank; throws on anything else. */
function readLiveApiVersion(value: JSONValue | undefined): string | undefined {
  const text = blankToUndefined(value, 'invalid-live-api-version');
  if (text === undefined) {
    return undefined;
  }
  const version = text.toLowerCase();
  if (!LIVE_API_VERSION_PATTERN.test(version)) {
    throw new VertexCredentialsError('invalid-live-api-version', 'The Vertex AI key\'s liveApiVersion is not an API version such as v1 or v1beta1.');
  }
  return version;
}

/** A field's text, trimmed; `undefined` when absent, null or blank; a value that is not text throws `problem`. */
function blankToUndefined(value: JSONValue | undefined, problem: 'invalid-live-host' | 'invalid-live-api-version'): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw problem === 'invalid-live-host'
      ? invalidLiveHost()
      : new VertexCredentialsError(problem, 'The Vertex AI key\'s liveApiVersion is not an API version such as v1 or v1beta1.');
  }
  const text = value.trim();
  return text.length > 0 ? text : undefined;
}

/** The `invalid-live-host` error; its message never quotes the value. */
function invalidLiveHost(): VertexCredentialsError {
  return new VertexCredentialsError(
    'invalid-live-host',
    'The Vertex AI key\'s liveHost is not a host name: use host or host:port, bare or after https:// or wss://, with no path, query or user.'
  );
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
