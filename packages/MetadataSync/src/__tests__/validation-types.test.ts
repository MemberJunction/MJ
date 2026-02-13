import { describe, it, expect } from 'vitest';
import {
  ValidationErrorClass,
  ValidationWarningClass,
} from '../types/validation';
import type {
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationSummary,
  FileValidationResult,
  EntityDependency,
  ValidationOptions,
  ParsedReference,
} from '../types/validation';

describe('ValidationErrorClass', () => {
  it('should create an instance with all properties', () => {
    const error: ValidationError = {
      type: 'field',
      severity: 'error',
      entity: 'Users',
      field: 'Email',
      file: '/path/to/file.json',
      message: 'Field "Email" does not exist on entity "Users"',
      suggestion: 'Check field name spelling',
    };

    const errorClass = new ValidationErrorClass(error);

    expect(errorClass).toBeInstanceOf(Error);
    expect(errorClass).toBeInstanceOf(ValidationErrorClass);
    expect(errorClass.name).toBe('ValidationError');
    expect(errorClass.type).toBe('field');
    expect(errorClass.severity).toBe('error');
    expect(errorClass.entity).toBe('Users');
    expect(errorClass.field).toBe('Email');
    expect(errorClass.file).toBe('/path/to/file.json');
    expect(errorClass.message).toBe('Field "Email" does not exist on entity "Users"');
    expect(errorClass.suggestion).toBe('Check field name spelling');
  });

  it('should extract line number from message', () => {
    const error: ValidationError = {
      type: 'entity',
      severity: 'error',
      file: '/path/to/file.json',
      message: 'Parse error at line 42',
    };

    const errorClass = new ValidationErrorClass(error);
    expect(errorClass.line).toBe(42);
    expect(errorClass.column).toBeUndefined();
  });

  it('should extract both line and column from message', () => {
    const error: ValidationError = {
      type: 'entity',
      severity: 'error',
      file: '/path/to/file.json',
      message: 'Error at line 10, column 5',
    };

    const errorClass = new ValidationErrorClass(error);
    expect(errorClass.line).toBe(10);
    expect(errorClass.column).toBe(5);
  });

  it('should handle messages without line/column info', () => {
    const error: ValidationError = {
      type: 'reference',
      severity: 'error',
      file: '/path/to/file.json',
      message: 'File reference not found',
    };

    const errorClass = new ValidationErrorClass(error);
    expect(errorClass.line).toBeUndefined();
    expect(errorClass.column).toBeUndefined();
  });

  describe('getFormattedMessage', () => {
    it('should return base message when no line info', () => {
      const error: ValidationError = {
        type: 'field',
        severity: 'error',
        file: '/path/file.json',
        message: 'Simple error',
      };

      const errorClass = new ValidationErrorClass(error);
      expect(errorClass.getFormattedMessage()).toBe('Simple error');
    });

    it('should append line info when available', () => {
      const error: ValidationError = {
        type: 'field',
        severity: 'error',
        file: '/path/file.json',
        message: 'Error at line 15',
      };

      const errorClass = new ValidationErrorClass(error);
      expect(errorClass.getFormattedMessage()).toBe('Error at line 15 (line 15)');
    });

    it('should append line and column info when both available', () => {
      const error: ValidationError = {
        type: 'field',
        severity: 'error',
        file: '/path/file.json',
        message: 'Error at line 15, column 20',
      };

      const errorClass = new ValidationErrorClass(error);
      expect(errorClass.getFormattedMessage()).toBe('Error at line 15, column 20 (line 15, column 20)');
    });
  });
});

