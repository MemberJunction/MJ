import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies before importing
vi.mock('@memberjunction/core', () => {
  return {
    Metadata: vi.fn().mockImplementation(function () {
      return {
        EntityByName: vi.fn().mockReturnValue(null),
        GetEntityObject: vi.fn().mockResolvedValue({}),
      };
    }),
    EntityInfo: vi.fn(),
    EntityFieldInfo: vi.fn(),
    RunView: vi.fn().mockImplementation(function () {
      return {
        RunView: vi.fn().mockResolvedValue({ Success: true, Results: [] }),
      };
    }),
  };
});

vi.mock('fs', () => {
  return {
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn().mockReturnValue('{}'),
    readdirSync: vi.fn().mockReturnValue([]),
    statSync: vi.fn().mockReturnValue({ isDirectory: () => true, isFile: () => true }),
  };
});

vi.mock('minimatch', () => ({
  minimatch: vi.fn((str: string, pattern: string) => {
    if (pattern === '*') return true;
    if (pattern === str) return true;
    return false;
  }),
}));

vi.mock('../lib/provider-utils', () => ({
  getSystemUser: vi.fn().mockReturnValue({ ID: 'system-user-id' }),
}));

import { ValidationService } from '../services/ValidationService';
import { parseMetadataReference } from '../lib/reference-parser';
import { METADATA_KEYWORDS } from '../constants/metadata-keywords';
import * as fs from 'fs';
// Type-only imports: erased at runtime, so they bypass the vi.mock above and
// give the fakes the real compile-time shapes.
import type { EntityFieldInfo, EntityFieldValueInfo, EntityInfo } from '@memberjunction/core';
import type { ValidationError, ValidationWarning } from '../types/validation';

describe('ValidationService', () => {
  let service: ValidationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ValidationService();
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const svc = new ValidationService();
      expect(svc).toBeInstanceOf(ValidationService);
    });

    it('should create instance with custom options', () => {
      const svc = new ValidationService({
        verbose: true,
        outputFormat: 'json',
        maxNestingDepth: 5,
        checkBestPractices: false,
      });
      expect(svc).toBeInstanceOf(ValidationService);
    });

    it('should create instance with include filter', () => {
      const svc = new ValidationService({
        include: ['users', 'roles'],
      });
      expect(svc).toBeInstanceOf(ValidationService);
    });

    it('should create instance with exclude filter', () => {
      const svc = new ValidationService({
        exclude: ['temp', 'draft'],
      });
      expect(svc).toBeInstanceOf(ValidationService);
    });
  });

  describe('validateDirectory', () => {
    it('should return error when no config file exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await service.validateDirectory('/test/dir');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('No .mj-sync.json configuration file found');
    });

    it('should throw when both include and exclude are specified', async () => {
      const svc = new ValidationService({
        include: ['users'],
        exclude: ['temp'],
      });

      await expect(svc.validateDirectory('/test/dir')).rejects.toThrow(
        'Cannot specify both --include and --exclude options'
      );
    });

    it('should return valid result when config exists but no subdirectories', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ directoryOrder: [] }));
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const result = await service.validateDirectory('/test/dir');

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('applyDirectoryFilters (tested through validateDirectory)', () => {
    it('should process directories with include filter', async () => {
      const svc = new ValidationService({ include: ['users'] });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ directoryOrder: [] }));
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const result = await svc.validateDirectory('/test/dir');
      expect(result).toBeDefined();
      expect(result.isValid).toBe(true);
    });

    it('should process directories with exclude filter', async () => {
      const svc = new ValidationService({ exclude: ['temp'] });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ directoryOrder: [] }));
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const result = await svc.validateDirectory('/test/dir');
      expect(result).toBeDefined();
      expect(result.isValid).toBe(true);
    });
  });
});

