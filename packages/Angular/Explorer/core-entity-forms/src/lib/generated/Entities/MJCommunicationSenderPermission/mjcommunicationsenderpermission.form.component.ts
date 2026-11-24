import { Component } from '@angular/core';
import { MJCommunicationSenderPermissionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Communication Sender Permissions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommunicationsenderpermission-form',
    templateUrl: './mjcommunicationsenderpermission.form.component.html'
})
export class MJCommunicationSenderPermissionFormComponent extends BaseFormComponent {
    public record!: MJCommunicationSenderPermissionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

