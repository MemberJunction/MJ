# Component Linter Fixture Coverage Analysis

## Overview

This document identifies **gaps in test coverage** and provides a systematic plan for creating fixtures that explore **all correct and broken patterns** for type safety validation in the component linter.

The goal is **exhaustive coverage** of type safety interactions: wrong property names, wrong types, data transformations, spread operators, result handling, and all combinations of these patterns across entities, queries, and components.

## Current Coverage Analysis

### Existing Fixtures (149 total)
- **110 broken** - Organically collected bugs from production
- **39 fixed** - Corrected versions
- **41 valid** - Real production components

### Coverage Gaps Identified

The current fixtures have **significant gaps** in systematic type safety validation:

1. **Incomplete data flow testing** - Missing transformation pipelines
2. **Missing type coercion patterns** - Array methods, spread operators, object destructuring
3. **Incomplete RunView/RunQuery result handling** - Limited transformation scenarios
4. **Missing cross-dependency type propagation** - Data passing between components
5. **Limited entity/query field validation** - Missing edge cases
6. **Sparse parameter type validation** - Not all parameter types covered
7. **Missing nested object validation** - Deep property access patterns

---

## Type Safety Pattern Matrix

### Pattern Categories

1. **Direct Property Access** - Simple property reads/writes
2. **Data Transformation** - map(), filter(), reduce(), spread operators
3. **Cross-Component Data Flow** - Passing data between dependencies
4. **Result Handling** - RunView/RunQuery result processing
5. **Parameter Binding** - Query parameters from various sources
6. **Nested Access** - Deep property paths and optional chaining
7. **Type Coercion** - Implicit type conversions

---

## Systematic Test Coverage Plan

### 1. Entity Field Validation (Type Rules + Schema Validation)

#### Pattern: Direct Entity Field Access

**Broken Patterns**:
```javascript
// ❌ Typo in field name
const name = entityData.FirstNaem; // Should be FirstName

// ❌ Non-existent field
const salary = entityData.Salary; // Field doesn't exist on entity

// ❌ Case mismatch
const email = entityData.email; // Should be Email (PascalCase)

// ❌ Using ID field as string when it's GUID
const id = parseInt(entityData.ID); // ID is uniqueidentifier, not int
```

**Fixed Patterns**:
```javascript
// ✅ Correct field name
const name = entityData.FirstName;

// ✅ Correct case
const email = entityData.Email;

// ✅ Correct type usage
const id = entityData.ID; // Keep as GUID string
```

**Fixtures Needed**:
- [ ] `entity-field-typo-broken.json` - Typo in entity field name
- [ ] `entity-field-typo-fixed.json`
- [ ] `entity-field-nonexistent-broken.json` - Accessing non-existent field
- [ ] `entity-field-nonexistent-fixed.json`
- [ ] `entity-field-case-broken.json` - Wrong case (camelCase vs PascalCase)
- [ ] `entity-field-case-fixed.json`
- [ ] `entity-field-type-coercion-broken.json` - Wrong type conversion
- [ ] `entity-field-type-coercion-fixed.json`

#### Pattern: Entity Field in Array Operations

**Broken Patterns**:
```javascript
// ❌ Filtering by non-existent field
const filtered = entityData.filter(item => item.InvalidField === 'value');

// ❌ Mapping to non-existent field
const names = entityData.map(item => item.FullName); // Field doesn't exist

// ❌ Grouping by typo field
const grouped = entityData.reduce((acc, item) => {
  const key = item.MembershipTpye; // Typo: should be MembershipType
  // ...
}, {});

// ❌ Sorting by non-existent field
const sorted = entityData.sort((a, b) => a.Priority - b.Priority); // No Priority field
```

**Fixed Patterns**:
```javascript
// ✅ Filtering by correct field
const filtered = entityData.filter(item => item.Status === 'Active');

// ✅ Mapping to correct field
const names = entityData.map(item => item.FirstName + ' ' + item.LastName);

// ✅ Grouping by correct field
const grouped = entityData.reduce((acc, item) => {
  const key = item.MembershipType;
  // ...
}, {});

// ✅ Sorting by valid field
const sorted = entityData.sort((a, b) => a.LastName.localeCompare(b.LastName));
```

**Fixtures Needed**:
- [ ] `entity-array-filter-invalid-field-broken.json`
- [ ] `entity-array-filter-valid-field-fixed.json`
- [ ] `entity-array-map-invalid-field-broken.json`
- [ ] `entity-array-map-valid-field-fixed.json`
- [ ] `entity-array-reduce-invalid-field-broken.json`
- [ ] `entity-array-reduce-valid-field-fixed.json`
- [ ] `entity-array-sort-invalid-field-broken.json`
- [ ] `entity-array-sort-valid-field-fixed.json`

#### Pattern: Entity Field in Spread Operations

**Broken Patterns**:
```javascript
// ❌ Spreading with field rename (loses type safety)
const data = entityData.map(item => ({
  ...item,
  FullName: item.FirstNaem + ' ' + item.LastName // Typo
}));

// ❌ Spreading with non-existent field addition
const enhanced = entityData.map(item => ({
  ...item,
  displayName: item.DisplayName // Field doesn't exist
}));
```

