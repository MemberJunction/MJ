import { Component } from '@angular/core';
import { ExplorerNavigationItemEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadExplorerNavigationItemDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Explorer Navigation Items') // Tell MemberJunction about this class
@Component({
    selector: 'gen-explorernavigationitem-form',
    templateUrl: './explorernavigationitem.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ExplorerNavigationItemFormComponent extends BaseFormComponent {
    public record!: ExplorerNavigationItemEntity;
} 

export function LoadExplorerNavigationItemFormComponent() {
    LoadExplorerNavigationItemDetailsComponent();
}
