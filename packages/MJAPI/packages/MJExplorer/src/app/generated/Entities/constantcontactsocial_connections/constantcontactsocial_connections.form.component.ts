import { Component } from '@angular/core';
import { constantcontactsocial_connectionsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Social Connections') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactsocial_connections-form',
    templateUrl: './constantcontactsocial_connections.form.component.html'
})
export class constantcontactsocial_connectionsFormComponent extends BaseFormComponent {
    public record!: constantcontactsocial_connectionsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

