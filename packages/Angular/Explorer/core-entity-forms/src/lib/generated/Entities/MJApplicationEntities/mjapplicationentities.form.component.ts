import { Component } from '@angular/core';
import { MJApplicationEntitiesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Application Entities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjapplicationentities-form',
    templateUrl: './mjapplicationentities.form.component.html'
})
export class MJApplicationEntitiesFormComponent extends BaseFormComponent {
    public record!: MJApplicationEntitiesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'applicationLinkage', sectionName: 'Application Linkage', isExpanded: true },
            { sectionKey: 'entityDefinition', sectionName: 'Entity Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

