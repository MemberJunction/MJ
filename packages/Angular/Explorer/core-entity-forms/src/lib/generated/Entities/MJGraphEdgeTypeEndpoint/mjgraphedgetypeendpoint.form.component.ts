import { Component } from '@angular/core';
import { MJGraphEdgeTypeEndpointEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Graph Edge Type Endpoints') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjgraphedgetypeendpoint-form',
    templateUrl: './mjgraphedgetypeendpoint.form.component.html'
})
export class MJGraphEdgeTypeEndpointFormComponent extends BaseFormComponent {
    public record!: MJGraphEdgeTypeEndpointEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'endpointConfiguration', sectionName: 'Endpoint Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

