import { Component } from '@angular/core';
import { constantcontactemails_xrefsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Emails Xrefs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactemails_xrefs-form',
    templateUrl: './constantcontactemails_xrefs.form.component.html'
})
export class constantcontactemails_xrefsFormComponent extends BaseFormComponent {
    public record!: constantcontactemails_xrefsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

