import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComponentRef } from '@angular/core';
import { renderComponentFixture, query, queryAll, text, attr, hasClass, click, capture } from '@memberjunction/ng-test-utils';
import { TreeComponent } from './tree.component';
import { createDefaultTreeNode, TreeNode } from '../models/tree-types';
import { AfterNodeClickEventArgs } from '../events/tree-events';

/**
 * DOM tests for the generic mj-tree component.
 *
 * The tree's data-loading path (loadData -> RunView) is gated on AutoLoad &&
 * BranchConfig; we never set BranchConfig, so no provider/RunView is touched.
 * We drive the rendered output by setting the public `Nodes` array (and other
 * presentational state) in `setup`, BEFORE the first change-detection pass,
 * which keeps the tests NG0100-safe (see ANGULAR_TESTING_GUIDE §5).
 */
function renderTree(options: { inputs?: Record<string, unknown>; setup?: (i: TreeComponent, r: ComponentRef<TreeComponent>) => void } = {}) {
  return renderComponentFixture(TreeComponent, {
    imports: [CommonModule, FormsModule],
    declarations: [TreeComponent],
    inputs: { AutoLoad: false, ...(options.inputs ?? {}) },
    setup: options.setup,
  });
}

function branch(partial: Partial<TreeNode>): TreeNode {
  return createDefaultTreeNode({ Type: 'branch', ...partial });
}
function leaf(partial: Partial<TreeNode>): TreeNode {
  return createDefaultTreeNode({ Type: 'leaf', ...partial });
}

