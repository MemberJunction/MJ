import { Component } from '@angular/core';
import { MJTourSurfaceTourEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Tour Surface Tours') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtoursurfacetour-form',
    templateUrl: './mjtoursurfacetour.form.component.html'
})
export class MJTourSurfaceTourFormComponent extends BaseFormComponent {
    public record!: MJTourSurfaceTourEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'relationships', sectionName: 'Relationships', isExpanded: true },
            { sectionKey: 'assignmentConfiguration', sectionName: 'Assignment Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

