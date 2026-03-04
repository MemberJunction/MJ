import { Component } from '@angular/core';
import { MJOpenAppEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Open Apps') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjopenapp-form',
    templateUrl: './mjopenapp.form.component.html'
})
export class MJOpenAppFormComponent extends BaseFormComponent {
    public record!: MJOpenAppEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJOpenAppDependenciesOpenAppID', sectionName: 'Open App Dependencies (Open App ID)', isExpanded: false },
            { sectionKey: 'mJOpenAppDependenciesDependsOnAppID', sectionName: 'Open App Dependencies (Depends On App ID)', isExpanded: false },
            { sectionKey: 'mJOpenAppInstallHistories', sectionName: 'Open App Install Histories', isExpanded: false }
        ]);
    }
}

