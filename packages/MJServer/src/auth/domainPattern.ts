/**
 * Tests a domain against one `newUserAuthorizedDomains` pattern. `*` matches any run of
 * characters; every other character, regex metacharacters included, matches literally.
 */
export function DomainMatchesPattern(domain: string, pattern: string): boolean {
  const escaped = pattern
    .toLowerCase()
    .trim()
    .split('*')
    .map((literal) => literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp('^' + escaped + '$').test(domain);
}