**Fixed Patterns**:
```javascript
// ✅ Spreading with correct field names
const data = entityData.map(item => ({
  ...item,
  FullName: item.FirstName + ' ' + item.LastName
}));

// ✅ Spreading with computed fields
const enhanced = entityData.map(item => ({
  ...item,
  displayName: `${item.FirstName} ${item.LastName}`
}));
```

**Fixtures Needed**:
- [ ] `entity-spread-field-typo-broken.json`
- [ ] `entity-spread-field-correct-fixed.json`
- [ ] `entity-spread-nonexistent-field-broken.json`
- [ ] `entity-spread-computed-field-fixed.json`

---

### 2. Query Field Validation (Schema Validation)

#### Pattern: Query Field Access in Results

**Broken Patterns**:
```javascript
// ❌ Accessing field not returned by query
const result = await utilities.RunQuery('Sales Report');
const revenue = result.Results[0].TotalRevenue; // Query doesn't return this field

// ❌ Typo in query field name
const name = result.Results[0].AccountNaem; // Should be AccountName

// ❌ Case mismatch
const status = result.Results[0].status; // Should be Status
```

**Fixed Patterns**:
```javascript
// ✅ Accessing correct query fields
const result = await utilities.RunQuery('Sales Report');
const revenue = result.Results[0].Revenue;

// ✅ Correct field name
const name = result.Results[0].AccountName;

// ✅ Correct case
const status = result.Results[0].Status;
```

**Fixtures Needed**:
- [ ] `query-result-field-nonexistent-broken.json`
- [ ] `query-result-field-correct-fixed.json`
- [ ] `query-result-field-typo-broken.json`
- [ ] `query-result-field-typo-fixed.json`
- [ ] `query-result-field-case-broken.json`
- [ ] `query-result-field-case-fixed.json`

#### Pattern: Query Results in Array Operations

**Broken Patterns**:
```javascript
// ❌ Filtering by non-existent query field
const filtered = queryResults.filter(row => row.Category === 'Premium'); // No Category field

// ❌ Mapping with typo
const names = queryResults.map(row => row.ProductNaem); // Typo

// ❌ Grouping by invalid field
const grouped = queryResults.reduce((acc, row) => {
  const key = row.Region; // Query doesn't return Region
  // ...
}, {});
```

**Fixed Patterns**:
```javascript
// ✅ Filtering by correct field
const filtered = queryResults.filter(row => row.Status === 'Active');

// ✅ Mapping with correct field
const names = queryResults.map(row => row.ProductName);

// ✅ Grouping by valid field
const grouped = queryResults.reduce((acc, row) => {
  const key = row.Category;
  // ...
}, {});
```

**Fixtures Needed**:
- [ ] `query-result-filter-invalid-field-broken.json`
- [ ] `query-result-filter-valid-field-fixed.json`
- [ ] `query-result-map-invalid-field-broken.json`
- [ ] `query-result-map-valid-field-fixed.json`
- [ ] `query-result-reduce-invalid-field-broken.json`
- [ ] `query-result-reduce-valid-field-fixed.json`

---

### 3. Query Parameter Validation (Schema Validation)

#### Pattern: Parameter Type Mismatches

**Broken Patterns**:
```javascript
// ❌ Passing string when int expected
await utilities.RunQuery('Top Products', { topN: '10' }); // Should be number

// ❌ Passing number when date expected
await utilities.RunQuery('Sales By Date', { startDate: 20231201 }); // Should be Date/string

// ❌ Passing array when single value expected
await utilities.RunQuery('Product By ID', { productId: [123, 456] }); // Should be single int

// ❌ Passing null when required
await utilities.RunQuery('Sales Report', { accountId: null }); // Required parameter

// ❌ Passing wrong type for bit parameter
await utilities.RunQuery('Active Items', { includeInactive: 'true' }); // Should be boolean
```

**Fixed Patterns**:
```javascript
// ✅ Correct type for int parameter
await utilities.RunQuery('Top Products', { topN: 10 });

// ✅ Correct type for date parameter
await utilities.RunQuery('Sales By Date', { startDate: new Date('2023-12-01') });

// ✅ Single value for scalar parameter
await utilities.RunQuery('Product By ID', { productId: 123 });

// ✅ Required parameter provided
await utilities.RunQuery('Sales Report', { accountId: 'ABC123' });

// ✅ Boolean for bit parameter
await utilities.RunQuery('Active Items', { includeInactive: true });
```

**Fixtures Needed**:
- [ ] `query-param-type-string-to-int-broken.json`
- [ ] `query-param-type-int-correct-fixed.json`
- [ ] `query-param-type-number-to-date-broken.json`
- [ ] `query-param-type-date-correct-fixed.json`
- [ ] `query-param-type-array-to-scalar-broken.json`
- [ ] `query-param-type-scalar-correct-fixed.json`
- [ ] `query-param-required-null-broken.json`
- [ ] `query-param-required-provided-fixed.json`
- [ ] `query-param-bit-string-broken.json`
- [ ] `query-param-bit-boolean-fixed.json`

#### Pattern: Parameter Variables Type Inference

