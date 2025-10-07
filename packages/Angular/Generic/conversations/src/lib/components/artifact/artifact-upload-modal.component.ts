import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { FileSelectComponent } from '@progress/kendo-angular-upload';
import { ArtifactStateService } from '../../services/artifact-state.service';
import { UserInfo } from '@memberjunction/core';

@Component({
  selector: 'mj-artifact-upload-modal',
  template: `
    <kendo-dialog
      *ngIf="isVisible"
      [title]="'Upload Artifact'"
      [width]="600"
      [height]="500"
      (close)="onCancel()">

      <div class="upload-modal-content">
        <div class="form-group">
          <label for="artifact-name" class="required">Name</label>
          <input
            id="artifact-name"
            kendoTextBox
            [(ngModel)]="artifactName"
            placeholder="Enter artifact name"
            [class.error]="showValidation && !artifactName"
            (keydown.enter)="onSave()"
          />
          <span class="error-message" *ngIf="showValidation && !artifactName">
            Name is required
          </span>
        </div>

        <div class="form-group">
          <label for="artifact-description">Description</label>
          <textarea
            id="artifact-description"
            kendoTextArea
            [(ngModel)]="artifactDescription"
            placeholder="Enter artifact description (optional)"
            rows="3">
          </textarea>
        </div>

        <div class="form-group">
          <label for="artifact-type" class="required">Type</label>
          <kendo-dropdownlist
            id="artifact-type"
            [(ngModel)]="artifactType"
            [data]="artifactTypes"
            [textField]="'text'"
            [valueField]="'value'"
            [class.error]="showValidation && !artifactType">
          </kendo-dropdownlist>
          <span class="error-message" *ngIf="showValidation && !artifactType">
            Type is required
          </span>
        </div>

        <div class="form-group">
          <label class="required">File</label>
          <kendo-fileselect
            #fileSelect
            [multiple]="false"
            [restrictions]="{
              allowedExtensions: getAllowedExtensions(),
              maxFileSize: 10485760
            }"
            (select)="onFileSelect($event)"
            (remove)="onFileRemove()">
          </kendo-fileselect>
          <span class="file-info" *ngIf="selectedFile">
            {{ selectedFile.name }} ({{ formatFileSize(selectedFile.size) }})
          </span>
          <span class="error-message" *ngIf="showValidation && !selectedFile">
            File is required
          </span>
        </div>

        <div class="form-group" *ngIf="collectionId">
          <label>
            <input type="checkbox" kendoCheckBox [(ngModel)]="addToCollection" />
            Add to current collection
          </label>
        </div>

        <div class="error-message" *ngIf="errorMessage">
          {{ errorMessage }}
        </div>

        <div class="loading-indicator" *ngIf="isUploading">
          <kendo-loader type="infinite-spinner" size="medium"></kendo-loader>
          <span>Uploading artifact...</span>
        </div>
      </div>

      <kendo-dialog-actions>
        <button kendoButton [disabled]="isUploading" (click)="onCancel()">Cancel</button>
        <button kendoButton [primary]="true" [disabled]="isUploading" (click)="onSave()">Upload</button>
      </kendo-dialog-actions>
    </kendo-dialog>
  `,
  styles: [`
    .upload-modal-content {
      padding: 20px;
    }

    .form-group {
      margin-bottom: 20px;
    }

    .form-group label {
      display: block;
      margin-bottom: 5px;
      font-weight: 500;
    }

    .form-group label.required::after {
      content: '*';
      color: #d32f2f;
      margin-left: 4px;
    }

    input[kendoTextBox],
    textarea[kendoTextArea],
    kendo-dropdownlist {
      width: 100%;
    }

    .error {
      border-color: #d32f2f;
    }

    .error-message {
      display: block;
      color: #d32f2f;
      font-size: 12px;
      margin-top: 5px;
    }

    .file-info {
      display: block;
      margin-top: 8px;
      font-size: 13px;
      color: #666;
    }

    .loading-indicator {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 15px;
      color: #666;
    }

    kendo-dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 15px 20px;
      border-top: 1px solid #e0e0e0;
    }
  `]
})
export class ArtifactUploadModalComponent {
  @Input() isVisible = false;
  @Input() conversationId?: string;
  @Input() collectionId?: string;
  @Input() currentUser!: UserInfo;
  @Output() uploaded = new EventEmitter<string>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild('fileSelect') fileSelect!: FileSelectComponent;

  artifactName = '';
  artifactDescription = '';
  artifactType = 'document';
  selectedFile: File | null = null;
  addToCollection = true;
  showValidation = false;
  errorMessage = '';
  isUploading = false;

  artifactTypes = [
    { value: 'document', text: 'Document' },
    { value: 'image', text: 'Image' },
    { value: 'code', text: 'Code' },
    { value: 'data', text: 'Data' },
    { value: 'other', text: 'Other' }
  ];

  constructor(private artifactState: ArtifactStateService) {}

  getAllowedExtensions(): string[] {
    const extensionMap: Record<string, string[]> = {
      document: ['.pdf', '.doc', '.docx', '.txt', '.md'],
      image: ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'],
      code: ['.js', '.ts', '.py', '.java', '.cs', '.cpp', '.sql', '.json'],
      data: ['.csv', '.json', '.xml', '.xlsx', '.xls'],
      other: []
    };
    return extensionMap[this.artifactType] || [];
  }

  onFileSelect(event: any): void {
    if (event.files && event.files.length > 0) {
      this.selectedFile = event.files[0].rawFile;
      if (!this.artifactName && this.selectedFile) {
        this.artifactName = this.selectedFile.name.replace(/\.[^/.]+$/, '');
      }
    }
  }

  onFileRemove(): void {
    this.selectedFile = null;
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  async onSave(): Promise<void> {
    this.showValidation = true;
    this.errorMessage = '';

    if (!this.artifactName || !this.artifactType || !this.selectedFile) {
      return;
    }

    this.isUploading = true;

    try {
      const fileContent = await this.readFileAsBase64(this.selectedFile);

      const artifact = await this.artifactState.createArtifact({
        Name: this.artifactName,
        Description: this.artifactDescription || '',
        Type: this.artifactType,
        ConversationID: this.conversationId,
        Content: fileContent,
        FileName: this.selectedFile.name,
        FileSize: this.selectedFile.size,
        MimeType: this.selectedFile.type
      } as any, this.currentUser);

      if (this.collectionId && this.addToCollection) {
        await this.artifactState.addToCollection(
          artifact.ID,
          this.collectionId,
          this.currentUser
        );
      }

      this.uploaded.emit(artifact.ID);
      this.resetForm();
    } catch (error) {
      console.error('Error uploading artifact:', error);
      this.errorMessage = error instanceof Error ? error.message : 'Failed to upload artifact';
    } finally {
      this.isUploading = false;
    }
  }

  onCancel(): void {
    this.cancelled.emit();
    this.resetForm();
  }

  private resetForm(): void {
    this.artifactName = '';
    this.artifactDescription = '';
    this.artifactType = 'document';
    this.selectedFile = null;
    this.addToCollection = true;
    this.showValidation = false;
    this.errorMessage = '';
    this.isVisible = false;
  }

  private readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
}
