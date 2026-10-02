import { Component } from '@angular/core';
import { MJFeaturePipelineTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Feature Pipeline Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjfeaturepipelinetype-form',
    templateUrl: './mjfeaturepipelinetype.form.component.html'
})
export class MJFeaturePipelineTypeFormComponent extends BaseFormComponent {
    public record!: MJFeaturePipelineTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

