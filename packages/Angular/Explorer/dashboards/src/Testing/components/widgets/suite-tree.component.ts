import { Component, Input, Output, EventEmitter } from '@angular/core';
import { SuiteHierarchyNode } from '../../services/testing-instrumentation.service';

@Component({
  standalone: false,
  selector: 'app-suite-tree',
  template: `
    <div class="suite-tree">
      <div class="tree-header">
        <h4>
          <i class="fa-solid fa-folder-tree"></i>
          Test Suites
        </h4>
        <div class="tree-actions">
          <button class="tree-action-btn" (click)="expandAll()" title="Expand All">
            <i class="fa-solid fa-chevron-down"></i>
          </button>
          <button class="tree-action-btn" (click)="collapseAll()" title="Collapse All">
            <i class="fa-solid fa-chevron-up"></i>
          </button>
        </div>
      </div>

      <div class="tree-content">
        @if (suites && suites.length > 0) {
          @for (suite of suites; track suite.id) {
            <div>
              <app-suite-tree-node
                [node]="suite"
                [level]="0"
                [selectedId]="selectedSuiteId"
                (nodeClick)="onNodeClick($event)"
                (toggleExpand)="onToggleExpand($event)"
              ></app-suite-tree-node>
            </div>
          }
        } @else {
          <div class="no-suites">
            <i class="fa-solid fa-folder-open"></i>
            <p>No test suites found</p>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .suite-tree {
      height: 100%;
      display: flex;
      flex-direction: column;
      background: var(--mj-bg-surface);
      border-radius: 8px;
      overflow: hidden;
    }

    .tree-header {
      padding: 16px;
      background: var(--mj-bg-surface-card);
      border-bottom: 1px solid var(--mj-border-default);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .tree-header h4 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--mj-text-primary);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .tree-header h4 i {
      color: var(--mj-brand-primary);
    }

    .tree-actions {
      display: flex;
      gap: 6px;
    }

    .tree-action-btn {
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      color: var(--mj-text-secondary);
      transition: all 0.2s ease;
    }

    .tree-action-btn:hover {
      background: var(--mj-bg-surface-sunken);
      border-color: var(--mj-border-strong);
      color: var(--mj-text-primary);
    }

    .tree-action-btn i {
      font-size: 10px;
    }

    .tree-content {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    .no-suites {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      color: var(--mj-text-disabled);
      gap: 12px;
    }

    .no-suites i {
      font-size: 36px;
      color: var(--mj-border-default);
    }

    .no-suites p {
      margin: 0;
      font-size: 13px;
    }
  `]
})
export class SuiteTreeComponent {
  @Input() Suites: SuiteHierarchyNode[] = [];

  /** @deprecated Use {@link Suites}. */
  @Input() set suites(value: SuiteHierarchyNode[]) {
    this.Suites = value;
  }
  /** @deprecated Use {@link Suites}. */
  get suites(): SuiteHierarchyNode[] {
    return this.Suites;
  }
  @Input() SelectedSuiteId: string | null = null;

  /** @deprecated Use {@link SelectedSuiteId}. */
  @Input() set selectedSuiteId(value: string | null) {
    this.SelectedSuiteId = value;
  }
  /** @deprecated Use {@link SelectedSuiteId}. */
  get selectedSuiteId(): string | null {
    return this.SelectedSuiteId;
  }
  @Output() SuiteSelect = new EventEmitter<string>();

  /**
   * @deprecated Use {@link SuiteSelect}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (suiteSelect) keeps working. Must stay AFTER SuiteSelect: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() suiteSelect = this.SuiteSelect;

  OnNodeClick(suiteId: string): void {
    this.SuiteSelect.emit(suiteId);
  }

  /** @deprecated Use {@link OnNodeClick}. */
  onNodeClick(suiteId: string): void {
    return this.OnNodeClick(suiteId);
  }

  OnToggleExpand(node: SuiteHierarchyNode): void {
    node.expanded = !node.expanded;
  }

  /** @deprecated Use {@link OnToggleExpand}. */
  onToggleExpand(node: SuiteHierarchyNode): void {
    return this.OnToggleExpand(node);
  }

  ExpandAll(): void {
    this.setExpandedRecursive(this.Suites, true);
  }

  /** @deprecated Use {@link ExpandAll}. */
  expandAll(): void {
    return this.ExpandAll();
  }

  CollapseAll(): void {
    this.setExpandedRecursive(this.Suites, false);
  }

  /** @deprecated Use {@link CollapseAll}. */
  collapseAll(): void {
    return this.CollapseAll();
  }

  private setExpandedRecursive(nodes: SuiteHierarchyNode[], expanded: boolean): void {
    nodes.forEach(node => {
      node.expanded = expanded;
      if (node.children && node.children.length > 0) {
        this.setExpandedRecursive(node.children, expanded);
      }
    });
  }
}

