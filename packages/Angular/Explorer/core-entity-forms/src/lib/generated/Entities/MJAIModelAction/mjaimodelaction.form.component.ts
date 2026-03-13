import { Component } from '@angular/core';
import { MJAIModelActionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Model Actions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaimodelaction-form',
    templateUrl: './mjaimodelaction.form.component.html'
})
export class MJAIModelActionFormComponent extends BaseFormComponent {
    public record!: MJAIModelActionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'modelConfiguration', sectionName: 'Model Configuration', isExpanded: true },
            { sectionKey: 'actionSettings', sectionName: 'Action Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

