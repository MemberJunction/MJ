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
      background: white;
      border-radius: 8px;
      overflow: hidden;
    }

    .tree-header {
      padding: 16px;
      background: #f8f9fa;
      border-bottom: 1px solid #e0e0e0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .tree-header h4 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #333;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .tree-header h4 i {
      color: #2196f3;
    }

    .tree-actions {
      display: flex;
      gap: 6px;
    }

    .tree-action-btn {
      background: white;
      border: 1px solid #ddd;
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      color: #666;
      transition: all 0.2s ease;
    }

    .tree-action-btn:hover {
      background: #e9ecef;
      border-color: #ccc;
      color: #333;
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
      color: #999;
      gap: 12px;
    }

    .no-suites i {
      font-size: 36px;
      color: #ddd;
    }

    .no-suites p {
      margin: 0;
      font-size: 13px;
    }
  `]
})
export class SuiteTreeComponent {
  @Input() suites: SuiteHierarchyNode[] = [];
  @Input() selectedSuiteId: string | null = null;
  @Output() suiteSelect = new EventEmitter<string>();

  onNodeClick(suiteId: string): void {
    this.suiteSelect.emit(suiteId);
  }

  onToggleExpand(node: SuiteHierarchyNode): void {
    node.expanded = !node.expanded;
  }

  expandAll(): void {
    this.setExpandedRecursive(this.suites, true);
  }

  collapseAll(): void {
    this.setExpandedRecursive(this.suites, false);
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
        <button
          class="expand-btn"
          *ngIf="node.children && node.children.length > 0"
          (click)="onToggle($event)"
        >
          <i class="fa-solid" [class.fa-chevron-right]="!node.expanded" [class.fa-chevron-down]="node.expanded"></i>
        </button>
        <span class="expand-placeholder" *ngIf="!node.children || node.children.length === 0"></span>

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
      background: #f8f9fa;
    }

    .node-content.selected {
      background: rgba(33, 150, 243, 0.1);
      border-left: 3px solid #2196f3;
    }

    .expand-btn {
      background: none;
      border: none;
      cursor: pointer;
      padding: 2px 6px;
      color: #666;
      font-size: 10px;
      transition: color 0.2s ease;
      min-width: 20px;
    }

    .expand-btn:hover {
      color: #333;
    }

    .expand-placeholder {
      width: 20px;
    }

    .suite-icon {
      font-size: 12px;
      color: #ff9800;
    }

    .suite-name {
      flex: 1;
      font-size: 12px;
      font-weight: 500;
      color: #333;
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
      color: #666;
      background: #f0f0f0;
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
      background: rgba(76, 175, 80, 0.1);
      color: #4caf50;
    }

    .pass-rate.good {
      background: rgba(139, 195, 74, 0.1);
      color: #8bc34a;
    }

    .pass-rate.fair {
      background: rgba(255, 193, 7, 0.1);
      color: #ffc107;
    }

    .pass-rate.poor {
      background: rgba(244, 67, 54, 0.1);
      color: #f44336;
    }
  `]
})
export class SuiteTreeNodeComponent {
  @Input() node!: SuiteHierarchyNode;
  @Input() level = 0;
  @Input() selectedId: string | null = null;
  @Output() nodeClick = new EventEmitter<string>();
  @Output() toggleExpand = new EventEmitter<SuiteHierarchyNode>();

  onClick(): void {
    this.nodeClick.emit(this.node.id);
  }

  onToggle(event: Event): void {
    event.stopPropagation();
    this.toggleExpand.emit(this.node);
  }

  getPassRateClass(passRate: number): string {
    if (passRate >= 90) return 'excellent';
    if (passRate >= 75) return 'good';
    if (passRate >= 50) return 'fair';
    return 'poor';
  }
}
