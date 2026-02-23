import { Component } from '@angular/core';
import { MJOpenAppsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Open Apps') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjopenapps-form',
    templateUrl: './mjopenapps.form.component.html'
})
export class MJOpenAppsFormComponent extends BaseFormComponent {
    public record!: MJOpenAppsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJOpenAppDependencies', sectionName: 'MJ: Open App Dependencies', isExpanded: false },
            { sectionKey: 'mJOpenAppDependencies1', sectionName: 'MJ: Open App Dependencies', isExpanded: false },
            { sectionKey: 'mJOpenAppInstallHistories', sectionName: 'MJ: Open App Install Histories', isExpanded: false }
        ]);
    }
}

