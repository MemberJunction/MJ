import { describe, it, expect } from 'vitest';
import type {
  ERDField,
  ERDNode,
  ERDLink,
  ERDConfig,
  ERDFilter,
  ERDState,
  ERDLayoutAlgorithm,
  ERDDagreConfig
} from '../lib/interfaces/erd-types';

describe('ERD Types', () => {
  describe('ERDField', () => {
    it('should construct basic field', () => {
      const field: ERDField = {
        id: 'f1',
        name: 'ID',
        type: 'uniqueidentifier',
        isPrimaryKey: true
      };
      expect(field.isPrimaryKey).toBe(true);
    });

    it('should construct FK field', () => {
      const field: ERDField = {
        id: 'f2',
        name: 'ParentID',
        isPrimaryKey: false,
        relatedNodeId: 'e1',
        relatedNodeName: 'Parent',
        relatedFieldName: 'ID'
      };
      expect(field.relatedNodeId).toBe('e1');
    });
  });

  describe('ERDNode', () => {
    it('should construct with fields', () => {
      const node: ERDNode = {
        id: 'e1',
        name: 'Users',
        schemaName: 'dbo',
        fields: [
          { id: 'f1', name: 'ID', isPrimaryKey: true },
          { id: 'f2', name: 'Name', isPrimaryKey: false }
        ]
      };
      expect(node.fields).toHaveLength(2);
    });
  });

  describe('ERDLink', () => {
    it('should represent a many-to-one relationship', () => {
      const link: ERDLink = {
        sourceNodeId: 'child',
        targetNodeId: 'parent',
        sourceField: { id: 'fk', name: 'ParentID', isPrimaryKey: false },
        isSelfReference: false,
        relationshipType: 'many-to-one'
      };
      expect(link.relationshipType).toBe('many-to-one');
      expect(link.isSelfReference).toBe(false);
    });
  });

  describe('ERDConfig', () => {
    it('should accept partial configuration', () => {
      const config: ERDConfig = {
        nodeWidth: 200,
        showFieldDetails: true,
        enableDragging: true,
        layoutAlgorithm: 'dagre'
      };
      expect(config.layoutAlgorithm).toBe('dagre');
    });
  });

  describe('ERDFilter', () => {
    it('should support schema filter', () => {
      const filter: ERDFilter = { schemaName: 'dbo' };
      expect(filter.schemaName).toBe('dbo');
    });

    it('should support custom filter function', () => {
      const filter: ERDFilter = {
        customFilter: (node) => node.name.startsWith('User')
      };
      const testNode: ERDNode = { id: '1', name: 'UserRoles', fields: [] };
      expect(filter.customFilter!(testNode)).toBe(true);
    });
  });

  describe('ERDState', () => {
    it('should serialize and deserialize', () => {
      const state: ERDState = {
        selectedNodeId: 'e1',
        highlightedNodeIds: ['e2', 'e3'],
        zoomLevel: 1.5,
        translateX: 100,
        translateY: 200,
        focusNodeId: null,
        focusDepth: 1,
        nodePositions: {
          'e1': { x: 10, y: 20 },
          'e2': { x: 30, y: 40, fx: 30, fy: 40 }
        }
      };
      const json = JSON.stringify(state);
      const parsed = JSON.parse(json) as ERDState;
      expect(parsed.selectedNodeId).toBe('e1');
      expect(parsed.nodePositions['e2'].fx).toBe(30);
    });
  });

  describe('ERDLayoutAlgorithm', () => {
    it('should support all layout types', () => {
      const layouts: ERDLayoutAlgorithm[] = ['force', 'dagre', 'horizontal', 'vertical', 'radial'];
      expect(layouts).toHaveLength(5);
    });
  });
});
