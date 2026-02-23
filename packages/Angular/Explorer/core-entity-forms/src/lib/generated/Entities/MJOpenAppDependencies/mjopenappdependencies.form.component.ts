import { Component } from '@angular/core';
import { MJOpenAppDependenciesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Open App Dependencies') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjopenappdependencies-form',
    templateUrl: './mjopenappdependencies.form.component.html'
})
export class MJOpenAppDependenciesFormComponent extends BaseFormComponent {
    public record!: MJOpenAppDependenciesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

