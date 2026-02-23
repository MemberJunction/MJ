import { Component } from '@angular/core';
import { MJAIModelActionsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Model Actions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaimodelactions-form',
    templateUrl: './mjaimodelactions.form.component.html'
})
export class MJAIModelActionsFormComponent extends BaseFormComponent {
    public record!: MJAIModelActionsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'modelConfiguration', sectionName: 'Model Configuration', isExpanded: true },
            { sectionKey: 'actionSettings', sectionName: 'Action Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

