import { describe, it, expect, vi, afterEach } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MJDialogComponent,
  MJDialogActionsComponent,
  MJEmptyStateComponent,
} from '@memberjunction/ng-ui-components';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { CredentialsModule } from '@memberjunction/ng-credentials';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import { StorageAdminDialogComponent } from './storage-admin-dialog.component';
import {
  MJFileStorageAccountEntity,
  MJFileStorageProviderEntity,
} from '@memberjunction/core-entities';

const MOD = {
  imports: [
    CommonModule,
    FormsModule,
    MJDialogComponent,
    MJDialogActionsComponent,
    MJEmptyStateComponent,
    SharedGenericModule,
    CredentialsModule,
  ],
  declarations: [StorageAdminDialogComponent],
};

const MOCK_PROVIDERS = [
  {
    ID: 'prov-1',
    Name: 'Azure Blob Storage',
    Description: 'Microsoft Azure cloud blob storage',
    ServerDriverKey: 'azure-blob',
    ClientDriverKey: 'azure-blob-client',
    IsActive: true,
    SupportsSearch: true,
    Priority: 1,
  } as unknown as MJFileStorageProviderEntity,
  {
    ID: 'prov-2',
    Name: 'AWS S3',
    Description: 'Amazon Web Services S3',
    ServerDriverKey: 'aws-s3',
    ClientDriverKey: 'aws-s3-client',
    IsActive: false,
    SupportsSearch: false,
    Priority: 2,
  } as unknown as MJFileStorageProviderEntity,
];

const MOCK_ACCOUNTS = [
  {
    ID: 'acct-1',
    Name: 'Corporate S3 Bucket',
    Description: 'Central file storage for enterprise docs',
    ProviderID: 'prov-2',
    Provider: 'AWS S3',
    CredentialID: 'cred-1',
    IncludeInGlobalSearch: true,
  } as unknown as MJFileStorageAccountEntity,
];

describe('StorageAdminDialogComponent (DOM & Logic)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders tab buttons for accounts and providers', () => {
    const f = renderComponentFixture(StorageAdminDialogComponent, {
      ...MOD,
      inputs: {
        Visible: true,
        ActiveTab: 'accounts',
      },
      setup: (c) => {
        c.Providers = [...MOCK_PROVIDERS];
        c.Accounts = [...MOCK_ACCOUNTS];
      },
    });

    const tabs = queryAll(f, '.mj-tab-btn');
    expect(tabs.length).toBe(2);
    expect(tabs[0].textContent).toContain('Storage Accounts');
    expect(tabs[1].textContent).toContain('Storage Providers');
  });

  it('renders providers tab with active and inactive provider drivers', () => {
    const f = renderComponentFixture(StorageAdminDialogComponent, {
      ...MOD,
      inputs: {
        Visible: true,
        ActiveTab: 'providers',
      },
      setup: (c) => {
        c.Providers = [...MOCK_PROVIDERS];
        c.Accounts = [...MOCK_ACCOUNTS];
      },
    });

    expect(f.componentInstance.ActiveTab).toBe('providers');
    const table = query(f, '.mj-admin-table');
    expect(table).not.toBeNull();
    const rows = queryAll(f, 'tbody tr');
    expect(rows.length).toBe(2);
  });

  it('returns correct icons for cloud providers', () => {
    const f = renderComponentFixture(StorageAdminDialogComponent, {
      ...MOD,
      inputs: { Visible: true },
    });

    const c = f.componentInstance;
    expect(c.GetProviderIcon('AWS S3')).toBe('fa-brands fa-aws');
    expect(c.GetProviderIcon('Azure Blob Storage')).toBe('fa-brands fa-microsoft');
    expect(c.GetProviderIcon('Google Drive')).toBe('fa-brands fa-google-drive');
    expect(c.GetProviderIcon('Box')).toBe('fa-solid fa-box');
    expect(c.GetProviderIcon('Dropbox')).toBe('fa-brands fa-dropbox');
  });

  it('toggles role selections in account editor', () => {
    const f = renderComponentFixture(StorageAdminDialogComponent, {
      ...MOD,
      inputs: { Visible: true },
    });

    const c = f.componentInstance;
    expect(c.IsRoleSelected('role-1')).toBe(false);

    c.ToggleRoleSelection('role-1');
    expect(c.IsRoleSelected('role-1')).toBe(true);

    c.ToggleRoleSelection('role-1');
    expect(c.IsRoleSelected('role-1')).toBe(false);
  });

  it('opens create account form and resets state', () => {
    const f = renderComponentFixture(StorageAdminDialogComponent, {
      ...MOD,
      inputs: { Visible: true },
      setup: (c) => {
        c.Providers = [...MOCK_PROVIDERS];
      },
    });

    const c = f.componentInstance;
    c.StartCreateAccount();

    expect(c.IsEditingAccount).toBe(true);
    expect(c.EditingAccount).toBeNull();
    expect(c.EditingAccountName).toBe('');
  });

  it('emits Close event when dialog is closed', () => {
    const f = renderComponentFixture(StorageAdminDialogComponent, {
      ...MOD,
      inputs: { Visible: true },
    });

    const spy = vi.spyOn(f.componentInstance.Close, 'emit');
    f.componentInstance.OnDialogClose();

    expect(f.componentInstance.Visible).toBe(false);
    expect(spy).toHaveBeenCalled();
  });
});
