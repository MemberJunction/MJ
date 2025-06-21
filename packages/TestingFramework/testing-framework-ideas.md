# MemberJunction Scenario Testing Framework

## Overview
Building on the success of the MetadataSync CLI tool, we're creating a scenario-focused testing framework that validates business workflows and system behavior rather than individual code units. This approach recognizes that in a metadata-driven platform like MemberJunction, the framework itself handles validation and correctness - what matters is whether business scenarios execute properly.

## Why Not Traditional Unit Testing?

### The MemberJunction Difference
Traditional unit testing makes sense for systems where developers write custom validation logic, business rules, and data access code. MemberJunction is fundamentally different:

1. **Auto-Generated Validation**: Check constraints, field types, and relationships are automatically enforced at every tier
2. **Metadata-Driven Behavior**: The framework ensures consistency based on metadata definitions
3. **CodeGen Guarantees**: Generated code follows proven patterns - testing it is like testing whether TypeScript enforces types

### What Actually Needs Testing
Instead of testing whether a required field is required (the framework ensures this), we need to test:
- **Business Workflows**: Does the complete customer onboarding process work?
- **Integration Points**: Do AI agents interact correctly with the data layer?
- **Scenario Outcomes**: Does month-end processing produce correct results?
- **System Behavior**: Does the application behave correctly under real-world usage patterns?

## Core Concept
A CLI-based scenario testing framework that validates business behavior through structured, AI-friendly output. This tool serves both AI agents (like Claude) and CI/CD pipelines, focusing on what matters: whether your system behaves correctly for real business scenarios.

## Framework Structure

### 1. Scenario Runner CLI (`mj-test`)
```bash
# Run business scenarios
mj-test run --scenario="new-customer-onboarding"
mj-test run --scenario="month-end-processing"
mj-test run --scenario="ai-agent-conversation"

# List available scenarios
mj-test list scenarios

# Run scenarios by tag
mj-test run --tag="financial"
mj-test run --tag="ai-agents"

# AI-friendly commands
mj-test explain "invoice-approval-workflow"
mj-test suggest --based-on="recent-changes"
mj-test validate --scenario="data-migration"
```

### 2. Rich Output for AI and Human Consumption
```
[SCENARIO_START] New Customer Onboarding
[CONTEXT] {"sessionId": "abc-123", "timestamp": "2024-01-15T10:00:00Z"}
[WHY] Testing complete customer setup including credit validation and system access

[STEP 1/5] Create Customer Entity
[BUSINESS_RULE] New customers require credit check for approval
[ACTION] Creating customer "Acme Corp" with type "Corporate"
[RESULT] CustomerID: 12345 created successfully
[CONTEXT_UPDATE] {"customerId": 12345}

[STEP 2/5] Execute Credit Check
[USING] Action: "RunCreditCheck" with CustomerID: 12345
[INTEGRATION] Called external credit service
[RESULT] CreditScore: 750, Status: "Approved"

[VALIDATION] Customer.Status == 'Active' ✓
[VALIDATION] Customer.CreditLimit == 50000 ✓
[VALIDATION] AuditLog contains credit check entry ✓

[SCENARIO_PASS] New Customer Onboarding completed in 2.4s
[BUSINESS_OUTCOME] Customer ready for transactions
```

### 3. Scenario Categories
- **Business Workflows**: Multi-step processes that span entities and actions
- **AI Agent Scenarios**: Testing Skip agents, prompts, and conversation flows
- **Data Processing**: Batch operations, ETL processes, calculations
- **Integration Scenarios**: External service interactions, API workflows
- **Permission Scenarios**: Complex authorization rules in practice
- **State Transitions**: Entity lifecycle and status management

### 4. Scenario Definition Format
```yaml
# scenarios/customer-onboarding.yaml
name: "New Customer Onboarding"
tags: ["customer", "onboarding", "credit-check"]
description: "Complete customer setup with credit check and initial configuration"
context:
  environment: "{{ env }}"
  testData: 
    customerType: "Corporate"
    
steps:
  - name: "Create Customer"
    action: "CreateEntity"
    entity: "Customer"
    data:
      Name: "{{ generateCompanyName() }}"
      Type: "{{ context.testData.customerType }}"
    capture:
      customerId: "$.ID"
      
  - name: "Run Credit Check"
    action: "ExecuteAction"
    actionName: "RunCreditCheck"
    params:
      CustomerID: "{{ context.customerId }}"
    expectations:
      CreditScore: ">= 600"
      Status: "Approved"
      
  - name: "Validate Final State"
    action: "ValidateState"
    assertions:
      - entity: "Customer"
        id: "{{ context.customerId }}"
        fields:
          Status: "Active"
          CreditLimit: "> 0"
      - entity: "AuditLog"
        where: "EntityID = '{{ context.customerId }}'"
        exists: true
        contains: "Credit Check Performed"
```

