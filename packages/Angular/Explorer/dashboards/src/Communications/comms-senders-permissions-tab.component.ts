import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AgGridAngular } from 'ag-grid-angular';
import type { ColDef, GridOptions } from 'ag-grid-community';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type {
  MJCommunicationSenderEntity,
  MJCommunicationSenderPermissionEntity,
} from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { CommsGridTheme, OpenCommsEntityRecord, type CommsAdminLoadedMetadata, type SenderTreeNode } from './communications-admin.types';

@Component({
  selector: 'mj-comms-senders-permissions-tab',
  standalone: true,
  imports: [FormsModule, MJButtonDirective, AgGridAngular],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./communications-admin.css'],
  template: `
    <div class="comms-grid-2">
      <div class="comms-card">
        <div class="comms-card-header">
          <div>
            <h3 class="comms-card-title">Communication Senders</h3>
            <p class="comms-card-subtitle">Hierarchy of senders and inherited permissions.</p>
          </div>
        </div>
        @for (row of FlattenedTree; track row.Sender.ID) {
          <div
            class="comms-tree-row"
            [class.selected]="IsSelected(row.Sender)"
            [style.padding-left.px]="12 + row.Depth * 20"
            (click)="SelectSender(row.Sender)"
          >
            <span>
              <i class="fa-solid fa-paper-plane"></i>
              {{ row.Sender.Name }}
            </span>
            <span class="comms-pill">{{ row.Sender.EnforcementMode ?? 'Inherit' }}</span>
          </div>
        }
      </div>

      @if (SelectedSender) {
        <div class="comms-card">
          <div class="comms-card-header">
            <div>
              <h3 class="comms-card-title">{{ SelectedSender.Name }}</h3>
              <p class="comms-card-subtitle">Status: {{ SelectedSender.Status }}</p>
            </div>
            <div class="comms-actions-row">
              <button mjButton variant="outline" size="sm" (click)="OpenSenderForm(SelectedSender)">
                Edit in Form
              </button>
              <button mjButton variant="primary" size="sm" [disabled]="IsSaving" (click)="SaveSender()">
                {{ IsSaving ? 'Saving…' : 'Save Sender' }}
              </button>
            </div>
          </div>

          <div class="comms-field">
            <label for="sender-mode">Enforcement Mode</label>
            <select id="sender-mode" class="comms-select" [(ngModel)]="EditEnforcementMode">
              <option value="">Inherit Instance Default</option>
              <option value="Enforce">Enforce</option>
              <option value="Shadow">Shadow</option>
              <option value="Off">Off</option>
            </select>
          </div>

          <div class="comms-field">
            <label for="sender-pref-url">Preference Center URL</label>
            <input id="sender-pref-url" class="comms-input" type="text" [(ngModel)]="EditPreferenceCenterUrl" />
          </div>

          <div class="comms-field">
            <label for="sender-tc">TemplateContext JSON</label>
            <textarea id="sender-tc" class="comms-textarea" [(ngModel)]="EditTemplateContext"></textarea>
          </div>

          @if (StatusMessage) {
            <p class="comms-status-msg">{{ StatusMessage }}</p>
          }
          @if (ErrorMessage) {
            <p class="comms-error-msg">{{ ErrorMessage }}</p>
          }
        </div>
      }
    </div>

    @if (SelectedSender) {
      <div class="comms-card">
        <div class="comms-card-header">
          <div>
            <h3 class="comms-card-title">Sender Permissions</h3>
            <p class="comms-card-subtitle">Grants scoped to {{ SelectedSender.Name }}.</p>
          </div>
        </div>
        @if (SelectedPermissions.length > 0) {
          <ag-grid-angular
            [theme]="GridTheme"
            [columnDefs]="PermissionCols"
            [gridOptions]="GridOptions"
            [rowData]="SelectedPermissions"
          />
        } @else {
          <p class="comms-card-subtitle">No explicit permissions on this sender.</p>
        }
      </div>
    }
  `,
})
export class CommsSendersPermissionsTabComponent extends BaseAngularComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  private _metadata: CommsAdminLoadedMetadata | null = null;

  public readonly GridTheme = CommsGridTheme();
  public readonly GridOptions: GridOptions = { domLayout: 'autoHeight', suppressCellFocus: true };
  public readonly PermissionCols: ColDef[] = [
    {
      field: 'Role',
      headerName: 'Principal (Role / User)',
      flex: 2,
      valueGetter: (p) => {
        const row = p.data as MJCommunicationSenderPermissionEntity | undefined;
        return row?.Role || row?.User || row?.RoleID || row?.UserID || '';
      },
    },
    { field: 'PermissionLevel', headerName: 'Level', flex: 1 },
    { field: 'AppliesToChildSenders', headerName: 'Applies To Children', flex: 1, valueFormatter: (p) => (p.value ? 'Yes' : 'No') },
  ];

  public OpenSenderForm(sender: MJCommunicationSenderEntity): void {
    OpenCommsEntityRecord('MJ: Communication Senders', sender.ID);
  }

  public IsSelected(sender: MJCommunicationSenderEntity): boolean {
    return UUIDsEqual(this.SelectedSender?.ID, sender.ID);
  }

  @Input()
  public set Metadata(value: CommsAdminLoadedMetadata | null) {
    this._metadata = value;
    this.rebuildTree();
  }
  public get Metadata(): CommsAdminLoadedMetadata | null {
    return this._metadata;
  }

  @Output() public RefreshRequested = new EventEmitter<void>();

  public FlattenedTree: SenderTreeNode[] = [];
  public SelectedSender: MJCommunicationSenderEntity | null = null;
  public SelectedPermissions: MJCommunicationSenderPermissionEntity[] = [];
  public EditEnforcementMode = '';
  public EditPreferenceCenterUrl = '';
  public EditTemplateContext = '';
  public IsSaving = false;
  public StatusMessage = '';
  public ErrorMessage = '';

  public SelectSender(sender: MJCommunicationSenderEntity): void {
    this.SelectedSender = sender;
    this.EditEnforcementMode = sender.EnforcementMode ?? '';
    this.EditPreferenceCenterUrl = sender.PreferenceCenterURL ?? '';
    this.EditTemplateContext = sender.TemplateContext ?? '{}';
    this.StatusMessage = '';
    this.ErrorMessage = '';
    this.SelectedPermissions = (this._metadata?.SenderPermissions ?? []).filter((p) =>
      UUIDsEqual(p.CommunicationSenderID, sender.ID),
    );
    this.cdr.markForCheck();
  }

  public async SaveSender(): Promise<void> {
    if (!this.SelectedSender) return;
    this.IsSaving = true;
    this.StatusMessage = '';
    this.ErrorMessage = '';
    this.cdr.markForCheck();

    const prevEnforcementMode = this.SelectedSender.EnforcementMode;
    const prevPreferenceCenterUrl = this.SelectedSender.PreferenceCenterURL;
    const prevTemplateContext = this.SelectedSender.TemplateContext;

    try {
      if (this.EditTemplateContext.trim()) {
        JSON.parse(this.EditTemplateContext);
      }
      this.SelectedSender.EnforcementMode =
        (this.EditEnforcementMode as MJCommunicationSenderEntity['EnforcementMode']) || null;
      this.SelectedSender.PreferenceCenterURL = this.EditPreferenceCenterUrl.trim() || null;
      this.SelectedSender.TemplateContext = this.EditTemplateContext.trim() || null;

      const saved = await this.SelectedSender.Save();
      if (!saved) {
        throw new Error(this.SelectedSender.LatestResult?.CompleteMessage || 'Failed to save sender.');
      }
      this.StatusMessage = 'Sender updated.';
      this.RefreshRequested.emit();
    } catch (err: unknown) {
      this.SelectedSender.EnforcementMode = prevEnforcementMode;
      this.SelectedSender.PreferenceCenterURL = prevPreferenceCenterUrl;
      this.SelectedSender.TemplateContext = prevTemplateContext;
      this.ErrorMessage = err instanceof Error ? err.message : 'Failed to save sender.';
    } finally {
      this.IsSaving = false;
      this.cdr.markForCheck();
    }
  }

  private rebuildTree(): void {
    const senders = this._metadata?.Senders ?? [];
    const roots = senders.filter((s) => !s.ParentSenderID);
    const out: SenderTreeNode[] = [];
    const visit = (node: MJCommunicationSenderEntity, depth: number) => {
      out.push({ Sender: node, Depth: depth, Children: [] });
      for (const child of senders) {
        if (child.ParentSenderID && UUIDsEqual(child.ParentSenderID, node.ID)) {
          visit(child, depth + 1);
        }
      }
    };
    for (const r of roots) visit(r, 0);
    this.FlattenedTree = out;
    if (!this.SelectedSender && out.length > 0) {
      this.SelectSender(out[0].Sender);
    }
  }
}
