/**
 * Tests for Quick Setup logic in ConnectionStudio
 * Covers: QuickSetupEnabledCount, ToggleQuickSetupObject
 */
import { describe, it, expect } from 'vitest';

/** Mirrors the DefaultObjectConfigResult shape */
interface DefaultObjectConfig {
  SourceObjectName: string;
  TargetTableName: string;
  TargetEntityName: string;
  SyncEnabled: boolean;
  FieldMappings: Array<{
    SourceFieldName: string;
    DestinationFieldName: string;
    IsKeyField?: boolean;
  }>;
}

function createQuickSetupObject(overrides: Partial<DefaultObjectConfig> = {}): DefaultObjectConfig {
  return {
    SourceObjectName: 'contacts',
    TargetTableName: 'Contacts',
    TargetEntityName: 'HubSpot Contacts',
    SyncEnabled: true,
    FieldMappings: [
      { SourceFieldName: 'email', DestinationFieldName: 'Email', IsKeyField: true },
      { SourceFieldName: 'firstname', DestinationFieldName: 'FirstName' },
    ],
    ...overrides
  };
}

/** Replicates QuickSetupEnabledCount getter */
function getEnabledCount(objects: DefaultObjectConfig[]): number {
  return objects.filter(o => o.SyncEnabled).length;
}

/** Replicates ToggleQuickSetupObject method */
function toggleObject(obj: DefaultObjectConfig): void {
  obj.SyncEnabled = !obj.SyncEnabled;
}

describe('Quick Setup Logic', () => {

  describe('QuickSetupEnabledCount', () => {
    it('should count all enabled objects', () => {
      const objects = [
        createQuickSetupObject({ SyncEnabled: true }),
        createQuickSetupObject({ SyncEnabled: true }),
        createQuickSetupObject({ SyncEnabled: false }),
      ];
      expect(getEnabledCount(objects)).toBe(2);
    });

    it('should return 0 when none are enabled', () => {
      const objects = [
        createQuickSetupObject({ SyncEnabled: false }),
        createQuickSetupObject({ SyncEnabled: false }),
      ];
      expect(getEnabledCount(objects)).toBe(0);
    });

    it('should return count for all enabled', () => {
      const objects = [
        createQuickSetupObject({ SyncEnabled: true }),
        createQuickSetupObject({ SyncEnabled: true }),
      ];
      expect(getEnabledCount(objects)).toBe(2);
    });

    it('should return 0 for empty array', () => {
      expect(getEnabledCount([])).toBe(0);
    });
  });

  describe('ToggleQuickSetupObject', () => {
    it('should toggle enabled to disabled', () => {
      const obj = createQuickSetupObject({ SyncEnabled: true });
      toggleObject(obj);
      expect(obj.SyncEnabled).toBe(false);
    });

    it('should toggle disabled to enabled', () => {
      const obj = createQuickSetupObject({ SyncEnabled: false });
      toggleObject(obj);
      expect(obj.SyncEnabled).toBe(true);
    });

    it('should toggle back and forth', () => {
      const obj = createQuickSetupObject({ SyncEnabled: true });
      toggleObject(obj);
      expect(obj.SyncEnabled).toBe(false);
      toggleObject(obj);
      expect(obj.SyncEnabled).toBe(true);
    });
  });

  describe('Quick Setup field mappings', () => {
    it('should include field mappings with key fields', () => {
      const obj = createQuickSetupObject();
      const keyFields = obj.FieldMappings.filter(f => f.IsKeyField);
      expect(keyFields).toHaveLength(1);
      expect(keyFields[0].SourceFieldName).toBe('email');
    });

    it('should handle objects with no field mappings', () => {
      const obj = createQuickSetupObject({ FieldMappings: [] });
      expect(obj.FieldMappings).toHaveLength(0);
    });

    it('should preserve field mapping data through toggle', () => {
      const obj = createQuickSetupObject();
      const originalMappings = [...obj.FieldMappings];
      toggleObject(obj);
      toggleObject(obj);
      expect(obj.FieldMappings).toEqual(originalMappings);
    });
  });

  describe('Apply Quick Setup filtering', () => {
    it('should filter to only enabled objects for apply', () => {
      const objects = [
        createQuickSetupObject({ SourceObjectName: 'contacts', SyncEnabled: true }),
        createQuickSetupObject({ SourceObjectName: 'companies', SyncEnabled: false }),
        createQuickSetupObject({ SourceObjectName: 'deals', SyncEnabled: true }),
      ];
      const enabledObjects = objects.filter(o => o.SyncEnabled);
      expect(enabledObjects).toHaveLength(2);
      expect(enabledObjects.map(o => o.SourceObjectName)).toEqual(['contacts', 'deals']);
    });

    it('should return empty when all disabled', () => {
      const objects = [
        createQuickSetupObject({ SyncEnabled: false }),
        createQuickSetupObject({ SyncEnabled: false }),
      ];
      const enabledObjects = objects.filter(o => o.SyncEnabled);
      expect(enabledObjects).toHaveLength(0);
    });
  });
});
