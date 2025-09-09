#!/usr/bin/env ts-node

import { ComponentLinter, Violation, LintResult } from '../src/lib/component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

async function testDependencyShadowing() {
  console.log('🔍 Testing dependency-shadowing lint rule...\n');
  
  // The problematic code from the user's component
  const problematicCode = `
function AccountIndustryChart({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const [allData, setAllData] = useState([]);
  const [displayedData, setDisplayedData] = useState([]);
  const [loading, setLoading] = useState(true);

  // BAD: These components shadow the dependencies!
  const IndustryFilterDropdown = ({ options, selected, onFilterChange, styles, utilities, components }) => {
    const industries = [...new Set(allData.map(item => item.Industry))].filter(Boolean);
    
    return (
      <select value={selected || ''}>
        <option value="">All Industries</option>
        {industries.map(industry => (
          <option key={industry} value={industry}>{industry}</option>
        ))}
      </select>
    );
  };

  const ResetButton = ({ onReset, styles, utilities, components }) => (
    <button onClick={onReset}>
      Reset
    </button>
  );

  const IndustryPieChart = ({ data, onSliceClick, styles, utilities, components }) => {
    return (
      <div>
        {data.length === 0 ? 'No data to display' : 'Chart placeholder'}
      </div>
    );
  };

  return (
    <div>
      <IndustryFilterDropdown 
        options={allData}
        selected={null}
        onFilterChange={() => {}}
      />
      <ResetButton onReset={() => {}} />
      <IndustryPieChart data={displayedData} onSliceClick={() => {}} />
    </div>
  );
}
  `;
  
  const spec: ComponentSpec = {
    name: 'AccountIndustryChart',
    type: 'chart',
    title: 'Account Industry Distribution',
    dependencies: [
      {
        name: 'IndustryPieChart',
        location: 'embedded',
        description: 'Renders a pie chart',
        type: 'chart',
        code: 'function IndustryPieChart() { return <div>Real Chart</div>; }'
      },
      {
        name: 'IndustryFilterDropdown',
        location: 'embedded',
        description: 'Filter dropdown',
        type: 'form',
        code: 'function IndustryFilterDropdown() { return <select></select>; }'
      },
      {
        name: 'ResetButton',
        location: 'embedded',
        description: 'Reset button',
        type: 'button',
        code: 'function ResetButton() { return <button>Reset</button>; }'
      }
    ]
  } as ComponentSpec;
  
  console.log('Testing PROBLEMATIC code with inline components that shadow dependencies...\n');
  
  const lintResult: LintResult = await ComponentLinter.lintComponent(
    problematicCode, 
    'AccountIndustryChart', 
    spec, 
    true
  );
  
  const shadowingViolations = lintResult.violations.filter((v: Violation) => 
    v.rule === 'dependency-shadowing'
  );
  
  if (shadowingViolations.length > 0) {
    console.log('✅ SUCCESS: Lint rule caught the shadowing issues!\n');
    console.log('Violations found:');
    shadowingViolations.forEach((v: Violation) => {
      console.log(`  - [${v.severity}] Line ${v.line}: ${v.message}`);
    });
  } else {
    console.log('❌ FAILURE: Lint rule did NOT catch the shadowing!\n');
    console.log('Expected to find violations for IndustryPieChart, IndustryFilterDropdown, and ResetButton');
  }
  
  // Test correct code that properly uses dependencies
  console.log('\n---\nTesting CORRECT code that properly uses dependencies...\n');
  
  const correctCode = `
function AccountIndustryChart({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  // GOOD: Destructure from components prop
  const { IndustryPieChart, IndustryFilterDropdown, ResetButton } = components;
  
  const [allData, setAllData] = useState([]);
  const [displayedData, setDisplayedData] = useState([]);
  const [loading, setLoading] = useState(true);

  return (
    <div>
      <IndustryFilterDropdown 
        options={allData}
        selected={null}
        onFilterChange={() => {}}
      />
      <ResetButton onReset={() => {}} />
      <IndustryPieChart data={displayedData} onSliceClick={() => {}} />
    </div>
  );
}
  `;
  
  const correctLintResult = await ComponentLinter.lintComponent(
    correctCode, 
    'AccountIndustryChart', 
    spec, 
    true
  );
  
  const correctShadowingViolations = correctLintResult.violations.filter((v: Violation) => 
    v.rule === 'dependency-shadowing'
  );
  
  if (correctShadowingViolations.length === 0) {
    console.log('✅ Correct code has no dependency-shadowing violations');
  } else {
    console.log('⚠️  Correct code unexpectedly has violations:');
    correctShadowingViolations.forEach((v: Violation) => {
      console.log(`  - [${v.severity}] ${v.message}`);
    });
  }
  
  // Test alternative correct approach with direct access
  console.log('\n---\nTesting alternative approach with direct components.X access...\n');
  
  const directAccessCode = `
function AccountIndustryChart({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) {
  const [allData, setAllData] = useState([]);
  const [displayedData, setDisplayedData] = useState([]);
  const [loading, setLoading] = useState(true);

  // GOOD: Access via components.X directly
  return (
    <div>
      <components.IndustryFilterDropdown 
        options={allData}
        selected={null}
        onFilterChange={() => {}}
      />
      <components.ResetButton onReset={() => {}} />
      <components.IndustryPieChart data={displayedData} onSliceClick={() => {}} />
    </div>
  );
}
  `;
  
  const directLintResult = await ComponentLinter.lintComponent(
    directAccessCode, 
    'AccountIndustryChart', 
    spec, 
    true
  );
  
  const directShadowingViolations = directLintResult.violations.filter((v: Violation) => 
    v.rule === 'dependency-shadowing'
  );
  
  if (directShadowingViolations.length === 0) {
    console.log('✅ Direct access code has no dependency-shadowing violations');
  } else {
    console.log('⚠️  Direct access code unexpectedly has violations:');
    directShadowingViolations.forEach((v: Violation) => {
      console.log(`  - [${v.severity}] ${v.message}`);
    });
  }
}

// Run the test
testDependencyShadowing().catch(console.error);