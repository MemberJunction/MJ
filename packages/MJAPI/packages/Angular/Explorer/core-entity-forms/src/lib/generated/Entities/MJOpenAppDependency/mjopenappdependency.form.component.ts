import { Component } from '@angular/core';
import { MJOpenAppDependencyEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Open App Dependencies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjopenappdependency-form',
    templateUrl: './mjopenappdependency.form.component.html'
})
export class MJOpenAppDependencyFormComponent extends BaseFormComponent {
    public record!: MJOpenAppDependencyEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

