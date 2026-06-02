import { Component } from '@angular/core';
import { MJMCPToolFavoriteEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: MCP Tool Favorites') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmcptoolfavorite-form',
    templateUrl: './mjmcptoolfavorite.form.component.html'
})
export class MJMCPToolFavoriteFormComponent extends BaseFormComponent {
    public record!: MJMCPToolFavoriteEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'favoriteConfiguration', sectionName: 'Favorite Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

