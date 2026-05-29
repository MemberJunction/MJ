/**
 * Tests for the 'required-queries-not-called' rule with hierarchical component specs.
 *
 * Validates that child components can claim queries from the root's dataRequirements,
 * allowing root orchestrator components to delegate data fetching to children
 * without triggering false-positive violations.
 */

import { describe, it, expect } from 'vitest';
import { ComponentLinter } from '@memberjunction/react-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

// Root component code: orchestrator that renders children, no RunQuery calls
const rootOrchestratorCode = `
function SchoolDistrictProfile({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const currentYear = 2024;
  const { DistrictSearch, ProfileKPIs, MembershipTrendChart, CTALeadershipRoster, CompensationBenefits, ExperienceBreakdown } = components;

  if (!selectedDistrict) {
    return (
      <div style={styles.container}>
        <DistrictSearch utilities={utilities} styles={styles} components={components}
          callbacks={callbacks} savedUserSettings={savedUserSettings}
          onSaveUserSettings={onSaveUserSettings}
          onSelectDistrict={(d) => setSelectedDistrict(d)} />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <ProfileKPIs utilities={utilities} styles={styles} components={components}
        callbacks={callbacks} savedUserSettings={savedUserSettings}
        onSaveUserSettings={onSaveUserSettings}
        districtName={selectedDistrict.name} currentYear={currentYear} />
      <MembershipTrendChart utilities={utilities} styles={styles} components={components}
        callbacks={callbacks} savedUserSettings={savedUserSettings}
        onSaveUserSettings={onSaveUserSettings}
        districtName={selectedDistrict.name} currentYear={currentYear} />
      <CTALeadershipRoster utilities={utilities} styles={styles} components={components}
        callbacks={callbacks} savedUserSettings={savedUserSettings}
        onSaveUserSettings={onSaveUserSettings}
        districtName={selectedDistrict.name} />
      <CompensationBenefits utilities={utilities} styles={styles} components={components}
        callbacks={callbacks} savedUserSettings={savedUserSettings}
        onSaveUserSettings={onSaveUserSettings}
        districtCode={selectedDistrict.code} currentYear={currentYear} />
      <ExperienceBreakdown utilities={utilities} styles={styles} components={components}
        callbacks={callbacks} savedUserSettings={savedUserSettings}
        onSaveUserSettings={onSaveUserSettings}
        districtCode={selectedDistrict.code} currentYear={currentYear} />
    </div>
  );
}
`;

const rootWithRunQueryCode = `
function SchoolDistrictProfile({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const [overview, setOverview] = useState(null);

  useEffect(() => {
    const loadOverview = async () => {
      const result = await utilities.rq.RunQuery({
        QueryName: 'MSTA District Profile Overview',
        CategoryPath: 'Golden-Queries/District Profiles',
        Parameters: { CurrentYear: '2024', DistrictName: 'Columbia 93' }
      });
      if (result?.Success) setOverview(result.Results[0]);
    };
    loadOverview();
  }, []);

  return <div>{overview?.District_Name}</div>;
}
`;

const rootNoQueryCallCode = `
function SchoolDistrictProfile({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  return <div>Missing query calls</div>;
}
`;

function buildFullyDelegatedSpec(): ComponentSpec {
  return {
    name: 'SchoolDistrictProfile',
    location: 'embedded',
    dataRequirements: {
      mode: 'hybrid',
      queries: [
        { name: 'MSTA District Profile Overview', categoryPath: 'Golden-Queries/District Profiles', fields: [] },
        { name: 'MSTA District Profile CTA Leaders', categoryPath: 'Golden-Queries/District Profiles', fields: [] },
        { name: 'Educator and Membership Penetration Trend', categoryPath: 'Skip/Membership/MarketPenetration', fields: [] },
        { name: 'Educator Count By Experience Tier', categoryPath: 'Skip/Education/Staffing', fields: [] },
      ],
      entities: [{ name: 'County District Codes' }, { name: 'Salary _schedules' }],
    },
    dependencies: [
      {
        name: 'DistrictSearch',
        location: 'embedded',
        dataRequirements: { mode: 'views', entities: [{ name: 'County District Codes' }] },
      },
      {
        name: 'ProfileKPIs',
        location: 'embedded',
        dataRequirements: {
          mode: 'queries',
          queries: [{ name: 'MSTA District Profile Overview', categoryPath: 'Golden-Queries/District Profiles', fields: [] }],
        },
      },
      {
        name: 'MembershipTrendChart',
        location: 'embedded',
        dataRequirements: {
          mode: 'queries',
          queries: [
            { name: 'Educator and Membership Penetration Trend', categoryPath: 'Skip/Membership/MarketPenetration', fields: [] },
          ],
        },
      },
      {
        name: 'CTALeadershipRoster',
        location: 'embedded',
        dataRequirements: {
          mode: 'queries',
          queries: [{ name: 'MSTA District Profile CTA Leaders', categoryPath: 'Golden-Queries/District Profiles', fields: [] }],
        },
      },
      {
        name: 'CompensationBenefits',
        location: 'embedded',
        dataRequirements: { mode: 'views', entities: [{ name: 'Salary _schedules' }] },
      },
      {
        name: 'ExperienceBreakdown',
        location: 'embedded',
        dataRequirements: {
          mode: 'queries',
          queries: [{ name: 'Educator Count By Experience Tier', categoryPath: 'Skip/Education/Staffing', fields: [] }],
        },
      },
    ],
  } as ComponentSpec;
}