@Component({
  standalone: false,
  selector: 'app-suite-tree-node',
  template: `
    <div class="tree-node" [style.padding-left.px]="level * 16">
      <div
        class="node-content"
        [class.selected]="node.id === selectedId"
        (click)="onClick()"
        >
        @if (node.children && node.children.length > 0) {
          <button
            class="expand-btn"
            (click)="onToggle($event)"
            >
            <i class="fa-solid" [class.fa-chevron-right]="!node.expanded" [class.fa-chevron-down]="node.expanded"></i>
          </button>
        }
        @if (!node.children || node.children.length === 0) {
          <span class="expand-placeholder"></span>
        }
    
        <i class="fa-solid fa-folder suite-icon"></i>
    
        <span class="suite-name">{{ node.name }}</span>
    
        <div class="suite-metrics">
          <span class="test-count" title="Test Count">
            <i class="fa-solid fa-flask"></i>
            {{ node.testCount }}
          </span>
          <span class="pass-rate" [class]="getPassRateClass(node.passRate)" title="Pass Rate">
            {{ node.passRate.toFixed(0) }}%
          </span>
        </div>
      </div>
    
      @if (node.expanded && node.children && node.children.length > 0) {
        @for (child of node.children; track child.id) {
          <div>
            <app-suite-tree-node
              [node]="child"
              [level]="level + 1"
              [selectedId]="selectedId"
              (nodeClick)="nodeClick.emit($event)"
              (toggleExpand)="toggleExpand.emit($event)"
            ></app-suite-tree-node>
          </div>
        }
      }
    </div>
    `,
  styles: [`
    .tree-node {
      margin-bottom: 2px;
    }

    .node-content {
      display: flex;
      align-items: center;
      padding: 8px 12px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s ease;
      gap: 8px;
    }

    .node-content:hover {
      background: var(--mj-bg-surface-card);
    }

    .node-content.selected {
      background: color-mix(in srgb, var(--mj-brand-primary) 15%, var(--mj-bg-surface));
      border-left: 3px solid var(--mj-brand-primary);
    }

    .expand-btn {
      background: none;
      border: none;
      cursor: pointer;
      padding: 2px 6px;
      color: var(--mj-text-secondary);
      font-size: 10px;
      transition: color 0.2s ease;
      min-width: 20px;
    }

    .expand-btn:hover {
      color: var(--mj-text-primary);
    }

    .expand-placeholder {
      width: 20px;
    }

    .suite-icon {
      font-size: 12px;
      color: var(--mj-status-warning);
    }

    .suite-name {
      flex: 1;
      font-size: 12px;
      font-weight: 500;
      color: var(--mj-text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .suite-metrics {
      display: flex;
      gap: 8px;
      align-items: center;
      font-size: 10px;
    }

    .test-count {
      display: flex;
      align-items: center;
      gap: 3px;
      color: var(--mj-text-secondary);
      background: var(--mj-bg-surface-sunken);
      padding: 2px 6px;
      border-radius: 10px;
    }

    .test-count i {
      font-size: 9px;
    }

    .pass-rate {
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 10px;
      min-width: 36px;
      text-align: center;
    }

    .pass-rate.excellent {
      background: color-mix(in srgb, var(--mj-status-success) 15%, var(--mj-bg-surface));
      color: var(--mj-status-success);
    }

    .pass-rate.good {
      background: color-mix(in srgb, var(--mj-status-success) 15%, var(--mj-bg-surface));
      color: var(--mj-status-success);
    }

    .pass-rate.fair {
      background: color-mix(in srgb, var(--mj-status-warning) 15%, var(--mj-bg-surface));
      color: var(--mj-status-warning);
    }

    .pass-rate.poor {
      background: color-mix(in srgb, var(--mj-status-error) 15%, var(--mj-bg-surface));
      color: var(--mj-status-error);
    }
  `]
})
export class SuiteTreeNodeComponent {
  @Input() Node!: SuiteHierarchyNode;

  /** @deprecated Use {@link Node}. */
  @Input() set node(value: SuiteHierarchyNode) {
    this.Node = value;
  }
  /** @deprecated Use {@link Node}. */
  get node(): SuiteHierarchyNode {
    return this.Node;
  }
  @Input() Level = 0;

  /** @deprecated Use {@link Level}. */
  @Input() set level(value: SuiteTreeNodeComponent['Level']) {
    this.Level = value;
  }
  /** @deprecated Use {@link Level}. */
  get level(): SuiteTreeNodeComponent['Level'] {
    return this.Level;
  }
  @Input() SelectedId: string | null = null;

  /** @deprecated Use {@link SelectedId}. */
  @Input() set selectedId(value: string | null) {
    this.SelectedId = value;
  }
  /** @deprecated Use {@link SelectedId}. */
  get selectedId(): string | null {
    return this.SelectedId;
  }
  @Output() NodeClick = new EventEmitter<string>();

  /**
   * @deprecated Use {@link NodeClick}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (nodeClick) keeps working. Must stay AFTER NodeClick: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() nodeClick = this.NodeClick;
  @Output() ToggleExpand = new EventEmitter<SuiteHierarchyNode>();

  /**
   * @deprecated Use {@link ToggleExpand}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (toggleExpand) keeps working. Must stay AFTER ToggleExpand: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() toggleExpand = this.ToggleExpand;

  OnClick(): void {
    this.NodeClick.emit(this.Node.id);
  }

  /** @deprecated Use {@link OnClick}. */
  onClick(): void {
    return this.OnClick();
  }

  OnToggle(event: Event): void {
    event.stopPropagation();
    this.ToggleExpand.emit(this.Node);
  }

  /** @deprecated Use {@link OnToggle}. */
  onToggle(event: Event): void {
    return this.OnToggle(event);
  }

  GetPassRateClass(passRate: number): string {
    if (passRate >= 90) return 'excellent';
    if (passRate >= 75) return 'good';
    if (passRate >= 50) return 'fair';
    return 'poor';
  }

  /** @deprecated Use {@link GetPassRateClass}. */
  getPassRateClass(passRate: number): string {
    return this.GetPassRateClass(passRate);
  }
}
