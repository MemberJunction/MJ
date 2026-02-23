import { Component } from '@angular/core';
import { MJAIModelArchitecturesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Model Architectures') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaimodelarchitectures-form',
    templateUrl: './mjaimodelarchitectures.form.component.html'
})
export class MJAIModelArchitecturesFormComponent extends BaseFormComponent {
    public record!: MJAIModelArchitecturesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'modelArchitectureLink', sectionName: 'Model-Architecture Link', isExpanded: true },
            { sectionKey: 'contributionSettings', sectionName: 'Contribution Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