describe('parseMetadataReference — the REAL production parser', () => {
  // These suites drive parseMetadataReference (extracted from
  // ValidationService.parseReference), so parser drift fails them.

  describe('@file: references', () => {
    it('parses simple file references', () => {
      expect(parseMetadataReference('@file:template.md')).toEqual({
        type: METADATA_KEYWORDS.FILE,
        value: 'template.md',
      });
    });

    it('parses file references with relative paths', () => {
      expect(parseMetadataReference('@file:./shared/common-prompt.md')).toEqual({
        type: METADATA_KEYWORDS.FILE,
        value: './shared/common-prompt.md',
      });
    });

    it('parses file references with parent directories', () => {
      expect(parseMetadataReference('@file:../templates/standard-header.md')).toEqual({
        type: METADATA_KEYWORDS.FILE,
        value: '../templates/standard-header.md',
      });
    });

    it('returns null for a bare @file: with no path', () => {
      expect(parseMetadataReference('@file:')).toBeNull();
    });
  });

  describe('@lookup: references', () => {
    it('parses a single-field lookup into entity/field/value', () => {
      const parsed = parseMetadataReference('@lookup:Users.Email=john@example.com');
      expect(parsed).toEqual({
        type: METADATA_KEYWORDS.LOOKUP,
        entity: 'Users',
        field: 'Email',
        value: 'john@example.com',
        fields: [{ field: 'Email', value: 'john@example.com' }],
        createIfMissing: false,
        additionalFields: {},
      });
    });

    it('parses ?create — flag is stripped from the value and reported structurally', () => {
      // The retired tautological test asserted the raw remainder
      // 'Name=Examples?create'. The real parser goes further: it strips the
      // flag from the value and surfaces it as createIfMissing.
      const parsed = parseMetadataReference('@lookup:Categories.Name=Examples?create');
      expect(parsed).toEqual({
        type: METADATA_KEYWORDS.LOOKUP,
        entity: 'Categories',
        field: 'Name',
        value: 'Examples',
        fields: [{ field: 'Name', value: 'Examples' }],
        createIfMissing: true,
        additionalFields: {},
      });
    });

    it('parses multi-field lookups into an ordered fields array with the first as primary', () => {
      const parsed = parseMetadataReference('@lookup:Users.Email=john@example.com&Department=Sales');
      expect(parsed).not.toBeNull();
      expect(parsed!.entity).toBe('Users');
      expect(parsed!.fields).toEqual([
        { field: 'Email', value: 'john@example.com' },
        { field: 'Department', value: 'Sales' },
      ]);
      // Backward compatibility: first criterion doubles as field/value
      expect(parsed!.field).toBe('Email');
      expect(parsed!.value).toBe('john@example.com');
    });

    it('parses ?create with additional creation fields (URI-decoded)', () => {
      const parsed = parseMetadataReference(
        '@lookup:Categories.Name=Examples?create&Description=Example%20prompts',
      );
      expect(parsed).not.toBeNull();
      expect(parsed!.createIfMissing).toBe(true);
      expect(parsed!.fields).toEqual([{ field: 'Name', value: 'Examples' }]);
      expect(parsed!.additionalFields).toEqual({ Description: 'Example prompts' });
    });

    it('parses ?create with a literal-space additional field', () => {
      const parsed = parseMetadataReference(
        '@lookup:Categories.Name=Examples?create&Description=Example prompts',
      );
      expect(parsed!.additionalFields).toEqual({ Description: 'Example prompts' });
    });

    it('reports createIfMissing=false when ?create is absent', () => {
      const parsed = parseMetadataReference('@lookup:Roles.Name=Admin');
      expect(parsed!.createIfMissing).toBe(false);
      expect(parsed!.additionalFields).toEqual({});
    });

    it('trims whitespace around field names and values', () => {
      const parsed = parseMetadataReference('@lookup:Users.Name = Jane Doe');
      expect(parsed!.fields).toEqual([{ field: 'Name', value: 'Jane Doe' }]);
    });

    it('supports spaces and colons in entity names (MJ: prefix)', () => {
      const parsed = parseMetadataReference('@lookup:MJ: AI Prompt Types.Name=Chat');
      expect(parsed!.entity).toBe('MJ: AI Prompt Types');
      expect(parsed!.fields).toEqual([{ field: 'Name', value: 'Chat' }]);
    });

    it('returns null for a lookup without an entity name', () => {
      expect(parseMetadataReference('@lookup:.Name=Test')).toBeNull();
    });

    it('parses criteria without "=" into an empty fields array (permissive; the sync engine rejects these at push time)', () => {
      const parsed = parseMetadataReference('@lookup:Users.NoEqualsSign');
      expect(parsed).not.toBeNull();
      expect(parsed!.fields).toEqual([]);
      expect(parsed!.field).toBe('');
      expect(parsed!.value).toBe('');
    });

    it('documents the substring quirk: any "?create" occurrence in the value activates create mode', () => {
      // Real behavior pinned on purpose: hasCreate is a substring test, so a
      // value containing "?create..." (here "What?createdBy") trips it and the
      // value is truncated at the first "?".
      const parsed = parseMetadataReference('@lookup:Notes.Title=What?createdBy');
      expect(parsed!.createIfMissing).toBe(true);
      expect(parsed!.fields).toEqual([{ field: 'Title', value: 'What' }]);
    });
  });

  describe('@parent: references', () => {
    it('parses parent field references', () => {
      expect(parseMetadataReference('@parent:ID')).toEqual({
        type: METADATA_KEYWORDS.PARENT,
        value: 'ID',
      });
    });

    it('parses parent references with longer field names', () => {
      expect(parseMetadataReference('@parent:CategoryID')).toEqual({
        type: METADATA_KEYWORDS.PARENT,
        value: 'CategoryID',
      });
    });
  });

  describe('@root: references', () => {
    it('parses root field references', () => {
      expect(parseMetadataReference('@root:ID')).toEqual({
        type: METADATA_KEYWORDS.ROOT,
        value: 'ID',
      });
    });

    it('parses root references with named fields', () => {
      expect(parseMetadataReference('@root:Name')).toEqual({
        type: METADATA_KEYWORDS.ROOT,
        value: 'Name',
      });
    });
  });

  describe('@env: references', () => {
    it('parses env references', () => {
      expect(parseMetadataReference('@env:NODE_ENV')).toEqual({
        type: METADATA_KEYWORDS.ENV,
        value: 'NODE_ENV',
      });
    });

    it('parses env references with underscores', () => {
      expect(parseMetadataReference('@env:DATABASE_CONNECTION_STRING')).toEqual({
        type: METADATA_KEYWORDS.ENV,
        value: 'DATABASE_CONNECTION_STRING',
      });
    });
  });

  describe('@template: references', () => {
    it('parses template references', () => {
      expect(parseMetadataReference('@template:templates/standard-ai-models.json')).toEqual({
        type: METADATA_KEYWORDS.TEMPLATE,
        value: 'templates/standard-ai-models.json',
      });
    });
  });

  describe('non-references', () => {
    it('returns null for plain strings', () => {
      expect(parseMetadataReference('regular string')).toBeNull();
    });

    it('returns null for unknown @ prefixes (npm scopes, emails)', () => {
      expect(parseMetadataReference('@mui/material')).toBeNull();
      expect(parseMetadataReference('@unknown:value')).toBeNull();
    });

    it('documents that the validation-side parser does NOT understand @url: (the sync engine does)', () => {
      expect(parseMetadataReference('@url:https://example.com/prompt.md')).toBeNull();
    });
  });
});

