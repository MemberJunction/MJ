import { describe, it, expect } from 'vitest';
import {
  CreateDefaultTreeNode,
  CreateDefaultBranchConfig,
  CreateDefaultLeafConfig
} from '../lib/models/tree-types';
import type { TreeNode, TreeBranchConfig, TreeLeafConfig } from '../lib/models/tree-types';

describe('createDefaultTreeNode', () => {
  it('should create node with all default values', () => {
    const node = CreateDefaultTreeNode();
    expect(node.ID).toBe('');
    expect(node.Label).toBe('');
    expect(node.Type).toBe('branch');
    expect(node.ParentID).toBeNull();
    expect(node.Icon).toBe('fa-solid fa-folder');
    expect(node.Data).toEqual({});
    expect(node.Children).toEqual([]);
    expect(node.Expanded).toBe(false);
    expect(node.Selected).toBe(false);
    expect(node.Level).toBe(0);
    expect(node.Loading).toBe(false);
    expect(node.Visible).toBe(true);
    expect(node.MatchesSearch).toBe(false);
    expect(node.EntityName).toBe('');
  });

  it('should allow partial overrides', () => {
    const node = CreateDefaultTreeNode({
      ID: 'node-1',
      Label: 'Test Node',
      Type: 'leaf',
      Level: 2
    });
    expect(node.ID).toBe('node-1');
    expect(node.Label).toBe('Test Node');
    expect(node.Type).toBe('leaf');
    expect(node.Level).toBe(2);
    // Defaults preserved
    expect(node.Icon).toBe('fa-solid fa-folder');
    expect(node.Expanded).toBe(false);
  });

  it('should create independent instances', () => {
    const node1 = CreateDefaultTreeNode({ ID: 'a' });
    const node2 = CreateDefaultTreeNode({ ID: 'b' });
    node1.Children.push(CreateDefaultTreeNode({ ID: 'child' }));
    expect(node2.Children).toHaveLength(0);
  });
});

describe('createDefaultBranchConfig', () => {
  it('should create config with defaults', () => {
    const config = CreateDefaultBranchConfig();
    expect(config.EntityName).toBe('');
    expect(config.DisplayField).toBe('Name');
    expect(config.IDField).toBe('ID');
    expect(config.ParentIDField).toBe('ParentID');
    expect(config.DefaultIcon).toBe('fa-solid fa-folder');
    expect(config.OrderBy).toBe('Name ASC');
  });

  it('should allow overrides', () => {
    const config = CreateDefaultBranchConfig({
      EntityName: 'MJ: Query Categories',
      DefaultIcon: 'fa-solid fa-database'
    });
    expect(config.EntityName).toBe('MJ: Query Categories');
    expect(config.DefaultIcon).toBe('fa-solid fa-database');
    expect(config.DisplayField).toBe('Name'); // default preserved
  });
});

describe('createDefaultLeafConfig', () => {
  it('should create config with defaults', () => {
    const config = CreateDefaultLeafConfig();
    expect(config.EntityName).toBe('');
    expect(config.ParentField).toBe('');
    expect(config.DisplayField).toBe('Name');
    expect(config.IDField).toBe('ID');
    expect(config.DefaultIcon).toBe('fa-solid fa-file');
    expect(config.OrderBy).toBe('Name ASC');
  });

  it('should allow overrides', () => {
    const config = CreateDefaultLeafConfig({
      EntityName: 'MJ: Queries',
      ParentField: 'CategoryID'
    });
    expect(config.EntityName).toBe('MJ: Queries');
    expect(config.ParentField).toBe('CategoryID');
  });
});
