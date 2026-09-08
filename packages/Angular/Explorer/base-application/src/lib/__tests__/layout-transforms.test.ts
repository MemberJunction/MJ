/**
 * Tests for FlattenLayoutToSingleStack — the mobile records render transform.
 * The invariants here are load-bearing for the records region:
 * - component COUNT is preserved (the restore gate compares it to the tab list)
 * - componentState is CLONED, never shared (GL mutates container state at
 *   runtime; a shared reference would corrupt the persisted desktop layout)
 * - split geometry (sizes) is dropped
 */
import { describe, it, expect } from 'vitest';
import { FlattenLayoutToSingleStack, SanitizeLayoutNodeForLoad } from '../layout-transforms';
import { LayoutConfig, LayoutNode } from '../interfaces/workspace-configuration.interface';

function component(tabId: string, extra?: Partial<LayoutNode>): LayoutNode {
  return {
    type: 'component',
    componentType: 'resource',
    componentState: { tabId, nested: { keep: true } },
    title: `Tab ${tabId}`,
    ...extra
  };
}

function countComponents(node: LayoutNode | undefined): number {
  if (!node) return 0;
  if (node.type === 'component') return 1;
  return (node.content ?? []).reduce((sum, child) => sum + countComponents(child), 0);
}

describe('FlattenLayoutToSingleStack', () => {
  it('flattens a nested row/column/stack tree into one stack in visual order', () => {
    const config: LayoutConfig = {
      root: {
        type: 'row',
        content: [
          {
            type: 'column',
            width: 60,
            content: [
              { type: 'stack', content: [component('c1'), component('c2')] },
              { type: 'stack', content: [component('c3')] }
            ]
          },
          { type: 'stack', width: 40, content: [component('c4')] }
        ]
      }
    };

    const flat = FlattenLayoutToSingleStack(config);
    expect(flat).not.toBeNull();
    expect(flat!.root.type).toBe('stack');
    const ids = flat!.root.content!.map(c => (c.componentState as { tabId: string }).tabId);
    expect(ids).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(flat!.root.content!.every(c => c.type === 'component')).toBe(true);
  });

  it('preserves component count (the restore-gate invariant)', () => {
    const config: LayoutConfig = {
      root: {
        type: 'row',
        content: [
          { type: 'stack', content: [component('a'), component('b'), component('c')] },
          { type: 'column', content: [{ type: 'stack', content: [component('d')] }] }
        ]
      }
    };
    const flat = FlattenLayoutToSingleStack(config);
    expect(countComponents(flat!.root)).toBe(countComponents(config.root));
  });

  it('deep-clones componentState — equal by value, not by reference', () => {
    const original = component('x');
    const config: LayoutConfig = { root: { type: 'stack', content: [original] } };

    const flat = FlattenLayoutToSingleStack(config);
    const cloned = flat!.root.content![0];
    expect(cloned.componentState).toEqual(original.componentState);
    expect(cloned.componentState).not.toBe(original.componentState);
    // nested objects cloned too — a GL runtime mutation must not reach back
    (cloned.componentState!['nested'] as { keep: boolean }).keep = false;
    expect((original.componentState!['nested'] as { keep: boolean }).keep).toBe(true);
  });

  it('drops split geometry (width/height) from flattened components', () => {
    const config: LayoutConfig = {
      root: {
        type: 'row',
        content: [
          { type: 'stack', width: 50, content: [component('a', { width: 50, height: 30 })] },
          { type: 'stack', width: 50, content: [component('b')] }
        ]
      }
    };
    const flat = FlattenLayoutToSingleStack(config);
    for (const node of flat!.root.content!) {
      expect(node.width).toBeUndefined();
      expect(node.height).toBeUndefined();
    }
  });

  it('preserves componentType, title, and isClosable', () => {
    const config: LayoutConfig = {
      root: { type: 'stack', content: [component('a', { isClosable: false })] }
    };
    const flat = FlattenLayoutToSingleStack(config)!;
    const node = flat.root.content![0];
    expect(node.componentType).toBe('resource');
    expect(node.title).toBe('Tab a');
    expect(node.isClosable).toBe(false);
  });

  it('round-trips an already-flat single stack', () => {
    const config: LayoutConfig = {
      root: { type: 'stack', content: [component('a'), component('b')] }
    };
    const flat = FlattenLayoutToSingleStack(config)!;
    expect(flat.root.type).toBe('stack');
    expect(flat.root.content!.map(c => (c.componentState as { tabId: string }).tabId)).toEqual(['a', 'b']);
  });

  it('returns null for empty, componentless, or missing configs', () => {
    expect(FlattenLayoutToSingleStack(undefined)).toBeNull();
    expect(FlattenLayoutToSingleStack(null)).toBeNull();
    expect(FlattenLayoutToSingleStack({ root: { type: 'row', content: [] } })).toBeNull();
    expect(FlattenLayoutToSingleStack({
      root: { type: 'row', content: [{ type: 'stack', content: [] }] }
    })).toBeNull();
  });

  it('handles components without componentState', () => {
    const config: LayoutConfig = {
      root: { type: 'stack', content: [{ type: 'component', componentType: 'resource' }] }
    };
    const flat = FlattenLayoutToSingleStack(config)!;
    expect(flat.root.content).toHaveLength(1);
    expect(flat.root.content![0].componentState).toBeUndefined();
  });
});

