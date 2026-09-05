import { ChangeDetectorRef, Component, Input, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJMLComponentEntity } from '@memberjunction/core-entities';
import {
  groupByType,
  lintComponentTree,
  resolveComponentProfile,
  type ComponentTypeNode,
  type ComponentTypePropertyRow,
  type ComponentTypeSlotRow,
  type TreeLintFinding,
} from '@memberjunction/predictive-studio-core';

import { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import { emptyReuseMessage, toReuseMatches, type ReuseMatchVM } from '../component-reuse.view-models';
import {
  buildComponentTree,
  buildProfileVM,
  lintByNode,
  pathToNode,
  type PSComponentProfileVM,
  type PSComponentTreeNode,
} from '../component-tree.view-models';

/** One materialized instance of the selected type, shown with the story that makes it reusable. */
interface InstanceVM {
  id: string;
  name: string;
  story: string | null;
  promotionState: string;
  isTrained: boolean;
}

/**
 * **Components** panel — the tree of component types, and what any one of them actually inherits.
 *
 * A leaf's real capabilities are the ones it INHERITS: XGBoost declares almost nothing itself, and
 * gets `impute` from Tree Ensemble, its boosting hyperparameters from Boosting, and the leakage gate
 * from the Model root. Showing its own rows would be actively misleading, so the inspector shows the
 * RESOLVED profile with an "inherited from" chip on every item that came from an ancestor — which is
 * what makes the inheritance model legible rather than merely correct.
 *
 * Read-only. Composing a graph in the UI ships with the composition runtime.
 */
@Component({
  standalone: true,
  selector: 'ps-components',
  imports: [CommonModule, MJButtonDirective],
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../predictive-studio.shared.css', './ps-components.component.css'],
  template: `
    <div class="ps-panel ps-components" data-testid="ps-components-panel">
      @if (lintFindings.length > 0) {
        <div class="ps-card lint-banner" data-testid="ps-components-lint-banner">
          <div class="ps-card-body">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <div>
              <strong>{{ lintFindings.length }} partition issue{{ lintFindings.length === 1 ? '' : 's' }} in the component tree.</strong>
              <div class="ps-muted ps-small">
                A property should live on a node only if it is true of everything beneath it. The affected nodes are
                marked in the tree.
              </div>
            </div>
          </div>
        </div>
      }

      <div class="split">
        <!-- ── the tree ─────────────────────────────────────────────── -->
        <div class="ps-card tree-card">
          <div class="ps-card-head">
            <h3>Component types</h3>
            <div class="kind-chips" data-testid="ps-components-kind-filter">
              <button class="chip" [class.on]="!kindFilter" data-testid="ps-components-kind-chip" (click)="setKind(null)">All</button>
              @for (kind of kinds; track kind) {
                <button class="chip" [class.on]="kindFilter === kind" data-testid="ps-components-kind-chip" (click)="setKind(kind)">
                  {{ kind }}
                </button>
              }
            </div>
          </div>
          <div class="ps-card-body tree-body">
            @if (treeNodes.length === 0) {
              <div class="ps-muted ps-small" data-testid="ps-components-empty">
                No component types are seeded yet.
              </div>
            }
            @for (node of treeNodes; track node.id) {
              <button
                class="tree-row"
                [class.selected]="node.id === selectedId"
                [class.abstract]="node.isAbstract"
                [style.paddingLeft.px]="10 + node.depth * 16"
                data-testid="ps-components-tree-row"
                [attr.data-node-id]="node.id"
                (click)="select(node)">
                <i class="twisty" [class.fa-solid]="node.hasChildren" [class.fa-caret-down]="node.hasChildren && isExpanded(node.id)" [class.fa-caret-right]="node.hasChildren && !isExpanded(node.id)"></i>
                <span class="name">{{ node.name }}</span>
                @if (node.isAbstract) {
                  <span class="tag abstract-tag" title="Abstract — carries inherited properties, cannot be instantiated">abstract</span>
                }
                @if (lintFor(node.id) > 0) {
                  <i class="fa-solid fa-triangle-exclamation lint-flag" data-testid="ps-components-lint-flag" [title]="lintTitle(node.id)"></i>
                }
              </button>
            }
          </div>
        </div>

        <!-- ── the inspector ────────────────────────────────────────── -->
        <div class="inspector">
          <div class="ps-card reuse" data-testid="ps-components-reuse">
            <div class="ps-card-head">
              <h3>Find a part by meaning</h3>
              @if (selectedSlotName) {
                <span class="ps-badge gray" data-testid="ps-components-reuse-slot">fits {{ selectedSlotName }}</span>
              }
            </div>
            <div class="ps-card-body">
              <div class="ps-muted ps-small reuse-intro">
                Describe what you need in plain English. Every published component wrote its own story,
                and the story is what is searched — not the column name, the table, or the class.
              </div>
              <div class="reuse-search">
                <input
                  class="reuse-input"
                  type="text"
                  data-testid="ps-components-reuse-input"
                  placeholder="e.g. tells a real zero apart from missing data"
                  [value]="reuseQuery"
                  (input)="onReuseQueryInput($event)"
                  (keydown.enter)="runReuseSearch()" />
                <button
                  mjButton
                  variant="primary"
                  size="sm"
                  data-testid="ps-components-reuse-run"
                  (click)="runReuseSearch()"
                  [disabled]="reuseSearching || !reuseQuery.trim()">
                  <i class="fa-solid fa-magnifying-glass-chart"></i> {{ reuseSearching ? 'Searching…' : 'Search' }}
                </button>
              </div>
              @if (reuseExamples.length > 0 && reuseMatches.length === 0 && !reuseSearching && !reuseMessage) {
                <div class="reuse-examples" data-testid="ps-components-reuse-examples">
                  @for (example of reuseExamples; track example) {
                    <button class="chip" data-testid="ps-components-reuse-example" (click)="useExample(example)">{{ example }}</button>
                  }
                </div>
              }
              @if (reuseMessage) {
                <div class="ps-muted ps-small" data-testid="ps-components-reuse-message">{{ reuseMessage }}</div>
              }
              @for (match of reuseMatches; track match.id) {
                <div class="reuse-match" data-testid="ps-components-reuse-match">
                  <div class="item-main">
                    <span class="item-key">{{ match.name }}</span>
                    <span class="tag">{{ match.typeName }}</span>
                    @if (match.promotionState) {
                      <span class="tag" [class.approved]="match.promotionState === 'Approved'">{{ match.promotionState }}</span>
                    }
                    @if (match.similarity !== null) {
                      <span class="ps-muted ps-small match-score" data-testid="ps-components-reuse-score">{{ match.matchPercent }}% match</span>
                    }
                  </div>
                  <div class="match-bar" aria-hidden="true"><span [style.width.%]="match.matchPercent"></span></div>
                  @if (match.story) {
                    <div class="ps-muted ps-small story-line" data-testid="ps-components-reuse-story">{{ match.story }}</div>
                  }
                  @if (match.fromModel) {
                    <div class="ps-muted ps-small" data-testid="ps-components-reuse-from">from {{ match.fromModel }}</div>
                  }
                </div>
              }
            </div>
          </div>

          @if (!profile) {
            <div class="ps-card">
              <div class="ps-card-body ps-muted ps-small" data-testid="ps-components-no-selection">
                Select a component type to see everything it inherits.
              </div>
            </div>
          } @else {
            <div class="ps-card">
              <div class="ps-card-head">
                <h3 data-testid="ps-components-profile-name">{{ profile.name }}</h3>
                <span class="tag kind-tag">{{ profile.kind }}</span>
                @if (profile.isAbstract) { <span class="tag abstract-tag">abstract</span> }
              </div>
              <div class="ps-card-body">
                @if (profile.story) {
                  <p class="story" data-testid="ps-components-profile-story">{{ profile.story }}</p>
                }
                <div class="chain" data-testid="ps-components-profile-chain">
                  @for (step of profile.chain; track $index; let last = $last) {
                    <span class="chain-step" [class.leaf]="last">{{ step }}</span>
                    @if (!last) { <i class="fa-solid fa-chevron-right"></i> }
                  }
                </div>
                @if (profile.driverClass) {
                  <div class="ps-muted ps-small driver">Runs as <code>{{ profile.driverClass }}</code></div>
                }
              </div>
            </div>

            @for (section of profile.sections; track section.key) {
              <div class="ps-card" data-testid="ps-components-profile-section">
                <div class="ps-card-head"><h3>{{ section.label }}</h3></div>
                <div class="ps-card-body">
                  @for (item of section.items; track $index) {
                    <div class="profile-item" data-testid="ps-components-profile-item">
                      <div class="item-main">
                        @if (item.itemKey) { <span class="item-key">{{ item.itemKey }}</span> }
                        <code class="item-value">{{ item.display }}</code>
                      </div>
                      @if (item.inheritedFrom) {
                        <span class="tag inherited" data-testid="ps-components-inherited-chip">
                          <i class="fa-solid fa-arrow-turn-up"></i> {{ item.inheritedFrom }}
                        </span>
                      }
                      @if (item.rationale) {
                        <div class="ps-muted ps-small rationale">{{ item.rationale }}</div>
                      }
                    </div>
                  }
                </div>
              </div>
            }

            @if (profile.slots.length > 0) {
              <div class="ps-card" data-testid="ps-components-slots">
                <div class="ps-card-head"><h3>Fillable slots</h3></div>
                <div class="ps-card-body">
                  @for (slot of profile.slots; track slot.name) {
                    <div class="profile-item">
                      <div class="item-main">
                        <span class="item-key">{{ slot.name }}</span>
                        <span class="ps-small">takes {{ slot.arity }} &times; <strong>{{ slot.acceptsName }}</strong></span>
                      </div>
                      @if (slot.inheritedFrom) {
                        <span class="tag inherited"><i class="fa-solid fa-arrow-turn-up"></i> {{ slot.inheritedFrom }}</span>
                      }
                    </div>
                  }
                </div>
              </div>
            }

            <div class="ps-card" data-testid="ps-components-instances">
              <div class="ps-card-head">
                <h3>Built from this</h3>
                <button mjButton variant="secondary" size="sm" data-testid="ps-components-refresh" (click)="loadInstances()" [disabled]="loadingInstances">
                  <i class="fa-solid fa-rotate"></i> {{ loadingInstances ? 'Loading…' : 'Refresh' }}
                </button>
              </div>
              <div class="ps-card-body">
                @if (instances.length === 0) {
                  <div class="ps-muted ps-small" data-testid="ps-components-instances-empty">
                    {{ loadingInstances ? 'Loading…' : 'Nothing has been built from this component type yet.' }}
                  </div>
                }
                @for (instance of instances; track instance.id) {
                  <div class="instance" data-testid="ps-components-instance">
                    <div class="item-main">
                      <span class="item-key">{{ instance.name }}</span>
                      <span class="tag" [class.approved]="instance.promotionState === 'Approved'">{{ instance.promotionState }}</span>
                      @if (!instance.isTrained) { <span class="tag">untrained</span> }
                    </div>
                    @if (instance.story) {
                      <div class="ps-muted ps-small story-line" data-testid="ps-components-instance-story">{{ instance.story }}</div>
                    }
                  </div>
                }
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class PSComponentsComponent implements OnInit {
  @Input() engine!: PredictiveStudioEngine;
  @Input() provider!: IMetadataProvider;
  @Input() currentUser?: UserInfo;

  public treeNodes: PSComponentTreeNode[] = [];
  public profile: PSComponentProfileVM | null = null;
  public selectedId: string | null = null;
  public kindFilter: string | null = null;
  public kinds: string[] = [];
  public lintFindings: TreeLintFinding[] = [];
  public instances: InstanceVM[] = [];
  public loadingInstances = false;

  // ── Reuse-by-meaning search ──────────────────────────────────────────────────────────
  /** The plain-English query. Embedded SERVER-side, so the browser never picks an embedding model. */
  public reuseQuery = '';
  public reuseMatches: ReuseMatchVM[] = [];
  public reuseSearching = false;
  /** Empty-state or failure line; null when there is nothing to say. */
  public reuseMessage: string | null = null;
  /** Prompts that show what KIND of question works — meaning, not naming. */
  public readonly reuseExamples: readonly string[] = [
    'tells a real zero apart from missing data',
    'how recently someone engaged before a decision',
    'where this is heading over the next few months',
  ];

  private expanded = new Set<string>();
  private findingsByNode = new Map<string, TreeLintFinding[]>();
  // Zoneless CD: an async load completes outside any template event handler, so the view has to be
  // told. Without this the refreshed instance list would render only on the next unrelated tick.
  private cdr = inject(ChangeDetectorRef);


  /** The slot a match would fill when a slot-bearing type is selected — shown as context. */
  public get selectedSlotName(): string | null {
    return this.profile?.slots?.[0]?.name ?? null;
  }

  /** Two-way binding by hand: the input is a plain element, not a forms control. */
  public onReuseQueryInput(event: Event): void {
    this.reuseQuery = (event.target as HTMLInputElement).value;
  }

  /** Fill the box from an example and run it, so one click shows the whole idea. */
  public useExample(example: string): void {
    this.reuseQuery = example;
    void this.runReuseSearch();
  }

  /**
   * Search the component catalogue by MEANING.
   *
   * `QueryText` goes to the server and is embedded there with the same model that wrote every
   * `StoryVector`. The browser deliberately never embeds: a client that picked its own model would
   * produce distances against a different vector space, and the results would look plausible while
   * meaning nothing.
   *
   * `TrainedOnly` is false because an INPUT component holds no fitted state — it is reused by its
   * definition (its entity, field, join path and window), not by a frozen artifact. Leaving the
   * default on would filter out exactly the parts this panel exists to surface.
   */
  public async runReuseSearch(): Promise<void> {
    const query = this.reuseQuery.trim();
    if (!query || this.reuseSearching) {
      return;
    }
    this.reuseSearching = true;
    this.reuseMessage = null;
    this.reuseMatches = [];
    this.cdr.markForCheck();
    try {
      const result = await this.engine.FindReusableComponents(
        { QueryText: query, TopK: 6, TrainedOnly: false, PromotionStates: ['Draft', 'Approved'] },
        this.provider,
      );
      this.reuseMatches = toReuseMatches(result.Matches);
      this.reuseMessage = this.reuseMatches.length > 0 ? null : emptyReuseMessage(result.CandidatesConsidered);
    } catch (err) {
      this.reuseMatches = [];
      this.reuseMessage = `Search failed: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      this.reuseSearching = false;
      // Zoneless CD: this completes outside any template event handler.
      this.cdr.markForCheck();
    }
  }

  /** @inheritdoc */
  public ngOnInit(): void {
    const nodes = this.nodes();
    // Kind roots start open — the seven Kinds ARE the top-level shape of the model, and a fully
    // collapsed tree would hide that on first view.
    for (const node of nodes) {
      if (!node.ParentID) this.expanded.add(node.ID);
    }
    this.kinds = [...new Set(nodes.map((n) => n.Kind))].sort();
    this.lintFindings = lintComponentTree(nodes, this.propertyRows(), this.slotRows()).filter((f) => f.Severity !== 'Info');
    this.findingsByNode = lintByNode(this.lintFindings);
    this.rebuild();
  }

  /** Narrow the tree to one Kind (or clear the filter). Clears a selection outside the new scope. */
  public setKind(kind: string | null): void {
    this.kindFilter = kind;
    if (this.selectedId && kind) {
      const selected = this.nodes().find((n) => n.ID === this.selectedId);
      if (selected && selected.Kind !== kind) {
        this.selectedId = null;
        this.profile = null;
        this.instances = [];
      }
    }
    this.rebuild();
  }

  /** Select a node: toggle its subtree, resolve its profile, and clear the previous instance list. */
  public select(node: PSComponentTreeNode): void {
    if (node.hasChildren) {
      if (this.expanded.has(node.id)) this.expanded.delete(node.id);
      else this.expanded.add(node.id);
    }
    this.selectedId = node.id;
    this.instances = [];
    this.resolveSelected();
    this.rebuild();
  }

  /** Whether a node's children are shown. */
  public isExpanded(id: string): boolean {
    return this.expanded.has(id);
  }

  /** How many non-Info lint findings a node carries (badges it in the tree). */
  public lintFor(id: string): number {
    return this.findingsByNode.get(id)?.length ?? 0;
  }

  /** The tooltip listing a node's findings. */
  public lintTitle(id: string): string {
    return (this.findingsByNode.get(id) ?? []).map((f) => f.Message).join('\n');
  }

  /**
   * Load the instances built from the selected type. On demand and narrowed — instances grow with
   * every trained model, and `StoryVector` is excluded by the engine loader.
   */
  public async loadInstances(): Promise<void> {
    if (!this.selectedId || this.loadingInstances) {
      return;
    }
    this.loadingInstances = true;
    try {
      const rows = await this.engine.LoadComponentInstances(this.provider, this.currentUser, {
        componentTypeId: this.selectedId,
        maxRows: 25,
      });
      this.instances = rows.map((r: MJMLComponentEntity) => ({
        id: r.ID,
        name: r.Name,
        story: r.Story ?? null,
        promotionState: String(r.PromotionState ?? ''),
        isTrained: !!r.IsTrained,
      }));
    } finally {
      this.loadingInstances = false;
      this.cdr.detectChanges();
    }
  }

  /** Resolve the selected node's inherited profile, auto-expanding the path to it. */
  private resolveSelected(): void {
    if (!this.selectedId) {
      this.profile = null;
      return;
    }
    const nodes = this.nodes();
    for (const ancestor of pathToNode(nodes, this.selectedId)) {
      this.expanded.add(ancestor);
    }
    try {
      const resolved = resolveComponentProfile(
        this.selectedId,
        new Map(nodes.map((n) => [n.ID, n])),
        groupByType(this.propertyRows()),
        groupByType(this.slotRows()),
      );
      this.profile = buildProfileVM(resolved, new Map(nodes.map((n) => [n.ID, n.Name])));
    } catch {
      // A cycle or a dangling parent is a DATA problem the lint banner already reports; the
      // inspector simply shows nothing rather than breaking the panel.
      this.profile = null;
    }
  }

  private rebuild(): void {
    this.treeNodes = buildComponentTree(this.nodes(), this.expanded, this.kindFilter ?? undefined);
  }

  /** Project the cached type entities onto the pure resolver's structural shape. */
  private nodes(): ComponentTypeNode[] {
    return (this.engine?.ComponentTypes ?? []).map((t) => ({
      ID: t.ID,
      Name: t.Name,
      Kind: t.Kind,
      ParentID: t.ParentID,
      IsAbstract: t.IsAbstract,
      Trainable: t.Trainable,
      DriverClass: t.DriverClass,
      SpecSchema: t.SpecSchema,
      DefaultSpec: t.DefaultSpec,
      Story: t.Story,
      Status: t.Status,
    }));
  }

  private propertyRows(): ComponentTypePropertyRow[] {
    return (this.engine?.ComponentTypeProperties ?? []).map((p) => ({
      ComponentTypeID: p.ComponentTypeID,
      PropertyKey: p.PropertyKey,
      Operation: p.Operation,
      ItemKey: p.ItemKey,
      Value: p.Value,
      Sequence: p.Sequence,
      Rationale: p.Rationale,
    }));
  }

  private slotRows(): ComponentTypeSlotRow[] {
    return (this.engine?.ComponentTypeSlots ?? []).map((s) => ({
      ComponentTypeID: s.ComponentTypeID,
      Name: s.Name,
      Description: s.Description,
      AcceptsComponentTypeID: s.AcceptsComponentTypeID,
      MinCount: s.MinCount,
      MaxCount: s.MaxCount,
      DefaultComponentTypeID: s.DefaultComponentTypeID,
      Sequence: s.Sequence,
    }));
  }
}
