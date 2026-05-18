import { Component } from '@angular/core';
import { MJIntegrationConstraintDiscoveryStateEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Integration Constraint Discovery States') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjintegrationconstraintdiscoverystate-form',
    templateUrl: './mjintegrationconstraintdiscoverystate.form.component.html'
})
export class MJIntegrationConstraintDiscoveryStateFormComponent extends BaseFormComponent {
    public record!: MJIntegrationConstraintDiscoveryStateEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

