import { Component } from '@angular/core';
import { YourMembershipConnectionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Connections') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipconnection-form',
    templateUrl: './yourmembershipconnection.form.component.html'
})
export class YourMembershipConnectionFormComponent extends BaseFormComponent {
    public record!: YourMembershipConnectionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'connectionOverview', sectionName: 'Connection Overview', isExpanded: true },
            { sectionKey: 'professionalContact', sectionName: 'Professional & Contact', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

