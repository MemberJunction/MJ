import { ComponentSpec } from '@memberjunction/interactive-component-types';
import {
  ComponentRegistryClientConfig,
  GetComponentParams,
  SearchComponentsParams,
  ComponentSearchResult,
  ComponentResponse,
  ResolvedVersion,
  RegistryInfo,
  Namespace,
  DependencyTree,
  RegistryError,
  RegistryErrorCode,
  RetryPolicy,
  ComponentFeedbackParams,
  ComponentFeedbackResponse
} from './types';

/**
 * Client for interacting with Component Registry Servers
 */
export class ComponentRegistryClient {
  private config: ComponentRegistryClientConfig;
  private defaultTimeout = 30000; // 30 seconds
  private defaultRetryPolicy: RetryPolicy = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2
  };

  constructor(config: ComponentRegistryClientConfig) {
    this.config = {
      ...config,
      timeout: config.timeout || this.defaultTimeout,
      retryPolicy: config.retryPolicy || this.defaultRetryPolicy
    };
    
    // Ensure baseUrl doesn't end with slash
    if (this.config.baseUrl.endsWith('/')) {
      this.config.baseUrl = this.config.baseUrl.slice(0, -1);
    }
  }

  /**
   * Get a specific component from the registry (backward compatible)
   */
  async getComponent(params: GetComponentParams): Promise<ComponentSpec> {
    const response = await this.getComponentWithHash(params);
    
    if (!response.specification) {
      throw new RegistryError(
        `Component ${params.namespace}/${params.name} returned without specification`,
        RegistryErrorCode.UNKNOWN
      );
    }
    
    return response.specification;
  }

  /**
   * Get a specific component from the registry with hash support
   * Returns ComponentResponse which includes hash and notModified flag
   */
  async getComponentWithHash(params: GetComponentParams): Promise<ComponentResponse> {
    const { namespace, name, version = 'latest', hash } = params;
    
    // Build query parameters
    const queryParams = new URLSearchParams();
    if (version !== 'latest') {
      queryParams.append('version', version);
    }
    if (hash) {
      queryParams.append('hash', hash);
    }
    
    const queryString = queryParams.toString();
    const path = `/api/v1/components/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}${queryString ? `?${queryString}` : ''}`;
    
    try {
      const response = await this.makeRequest('GET', path);
      
      // Handle 304 Not Modified response
      if (response && typeof response === 'object' && 'message' in response && response.message === 'Not modified') {
        return {
          ...response,
          notModified: true
        } as ComponentResponse;
      }
      
      return response as ComponentResponse;
    } catch (error) {
      if (error instanceof RegistryError) {
        throw error;
      }
      throw new RegistryError(
        `Failed to get component ${namespace}/${name}@${version}`,
        RegistryErrorCode.UNKNOWN,
        undefined,
        error
      );
    }
  }

  /**
   * Search for components in the registry
   */
  async searchComponents(params: SearchComponentsParams): Promise<ComponentSearchResult> {
    const queryParams = new URLSearchParams();
    
    if (params.registry) queryParams.append('registry', params.registry);
    if (params.namespace) queryParams.append('namespace', params.namespace);
    if (params.query) queryParams.append('q', params.query);
    if (params.type) queryParams.append('type', params.type);
    if (params.tags) params.tags.forEach(tag => queryParams.append('tag', tag));
    if (params.limit !== undefined) queryParams.append('limit', params.limit.toString());
    if (params.offset !== undefined) queryParams.append('offset', params.offset.toString());
    if (params.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params.sortDirection) queryParams.append('sortDirection', params.sortDirection);
    
    const path = `/api/v1/components/search?${queryParams.toString()}`;
    
    try {
      const response = await this.makeRequest('GET', path);
      return response as ComponentSearchResult;
    } catch (error) {
      if (error instanceof RegistryError) {
        throw error;
      }
      throw new RegistryError(
        'Failed to search components',
        RegistryErrorCode.UNKNOWN,
        undefined,
        error
      );
    }
  }

  /**
   * Resolve a version range to a specific version
   */
  async resolveVersion(params: {
    registry: string;
    namespace: string;
    name: string;
    versionRange: string;
  }): Promise<ResolvedVersion> {
    const { registry, namespace, name, versionRange } = params;
    
    const path = `/api/v1/components/${encodeURIComponent(registry)}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/versions/resolve`;
    
    try {
      const response = await this.makeRequest('POST', path, {
        versionRange
      });
      return response as ResolvedVersion;
    } catch (error) {
      if (error instanceof RegistryError) {
        throw error;
      }
      throw new RegistryError(
        `Failed to resolve version for ${registry}/${namespace}/${name}`,
        RegistryErrorCode.UNKNOWN,
        undefined,
        error
      );
    }
  }

  /**
   * Get information about a registry
   */
  async getRegistryInfo(registry: string): Promise<RegistryInfo> {
    const path = `/api/v1/registries/${encodeURIComponent(registry)}`;
    
    try {
      const response = await this.makeRequest('GET', path);
      return response as RegistryInfo;
    } catch (error) {
      if (error instanceof RegistryError) {
        throw error;
      }
      throw new RegistryError(
        `Failed to get registry info for ${registry}`,
        RegistryErrorCode.UNKNOWN,
        undefined,
        error
      );
    }
  }

  /**
   * List namespaces in a registry
   */
  async listNamespaces(registry: string): Promise<Namespace[]> {
    const path = `/api/v1/registries/${encodeURIComponent(registry)}/namespaces`;
    
    try {
      const response = await this.makeRequest('GET', path);
      return response as Namespace[];
    } catch (error) {
      if (error instanceof RegistryError) {
        throw error;
      }
      throw new RegistryError(
        `Failed to list namespaces for registry ${registry}`,
        RegistryErrorCode.UNKNOWN,
        undefined,
        error
      );
    }
  }

  /**
   * Resolve dependencies for a component
   */
  async resolveDependencies(componentId: string): Promise<DependencyTree> {
    const path = `/api/v1/components/${encodeURIComponent(componentId)}/dependencies`;
    
    try {
      const response = await this.makeRequest('GET', path);
      return response as DependencyTree;
    } catch (error) {
      if (error instanceof RegistryError) {
        throw error;
      }
      throw new RegistryError(
        `Failed to resolve dependencies for component ${componentId}`,
        RegistryErrorCode.UNKNOWN,
        undefined,
        error
      );
    }
  }

  /**
   * Health check for the registry server
   */
  async ping(): Promise<boolean> {
    const path = '/api/v1/health';

    try {
      await this.makeRequest('GET', path);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Submit feedback for a component
   */
  async submitFeedback(params: ComponentFeedbackParams): Promise<ComponentFeedbackResponse> {
    const path = '/api/v1/feedback';

    try {
      const response = await this.makeRequest('POST', path, params);
      return response as ComponentFeedbackResponse;
    } catch (error) {
      if (error instanceof RegistryError) {
        // Return structured error response
        return {
          success: false,
          error: error.message
        };
      }
      // Return generic error response
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to submit feedback'
      };
    }
  }

  /**
   * Make an HTTP request with retry logic
   */
  private async makeRequest(
    method: string,
    path: string,
    body?: any,
    retryCount = 0
  ): Promise<any> {
    const url = `${this.config.baseUrl}${path}`;
    
    // Build headers
    const headers: HeadersInit = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...this.config.headers
    };
    
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout!);
    
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // Handle response - include 304 Not Modified as success
      if (response.ok || response.status === 304) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return await response.json();
        }
        return await response.text();
      }
      
      // Handle errors
      let errorMessage = `Request failed with status ${response.status}`;
      let errorCode = RegistryErrorCode.UNKNOWN;
      let errorDetails: any;
      
      try {
        const errorBody = await response.json();
        if (errorBody.message) errorMessage = errorBody.message;
        if (errorBody.code) errorCode = this.mapErrorCode(errorBody.code);
        errorDetails = errorBody;
      } catch {
        // If response isn't JSON, use status text
        errorMessage = response.statusText || errorMessage;
      }
      
      // Map HTTP status to error codes
      if (!errorDetails || !errorDetails.code) {
        switch (response.status) {
          case 401:
            errorCode = RegistryErrorCode.UNAUTHORIZED;
            break;
          case 403:
            errorCode = RegistryErrorCode.FORBIDDEN;
            break;
          case 404:
            errorCode = RegistryErrorCode.COMPONENT_NOT_FOUND;
            break;
          case 429:
            errorCode = RegistryErrorCode.RATE_LIMITED;
            break;
          case 500:
          case 502:
          case 503:
          case 504:
            errorCode = RegistryErrorCode.SERVER_ERROR;
            break;
        }
      }
      
      throw new RegistryError(errorMessage, errorCode, response.status, errorDetails);
      
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      // Handle timeout
      if (error.name === 'AbortError') {
        throw new RegistryError(
          `Request timeout after ${this.config.timeout}ms`,
          RegistryErrorCode.TIMEOUT
        );
      }
      
      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new RegistryError(
          'Network error: Unable to connect to registry',
          RegistryErrorCode.NETWORK_ERROR,
          undefined,
          error
        );
      }
      
      // If it's already a RegistryError, check if we should retry
      if (error instanceof RegistryError) {
        if (this.shouldRetry(error, retryCount)) {
          const delay = this.getRetryDelay(retryCount);
          await this.sleep(delay);
          return this.makeRequest(method, path, body, retryCount + 1);
        }
        throw error;
      }
      
      // Unknown error
      throw new RegistryError(
        'Unexpected error during request',
        RegistryErrorCode.UNKNOWN,
        undefined,
        error
      );
    }
  }

  /**
   * Determine if a request should be retried
   */
  private shouldRetry(error: RegistryError, retryCount: number): boolean {
    if (retryCount >= this.config.retryPolicy!.maxRetries) {
      return false;
    }
    
    // Retry on network errors, timeouts, and server errors
    const retryableCodes = [
      RegistryErrorCode.NETWORK_ERROR,
      RegistryErrorCode.TIMEOUT,
      RegistryErrorCode.SERVER_ERROR
    ];
    
    return retryableCodes.includes(error.code);
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private getRetryDelay(retryCount: number): number {
    const policy = this.config.retryPolicy!;
    const delay = policy.initialDelay! * Math.pow(policy.backoffMultiplier!, retryCount);
    return Math.min(delay, policy.maxDelay!);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Map error codes from server to client enum
   */
  private mapErrorCode(code: string): RegistryErrorCode {
    const codeMap: Record<string, RegistryErrorCode> = {
      'COMPONENT_NOT_FOUND': RegistryErrorCode.COMPONENT_NOT_FOUND,
      'UNAUTHORIZED': RegistryErrorCode.UNAUTHORIZED,
      'FORBIDDEN': RegistryErrorCode.FORBIDDEN,
      'RATE_LIMITED': RegistryErrorCode.RATE_LIMITED,
      'INVALID_VERSION': RegistryErrorCode.INVALID_VERSION,
      'INVALID_NAMESPACE': RegistryErrorCode.INVALID_NAMESPACE,
      'NETWORK_ERROR': RegistryErrorCode.NETWORK_ERROR,
      'TIMEOUT': RegistryErrorCode.TIMEOUT,
      'SERVER_ERROR': RegistryErrorCode.SERVER_ERROR,
      'INVALID_RESPONSE': RegistryErrorCode.INVALID_RESPONSE
    };
    
    return codeMap[code] || RegistryErrorCode.UNKNOWN;
  }
}