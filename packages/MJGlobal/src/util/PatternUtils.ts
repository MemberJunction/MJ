/**
 * @fileoverview Pattern matching utility functions for MemberJunction
 * 
 * This module provides functions for converting string patterns to RegExp objects,
 * supporting both simple wildcard patterns and full regex syntax.
 * Works in both Node.js and browser environments.
 * 
 * @module @memberjunction/global/PatternUtils
 */

/**
 * Converts a string pattern to a RegExp object.
 * Supports both regex strings and simple wildcard patterns.
 * 
 * @param pattern - The pattern string to convert
 * @returns A RegExp object
 * 
 * @example
 * // Regex pattern (starts with /)
 * parsePattern("/spCreate.*Run/i") // Returns: /spCreate.*Run/i
 * 
 * // Simple wildcard patterns
 * parsePattern("*AIPrompt*") // Returns: /AIPrompt/i
 * parsePattern("spCreate*") // Returns: /^spCreate/i
 * parsePattern("*Run") // Returns: /Run$/i
 * parsePattern("exact") // Returns: /^exact$/i
 */
export function parsePattern(pattern: string): RegExp {
  // Check if it's already a regex pattern (starts with /)
  if (pattern.startsWith('/')) {
    // Extract pattern and flags from regex string like "/pattern/flags"
    const lastSlash = pattern.lastIndexOf('/');
    if (lastSlash > 0) {
      const regexPattern = pattern.slice(1, lastSlash);
      const flags = pattern.slice(lastSlash + 1);
      return new RegExp(regexPattern, flags);
    }
    // If no closing slash, treat as literal pattern
    return new RegExp(pattern.slice(1), 'i');
  }
  
  // Convert simple wildcard pattern to regex
  // Escape special regex characters except for *
  let regexPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  
  // Handle wildcards
  const hasLeadingWildcard = pattern.startsWith('*');
  const hasTrailingWildcard = pattern.endsWith('*');
  
  // Remove wildcards for processing
  regexPattern = regexPattern.replace(/^\*/, '').replace(/\*$/, '');
  
  // Replace internal wildcards with .*
  regexPattern = regexPattern.replace(/\*/g, '.*');
  
  // Add anchors based on wildcards
  if (!hasLeadingWildcard) {
    regexPattern = '^' + regexPattern;
  }
  if (!hasTrailingWildcard) {
    regexPattern = regexPattern + '$';
  }
  
  // Simple patterns are case-insensitive by default
  return new RegExp(regexPattern, 'i');
}

/**
 * Converts an array of string patterns to RegExp objects
 * 
 * @param patterns - Array of pattern strings
 * @returns Array of RegExp objects
 */
export function parsePatterns(patterns: string[]): RegExp[] {
  return patterns.map(parsePattern);
}

/**
 * Converts a pattern (string or RegExp) to a RegExp object
 * 
 * @param pattern - String pattern or RegExp object
 * @returns RegExp object
 */
export function ensureRegExp(pattern: string | RegExp): RegExp {
  return pattern instanceof RegExp ? pattern : parsePattern(pattern);
}

/**
 * Converts an array of patterns (strings or RegExps) to RegExp objects
 * 
 * @param patterns - Array of string patterns or RegExp objects
 * @returns Array of RegExp objects
 */
export function ensureRegExps(patterns: (string | RegExp)[]): RegExp[] {
  return patterns.map(ensureRegExp);
}

/**
 * Tests if a string matches any of the provided patterns
 * 
 * @param text - The text to test
 * @param patterns - Array of patterns (strings or RegExps)
 * @returns true if any pattern matches
 */
export function matchesAnyPattern(text: string, patterns: (string | RegExp)[]): boolean {
  const regexps = ensureRegExps(patterns);
  return regexps.some(pattern => pattern.test(text));
}

/**
 * Tests if a string matches all of the provided patterns
 * 
 * @param text - The text to test
 * @param patterns - Array of patterns (strings or RegExps)
 * @returns true if all patterns match
 */
export function matchesAllPatterns(text: string, patterns: (string | RegExp)[]): boolean {
  const regexps = ensureRegExps(patterns);
  return regexps.every(pattern => pattern.test(text));
}