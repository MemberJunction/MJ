import { Component } from '@angular/core';
import { ActionResultCodeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Action Result Codes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-actionresultcode-form',
    templateUrl: './actionresultcode.form.component.html'
})
export class ActionResultCodeFormComponent extends BaseFormComponent {
    public record!: ActionResultCodeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'actionMapping', sectionName: 'Action Mapping', isExpanded: true },
            { sectionKey: 'resultCodeDetails', sectionName: 'Result Code Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

