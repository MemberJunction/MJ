import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { ComplianceGateResult, MessageClass } from '@memberjunction/communication-types';
import {
  ExecuteCommsRemoteOp,
  type CommsAdminLoadedMetadata,
  type CommsSimulateGateOpInput,
  type CommsSimulateGateOpOutput,
} from './communications-admin.types';

@Component({
  selector: 'mj-comms-gate-simulator-tab',
  standalone: true,
  imports: [FormsModule, MJButtonDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./communications-admin.css'],
  template: `
    <div class="comms-card">
      <div class="comms-card-header">
        <div>
          <h3 class="comms-card-title">Compliance Gate Simulator</h3>
          <p class="comms-card-subtitle">
            Evaluate Suppressions, Regimes, Preferences, and EnforcementMode before sending.
          </p>
        </div>
        <button mjButton variant="primary" size="sm" [disabled]="IsSimulating || !SelectedSenderId" (click)="RunSimulation()">
          <i class="fa-solid fa-play"></i>
          {{ IsSimulating ? 'Evaluating…' : 'Simulate Gate' }}
        </button>
      </div>

      @if (Metadata) {
        <div class="comms-grid-2">
          <div class="comms-field">
            <label for="sim-sender">Sender</label>
            <select id="sim-sender" class="comms-select" [(ngModel)]="SelectedSenderId">
              @for (s of Metadata.Senders; track s.ID) {
                <option [value]="s.ID">{{ s.Name }} ({{ s.EnforcementMode ?? 'Inherit' }})</option>
              }
            </select>
          </div>

          <div class="comms-field">
            <label for="sim-principal">Principal Type</label>
            <select id="sim-principal" class="comms-select" [(ngModel)]="SelectedPrincipalId">
              <option value="">(None)</option>
              @for (p of Metadata.Principals; track p.ID) {
                <option [value]="p.ID">{{ p.Name }} ({{ p.Entity }})</option>
              }
            </select>
          </div>

          <div class="comms-field">
            <label for="sim-record-id">Principal Record ID (optional)</label>
            <input id="sim-record-id" class="comms-input" type="text" [(ngModel)]="RecordId" placeholder="UUID of principal record" />
          </div>

          <div class="comms-field">
            <label for="sim-pref">Preference (optional)</label>
            <select id="sim-pref" class="comms-select" [(ngModel)]="SelectedPreferenceId">
              <option value="">(No preference)</option>
              @for (pref of Metadata.Preferences; track pref.ID) {
                <option [value]="pref.ID">{{ pref.Name }} [{{ pref.MessageClass }}]</option>
              }
            </select>
          </div>

          <div class="comms-field">
            <label for="sim-class">Message Class</label>
            <select id="sim-class" class="comms-select" [(ngModel)]="MessageClass">
              <option value="Marketing">Marketing</option>
              <option value="Operational">Operational</option>
              <option value="Transactional">Transactional</option>
            </select>
          </div>

          <div class="comms-field">
            <label for="sim-jurisdiction">Recipient Jurisdiction (optional)</label>
            <select id="sim-jurisdiction" class="comms-select" [(ngModel)]="RecipientJurisdictionId">
              <option value="">(Unknown)</option>
              @for (j of Metadata.Jurisdictions; track j.ID) {
                <option [value]="j.ID">{{ j.Name }}</option>
              }
            </select>
          </div>
        </div>
      }
    </div>

    @if (ErrorMessage) {
      <p class="comms-error-msg" role="alert">{{ ErrorMessage }}</p>
    }

    @if (DecisionResult) {
      <div class="comms-card">
        <div class="comms-card-header">
          <div>
            <h3 class="comms-card-title">Compliance Decision</h3>
            @if (DecisionResult.Detail) {
              <p class="comms-card-subtitle">{{ DecisionResult.Detail }}</p>
            }
          </div>
          <span
            class="comms-pill"
            [class.comms-pill--allowed]="DecisionResult.Decision === 'Allowed'"
            [class.comms-pill--blocked]="DecisionResult.Decision === 'Blocked'"
            [class.comms-pill--deferred]="DecisionResult.Decision === 'Deferred'"
          >
            {{ DecisionResult.Decision }}
          </span>
        </div>
        <pre class="comms-json">{{ DecisionJson }}</pre>
      </div>
    }
  `,
})
export class CommsGateSimulatorTabComponent extends BaseAngularComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  private _metadata: CommsAdminLoadedMetadata | null = null;

  @Input()
  public set Metadata(value: CommsAdminLoadedMetadata | null) {
    this._metadata = value;
    if (value && !this.SelectedSenderId && value.Senders.length > 0) {
      this.SelectedSenderId = value.Senders[0].ID;
    }
  }
  public get Metadata(): CommsAdminLoadedMetadata | null {
    return this._metadata;
  }

  public SelectedSenderId = '';
  public SelectedPrincipalId = '';
  public RecordId = '';
  public SelectedPreferenceId = '';
  public MessageClass: MessageClass = 'Marketing';
  public RecipientJurisdictionId = '';
  public IsSimulating = false;
  public ErrorMessage = '';
  public DecisionResult: ComplianceGateResult | null = null;
  public DecisionJson = '';

  public async RunSimulation(): Promise<void> {
    if (!this._metadata || !this.SelectedSenderId) return;

    this.IsSimulating = true;
    this.ErrorMessage = '';
    this.cdr.markForCheck();

    try {
      const payload = await ExecuteCommsRemoteOp<CommsSimulateGateOpInput, CommsSimulateGateOpOutput>(
        this.ProviderToUse,
        'Communications.SimulateComplianceGate',
        {
          SenderID: this.SelectedSenderId,
          PrincipalID: this.SelectedPrincipalId || undefined,
          RecordID: this.RecordId.trim() || undefined,
          PreferenceID: this.SelectedPreferenceId || undefined,
          MessageClass: this.MessageClass,
          RecipientJurisdictionID: this.RecipientJurisdictionId || undefined,
        },
      );
      if (!payload.Success || !payload.ResultJSON) {
        throw new Error(payload.ErrorMessage || 'Server gate simulation failed.');
      }
      this.DecisionResult = JSON.parse(payload.ResultJSON) as ComplianceGateResult;
      this.DecisionJson = payload.ResultJSON;
    } catch (err: unknown) {
      this.ErrorMessage = err instanceof Error ? err.message : 'Simulation failed.';
    } finally {
      this.IsSimulating = false;
      this.cdr.markForCheck();
    }
  }
}
