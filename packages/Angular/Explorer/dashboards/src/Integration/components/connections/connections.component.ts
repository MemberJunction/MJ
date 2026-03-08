import { ChangeDetectorRef, Component, OnInit, OnDestroy, inject } from '@angular/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { Metadata, RunView } from '@memberjunction/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData, MJCompanyIntegrationEntity, MJCredentialEntity } from '@memberjunction/core-entities';
import { CredentialDialogResult } from '@memberjunction/ng-credentials';
import {
  IntegrationDataService,
  ResolveIntegrationIcon,
  IntegrationSummary,
  IntegrationDefinitionRow,
  EntityMapRow
} from '../../services/integration-data.service';

/** Brand color mapping for known integration names */
const BRAND_COLOR_MAP: Array<{ Pattern: RegExp; Color: string }> = [
  { Pattern: /hubspot/i, Color: '#ff7a59' },
  { Pattern: /salesforce/i, Color: '#00a1e0' },
  { Pattern: /stripe/i, Color: '#635bff' },
  { Pattern: /slack/i, Color: '#4a154b' },
  { Pattern: /google/i, Color: '#4285f4' },
  { Pattern: /microsoft|azure|dynamics/i, Color: '#00a4ef' },
  { Pattern: /github/i, Color: '#24292f' },
  { Pattern: /jira|atlassian/i, Color: '#0052cc' },
  { Pattern: /mailchimp/i, Color: '#ffe01b' },
  { Pattern: /shopify/i, Color: '#96bf48' },
  { Pattern: /wordpress/i, Color: '#21759b' },
  { Pattern: /dropbox/i, Color: '#0061ff' },
  { Pattern: /aws|amazon/i, Color: '#ff9900' },
  { Pattern: /yourmembership|ym/i, Color: '#1a73e8' },
  { Pattern: /quickbooks|intuit/i, Color: '#2ca01c' },
  { Pattern: /zendesk/i, Color: '#03363d' },
  { Pattern: /database|sql|mysql|postgres/i, Color: '#336791' },
  { Pattern: /api|rest|graphql/i, Color: '#e535ab' },
  { Pattern: /file|csv|excel/i, Color: '#217346' },
  { Pattern: /ftp|sftp/i, Color: '#555' }
];

type StatusBadgeType = 'Connected' | 'Error' | 'Inactive' | 'Syncing';
type WizardStepType = 1 | 2 | 3 | 4;
type CardMenuAction = 'edit' | 'disable' | 'delete';

interface WizardStep {
  Number: number;
  Label: string;
}

interface CompanyRow {
  ID: string;
  Name: string;
}

interface DiscoveredObject {
  Name: string;
  Selected: boolean;
  RecordCount: number | null;
}

const WIZARD_STEPS: WizardStep[] = [
  { Number: 1, Label: 'Choose Integration' },
  { Number: 2, Label: 'Configure' },
  { Number: 3, Label: 'Test' },
  { Number: 4, Label: 'Quick Setup' }
];

@RegisterClass(BaseResourceComponent, 'IntegrationConnections')
@Component({
  standalone: false,
  selector: 'app-integration-connections',
  templateUrl: './connections.component.html',
  styleUrls: ['./connections.component.css']
})
export class ConnectionsComponent extends BaseResourceComponent implements OnInit, OnDestroy {

  // --- Main view state ---
  Connections: IntegrationSummary[] = [];
  EntityMapCounts = new Map<string, number>();
  IsLoading = true;

  // --- Card test state ---
  TestingCardID: string | null = null;
  TestCardResults = new Map<string, { Success: boolean; Message: string }>();

  // --- Wizard state ---
  WizardOpen = false;
  WizardStep: WizardStepType = 1;
  WizardSteps = WIZARD_STEPS;
  AvailableIntegrations: IntegrationDefinitionRow[] = [];
  SearchQuery = '';

  // Step 1
  SelectedIntegration: IntegrationDefinitionRow | null = null;

