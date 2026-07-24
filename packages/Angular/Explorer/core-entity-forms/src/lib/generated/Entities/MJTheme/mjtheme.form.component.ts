import { Component } from '@angular/core';
import { MJThemeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Themes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtheme-form',
    templateUrl: './mjtheme.form.component.html'
})
export class MJThemeFormComponent extends BaseFormComponent {
    public record!: MJThemeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'themeConfiguration', sectionName: 'Theme Configuration', isExpanded: true },
            { sectionKey: 'brandAssets', sectionName: 'Brand Assets', isExpanded: true },
            { sectionKey: 'advancedStyling', sectionName: 'Advanced Styling', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

