import { Component } from '@angular/core';
import { AIModelActionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'AI Model Actions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-aimodelaction-form',
    templateUrl: './aimodelaction.form.component.html'
})
export class AIModelActionFormComponent extends BaseFormComponent {
    public record!: AIModelActionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'modelConfiguration', sectionName: 'Model Configuration', isExpanded: true },
            { sectionKey: 'actionSettings', sectionName: 'Action Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