describe('ValidationService - Topological Sort (real implementation)', () => {
  // Dependencies are seeded through the REAL pipeline: trackEntityDependencies
  // parses @lookup references (via parseMetadataReference) and registers
  // entity → entity edges, then the real topologicalSort orders them.

  function trackEntity(svc: ValidationService, entityName: string, lookups: string[]): void {
    const fields: Record<string, string> = {};
    lookups.forEach((lookup, i) => {
      fields[`Ref${i}`] = lookup;
    });
    svc['trackEntityDependencies']({ fields }, entityName, `/meta/${entityName}.json`);
  }

  it('sorts entities with linear dependencies (C→B→A) into dependency order', () => {
    const svc = new ValidationService();
    trackEntity(svc, 'C', ['@lookup:B.Name=x']);
    trackEntity(svc, 'B', ['@lookup:A.Name=x']);
    trackEntity(svc, 'A', []);

    expect(svc['topologicalSort']()).toEqual(['A', 'B', 'C']);
  });

  it('includes all entities when none have dependencies', () => {
    const svc = new ValidationService();
    trackEntity(svc, 'A', []);
    trackEntity(svc, 'B', []);
    trackEntity(svc, 'C', []);

    const result = svc['topologicalSort']();
    expect(result).toHaveLength(3);
    expect(result).toContain('A');
    expect(result).toContain('B');
    expect(result).toContain('C');
  });

  it('orders diamond dependency patterns correctly (A→{B,C}→D)', () => {
    const svc = new ValidationService();
    trackEntity(svc, 'A', ['@lookup:B.Name=x', '@lookup:C.Name=x']);
    trackEntity(svc, 'B', ['@lookup:D.Name=x']);
    trackEntity(svc, 'C', ['@lookup:D.Name=x']);
    trackEntity(svc, 'D', []);

    const result = svc['topologicalSort']();
    expect(result).toHaveLength(4);
    expect(result.indexOf('D')).toBeLessThan(result.indexOf('B'));
    expect(result.indexOf('D')).toBeLessThan(result.indexOf('C'));
    expect(result.indexOf('B')).toBeLessThan(result.indexOf('A'));
    expect(result.indexOf('C')).toBeLessThan(result.indexOf('A'));
  });

  it('detects circular dependencies and reports the cycle path as an error', () => {
    const svc = new ValidationService();
    trackEntity(svc, 'A', ['@lookup:B.Name=x']);
    trackEntity(svc, 'B', ['@lookup:C.Name=x']);
    trackEntity(svc, 'C', ['@lookup:A.Name=x']);

    const detected = svc['checkCircularDependency']('A', new Set<string>(), new Set<string>());

    expect(detected).toBe(true);
    const circularErrors = svc['errors'].filter((e) => e.type === 'circular');
    expect(circularErrors).toHaveLength(1);
    expect(circularErrors[0].message).toBe('Circular dependency detected: A → B → C → A');
  });

  it('reports no circular error for an acyclic graph', () => {
    const svc = new ValidationService();
    trackEntity(svc, 'B', ['@lookup:A.Name=x']);
    trackEntity(svc, 'A', []);

    const detected = svc['checkCircularDependency']('B', new Set<string>(), new Set<string>());

    expect(detected).toBe(false);
    expect(svc['errors']).toHaveLength(0);
  });
});

