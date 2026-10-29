import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { UUIDMap } from '@memberjunction/global';
import { RunView } from '@memberjunction/core';
import { ConnectionsComponent } from '../Integration/components/connections/connections.component';
import { IntegrationDataService, IntegrationSummary } from '../Integration/services/integration-data.service';
import { MJCompanyIntegrationEntity, MJIntegrationEntity } from '@memberjunction/core-entities';

const SEEDED_CONFIG = JSON.stringify({ externalDataSourceID: 'eds-1', seededFromBackup: { jobID: 'job-42' } });

function makeComponent(): ConnectionsComponent {
  const comp = Object.create(ConnectionsComponent.prototype) as ConnectionsComponent;
  comp.WizardOpen = true;
  comp.WizardStep = 2;
  comp.ConnectMode = null;
  comp.SelectedCompanyID = 'co-1';
  comp.Companies = [{ ID: 'co-1', Name: 'Acme' }];
  comp.ArchiveSeedWizardOpen = false;
  comp.ArchiveSeedResumeJobID = null;
  comp.SeedStates = new UUIDMap<string>();
  comp.SeedErrors = new UUIDMap<string>();
  comp.SavedIntegrationID = null;
  comp.ConnectModeError = null;
  comp.ConnectionName = 'SQL';
  (comp as unknown as Record<string, unknown>)['cdr'] = { detectChanges: vi.fn() };
  return comp;
}

function makeDefinition(className: string | null): MJIntegrationEntity {
  return { ID: 'def-1', Name: 'Some Integration', ClassName: className } as unknown as MJIntegrationEntity;
}

function makeSummary(configuration: string | null, status: IntegrationSummary['DataSourceStatus']): IntegrationSummary {
  return {
    Integration: { ID: 'ci-1', Name: 'SQL', Integration: 'SQL Server', IsActive: true, Configuration: configuration } as unknown as MJCompanyIntegrationEntity,
    SourceType: null,
    DataSourceDialect: 'tsql',
    DataSourceStatus: status,
    Icon: null,
    LatestRun: null,
    RecentRuns: [],
    StatusColor: 'gray',
    RelativeTime: 'Never',
    TotalRecordsSyncedToday: 0,
    TotalErrors: 0,
    DurationMs: null,
  };
}

