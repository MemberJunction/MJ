import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData, MJCredentialEntity, MJCompanyIntegrationEntity, MJCompanyEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { CredentialDialogResult } from '@memberjunction/ng-credentials';
import {
  IntegrationDataService,
  IntegrationDefinitionRow,
  SourceTypeRow
} from '../../services/integration-data.service';

interface StepDef {
  Index: number;
  Label: string;
}

type TestStatusType = 'idle' | 'testing' | 'success' | 'failed';

/** Icon mapping for known integrations by name pattern */
const INTEGRATION_ICONS: Record<string, string> = {
  hubspot: 'fa-brands fa-hubspot',
  salesforce: 'fa-brands fa-salesforce',
  yourmembership: 'fa-solid fa-id-card-clip',
  csv: 'fa-solid fa-file-csv',
  excel: 'fa-solid fa-file-excel',
  file: 'fa-solid fa-file-import',
};

function resolveIntegrationIcon(name: string): string {
  const lower = name.toLowerCase();
  for (const [pattern, icon] of Object.entries(INTEGRATION_ICONS)) {
    if (lower.includes(pattern)) return icon;
  }
  return 'fa-solid fa-plug';
}

@RegisterClass(BaseResourceComponent, 'IntegrationConnectionStudio')
@Component({
  standalone: false,
  selector: 'app-connection-studio',
  templateUrl: './connection-studio.component.html',
  styleUrls: ['./connection-studio.component.css']
})
export class ConnectionStudioComponent extends BaseResourceComponent implements OnInit {

  Steps: StepDef[] = [
    { Index: 0, Label: 'Integration' },
    { Index: 1, Label: 'Configure' },
    { Index: 2, Label: 'Test & Save' }
  ];

  CurrentStep = 0;

  // Step 1: Integration selection
  Integrations: IntegrationDefinitionRow[] = [];
  SourceTypes: SourceTypeRow[] = [];
  IsLoadingIntegrations = false;
  SelectedIntegrationID: string | null = null;
  UseCustomMode = false;
  CustomSourceTypeID: string | null = null;

  // Company selection
  Companies: Array<{ ID: string; Name: string }> = [];
  SelectedCompanyID: string | null = null;
  NewCompanyName = '';
  IsCreatingCompany = false;

  // Step 2: Configuration
  ConnectionName = '';
  ConnectionDescription = '';
  SelectedCredential: MJCredentialEntity | null = null;
  CredentialTypeName = '';
  ShowCredentialDialog = false;
  PreselectedCredentialTypeId: string | undefined;
  CredentialPickerMode: 'choose' | 'existing' | 'new' = 'choose';
  ExistingCredentials: MJCredentialEntity[] = [];
  IsLoadingCredentials = false;

  // Step 3: Test & Save
  TestStatus: TestStatusType = 'idle';
  TestMessage = '';
  IsSaving = false;
  SaveCompleted = false;
  SaveError = '';

  private dataService = inject(IntegrationDataService);
  private cdr = inject(ChangeDetectorRef);

  async ngOnInit(): Promise<void> {
    await this.LoadIntegrations();
  }

  // --- Computed properties ---

  get SelectedIntegration(): IntegrationDefinitionRow | null {
    if (!this.SelectedIntegrationID) return null;
    return this.Integrations.find(i => UUIDsEqual(i.ID, this.SelectedIntegrationID)) ?? null;
  }

  get SelectedIntegrationName(): string {
    if (this.UseCustomMode) return 'Custom Integration';
    return this.SelectedIntegration?.Name ?? '';
  }

  get SelectedIntegrationIcon(): string {
    if (this.UseCustomMode) {
      const st = this.SourceTypes.find(s => UUIDsEqual(s.ID, this.CustomSourceTypeID));
      return st?.IconClass ?? 'fa-solid fa-gear';
    }
    return this.SelectedIntegration ? resolveIntegrationIcon(this.SelectedIntegration.Name) : 'fa-solid fa-plug';
  }

  get CustomSourceTypeName(): string {
    if (!this.CustomSourceTypeID) return '';
    return this.SourceTypes.find(s => UUIDsEqual(s.ID, this.CustomSourceTypeID))?.Name ?? '';
  }