describe('ValidationService - Field Value List Validation (comma-delimited multi-value)', () => {
  let service: ValidationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ValidationService();
  });

  const phaseAllowedValues = [
    'Requirements Expert',
    'Technical Project Manager',
    'Data Expert',
    'Software Architect',
    'Coder',
  ];

  function makeFieldInfo(valueListType: string, allowedValues: string[]): EntityFieldInfo {
    // Structural subset of EntityFieldInfo consumed by validateFieldValueList
    return {
      Name: 'Phase',
      ValueListType: valueListType,
      EntityFieldValues: allowedValues.map((v) => ({ Value: v } as EntityFieldValueInfo)),
    } as EntityFieldInfo;
  }

  function makeEntityInfo(): EntityInfo {
    return { Name: 'Notes' } as EntityInfo;
  }

  async function callValidate(
    svc: ValidationService,
    value: string | null | undefined,
    fieldInfo: EntityFieldInfo,
    entityInfo: EntityInfo,
    filePath: string,
  ): Promise<{ errors: ValidationError[]; warnings: ValidationWarning[] }> {
    // Reset internal state
    svc['errors'] = [];
    svc['warnings'] = [];
    await svc['validateFieldValueList'](value, fieldInfo, entityInfo, filePath);
    return {
      errors: svc['errors'],
      warnings: svc['warnings'],
    };
  }

  it('should accept a single valid value', async () => {
    const { errors, warnings } = await callValidate(
      service,
      'Data Expert',
      makeFieldInfo('List', phaseAllowedValues),
      makeEntityInfo(),
      '/test/notes.json',
    );
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it('should reject a single invalid value', async () => {
    const { errors } = await callValidate(
      service,
      'Nonexistent Phase',
      makeFieldInfo('List', phaseAllowedValues),
      makeEntityInfo(),
      '/test/notes.json',
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Nonexistent Phase');
  });

  it('should accept comma-delimited multi-value where all segments are valid', async () => {
    const { errors, warnings } = await callValidate(
      service,
      'Data Expert,Requirements Expert',
      makeFieldInfo('List', phaseAllowedValues),
      makeEntityInfo(),
      '/test/notes.json',
    );
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it('should accept comma-delimited multi-value with spaces after commas', async () => {
    const { errors, warnings } = await callValidate(
      service,
      'Data Expert, Requirements Expert',
      makeFieldInfo('List', phaseAllowedValues),
      makeEntityInfo(),
      '/test/notes.json',
    );
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it('should reject comma-delimited value when one segment is invalid', async () => {
    const { errors } = await callValidate(
      service,
      'Data Expert,Bogus Value',
      makeFieldInfo('List', phaseAllowedValues),
      makeEntityInfo(),
      '/test/notes.json',
    );
    // All segments not valid, so treated as single value → 1 error for the whole string
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Data Expert,Bogus Value');
  });

  it('should accept three comma-delimited valid values', async () => {
    const { errors, warnings } = await callValidate(
      service,
      'Data Expert, Requirements Expert, Coder',
      makeFieldInfo('List', phaseAllowedValues),
      makeEntityInfo(),
      '/test/notes.json',
    );
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it('should not split when the whole string is itself an allowed value', async () => {
    // Edge case: an allowed value that happens to contain a comma
    const allowedValues = ['Alpha, Beta', 'Gamma'];
    const { errors, warnings } = await callValidate(
      service,
      'Alpha, Beta',
      makeFieldInfo('List', allowedValues),
      makeEntityInfo(),
      '/test/notes.json',
    );
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it('should not split free text that contains commas when segments do not match allowed values', async () => {
    const { errors } = await callValidate(
      service,
      'Hello, this is a description',
      makeFieldInfo('List', phaseAllowedValues),
      makeEntityInfo(),
      '/test/notes.json',
    );
    // "Hello" and "this is a description" don't match allowed values
    // so it's treated as a single invalid value
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Hello, this is a description');
  });

  it('should warn on case mismatch in comma-delimited segments', async () => {
    const { errors, warnings } = await callValidate(
      service,
      'data expert, requirements expert',
      makeFieldInfo('List', phaseAllowedValues),
      makeEntityInfo(),
      '/test/notes.json',
    );
    // All segments match case-insensitively, so treated as multi-value with warnings
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(2);
    expect(warnings[0].message).toContain('data expert');
    expect(warnings[1].message).toContain('requirements expert');
  });

  it('should skip validation when ValueListType is not List', async () => {
    const { errors, warnings } = await callValidate(
      service,
      'anything goes here, even commas',
      makeFieldInfo('None', phaseAllowedValues),
      makeEntityInfo(),
      '/test/notes.json',
    );
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it('should skip validation for null/undefined/empty values', async () => {
    for (const val of [null, undefined, '']) {
      const { errors, warnings } = await callValidate(
        service,
        val,
        makeFieldInfo('List', phaseAllowedValues),
        makeEntityInfo(),
        '/test/notes.json',
      );
      expect(errors).toHaveLength(0);
      expect(warnings).toHaveLength(0);
    }
  });

  it('should skip validation when EntityFieldValues is empty', async () => {
    const { errors, warnings } = await callValidate(
      service,
      'Data Expert',
      makeFieldInfo('List', []),
      makeEntityInfo(),
      '/test/notes.json',
    );
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });
});

describe('ValidationService - Required-field warning is NEW-record-only', () => {
  // A NOT-NULL field with no default — e.g. BaseView on MJ: Entities. Existing
  // records already hold its value in the DB, so a metadata file that omits it
  // (because it only updates some other field) must NOT be warned about.
  // Structural subset of EntityFieldInfo read by validateFields' required-field
  // pass, plus IsForeignKey which the pass probes on sibling fields.
  type RequiredCheckFieldShape = Partial<EntityFieldInfo> & { IsForeignKey?: boolean };

  function makeEntityInfoWithRequiredField(): EntityInfo {
    const fields: RequiredCheckFieldShape[] = [
      { Name: 'Name', AllowsNull: true, DefaultValue: null, RelatedEntity: null, AutoIncrement: false, IsForeignKey: false },
      { Name: 'BaseView', AllowsNull: false, DefaultValue: null, RelatedEntity: null, AutoIncrement: false, IsForeignKey: false },
    ];
    return {
      Name: 'MJ: Entities',
      Fields: fields as EntityFieldInfo[],
    } as EntityInfo;
  }

  async function callValidateFields(
    fields: Record<string, unknown>,
    isExistingRecord: boolean,
  ): Promise<{ errors: ValidationError[]; warnings: ValidationWarning[] }> {
    const svc = new ValidationService({ checkBestPractices: true });
    svc['errors'] = [];
    svc['warnings'] = [];
    await svc['validateFields'](fields, makeEntityInfoWithRequiredField(), '/test/entities.json', undefined, isExistingRecord);
    return { errors: svc['errors'], warnings: svc['warnings'] };
  }

  it('warns about a missing required field for a NEW record (no primaryKey)', async () => {
    const { warnings } = await callValidateFields({}, false);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].field).toBe('BaseView');
    expect(warnings[0].message).toContain('BaseView');
  });

  it('does NOT warn about a missing required field for an EXISTING record (has primaryKey)', async () => {
    const { warnings } = await callValidateFields({}, true);
    expect(warnings).toHaveLength(0);
  });

  it('does not warn for a NEW record when the required field IS provided', async () => {
    const { warnings } = await callValidateFields({ BaseView: 'vwTest' }, false);
    expect(warnings).toHaveLength(0);
  });
});

describe('ValidationService - Dependency Order Checking (real implementation)', () => {
  function trackEntity(svc: ValidationService, entityName: string, lookups: string[]): void {
    const fields: Record<string, string> = {};
    lookups.forEach((lookup, i) => {
      fields[`Ref${i}`] = lookup;
    });
    svc['trackEntityDependencies']({ fields }, entityName, `/meta/${entityName}.json`);
  }

  it('detects order violations when a dependent entity is processed first', () => {
    const svc = new ValidationService();
    trackEntity(svc, 'B', ['@lookup:A.Name=x']); // B depends on A
    trackEntity(svc, 'A', []);

    const violations = svc['checkDependencyOrder'](['B', 'A']);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual({
      entity: 'B',
      dependency: 'A',
      file: '/meta/B.json',
    });
  });

  it('detects no violations when the order satisfies dependencies', () => {
    const svc = new ValidationService();
    trackEntity(svc, 'B', ['@lookup:A.Name=x']);
    trackEntity(svc, 'A', []);

    expect(svc['checkDependencyOrder'](['A', 'B'])).toHaveLength(0);
  });

  it('ignores dependencies on entities outside the directory order', () => {
    const svc = new ValidationService();
    trackEntity(svc, 'B', ['@lookup:External.Name=x']);

    // 'External' is not in the processed order, so it cannot be a violation
    expect(svc['checkDependencyOrder'](['B'])).toHaveLength(0);
  });

  it('skips self-dependencies (hierarchical ParentID lookups)', () => {
    const svc = new ValidationService();
    trackEntity(svc, 'Categories', ['@lookup:Categories.Name=Parent Category']);

    // The self-referencing lookup must not register a dependency edge...
    expect(svc['entityDependencies'].get('Categories')?.dependsOn.size).toBe(0);
    // ...so processing order can never violate it
    expect(svc['checkDependencyOrder'](['Categories'])).toHaveLength(0);
  });
});
