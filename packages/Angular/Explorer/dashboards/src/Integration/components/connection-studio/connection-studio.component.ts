import { Component, OnInit, inject } from '@angular/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { IntegrationDataService, SourceTypeRow } from '../../services/integration-data.service';

interface StepDef {
  Index: number;
  Label: string;
}

interface ConnectionFormData {
  Name: string;
  Description: string;
  APIBaseURL: string;
  APIKey: string;
  Server: string;
  DatabaseName: string;
  Username: string;
  Password: string;
  StoragePath: string;
  FileType: string;
}

interface DropdownItem {
  text: string;
  value: string;
}

type ConfigModeType = 'api' | 'database' | 'file';
type TestStatusType = 'idle' | 'testing' | 'success' | 'failed';

@RegisterClass(BaseResourceComponent, 'IntegrationConnectionStudio')
@Component({
  standalone: false,
  selector: 'app-connection-studio',
  templateUrl: './connection-studio.component.html',
  styles: [`
    .connection-studio { padding: 24px; max-width: 800px; margin: 0 auto; }
    .studio-header {
      margin-bottom: 24px;
      h2 {
        margin: 0; font-size: 20px; font-weight: 600;
        i { margin-right: 8px; }
      }
    }

    .step-indicator {
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 32px; gap: 0;
    }
    .step {
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      min-width: 80px;
    }
    .step-circle {
      width: 32px; height: 32px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 600;
      background: #e0e0e0; color: #666;
    }
    .step.active .step-circle { background: #4a6cf7; color: #fff; }
    .step.completed .step-circle { background: #1b7a3d; color: #fff; }
    .step-label { font-size: 12px; color: #888; }
    .step.active .step-label { color: #4a6cf7; font-weight: 600; }
    .step-connector {
      flex: 1; height: 2px; background: #e0e0e0;
      min-width: 40px; margin: 0 4px; margin-bottom: 22px;
    }
    .step-connector.completed { background: #1b7a3d; }

    .step-content { }
    .step-content h3 { margin: 0 0 4px 0; font-size: 18px; }
    .step-description { color: #666; margin: 0 0 20px 0; }

    .source-type-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 12px; margin-bottom: 24px;
    }
    .source-type-card {
      padding: 20px 16px; border: 2px solid #eee; border-radius: 8px;
      text-align: center; cursor: pointer; transition: all 0.15s;
      display: flex; flex-direction: column; align-items: center; gap: 8px;
    }
    .source-type-card:hover { border-color: #4a6cf7; }
    .source-type-card.selected { border-color: #4a6cf7; background: #f0f4ff; }
    .source-type-card i { font-size: 28px; color: #4a6cf7; }
    .st-name { font-weight: 600; font-size: 14px; }
    .st-desc { font-size: 11px; color: #888; }

    .config-form { display: flex; flex-direction: column; gap: 16px; margin-bottom: 24px; }
    .form-field {
      display: flex; flex-direction: column; gap: 4px;
      label { font-size: 13px; font-weight: 600; color: #444; }
    }

    .step-actions {
      display: flex; gap: 8px; padding-top: 16px;
      border-top: 1px solid #eee;
    }

    .test-section { margin-bottom: 24px; }
    .test-summary {
      background: #f8f9fa; border-radius: 8px; padding: 16px;
      margin-bottom: 16px;
    }
    .summary-row {
      display: flex; gap: 8px; padding: 4px 0; font-size: 14px;
      .label { font-weight: 600; min-width: 100px; color: #666; }
    }
    .test-hint { color: #888; font-style: italic; }
    .test-result {
      padding: 12px 16px; border-radius: 8px; font-weight: 500;
      i { margin-right: 8px; }
    }
    .test-result.success { background: #e6f9ed; color: #1b7a3d; }
    .test-result.failed { background: #fde8e8; color: #c62828; }
  `]
})
export class ConnectionStudioComponent extends BaseResourceComponent implements OnInit {
  /**
   * The Provider @Input is inherited from BaseAngularComponent.
   * Use this.RunViewToUse to get the appropriate IRunViewProvider
   * for multi-MJ-instance support.
   */

  Steps: StepDef[] = [
    { Index: 0, Label: 'Source Type' },
    { Index: 1, Label: 'Configure' },
    { Index: 2, Label: 'Test & Save' }
  ];

  CurrentStep = 0;
  SourceTypes: SourceTypeRow[] = [];
  IsLoadingSourceTypes = false;
  SelectedSourceTypeID: string | null = null;
  TestStatus: TestStatusType = 'idle';

  FormData: ConnectionFormData = {
    Name: '', Description: '',
    APIBaseURL: '', APIKey: '',
    Server: '', DatabaseName: '', Username: '', Password: '',
    StoragePath: '', FileType: 'csv'
  };

  FileTypeOptions: DropdownItem[] = [
    { text: 'CSV', value: 'csv' },
    { text: 'Excel', value: 'excel' }
  ];

  private dataService = inject(IntegrationDataService);

  async ngOnInit(): Promise<void> {
    await this.LoadSourceTypes();
  }

  get SelectedSourceTypeName(): string {
    return this.SourceTypes.find(st => UUIDsEqual(st.ID, this.SelectedSourceTypeID))?.Name ?? '';
  }

  get ConfigMode(): ConfigModeType {
    const name = this.SelectedSourceTypeName.toLowerCase();
    if (name.includes('file') || name.includes('csv') || name.includes('excel')) return 'file';
    if (name.includes('database') || name.includes('sql') || name.includes('relational')) return 'database';
    return 'api';
  }

  get IsFormValid(): boolean {
    if (!this.FormData.Name.trim()) return false;
    if (this.ConfigMode === 'api') return !!this.FormData.APIBaseURL.trim();
    if (this.ConfigMode === 'database') return !!this.FormData.Server.trim() && !!this.FormData.DatabaseName.trim();
    if (this.ConfigMode === 'file') return !!this.FormData.StoragePath.trim();
    return true;
  }

  async LoadSourceTypes(): Promise<void> {
    this.IsLoadingSourceTypes = true;
    try {
      this.SourceTypes = await this.dataService.LoadSourceTypes(this.RunViewToUse);
    } finally {
      this.IsLoadingSourceTypes = false;
    }
  }

  SelectSourceType(st: SourceTypeRow): void {
    this.SelectedSourceTypeID = st.ID;
  }

  NextStep(): void {
    if (this.CurrentStep < this.Steps.length - 1) {
      this.CurrentStep++;
    }
  }

  PrevStep(): void {
    if (this.CurrentStep > 0) {
      this.CurrentStep--;
      this.TestStatus = 'idle';
    }
  }

  TestConnection(): void {
    this.TestStatus = 'testing';
    console.log('[ConnectionStudio] Testing connection with config:', this.FormData);
    // Placeholder -- simulate async test
    setTimeout(() => {
      this.TestStatus = 'success';
    }, 1500);
  }

  SaveIntegration(): void {
    console.log('[ConnectionStudio] Saving integration:', {
      sourceTypeID: this.SelectedSourceTypeID,
      formData: this.FormData
    });
  }

  IsSelectedSourceType(id: string): boolean {
    return UUIDsEqual(this.SelectedSourceTypeID, id);
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Connection Studio';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-wand-magic-sparkles';
  }
}

export function LoadConnectionStudio(): void {
  // Tree-shaking prevention
}
