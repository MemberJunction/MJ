import { describe, expect, it } from 'vitest';
import { DomainMatchesPattern } from '../domainPattern.js';

describe('DomainMatchesPattern (CodeQL js/incomplete-sanitization)', () => {
  it('matches an exact domain, case-insensitively on the pattern', () => {
    expect(DomainMatchesPattern('example.com', 'Example.COM')).toBe(true);
    expect(DomainMatchesPattern('exampleXcom', 'example.com')).toBe(false);
  });

  it('expands * to any run of characters', () => {
    expect(DomainMatchesPattern('mail.example.com', '*.example.com')).toBe(true);
    expect(DomainMatchesPattern('example.com', '*.example.com')).toBe(false);
  });

  it('treats regex metacharacters other than * literally', () => {
    expect(DomainMatchesPattern('a+b.com', 'a+b.com')).toBe(true);
    expect(DomainMatchesPattern('aab.com', 'a+b.com')).toBe(false);
    expect(DomainMatchesPattern('x.com', '(x|evil).com')).toBe(false);
    expect(() => DomainMatchesPattern('x.com', 'x[.com')).not.toThrow();
  });
});
