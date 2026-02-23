import { Component } from '@angular/core';
import { MJAPIKeyApplicationsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: API Key Applications') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjapikeyapplications-form',
    templateUrl: './mjapikeyapplications.form.component.html'
})
export class MJAPIKeyApplicationsFormComponent extends BaseFormComponent {
    public record!: MJAPIKeyApplicationsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'aPIKeyAssignment', sectionName: 'API Key Assignment', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

