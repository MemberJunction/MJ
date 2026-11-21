import { Component } from '@angular/core';
import { MJGraphAuthorityTierEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Graph Authority Tiers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjgraphauthoritytier-form',
    templateUrl: './mjgraphauthoritytier.form.component.html'
})
export class MJGraphAuthorityTierFormComponent extends BaseFormComponent {
    public record!: MJGraphAuthorityTierEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJGraphConcepts', sectionName: 'Graph Concepts', isExpanded: false }
        ]);
    }
}

