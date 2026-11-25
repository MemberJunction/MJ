import { Component } from '@angular/core';
import { MJLearningPathTourEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Learning Path Tours') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjlearningpathtour-form',
    templateUrl: './mjlearningpathtour.form.component.html'
})
export class MJLearningPathTourFormComponent extends BaseFormComponent {
    public record!: MJLearningPathTourEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'tourMembership', sectionName: 'Tour Membership', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

