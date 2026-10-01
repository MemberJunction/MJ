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
})
export class MJRubricScaleFormComponentExtended extends MJRubricScaleFormComponent {
    public override record!: MJRubricScaleEntity;
    public Loading = true;
    public Levels: Record<string, unknown>[] = [];

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
}
