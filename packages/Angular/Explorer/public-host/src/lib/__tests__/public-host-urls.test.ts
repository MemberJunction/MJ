import { describe, expect, it } from 'vitest';
import { BuildLoginScreenURL, BuildSignInURL, BuildSignUpURL, ResolvePublicMJAPIURL } from '../public-host-urls';

describe('ResolvePublicMJAPIURL', () => {
  it('uses MJAPI_URI without a trailing slash', () => {
    expect(ResolvePublicMJAPIURL({ GRAPHQL_URI: 'http://localhost:4000/', MJAPI_URI: 'https://host/api/' })).toBe('https://host/api');
  });

  it('uses the GraphQL origin when MJAPI_URI is blank or missing', () => {
    expect(ResolvePublicMJAPIURL({ GRAPHQL_URI: 'http://localhost:4000/graphql' })).toBe('http://localhost:4000');
    expect(ResolvePublicMJAPIURL({ GRAPHQL_URI: 'http://localhost:4000/', MJAPI_URI: '  ' })).toBe('http://localhost:4000');
  });
});

describe('BuildLoginScreenURL', () => {
  it('is the MJAPI login-screen route', () => {
    expect(BuildLoginScreenURL({ GRAPHQL_URI: 'http://localhost:4000/', MJAPI_URI: 'https://host/api' })).toBe('https://host/api/auth/login-screen');
  });
});

describe('sign-in links', () => {
  it('sends sign-up to Explorer with the sign-up hint', () => {
    expect(BuildSignUpURL()).toBe('/?signup=1');
  });

  it('sends sign-in to Explorer with no hint', () => {
    expect(BuildSignInURL()).toBe('/');
  });
});