  // Step 2
  ConnectionName = '';
  SelectedCompanyID: string | null = null;
  ConnectionDescription = '';
  Companies: CompanyRow[] = [];
  SelectedCredentialID: string | null = null;
  ShowCredentialDialog = false;
  PreselectedCredentialTypeId: string | undefined;
  ExistingCredentials: MJCredentialEntity[] = [];
  IsLoadingCredentials = false;
  SelectedCredential: MJCredentialEntity | null = null;

  // Step 3
  TestResult: { Success: boolean; Message: string; ServerVersion?: string } | null = null;
  IsTesting = false;

  // Step 4
  DiscoveredObjects: DiscoveredObject[] = [];
  IsDiscovering = false;

  // Save state
  IsSaving = false;
  SavedIntegrationID: string | null = null;

  // Card menu
  OpenMenuID: string | null = null;

  // Edit panel state
  EditPanelOpen = false;
  EditingSummary: IntegrationSummary | null = null;
  EditEntity: MJCompanyIntegrationEntity | null = null;
  EditName = '';
  EditDescription = '';
  EditCredentialID: string | null = null;
  EditCredential: MJCredentialEntity | null = null;
  EditCredentials: MJCredentialEntity[] = [];
  EditIsActive = false;
  IsEditSaving = false;
  IsEditLoading = false;

  // Delete confirmation state
  DeleteConfirmID: string | null = null;
  IsDeleting = false;

  private dataService = inject(IntegrationDataService);
  private cdr = inject(ChangeDetectorRef);
  private documentClickHandler: ((e: Event) => void) | null = null;

  async ngOnInit(): Promise<void> {
    this.documentClickHandler = (e: Event) => this.onDocumentClick(e);
    document.addEventListener('click', this.documentClickHandler);
    await this.LoadData();
  }

  ngOnDestroy(): void {
    if (this.documentClickHandler) {
      document.removeEventListener('click', this.documentClickHandler);
    }
  }

