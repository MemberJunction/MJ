import { describe, it, expect } from 'vitest';
import { DescribeUserEmailMap, EmailsMatch, ResolveUserLookupEmail } from '../loginEmailResolution.js';

describe('ResolveUserLookupEmail', () => {
  it('looks a login up by its email claim when no map is set', () => {
    expect(ResolveUserLookupEmail({ email: 'b@two.example', preferredUsername: 'b@two.example' }, undefined)).toEqual({
      TokenEmail: 'b@two.example',
      LookupEmail: 'b@two.example',
      Remapped: false,
    });
  });

  it('applies a USER_EMAIL_MAP entry and reports the rewrite', () => {
    const result = ResolveUserLookupEmail({ email: 'b@two.example' }, { 'b@two.example': 'a@one.example' });
    expect(result).toEqual({ TokenEmail: 'b@two.example', LookupEmail: 'a@one.example', Remapped: true });
  });

  it('keeps the map key match exact (case-sensitive), as before', () => {
    const result = ResolveUserLookupEmail({ email: 'B@two.example' }, { 'b@two.example': 'a@one.example' });
    expect(result.LookupEmail).toBe('B@two.example');
    expect(result.Remapped).toBe(false);
  });

  it('does not count an entry that only changes case as a remap', () => {
    const result = ResolveUserLookupEmail({ email: 'b@two.example' }, { 'b@two.example': 'B@Two.example' });
    expect(result.LookupEmail).toBe('B@Two.example');
    expect(result.Remapped).toBe(false);
  });

  it('falls back to the preferred username and never remaps it', () => {
    const result = ResolveUserLookupEmail({ preferredUsername: 'b@two.example' }, { 'b@two.example': 'a@one.example' });
    expect(result).toEqual({ TokenEmail: 'b@two.example', LookupEmail: 'b@two.example', Remapped: false });
  });

  it('returns no identity when the token has neither claim', () => {
    expect(ResolveUserLookupEmail({}, undefined)).toEqual({ TokenEmail: undefined, LookupEmail: undefined, Remapped: false });
  });
});

describe('EmailsMatch', () => {
  it('ignores case and surrounding whitespace, like the User lookup', () => {
    expect(EmailsMatch(' A@One.example ', 'a@one.example')).toBe(true);
  });

  it('treats a missing side as no match', () => {
    expect(EmailsMatch(undefined, 'a@one.example')).toBe(false);
    expect(EmailsMatch('a@one.example', '')).toBe(false);
  });
});

describe('DescribeUserEmailMap', () => {
  it('returns null when no map is configured', () => {
    expect(DescribeUserEmailMap(undefined)).toBeNull();
    expect(DescribeUserEmailMap({})).toBeNull();
  });

  it('returns null when every entry maps an address to itself', () => {
    expect(DescribeUserEmailMap({ 'a@one.example': 'A@one.example' })).toBeNull();
  });

  it('lists every entry that sends a login to another record', () => {
    const warning = DescribeUserEmailMap({ 'b@two.example': 'a@one.example', 'c@three.example': 'a@one.example' });
    expect(warning).toContain('2 login email(s)');
    expect(warning).toContain('b@two.example -> a@one.example');
    expect(warning).toContain('c@three.example -> a@one.example');
  });
});
