import { Component } from '@angular/core';
import { MJAPIKeyScopesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: API Key Scopes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjapikeyscopes-form',
    templateUrl: './mjapikeyscopes.form.component.html'
})
export class MJAPIKeyScopesFormComponent extends BaseFormComponent {
    public record!: MJAPIKeyScopesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'keyScopeMapping', sectionName: 'Key Scope Mapping', isExpanded: true },
            { sectionKey: 'accessRules', sectionName: 'Access Rules', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