function buildPartiallyDelegatedSpec(): ComponentSpec {
  const spec = buildFullyDelegatedSpec();
  // Remove ProfileKPIs' query claim so 'MSTA District Profile Overview' is unclaimed
  const profileKPIs = spec.dependencies!.find((d) => d.name === 'ProfileKPIs')!;
  profileKPIs.dataRequirements = { mode: 'views', entities: [] };
  return spec;
}

function buildNoDelegationSpec(): ComponentSpec {
  return {
    name: 'SchoolDistrictProfile',
    location: 'embedded',
    dataRequirements: {
      mode: 'queries',
      queries: [{ name: 'MSTA District Profile Overview', categoryPath: 'Golden-Queries/District Profiles', fields: [] }],
    },
  } as ComponentSpec;
}

function buildRegistryChildSpec(): ComponentSpec {
  return {
    name: 'DashboardRoot',
    location: 'embedded',
    dataRequirements: {
      mode: 'queries',
      queries: [{ name: 'Revenue Summary', categoryPath: 'Analytics/Revenue', fields: [] }],
    },
    dependencies: [
      {
        name: 'RevenueChart',
        location: 'registry',
        registry: 'Skip',
        namespace: 'analytics/revenue',
        version: '1.0.0',
        dataRequirements: {
          mode: 'queries',
          queries: [{ name: 'Revenue Summary', categoryPath: 'Analytics/Revenue', fields: [] }],
        },
      },
    ],
  } as ComponentSpec;
}

/** Helper to check if a specific rule fired */
function hasRuleViolation(violations: { rule: string }[], ruleName: string): boolean {
  return violations.some((v) => v.rule === ruleName);
}

describe('ComponentLinter - required-queries-not-called with child delegation', () => {
  it('should NOT flag root when all queries are delegated to embedded children', async () => {
    const result = await ComponentLinter.lintComponent(rootOrchestratorCode, 'SchoolDistrictProfile', buildFullyDelegatedSpec(), true);

    expect(hasRuleViolation(result.violations, 'required-queries-not-called')).toBe(false);
  });

  it('should flag root when some queries are unclaimed and root does not call RunQuery', async () => {
    const result = await ComponentLinter.lintComponent(rootNoQueryCallCode, 'SchoolDistrictProfile', buildPartiallyDelegatedSpec(), true);

    const violation = result.violations.find((v) => v.rule === 'required-queries-not-called');
    expect(violation).toBeDefined();
    expect(violation!.message).toContain('MSTA District Profile Overview');
    expect(violation!.message).not.toContain('Educator and Membership Penetration Trend');
  });

  it('should NOT flag root when it calls RunQuery for unclaimed queries', async () => {
    const result = await ComponentLinter.lintComponent(rootWithRunQueryCode, 'SchoolDistrictProfile', buildPartiallyDelegatedSpec(), true);

    expect(hasRuleViolation(result.violations, 'required-queries-not-called')).toBe(false);
  });

  it('should flag root with no children and no RunQuery call', async () => {
    const result = await ComponentLinter.lintComponent(rootNoQueryCallCode, 'SchoolDistrictProfile', buildNoDelegationSpec(), true);

    expect(hasRuleViolation(result.violations, 'required-queries-not-called')).toBe(true);
  });

  it('should NOT flag root when registry child claims the query', async () => {
    const code = rootNoQueryCallCode.replace('SchoolDistrictProfile', 'DashboardRoot');
    const result = await ComponentLinter.lintComponent(code, 'DashboardRoot', buildRegistryChildSpec(), true);

    expect(hasRuleViolation(result.violations, 'required-queries-not-called')).toBe(false);
  });
});
