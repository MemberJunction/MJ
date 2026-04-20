import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chalk to avoid terminal color issues in tests
vi.mock('chalk', () => {
  const identity = (str: string) => str;
  const chalk = {
    red: Object.assign(identity, { bold: identity }),
    yellow: Object.assign(identity, { bold: identity }),
    green: Object.assign(identity, { bold: identity }),
    blue: Object.assign(identity, { bold: identity }),
    gray: identity,
    cyan: identity,
    white: Object.assign(identity, { bold: identity }),
    bold: Object.assign(identity, { underline: identity }),
    dim: identity,
    underline: identity,
    bgRed: identity,
    bgGreen: identity,
    bgYellow: identity,
  };
  return { default: chalk };
});

import { FormattingService } from '../services/FormattingService';
import type { ValidationResult, ValidationError, ValidationWarning } from '../types/validation';

describe('FormattingService', () => {
  let formatter: FormattingService;

  beforeEach(() => {
    formatter = new FormattingService();
  });

  const createValidResult = (): ValidationResult => ({
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
  });

  const createInvalidResult = (): ValidationResult => ({
    isValid: false,
    errors: [
      {
        type: 'field',
        severity: 'error',
        entity: 'Users',
        field: 'Email',
        file: '/path/to/users.json',
        message: 'Field "Email" does not exist on entity "Users"',
        suggestion: 'Check field name spelling',
      },
      {
        type: 'reference',
        severity: 'error',
        entity: 'Prompts',
        field: 'TemplateFile',
        file: '/path/to/prompts.json',
        message: 'File reference not found: "template.md"',
        suggestion: 'Create file at: /path/to/template.md',
      },
    ],
    warnings: [
      {
        type: 'bestpractice',
        severity: 'warning',
        entity: 'Users',
        field: 'Name',
        file: '/path/to/users.json',
        message: 'Required field "Name" is missing',
        suggestion: 'Add "Name" to the fields object',
      },
    ],
    summary: {
      totalFiles: 5,
      totalEntities: 10,
      totalErrors: 2,
      totalWarnings: 1,
      fileResults: new Map(),
    },
  });

  describe('formatValidationResultAsJson', () => {
    it('should format valid result as JSON string', () => {
      const result = createValidResult();
      const json = formatter.formatValidationResultAsJson(result);

      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json);
      expect(parsed.isValid).toBe(true);
      expect(parsed.errors).toHaveLength(0);
    });

    it('should format invalid result as JSON with errors', () => {
      const result = createInvalidResult();
      const json = formatter.formatValidationResultAsJson(result);

      const parsed = JSON.parse(json);
      expect(parsed.isValid).toBe(false);
      expect(parsed.errors).toHaveLength(2);
      expect(parsed.warnings).toHaveLength(1);
    });

    it('should include summary in JSON output', () => {
      const result = createValidResult();
      const json = formatter.formatValidationResultAsJson(result);

      const parsed = JSON.parse(json);
      expect(parsed.summary).toBeDefined();
      expect(parsed.summary.totalFiles).toBe(5);
      expect(parsed.summary.totalEntities).toBe(10);
    });
  });

  describe('formatValidationResult', () => {
    it('should return a string for valid results', () => {
      const result = createValidResult();
      const output = formatter.formatValidationResult(result);

      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
    });

    it('should return a string for invalid results', () => {
      const result = createInvalidResult();
      const output = formatter.formatValidationResult(result);

      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
    });

    it('should include error count in output', () => {
      const result = createInvalidResult();
      const output = formatter.formatValidationResult(result);

      expect(output).toContain('2');
    });

    it('should handle results with only warnings', () => {
      const result: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: [
          {
            type: 'bestpractice',
            severity: 'warning',
            file: '/path/file.json',
            message: 'Some warning',
          },
        ],
        summary: {
          totalFiles: 1,
          totalEntities: 1,
          totalErrors: 0,
          totalWarnings: 1,
          fileResults: new Map(),
        },
      };

      const output = formatter.formatValidationResult(result);
      expect(typeof output).toBe('string');
    });
  });

  describe('formatValidationResultAsMarkdown', () => {
    it('should return a markdown string', () => {
      const result = createValidResult();
      const md = formatter.formatValidationResultAsMarkdown(result);

      expect(typeof md).toBe('string');
      expect(md).toContain('#');
    });

    it('should include error details in markdown', () => {
      const result = createInvalidResult();
      const md = formatter.formatValidationResultAsMarkdown(result);

      expect(md).toContain('Error');
      expect(md).toContain('Users');
    });

    it('should include warning details in markdown', () => {
      const result = createInvalidResult();
      const md = formatter.formatValidationResultAsMarkdown(result);

      expect(md).toContain('Warning');
    });
  });

  describe('formatDuration', () => {
    it('should format milliseconds duration', () => {
      const output = formatter.formatDuration(500);
      expect(output).toContain('500');
      expect(output).toContain('ms');
    });

    it('should format seconds duration', () => {
      const output = formatter.formatDuration(2500);
      expect(output).toContain('2');
    });

    it('should handle zero duration', () => {
      const output = formatter.formatDuration(0);
      expect(typeof output).toBe('string');
    });

    it('should handle large duration', () => {
      const output = formatter.formatDuration(120000); // 2 minutes
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
    });
  });

  describe('getErrorsByType', () => {
    it('should group errors by type', () => {
      const errors: ValidationError[] = [
        { type: 'field', severity: 'error', file: 'a.json', message: 'Field error 1' },
        { type: 'field', severity: 'error', file: 'b.json', message: 'Field error 2' },
        { type: 'reference', severity: 'error', file: 'c.json', message: 'Ref error' },
      ];

      // getErrorsByType is private but accessible at runtime; returns Record<string, number>
      const grouped = (formatter as never as { getErrorsByType(errors: ValidationError[]): Record<string, number> }).getErrorsByType(errors);

      expect(grouped['field']).toBe(2);
      expect(grouped['reference']).toBe(1);
    });

    it('should handle empty errors array', () => {
      const grouped = (formatter as never as { getErrorsByType(errors: ValidationError[]): Record<string, number> }).getErrorsByType([]);
      expect(Object.keys(grouped).length).toBe(0);
    });

    it('should handle single error type', () => {
      const errors: ValidationError[] = [
        { type: 'circular', severity: 'error', file: 'a.json', message: 'Circular dep' },
      ];

      const grouped = (formatter as never as { getErrorsByType(errors: ValidationError[]): Record<string, number> }).getErrorsByType(errors);
      expect(grouped['circular']).toBe(1);
    });
  });

  describe('getWarningsByType', () => {
    it('should group warnings by type', () => {
      const warnings: ValidationWarning[] = [
        { type: 'bestpractice', severity: 'warning', file: 'a.json', message: 'Warning 1' },
        { type: 'bestpractice', severity: 'warning', file: 'b.json', message: 'Warning 2' },
        { type: 'nesting', severity: 'warning', file: 'c.json', message: 'Nesting warning' },
      ];

      // getWarningsByType is private but accessible at runtime; returns Record<string, number>
      const grouped = (formatter as never as { getWarningsByType(warnings: ValidationWarning[]): Record<string, number> }).getWarningsByType(warnings);

      expect(grouped['bestpractice']).toBe(2);
      expect(grouped['nesting']).toBe(1);
    });

    it('should handle empty warnings array', () => {
      const grouped = (formatter as never as { getWarningsByType(warnings: ValidationWarning[]): Record<string, number> }).getWarningsByType([]);
      expect(Object.keys(grouped).length).toBe(0);
    });
  });

  describe('formatSyncSummary', () => {
    it('should format push summary', () => {
      const output = formatter.formatSyncSummary('push', {
        created: 5,
        updated: 3,
        deleted: 1,
        skipped: 0,
        errors: 0,
        duration: 1500,
      });

      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
    });

    it('should format pull summary', () => {
      const output = formatter.formatSyncSummary('pull', {
        created: 10,
        updated: 0,
        deleted: 0,
        skipped: 2,
        errors: 0,
        duration: 3000,
      });

      expect(typeof output).toBe('string');
    });

    it('should format summary with errors', () => {
      const output = formatter.formatSyncSummary('push', {
        created: 0,
        updated: 0,
        deleted: 0,
        skipped: 0,
        errors: 3,
        duration: 500,
      });

      expect(typeof output).toBe('string');
      expect(output).toContain('3');
    });
  });
});
