import { describe, it, expect } from 'vitest';
import {
  TreeEventArgs,
  CancelableTreeEventArgs,
  NodeEventArgs,
  CancelableNodeEventArgs,
  BeforeNodeSelectEventArgs,
  AfterNodeSelectEventArgs,
  AfterDataLoadEventArgs,
  AfterSearchEventArgs
} from '../lib/events/tree-events';
import { createDefaultTreeNode } from '../lib/models/tree-types';

const mockTree = {} as never;

describe('TreeEventArgs', () => {
  it('should set tree reference and timestamp', () => {
    const event = new TreeEventArgs(mockTree);
    expect(event.Tree).toBe(mockTree);
    expect(event.Timestamp).toBeInstanceOf(Date);
  });
});

describe('CancelableTreeEventArgs', () => {
  it('should default Cancel to false', () => {
    const event = new CancelableTreeEventArgs(mockTree);
    expect(event.Cancel).toBe(false);
    expect(event.CancelReason).toBeUndefined();
  });

  it('should allow setting Cancel to true', () => {
    const event = new CancelableTreeEventArgs(mockTree);
    event.Cancel = true;
    event.CancelReason = 'Access denied';
    expect(event.Cancel).toBe(true);
    expect(event.CancelReason).toBe('Access denied');
  });
});

describe('NodeEventArgs', () => {
  it('should include the node', () => {
    const node = createDefaultTreeNode({ ID: 'n1', Label: 'Test' });
    const event = new NodeEventArgs(mockTree, node);
    expect(event.Node).toBe(node);
    expect(event.Tree).toBe(mockTree);
  });
});

describe('CancelableNodeEventArgs', () => {
  it('should include node and be cancelable', () => {
    const node = createDefaultTreeNode({ ID: 'n1' });
    const event = new CancelableNodeEventArgs(mockTree, node);
    expect(event.Node).toBe(node);
    expect(event.Cancel).toBe(false);
  });
});

describe('BeforeNodeSelectEventArgs', () => {
  it('should capture selection context', () => {
    const node = createDefaultTreeNode({ ID: 'n1' });
    const current = [createDefaultTreeNode({ ID: 'n2' })];
    const event = new BeforeNodeSelectEventArgs(mockTree, node, true, current);

    expect(event.Node).toBe(node);
    expect(event.IsAdditive).toBe(true);
    expect(event.CurrentSelection).toHaveLength(1);
    expect(event.Cancel).toBe(false);
  });

  it('should create a copy of current selection', () => {
    const current = [createDefaultTreeNode({ ID: 'n2' })];
    const event = new BeforeNodeSelectEventArgs(mockTree, createDefaultTreeNode(), false, current);
    current.push(createDefaultTreeNode({ ID: 'n3' }));
    expect(event.CurrentSelection).toHaveLength(1);
  });
});

describe('AfterNodeSelectEventArgs', () => {
  it('should capture before and after selection', () => {
    const node = createDefaultTreeNode({ ID: 'n1' });
    const prev = [createDefaultTreeNode({ ID: 'old' })];
    const next = [createDefaultTreeNode({ ID: 'n1' })];
    const event = new AfterNodeSelectEventArgs(mockTree, node, false, next, prev);

    expect(event.WasAdditive).toBe(false);
    expect(event.NewSelection).toHaveLength(1);
    expect(event.PreviousSelection).toHaveLength(1);
  });
});

describe('AfterDataLoadEventArgs', () => {
  it('should calculate total nodes', () => {
    const event = new AfterDataLoadEventArgs(mockTree, true, 10, 25, 150);
    expect(event.Success).toBe(true);
    expect(event.BranchCount).toBe(10);
    expect(event.LeafCount).toBe(25);
    expect(event.TotalNodes).toBe(35);
    expect(event.LoadTimeMs).toBe(150);
    expect(event.Error).toBeUndefined();
  });

  it('should include error on failure', () => {
    const event = new AfterDataLoadEventArgs(mockTree, false, 0, 0, 50, 'Network error');
    expect(event.Success).toBe(false);
    expect(event.Error).toBe('Network error');
  });
});

describe('AfterSearchEventArgs', () => {
  it('should separate branch and leaf match counts', () => {
    const branches = [createDefaultTreeNode({ ID: 'b1', Type: 'branch' })];
    const leaves = [
      createDefaultTreeNode({ ID: 'l1', Type: 'leaf' }),
      createDefaultTreeNode({ ID: 'l2', Type: 'leaf' })
    ];
    const event = new AfterSearchEventArgs(mockTree, 'test', [...branches, ...leaves]);

    expect(event.SearchText).toBe('test');
    expect(event.MatchCount).toBe(3);
    expect(event.BranchMatchCount).toBe(1);
    expect(event.LeafMatchCount).toBe(2);
    expect(event.MatchedNodes).toHaveLength(3);
  });
});
