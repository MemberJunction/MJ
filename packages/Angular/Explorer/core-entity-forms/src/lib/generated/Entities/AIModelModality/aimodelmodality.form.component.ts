import { Component } from '@angular/core';
import { AIModelModalityEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Model Modalities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-aimodelmodality-form',
    templateUrl: './aimodelmodality.form.component.html'
})
export class AIModelModalityFormComponent extends BaseFormComponent {
    public record!: AIModelModalityEntity;

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

export function LoadAIModelModalityFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