**Broken Patterns**:
```javascript
// ❌ Variable with wrong type passed to parameter
const topCount = '25'; // String instead of number
await utilities.RunQuery('Top Products', { topN: topCount });

// ❌ Computed value with wrong type
const startDate = Date.now(); // Number instead of Date
await utilities.RunQuery('Sales By Date', { startDate });

// ❌ Parameter from state with wrong type
const [productId, setProductId] = React.useState('123'); // String instead of number
await utilities.RunQuery('Product Details', { productId });
```

**Fixed Patterns**:
```javascript
// ✅ Variable with correct type
const topCount = 25;
await utilities.RunQuery('Top Products', { topN: topCount });

// ✅ Computed value with correct type
const startDate = new Date();
await utilities.RunQuery('Sales By Date', { startDate });

// ✅ Parameter from state with correct type
const [productId, setProductId] = React.useState(123);
await utilities.RunQuery('Product Details', { productId });
```

**Fixtures Needed**:
- [ ] `query-param-variable-wrong-type-broken.json`
- [ ] `query-param-variable-correct-type-fixed.json`
- [ ] `query-param-computed-wrong-type-broken.json`
- [ ] `query-param-computed-correct-type-fixed.json`
- [ ] `query-param-state-wrong-type-broken.json`
- [ ] `query-param-state-correct-type-fixed.json`

---

### 4. Component Dependency Property Validation (Schema Validation)

#### Pattern: Wrong Property Names

**Broken Patterns**:
```javascript
// ❌ Typo in property name
<SimpleBarChart
  dta={chartData}      // Should be 'data'
  xField="Month"
  yField="Revenue"
/>

// ❌ Non-existent property
<SimpleBarChart
  data={chartData}
  xAxis="Month"        // Should be 'xField'
  yField="Revenue"
/>

// ❌ Case mismatch
<SimpleBarChart
  Data={chartData}     // Should be lowercase 'data'
  xField="Month"
  yField="Revenue"
/>
```

**Fixed Patterns**:
```javascript
// ✅ Correct property name
<SimpleBarChart
  data={chartData}
  xField="Month"
  yField="Revenue"
/>
```

**Fixtures Needed**:
- [ ] `component-prop-name-typo-broken.json`
- [ ] `component-prop-name-correct-fixed.json`
- [ ] `component-prop-name-nonexistent-broken.json`
- [ ] `component-prop-name-exists-fixed.json`
- [ ] `component-prop-name-case-broken.json`
- [ ] `component-prop-name-case-fixed.json`

#### Pattern: Wrong Property Types

**Broken Patterns**:
```javascript
// ❌ Array instead of string
<SimpleDrilldownChart
  groupBy={['Category', 'Subcategory']}  // Should be single string
  data={chartData}
/>

// ❌ String instead of array
<DataGrid
  columns="Name,Email,Status"            // Should be array
  data={gridData}
/>

// ❌ Number instead of boolean
<DataGrid
  showPagination={1}                     // Should be boolean
  data={gridData}
/>

// ❌ String instead of number
<SimpleBarChart
  data={chartData}
  maxBars="10"                           // Should be number
/>
```

**Fixed Patterns**:
```javascript
// ✅ Single string
<SimpleDrilldownChart
  groupBy="Category"
  data={chartData}
/>

// ✅ Array of strings
<DataGrid
  columns={['Name', 'Email', 'Status']}
  data={gridData}
/>

// ✅ Boolean value
<DataGrid
  showPagination={true}
  data={gridData}
/>

// ✅ Number value
<SimpleBarChart
  data={chartData}
  maxBars={10}
/>
```

**Fixtures Needed**:
- [ ] `component-prop-type-array-to-string-broken.json`
- [ ] `component-prop-type-string-correct-fixed.json`
- [ ] `component-prop-type-string-to-array-broken.json`
- [ ] `component-prop-type-array-correct-fixed.json`
- [ ] `component-prop-type-number-to-boolean-broken.json`
- [ ] `component-prop-type-boolean-correct-fixed.json`
- [ ] `component-prop-type-string-to-number-broken.json`
- [ ] `component-prop-type-number-correct-fixed.json`

---

### 5. Cross-Component Data Flow (Type Rules)

#### Pattern: RunView Results → Component

**Broken Patterns**:
```javascript
// ❌ Passing entire result object instead of Results array
const result = await utilities.RunView('Members');
<DataGrid data={result} />  // Should be result.Results

// ❌ Using wrong result property
const result = await utilities.RunView('Members');
<DataGrid data={result.records} />  // Should be result.Results

// ❌ Passing filtered data with wrong field reference
const result = await utilities.RunView('Members');
const filtered = result.Results.filter(m => m.MemberShipType === 'Premium'); // Typo
<DataGrid data={filtered} />
```

**Fixed Patterns**:
```javascript
// ✅ Passing Results array
const result = await utilities.RunView('Members');
<DataGrid data={result.Results} />

// ✅ Using correct result property
const result = await utilities.RunView('Members');
<DataGrid data={result.Results} />

// ✅ Filtered data with correct field
const result = await utilities.RunView('Members');
const filtered = result.Results.filter(m => m.MembershipType === 'Premium');
<DataGrid data={filtered} />
```

