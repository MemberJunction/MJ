import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComponentRef } from '@angular/core';
import type { CompositeKey } from '@memberjunction/core';
import { renderComponentFixture, query, text, attr, hasClass, click, capture } from '@memberjunction/ng-test-utils';
import { TreeDropdownComponent } from './tree-dropdown.component';
import { TreeComponent } from '../tree/tree.component';
import { createDefaultTreeNode, TreeNode, TreeBranchConfig } from '../models/tree-types';

/**
 * DOM tests for the mj-tree-dropdown component — the CLOSED-trigger surface only.
 *
 * The trigger (placeholder vs. selected text, display icon, chevron direction,
 * clear button gating, disabled state, combobox a11y attributes) is pure
 * @Input/state-driven template logic and is fully unit-testable.
 *
 * The OPEN dropdown panel (`@if (IsOpen)`) is intentionally NOT covered here:
 * Open() runs a real getBoundingClientRect-based positioning pass and renders the
 * inner <mj-tree> whose AutoLoad path fires a RunView against a provider, plus the
 * component builds a body-attached portal via Renderer2. That is overlay/positioning
 * behavior outside the fixture and belongs in a live/integration test. We keep the
 * dropdown closed for every assertion, so `mj-tree` is never instantiated and no
 * provider/RunView is touched. (See ANGULAR_TESTING_GUIDE §5, §7.)
 *
 * A minimal BranchConfig is supplied because the input is declared required; the
 * tree it feeds is never rendered while closed.
 */
const BRANCH_CONFIG: TreeBranchConfig = {
  EntityName: 'Categories',
  DisplayField: 'Name',
};

function renderDropdown(
  options: {
    inputs?: Record<string, unknown>;
    setup?: (i: TreeDropdownComponent, r: ComponentRef<TreeDropdownComponent>) => void;
  } = {},
) {
  return renderComponentFixture(TreeDropdownComponent, {
    imports: [CommonModule, FormsModule],
    declarations: [TreeDropdownComponent, TreeComponent],
    inputs: { AutoLoad: false, BranchConfig: BRANCH_CONFIG, ...(options.inputs ?? {}) },
    setup: options.setup,
  });
}

function leaf(partial: Partial<TreeNode>): TreeNode {
  return createDefaultTreeNode({ Type: 'leaf', ...partial });
}