  // ---------------------------------------------------------------------------
  // Resource overrides
  // ---------------------------------------------------------------------------

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Connections';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-plug';
  }

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  async LoadData(): Promise<void> {
    this.IsLoading = true;
    this.cdr.detectChanges();
    try {
      const provider = this.RunViewToUse;
      const [summaries, entityMaps] = await Promise.all([
        this.dataService.LoadIntegrationSummaries(provider),
        this.loadAllEntityMaps()
      ]);
      this.Connections = summaries;
      this.EntityMapCounts = this.countMapsByIntegration(entityMaps);
    } catch (err) {
      console.error('[IntegrationConnections] Failed to load data:', err);
    } finally {
      this.IsLoading = false;
      this.cdr.detectChanges();
    }
  }

  // ---------------------------------------------------------------------------
  // Card helpers
  // ---------------------------------------------------------------------------

  GetStatusBadge(summary: IntegrationSummary): StatusBadgeType {
    if (summary.LatestRun?.Status === 'In Progress') return 'Syncing';
    if (summary.StatusColor === 'green') return 'Connected';
    if (summary.StatusColor === 'red') return 'Error';
    return 'Inactive';
  }

  GetStatusBadgeClass(summary: IntegrationSummary): string {
    const badge = this.GetStatusBadge(summary);
    return `status-badge status-badge-${badge.toLowerCase()}`;
  }

  GetIntegrationIcon(name: string): string {
    return this.resolveIconByName(name);
  }

  GetIconBrandColor(name: string): string {
    return this.resolveBrandColor(name);
  }

  GetEntityMapCount(integrationID: string): number {
    for (const [key, value] of this.EntityMapCounts) {
      if (UUIDsEqual(key, integrationID)) return value;
    }
    return 0;
  }

  GetCredentialHint(summary: IntegrationSummary): string {
    const driverClass = summary.Integration.DriverClassName;
    if (driverClass?.toLowerCase().includes('oauth')) return 'OAuth2 Connected';
    return 'API Key configured';
  }

  GetSourceTypeLabel(summary: IntegrationSummary): string {
    return summary.SourceType?.Name ?? 'API';
  }

  IsConnectionActive(summary: IntegrationSummary): boolean {
    return summary.Integration.IsActive === true;
  }

  // ---------------------------------------------------------------------------
  // Card menu
  // ---------------------------------------------------------------------------

  ToggleMenu(integrationID: string, event: Event): void {
    event.stopPropagation();
    this.OpenMenuID = this.OpenMenuID === integrationID ? null : integrationID;
    this.cdr.detectChanges();
  }

  IsMenuOpen(integrationID: string): boolean {
    return this.OpenMenuID === integrationID;
  }

  OnMenuAction(action: CardMenuAction, summary: IntegrationSummary): void {
    this.OpenMenuID = null;
    switch (action) {
      case 'edit':
        this.OpenEditPanel(summary);
        break;
      case 'disable':
        this.toggleConnectionActive(summary);
        break;
      case 'delete':
        this.ShowDeleteConfirm(summary.Integration.ID);
        break;
    }
  }

  GetMenuActionLabel(summary: IntegrationSummary): string {
    return this.IsConnectionActive(summary) ? 'Disable' : 'Enable';
  }

  // ---------------------------------------------------------------------------
  // Edit panel
  // ---------------------------------------------------------------------------

  async OpenEditPanel(summary: IntegrationSummary): Promise<void> {
    this.EditingSummary = summary;
    this.EditName = summary.Integration.Name;
    this.EditDescription = '';
    this.EditIsActive = summary.Integration.IsActive === true;
    this.EditCredentialID = null;
    this.EditCredential = null;
    this.EditCredentials = [];
    this.EditEntity = null;
    this.EditPanelOpen = true;
    this.IsEditLoading = true;
    this.cdr.detectChanges();

    try {
      const md = new Metadata();
      const ci = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations');
      await ci.Load(summary.Integration.ID);
      this.EditEntity = ci;
      this.EditName = ci.Name;
      this.EditIsActive = ci.IsActive === true;
      if (ci.CredentialID) {
        this.EditCredentialID = ci.CredentialID;
      }
      await this.loadEditCredentials();
    } catch (err) {
      console.error('[IntegrationConnections] Failed to load connection for editing:', err);
    } finally {
      this.IsEditLoading = false;
      this.cdr.detectChanges();
    }
  }

  CloseEditPanel(): void {
    this.EditPanelOpen = false;
    setTimeout(() => {
      if (!this.EditPanelOpen) {
        this.EditingSummary = null;
        this.EditEntity = null;
        this.cdr.detectChanges();
      }
    }, 350);
    this.cdr.detectChanges();
  }

  async SaveEditChanges(): Promise<void> {
    if (!this.EditEntity) return;
    this.IsEditSaving = true;
    this.cdr.detectChanges();

    try {
      this.EditEntity.Name = this.EditName;
      this.EditEntity.IsActive = this.EditIsActive;
      if (this.EditCredentialID) {
        this.EditEntity.CredentialID = this.EditCredentialID;
      }
      const saved = await this.EditEntity.Save();
      if (saved) {
        this.CloseEditPanel();
        await this.LoadData();
      } else {
        console.error('[IntegrationConnections] Save failed:',
          this.EditEntity.LatestResult?.CompleteMessage ?? this.EditEntity.LatestResult?.Message);
      }
    } catch (err) {
      console.error('[IntegrationConnections] Save error:', err);
    } finally {
      this.IsEditSaving = false;
      this.cdr.detectChanges();
    }
  }

  SelectEditCredential(credential: MJCredentialEntity): void {
    this.EditCredential = credential;
    this.EditCredentialID = credential.ID;
  }

  ClearEditCredential(): void {
    this.EditCredential = null;
    this.EditCredentialID = null;
  }

  OpenEditCredentialDialog(): void {
    this.PreselectedCredentialTypeId = undefined;
    this.ShowCredentialDialog = true;
    this.cdr.detectChanges();
  }

  OnEditCredentialDialogClose(result: CredentialDialogResult): void {
    this.ShowCredentialDialog = false;
    if (result.success && result.credential) {
      this.EditCredential = result.credential;
      this.EditCredentialID = result.credential.ID;
    }
    this.cdr.detectChanges();
  }

  // ---------------------------------------------------------------------------
  // Delete confirmation
  // ---------------------------------------------------------------------------

  ShowDeleteConfirm(integrationID: string): void {
    this.DeleteConfirmID = integrationID;
    this.cdr.detectChanges();
  }

  CancelDelete(): void {
    this.DeleteConfirmID = null;
    this.cdr.detectChanges();
  }

  async ConfirmDelete(integrationID: string): Promise<void> {
    this.IsDeleting = true;
    this.cdr.detectChanges();

    try {
      const md = new Metadata();
      const ci = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations');
      await ci.Load(integrationID);
      const deleted = await ci.Delete();
      if (deleted) {
        this.DeleteConfirmID = null;
        await this.LoadData();
      } else {
        console.error('[IntegrationConnections] Delete failed:',
          ci.LatestResult?.CompleteMessage ?? ci.LatestResult?.Message);
      }
    } catch (err) {
      console.error('[IntegrationConnections] Delete error:', err);
    } finally {
      this.IsDeleting = false;
      this.cdr.detectChanges();
    }
  }

  IsDeleteConfirming(integrationID: string): boolean {
    return UUIDsEqual(this.DeleteConfirmID, integrationID);
  }

  // ---------------------------------------------------------------------------
  // Card test
  // ---------------------------------------------------------------------------

  async TestExistingConnection(integrationID: string): Promise<void> {
    if (this.TestingCardID) return;
    this.TestingCardID = integrationID;
    this.TestCardResults.delete(integrationID);
    this.cdr.detectChanges();

    try {
      const result = await this.dataService.TestConnection(integrationID);
      this.TestCardResults.set(integrationID, {
        Success: result.Success,
        Message: result.Message
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.TestCardResults.set(integrationID, {
        Success: false,
        Message: `Test failed: ${message}`
      });
    } finally {
      this.TestingCardID = null;
      this.cdr.detectChanges();
    }
  }

  IsTestingCard(integrationID: string): boolean {
    return UUIDsEqual(this.TestingCardID, integrationID);
  }

  GetCardTestResult(integrationID: string): { Success: boolean; Message: string } | null {
    for (const [key, value] of this.TestCardResults) {
      if (UUIDsEqual(key, integrationID)) return value;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Sync action
  // ---------------------------------------------------------------------------

  async RunSync(integrationID: string): Promise<void> {
    try {
      const result = await this.dataService.RunSync(integrationID);
      if (!result.Success) {
        console.error('[IntegrationConnections] Sync failed:', result.Message);
      }
      await this.LoadData();
    } catch (err) {
      console.error('[IntegrationConnections] RunSync error:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Wizard: open/close
  // ---------------------------------------------------------------------------

  async OpenWizard(): Promise<void> {
    this.resetWizardState();
    this.WizardOpen = true;
    this.cdr.detectChanges();
    await this.loadWizardData();
  }

  CloseWizard(): void {
    this.WizardOpen = false;
    if (this.SavedIntegrationID) {
      this.LoadData();
    }
    this.cdr.detectChanges();
  }

  OnBackdropClick(event: Event): void {
    if ((event.target as HTMLElement).classList.contains('wizard-backdrop')) {
      this.CloseWizard();
    }
  }

  OnKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.CloseWizard();
    }
  }

  // ---------------------------------------------------------------------------
  // Wizard: navigation
  // ---------------------------------------------------------------------------

  NextStep(): void {
    if (this.WizardStep < 4) {
      this.WizardStep = (this.WizardStep + 1) as WizardStepType;
      if (this.WizardStep === 3) {
        this.TestResult = null;
      }
      this.cdr.detectChanges();
    }
  }

  PreviousStep(): void {
    if (this.WizardStep > 1) {
      this.WizardStep = (this.WizardStep - 1) as WizardStepType;
      this.cdr.detectChanges();
    }
  }

  get IsNextDisabled(): boolean {
    if (this.WizardStep === 1) return !this.SelectedIntegration;
    if (this.WizardStep === 2) return !this.ConnectionName.trim() || !this.SelectedCompanyID;
    if (this.WizardStep === 3) return !this.TestResult?.Success;
    return false;
  }

  get NextButtonLabel(): string {
    if (this.WizardStep === 3 && !this.TestResult?.Success) return 'Next';
    if (this.WizardStep === 3) return 'Next';
    if (this.WizardStep === 4) return 'Finish';
    return 'Next';
  }

  IsStepCompleted(stepNumber: number): boolean {
    return stepNumber < this.WizardStep;
  }

  IsStepActive(stepNumber: number): boolean {
    return stepNumber === this.WizardStep;
  }

  // ---------------------------------------------------------------------------
  // Wizard Step 1: Choose integration
  // ---------------------------------------------------------------------------

  SelectIntegration(def: IntegrationDefinitionRow): void {
    this.SelectedIntegration = def;
    this.ConnectionName = def.Name;
  }

  IsSelectedIntegration(def: IntegrationDefinitionRow): boolean {
    return UUIDsEqual(this.SelectedIntegration?.ID, def.ID);
  }

  get FilteredIntegrations(): IntegrationDefinitionRow[] {
    if (!this.SearchQuery.trim()) return this.AvailableIntegrations;
    const query = this.SearchQuery.toLowerCase();
    return this.AvailableIntegrations.filter(i =>
      i.Name.toLowerCase().includes(query) ||
      (i.Description?.toLowerCase().includes(query) ?? false)
    );
  }

  // ---------------------------------------------------------------------------
  // Wizard Step 2: Configure
  // ---------------------------------------------------------------------------

  get NeedsCompanyPicker(): boolean {
    return this.Companies.length > 1;
  }

  get IntegrationCredentialTypeID(): string | null {
    return this.SelectedIntegration?.CredentialTypeID ?? null;
  }

  async ShowExistingCredentials(): Promise<void> {
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
    this.SelectedCredentialID = credential.ID;
  }

  OpenCredentialDialog(): void {
    this.PreselectedCredentialTypeId = this.IntegrationCredentialTypeID ?? undefined;
    this.ShowCredentialDialog = true;
    this.cdr.detectChanges();
  }

  OnCredentialDialogClose(result: CredentialDialogResult): void {
    this.ShowCredentialDialog = false;
    if (result.success && result.credential) {
      this.SelectedCredential = result.credential;
      this.SelectedCredentialID = result.credential.ID;
    }
    this.cdr.detectChanges();
  }

  ClearCredential(): void {
    this.SelectedCredential = null;
    this.SelectedCredentialID = null;
  }

  // ---------------------------------------------------------------------------
  // Wizard Step 3: Test connection
  // ---------------------------------------------------------------------------

  async TestNewConnection(): Promise<void> {
    this.IsTesting = true;
    this.TestResult = null;
    this.cdr.detectChanges();

    try {
      const companyIntegrationID = await this.saveCompanyIntegration();
      if (!companyIntegrationID) {
        this.TestResult = {
          Success: false,
          Message: 'Could not save integration to test. Check your configuration.'
        };
        this.IsTesting = false;
        this.cdr.detectChanges();
        return;
      }

      const result = await this.dataService.TestConnection(companyIntegrationID);
      this.TestResult = {
        Success: result.Success,
        Message: result.Message,
        ServerVersion: result.ServerVersion ?? undefined
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.TestResult = {
        Success: false,
        Message: `Connection test failed: ${message}`
      };
    } finally {
      this.IsTesting = false;
      this.cdr.detectChanges();
    }
  }

  // ---------------------------------------------------------------------------
  // Wizard Step 4: Quick Setup
  // ---------------------------------------------------------------------------

  async SaveAndDiscover(): Promise<void> {
    if (!this.SavedIntegrationID) return;
    this.IsDiscovering = true;
    this.cdr.detectChanges();

    try {
      // Activate the integration
      const md = new Metadata();
      const ci = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations');
      await ci.Load(this.SavedIntegrationID);
      ci.IsActive = true;
      ci.Name = this.ConnectionName;
      await ci.Save();

      // Discover objects
      const discovery = await this.dataService.DiscoverObjects(this.SavedIntegrationID);
      if (discovery.Success && discovery.Data) {
        this.DiscoveredObjects = discovery.Data.map(obj => ({
          Name: obj.Name,
          Selected: false,
          RecordCount: null
        }));
      }
    } catch (err) {
      console.error('[IntegrationConnections] Discovery error:', err);
    } finally {
      this.IsDiscovering = false;
      this.cdr.detectChanges();
    }
  }

  ToggleDiscoveredObject(obj: DiscoveredObject): void {
    obj.Selected = !obj.Selected;
  }

  get SelectedDiscoveredCount(): number {
    return this.DiscoveredObjects.filter(o => o.Selected).length;
  }

  async ApplyQuickSetup(): Promise<void> {
    if (!this.SavedIntegrationID) return;
    const selected = this.DiscoveredObjects.filter(o => o.Selected);
    if (selected.length === 0) return;

    this.IsSaving = true;
    this.cdr.detectChanges();

    try {
      const mjEntities = await this.dataService.LoadMJEntities();

      for (const obj of selected) {
        const targetEntity = mjEntities.find(e =>
          e.Name.toLowerCase() === obj.Name.toLowerCase()
        );
        if (!targetEntity) continue;

        await this.dataService.CreateEntityMap({
          CompanyIntegrationID: this.SavedIntegrationID,
          ExternalObjectName: obj.Name,
          ExternalObjectLabel: obj.Name,
          EntityID: targetEntity.ID,
          SyncDirection: 'Pull'
        });
      }
    } catch (err) {
      console.error('[IntegrationConnections] Quick setup error:', err);
    } finally {
      this.IsSaving = false;
      this.CloseWizard();
    }
  }

  SkipQuickSetup(): void {
    this.CloseWizard();
  }

  async OnStep4Enter(): Promise<void> {
    if (this.DiscoveredObjects.length === 0) {
      await this.SaveAndDiscover();
    }
  }

  // ---------------------------------------------------------------------------
  // Wizard: finish
  // ---------------------------------------------------------------------------

  async FinishWizard(): Promise<void> {
    if (this.isOnFinalStep()) {
      if (this.SelectedDiscoveredCount > 0) {
        await this.ApplyQuickSetup();
      } else {
        this.CloseWizard();
      }
    } else {
      this.NextStep();
      if (this.isOnFinalStep()) {
        await this.OnStep4Enter();
      }
    }
  }

  private isOnFinalStep(): boolean {
    return this.WizardStep === 4;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async loadWizardData(): Promise<void> {
    try {
      const provider = this.RunViewToUse;
      const rv = new RunView(provider ?? null);
      const [integrations, companyResult] = await Promise.all([
        this.dataService.LoadIntegrationDefinitions(provider),
        rv.RunView<CompanyRow>({
          EntityName: 'MJ: Companies',
          Fields: ['ID', 'Name'],
          OrderBy: 'Name',
          ResultType: 'simple'
        })
      ]);
      this.AvailableIntegrations = integrations;
      this.Companies = companyResult.Success ? companyResult.Results : [];
      if (this.Companies.length === 1) {
        this.SelectedCompanyID = this.Companies[0].ID;
      }
    } catch (err) {
      console.error('[IntegrationConnections] Failed to load wizard data:', err);
    }
    this.cdr.detectChanges();
  }

  private async saveCompanyIntegration(): Promise<string | null> {
    if (this.SavedIntegrationID) return this.SavedIntegrationID;
    if (!this.SelectedCompanyID || !this.SelectedIntegration) return null;

    const md = new Metadata();
    const ci = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations');
    ci.NewRecord();
    ci.CompanyID = this.SelectedCompanyID;
    ci.IntegrationID = this.SelectedIntegration.ID;
    ci.Name = this.ConnectionName || this.SelectedIntegration.Name;
    ci.IsActive = false;
    if (this.SelectedCredential) {
      ci.CredentialID = this.SelectedCredential.ID;
    }

    const saved = await ci.Save();
    if (saved) {
      this.SavedIntegrationID = ci.ID;
      return ci.ID;
    }
    console.error('[IntegrationConnections] Failed to save company integration:',
      ci.LatestResult?.CompleteMessage ?? ci.LatestResult?.Message);
    return null;
  }

  private async loadAllEntityMaps(): Promise<EntityMapRow[]> {
    const rv = new RunView(this.RunViewToUse ?? null);
    const result = await rv.RunView<EntityMapRow>({
      EntityName: 'MJ: Company Integration Entity Maps',
      ExtraFilter: '',
      OrderBy: 'CompanyIntegrationID',
      Fields: ['ID', 'CompanyIntegrationID'],
      ResultType: 'simple'
    });
    return result.Results;
  }

  private countMapsByIntegration(maps: EntityMapRow[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const map of maps) {
      const current = counts.get(map.CompanyIntegrationID) ?? 0;
      counts.set(map.CompanyIntegrationID, current + 1);
    }
    return counts;
  }

  private resolveIconByName(name: string): string {
    return ResolveIntegrationIcon(name);
  }

  private resolveBrandColor(name: string): string {
    const match = BRAND_COLOR_MAP.find(m => m.Pattern.test(name));
    return match ? match.Color : '#6366f1';
  }

  private async toggleConnectionActive(summary: IntegrationSummary): Promise<void> {
    const md = new Metadata();
    const ci = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations');
    await ci.Load(summary.Integration.ID);
    ci.IsActive = !summary.Integration.IsActive;
    const saved = await ci.Save();
    if (saved) {
      await this.LoadData();
    }
  }

  private async loadEditCredentials(): Promise<void> {
    const rv = new RunView();
    const result = await rv.RunView<MJCredentialEntity>({
      EntityName: 'MJ: Credentials',
      ExtraFilter: 'IsActive=1',
      OrderBy: 'Name',
      ResultType: 'entity_object'
    });
    this.EditCredentials = result.Results;

    // Pre-select the current credential if one is set
    if (this.EditCredentialID) {
      this.EditCredential = this.EditCredentials.find(c =>
        UUIDsEqual(c.ID, this.EditCredentialID!)
      ) ?? null;
    }
  }

  private resetWizardState(): void {
    this.WizardStep = 1;
    this.AvailableIntegrations = [];
    this.SearchQuery = '';
    this.SelectedIntegration = null;
    this.ConnectionName = '';
    this.SelectedCompanyID = null;
    this.ConnectionDescription = '';
    this.SelectedCredentialID = null;
    this.SelectedCredential = null;
    this.ShowCredentialDialog = false;
    this.ExistingCredentials = [];
    this.Companies = [];
    this.TestResult = null;
    this.IsTesting = false;
    this.DiscoveredObjects = [];
    this.IsDiscovering = false;
    this.IsSaving = false;
    this.SavedIntegrationID = null;
    this.OpenMenuID = null;
  }

  private onDocumentClick(e: Event): void {
    if (this.OpenMenuID) {
      const target = e.target as HTMLElement;
      if (!target.closest('.card-menu-wrapper')) {
        this.OpenMenuID = null;
        this.cdr.detectChanges();
      }
    }
  }
}

export function LoadConnectionsComponent(): void {
  // Tree-shaking prevention: importing this module causes
  // @RegisterClass decorators to fire, registering components.
}