**Fixtures Needed**:
- [ ] `runview-to-component-wrong-property-broken.json`
- [ ] `runview-to-component-results-fixed.json`
- [ ] `runview-to-component-filtered-typo-broken.json`
- [ ] `runview-to-component-filtered-correct-fixed.json`

#### Pattern: RunView Results → Transformed → Component

**Broken Patterns**:
```javascript
// ❌ Mapping with typo in field name
const result = await utilities.RunView('Members');
const chartData = result.Results.map(m => ({
  name: m.FristName,     // Typo: should be FirstName
  value: m.MembershipFee
}));
<SimpleBarChart data={chartData} xField="name" yField="value" />

// ❌ Grouping by non-existent field
const result = await utilities.RunView('Members');
const grouped = result.Results.reduce((acc, m) => {
  const type = m.Type;  // Field doesn't exist, should be MembershipType
  acc[type] = (acc[type] || 0) + 1;
  return acc;
}, {});
<SimpleBarChart data={Object.entries(grouped)} />

// ❌ Spread with invalid field
const result = await utilities.RunView('Members');
const enhanced = result.Results.map(m => ({
  ...m,
  displayName: m.DisplayName  // Field doesn't exist
}));
<DataGrid data={enhanced} />
```

**Fixed Patterns**:
```javascript
// ✅ Mapping with correct field names
const result = await utilities.RunView('Members');
const chartData = result.Results.map(m => ({
  name: m.FirstName,
  value: m.MembershipFee
}));
<SimpleBarChart data={chartData} xField="name" yField="value" />

// ✅ Grouping by valid field
const result = await utilities.RunView('Members');
const grouped = result.Results.reduce((acc, m) => {
  const type = m.MembershipType;
  acc[type] = (acc[type] || 0) + 1;
  return acc;
}, {});
<SimpleBarChart data={Object.entries(grouped)} />

// ✅ Spread with computed field
const result = await utilities.RunView('Members');
const enhanced = result.Results.map(m => ({
  ...m,
  displayName: `${m.FirstName} ${m.LastName}`
}));
<DataGrid data={enhanced} />
```

**Fixtures Needed**:
- [ ] `runview-transform-map-typo-broken.json`
- [ ] `runview-transform-map-correct-fixed.json`
- [ ] `runview-transform-reduce-invalid-field-broken.json`
- [ ] `runview-transform-reduce-valid-field-fixed.json`
- [ ] `runview-transform-spread-invalid-field-broken.json`
- [ ] `runview-transform-spread-computed-fixed.json`

#### Pattern: RunQuery Results → Component

**Broken Patterns**:
```javascript
// ❌ Passing entire result object instead of Results
const result = await utilities.RunQuery('Top Products');
<DataGrid data={result} />  // Should be result.Results

// ❌ Using query field not in results
const result = await utilities.RunQuery('Top Products');
const data = result.Results.map(r => ({
  product: r.ProductName,
  revenue: r.TotalRevenue  // Field not returned by query
}));
<SimpleBarChart data={data} />
```

**Fixed Patterns**:
```javascript
// ✅ Passing Results array
const result = await utilities.RunQuery('Top Products');
<DataGrid data={result.Results} />

// ✅ Using fields returned by query
const result = await utilities.RunQuery('Top Products');
const data = result.Results.map(r => ({
  product: r.ProductName,
  revenue: r.Revenue
}));
<SimpleBarChart data={data} />
```

**Fixtures Needed**:
- [ ] `runquery-to-component-wrong-property-broken.json`
- [ ] `runquery-to-component-results-fixed.json`
- [ ] `runquery-to-component-invalid-field-broken.json`
- [ ] `runquery-to-component-valid-field-fixed.json`

#### Pattern: Component → Component Data Flow

**Broken Patterns**:
```javascript
// ❌ Passing data with wrong field to next component
const result = await utilities.RunView('Members');
const chartData = result.Results.map(m => ({
  category: m.MembershipType,
  count: 1
}));

// Later, using wrong field name for grouping
<SimpleDrilldownChart
  data={chartData}
  groupBy="type"      // Should be 'category'
/>

// ❌ Filtering data, then using filtered field in next component
const result = await utilities.RunView('Members');
const activeMembers = result.Results.filter(m => m.Status === 'Active');
<DataGrid
  data={activeMembers}
  columns={[
    { field: 'FirstName' },
    { field: 'Subscription' }  // Field doesn't exist on Member entity
  ]}
/>
```

**Fixed Patterns**:
```javascript
// ✅ Using matching field names
const result = await utilities.RunView('Members');
const chartData = result.Results.map(m => ({
  category: m.MembershipType,
  count: 1
}));

<SimpleDrilldownChart
  data={chartData}
  groupBy="category"
/>

// ✅ Using valid entity fields
const result = await utilities.RunView('Members');
const activeMembers = result.Results.filter(m => m.Status === 'Active');
<DataGrid
  data={activeMembers}
  columns={[
    { field: 'FirstName' },
    { field: 'MembershipType' }
  ]}
/>
```

**Fixtures Needed**:
- [ ] `component-to-component-field-mismatch-broken.json`
- [ ] `component-to-component-field-match-fixed.json`
- [ ] `component-to-component-invalid-field-broken.json`
- [ ] `component-to-component-valid-field-fixed.json`

