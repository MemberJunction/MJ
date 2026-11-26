import { Component } from '@angular/core';
import { MJTourStepPathEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Tour Step Paths') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtoursteppath-form',
    templateUrl: './mjtoursteppath.form.component.html'
})
export class MJTourStepPathFormComponent extends BaseFormComponent {
    public record!: MJTourStepPathEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'pathEndpoints', sectionName: 'Path Endpoints', isExpanded: true },
            { sectionKey: 'branchingLogic', sectionName: 'Branching Logic', isExpanded: true },
            { sectionKey: 'configuration', sectionName: 'Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