describe('ConnectionsComponent — how to connect a SQL Server integration', () => {
  it('recognises the SQL Server connector by either class name, case-insensitively', () => {
    const comp = makeComponent();
    expect(comp.IsSqlServerDefinition(makeDefinition('@memberjunction/connector-sqlserver'))).toBe(true);
    expect(comp.IsSqlServerDefinition(makeDefinition('SQLServerConnector'))).toBe(true);
    expect(comp.IsSqlServerDefinition(makeDefinition('sqlserverconnector'))).toBe(true);
    expect(comp.IsSqlServerDefinition(makeDefinition('HubSpotConnector'))).toBe(false);
    expect(comp.IsSqlServerDefinition(makeDefinition(null))).toBe(false);
  });

  it('shows the choice at step 2 for a SQL Server definition until a mode is chosen', () => {
    const comp = makeComponent();
    comp.SelectedIntegration = makeDefinition('SQLServerConnector');
    expect(comp.ShowConnectModeChoice).toBe(true);
    expect(comp.IsNextDisabled).toBe(true);
    comp.ChooseConnectMode('credentials');
    expect(comp.ConnectMode).toBe('credentials');
    expect(comp.ShowConnectModeChoice).toBe(false);
    expect(comp.WizardOpen).toBe(true);
    expect(comp.ArchiveSeedWizardOpen).toBe(false);
  });

  it('never shows the choice for a non-SQL Server definition', () => {
    const comp = makeComponent();
    comp.SelectedIntegration = makeDefinition('HubSpotConnector');
    expect(comp.ShowConnectModeChoice).toBe(false);
  });

  it('choosing an archive closes the inline wizard and opens the archive seed wizard fresh', async () => {
    const comp = makeComponent();
    comp.SelectedIntegration = makeDefinition('@memberjunction/connector-sqlserver');
    comp.ArchiveSeedResumeJobID = 'stale-job';
    await comp.ChooseConnectMode('archive');
    expect(comp.WizardOpen).toBe(false);
    expect(comp.ArchiveSeedWizardOpen).toBe(true);
    expect(comp.ArchiveSeedResumeJobID).toBeNull();
    expect(comp.SelectedCompanyID).toBe('co-1');
  });

  it('choosing an archive deletes the connection this wizard saved but did not finish, then closes through CloseWizard', async () => {
    const comp = makeComponent();
    comp.SelectedIntegration = makeDefinition('SQLServerConnector');
    comp.SavedIntegrationID = 'ci-tested';
    const ci = { Load: vi.fn().mockResolvedValue(true), Delete: vi.fn().mockResolvedValue(true), LatestResult: null };
    const provider = { CurrentUser: { ID: 'u-1' }, GetEntityObject: vi.fn().mockResolvedValue(ci) };
    Object.defineProperty(comp, 'ProviderToUse', { get: () => provider });
    const load = vi.spyOn(comp, 'LoadData').mockResolvedValue();
    const close = vi.spyOn(comp, 'CloseWizard');

    await comp.ChooseConnectMode('archive');

    expect(provider.GetEntityObject).toHaveBeenCalledWith('MJ: Company Integrations', provider.CurrentUser);
    expect(ci.Load).toHaveBeenCalledWith('ci-tested');
    expect(ci.Delete).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(load).toHaveBeenCalled();
    expect(comp.SavedIntegrationID).toBeNull();
    expect(comp.WizardOpen).toBe(false);
    expect(comp.ArchiveSeedWizardOpen).toBe(true);
  });

  it('a failed delete keeps the inline wizard open with the reason and does not open the archive wizard', async () => {
    const comp = makeComponent();
    comp.SelectedIntegration = makeDefinition('SQLServerConnector');
    comp.SavedIntegrationID = 'ci-tested';
    const ci = { Load: vi.fn().mockResolvedValue(true), Delete: vi.fn().mockResolvedValue(false), LatestResult: { CompleteMessage: 'FK violation' } };
    const provider = { CurrentUser: { ID: 'u-1' }, GetEntityObject: vi.fn().mockResolvedValue(ci) };
    Object.defineProperty(comp, 'ProviderToUse', { get: () => provider });

    await comp.ChooseConnectMode('archive');

    expect(comp.ConnectModeError).toContain('FK violation');
    expect(comp.WizardOpen).toBe(true);
    expect(comp.ArchiveSeedWizardOpen).toBe(false);
    expect(comp.ConnectMode).toBeNull();
    expect(comp.SavedIntegrationID).toBe('ci-tested');
  });

  it('going back to step 1 clears the chosen mode', () => {
    const comp = makeComponent();
    comp.SelectedIntegration = makeDefinition('SQLServerConnector');
    comp.ChooseConnectMode('credentials');
    comp.PreviousStep();
    expect(comp.WizardStep).toBe(1);
    expect(comp.ConnectMode).toBeNull();
  });
});