## AI Agent Integration

### 1. Scenario Execution Agent
- Understands business context of each scenario
- Intelligently sequences dependent scenarios
- Provides meaningful progress updates
- Explains failures in business terms

### 2. Scenario Analysis Agent
- Reviews failing scenarios to identify business impact
- Correlates failures with recent system changes
- Suggests which scenarios to run based on code changes
- Provides root cause analysis in business language

### 3. Scenario Generation Agent
- Creates new scenarios from:
  - User stories and requirements
  - Observed system usage patterns
  - Gap analysis of untested workflows
  - AI conversation logs (for Skip integration)

### 4. Business Impact Agent
- Assesses which business processes are affected by failures
- Prioritizes scenario fixes based on business criticality
- Generates executive-friendly test reports

## Implementation Approach

### Phase 1: Core Framework
```typescript
// Base scenario class focused on business workflows
export abstract class MJScenario {
  name: string;
  description: string;
  businessContext: string;
  
  async run(): Promise<ScenarioResult> {
    console.log(`[SCENARIO_START] ${this.name}`);
    console.log(`[WHY] ${this.businessContext}`);
    console.log(`[CONTEXT] ${JSON.stringify(this.context)}`);
    
    const results = [];
    
    for (const step of this.steps) {
      console.log(`[STEP ${step.number}/${this.steps.length}] ${step.name}`);
      console.log(`[BUSINESS_RULE] ${step.businessRule}`);
      
      try {
        const stepResult = await this.executeStep(step);
        console.log(`[RESULT] ${stepResult.summary}`);
        
        if (step.capture) {
          this.updateContext(step.capture, stepResult);
          console.log(`[CONTEXT_UPDATE] ${JSON.stringify(step.capture)}`);
        }
        
        results.push(stepResult);
      } catch (error) {
        console.log(`[STEP_FAILED] ${error.message}`);
        console.log(`[BUSINESS_IMPACT] ${this.assessImpact(step, error)}`);
        throw error;
      }
    }
    
    console.log(`[SCENARIO_PASS] ${this.name} completed`);
    console.log(`[BUSINESS_OUTCOME] ${this.expectedOutcome}`);
    
    return { status: 'PASS', steps: results };
  }
}
```

### Phase 2: Scenario Types
- **Workflow Scenarios**: Multi-step business processes with state management
- **AI Agent Scenarios**: Skip conversation flows and component generation
- **Integration Scenarios**: External service interactions and data synchronization
- **Migration Scenarios**: Data transformation and upgrade processes
- **Performance Scenarios**: Load testing and scalability validation

### Phase 3: Intelligent Orchestration
- Scenario dependency management (run prerequisites first)
- Parallel execution of independent scenarios
- Smart retry with business context awareness
- Natural language scenario discovery: "Show me all financial reporting scenarios"

## Why This Approach Works Better

### 1. **Business Alignment**
Traditional unit tests verify code correctness. Scenario tests verify business correctness:
- "Can we onboard a new customer?" vs "Does the save() method work?"
- "Does month-end closing complete successfully?" vs "Are all fields validated?"

### 2. **Reduced Maintenance**
When MemberJunction's framework changes (new validation, updated CodeGen), scenarios still pass if business outcomes are correct. Unit tests would break even though nothing is actually wrong.

### 3. **AI Optimization**
AI agents understand business scenarios better than code units:
- "The credit check step failed" is more actionable than "assertEqual failed on line 47"
- Business context helps AI suggest meaningful fixes

### 4. **Real-World Testing**
Scenarios test the system as users actually use it:
- Complete workflows, not isolated functions
- Integration points working together
- Actual data flowing through the system

