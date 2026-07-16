import { Component } from '@angular/core';
import { constantcontactemail_reports_linksEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Email Reports Links') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-constantcontactemail_reports_links-form',
    templateUrl: './constantcontactemail_reports_links.form.component.html'
})
export class constantcontactemail_reports_linksFormComponent extends BaseFormComponent {
    public record!: constantcontactemail_reports_linksEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