  get IsStep1Valid(): boolean {
    if (this.UseCustomMode) return !!this.CustomSourceTypeID;
    return !!this.SelectedIntegrationID;
  }

  get IsStep2Valid(): boolean {
    return !!this.ConnectionName.trim() && !!this.SelectedCompanyID;
  }

  // --- Data loading ---

  async LoadIntegrations(): Promise<void> {
    this.IsLoadingIntegrations = true;
    this.cdr.detectChanges();
    try {
      const rv = new RunView();
      const [integrations, sourceTypes, companyResult] = await Promise.all([
        this.dataService.LoadIntegrationDefinitions(this.RunViewToUse),
        this.dataService.LoadSourceTypes(this.RunViewToUse),
        rv.RunView<{ ID: string; Name: string }>({
          EntityName: 'MJ: Companies',
          Fields: ['ID', 'Name'],
          OrderBy: 'Name',
          ResultType: 'simple'
        })
      ]);
      this.Integrations = integrations;
      this.SourceTypes = sourceTypes;
      this.Companies = companyResult.Success ? companyResult.Results : [];
      // Auto-select if only one company
      if (this.Companies.length === 1) {
        this.SelectedCompanyID = this.Companies[0].ID;
      }
    } finally {
      this.IsLoadingIntegrations = false;
      this.cdr.detectChanges();
    }
  }

  get HasCompanies(): boolean {
    return this.Companies.length > 0;
  }

  get NeedsCompanyPicker(): boolean {
    return this.Companies.length > 1;
  }

  get SelectedCompanyName(): string {
    if (!this.SelectedCompanyID) return '';
    return this.Companies.find(c => UUIDsEqual(c.ID, this.SelectedCompanyID))?.Name ?? '';
  }

  async CreateCompany(): Promise<void> {
    const name = this.NewCompanyName.trim();
    if (!name) return;
    this.IsCreatingCompany = true;
    this.cdr.detectChanges();

    const md = new Metadata();
    const company = await md.GetEntityObject<MJCompanyEntity>('MJ: Companies');
    company.NewRecord();
    company.Name = name;
    company.Description = name;

    const saved = await company.Save();
    if (saved) {
      this.Companies.push({ ID: company.ID, Name: company.Name });
      this.SelectedCompanyID = company.ID;
      this.NewCompanyName = '';
    } else {
      const errorMessage = company.LatestResult?.CompleteMessage || company.LatestResult?.Message || 'Unknown error';
      console.error('[ConnectionStudio] Failed to create company:', errorMessage);
    }
    this.IsCreatingCompany = false;
    this.cdr.detectChanges();
  }

  // --- Step 1: Integration selection ---

  SelectIntegration(integration: IntegrationDefinitionRow): void {
    this.UseCustomMode = false;
    this.SelectedIntegrationID = integration.ID;
    this.CustomSourceTypeID = null;
    this.ConnectionName = integration.Name;
  }

  SelectCustomMode(): void {
    this.UseCustomMode = true;
    this.SelectedIntegrationID = null;
    this.ConnectionName = '';
  }

  SelectCustomSourceType(st: SourceTypeRow): void {
    this.CustomSourceTypeID = st.ID;
  }

  IsSelectedIntegration(id: string): boolean {
    return !this.UseCustomMode && UUIDsEqual(this.SelectedIntegrationID, id);
  }

  IsSelectedCustomSourceType(id: string): boolean {
    return UUIDsEqual(this.CustomSourceTypeID, id);
  }

  IntegrationIcon(integration: IntegrationDefinitionRow): string {
    return resolveIntegrationIcon(integration.Name);
  }

  // --- Step 2: Credential management ---

  get IntegrationCredentialTypeID(): string | null {
    return this.SelectedIntegration?.CredentialTypeID ?? null;
  }