---

### 6. DataGrid Column Validation (Schema Validation)

#### Pattern: Entity DataGrid with Invalid Fields

**Broken Patterns**:
```javascript
// ❌ Column field doesn't exist on entity
<DataGrid
  entityName="Members"
  columns={[
    { field: 'FullName' },     // Entity doesn't have FullName field
    { field: 'Email' }
  ]}
/>

// ❌ Typo in field name
<DataGrid
  entityName="Members"
  columns={[
    { field: 'FristName' },    // Should be FirstName
    { field: 'Email' }
  ]}
/>

// ❌ Case mismatch
<DataGrid
  entityName="Members"
  columns={[
    { field: 'firstname' },    // Should be FirstName (PascalCase)
    { field: 'email' }
  ]}
/>

// ❌ Array of strings instead of FieldDef objects
<DataGrid
  entityName="Members"
  columns={['FirstName', 'LastName', 'InvalidField']}  // InvalidField doesn't exist
/>
```

**Fixed Patterns**:
```javascript
// ✅ All fields exist on entity
<DataGrid
  entityName="Members"
  columns={[
    { field: 'FirstName' },
    { field: 'LastName' },
    { field: 'Email' }
  ]}
/>

// ✅ Correct field names
<DataGrid
  entityName="Members"
  columns={[
    { field: 'FirstName' },
    { field: 'Email' }
  ]}
/>

// ✅ Correct case
<DataGrid
  entityName="Members"
  columns={[
    { field: 'FirstName' },
    { field: 'Email' }
  ]}
/>

// ✅ Array of valid field names
<DataGrid
  entityName="Members"
  columns={['FirstName', 'LastName', 'Email']}
/>
```

**Fixtures Needed**:
- [ ] `datagrid-entity-field-nonexistent-broken.json`
- [ ] `datagrid-entity-field-exists-fixed.json`
- [ ] `datagrid-entity-field-typo-broken.json`
- [ ] `datagrid-entity-field-correct-fixed.json`
- [ ] `datagrid-entity-field-case-broken.json`
- [ ] `datagrid-entity-field-case-fixed.json`
- [ ] `datagrid-entity-strings-invalid-broken.json`
- [ ] `datagrid-entity-strings-valid-fixed.json`

#### Pattern: Query DataGrid with Invalid Fields

**Broken Patterns**:
```javascript
// ❌ Column field not returned by query
<DataGrid
  queryName="Top Products"
  columns={[
    { field: 'ProductName' },
    { field: 'TotalRevenue' }  // Query doesn't return this field
  ]}
/>

// ❌ Typo in query result field
<DataGrid
  queryName="Sales Report"
  columns={[
    { field: 'AccountNaem' },  // Should be AccountName
    { field: 'Revenue' }
  ]}
/>
```

**Fixed Patterns**:
```javascript
// ✅ All fields returned by query
<DataGrid
  queryName="Top Products"
  columns={[
    { field: 'ProductName' },
    { field: 'Revenue' }
  ]}
/>

// ✅ Correct query field names
<DataGrid
  queryName="Sales Report"
  columns={[
    { field: 'AccountName' },
    { field: 'Revenue' }
  ]}
/>
```

**Fixtures Needed**:
- [ ] `datagrid-query-field-nonexistent-broken.json`
- [ ] `datagrid-query-field-exists-fixed.json`
- [ ] `datagrid-query-field-typo-broken.json`
- [ ] `datagrid-query-field-correct-fixed.json`

#### Pattern: Data-Provided DataGrid with Field Mismatches

**Broken Patterns**:
```javascript
// ❌ Column field doesn't exist in provided data
const result = await utilities.RunView('Members');
const data = result.Results.map(m => ({
  name: m.FirstName,
  email: m.Email
}));

<DataGrid
  data={data}
  columns={[
    { field: 'firstName' },    // Data has 'name', not 'firstName'
    { field: 'email' }
  ]}
/>

// ❌ Using entity field when data is transformed
const result = await utilities.RunView('Members');
const transformed = result.Results.map(m => ({
  displayName: `${m.FirstName} ${m.LastName}`,
  contactEmail: m.Email
}));

<DataGrid
  data={transformed}
  columns={[
    { field: 'FirstName' },    // Data has 'displayName', not 'FirstName'
    { field: 'Email' }         // Data has 'contactEmail', not 'Email'
  ]}
/>
```

**Fixed Patterns**:
```javascript
// ✅ Column fields match data shape
const result = await utilities.RunView('Members');
const data = result.Results.map(m => ({
  name: m.FirstName,
  email: m.Email
}));

<DataGrid
  data={data}
  columns={[
    { field: 'name' },
    { field: 'email' }
  ]}
/>

// ✅ Using transformed field names
const result = await utilities.RunView('Members');
const transformed = result.Results.map(m => ({
  displayName: `${m.FirstName} ${m.LastName}`,
  contactEmail: m.Email
}));

<DataGrid
  data={transformed}
  columns={[
    { field: 'displayName' },
    { field: 'contactEmail' }
  ]}
/>
```