describe('TreeComponent (DOM)', () => {
  describe('loading state', () => {
    it('shows the loading block when IsLoading and ShowLoading', () => {
      const fixture = renderTree({
        setup: (i) => {
          i.IsLoading = true;
        },
      });
      expect(query(fixture, '.tree-loading')).not.toBeNull();
      expect(text(fixture, '.tree-loading__text')).toBe('Loading...');
    });

    it('hides the loading block when ShowLoading is false', () => {
      const fixture = renderTree({
        inputs: { ShowLoading: false },
        setup: (i) => {
          i.IsLoading = true;
        },
      });
      expect(query(fixture, '.tree-loading')).toBeNull();
    });
  });

  describe('error state', () => {
    it('renders the error message and a retry button when ErrorMessage is set and not loading', () => {
      const fixture = renderTree({
        setup: (i) => {
          i.ErrorMessage = 'Boom';
        },
      });
      expect(text(fixture, '.tree-error__message')).toBe('Boom');
      expect(query(fixture, '.tree-error__retry')).not.toBeNull();
    });

    it('suppresses the error block while loading', () => {
      const fixture = renderTree({
        setup: (i) => {
          i.ErrorMessage = 'Boom';
          i.IsLoading = true;
        },
      });
      expect(query(fixture, '.tree-error')).toBeNull();
    });
  });

  describe('empty state', () => {
    it('shows the empty message+icon when loaded with no nodes', () => {
      const fixture = renderTree({
        inputs: { EmptyMessage: 'Nothing here', EmptyIcon: 'fa-solid fa-ghost' },
        setup: (i) => {
          i.IsLoaded = true;
        },
      });
      expect(text(fixture, '.tree-empty__message')).toBe('Nothing here');
      expect(attr(fixture, '.tree-empty__icon', 'class')).toContain('fa-ghost');
    });

    it('does not show the empty state before load completes', () => {
      const fixture = renderTree();
      expect(query(fixture, '.tree-empty')).toBeNull();
    });
  });

  describe('toolbar (expand/collapse all)', () => {
    it('renders the toolbar only when ShowExpandCollapseAll and there are nodes', () => {
      const fixture = renderTree({
        inputs: { ShowExpandCollapseAll: true },
        setup: (i) => {
          i.Nodes = [branch({ ID: 'a', Label: 'A' })];
        },
      });
      expect(queryAll(fixture, '.tree-toolbar__btn').length).toBe(2);
    });

    it('omits the toolbar when ShowExpandCollapseAll is false', () => {
      const fixture = renderTree({
        setup: (i) => {
          i.Nodes = [branch({ ID: 'a', Label: 'A' })];
        },
      });
      expect(query(fixture, '.tree-toolbar')).toBeNull();
    });

    it('ExpandAll button click expands a collapsed branch with children', () => {
      const child = leaf({ ID: 'c', Label: 'Child', Level: 1, ParentID: 'a' });
      const fixture = renderTree({
        inputs: { ShowExpandCollapseAll: true },
        setup: (i) => {
          i.Nodes = [branch({ ID: 'a', Label: 'A', Children: [child], Expanded: false })];
        },
      });
      // collapsed: child group not rendered
      expect(query(fixture, '.tree-node-children')).toBeNull();
      click(fixture, '.tree-toolbar__btn:first-child');
      fixture.detectChanges();
      expect(query(fixture, '.tree-node-children')).not.toBeNull();
    });
  });

  describe('node rendering', () => {
    it('renders one treeitem per visible root node with data attributes', () => {
      const fixture = renderTree({
        setup: (i) => {
          i.Nodes = [branch({ ID: 'a', Label: 'Alpha' }), leaf({ ID: 'b', Label: 'Beta' })];
        },
      });
      const items = queryAll(fixture, '[role="treeitem"]');
      expect(items.length).toBe(2);
      expect(attr(fixture, '[data-node-id="a"]', 'data-node-type')).toBe('branch');
      expect(attr(fixture, '[data-node-id="b"]', 'data-node-type')).toBe('leaf');
    });

    it('does not render a node whose Visible flag is false', () => {
      const fixture = renderTree({
        setup: (i) => {
          i.Nodes = [branch({ ID: 'a', Label: 'Alpha' }), branch({ ID: 'hidden', Label: 'Hidden', Visible: false })];
        },
      });
      expect(query(fixture, '[data-node-id="a"]')).not.toBeNull();
      expect(query(fixture, '[data-node-id="hidden"]')).toBeNull();
    });

    it('sets aria-expanded on a branch and aria-selected from node state', () => {
      const fixture = renderTree({
        setup: (i) => {
          i.Nodes = [branch({ ID: 'a', Label: 'A', Expanded: true, Selected: true })];
        },
      });
      expect(attr(fixture, '[data-node-id="a"]', 'aria-expanded')).toBe('true');
      expect(attr(fixture, '[data-node-id="a"]', 'aria-selected')).toBe('true');
    });

    it('applies the selected class and renders the selection indicator for a selected node', () => {
      const fixture = renderTree({
        setup: (i) => {
          i.Nodes = [leaf({ ID: 'b', Label: 'B', Selected: true })];
        },
      });
      expect(hasClass(fixture, '[data-node-id="b"]', 'tree-node--selected')).toBe(true);
      expect(query(fixture, '[data-node-id="b"] .tree-node-selected-indicator')).not.toBeNull();
    });

    it('renders the icon span when ShowIcons is true (default)', () => {
      const fixture = renderTree({
        setup: (i) => {
          i.Nodes = [leaf({ ID: 'b', Label: 'B' })];
        },
      });
      expect(query(fixture, '.tree-node-icon')).not.toBeNull();
    });

    it('omits the icon span when ShowIcons is false', () => {
      const fixture = renderTree({
        inputs: { ShowIcons: false },
        setup: (i) => {
          i.Nodes = [leaf({ ID: 'b', Label: 'B' })];
        },
      });
      expect(query(fixture, '.tree-node-icon')).toBeNull();
    });

    it('renders a badge only when ShowBadges and node.Badge are present', () => {
      const fixture = renderTree({
        setup: (i) => {
          i.Nodes = [leaf({ ID: 'withBadge', Label: 'W', Badge: '5' }), leaf({ ID: 'noBadge', Label: 'N' })];
        },
      });
      expect(text(fixture, '[data-node-id="withBadge"] .tree-node-badge')).toBe('5');
      expect(query(fixture, '[data-node-id="noBadge"] .tree-node-badge')).toBeNull();
    });

    it('renders the chevron-right toggle for a collapsed branch with children', () => {
      const fixture = renderTree({
        setup: (i) => {
          i.Nodes = [branch({ ID: 'a', Label: 'A', Children: [leaf({ ID: 'c', Label: 'C', ParentID: 'a' })], Expanded: false })];
        },
      });
      const icon = query(fixture, '[data-node-id="a"] .tree-node-toggle__icon');
      expect(icon).not.toBeNull();
      expect(icon!.className).toContain('fa-chevron-right');
    });
  });

  describe('node interaction', () => {
    it('emits AfterNodeClick when a node row is clicked', () => {
      const fixture = renderTree({
        setup: (i) => {
          i.Nodes = [leaf({ ID: 'b', Label: 'B' })];
        },
      });
      const emitted = capture<AfterNodeClickEventArgs>(fixture.componentInstance.AfterNodeClick);
      click(fixture, '[data-node-id="b"]');
      expect(emitted.length).toBe(1);
      expect(emitted[0].Node.ID).toBe('b');
    });

    it('emits SelectionChange and marks the node selected when a selectable leaf is clicked', () => {
      const fixture = renderTree({
        inputs: { SelectionMode: 'single', SelectableTypes: 'both' },
        setup: (i) => {
          i.Nodes = [leaf({ ID: 'b', Label: 'B' })];
        },
      });
      const emitted = capture<TreeNode[]>(fixture.componentInstance.SelectionChange);
      click(fixture, '[data-node-id="b"]');
      fixture.detectChanges();
      expect(emitted.length).toBeGreaterThan(0);
      expect(hasClass(fixture, '[data-node-id="b"]', 'tree-node--selected')).toBe(true);
    });

    it('does not select when SelectionMode is none', () => {
      const fixture = renderTree({
        inputs: { SelectionMode: 'none' },
        setup: (i) => {
          i.Nodes = [leaf({ ID: 'b', Label: 'B' })];
        },
      });
      const emitted = capture<TreeNode[]>(fixture.componentInstance.SelectionChange);
      click(fixture, '[data-node-id="b"]');
      fixture.detectChanges();
      expect(emitted.length).toBe(0);
      expect(hasClass(fixture, '[data-node-id="b"]', 'tree-node--selected')).toBe(false);
    });
  });

  describe('container classes', () => {
    it('adds the loading modifier class while loading', () => {
      const fixture = renderTree({
        setup: (i) => {
          i.IsLoading = true;
        },
      });
      expect(hasClass(fixture, '.tree-container', 'tree-container--loading')).toBe(true);
    });
  });
});
