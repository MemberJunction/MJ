import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the config module before any imports that depend on it
vi.mock('../../config', () => ({
  configInfo: {
    authProviders: [],
    databaseSettings: {},
    graphqlPort: 4000,
    baseUrl: 'http://localhost',
    graphqlRootPath: '/',
  },
}));

import { AuthProviderFactory } from '../AuthProviderFactory';
import { IAuthProvider } from '../IAuthProvider';
import { initializeAuthProviders } from '../initializeProviders';

/**
 * Test suite for backward compatibility of the new auth provider system
 */
describe('Authentication Provider Backward Compatibility', () => {
  let factory: AuthProviderFactory;
  
  beforeEach(() => {
    factory = AuthProviderFactory.Instance;
    factory.clear();
  });
  
  afterEach(() => {
    factory.clear();
  });

  describe('Configuration-Based Provider Initialization', () => {
    it('should initialize with no providers when config is empty', () => {
      initializeAuthProviders();

      // With empty authProviders array, no providers should be registered
      expect(factory.hasProviders()).toBe(false);
    });

    it('should clear existing providers before re-initializing', () => {
      // Register a manual provider first
      const testProvider = {
        name: 'test',
        issuer: 'https://test.com',
        audience: 'test',
        jwksUri: 'https://test.com/jwks',
        validateConfig: () => true,
        getSigningKey: vi.fn(),
        extractUserInfo: vi.fn(),
        matchesIssuer: vi.fn(),
      } as IAuthProvider;
      factory.register(testProvider);
      expect(factory.hasProviders()).toBe(true);

      // Re-initialize clears everything
      initializeAuthProviders();
      expect(factory.hasProviders()).toBe(false);
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
        getSigningKey: vi.fn(),
        extractUserInfo: vi.fn(),
        matchesIssuer: (issuer: string) => {
          const normalized = issuer.toLowerCase().replace(/\/$/, '');
          return normalized === 'https://test.provider.com/oauth2';
        }
      } as IAuthProvider;
      
      factory.register(testProvider);
      
      // Test with exact match
      expect(factory.getByIssuer('https://test.provider.com/oauth2')).toBe(testProvider);
      
      // Test with trailing slash
      expect(factory.getByIssuer('https://test.provider.com/oauth2/')).toBe(testProvider);
      
      // Test with different case
      expect(factory.getByIssuer('https://TEST.PROVIDER.COM/oauth2')).toBe(testProvider);
    });
    
    it('should cache issuer lookups for performance', () => {
      const testProvider = {
        name: 'test',
        issuer: 'https://test.provider.com',
        audience: 'test',
        jwksUri: 'https://test.provider.com/jwks',
        validateConfig: () => true,
        getSigningKey: vi.fn(),
        extractUserInfo: vi.fn(),
        matchesIssuer: vi.fn((issuer: string): boolean => issuer === 'https://test.provider.com')
      } as IAuthProvider;
      
      factory.register(testProvider);
      
      // First lookup
      factory.getByIssuer('https://test.provider.com');
      expect(testProvider.matchesIssuer).toHaveBeenCalledTimes(1);
      
      // Second lookup should use cache
      factory.getByIssuer('https://test.provider.com');
      expect(testProvider.matchesIssuer).toHaveBeenCalledTimes(1);
    });
  });

  describe('User Info Extraction', () => {
    it('should return undefined for unregistered issuer', () => {
      const provider = factory.getByIssuer('https://unknown.issuer.com');
      expect(provider).toBeUndefined();
    });

    it('should support extractUserInfo on manually registered providers', () => {
      const mockExtract = vi.fn().mockReturnValue({
        email: 'user@test.com',
        firstName: 'Test',
        lastName: 'User',
      });
      const testProvider = {
        name: 'test-extract',
        issuer: 'https://test-extract.com',
        audience: 'test',
        jwksUri: 'https://test-extract.com/jwks',
        validateConfig: () => true,
        getSigningKey: vi.fn(),
        extractUserInfo: mockExtract,
        matchesIssuer: (iss: string) => iss === 'https://test-extract.com',
      } as IAuthProvider;

      factory.register(testProvider);

      const found = factory.getByIssuer('https://test-extract.com');
      expect(found).toBeDefined();

      const userInfo = found!.extractUserInfo({ email: 'user@test.com' });
      expect(userInfo.email).toBe('user@test.com');
      expect(mockExtract).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing provider gracefully', () => {
      const unknownIssuer = 'https://unknown.provider.com';
      const provider = factory.getByIssuer(unknownIssuer);
      expect(provider).toBeUndefined();
    });
    
    it('should validate provider configuration', () => {
      const invalidProvider = {
        name: 'invalid',
        issuer: '', // Invalid: empty issuer
        audience: 'test',
        jwksUri: 'https://test.com/jwks',
        validateConfig: () => false,
        getSigningKey: vi.fn(),
        extractUserInfo: vi.fn(),
        matchesIssuer: vi.fn()
      } as IAuthProvider;
      
      expect(() => factory.register(invalidProvider)).toThrow();
    });
  });
});