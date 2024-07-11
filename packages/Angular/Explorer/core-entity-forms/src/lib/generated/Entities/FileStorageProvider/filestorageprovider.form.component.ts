import { Component } from '@angular/core';
import { FileStorageProviderEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadFileStorageProviderDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'File Storage Providers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-filestorageprovider-form',
    templateUrl: './filestorageprovider.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class FileStorageProviderFormComponent extends BaseFormComponent {
    public record!: FileStorageProviderEntity;
} 

export function LoadFileStorageProviderFormComponent() {
    LoadFileStorageProviderDetailsComponent();
}
