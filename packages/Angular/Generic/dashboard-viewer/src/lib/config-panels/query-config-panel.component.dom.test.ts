import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ComponentFixture } from '@angular/core/testing';
import type { CompositeKey } from '@memberjunction/core';
import type { TreeBranchConfig, TreeLeafConfig, TreeNode, TreeSelectableTypes, TreeSelectionMode } from '@memberjunction/ng-trees';
import { MJAccordionModule } from '@memberjunction/ng-ui-components';
import { RenderComponentFixture, Query, QueryAll } from '@memberjunction/ng-test-utils';
import { QueryConfigPanelComponent } from './query-config-panel.component';

/** Inert double for <mj-tree-dropdown> (ng-trees) with the inputs and output the query panel binds. */
@Component({ standalone: true, selector: 'mj-tree-dropdown', template: '' })
class StubTreeDropdownComponent {
  @Input() BranchConfig: TreeBranchConfig | null = null;
  @Input() LeafConfig: TreeLeafConfig | null = null;
  @Input() Value: CompositeKey | CompositeKey[] | null = null;
  @Input() SelectableTypes: TreeSelectableTypes = 'both';
  @Input() SelectionMode: TreeSelectionMode = 'single';
  @Input() Placeholder = '';
  @Input() EnableSearch = true;
  @Output() SelectionChange = new EventEmitter<TreeNode | TreeNode[] | null>();
}

/**
 * DOM coverage for the fields of <mj-query-config-panel> that the part dialog shows itself:
 * the title, the auto refresh interval and the parameter-controls checkbox.
 */
describe('QueryConfigPanelComponent (DOM)', () => {
  function render(inputs: Record<string, unknown> = {}): ComponentFixture<QueryConfigPanelComponent> {
    return RenderComponentFixture(QueryConfigPanelComponent, {
      imports: [FormsModule, MJAccordionModule, StubTreeDropdownComponent],
      declarations: [QueryConfigPanelComponent],
      inputs,
      autoDetect: true,
    });
  }
  const checkboxLabels = (f: ComponentFixture<QueryConfigPanelComponent>) =>
    QueryAll(f, '.checkbox-label').map(e => e.textContent?.trim());

  it('shows the title, auto refresh and parameter-controls fields by default', () => {
    const f = render();
    expect(Query(f, '#partTitle')).not.toBeNull();
    expect(Query(f, 'select.form-select')).not.toBeNull();
    expect(checkboxLabels(f)).toEqual(['Show Parameter Controls', 'Show Execution Metadata']);
  });

  it('leaves out the fields the part dialog shows, and keeps the query picker and its other options', () => {
    const f = render({ ShowCommonFields: false });
    expect(Query(f, '#partTitle')).toBeNull();
    expect(Query(f, 'select.form-select')).toBeNull();
    expect(checkboxLabels(f)).toEqual(['Show Execution Metadata']);
    expect(Query(f, 'mj-tree-dropdown')).not.toBeNull();
    expect(QueryAll(f, 'input[type="radio"][name="parameterLayout"]')).toHaveLength(3);
  });
});
