import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AuthProviderRegistry } from '../AuthProviderRegistry';
import { initializeAuthProviders } from '../initializeProviders';
import { getLegacyIssuers, getLegacyValidationOptions } from '../migrationHelper';

/**
 * Test suite for backward compatibility of the new auth provider system
 */
describe('Authentication Provider Backward Compatibility', () => {
  let registry: AuthProviderRegistry;
  
  beforeEach(() => {
    registry = AuthProviderRegistry.getInstance();
    registry.clear();
  });
  
  afterEach(() => {
    registry.clear();
  });

  describe('Legacy Configuration Support', () => {
    it('should create MSAL provider from legacy config', () => {
      // Simulate legacy environment variables
      process.env.TENANT_ID = 'test-tenant-id';
      process.env.WEB_CLIENT_ID = 'test-client-id';
      
      // Initialize with legacy config
      initializeAuthProviders();
      
      // Check that MSAL provider was created
      const msalProvider = registry.getByName('msal');
      expect(msalProvider).toBeDefined();
      expect(msalProvider?.issuer).toContain('test-tenant-id');
      expect(msalProvider?.audience).toBe('test-client-id');
    });
    
    it('should create Auth0 provider from legacy config', () => {
      // Simulate legacy environment variables
      process.env.AUTH0_DOMAIN = 'test.auth0.com';
      process.env.AUTH0_CLIENT_ID = 'auth0-client-id';
      process.env.AUTH0_CLIENT_SECRET = 'auth0-secret';
      
      // Initialize with legacy config
      initializeAuthProviders();
      
      // Check that Auth0 provider was created
      const auth0Provider = registry.getByName('auth0');
      expect(auth0Provider).toBeDefined();
      expect(auth0Provider?.issuer).toBe('https://test.auth0.com/');
      expect(auth0Provider?.audience).toBe('auth0-client-id');
    });
  });

  describe('Legacy Helper Functions', () => {
    beforeEach(() => {
      // Set up test providers
      process.env.TENANT_ID = 'test-tenant';
      process.env.WEB_CLIENT_ID = 'test-client';
      process.env.AUTH0_DOMAIN = 'test.auth0.com';
      process.env.AUTH0_CLIENT_ID = 'auth0-client';
      
      initializeAuthProviders();
    });
    
    it('should provide legacy issuers object', () => {
      const issuers = getLegacyIssuers();
      
      expect(issuers.azure).toBeDefined();
      expect(issuers.azure).toContain('test-tenant');
      expect(issuers.auth0).toBeDefined();
      expect(issuers.auth0).toContain('test.auth0.com');
    });
    
    it('should provide legacy validationOptions object', () => {
      const validationOptions = getLegacyValidationOptions();
      
      // Check MSAL options
      const msalIssuer = `https://login.microsoftonline.com/test-tenant/v2.0`;
      expect(validationOptions[msalIssuer]).toBeDefined();
      expect(validationOptions[msalIssuer].audience).toBe('test-client');
      expect(validationOptions[msalIssuer].jwksUri).toContain('test-tenant');
      
      // Check Auth0 options
      const auth0Issuer = 'https://test.auth0.com/';
      expect(validationOptions[auth0Issuer]).toBeDefined();
      expect(validationOptions[auth0Issuer].audience).toBe('auth0-client');
      expect(validationOptions[auth0Issuer].jwksUri).toContain('test.auth0.com');
    });
  });

  describe('Provider Registry Functionality', () => {
    it('should find providers by issuer with different formats', () => {
      // Register a test provider
      const testProvider = {
        name: 'test',
        issuer: 'https://test.provider.com/oauth2',
        audience: 'test-audience',
        jwksUri: 'https://test.provider.com/.well-known/jwks.json',
        validateConfig: () => true,
        getSigningKey: jest.fn(),
        extractUserInfo: jest.fn(),
        matchesIssuer: (issuer: string) => {
          const normalized = issuer.toLowerCase().replace(/\/$/, '');
          return normalized === 'https://test.provider.com/oauth2';
        }
      };
      
      registry.register(testProvider);
      
      // Test with exact match
      expect(registry.getByIssuer('https://test.provider.com/oauth2')).toBe(testProvider);
      
      // Test with trailing slash
      expect(registry.getByIssuer('https://test.provider.com/oauth2/')).toBe(testProvider);
      
      // Test with different case
      expect(registry.getByIssuer('https://TEST.PROVIDER.COM/oauth2')).toBe(testProvider);
    });
    
    it('should cache issuer lookups for performance', () => {
      const testProvider = {
        name: 'test',
        issuer: 'https://test.provider.com',
        audience: 'test',
        jwksUri: 'https://test.provider.com/jwks',
        validateConfig: () => true,
        getSigningKey: jest.fn(),
        extractUserInfo: jest.fn(),
        matchesIssuer: jest.fn((issuer: string) => issuer === 'https://test.provider.com')
      };
      
      registry.register(testProvider);
      
      // First lookup
      registry.getByIssuer('https://test.provider.com');
      expect(testProvider.matchesIssuer).toHaveBeenCalledTimes(1);
      
      // Second lookup should use cache
      registry.getByIssuer('https://test.provider.com');
      expect(testProvider.matchesIssuer).toHaveBeenCalledTimes(1);
    });
  });

  describe('User Info Extraction', () => {
    it('should extract user info from different token formats', () => {
      // Test MSAL token format
      const msalPayload = {
        iss: 'https://login.microsoftonline.com/tenant/v2.0',
        email: 'user@example.com',
        given_name: 'John',
        family_name: 'Doe',
        name: 'John Doe',
        preferred_username: 'john.doe@example.com'
      };
      
      // Test Auth0 token format
      const auth0Payload = {
        iss: 'https://test.auth0.com/',
        email: 'user@example.com',
        given_name: 'Jane',
        family_name: 'Smith',
        name: 'Jane Smith'
      };
      
      // Test Okta token format
      const oktaPayload = {
        iss: 'https://test.okta.com/oauth2/default',
        email: 'user@example.com',
        given_name: 'Bob',
        family_name: 'Johnson',
        name: 'Bob Johnson',
        preferred_username: 'bob.johnson'
      };
      
      // Initialize providers
      initializeAuthProviders();
      
      // Test extraction for each provider type
      const msalProvider = registry.getByIssuer(msalPayload.iss);
      if (msalProvider) {
        const msalUserInfo = msalProvider.extractUserInfo(msalPayload);
        expect(msalUserInfo.email).toBe('user@example.com');
        expect(msalUserInfo.firstName).toBe('John');
        expect(msalUserInfo.lastName).toBe('Doe');
      }
      
      const auth0Provider = registry.getByIssuer(auth0Payload.iss);
      if (auth0Provider) {
        const auth0UserInfo = auth0Provider.extractUserInfo(auth0Payload);
        expect(auth0UserInfo.email).toBe('user@example.com');
        expect(auth0UserInfo.firstName).toBe('Jane');
        expect(auth0UserInfo.lastName).toBe('Smith');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle missing provider gracefully', () => {
      const unknownIssuer = 'https://unknown.provider.com';
      const provider = registry.getByIssuer(unknownIssuer);
      expect(provider).toBeUndefined();
    });
    
    it('should validate provider configuration', () => {
      const invalidProvider = {
        name: 'invalid',
        issuer: '', // Invalid: empty issuer
        audience: 'test',
        jwksUri: 'https://test.com/jwks',
        validateConfig: () => false,
        getSigningKey: jest.fn(),
        extractUserInfo: jest.fn(),
        matchesIssuer: jest.fn()
      };
      
      expect(() => registry.register(invalidProvider)).toThrow();
    });
  });
});