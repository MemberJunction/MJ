import { Component } from '@angular/core';
import { ResourceFolderEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadResourceFolderDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Resource Folders') // Tell MemberJunction about this class
@Component({
    selector: 'gen-resourcefolder-form',
    templateUrl: './resourcefolder.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ResourceFolderFormComponent extends BaseFormComponent {
    public record!: ResourceFolderEntity;
} 

export function LoadResourceFolderFormComponent() {
    LoadResourceFolderDetailsComponent();
}