describe('SanitizeLayoutNodeForLoad', () => {
  it('deep-clones componentState — GL runtime mutations must never reach the persisted config', () => {
    // The DESKTOP restore path (main layout AND records region): golden-layout
    // Object.assigns into container state at runtime (UpdateTabStyle); a
    // shared reference would corrupt the persisted workspace configuration.
    const persisted: LayoutNode = {
      type: 'stack',
      content: [component('a')]
    };
    const sanitized = SanitizeLayoutNodeForLoad(persisted);

    const sanitizedChild = sanitized.content![0];
    const persistedChild = persisted.content![0];
    expect(sanitizedChild).not.toBe(persistedChild);
    expect(sanitizedChild.componentState).toEqual(persistedChild.componentState);
    expect(sanitizedChild.componentState).not.toBe(persistedChild.componentState);

    // Simulate GL's runtime mutation on what it was handed
    Object.assign(sanitizedChild.componentState!, { isPinned: true, title: 'runtime-renamed' });
    (sanitizedChild.componentState!['nested'] as { keep: boolean }).keep = false;

    // The persisted tree is untouched
    expect(persistedChild.componentState!['isPinned']).toBeUndefined();
    expect(persistedChild.componentState!['title']).toBeUndefined();
    expect((persistedChild.componentState!['nested'] as { keep: boolean }).keep).toBe(true);
  });

  it('combines numeric size + sizeUnit into GL string form and strips sizeUnit/minSizeUnit', () => {
    const node = {
      type: 'row',
      size: 50,
      sizeUnit: '%',
      minSizeUnit: 'px',
      content: [component('a')]
    } as unknown as LayoutNode;
    const sanitized = SanitizeLayoutNodeForLoad(node) as unknown as Record<string, unknown>;
    expect(sanitized['size']).toBe('50%');
    expect('sizeUnit' in sanitized).toBe(false);
    expect('minSizeUnit' in sanitized).toBe(false);
  });

  it('drops invalid width/height, keeps valid number/string forms', () => {
    const node = {
      type: 'row',
      width: { bogus: true },
      height: 30,
      content: [{ type: 'stack', width: '50%', content: [component('a')] }]
    } as unknown as LayoutNode;
    const sanitized = SanitizeLayoutNodeForLoad(node);
    expect('width' in (sanitized as unknown as Record<string, unknown>)).toBe(false);
    expect(sanitized.height).toBe(30);
    expect(sanitized.content![0].width).toBe('50%');
  });

  it('sanitizes recursively without mutating the input tree', () => {
    const persisted = {
      type: 'row',
      content: [
        { type: 'stack', size: 60, sizeUnit: '%', content: [component('a')] },
        { type: 'stack', size: 40, sizeUnit: '%', content: [component('b')] }
      ]
    } as unknown as LayoutNode;
    const snapshot = JSON.parse(JSON.stringify(persisted));
    SanitizeLayoutNodeForLoad(persisted);
    expect(persisted).toEqual(snapshot); // input untouched — pure function
  });
});
