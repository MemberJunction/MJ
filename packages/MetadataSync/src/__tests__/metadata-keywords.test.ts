import { describe, it, expect } from 'vitest';
import {
  METADATA_KEYWORDS,
  METADATA_KEYWORD_PREFIXES,
  isMetadataKeyword,
  getMetadataKeywordType,
  extractKeywordValue,
  hasMetadataKeyword,
  isNonKeywordAtSymbol,
  isContextDependentKeyword,
  isExternalReferenceKeyword,
  createKeywordReference,
  CONTEXT_DEPENDENT_KEYWORDS,
  EXTERNAL_REFERENCE_KEYWORDS,
  LOOKUP_KEYWORDS,
  RUNTIME_KEYWORDS,
} from '../constants/metadata-keywords';

describe('METADATA_KEYWORDS', () => {
  it('should define all expected keyword constants', () => {
    expect(METADATA_KEYWORDS.FILE).toBe('@file:');
    expect(METADATA_KEYWORDS.LOOKUP).toBe('@lookup:');
    expect(METADATA_KEYWORDS.PARENT).toBe('@parent:');
    expect(METADATA_KEYWORDS.ROOT).toBe('@root:');
    expect(METADATA_KEYWORDS.ENV).toBe('@env:');
    expect(METADATA_KEYWORDS.URL).toBe('@url:');
    expect(METADATA_KEYWORDS.TEMPLATE).toBe('@template:');
    expect(METADATA_KEYWORDS.INCLUDE).toBe('@include');
  });

  it('should be frozen/readonly (const assertion)', () => {
    expect(Object.keys(METADATA_KEYWORDS)).toHaveLength(8);
  });
});

describe('METADATA_KEYWORD_PREFIXES', () => {
  it('should contain all keyword values', () => {
    expect(METADATA_KEYWORD_PREFIXES).toContain('@file:');
    expect(METADATA_KEYWORD_PREFIXES).toContain('@lookup:');
    expect(METADATA_KEYWORD_PREFIXES).toContain('@parent:');
    expect(METADATA_KEYWORD_PREFIXES).toContain('@root:');
    expect(METADATA_KEYWORD_PREFIXES).toContain('@env:');
    expect(METADATA_KEYWORD_PREFIXES).toContain('@url:');
    expect(METADATA_KEYWORD_PREFIXES).toContain('@template:');
    expect(METADATA_KEYWORD_PREFIXES).toContain('@include');
  });

  it('should have the same number of entries as METADATA_KEYWORDS', () => {
    expect(METADATA_KEYWORD_PREFIXES.length).toBe(Object.keys(METADATA_KEYWORDS).length);
  });
});

describe('isMetadataKeyword', () => {
  it('should return true for @file: references', () => {
    expect(isMetadataKeyword('@file:template.md')).toBe(true);
  });

  it('should return true for @lookup: references', () => {
    expect(isMetadataKeyword('@lookup:Users.Email=test@example.com')).toBe(true);
  });

  it('should return true for @parent: references', () => {
    expect(isMetadataKeyword('@parent:ID')).toBe(true);
  });

  it('should return true for @root: references', () => {
    expect(isMetadataKeyword('@root:Name')).toBe(true);
  });

  it('should return true for @env: references', () => {
    expect(isMetadataKeyword('@env:NODE_ENV')).toBe(true);
  });

  it('should return true for @url: references', () => {
    expect(isMetadataKeyword('@url:https://example.com')).toBe(true);
  });

  it('should return true for @template: references', () => {
    expect(isMetadataKeyword('@template:templates/standard.json')).toBe(true);
  });

  it('should return true for bare @include', () => {
    expect(isMetadataKeyword('@include')).toBe(true);
  });

  it('should return false for regular strings', () => {
    expect(isMetadataKeyword('regular string')).toBe(false);
  });

  it('should return false for non-string values', () => {
    expect(isMetadataKeyword(123)).toBe(false);
    expect(isMetadataKeyword(null)).toBe(false);
    expect(isMetadataKeyword(undefined)).toBe(false);
    expect(isMetadataKeyword({})).toBe(false);
    expect(isMetadataKeyword([])).toBe(false);
    expect(isMetadataKeyword(true)).toBe(false);
  });

  it('should return false for unknown @ strings', () => {
    expect(isMetadataKeyword('@unknown:value')).toBe(false);
    expect(isMetadataKeyword('@angular/core')).toBe(false);
    expect(isMetadataKeyword('@mui/material')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isMetadataKeyword('')).toBe(false);
  });
});

