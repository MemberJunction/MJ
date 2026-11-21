import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type {
  MJCommunicationComplianceRegimeEntity,
  MJJurisdictionMemberEntity,
} from '@memberjunction/core-entities';
import { IndexByUUID, UUIDMap, UUIDsEqual } from '@memberjunction/global';
import type { CommsAdminLoadedMetadata, JurisdictionTreeNode } from './communications-admin.types';

@Component({
  selector: 'mj-comms-regimes-jurisdictions-tab',
  standalone: true,
  imports: [MJButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./communications-admin.css'],
  template: `
    <div class="comms-card">
      <div class="comms-card-header">
        <div>
          <h3 class="comms-card-title">Compliance Regimes</h3>
          <p class="comms-card-subtitle">Toggle Active/Disabled status for regulatory regimes.</p>
        </div>
      </div>

      <table class="comms-table">
        <thead>
          <tr>
            <th>Regime</th>
            <th>Applies By</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          @for (regime of Metadata?.Regimes ?? []; track regime.ID) {
            <tr>
              <td>{{ regime.Name }}</td>
              <td>{{ regime.AppliesBy }}</td>
              <td>
                <span
                  class="comms-pill"
                  [class.comms-pill--active]="regime.Status === 'Active'"
                  [class.comms-pill--disabled]="regime.Status !== 'Active'"
                >
                  {{ regime.Status }}
                </span>
              </td>
              <td>
                <button
                  mjButton
                  variant="outline"
                  size="sm"
                  [disabled]="IsBusy(regime.ID)"
                  (click)="ToggleRegimeStatus(regime)"
                >
                  {{ regime.Status === 'Active' ? 'Disable' : 'Activate' }}
                </button>
              </td>
            </tr>
          }
        </tbody>
      </table>
      @if (ErrorMessage) {
        <p class="comms-error-msg">{{ ErrorMessage }}</p>
      }
    </div>

    <div class="comms-card">
      <div class="comms-card-header">
        <div>
          <h3 class="comms-card-title">Jurisdiction Hierarchy</h3>
          <p class="comms-card-subtitle">Expanded JurisdictionMember parent-child tree.</p>
        </div>
      </div>
      @for (node of JurisdictionTree; track node.Jurisdiction.ID + '-' + node.Depth) {
        <div class="comms-tree-row" [style.padding-left.px]="12 + node.Depth * 20">
          <span>
            <i class="fa-solid fa-earth-americas"></i>
            {{ node.Jurisdiction.Name }}
          </span>
          <span class="comms-pill">{{ node.Jurisdiction.Code || 'Region' }}</span>
        </div>
      }
    </div>
  `,
})
export class CommsRegimesJurisdictionsTabComponent extends BaseAngularComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  private _metadata: CommsAdminLoadedMetadata | null = null;

  @Input()
  public set Metadata(value: CommsAdminLoadedMetadata | null) {
    this._metadata = value;
    this.buildJurisdictionTree();
  }
  public get Metadata(): CommsAdminLoadedMetadata | null {
    return this._metadata;
  }

  @Output() public RefreshRequested = new EventEmitter<void>();

  public BusyRegimeId: string | null = null;
  public ErrorMessage = '';
  public JurisdictionTree: JurisdictionTreeNode[] = [];

  public async ToggleRegimeStatus(regime: MJCommunicationComplianceRegimeEntity): Promise<void> {
    this.BusyRegimeId = regime.ID;
    this.ErrorMessage = '';
    this.cdr.markForCheck();

    const previousStatus = regime.Status;
    try {
      regime.Status = previousStatus === 'Active' ? 'Disabled' : 'Active';
      const ok = await regime.Save();
      if (!ok) {
        throw new Error(regime.LatestResult?.CompleteMessage || 'Failed to update regime.');
      }
      this.RefreshRequested.emit();
    } catch (err: unknown) {
      regime.Status = previousStatus;
      this.ErrorMessage = err instanceof Error ? err.message : 'Failed to update regime.';
    } finally {
      this.BusyRegimeId = null;
      this.cdr.markForCheck();
    }
  }

  private buildJurisdictionTree(): void {
    const jurisdictions = this._metadata?.Jurisdictions ?? [];
    const members = this._metadata?.JurisdictionMembers ?? [];
    const jurisdictionsById = IndexByUUID(jurisdictions, (j) => j.ID);
    const membersByGroup = new UUIDMap<MJJurisdictionMemberEntity[]>();
    for (const m of members) {
      const list = membersByGroup.Get(m.GroupJurisdictionID) ?? [];
      list.push(m);
      membersByGroup.Set(m.GroupJurisdictionID, list);
    }

    const childIds = new Set(members.map((m) => m.MemberJurisdictionID.toLowerCase()));
    const roots = jurisdictions.filter((j) => !childIds.has(j.ID.toLowerCase()));
    const out: JurisdictionTreeNode[] = [];
    const visited = new Set<string>();

    const visit = (j: (typeof jurisdictions)[number], depth: number) => {
      const key = `${j.ID.toLowerCase()}:${depth}`;
      if (visited.has(key) || depth > 8) return;
      visited.add(key);
      out.push({ Jurisdiction: j, Depth: depth, Children: [] });
      for (const m of membersByGroup.Get(j.ID) ?? []) {
        const child = jurisdictionsById.Get(m.MemberJurisdictionID);
        if (child) visit(child, depth + 1);
      }
    };

    for (const r of roots) visit(r, 0);
    this.JurisdictionTree = out;
  }

  public IsBusy(id: string): boolean {
    return UUIDsEqual(this.BusyRegimeId, id);
  }
}
