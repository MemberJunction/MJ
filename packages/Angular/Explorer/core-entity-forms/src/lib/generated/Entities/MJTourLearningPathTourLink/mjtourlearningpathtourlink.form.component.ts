import { Component } from '@angular/core';
import { MJTourLearningPathTourLinkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Tour Learning Path Tour Links') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtourlearningpathtourlink-form',
    templateUrl: './mjtourlearningpathtourlink.form.component.html'
})
export class MJTourLearningPathTourLinkFormComponent extends BaseFormComponent {
    public record!: MJTourLearningPathTourLinkEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'relationships', sectionName: 'Relationships', isExpanded: true },
            { sectionKey: 'tourConfiguration', sectionName: 'Tour Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

