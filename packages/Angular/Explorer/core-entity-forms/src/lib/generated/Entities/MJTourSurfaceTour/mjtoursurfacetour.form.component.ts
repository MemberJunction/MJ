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
            { sectionKey: 'assignmentDetails', sectionName: 'Assignment Details', isExpanded: true },
            { sectionKey: 'configuration', sectionName: 'Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