**Fixtures Needed**:
- [ ] `datagrid-data-field-mismatch-broken.json`
- [ ] `datagrid-data-field-match-fixed.json`
- [ ] `datagrid-data-transformed-mismatch-broken.json`
- [ ] `datagrid-data-transformed-match-fixed.json`

---

### 7. Chart Component Field Validation (Schema Validation)

#### Pattern: SimpleBarChart with Invalid Fields

**Broken Patterns**:
```javascript
// ❌ xField doesn't exist in data
const result = await utilities.RunQuery('Monthly Sales');
<SimpleBarChart
  data={result.Results}
  xField="Period"       // Query returns 'Month', not 'Period'
  yField="Revenue"
/>

// ❌ yField doesn't exist in data
<SimpleBarChart
  data={result.Results}
  xField="Month"
  yField="TotalRevenue"  // Query returns 'Revenue', not 'TotalRevenue'
/>

// ❌ valueField doesn't exist when grouping
const result = await utilities.RunView('Members');
<SimpleDrilldownChart
  data={result.Results}
  groupBy="MembershipType"
  valueField="Fee"       // Entity doesn't have 'Fee', has 'MembershipFee'
/>
```

**Fixed Patterns**:
```javascript
// ✅ xField exists in query results
const result = await utilities.RunQuery('Monthly Sales');
<SimpleBarChart
  data={result.Results}
  xField="Month"
  yField="Revenue"
/>

// ✅ yField exists in query results
<SimpleBarChart
  data={result.Results}
  xField="Month"
  yField="Revenue"
/>

// ✅ valueField exists on entity
const result = await utilities.RunView('Members');
<SimpleDrilldownChart
  data={result.Results}
  groupBy="MembershipType"
  valueField="MembershipFee"
/>
```

**Fixtures Needed**:
- [ ] `chart-xfield-invalid-broken.json`
- [ ] `chart-xfield-valid-fixed.json`
- [ ] `chart-yfield-invalid-broken.json`
- [ ] `chart-yfield-valid-fixed.json`
- [ ] `chart-valuefield-invalid-broken.json`
- [ ] `chart-valuefield-valid-fixed.json`

#### Pattern: Chart with Transformed Data

**Broken Patterns**:
```javascript
// ❌ Using original field names after transformation
const result = await utilities.RunView('Sales');
const chartData = result.Results.map(s => ({
  category: s.ProductCategory,
  amount: s.SaleAmount
}));

<SimpleBarChart
  data={chartData}
  xField="ProductCategory"  // Data has 'category', not 'ProductCategory'
  yField="SaleAmount"       // Data has 'amount', not 'SaleAmount'
/>

// ❌ Missing field in transformation
const result = await utilities.RunView('Products');
const chartData = result.Results.map(p => ({
  name: p.Name
  // Missing price field
}));

<SimpleBarChart
  data={chartData}
  xField="name"
  yField="price"  // Field doesn't exist in transformed data
/>
```

**Fixed Patterns**:
```javascript
// ✅ Using transformed field names
const result = await utilities.RunView('Sales');
const chartData = result.Results.map(s => ({
  category: s.ProductCategory,
  amount: s.SaleAmount
}));

<SimpleBarChart
  data={chartData}
  xField="category"
  yField="amount"
/>

// ✅ Including all required fields in transformation
const result = await utilities.RunView('Products');
const chartData = result.Results.map(p => ({
  name: p.Name,
  price: p.Price
}));

<SimpleBarChart
  data={chartData}
  xField="name"
  yField="price"
/>
```

**Fixtures Needed**:
- [ ] `chart-transformed-field-mismatch-broken.json`
- [ ] `chart-transformed-field-match-fixed.json`
- [ ] `chart-transformed-missing-field-broken.json`
- [ ] `chart-transformed-complete-fixed.json`

---

### 8. Spread Operator Type Safety (Best Practice Rules)

#### Pattern: Spread with Invalid Fields

**Broken Patterns**:
```javascript
// ❌ Spreading entity result with invalid field addition
const result = await utilities.RunView('Members');
const data = result.Results.map(m => ({
  ...m,
  fullName: m.FristName + ' ' + m.LastName  // Typo in FirstName
}));

// ❌ Spreading query result with non-existent field
const result = await utilities.RunQuery('Sales Report');
const enhanced = result.Results.map(r => ({
  ...r,
  profit: r.Revenue - r.Cost  // Query doesn't return 'Cost' field
}));

// ❌ Nested spread with invalid path
const result = await utilities.RunView('Members');
const data = result.Results.map(m => ({
  ...m,
  address: {
    ...m.Address,  // Address is not an object on Member entity
    formatted: `${m.Address.Street}, ${m.Address.City}`
  }
}));
```

**Fixed Patterns**:
```javascript
// ✅ Spreading with correct field names
const result = await utilities.RunView('Members');
const data = result.Results.map(m => ({
  ...m,
  fullName: m.FirstName + ' ' + m.LastName
}));

// ✅ Spreading with available fields only
const result = await utilities.RunQuery('Sales Report');
const enhanced = result.Results.map(r => ({
  ...r,
  revenueFormatted: `$${r.Revenue.toLocaleString()}`
}));

// ✅ Computing from flat fields
const result = await utilities.RunView('Members');
const data = result.Results.map(m => ({
  ...m,
  addressFormatted: `${m.Street}, ${m.City}`
}));
```

