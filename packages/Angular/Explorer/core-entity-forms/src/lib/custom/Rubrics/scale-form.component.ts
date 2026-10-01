import { Component } from '@angular/core';
import { CompositeKey, RunView } from '@memberjunction/core';
import { MJRubricScaleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { MJRubricScaleFormComponent } from '../../generated/Entities/MJRubricScale/mjrubricscale.form.component';

/** Scale form. Loads the levels and saves a label edit. */
@RegisterClass(BaseFormComponent, 'MJ: Rubric Scales')
@Component({
    standalone: false,
    selector: 'mj-rubric-scale-form',
    templateUrl: './scale-form.component.html',
    styleUrls: ['./scale-form.component.css'],
})
export class MJRubricScaleFormComponentExtended extends MJRubricScaleFormComponent {
    public override record!: MJRubricScaleEntity;
    public Loading = true;
    public Frozen = false;
    public Levels: Record<string, unknown>[] = [];

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
            this.Levels = (result.Results ?? []) as Record<string, unknown>[];
            const used = await view.RunView({
                EntityName: 'MJ: Rubric Criteria',
                ExtraFilter: `ScaleID='${this.record.ID}'`,
                ResultType: 'simple',
                MaxRows: 50,
            }, this.ProviderToUse.CurrentUser);
            const versionIds = [...new Set(((used.Results ?? []) as { RubricVersionID?: string }[]).map(row => row.RubricVersionID).filter((id): id is string => !!id))];
            const published = versionIds.length === 0 ? { Results: [] } : await view.RunView({
                EntityName: 'MJ: Rubric Versions',
                ExtraFilter: `Status='Published' AND ID IN (${versionIds.map(id => `'${id}'`).join(',')})`,
                ResultType: 'simple',
                MaxRows: 1,
            }, this.ProviderToUse.CurrentUser);
            this.Frozen = (published.Results ?? []).length > 0;
        } finally {
            this.Loading = false;
        }
    }

    public async OnLabel(level: Record<string, unknown>, event: Event): Promise<void> {
        const label = (event.target as HTMLInputElement).value;
        const row = await this.ProviderToUse.GetEntityObject('MJ: Rubric Scale Levels', this.ProviderToUse.CurrentUser);
        await row.InnerLoad(CompositeKey.FromID(String(level.ID)));
        row.Set('Label', label);
        await row.Save();
        level.Label = label;
    }

    public async OnDescription(level: Record<string, unknown>, event: Event): Promise<void> {
        const description = (event.target as HTMLInputElement).value;
        const row = await this.ProviderToUse.GetEntityObject('MJ: Rubric Scale Levels', this.ProviderToUse.CurrentUser);
        await row.InnerLoad(CompositeKey.FromID(String(level.ID)));
        row.Set('Description', description);
        await row.Save();
        level.Description = description;
    }
}