describe('TreeDropdownComponent (DOM, closed trigger surface)', () => {
  describe('placeholder vs. selected text', () => {
    it('renders the placeholder text with the placeholder modifier class when nothing is selected', () => {
      const fixture = renderDropdown({ inputs: { Placeholder: 'Pick one' } });
      expect(text(fixture, '.tree-dropdown-trigger__text')).toBe('Pick one');
      expect(hasClass(fixture, '.tree-dropdown-trigger__text', 'tree-dropdown-trigger__text--placeholder')).toBe(true);
    });

    it("renders the selected node's label (no placeholder class) when a node is selected", () => {
      const fixture = renderDropdown({
        inputs: { Placeholder: 'Pick one' },
        setup: (i) => {
          i.SelectedNodes = [leaf({ ID: 'x', Label: 'Chosen' })];
        },
      });
      expect(text(fixture, '.tree-dropdown-trigger__text')).toBe('Chosen');
      expect(hasClass(fixture, '.tree-dropdown-trigger__text', 'tree-dropdown-trigger__text--placeholder')).toBe(false);
    });

    it('shows the multi-selection count when more than one node is selected', () => {
      const fixture = renderDropdown({
        inputs: { SelectionMode: 'multiple' },
        setup: (i) => {
          i.SelectedNodes = [leaf({ ID: 'a', Label: 'A' }), leaf({ ID: 'b', Label: 'B' })];
        },
      });
      expect(text(fixture, '.tree-dropdown-trigger__text')).toBe('2 items selected');
    });
  });

  describe('display icon', () => {
    it('renders the trigger icon for a single selected node when ShowIconInDisplay is true', () => {
      const fixture = renderDropdown({
        setup: (i) => {
          i.SelectedNodes = [leaf({ ID: 'x', Label: 'X', Icon: 'fa-solid fa-star' })];
        },
      });
      expect(query(fixture, '.tree-dropdown-trigger__icon')).not.toBeNull();
      expect(attr(fixture, '.tree-dropdown-trigger__icon i', 'class')).toContain('fa-star');
    });

    it('omits the trigger icon when ShowIconInDisplay is false', () => {
      const fixture = renderDropdown({
        inputs: { ShowIconInDisplay: false },
        setup: (i) => {
          i.SelectedNodes = [leaf({ ID: 'x', Label: 'X', Icon: 'fa-solid fa-star' })];
        },
      });
      expect(query(fixture, '.tree-dropdown-trigger__icon')).toBeNull();
    });
  });

  describe('chevron direction', () => {
    it('shows the down chevron while closed', () => {
      const fixture = renderDropdown();
      expect(attr(fixture, '.tree-dropdown-trigger__chevron i', 'class')).toContain('fa-chevron-down');
    });
  });

  describe('clear button gating', () => {
    it('renders the clear button when Clearable, a selection exists, and not disabled', () => {
      const fixture = renderDropdown({
        inputs: { Clearable: true },
        setup: (i) => {
          i.SelectedNodes = [leaf({ ID: 'x', Label: 'X' })];
        },
      });
      expect(query(fixture, '.tree-dropdown-trigger__clear')).not.toBeNull();
    });

    it('hides the clear button when there is no selection', () => {
      const fixture = renderDropdown({ inputs: { Clearable: true } });
      expect(query(fixture, '.tree-dropdown-trigger__clear')).toBeNull();
    });

    it('hides the clear button when Clearable is false even with a selection', () => {
      const fixture = renderDropdown({
        inputs: { Clearable: false },
        setup: (i) => {
          i.SelectedNodes = [leaf({ ID: 'x', Label: 'X' })];
        },
      });
      expect(query(fixture, '.tree-dropdown-trigger__clear')).toBeNull();
    });

    it('hides the clear button when disabled even with a selection', () => {
      const fixture = renderDropdown({
        inputs: { Clearable: true, Disabled: true },
        setup: (i) => {
          i.SelectedNodes = [leaf({ ID: 'x', Label: 'X' })];
        },
      });
      expect(query(fixture, '.tree-dropdown-trigger__clear')).toBeNull();
    });

    it('clearing emits ValueChange(null) and SelectionChange(null) and removes the selected text', () => {
      // Drive display via SelectedNodes only — setting Value here would invoke the
      // provider-backed display-text lookup, which is out of scope for this surface test.
      const fixture = renderDropdown({
        inputs: { Clearable: true },
        setup: (i) => {
          i.SelectedNodes = [leaf({ ID: 'x', Label: 'Chosen' })];
        },
      });
      const valueEvents = capture<CompositeKey | CompositeKey[] | null>(fixture.componentInstance.ValueChange);
      const selectionEvents = capture<TreeNode | TreeNode[] | null>(fixture.componentInstance.SelectionChange);

      click(fixture, '.tree-dropdown-trigger__clear');
      fixture.detectChanges();

      expect(valueEvents.length).toBe(1);
      expect(valueEvents[0]).toBeNull();
      expect(selectionEvents.length).toBe(1);
      expect(selectionEvents[0]).toBeNull();
      // placeholder shows again now that selection is cleared
      expect(hasClass(fixture, '.tree-dropdown-trigger__text', 'tree-dropdown-trigger__text--placeholder')).toBe(true);
    });
  });

  describe('disabled state', () => {
    it('adds the disabled modifier class to the wrapper and sets aria-disabled', () => {
      const fixture = renderDropdown({ inputs: { Disabled: true } });
      expect(hasClass(fixture, '.tree-dropdown', 'tree-dropdown--disabled')).toBe(true);
      expect(attr(fixture, '[role="combobox"]', 'aria-disabled')).toBe('true');
    });

    it('does not open the dropdown when a disabled trigger is clicked', () => {
      const fixture = renderDropdown({ inputs: { Disabled: true } });
      click(fixture, '[role="combobox"]');
      fixture.detectChanges();
      expect(fixture.componentInstance.IsOpen).toBe(false);
      expect(query(fixture, '.tree-dropdown-panel')).toBeNull();
    });
  });

  describe('combobox accessibility', () => {
    it('exposes combobox role with aria-expanded=false and aria-haspopup=tree while closed', () => {
      const fixture = renderDropdown();
      expect(attr(fixture, '.tree-dropdown-trigger', 'role')).toBe('combobox');
      expect(attr(fixture, '[role="combobox"]', 'aria-expanded')).toBe('false');
      expect(attr(fixture, '[role="combobox"]', 'aria-haspopup')).toBe('tree');
    });
  });

  describe('loading indicator in trigger', () => {
    it('shows the spinner when IsLoading and ShowLoadingInTrigger are both true', () => {
      const fixture = renderDropdown({
        inputs: { ShowLoadingInTrigger: true },
        setup: (i) => {
          i.IsLoading = true;
        },
      });
      expect(query(fixture, '.tree-dropdown-trigger__loading')).not.toBeNull();
    });

    it('hides the spinner when ShowLoadingInTrigger is false', () => {
      const fixture = renderDropdown({
        inputs: { ShowLoadingInTrigger: false },
        setup: (i) => {
          i.IsLoading = true;
        },
      });
      expect(query(fixture, '.tree-dropdown-trigger__loading')).toBeNull();
    });
  });

  describe('panel positioning classes', () => {
    it('renders the panel with the open + below classes when opened (no measured position)', () => {
      const fixture = renderDropdown({
        setup: (i) => {
          i.IsOpen = true;
        },
      });
      const panel = query(fixture, '.tree-dropdown-panel');
      expect(panel).not.toBeNull();
      expect(panel!.classList.contains('tree-dropdown-panel--open')).toBe(true);
      // Position is null (IsOpen set directly, no calculatePosition) -> defaults to below
      expect(panel!.classList.contains('tree-dropdown-panel--below')).toBe(true);
      expect(panel!.classList.contains('tree-dropdown-panel--above')).toBe(false);
    });

    it('renders the panel above when the computed position is renderAbove', () => {
      const fixture = renderDropdown({
        setup: (i) => {
          i.IsOpen = true;
          i.Position = { top: 0, left: 0, width: 100, maxHeight: 200, renderAbove: true };
        },
      });
      const panel = query(fixture, '.tree-dropdown-panel');
      expect(panel!.classList.contains('tree-dropdown-panel--above')).toBe(true);
      expect(panel!.classList.contains('tree-dropdown-panel--below')).toBe(false);
    });
  });
});
