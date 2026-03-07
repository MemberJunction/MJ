/**
 * Tests for MappingWorkspace validation logic
 * Covers: UnmappedRequiredCount, HasKeyField, MappingValidation, ActiveEditableFields
 * Tests pure logic extracted from the component's computed properties.
 */
import { describe, it, expect } from 'vitest';

/** Mirrors the EditableFieldMap interface from the mapping workspace */
interface EditableFieldMap {
  ID: string | null;
  SourceFieldName: string;
  SourceFieldLabel: string;
  SourceFieldType: string;
  DestinationFieldName: string;
  DestinationFieldLabel: string;
  IsKeyField: boolean;
  IsRequired: boolean;
  Direction: 'Both' | 'DestToSource' | 'SourceToDest';
  Status: 'Active' | 'Inactive';
  IsNew: boolean;
  IsDirty: boolean;
}

function createField(overrides: Partial<EditableFieldMap> = {}): EditableFieldMap {
  return {
    ID: 'fm-1',
    SourceFieldName: 'source_field',
    SourceFieldLabel: 'Source Field',
    SourceFieldType: 'string',
    DestinationFieldName: 'DestField',
    DestinationFieldLabel: 'Dest Field',
    IsKeyField: false,
    IsRequired: false,
    Direction: 'SourceToDest',
    Status: 'Active',
    IsNew: false,
    IsDirty: false,
    ...overrides
  };
}

// Replicates the component's computed properties as pure functions
function getActiveFields(fields: EditableFieldMap[]): EditableFieldMap[] {
  return fields.filter(f => f.Status !== 'Inactive');
}

function getUnmappedRequiredCount(fields: EditableFieldMap[]): number {
  return fields.filter(
    f => f.Status === 'Active' && f.IsRequired && !f.DestinationFieldName
  ).length;
}

function getHasKeyField(fields: EditableFieldMap[]): boolean {
  return fields.some(f => f.Status === 'Active' && f.IsKeyField);
}

function getMappingValidation(fields: EditableFieldMap[]): { IsValid: boolean; Warnings: string[] } {
  const warnings: string[] = [];
  const unmappedRequired = getUnmappedRequiredCount(fields);
  if (unmappedRequired > 0) {
    warnings.push(`${unmappedRequired} required field(s) missing destination mapping`);
  }
  const activeFields = getActiveFields(fields);
  if (!getHasKeyField(fields) && activeFields.length > 0) {
    warnings.push('No key field configured — sync may create duplicates');
  }
  return { IsValid: warnings.length === 0, Warnings: warnings };
}

describe('MappingWorkspace Validation', () => {

  describe('ActiveEditableFields', () => {
    it('should return only active fields', () => {
      const fields = [
        createField({ Status: 'Active' }),
        createField({ Status: 'Inactive' }),
        createField({ Status: 'Active' }),
      ];
      expect(getActiveFields(fields)).toHaveLength(2);
    });

    it('should return empty array when all fields are inactive', () => {
      const fields = [
        createField({ Status: 'Inactive' }),
        createField({ Status: 'Inactive' }),
      ];
      expect(getActiveFields(fields)).toHaveLength(0);
    });

    it('should return empty array for no fields', () => {
      expect(getActiveFields([])).toHaveLength(0);
    });
  });

  describe('UnmappedRequiredCount', () => {
    it('should return 0 when no required fields are unmapped', () => {
      const fields = [
        createField({ IsRequired: true, DestinationFieldName: 'Mapped' }),
        createField({ IsRequired: false, DestinationFieldName: '' }),
      ];
      expect(getUnmappedRequiredCount(fields)).toBe(0);
    });

    it('should count required fields with empty destination', () => {
      const fields = [
        createField({ IsRequired: true, DestinationFieldName: '' }),
        createField({ IsRequired: true, DestinationFieldName: '' }),
        createField({ IsRequired: true, DestinationFieldName: 'Name' }),
      ];
      expect(getUnmappedRequiredCount(fields)).toBe(2);
    });

    it('should ignore inactive required fields', () => {
      const fields = [
        createField({ IsRequired: true, DestinationFieldName: '', Status: 'Inactive' }),
        createField({ IsRequired: true, DestinationFieldName: '' }),
      ];
      expect(getUnmappedRequiredCount(fields)).toBe(1);
    });

    it('should return 0 for empty field list', () => {
      expect(getUnmappedRequiredCount([])).toBe(0);
    });
  });

  describe('HasKeyField', () => {
    it('should return true when an active key field exists', () => {
      const fields = [
        createField({ IsKeyField: false }),
        createField({ IsKeyField: true }),
      ];
      expect(getHasKeyField(fields)).toBe(true);
    });

    it('should return false when no key fields exist', () => {
      const fields = [
        createField({ IsKeyField: false }),
        createField({ IsKeyField: false }),
      ];
      expect(getHasKeyField(fields)).toBe(false);
    });

    it('should ignore inactive key fields', () => {
      const fields = [
        createField({ IsKeyField: true, Status: 'Inactive' }),
      ];
      expect(getHasKeyField(fields)).toBe(false);
    });

    it('should return false for empty list', () => {
      expect(getHasKeyField([])).toBe(false);
    });
  });

  describe('MappingValidation', () => {
    it('should be valid when all required fields are mapped and a key exists', () => {
      const fields = [
        createField({ IsRequired: true, DestinationFieldName: 'Email', IsKeyField: true }),
        createField({ IsRequired: false, DestinationFieldName: 'Name' }),
      ];
      const result = getMappingValidation(fields);
      expect(result.IsValid).toBe(true);
      expect(result.Warnings).toHaveLength(0);
    });

    it('should warn about unmapped required fields', () => {
      const fields = [
        createField({ IsRequired: true, DestinationFieldName: '', IsKeyField: true }),
      ];
      const result = getMappingValidation(fields);
      expect(result.IsValid).toBe(false);
      expect(result.Warnings).toHaveLength(1);
      expect(result.Warnings[0]).toContain('1 required field(s) missing');
    });

    it('should warn about missing key field when active fields exist', () => {
      const fields = [
        createField({ IsKeyField: false, DestinationFieldName: 'Name' }),
      ];
      const result = getMappingValidation(fields);
      expect(result.IsValid).toBe(false);
      expect(result.Warnings).toHaveLength(1);
      expect(result.Warnings[0]).toContain('No key field configured');
    });

    it('should report both warnings when both issues exist', () => {
      const fields = [
        createField({ IsRequired: true, DestinationFieldName: '', IsKeyField: false }),
        createField({ IsRequired: false, DestinationFieldName: 'Name', IsKeyField: false }),
      ];
      const result = getMappingValidation(fields);
      expect(result.IsValid).toBe(false);
      expect(result.Warnings).toHaveLength(2);
    });

    it('should be valid (no warnings) for empty field list', () => {
      const result = getMappingValidation([]);
      expect(result.IsValid).toBe(true);
      expect(result.Warnings).toHaveLength(0);
    });

    it('should not warn about key field when no active fields exist', () => {
      const fields = [
        createField({ Status: 'Inactive', IsKeyField: false }),
      ];
      const result = getMappingValidation(fields);
      expect(result.IsValid).toBe(true);
    });
  });
});
