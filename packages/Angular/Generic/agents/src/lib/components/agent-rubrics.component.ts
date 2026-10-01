import { Component, Input } from '@angular/core';
import { CompositeKey, RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { disableLink, makeDefaultLink, sortAgentRubrics, type AgentRubricLink } from './agent-rubrics.model';

@Component({
    standalone: false,
    selector: 'mj-agent-rubrics',
    template: `
      @if (Error) { <p>{{ Error }}</p> }
      @if (Links.length === 0 && !IsLoading) { <p>This agent has no rubrics.</p> }
      @for (link of Links; track link.ID) {
        <p>
          {{ link.Purpose }} — {{ link.Rubric }} — {{ link.Status }}{{ link.IsDefault && link.Status !== 'Disabled' ? ' (default)' : '' }}
          @if (link.Status !== 'Disabled') {
            <button type="button" (click)="TurnOff(link)">Turn off</button>
          }
        </p>
      }
      <form (submit)="Add($event)">
        <label>Purpose
          <select [(ngModel)]="Purpose" name="purpose">
            <option>Evaluation</option>
            <option>SelfCheck</option>
            <option>ProductionSampling</option>
          </select>
        </label>
        <label>Rubric
          <select [(ngModel)]="RubricID" name="rubric">
            @for (rubric of RubricOptions; track rubric.ID) {
              <option [value]="rubric.ID">{{ rubric.Name }}</option>
            }
          </select>
        </label>
        <label><input type="checkbox" [(ngModel)]="IsDefault" name="default"> Default</label>
        <button type="submit" [disabled]="!RubricID">Add rubric</button>
      </form>
    `,
})
export class AgentRubricsComponent extends BaseAngularComponent {
    private agentID: string | null = null;
    private active = false;

    @Input()
    public set AgentID(value: string | null) {
        if (value === this.agentID) return;
        this.agentID = value;
        this.loaded = false;
        if (value && this.active) void this.Load();
    }

    @Input()
    public set Active(value: boolean) {
        this.active = value;
        if (value && this.agentID && !this.loaded && !this.IsLoading) void this.Load();
    }

    public Links: AgentRubricLink[] = [];
    public RubricOptions: { ID: string; Name: string }[] = [];
    public Purpose = 'Evaluation';
    public RubricID = '';
    public IsDefault = false;
    public IsLoading = false;
    public Error = '';
    private loaded = false;

    public async Load(): Promise<void> {
        if (!this.agentID) return;
        this.IsLoading = true;
        this.Error = '';
        try {
            const view = this.ProviderToUse ? RunView.FromMetadataProvider(this.ProviderToUse) : new RunView();
            const escaped = this.agentID.replace(/'/g, "''");
            const links = await view.RunView({
                EntityName: 'MJ: AI Agent Rubrics',
                ExtraFilter: `AgentID='${escaped}'`,
                ResultType: 'simple',
                MaxRows: 100,
            }, this.ProviderToUse?.CurrentUser);
            this.Links = sortAgentRubrics((links.Results ?? []) as typeof this.Links);
            const rubrics = await view.RunView({
                EntityName: 'MJ: Rubrics',
                ExtraFilter: `Status='Active'`,
                ResultType: 'simple',
                MaxRows: 200,
            }, this.ProviderToUse?.CurrentUser);
            this.RubricOptions = ((rubrics.Results ?? []) as { ID: string; Name: string }[]).sort((left, right) => left.Name.localeCompare(right.Name));
            if (!this.RubricID && this.RubricOptions[0]) this.RubricID = this.RubricOptions[0].ID;
            this.loaded = true;
        } catch (error) {
            this.Error = (error as Error).message || 'Could not load rubrics.';
        } finally {
            this.IsLoading = false;
        }
    }

    public async Add(event: Event): Promise<void> {
        event.preventDefault();
        if (!this.agentID || !this.RubricID || !this.ProviderToUse) return;
        if (this.IsDefault) await this.clearOtherDefaults(this.Purpose);
        const row = await this.ProviderToUse.GetEntityObject('MJ: AI Agent Rubrics', this.ProviderToUse.CurrentUser);
        row.NewRecord();
        row.Set('AgentID', this.agentID);
        row.Set('RubricID', this.RubricID);
        row.Set('Purpose', this.Purpose);
        row.Set('Status', 'Active');
        row.Set('IsDefault', this.IsDefault);
        if (!await row.Save()) {
            this.Error = row.LatestResult?.Message || 'Could not add the rubric.';
            return;
        }
        this.loaded = false;
        await this.Load();
    }

    public async TurnOff(link: AgentRubricLink): Promise<void> {
        if (!link.ID) return;
        const turnedOff = disableLink(link);
        await this.saveLink(link.ID, { Status: turnedOff.Status, IsDefault: turnedOff.IsDefault });
        this.loaded = false;
        await this.Load();
    }

    private async clearOtherDefaults(purpose: string): Promise<void> {
        const next = makeDefaultLink([...this.Links, { ID: 'pending', Purpose: purpose, Status: 'Active', IsDefault: false }], 'pending');
        for (const row of this.Links) {
            const updated = next.find(item => item.ID === row.ID);
            if (!row.ID || !updated) continue;
            if ((row.IsDefault === true || row.IsDefault === 1) && updated.IsDefault === false) {
                await this.saveLink(row.ID, { IsDefault: false });
            }
        }
    }

    private async saveLink(id: string, fields: Record<string, unknown>): Promise<void> {
        if (!this.ProviderToUse) return;
        const row = await this.ProviderToUse.GetEntityObject('MJ: AI Agent Rubrics', this.ProviderToUse.CurrentUser);
        await row.InnerLoad(CompositeKey.FromID(id));
        for (const [field, value] of Object.entries(fields)) row.Set(field, value);
        if (!await row.Save()) throw new Error(row.LatestResult?.Message || 'Could not update the rubric link.');
    }
}
