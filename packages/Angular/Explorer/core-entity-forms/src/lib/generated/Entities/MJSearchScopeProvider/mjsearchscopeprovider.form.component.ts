import { Component } from '@angular/core';
import { MJSearchScopeProviderEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Search Scope Providers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjsearchscopeprovider-form',
    templateUrl: './mjsearchscopeprovider.form.component.html'
})
export class MJSearchScopeProviderFormComponent extends BaseFormComponent {
    public record!: MJSearchScopeProviderEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'providerAssociation', sectionName: 'Provider Association', isExpanded: true },
            { sectionKey: 'configurationSettings', sectionName: 'Configuration Settings', isExpanded: true },
            { sectionKey: 'queryTransformation', sectionName: 'Query Transformation', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

