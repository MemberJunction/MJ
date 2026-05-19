import { Component } from '@angular/core';
import { MJSearchProviderEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Search Providers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjsearchprovider-form',
    templateUrl: './mjsearchprovider.form.component.html'
})
export class MJSearchProviderFormComponent extends BaseFormComponent {
    public record!: MJSearchProviderEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'providerIdentity', sectionName: 'Provider Identity', isExpanded: true },
            { sectionKey: 'searchBehavior', sectionName: 'Search Behavior', isExpanded: true },
            { sectionKey: 'configurationSecurity', sectionName: 'Configuration & Security', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJSearchScopeProviders', sectionName: 'Search Scope Providers', isExpanded: false }
        ]);
    }
}

