import { Component } from '@angular/core';
import { Rider_StatsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Rider _ Stats') // Tell MemberJunction about this class
@Component({
    selector: 'gen-rider_stats-form',
    templateUrl: './rider_stats.form.component.html'
})
export class Rider_StatsFormComponent extends BaseFormComponent {
    public record!: Rider_StatsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadRider_StatsFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
