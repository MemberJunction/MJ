import { Component } from '@angular/core';
import { MJSearchScopeExternalIndexEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Search Scope External Indexes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjsearchscopeexternalindex-form',
    templateUrl: './mjsearchscopeexternalindex.form.component.html'
})
export class MJSearchScopeExternalIndexFormComponent extends BaseFormComponent {
    public record!: MJSearchScopeExternalIndexEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'scopeIdentification', sectionName: 'Scope Identification', isExpanded: true },
            { sectionKey: 'indexConfiguration', sectionName: 'Index Configuration', isExpanded: true },
            { sectionKey: 'advancedSettings', sectionName: 'Advanced Settings', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