  async ShowExistingCredentials(): Promise<void> {
    this.CredentialPickerMode = 'existing';
    this.IsLoadingCredentials = true;
    this.cdr.detectChanges();

    const rv = new RunView();
    const filter = this.IntegrationCredentialTypeID
      ? `CredentialTypeID='${this.IntegrationCredentialTypeID}' AND IsActive=1`
      : 'IsActive=1';
    const result = await rv.RunView<MJCredentialEntity>({
      EntityName: 'MJ: Credentials',
      ExtraFilter: filter,
      OrderBy: 'Name',
      ResultType: 'entity_object'
    });
    this.ExistingCredentials = result.Results;
    this.IsLoadingCredentials = false;
    this.cdr.detectChanges();
  }

  SelectExistingCredential(credential: MJCredentialEntity): void {
    this.SelectedCredential = credential;
    this.CredentialTypeName = credential.Get('CredentialType') ?? '';
    this.CredentialPickerMode = 'choose';
  }

  OpenCredentialDialog(): void {
    this.PreselectedCredentialTypeId = this.IntegrationCredentialTypeID ?? undefined;
    this.ShowCredentialDialog = true;
    this.CredentialPickerMode = 'choose';
    this.cdr.detectChanges();
  }

  OnCredentialDialogClose(result: CredentialDialogResult): void {
    this.ShowCredentialDialog = false;
    if (result.success && result.credential) {
      this.SelectedCredential = result.credential;
      this.CredentialTypeName = '';
    }
    this.cdr.detectChanges();
  }

  ClearCredential(): void {
    this.SelectedCredential = null;
    this.CredentialTypeName = '';
    this.CredentialPickerMode = 'choose';
  }

  BackToCredentialChoice(): void {
    this.CredentialPickerMode = 'choose';
  }

  // --- Navigation ---

  NextStep(): void {
    if (this.CurrentStep < this.Steps.length - 1) {
      this.CurrentStep++;
    }
  }

  PrevStep(): void {
    if (this.CurrentStep > 0) {
      this.CurrentStep--;
      this.TestStatus = 'idle';
      this.TestMessage = '';
    }
  }

  // --- Step 3: Test & Save ---

  TestConnection(): void {
    this.TestStatus = 'testing';
    this.TestMessage = '';
    this.cdr.detectChanges();

    // TODO: Wire up to actual connector.TestConnection() via GraphQL
    console.log('[ConnectionStudio] Testing connection:', {
      integration: this.SelectedIntegrationName,
      credentialId: this.SelectedCredential?.ID
    });

    setTimeout(() => {
      this.TestStatus = 'success';
      this.TestMessage = 'Connection verified successfully.';
      this.cdr.detectChanges();
    }, 1500);
  }

  async SaveIntegration(): Promise<void> {
    if (!this.SelectedCompanyID) {
      console.error('[ConnectionStudio] No company selected');
      return;
    }

    this.IsSaving = true;
    this.SaveError = '';
    this.cdr.detectChanges();

    const md = new Metadata();
    const companyIntegration = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations');
    companyIntegration.NewRecord();

    companyIntegration.CompanyID = this.SelectedCompanyID;
    if (this.SelectedIntegration) {
      companyIntegration.IntegrationID = this.SelectedIntegration.ID;
    }
    companyIntegration.Name = this.ConnectionName;
    companyIntegration.IsActive = true;

    if (this.SelectedCredential) {
      companyIntegration.CredentialID = this.SelectedCredential.ID;
    }

    const saved = await companyIntegration.Save();
    this.IsSaving = false;

    if (saved) {
      this.SaveCompleted = true;
    } else {
      this.SaveError = companyIntegration.LatestResult?.CompleteMessage || companyIntegration.LatestResult?.Message || 'Unknown error';
      console.error('[ConnectionStudio] Failed to save:', this.SaveError);
    }
    this.cdr.detectChanges();
  }

  ResetWizard(): void {
    this.CurrentStep = 0;
    this.SelectedIntegrationID = null;
    this.UseCustomMode = false;
    this.CustomSourceTypeID = null;
    this.ConnectionName = '';
    this.ConnectionDescription = '';
    this.SelectedCredential = null;
    this.CredentialTypeName = '';
    this.CredentialPickerMode = 'choose';
    this.TestStatus = 'idle';
    this.TestMessage = '';
    this.IsSaving = false;
    this.SaveCompleted = false;
    this.SaveError = '';
  }

  // --- Resource interface ---

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