describe('getMetadataKeywordType', () => {
  it('should return "file" for @file: references', () => {
    expect(getMetadataKeywordType('@file:template.md')).toBe('file');
  });

  it('should return "lookup" for @lookup: references', () => {
    expect(getMetadataKeywordType('@lookup:Users.Name=John')).toBe('lookup');
  });

  it('should return "parent" for @parent: references', () => {
    expect(getMetadataKeywordType('@parent:ID')).toBe('parent');
  });

  it('should return "root" for @root: references', () => {
    expect(getMetadataKeywordType('@root:ID')).toBe('root');
  });

  it('should return "env" for @env: references', () => {
    expect(getMetadataKeywordType('@env:DATABASE_URL')).toBe('env');
  });

  it('should return "url" for @url: references', () => {
    expect(getMetadataKeywordType('@url:https://example.com')).toBe('url');
  });

  it('should return "template" for @template: references', () => {
    expect(getMetadataKeywordType('@template:standard.json')).toBe('template');
  });

  it('should return "include" for bare @include', () => {
    expect(getMetadataKeywordType('@include')).toBe('include');
  });

  it('should return "include" for @include. dot notation', () => {
    expect(getMetadataKeywordType('@include.models')).toBe('include');
  });

  it('should return null for regular strings', () => {
    expect(getMetadataKeywordType('regular string')).toBeNull();
  });

  it('should return null for unknown @ strings', () => {
    expect(getMetadataKeywordType('@unknown:value')).toBeNull();
  });
});

describe('extractKeywordValue', () => {
  it('should extract value from @file: reference', () => {
    expect(extractKeywordValue('@file:template.md')).toBe('template.md');
  });

  it('should extract value from @lookup: reference', () => {
    expect(extractKeywordValue('@lookup:Users.Email=test@example.com')).toBe('Users.Email=test@example.com');
  });

  it('should extract value from @parent: reference', () => {
    expect(extractKeywordValue('@parent:ID')).toBe('ID');
  });

  it('should extract value from @root: reference', () => {
    expect(extractKeywordValue('@root:Name')).toBe('Name');
  });

  it('should extract value from @env: reference', () => {
    expect(extractKeywordValue('@env:NODE_ENV')).toBe('NODE_ENV');
  });

  it('should return empty string for bare @include', () => {
    expect(extractKeywordValue('@include')).toBe('');
  });

  it('should extract suffix from @include. dot notation', () => {
    expect(extractKeywordValue('@include.models')).toBe('models');
  });

  it('should return null for non-keyword strings', () => {
    expect(extractKeywordValue('regular string')).toBeNull();
  });

  it('should return null for non-string input', () => {
    expect(extractKeywordValue(123 as unknown as string)).toBeNull();
  });
});

describe('hasMetadataKeyword', () => {
  it('should behave identically to isMetadataKeyword', () => {
    expect(hasMetadataKeyword('@file:test.md')).toBe(true);
    expect(hasMetadataKeyword('plain text')).toBe(false);
    expect(hasMetadataKeyword(42)).toBe(false);
    expect(hasMetadataKeyword(null)).toBe(false);
  });
});

describe('isNonKeywordAtSymbol', () => {
  it('should return true for npm package names', () => {
    expect(isNonKeywordAtSymbol('@mui/material')).toBe(true);
    expect(isNonKeywordAtSymbol('@angular/core')).toBe(true);
  });

  it('should return false for metadata keywords', () => {
    expect(isNonKeywordAtSymbol('@file:template.md')).toBe(false);
    expect(isNonKeywordAtSymbol('@lookup:Users.Name=John')).toBe(false);
  });

  it('should return false for strings not starting with @', () => {
    expect(isNonKeywordAtSymbol('regular string')).toBe(false);
  });

  it('should return false for non-string values', () => {
    expect(isNonKeywordAtSymbol(123)).toBe(false);
    expect(isNonKeywordAtSymbol(null)).toBe(false);
  });
});