**Fixtures Needed**:
- [ ] `spread-entity-invalid-field-broken.json`
- [ ] `spread-entity-valid-field-fixed.json`
- [ ] `spread-query-nonexistent-field-broken.json`
- [ ] `spread-query-available-field-fixed.json`
- [ ] `spread-nested-invalid-broken.json`
- [ ] `spread-flat-fields-fixed.json`

---

### 9. Optional Chaining Type Safety (Best Practice Rules)

#### Pattern: Optional Chaining with Invalid Properties

**Broken Patterns**:
```javascript
// ❌ Optional chaining on wrong result property
const result = await utilities.RunView('Members');
const count = result?.records?.length ?? 0;  // Should be result?.Results?.length

// ❌ Optional chaining on non-existent field
const result = await utilities.RunView('Members');
const firstName = result?.Results?.[0]?.FristName;  // Typo

// ❌ Deep optional chaining with invalid path
const result = await utilities.RunView('Members');
const city = result?.Results?.[0]?.Address?.City;  // Address is not an object
```

**Fixed Patterns**:
```javascript
// ✅ Optional chaining on correct property
const result = await utilities.RunView('Members');
const count = result?.Results?.length ?? 0;

// ✅ Optional chaining on valid field
const result = await utilities.RunView('Members');
const firstName = result?.Results?.[0]?.FirstName;

// ✅ Optional chaining on flat fields
const result = await utilities.RunView('Members');
const city = result?.Results?.[0]?.City;
```

**Fixtures Needed**:
- [ ] `optional-chain-wrong-property-broken.json`
- [ ] `optional-chain-correct-property-fixed.json`
- [ ] `optional-chain-invalid-field-broken.json`
- [ ] `optional-chain-valid-field-fixed.json`
- [ ] `optional-chain-invalid-path-broken.json`
- [ ] `optional-chain-flat-field-fixed.json`

---

### 10. Complex Data Flow Pipelines (Integration Tests)

#### Pattern: Multi-Step Transformations

**Broken Patterns**:
```javascript
// ❌ Pipeline with field error in step 2
const result = await utilities.RunView('Sales');

// Step 1: Filter (correct)
const recent = result.Results.filter(s => s.Date > startDate);

// Step 2: Group (field typo)
const grouped = recent.reduce((acc, s) => {
  const key = s.ProductCatagory;  // Typo: should be ProductCategory
  acc[key] = (acc[key] || 0) + s.Amount;
  return acc;
}, {});

// Step 3: Transform to chart format
const chartData = Object.entries(grouped).map(([cat, total]) => ({
  category: cat,
  total
}));

<SimpleBarChart data={chartData} xField="category" yField="total" />

// ❌ Pipeline with type mismatch in step 3
const result = await utilities.RunQuery('Top Products', { topN: 10 });

// Step 1: Extract product names
const products = result.Results.map(r => r.ProductName);

// Step 2: Filter active products
const active = products.filter(name => name.Status === 'Active');  // String doesn't have Status

// Step 3: Pass to component
<ListComponent items={active} />
```

**Fixed Patterns**:
```javascript
// ✅ Pipeline with all correct field names
const result = await utilities.RunView('Sales');

// Step 1: Filter
const recent = result.Results.filter(s => s.Date > startDate);

// Step 2: Group
const grouped = recent.reduce((acc, s) => {
  const key = s.ProductCategory;
  acc[key] = (acc[key] || 0) + s.Amount;
  return acc;
}, {});

// Step 3: Transform
const chartData = Object.entries(grouped).map(([cat, total]) => ({
  category: cat,
  total
}));

<SimpleBarChart data={chartData} xField="category" yField="total" />

// ✅ Pipeline preserving type information
const result = await utilities.RunQuery('Top Products', { topN: 10 });

// Step 1: Filter active products FIRST (on objects)
const active = result.Results.filter(r => r.Status === 'Active');

// Step 2: Extract product names
const products = active.map(r => r.ProductName);

// Step 3: Pass to component
<ListComponent items={products} />
```

**Fixtures Needed**:
- [ ] `pipeline-multi-step-field-error-broken.json`
- [ ] `pipeline-multi-step-correct-fixed.json`
- [ ] `pipeline-type-loss-broken.json`
- [ ] `pipeline-type-preserved-fixed.json`

---

## Fixture Generation Strategy

### Phase 1: Generate Fixtures (Broken + Fixed Pairs)

For each pattern identified above:

1. **Create broken fixture** - Component with the specific type safety violation
2. **Create fixed fixture** - Corrected version showing proper pattern
3. **Validate with linter** - Broken should detect violation, fixed should pass
4. **Categorize** - Place in appropriate directory per migration structure

### Phase 2: Fixture Metadata

Each fixture should include metadata for validation:

```json
{
  "name": "entity-field-typo",
  "type": "chart",
  "title": "Entity Field Typo - Broken Pattern",
  "description": "Tests linter detection of typo in entity field name (FristName vs FirstName)",
  "expectedViolations": [
    {
      "rule": "entity-field-validation",
      "message": "Field 'FristName' does not exist on entity 'Members'"
    }
  ],
  "requirements": {
    "entity": "Members",
    "fields": ["FirstName", "LastName", "Email", "MembershipType"]
  },
  "code": "function EntityFieldTypo({ utilities }) { ... }"
}
```