describe('ValidationWarningClass', () => {
  it('should create an instance with all properties', () => {
    const warning: ValidationWarning = {
      type: 'bestpractice',
      severity: 'warning',
      entity: 'Users',
      field: 'Name',
      file: '/path/to/file.json',
      message: 'Required field "Name" is missing',
      suggestion: 'Add "Name" to the fields object',
    };

    const warningClass = new ValidationWarningClass(warning);

    expect(warningClass).toBeInstanceOf(Error);
    expect(warningClass).toBeInstanceOf(ValidationWarningClass);
    expect(warningClass.name).toBe('ValidationWarning');
    expect(warningClass.type).toBe('bestpractice');
    expect(warningClass.severity).toBe('warning');
    expect(warningClass.entity).toBe('Users');
    expect(warningClass.field).toBe('Name');
    expect(warningClass.file).toBe('/path/to/file.json');
  });

  it('should extract line number from message', () => {
    const warning: ValidationWarning = {
      type: 'nesting',
      severity: 'warning',
      file: '/path/to/file.json',
      message: 'Deep nesting at line 100',
    };

    const warningClass = new ValidationWarningClass(warning);
    expect(warningClass.line).toBe(100);
  });

  it('should handle messages without line/column info', () => {
    const warning: ValidationWarning = {
      type: 'naming',
      severity: 'warning',
      file: '/path/to/file.json',
      message: 'Consider renaming this field',
    };

    const warningClass = new ValidationWarningClass(warning);
    expect(warningClass.line).toBeUndefined();
    expect(warningClass.column).toBeUndefined();
  });

  describe('getFormattedMessage', () => {
    it('should return base message when no line info', () => {
      const warning: ValidationWarning = {
        type: 'naming',
        severity: 'warning',
        file: '/path/file.json',
        message: 'Simple warning',
      };

      const warningClass = new ValidationWarningClass(warning);
      expect(warningClass.getFormattedMessage()).toBe('Simple warning');
    });

    it('should append line info when available', () => {
      const warning: ValidationWarning = {
        type: 'naming',
        severity: 'warning',
        file: '/path/file.json',
        message: 'Warning at line 5',
      };

      const warningClass = new ValidationWarningClass(warning);
      expect(warningClass.getFormattedMessage()).toBe('Warning at line 5 (line 5)');
    });
  });
});

describe('Type interfaces shape validation', () => {
  it('should allow creating a valid ValidationResult', () => {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      summary: {
        totalFiles: 5,
        totalEntities: 10,
        totalErrors: 0,
        totalWarnings: 0,
        fileResults: new Map(),
      },
    };

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.summary.totalFiles).toBe(5);
    expect(result.summary.totalEntities).toBe(10);
  });

  it('should allow creating a FileValidationResult', () => {
    const fileResult: FileValidationResult = {
      file: '/path/to/file.json',
      entityCount: 3,
      errors: [],
      warnings: [],
    };

    expect(fileResult.file).toBe('/path/to/file.json');
    expect(fileResult.entityCount).toBe(3);
  });

  it('should allow creating EntityDependency with Set', () => {
    const dep: EntityDependency = {
      entityName: 'MJ: Users',
      dependsOn: new Set(['Roles', 'Departments']),
      file: '/path/to/users.json',
    };

    expect(dep.entityName).toBe('Users');
    expect(dep.dependsOn.size).toBe(2);
    expect(dep.dependsOn.has('Roles')).toBe(true);
  });

  it('should allow creating ValidationOptions with defaults', () => {
    const opts: ValidationOptions = {
      verbose: false,
      outputFormat: 'human',
      maxNestingDepth: 10,
      checkBestPractices: true,
    };

    expect(opts.verbose).toBe(false);
    expect(opts.outputFormat).toBe('human');
  });

  it('should allow creating ValidationOptions with include/exclude', () => {
    const opts: ValidationOptions = {
      verbose: true,
      outputFormat: 'json',
      maxNestingDepth: 5,
      checkBestPractices: false,
      include: ['users', 'roles'],
      exclude: ['temp'],
    };

    expect(opts.include).toEqual(['users', 'roles']);
    expect(opts.exclude).toEqual(['temp']);
  });

  it('should allow creating a ParsedReference', () => {
    const ref: ParsedReference = {
      type: '@lookup:',
      value: 'Admin',
      entity: 'Roles',
      field: 'Name',
      fields: [{ field: 'Name', value: 'Admin' }],
      createIfMissing: true,
      additionalFields: { Description: 'Administrator role' },
    };

    expect(ref.type).toBe('@lookup:');
    expect(ref.entity).toBe('Roles');
    expect(ref.createIfMissing).toBe(true);
  });
});