describe('isContextDependentKeyword', () => {
  it('should return true for @parent: keywords', () => {
    expect(isContextDependentKeyword('@parent:ID')).toBe(true);
  });

  it('should return true for @root: keywords', () => {
    expect(isContextDependentKeyword('@root:Name')).toBe(true);
  });

  it('should return false for @file: keywords', () => {
    expect(isContextDependentKeyword('@file:test.md')).toBe(false);
  });

  it('should return false for @lookup: keywords', () => {
    expect(isContextDependentKeyword('@lookup:Users.Name=Test')).toBe(false);
  });

  it('should return false for non-keyword strings', () => {
    expect(isContextDependentKeyword('regular string')).toBe(false);
  });
});

describe('isExternalReferenceKeyword', () => {
  it('should return true for @file: keywords', () => {
    expect(isExternalReferenceKeyword('@file:test.md')).toBe(true);
  });

  it('should return true for @url: keywords', () => {
    expect(isExternalReferenceKeyword('@url:https://example.com')).toBe(true);
  });

  it('should return true for @template: keywords', () => {
    expect(isExternalReferenceKeyword('@template:standard.json')).toBe(true);
  });

  it('should return false for @lookup: keywords', () => {
    expect(isExternalReferenceKeyword('@lookup:Users.Name=Test')).toBe(false);
  });

  it('should return false for @parent: keywords', () => {
    expect(isExternalReferenceKeyword('@parent:ID')).toBe(false);
  });
});

describe('createKeywordReference', () => {
  it('should create @file: reference', () => {
    expect(createKeywordReference('file', 'template.md')).toBe('@file:template.md');
  });

  it('should create @lookup: reference', () => {
    expect(createKeywordReference('lookup', 'Users.Email=test@example.com')).toBe('@lookup:Users.Email=test@example.com');
  });

  it('should create @parent: reference', () => {
    expect(createKeywordReference('parent', 'ID')).toBe('@parent:ID');
  });

  it('should create @root: reference', () => {
    expect(createKeywordReference('root', 'Name')).toBe('@root:Name');
  });

  it('should create @env: reference', () => {
    expect(createKeywordReference('env', 'NODE_ENV')).toBe('@env:NODE_ENV');
  });

  it('should create @include with dot notation for non-empty values', () => {
    expect(createKeywordReference('include', 'models')).toBe('@include.models');
  });

  it('should create bare @include for empty value', () => {
    expect(createKeywordReference('include', '')).toBe('@include');
  });

  it('should throw for unknown keyword type', () => {
    expect(() => createKeywordReference('unknown' as 'file', 'value')).toThrow('Unknown metadata keyword type: unknown');
  });
});

describe('Keyword category arrays', () => {
  it('CONTEXT_DEPENDENT_KEYWORDS should contain @parent: and @root:', () => {
    expect(CONTEXT_DEPENDENT_KEYWORDS).toContain(METADATA_KEYWORDS.PARENT);
    expect(CONTEXT_DEPENDENT_KEYWORDS).toContain(METADATA_KEYWORDS.ROOT);
    expect(CONTEXT_DEPENDENT_KEYWORDS).toHaveLength(2);
  });

  it('EXTERNAL_REFERENCE_KEYWORDS should contain @file:, @url:, and @template:', () => {
    expect(EXTERNAL_REFERENCE_KEYWORDS).toContain(METADATA_KEYWORDS.FILE);
    expect(EXTERNAL_REFERENCE_KEYWORDS).toContain(METADATA_KEYWORDS.URL);
    expect(EXTERNAL_REFERENCE_KEYWORDS).toContain(METADATA_KEYWORDS.TEMPLATE);
    expect(EXTERNAL_REFERENCE_KEYWORDS).toHaveLength(3);
  });

  it('LOOKUP_KEYWORDS should contain @lookup:', () => {
    expect(LOOKUP_KEYWORDS).toContain(METADATA_KEYWORDS.LOOKUP);
    expect(LOOKUP_KEYWORDS).toHaveLength(1);
  });

  it('RUNTIME_KEYWORDS should contain @env:', () => {
    expect(RUNTIME_KEYWORDS).toContain(METADATA_KEYWORDS.ENV);
    expect(RUNTIME_KEYWORDS).toHaveLength(1);
  });
});