### Phase 3: Coverage Matrix

Create a matrix to track coverage:

| Pattern Category | Broken | Fixed | Test Status |
|-----------------|--------|-------|-------------|
| Entity Field Direct Access | 4 | 4 | ⬜ Not Created |
| Entity Field Array Operations | 8 | 8 | ⬜ Not Created |
| Entity Field Spread | 4 | 4 | ⬜ Not Created |
| Query Field Results | 6 | 6 | ⬜ Not Created |
| Query Field Arrays | 6 | 6 | ⬜ Not Created |
| Query Param Types | 10 | 10 | ⬜ Not Created |
| Query Param Variables | 6 | 6 | ⬜ Not Created |
| Component Prop Names | 6 | 6 | ⬜ Not Created |
| Component Prop Types | 8 | 8 | ⬜ Not Created |
| RunView → Component | 4 | 4 | ⬜ Not Created |
| RunView → Transform → Component | 6 | 6 | ⬜ Not Created |
| RunQuery → Component | 4 | 4 | ⬜ Not Created |
| Component → Component | 4 | 4 | ⬜ Not Created |
| DataGrid Entity Fields | 8 | 8 | ⬜ Not Created |
| DataGrid Query Fields | 4 | 4 | ⬜ Not Created |
| DataGrid Data Fields | 4 | 4 | ⬜ Not Created |
| Chart Fields | 6 | 6 | ⬜ Not Created |
| Chart Transformed Data | 4 | 4 | ⬜ Not Created |
| Spread Operators | 6 | 6 | ⬜ Not Created |
| Optional Chaining | 6 | 6 | ⬜ Not Created |
| Multi-Step Pipelines | 4 | 4 | ⬜ Not Created |

**Total New Fixtures**: ~228 (114 broken + 114 fixed)

---

## Implementation Plan

### Step 1: Prioritize Patterns

**High Priority** (Most Common Bugs):
1. Entity field typos and case mismatches
2. Query parameter type mismatches
3. RunView/RunQuery result property errors
4. DataGrid column field validation
5. Component property type mismatches

**Medium Priority**:
6. Array operation field validation
7. Spread operator field validation
8. Chart field validation
9. Cross-component data flow

**Lower Priority** (Edge Cases):
10. Multi-step transformation pipelines
11. Deep optional chaining
12. Nested spread operations

### Step 2: Generate High Priority Fixtures First

Create fixtures for patterns 1-5 first (~100 fixtures), validate they work with current linter, then proceed to medium priority.

### Step 3: Automate Fixture Generation

Create a fixture generator script:

```typescript
// scripts/generate-fixture.ts
interface FixtureTemplate {
  pattern: string;
  entityName?: string;
  queryName?: string;
  brokenCode: string;
  fixedCode: string;
  expectedViolation: {
    rule: string;
    message: string;
  };
}

function generateFixturePair(template: FixtureTemplate): [BrokenFixture, FixedFixture] {
  // Generate broken and fixed fixtures from template
}
```

### Step 4: Validate Each Fixture

After generating each fixture pair:

```bash
# Test broken fixture (should detect violation)
npm run test:fixture fixtures/broken-components/[category]/[name]-broken.json

# Test fixed fixture (should pass with zero violations)
npm run test:fixture fixtures/fixed-components/[category]/[name]-fixed.json
```

### Step 5: Update Coverage Matrix

Track progress in `FIXTURE-COVERAGE-MATRIX.md`:

```markdown
## Coverage Status

- ✅ Entity Field Direct Access (8/8 fixtures created, all passing)
- 🟡 Entity Field Array Operations (4/8 fixtures created)
- ⬜ Entity Field Spread (0/4 fixtures created)
...
```

---

## Fixture Naming Convention

Use descriptive names that include pattern + violation + broken/fixed:

```
[domain]-[operation]-[violation]-broken.json
[domain]-[operation]-[violation]-fixed.json

Examples:
entity-field-typo-broken.json / entity-field-typo-fixed.json
query-param-type-string-to-int-broken.json / query-param-type-int-correct-fixed.json
runview-transform-map-invalid-field-broken.json / runview-transform-map-correct-fixed.json
```

---

## Next Steps

1. **Review this coverage analysis** - Identify any missing patterns
2. **Prioritize pattern categories** - Which are most critical?
3. **Start with high-priority fixtures** - Generate and validate top 20 pairs
4. **Create fixture generator script** - Automate the creation process
5. **Build coverage tracking** - Monitor progress toward 100% coverage

---

## Success Criteria

Coverage is complete when:

- [ ] All 228+ fixture pairs created (broken + fixed)
- [ ] All broken fixtures detect expected violations
- [ ] All fixed fixtures pass with zero violations
- [ ] Coverage matrix shows 100% completion
- [ ] Fixtures organized in migration structure
- [ ] Documentation updated with pattern examples
- [ ] All fixtures tested against refactored linter

This systematic approach ensures the linter catches **every type safety violation** that can occur in real-world component development.
