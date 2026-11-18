import { Component } from '@angular/core';
import { MJvwLatestFeatureValuesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Latest Feature Values') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjvwlatestfeaturevalues-form',
    templateUrl: './mjvwlatestfeaturevalues.form.component.html'
})
export class MJvwLatestFeatureValuesFormComponent extends BaseFormComponent {
    public record!: MJvwLatestFeatureValuesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'recordContext', sectionName: 'Record Context', isExpanded: true },
            { sectionKey: 'featureDetails', sectionName: 'Feature Details', isExpanded: true },
            { sectionKey: 'pipelineProvenance', sectionName: 'Pipeline Provenance', isExpanded: true },
            { sectionKey: 'featureValues', sectionName: 'Feature Values', isExpanded: true }
        ]);
    }
}

