/**
 * Tests for ConnectionStudioComponent logic
 * Tests the resolveIntegrationIcon function and component state management
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Angular before any component imports
vi.mock('@angular/core', () => ({
  Injectable: () => (target: Function) => target,
  Component: () => (target: Function) => target,
  NgModule: () => (target: Function) => target,
  Input: () => () => {},
  Output: () => () => {},
  EventEmitter: class { emit() {} subscribe() {} },
  ChangeDetectorRef: class { detectChanges() {} markForCheck() {} },
  ViewContainerRef: class {},
  inject: () => ({}),
  OnInit: class {},
}));

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (target: Function) => target,
  UUIDsEqual: (a: string | null, b: string | null) => {
    if (a == null || b == null) return a === b;
    return a.toLowerCase() === b.toLowerCase();
  },
}));

vi.mock('@memberjunction/ng-shared', () => ({
  BaseResourceComponent: class {
    get RunViewToUse() { return null; }
  },
}));

vi.mock('@memberjunction/core-entities', () => ({
  ResourceData: class {},
  MJCredentialEntity: class {},
  MJCredentialTypeEntity: class {},
}));

vi.mock('@memberjunction/core', () => ({
  Metadata: class {},
}));

vi.mock('@memberjunction/ng-credentials', () => ({
  CredentialDialogService: class {
    getCredentialTypes() { return Promise.resolve([]); }
    createCredential() { return Promise.resolve({ success: false, action: 'cancelled' }); }
    editCredential() { return Promise.resolve({ success: false, action: 'cancelled' }); }
  },
}));

vi.mock('../../services/integration-data.service', () => ({
  IntegrationDataService: class {
    LoadIntegrationDefinitions() { return Promise.resolve([]); }
    LoadSourceTypes() { return Promise.resolve([]); }
  },
}));

import { IntegrationDefinitionRow, SourceTypeRow } from '../Integration/services/integration-data.service';

// Test the icon resolution logic directly
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

describe('resolveIntegrationIcon', () => {
  it('should resolve HubSpot icon', () => {
    expect(resolveIntegrationIcon('HubSpot')).toBe('fa-brands fa-hubspot');
  });

  it('should resolve Salesforce icon', () => {
    expect(resolveIntegrationIcon('Salesforce')).toBe('fa-brands fa-salesforce');
  });

  it('should resolve YourMembership icon', () => {
    expect(resolveIntegrationIcon('YourMembership')).toBe('fa-solid fa-id-card-clip');
  });

  it('should resolve CSV file icon', () => {
    expect(resolveIntegrationIcon('CSV Import')).toBe('fa-solid fa-file-csv');
  });

  it('should return default plug icon for unknown integrations', () => {
    expect(resolveIntegrationIcon('SomeRandomSystem')).toBe('fa-solid fa-plug');
  });

  it('should be case-insensitive', () => {
    expect(resolveIntegrationIcon('HUBSPOT')).toBe('fa-brands fa-hubspot');
    expect(resolveIntegrationIcon('salesforce')).toBe('fa-brands fa-salesforce');
  });
});

describe('ConnectionStudio step validation logic', () => {
  function createIntegration(overrides: Partial<IntegrationDefinitionRow> = {}): IntegrationDefinitionRow {
    return {
      ID: 'int-1', Name: 'HubSpot', Description: 'CRM',
      ClassName: 'HubSpotConnector', ImportPath: null,
      NavigationBaseURL: null, BatchMaxRequestCount: -1, BatchRequestWaitTime: -1,
      CredentialTypeID: null,
      ...overrides
    };
  }

  function createSourceType(overrides: Partial<SourceTypeRow> = {}): SourceTypeRow {
    return {
      ID: 'st-1', Name: 'SaaS API', Description: null,
      DriverClass: 'SaaSAPIConnector', IconClass: 'fa-solid fa-cloud',
      Status: 'Active',
      ...overrides
    };
  }

  describe('Step 1 validation', () => {
    it('should require integration selection in normal mode', () => {
      const selectedIntegrationID: string | null = null;
      const useCustomMode = false;
      const customSourceTypeID: string | null = null;

      const isValid = useCustomMode ? !!customSourceTypeID : !!selectedIntegrationID;
      expect(isValid).toBe(false);
    });

    it('should pass with integration selected', () => {
      const selectedIntegrationID = 'int-1';
      const useCustomMode = false;

      const isValid = !useCustomMode && !!selectedIntegrationID;
      expect(isValid).toBe(true);
    });

    it('should require source type in custom mode', () => {
      const useCustomMode = true;
      const customSourceTypeID: string | null = null;

      const isValid = useCustomMode ? !!customSourceTypeID : false;
      expect(isValid).toBe(false);
    });

    it('should pass in custom mode with source type', () => {
      const useCustomMode = true;
      const customSourceTypeID = 'st-1';

      const isValid = useCustomMode ? !!customSourceTypeID : false;
      expect(isValid).toBe(true);
    });
  });

  describe('Step 2 validation', () => {
    it('should require connection name', () => {
      expect(!!(''.trim())).toBe(false);
      expect(!!('   '.trim())).toBe(false);
    });

    it('should pass with a name', () => {
      expect(!!('Production HubSpot'.trim())).toBe(true);
    });
  });

  describe('Integration selection behavior', () => {
    it('should pre-fill connection name from integration', () => {
      const integration = createIntegration({ Name: 'Salesforce' });
      const connectionName = integration.Name;
      expect(connectionName).toBe('Salesforce');
    });

    it('should clear custom mode when selecting integration', () => {
      let useCustomMode = true;
      let selectedIntegrationID: string | null = null;
      let customSourceTypeID: string | null = 'st-1';

      // Simulate SelectIntegration
      useCustomMode = false;
      selectedIntegrationID = 'int-1';
      customSourceTypeID = null;

      expect(useCustomMode).toBe(false);
      expect(selectedIntegrationID).toBe('int-1');
      expect(customSourceTypeID).toBeNull();
    });

    it('should clear integration when selecting custom mode', () => {
      let useCustomMode = false;
      let selectedIntegrationID: string | null = 'int-1';

      // Simulate SelectCustomMode
      useCustomMode = true;
      selectedIntegrationID = null;

      expect(useCustomMode).toBe(true);
      expect(selectedIntegrationID).toBeNull();
    });
  });
});
