import { Component } from '@angular/core';
import { MJAIModelModalitiesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Model Modalities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaimodelmodalities-form',
    templateUrl: './mjaimodelmodalities.form.component.html'
})
export class MJAIModelModalitiesFormComponent extends BaseFormComponent {
    public record!: MJAIModelModalitiesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'modelModalityLink', sectionName: 'Model & Modality Link', isExpanded: true },
            { sectionKey: 'capabilitySettings', sectionName: 'Capability Settings', isExpanded: true },
            { sectionKey: 'technicalConstraints', sectionName: 'Technical Constraints', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

