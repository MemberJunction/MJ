import { Component, Input } from '@angular/core';
import { CompositeKey, RunView } from '@memberjunction/core';
import { MJAIAgentRubricEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { DisableLink, LinkDraft, MakeDefaultLink, SortAgentRubrics, type AgentRubricLink } from './agent-rubrics.model';

@Component({
    standalone: false,
    selector: 'mj-agent-rubrics',
    styleUrls: ['./agent-rubrics.component.css'],
    template: `
      <section class="links" aria-label="Linked rubrics">
        <h3><i class="fa-solid fa-link"></i> Linked rubrics</h3>
        @if (Error) { <p class="problem">{{ Error }}</p> }
        @if (Links.length === 0 && !IsLoading) { <p class="empty">This agent has no rubrics.</p> }
        @for (link of Links; track link.ID) {
          <article class="link" [class.link-off]="link.Status === 'Disabled'">
            <div>
              <span class="purpose">{{ link.Purpose }}</span>
              <strong>{{ link.Rubric }}</strong>
              <span class="state">{{ link.Status }}{{ link.IsDefault && link.Status !== 'Disabled' ? ' · Default' : '' }}</span>
            </div>
            <label>Sample rate
              <input type="number" min="0" max="1" step="0.05" [name]="'rate-' + link.ID" [(ngModel)]="link.SampleRate">
            </label>
            <label>Pass threshold
              <input type="number" min="0" max="1" step="0.01" [name]="'pass-' + link.ID" [(ngModel)]="link.PassThreshold">
            </label>
            <label>Max self-check attempts
              <input type="number" min="1" step="1" [name]="'attempts-' + link.ID" [(ngModel)]="link.MaxSelfCheckAttempts">
            </label>
            <label class="wide">Evaluator config
              <textarea [name]="'config-' + link.ID" [(ngModel)]="link.EvaluatorConfig"></textarea>
            </label>
            <label class="check"><input type="checkbox" [name]="'default-' + link.ID" [ngModel]="link.IsDefault === true || link.IsDefault === 1" (ngModelChange)="link.IsDefault = $event"> Default</label>
            <button mjButton variant="primary" size="sm" type="button" (click)="SaveLink(link)">Save</button>
            @if (link.Status !== 'Disabled') {
              <button mjButton variant="outline" size="sm" type="button" (click)="TurnOff(link)">Turn off</button>
            } @else {
              <button mjButton variant="outline" size="sm" type="button" (click)="Enable(link)">Enable</button>
            }
          </article>
        }
      </section>
      <form class="add" (submit)="Add($event)">
        <h3><i class="fa-solid fa-plus"></i> Link a rubric</h3>
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
        <label>Sample rate
          <input type="number" min="0" max="1" step="0.05" name="sampleRate" [(ngModel)]="SampleRate">
        </label>
        <label>Pass threshold
          <input type="number" min="0" max="1" step="0.01" name="passThreshold" [(ngModel)]="PassThreshold">
        </label>
        <label>Max self-check attempts
          <input type="number" min="1" step="1" name="attempts" [(ngModel)]="MaxSelfCheckAttempts">
        </label>
        <label class="wide">Evaluator config
          <textarea name="evaluatorConfig" [(ngModel)]="EvaluatorConfig"></textarea>
        </label>
        <label class="check"><input type="checkbox" [(ngModel)]="IsDefault" name="default"> Default</label>
        <button mjButton variant="primary" size="sm" type="submit" [disabled]="!RubricID">Add rubric</button>
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
    public SampleRate: number | null = 0.1;
    public PassThreshold: number | null = null;
    public MaxSelfCheckAttempts: number | null = null;
    public EvaluatorConfig = '';
    public IsLoading = false;
    public Error = '';
    private loaded = false;

    public async Load(): Promise<void> {
        if (!this.agentID) return;
        this.IsLoading = true;
        this.Error = '';
        try {
            const view = RunView.FromMetadataProvider(this.ProviderToUse);
            const escaped = EscapeSQLString(this.agentID);
            const links = await view.RunView({
                EntityName: 'MJ: AI Agent Rubrics',
                ExtraFilter: `AgentID='${escaped}'`,
                ResultType: 'simple',
                MaxRows: 100,
            }, this.ProviderToUse?.CurrentUser);
            if (!links.Success) throw new Error(links.ErrorMessage || 'Could not load rubric links.');
            this.Links = SortAgentRubrics((links.Results ?? []) as typeof this.Links);
            const rubrics = await view.RunView({
                EntityName: 'MJ: Rubrics',
                ExtraFilter: `Status='Active'`,
                ResultType: 'simple',
                MaxRows: 200,
            }, this.ProviderToUse?.CurrentUser);
            if (!rubrics.Success) throw new Error(rubrics.ErrorMessage || 'Could not load rubrics.');
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
        const draft = LinkDraft({
            purpose: this.Purpose,
            sampleRate: this.SampleRate,
            passThreshold: this.PassThreshold,
            maxSelfCheckAttempts: this.MaxSelfCheckAttempts,
            evaluatorConfig: this.EvaluatorConfig,
            isDefault: this.IsDefault,
        });
        if ('error' in draft) {
            this.Error = draft.error;
            return;
        }
        if (draft.isDefault) await this.clearOtherDefaults(draft.purpose);
        const row = await this.ProviderToUse.GetEntityObject<MJAIAgentRubricEntity>('MJ: AI Agent Rubrics', this.ProviderToUse.CurrentUser);
        row.NewRecord();
        row.AgentID = this.agentID;
        row.RubricID = this.RubricID;
        row.Purpose = draft.purpose;
        row.Status = 'Active';
        row.IsDefault = draft.isDefault;
        row.SampleRate = draft.sampleRate;
        row.PassThreshold = draft.passThreshold;
        row.MaxSelfCheckAttempts = draft.maxSelfCheckAttempts;
        row.EvaluatorConfig = draft.evaluatorConfig;
        if (!await row.Save()) {
            this.Error = row.LatestResult?.Message || 'Could not add the rubric.';
            return;
        }
        this.loaded = false;
        await this.Load();
    }

    public async SaveLink(link: AgentRubricLink): Promise<void> {
        if (!link.ID) return;
        const draft = LinkDraft(linkFields(link));
        if ('error' in draft) {
            this.Error = draft.error;
            return;
        }
        try {
            if (draft.isDefault) await this.clearOtherDefaults(draft.purpose);
            await this.saveLink(link.ID, {
                SampleRate: draft.sampleRate,
                PassThreshold: draft.passThreshold,
                MaxSelfCheckAttempts: draft.maxSelfCheckAttempts,
                EvaluatorConfig: draft.evaluatorConfig,
                IsDefault: draft.isDefault,
            });
            this.Error = '';
            this.loaded = false;
            await this.Load();
        } catch (error) {
            this.Error = error instanceof Error ? error.message : 'Could not update the rubric link.';
        }
    }

    public async Enable(link: AgentRubricLink): Promise<void> {
        if (!link.ID) return;
        await this.saveLink(link.ID, { Status: 'Active' });
        this.loaded = false;
        await this.Load();
    }

    public async TurnOff(link: AgentRubricLink): Promise<void> {
        if (!link.ID) return;
        const turnedOff = DisableLink(link);
        await this.saveLink(link.ID, { Status: turnedOff.Status, IsDefault: turnedOff.IsDefault });
        this.loaded = false;
        await this.Load();
    }

    private async clearOtherDefaults(purpose: string): Promise<void> {
        const next = MakeDefaultLink([...this.Links, { ID: 'pending', Purpose: purpose, Status: 'Active', IsDefault: false }], 'pending');
        for (const row of this.Links) {
            const updated = next.find(item => UUIDsEqual(item.ID, row.ID));
            if (!row.ID || !updated) continue;
            if ((row.IsDefault === true || row.IsDefault === 1) && updated.IsDefault === false) {
                await this.saveLink(row.ID, { IsDefault: false });
            }
        }
    }

    private async saveLink(id: string, fields: {
        Status?: string;
        IsDefault?: boolean | number;
        SampleRate?: number | null;
        PassThreshold?: number | null;
        MaxSelfCheckAttempts?: number | null;
        EvaluatorConfig?: string | null;
    }): Promise<void> {
        if (!this.ProviderToUse) return;
        const row = await this.ProviderToUse.GetEntityObject<MJAIAgentRubricEntity>('MJ: AI Agent Rubrics', this.ProviderToUse.CurrentUser);
        if (!await row.InnerLoad(CompositeKey.FromID(id))) throw new Error('The rubric link was not found.');
        if (fields.Status === 'Active' || fields.Status === 'Disabled') row.Status = fields.Status;
        if (fields.IsDefault === true || fields.IsDefault === 1) row.IsDefault = true;
        else if (fields.IsDefault === false || fields.IsDefault === 0) row.IsDefault = false;
        if ('SampleRate' in fields) row.SampleRate = fields.SampleRate ?? null;
        if ('PassThreshold' in fields) row.PassThreshold = fields.PassThreshold ?? null;
        if ('MaxSelfCheckAttempts' in fields) row.MaxSelfCheckAttempts = fields.MaxSelfCheckAttempts ?? null;
        if ('EvaluatorConfig' in fields) row.EvaluatorConfig = fields.EvaluatorConfig ?? null;
        if (!await row.Save()) throw new Error(row.LatestResult?.Message || 'Could not update the rubric link.');
    }
}

function linkFields(link: AgentRubricLink) {
    return {
        purpose: link.Purpose,
        sampleRate: link.SampleRate,
        passThreshold: link.PassThreshold,
        maxSelfCheckAttempts: link.MaxSelfCheckAttempts,
        evaluatorConfig: link.EvaluatorConfig,
        isDefault: link.IsDefault,
    };
}