## Example Scenario Output
```
[SCENARIO_START] Monthly Invoice Processing
[WHY] Validates end-to-end invoice generation, approval, and payment workflow
[CONTEXT] {"month": "2024-01", "customerCount": 127, "expectedInvoices": 127}

[STEP 1/4] Generate Monthly Invoices
[BUSINESS_RULE] All active customers with usage > 0 should receive invoices
[ACTION] Executing Action: "GenerateMonthlyInvoices" for period 2024-01
[SQL] Generated 127 invoices totaling $45,231.50
[RESULT] Successfully created 127 invoices
[CONTEXT_UPDATE] {"invoiceIds": [1001, 1002, ..., 1127], "totalAmount": 45231.50}

[STEP 2/4] Apply Business Rules
[BUSINESS_RULE] Customers with credit balance should have it applied to invoices
[ACTION] Executing Action: "ApplyCreditsToInvoices"
[RESULT] Applied $3,420.00 in credits across 23 invoices
[VALIDATION] All credit applications have audit trail ✓

[STEP 3/4] Route for Approval
[BUSINESS_RULE] Invoices over $5,000 require manager approval
[ACTION] Identifying high-value invoices
[RESULT] 8 invoices routed to approval queue
[VALIDATION] Approval workflows initiated ✓
[VALIDATION] Notifications sent to managers ✓

[STEP 4/4] Validate Final State
[BUSINESS_RULE] All invoices should be in correct status with proper totals
[VALIDATION] 119 invoices in "Ready to Send" status ✓
[VALIDATION] 8 invoices in "Pending Approval" status ✓
[VALIDATION] Total invoice amount matches expected usage ✓
[VALIDATION] All invoices have PDF attachments generated ✓

[SCENARIO_PASS] Monthly Invoice Processing completed in 4.7s
[BUSINESS_OUTCOME] 127 invoices ready for distribution, 8 pending approval
[METRICS] {"totalInvoices": 127, "totalValue": 45231.50, "creditsApplied": 3420.00}
```

## Skip AI Integration Example
```
[SCENARIO_START] Skip Analysis Request
[WHY] Validates AI agent can understand request, gather data, and generate visualizations
[CONTEXT] {"user": "test@example.com", "conversationId": "conv-456"}

[STEP 1/3] Process Natural Language Request  
[USER_INPUT] "Show me revenue trends by product category for the last 6 months"
[AI_AGENT] ConductorAgent analyzing request
[NLP_RESULT] Intent: "revenue_analysis", TimeRange: "6 months", GroupBy: "product_category"

[STEP 2/3] Generate Analysis Components
[AI_AGENT] AnalysisAgent creating visualization spec
[COMPONENTS_GENERATED] 2 charts, 1 summary table, 1 insight panel
[VALIDATION] All components have valid React code ✓
[VALIDATION] Data queries reference existing entities ✓

[STEP 3/3] Validate Execution
[RENDER_TEST] Components render without errors ✓
[DATA_TEST] Queries return expected shape ✓
[PERFORMANCE] Total generation time: 1.8s ✓

[SCENARIO_PASS] Skip Analysis Request completed
[BUSINESS_OUTCOME] User can view revenue analysis with interactive visualizations
```

## Integration with CI/CD
```yaml
# .github/workflows/test-scenarios.yml
name: Business Scenario Tests
on: [push, pull_request]

jobs:
  test-scenarios:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Run Critical Business Scenarios
        run: |
          mj-test run --tag="critical" --fail-fast
          
      - name: Run Integration Scenarios
        run: |
          mj-test run --tag="integration" --parallel
          
      - name: Generate Business Impact Report
        if: failure()
        run: |
          mj-test report --format="business-impact" > impact-report.md
          
      - name: AI Analysis of Failures
        if: failure()
        run: |
          mj-test analyze --with-ai --suggest-fixes
```

## Future Enhancements
- **Scenario Recording**: Capture real user workflows and convert to test scenarios
- **Chaos Testing**: Randomly fail services to test resilience
- **Time Travel Testing**: Run scenarios with historical data states
- **Multi-Tenant Scenarios**: Validate isolation and data security
- **Scenario Composition**: Build complex scenarios from smaller reusable parts

## Summary

This framework recognizes that in a metadata-driven platform like MemberJunction, testing individual code units is like testing whether gravity works - the framework ensures it. What matters is whether your business processes execute correctly end-to-end. By focusing on scenarios rather than units, we create tests that:

1. **Survive refactoring** - Business outcomes matter, not implementation details
2. **Provide clear value** - "Customer onboarding works" vs "Method X returns Y"
3. **Enable AI assistance** - Business context makes failures understandable
4. **Match real usage** - Test what users actually do, not what developers wrote

The result is a testing framework that validates what truly matters: **Does the system serve the business correctly?**