import { Component } from '@angular/core';
import { MJOAuthAuthServerMetadataCacheEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: O Auth Auth Server Metadata Caches') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjoauthauthservermetadatacache-form',
    templateUrl: './mjoauthauthservermetadatacache.form.component.html'
})
export class MJOAuthAuthServerMetadataCacheFormComponent extends BaseFormComponent {
    public record!: MJOAuthAuthServerMetadataCacheEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