describe('ConnectionsComponent — seeded status on cards', () => {
  it('is seeded-awaiting-source only with seededFromBackup and a Disabled data source', () => {
    const comp = makeComponent();
    expect(comp.IsSeededAwaitingSource(makeSummary(SEEDED_CONFIG, 'Disabled'))).toBe(true);
    expect(comp.IsSeededAwaitingSource(makeSummary(SEEDED_CONFIG, 'Active'))).toBe(false);
    expect(comp.IsSeededAwaitingSource(makeSummary(JSON.stringify({ externalDataSourceID: 'eds-1' }), 'Disabled'))).toBe(false);
    expect(comp.IsSeededAwaitingSource(makeSummary(null, null))).toBe(false);
  });

  it('labels a seeded card and gives it its own badge class', () => {
    const comp = makeComponent();
    const summary = makeSummary(SEEDED_CONFIG, 'Disabled');
    expect(comp.GetStatusBadge(summary)).toBe('Seeded · source not connected');
    expect(comp.GetStatusBadgeClass(summary)).toBe('status-badge status-badge-seeded');
  });

  it('labels a failed seed "Seed failed" with the job error as its tooltip', () => {
    const comp = makeComponent();
    const summary = makeSummary(SEEDED_CONFIG, 'Disabled');
    comp.SeedStates.Set('ci-1', 'Failed');
    comp.SeedErrors.Set('ci-1', 'Restore failed (RESTORE_FAILED): access denied');
    expect(comp.GetStatusBadge(summary)).toBe('Seed failed');
    expect(comp.GetStatusBadgeClass(summary)).toBe('status-badge status-badge-failed');
    expect(comp.GetStatusBadgeTooltip(summary)).toBe('Restore failed (RESTORE_FAILED): access denied');
  });

  it('a seed that has not failed keeps its badge and has no tooltip', () => {
    const comp = makeComponent();
    const summary = makeSummary(SEEDED_CONFIG, 'Disabled');
    comp.SeedStates.Set('ci-1', 'Done');
    expect(comp.GetStatusBadge(summary)).toBe('Seeded · source not connected');
    expect(comp.GetStatusBadgeTooltip(summary)).toBeNull();
    expect(comp.GetStatusBadge(makeSummary(null, 'Active'))).not.toBe('Seed failed');
  });

  it('offers Resume seed only while the stored job is not terminal', () => {
    const comp = makeComponent();
    const summary = makeSummary(SEEDED_CONFIG, 'Disabled');
    expect(comp.CanResumeSeed(summary)).toBe(false);
    comp.SeedStates.Set('ci-1', 'AwaitingSelection');
    expect(comp.CanResumeSeed(summary)).toBe(true);
    comp.SeedStates.Set('ci-1', 'Done');
    expect(comp.CanResumeSeed(summary)).toBe(false);
    comp.SeedStates.Set('ci-1', 'Failed');
    expect(comp.CanResumeSeed(summary)).toBe(false);
  });

  it('ResumeSeed opens the archive wizard on the stored job', () => {
    const comp = makeComponent();
    const event = { stopPropagation: vi.fn() } as unknown as MouseEvent;
    comp.SelectedCompanyID = null;
    comp.ResumeSeed(makeSummary(SEEDED_CONFIG, 'Disabled'), event);
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(comp.ArchiveSeedResumeJobID).toBe('job-42');
    expect(comp.ArchiveSeedWizardOpen).toBe(true);
  });

  it('loads each seeded card job state once after load', async () => {
    const comp = makeComponent();
    const getState = vi.fn().mockResolvedValue({ Success: true, State: { JobID: 'job-42', CompanyIntegrationID: 'ci-1', State: 'Failed', Error: 'boom' } });
    (comp as unknown as Record<string, unknown>)['dataService'] = { GetArchiveSeedState: getState } as unknown as IntegrationDataService;
    comp.Connections = [makeSummary(SEEDED_CONFIG, 'Disabled'), { ...makeSummary(null, 'Active'), Integration: { ID: 'ci-2', Configuration: null } as unknown as MJCompanyIntegrationEntity }];
    await comp.LoadSeedStates();
    expect(getState).toHaveBeenCalledTimes(1);
    expect(getState).toHaveBeenCalledWith('job-42');
    expect(comp.SeedStates.Get('ci-1')).toBe('Failed');
    expect(comp.SeedErrors.Get('ci-1')).toBe('boom');
  });

  it('closing the archive wizard reloads the cards only when it started a job; completing a seed reloads them', async () => {
    const comp = makeComponent();
    const load = vi.spyOn(comp, 'LoadData').mockResolvedValue();
    comp.ArchiveSeedWizardOpen = true;
    comp.CloseArchiveSeedWizard(false);
    expect(comp.ArchiveSeedWizardOpen).toBe(false);
    expect(load).not.toHaveBeenCalled();
    comp.ArchiveSeedWizardOpen = true;
    comp.CloseArchiveSeedWizard(true);
    expect(load).toHaveBeenCalledTimes(1);
    await comp.OnArchiveSeedCompleted();
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('IntegrationDataService — data source status on summaries', () => {
  it('carries each data source status alongside its dialect', async () => {
    const service = new IntegrationDataService();
    const rv = {
      RunViews: vi.fn().mockResolvedValue([
        { Success: true, Results: [{ ID: 'eds-1', TypeID: 'type-1', Status: 'Disabled' }] },
        { Success: true, Results: [{ ID: 'type-1', FilterDialect: 'tsql' }] },
      ]),
    } as unknown as RunView;
    const links = await (service as unknown as { loadDataSourceLinks(rv: RunView): Promise<UUIDMap<{ Dialect: string | null; Status: string | null }>> }).loadDataSourceLinks(rv);
    expect(links.Get('eds-1')).toEqual({ Dialect: 'tsql', Status: 'Disabled' });
    const fields = (rv.RunViews as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0][0].Fields;
    expect(fields).toContain('Status');
  });
});
