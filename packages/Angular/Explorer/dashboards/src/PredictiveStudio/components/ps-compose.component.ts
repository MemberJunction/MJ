import { ChangeDetectorRef, Component, Input, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
  groupByType,
  resolveComponentProfile,
  validateComponentGraph,
  type ComponentGraphNode,
  type ComponentTypeNode,
  type ComponentTypePropertyRow,
  type ComponentTypeSlotRow,
  type GraphComponentType,
  type GraphResolver,
  type GraphValidationFinding,
} from '@memberjunction/predictive-studio-core';

import { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import {
  buildComposeVM,
  candidateTypesForSlot,
  fillSlot,
  removeNodeAt,
  setRootType,
  type PSComposeCandidate,
  type PSComposeNodeVM,
  type PSComposeSlotVM,
} from '../compose.view-models';

/** The slot a candidate is being chosen for. */
interface ActiveSlot {
  trail: number[];
  slot: PSComposeSlotVM;
}

/**
 * **Compose** panel — build a model by filling a structure's slots, and see immediately whether what
 * you built can be trained.
 *
 * The component tree already says which types exist and what each one accepts; the Architect
 * sub-agent can already propose a graph. This is the surface where a person does the same thing
 * directly: pick a root, click an empty slot, choose from the types that slot actually accepts, and
 * watch `validateComponentGraph` re-run on every edit.
 *
 * Three deliberate positions:
 *
 * - **Only legal candidates are offered.** The palette is filtered by the slot's own `Accepts` rule
 *   — the same descendant-or-self check the validator enforces — so the common way to build an
 *   invalid graph is simply not reachable. An abstract type is shown *disabled with its reason*
 *   rather than hidden, because "Boosting is a place in the tree, not a model" is worth learning.
 * - **Validation is live, not on submit.** Every edit revalidates, so an empty required slot reads
 *   as an unfinished build rather than an error you discover at train time.
 * - **Nothing here trains anything.** The panel produces a `ComponentGraphNode`; committing it to a
 *   pipeline is a separate, explicit act. Composing is cheap and reversible, training is not.
 *
 * Click-to-fill rather than drag-and-drop: a click target is reachable by keyboard, announces what
 * it accepts, and is testable in a DOM test — none of which is true of a drag handle.
 */
@Component({
  standalone: true,
  selector: 'ps-compose',
  imports: [CommonModule, MJButtonDirective],
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../predictive-studio.shared.css', './ps-compose.component.css'],
  template: `
    <div class="ps-panel ps-compose" data-testid="ps-compose-panel">
      <div class="ps-card">
        <div class="ps-card-body compose-head">
          <div>
            <strong>Compose a model</strong>
            <div class="ps-muted ps-small">
              Fill each slot with a component it accepts. The graph is checked as you build.
            </div>
          </div>
          <div class="root-pick">
            <label class="ps-small ps-muted" for="ps-compose-root">Structure</label>
            <select
              id="ps-compose-root"
              data-testid="ps-compose-root-select"
              [value]="graph.ComponentTypeRef"
              (change)="chooseRoot($any($event.target).value)">
              @for (s of structures; track s.ID) {
                <option [value]="s.Name">{{ s.Name }}</option>
              }
            </select>
          </div>
        </div>
      </div>

      @if (findings.length > 0) {
        <div class="ps-card verdict" [class.blocked]="!valid" data-testid="ps-compose-verdict">
          <div class="ps-card-body">
            <i class="fa-solid" [class.fa-circle-xmark]="!valid" [class.fa-triangle-exclamation]="valid"></i>
            <div>
              <strong>{{ valid ? 'Buildable, with notes' : 'Not buildable yet' }}</strong>
              <ul class="ps-small">
                @for (f of findings; track f.Path + f.Rule) {
                  <li [class.err]="f.Severity === 'Error'">{{ f.Message }}</li>
                }
              </ul>
            </div>
          </div>
        </div>
      } @else {
        <div class="ps-card verdict ok" data-testid="ps-compose-verdict">
          <div class="ps-card-body">
            <i class="fa-solid fa-circle-check"></i>
            <strong>Buildable — every slot is filled with something it accepts.</strong>
          </div>
        </div>
      }

      <div class="ps-card">
        <div class="ps-card-body">
          <ng-container *ngTemplateOutlet="nodeTpl; context: { $implicit: tree }"></ng-container>
        </div>
      </div>
    </div>

    <!-- One node: its identity, then each of its slots. -->
    <ng-template #nodeTpl let-node>
      <div class="node" [style.marginLeft.px]="node.Depth * 14" [attr.data-testid]="'ps-compose-node-' + node.Path">
        <div class="node-head" [class.unknown]="!node.Type" [class.has-error]="node.Findings.length > 0">
          <i class="fa-solid" [class.fa-cube]="node.Type" [class.fa-circle-question]="!node.Type"></i>
          <span class="name">{{ node.TypeRef }}</span>
          @if (node.SlotName) { <span class="slot-tag">{{ node.SlotName }}</span> }
          @if (node.Depth > 0) {
            <button
              mjButton
              variant="secondary"
              size="sm"
              [attr.data-testid]="'ps-compose-remove-' + node.Path"
              [attr.aria-label]="'Remove ' + node.TypeRef"
              (click)="remove(node)">
              Remove
            </button>
          }
        </div>
        @for (f of node.Findings; track f.Rule) {
          <div class="node-finding ps-small" [class.err]="f.Severity === 'Error'">{{ f.Message }}</div>
        }

        @for (slot of node.Slots; track slot.Name) {
          <div class="slot" [class.underfilled]="slot.IsUnderfilled">
            <div class="slot-head ps-small">
              <span class="slot-name">{{ slot.Name }}</span>
              <span class="ps-muted">{{ slot.Arity }} · accepts {{ slot.AcceptsName }}</span>
            </div>

            @for (child of slot.Children; track child.Path) {
              <ng-container *ngTemplateOutlet="nodeTpl; context: { $implicit: child }"></ng-container>
            }

            @if (slot.CanAddMore) {
              <button
                class="add-slot"
                [attr.data-testid]="'ps-compose-fill-' + node.Path + '-' + slot.Name"
                [attr.aria-label]="'Fill ' + slot.Name + ' — accepts ' + slot.AcceptsName"
                (click)="openPalette(node, slot)">
                <i class="fa-solid fa-plus"></i> Fill {{ slot.Name }}
              </button>
            }
          </div>
        }
      </div>
    </ng-template>

    @if (activeSlot) {
      <div class="ps-compose-palette" data-testid="ps-compose-palette">
        <div class="palette-head">
          <strong>Fill <code>{{ activeSlot.slot.Name }}</code></strong>
          <div class="ps-muted ps-small">Accepts {{ activeSlot.slot.AcceptsName }} and anything below it.</div>
          <button mjButton variant="secondary" size="sm" data-testid="ps-compose-palette-close" (click)="closePalette()">Close</button>
        </div>
        <div class="palette-body">
          @for (c of candidates; track c.ID) {
            <button
              class="candidate"
              [class.disabled]="c.DisabledReason"
              [disabled]="!!c.DisabledReason"
              [attr.title]="c.DisabledReason"
              [attr.data-testid]="'ps-compose-candidate-' + c.Name"
              (click)="choose(c)">
              <span class="cand-name">{{ c.Name }}</span>
              <span class="ps-muted ps-small">{{ c.Kind }}{{ c.IsAbstract ? ' · abstract' : '' }}</span>
            </button>
          }
          @if (candidates.length === 0) {
            <div class="ps-muted ps-small">Nothing in the tree can fill this slot.</div>
          }
        </div>
      </div>
    }
  `,
})
export class PSComposeComponent implements OnInit {
  @Input() engine!: PredictiveStudioEngine;
  @Input() provider!: IMetadataProvider;
  @Input() currentUser?: UserInfo;
  /** Seed graph — lets the Architect's proposal be opened here for editing. */
  @Input() initialGraph?: ComponentGraphNode;

  public graph: ComponentGraphNode = { ComponentTypeRef: '' };
  public tree!: PSComposeNodeVM;
  public findings: GraphValidationFinding[] = [];
  public valid = true;
  public structures: GraphComponentType[] = [];
  public activeSlot: ActiveSlot | null = null;
  public candidates: PSComposeCandidate[] = [];

  private cdr = inject(ChangeDetectorRef);
  private resolver!: GraphResolver;
  private allTypes: GraphComponentType[] = [];

  public ngOnInit(): void {
    this.allTypes = this.nodes().map((t) => ({ ID: t.ID, Name: t.Name, Kind: t.Kind, IsAbstract: t.IsAbstract }));
    this.structures = this.allTypes.filter((t) => t.Kind === 'Structure' && !t.IsAbstract);
    this.resolver = this.buildResolver();
    this.graph = this.initialGraph ?? { ComponentTypeRef: this.structures[0]?.Name ?? '' };
    this.revalidate();
  }

  /** Swap the root structure. Children are dropped — they filled the OLD type's slots. */
  public chooseRoot(name: string): void {
    this.graph = setRootType(this.graph, name);
    this.closePalette();
    this.revalidate();
  }

  /** Open the candidate palette for a slot, filtered to what that slot accepts. */
  public openPalette(node: PSComposeNodeVM, slot: PSComposeSlotVM): void {
    this.activeSlot = { trail: node.Trail, slot };
    this.candidates = candidateTypesForSlot(slot, this.allTypes, this.resolver);
    this.cdr.detectChanges();
  }

  public closePalette(): void {
    this.activeSlot = null;
    this.candidates = [];
    this.cdr.detectChanges();
  }

  /** Fill the active slot with the chosen type. */
  public choose(candidate: PSComposeCandidate): void {
    if (!this.activeSlot || candidate.DisabledReason) {
      return;
    }
    this.graph = fillSlot(this.graph, this.activeSlot.trail, this.activeSlot.slot.Name, candidate.Name);
    this.closePalette();
    this.revalidate();
  }

  /** Remove a node (and its subtree) from the composition. */
  public remove(node: PSComposeNodeVM): void {
    this.graph = removeNodeAt(this.graph, node.Trail);
    this.closePalette();
    this.revalidate();
  }

  /** Re-run the real validator and reproject. Called after every edit — composing is cheap. */
  private revalidate(): void {
    const result = validateComponentGraph(this.graph, this.resolver);
    this.valid = result.Valid;
    this.findings = [...result.Findings];
    this.tree = buildComposeVM(this.graph, this.resolver, this.findings, this.allTypes);
    // Zoneless change detection: an edit driven from a click handler still needs an explicit pass.
    this.cdr.detectChanges();
  }

  /**
   * The browser-side {@link GraphResolver} — the same contract the server builds, over the engine's
   * cached tree. Slots come from the RESOLVED profile, so a slot declared on `Structure` and
   * narrowed on `Stacking Wrapper` reaches the validator in its inherited, narrowed form.
   */
  private buildResolver(): GraphResolver {
    const nodes = this.nodes();
    const byId = new Map(nodes.map((n) => [n.ID, n]));
    const properties = groupByType(this.propertyRows());
    const slots = groupByType(this.slotRows());
    return {
      FindTypeByName: (name: string): GraphComponentType | undefined => {
        const target = name.trim().toLowerCase();
        const found = nodes.find((t) => t.Name.trim().toLowerCase() === target);
        return found ? { ID: found.ID, Name: found.Name, Kind: found.Kind, IsAbstract: found.IsAbstract } : undefined;
      },
      SlotsFor: (componentTypeID: string) =>
        resolveComponentProfile(componentTypeID, byId, properties, slots).Slots.map((s) => ({
          Name: s.Name,
          AcceptsComponentTypeID: s.AcceptsComponentTypeID,
          MinCount: s.MinCount,
          MaxCount: s.MaxCount,
        })),
      IsDescendantOf: (typeID: string, ancestorID: string): boolean => {
        // Depth-capped like the resolver: a malformed ParentID cycle must not hang the panel.
        let cur: string | undefined = typeID;
        for (let i = 0; cur && i < 32; i++) {
          if (cur === ancestorID) return true;
          cur = byId.get(cur)?.ParentID ?? undefined;
        }
        return false;
      },
    };
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
