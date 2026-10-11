import { Component } from '@angular/core';
import { CompositeKey, RunView } from '@memberjunction/core';
import { MJRubricScaleEntity, MJRubricScaleLevelEntity } from '@memberjunction/core-entities';
import { RegisterClass, RegisterClassEx } from '@memberjunction/global';
import { BaseFormComponent, BaseFormPanel, BaseFormPolicy, BaseFormsModule, type FormChromeContext, type FormChromeSpec } from '@memberjunction/ng-base-forms';
import { MJRubricScaleFormComponent } from '../../generated/Entities/MJRubricScale/mjrubricscale.form.component';

/** Scale form. Loads the levels and saves a label edit. */
@RegisterClass(BaseFormComponent, 'MJ: Rubric Scales')
@Component({
    standalone: false,
    selector: 'mj-rubric-scale-form',
    templateUrl: '../../generated/Entities/MJRubricScale/mjrubricscale.form.component.html',
})
export class MJRubricScaleFormComponentExtended extends MJRubricScaleFormComponent {
    public override record!: MJRubricScaleEntity;
    public Loading = true;
    public Frozen = false;
    public Levels: Record<string, unknown>[] = [];
    public Message = '';

    public get RangeMin(): string {
        const values = this.Levels.map(level => Number(level.Value)).filter(value => Number.isFinite(value));
        return values.length ? String(Math.min(...values)) : '';
    }

    public get RangeMax(): string {
        const values = this.Levels.map(level => Number(level.Value)).filter(value => Number.isFinite(value));
        return values.length ? String(Math.max(...values)) : '';
    }

    public override async ngOnInit(): Promise<void> {
        await super.ngOnInit();
        await this.LoadLevels();
    }

    public async LoadLevels(): Promise<void> {
        this.Loading = true;
        try {
            const view = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await view.RunView({
                EntityName: 'MJ: Rubric Scale Levels',
                ExtraFilter: `ScaleID='${this.record.ID}'`,
                ResultType: 'simple',
                MaxRows: 200,
            }, this.ProviderToUse.CurrentUser);
            if (!result.Success) {
                this.Message = result.ErrorMessage || 'Could not load the scale levels.';
                return;
            }
            this.Levels = (result.Results ?? []) as Record<string, unknown>[];
            const used = await view.RunView({
                EntityName: 'MJ: Rubric Criteria',
                ExtraFilter: `ScaleID='${this.record.ID}'`,
                ResultType: 'simple',
                MaxRows: 50,
            }, this.ProviderToUse.CurrentUser);
            if (!used.Success) {
                this.Message = used.ErrorMessage || 'Could not load criteria that use this scale.';
                return;
            }
            const versionIds = [...new Set(((used.Results ?? []) as { RubricVersionID?: string }[]).map(row => row.RubricVersionID).filter((id): id is string => !!id))];
            const published = versionIds.length === 0 ? { Success: true, Results: [] as unknown[] } : await view.RunView({
                EntityName: 'MJ: Rubric Versions',
                ExtraFilter: `Status='Published' AND ID IN (${versionIds.map(id => `'${id}'`).join(',')})`,
                ResultType: 'simple',
                MaxRows: 1,
            }, this.ProviderToUse.CurrentUser);
            if (!published.Success) {
                const message = 'ErrorMessage' in published ? published.ErrorMessage : '';
                this.Message = message || 'Could not check whether this scale is published.';
                return;
            }
            this.Frozen = (published.Results ?? []).length > 0;
        } finally {
            this.Loading = false;
        }
    }

    public async OnLabel(level: Record<string, unknown>, event: Event): Promise<void> {
        const label = (event.target as HTMLInputElement).value;
        const row = await this.level(String(level.ID));
        if (!row) return;
        row.Label = label;
        if (!await row.Save()) {
            this.Message = row.LatestResult?.Message || 'Could not save the label.';
            return;
        }
        level.Label = label;
        this.Message = '';
    }

    public async OnDescription(level: Record<string, unknown>, event: Event): Promise<void> {
        const description = (event.target as HTMLInputElement).value;
        const row = await this.level(String(level.ID));
        if (!row) return;
        row.Description = description;
        if (!await row.Save()) {
            this.Message = row.LatestResult?.Message || 'Could not save the description.';
            return;
        }
        level.Description = description;
        this.Message = '';
    }

    private async level(id: string): Promise<MJRubricScaleLevelEntity | null> {
        const row = await this.ProviderToUse.GetEntityObject<MJRubricScaleLevelEntity>('MJ: Rubric Scale Levels', this.ProviderToUse.CurrentUser);
        const loaded = await row.InnerLoad(CompositeKey.FromID(id));
        if (!loaded) {
            this.Message = 'The scale level was not found.';
            return null;
        }
        return row;
    }
}

/** The scale record uses the left-nav rail. The level editor is its own item. */
@RegisterClassEx(BaseFormPolicy, { key: 'MJ: Rubric Scales', metadata: { entity: 'MJ: Rubric Scales' } })
export class RubricScaleFormPolicy extends BaseFormPolicy {
    public override DecorateChrome(spec: FormChromeSpec, _ctx: FormChromeContext): FormChromeSpec {
        return { ...spec, Layout: 'left-nav' };
    }
}

@RegisterClassEx(BaseFormPanel, {
    key: 'form-panel:MJRubricScales:levels',
    metadata: {
        entity: 'MJ: Rubric Scales',
        slot: 'before-fields',
        sortKey: 100,
        contributionKey: 'rubric-scale-levels',
        inclusion: 'Primary',
        leadsWhenUnsaved: true,
    },
})
@Component({
    selector: 'mj-rubric-scale-levels-panel',
    standalone: true,
    imports: [BaseFormsModule],
    styleUrls: ['./scale-form.component.css'],
    templateUrl: './scale-form.component.html',
})
export class RubricScaleLevelsPanel extends BaseFormPanel<MJRubricScaleEntity> {
    public get Form(): MJRubricScaleFormComponentExtended {
        return this.FormComponent as MJRubricScaleFormComponentExtended;
    }
}
