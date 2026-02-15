import { Component } from '@angular/core';
import { MJAPIKeyApplicationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: API Key Applications') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjapikeyapplication-form',
    templateUrl: './mjapikeyapplication.form.component.html'
})
export class MJAPIKeyApplicationFormComponent extends BaseFormComponent {
    public record!: MJAPIKeyApplicationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'aPIKeyAssignment', sectionName: 'API Key Assignment', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

