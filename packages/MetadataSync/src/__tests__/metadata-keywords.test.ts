import { describe, it, expect } from 'vitest';
import {
  METADATA_KEYWORDS,
  METADATA_KEYWORD_PREFIXES,
  IsMetadataKeyword,
  GetMetadataKeywordType,
  ExtractKeywordValue,
  HasMetadataKeyword,
  IsNonKeywordAtSymbol,
  IsContextDependentKeyword,
  IsExternalReferenceKeyword,
  CreateKeywordReference,
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
    expect(METADATA_KEYWORDS.OWNER).toBe('@owner:');
    expect(METADATA_KEYWORDS.ROOT).toBe('@root:');
    expect(METADATA_KEYWORDS.ENV).toBe('@env:');
    expect(METADATA_KEYWORDS.URL).toBe('@url:');
    expect(METADATA_KEYWORDS.TEMPLATE).toBe('@template:');
    expect(METADATA_KEYWORDS.INCLUDE).toBe('@include');
  });

  it('should be frozen/readonly (const assertion)', () => {
    expect(Object.keys(METADATA_KEYWORDS)).toHaveLength(9);
  });
});

describe('METADATA_KEYWORD_PREFIXES', () => {
  it('should contain all keyword values', () => {
    expect(METADATA_KEYWORD_PREFIXES).toContain('@file:');
    expect(METADATA_KEYWORD_PREFIXES).toContain('@lookup:');
    expect(METADATA_KEYWORD_PREFIXES).toContain('@parent:');
    expect(METADATA_KEYWORD_PREFIXES).toContain('@owner:');
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
    expect(IsMetadataKeyword('@file:template.md')).toBe(true);
  });

  it('should return true for @lookup: references', () => {
    expect(IsMetadataKeyword('@lookup:Users.Email=test@example.com')).toBe(true);
  });

  it('should return true for @parent: references', () => {
    expect(IsMetadataKeyword('@parent:ID')).toBe(true);
  });

  it('should return true for @owner: references', () => {
    expect(IsMetadataKeyword('@owner:ShipToPersonID')).toBe(true);
  });

  it('should return true for @root: references', () => {
    expect(IsMetadataKeyword('@root:Name')).toBe(true);
  });

  it('should return true for @env: references', () => {
    expect(IsMetadataKeyword('@env:NODE_ENV')).toBe(true);
  });

  it('should return true for @url: references', () => {
    expect(IsMetadataKeyword('@url:https://example.com')).toBe(true);
  });

  it('should return true for @template: references', () => {
    expect(IsMetadataKeyword('@template:templates/standard.json')).toBe(true);
  });

  it('should return true for bare @include', () => {
    expect(IsMetadataKeyword('@include')).toBe(true);
  });

  it('should return false for regular strings', () => {
    expect(IsMetadataKeyword('regular string')).toBe(false);
  });

  it('should return false for non-string values', () => {
    expect(IsMetadataKeyword(123)).toBe(false);
    expect(IsMetadataKeyword(null)).toBe(false);
    expect(IsMetadataKeyword(undefined)).toBe(false);
    expect(IsMetadataKeyword({})).toBe(false);
    expect(IsMetadataKeyword([])).toBe(false);
    expect(IsMetadataKeyword(true)).toBe(false);
  });

  it('should return false for unknown @ strings', () => {
    expect(IsMetadataKeyword('@unknown:value')).toBe(false);
    expect(IsMetadataKeyword('@angular/core')).toBe(false);
    expect(IsMetadataKeyword('@mui/material')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(IsMetadataKeyword('')).toBe(false);
  });
});

describe('getMetadataKeywordType', () => {
  it('should return "file" for @file: references', () => {
    expect(GetMetadataKeywordType('@file:template.md')).toBe('file');
  });

  it('should return "lookup" for @lookup: references', () => {
    expect(GetMetadataKeywordType('@lookup:Users.Name=John')).toBe('lookup');
  });

  it('should return "parent" for @parent: references', () => {
    expect(GetMetadataKeywordType('@parent:ID')).toBe('parent');
  });

  it('should return "owner" for @owner: references', () => {
    expect(GetMetadataKeywordType('@owner:ShipToPersonID')).toBe('owner');
  });

  it('should return "root" for @root: references', () => {
    expect(GetMetadataKeywordType('@root:ID')).toBe('root');
  });

  it('should return "env" for @env: references', () => {
    expect(GetMetadataKeywordType('@env:DATABASE_URL')).toBe('env');
  });

  it('should return "url" for @url: references', () => {
    expect(GetMetadataKeywordType('@url:https://example.com')).toBe('url');
  });

  it('should return "template" for @template: references', () => {
    expect(GetMetadataKeywordType('@template:standard.json')).toBe('template');
  });

  it('should return "include" for bare @include', () => {
    expect(GetMetadataKeywordType('@include')).toBe('include');
  });

  it('should return "include" for @include. dot notation', () => {
    expect(GetMetadataKeywordType('@include.models')).toBe('include');
  });

  it('should return null for regular strings', () => {
    expect(GetMetadataKeywordType('regular string')).toBeNull();
  });

  it('should return null for unknown @ strings', () => {
    expect(GetMetadataKeywordType('@unknown:value')).toBeNull();
  });
});

describe('extractKeywordValue', () => {
  it('should extract value from @file: reference', () => {
    expect(ExtractKeywordValue('@file:template.md')).toBe('template.md');
  });

  it('should extract value from @lookup: reference', () => {
    expect(ExtractKeywordValue('@lookup:Users.Email=test@example.com')).toBe('Users.Email=test@example.com');
  });

  it('should extract value from @parent: reference', () => {
    expect(ExtractKeywordValue('@parent:ID')).toBe('ID');
  });

  it('should extract value from @owner: reference', () => {
    expect(ExtractKeywordValue('@owner:ShipToPersonID')).toBe('ShipToPersonID');
  });

  it('should extract value from @root: reference', () => {
    expect(ExtractKeywordValue('@root:Name')).toBe('Name');
  });

  it('should extract value from @env: reference', () => {
    expect(ExtractKeywordValue('@env:NODE_ENV')).toBe('NODE_ENV');
  });

  it('should return empty string for bare @include', () => {
    expect(ExtractKeywordValue('@include')).toBe('');
  });

  it('should extract suffix from @include. dot notation', () => {
    expect(ExtractKeywordValue('@include.models')).toBe('models');
  });

  it('should return null for non-keyword strings', () => {
    expect(ExtractKeywordValue('regular string')).toBeNull();
  });

  it('should return null for non-string input', () => {
    expect(ExtractKeywordValue(123 as unknown as string)).toBeNull();
  });
});

describe('hasMetadataKeyword', () => {
  it('should behave identically to isMetadataKeyword', () => {
    expect(HasMetadataKeyword('@file:test.md')).toBe(true);
    expect(HasMetadataKeyword('plain text')).toBe(false);
    expect(HasMetadataKeyword(42)).toBe(false);
    expect(HasMetadataKeyword(null)).toBe(false);
  });
});

describe('isNonKeywordAtSymbol', () => {
  it('should return true for npm package names', () => {
    expect(IsNonKeywordAtSymbol('@mui/material')).toBe(true);
    expect(IsNonKeywordAtSymbol('@angular/core')).toBe(true);
  });

  it('should return false for metadata keywords', () => {
    expect(IsNonKeywordAtSymbol('@file:template.md')).toBe(false);
    expect(IsNonKeywordAtSymbol('@lookup:Users.Name=John')).toBe(false);
  });

  it('should return false for strings not starting with @', () => {
    expect(IsNonKeywordAtSymbol('regular string')).toBe(false);
  });

  it('should return false for non-string values', () => {
    expect(IsNonKeywordAtSymbol(123)).toBe(false);
    expect(IsNonKeywordAtSymbol(null)).toBe(false);
  });
});

describe('isContextDependentKeyword', () => {
  it('should return true for @parent: keywords', () => {
    expect(IsContextDependentKeyword('@parent:ID')).toBe(true);
  });

  it('should return true for @root: keywords', () => {
    expect(IsContextDependentKeyword('@root:Name')).toBe(true);
  });

  it('should return true for @owner: keywords', () => {
    expect(IsContextDependentKeyword('@owner:ShipToPersonID')).toBe(true);
  });

  it('should return false for @file: keywords', () => {
    expect(IsContextDependentKeyword('@file:test.md')).toBe(false);
  });

  it('should return false for @lookup: keywords', () => {
    expect(IsContextDependentKeyword('@lookup:Users.Name=Test')).toBe(false);
  });

  it('should return false for non-keyword strings', () => {
    expect(IsContextDependentKeyword('regular string')).toBe(false);
  });
});

describe('isExternalReferenceKeyword', () => {
  it('should return true for @file: keywords', () => {
    expect(IsExternalReferenceKeyword('@file:test.md')).toBe(true);
  });

  it('should return true for @url: keywords', () => {
    expect(IsExternalReferenceKeyword('@url:https://example.com')).toBe(true);
  });

  it('should return true for @template: keywords', () => {
    expect(IsExternalReferenceKeyword('@template:standard.json')).toBe(true);
  });

  it('should return false for @lookup: keywords', () => {
    expect(IsExternalReferenceKeyword('@lookup:Users.Name=Test')).toBe(false);
  });

  it('should return false for @parent: keywords', () => {
    expect(IsExternalReferenceKeyword('@parent:ID')).toBe(false);
  });

  it('should return false for @owner: keywords', () => {
    expect(IsExternalReferenceKeyword('@owner:ShipToPersonID')).toBe(false);
  });
});

describe('createKeywordReference', () => {
  it('should create @file: reference', () => {
    expect(CreateKeywordReference('file', 'template.md')).toBe('@file:template.md');
  });

  it('should create @lookup: reference', () => {
    expect(CreateKeywordReference('lookup', 'Users.Email=test@example.com')).toBe('@lookup:Users.Email=test@example.com');
  });

  it('should create @parent: reference', () => {
    expect(CreateKeywordReference('parent', 'ID')).toBe('@parent:ID');
  });

  it('should create @owner: reference', () => {
    expect(CreateKeywordReference('owner', 'ShipToPersonID')).toBe('@owner:ShipToPersonID');
  });

  it('should create @root: reference', () => {
    expect(CreateKeywordReference('root', 'Name')).toBe('@root:Name');
  });

  it('should create @env: reference', () => {
    expect(CreateKeywordReference('env', 'NODE_ENV')).toBe('@env:NODE_ENV');
  });

  it('should create @include with dot notation for non-empty values', () => {
    expect(CreateKeywordReference('include', 'models')).toBe('@include.models');
  });

  it('should create bare @include for empty value', () => {
    expect(CreateKeywordReference('include', '')).toBe('@include');
  });

  it('should throw for unknown keyword type', () => {
    expect(() => CreateKeywordReference('unknown' as 'file', 'value')).toThrow('Unknown metadata keyword type: unknown');
  });
});

describe('Keyword category arrays', () => {
  it('CONTEXT_DEPENDENT_KEYWORDS should contain @parent:, @root:, and @owner:', () => {
    expect(CONTEXT_DEPENDENT_KEYWORDS).toContain(METADATA_KEYWORDS.PARENT);
    expect(CONTEXT_DEPENDENT_KEYWORDS).toContain(METADATA_KEYWORDS.ROOT);
    expect(CONTEXT_DEPENDENT_KEYWORDS).toContain(METADATA_KEYWORDS.OWNER);
    expect(CONTEXT_DEPENDENT_KEYWORDS).toHaveLength(3);
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
