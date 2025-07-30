# AI Cost Tracking System in MJ

## Overview

The MJ platform implements a comprehensive AI cost tracking system designed to handle the complexity of multi-vendor AI pricing across different models, processing types, and temporal changes. This system addresses the challenge that AI vendors (Anthropic, OpenAI, Google, etc.) do not provide programmatic access to their current pricing information, requiring manual tracking and calculation of API costs.

## Problem Statement

AI API costs are notoriously difficult to track because:

- **No Pricing APIs**: Neither Anthropic nor OpenAI provide endpoints to retrieve current pricing programmatically
- **Complex Pricing Models**: Different vendors use different units (per 1M tokens vs per 1K tokens vs per minute)
- **Input/Output Pricing**: Most vendors charge different rates for input vs output tokens
- **Processing Type Variations**: Batch processing often offers 50% discounts compared to real-time processing
- **Frequent Price Changes**: Vendors regularly adjust pricing, requiring historical tracking
- **Token-Based Calculations**: Costs are calculated based on actual token usage returned in API responses

## Architecture Overview

Our solution uses a flexible, normalized database schema with three core tables in the `__mj` schema:

```
__mj.AIModelPriceType     (What is being priced: Tokens, Minutes, etc.)
__mj.AIModelPriceUnitType (Unit scale: Per 1M, Per 1K, with normalization drivers)
__mj.AIModelCost         (Actual pricing data with temporal tracking)
```

## Key Design Decisions

### Single Row Approach
Instead of separate records for input/output pricing, we store both prices in a single row:
- `InputPricePerUnit DECIMAL(18,8)`
- `OutputPricePerUnit DECIMAL(18,8)`

**Rationale**: Vendors always publish pricing as input/output pairs, making this approach more natural and preventing orphaned pricing records.

### Driver Class Pattern
Each `AIModelPriceUnitType` includes a `DriverClass` field containing the class name responsible for normalizing different vendor pricing scales:

```csharp
// Example driver classes
TokenPer1M    // Normalizes "per 1M tokens" pricing
TokenPer1K    // Normalizes "per 1K tokens" pricing
TimePerMinute // Normalizes "per minute" pricing
```

**Rationale**: Vendors quote prices in different scales (Anthropic: per 1M tokens, others might use per 1K tokens), requiring programmatic normalization for accurate cost calculations. The DriverClass field is unique across all records to prevent conflicts.

### Optional Temporal Tracking
The `StartedAt` and `EndedAt` fields are nullable, making historical tracking optional:
- `StartedAt DATETIMEOFFSET(7) NULL DEFAULT SYSDATETIMEOFFSET()`
- `EndedAt DATETIMEOFFSET(7) NULL`

**Rationale**: Simple pricing scenarios don't require temporal tracking, but the capability exists for comprehensive cost analysis and vendor price change tracking.

### Processing Type Differentiation
The `ProcessingType` field distinguishes between `Realtime` and `Batch` processing:

**Rationale**: Many vendors offer significant batch discounts (e.g., Anthropic's 50% batch discount), requiring separate pricing records for accurate cost calculation.

## Schema Details

### Core Tables

**AIModelPriceType**
- Defines pricing metrics (Tokens, Minutes, Characters, API Calls)
- Extensible for future pricing models
- **Constraints**:
  - `Name`: NVARCHAR(100), NOT NULL, must not be empty/whitespace, UNIQUE
  - `Description`: NVARCHAR(500), NULL
  - `ID`: UNIQUEIDENTIFIER with DEFAULT NEWID()

**AIModelPriceUnitType**
- Defines unit scales with associated driver classes
- Handles vendor-specific pricing unit differences
- Enables programmatic cost normalization
- **Constraints**:
  - `Name`: NVARCHAR(100), NOT NULL, must not be empty/whitespace, UNIQUE
  - `Description`: NVARCHAR(500), NULL
  - `DriverClass`: NVARCHAR(200), NOT NULL, must not be empty/whitespace, UNIQUE
  - `ID`: UNIQUEIDENTIFIER with DEFAULT NEWID()

**AIModelCost**
- Central pricing repository with full temporal tracking
- Status management (Active, Pending, Expired, Invalid)
- Currency support with ISO 4217 codes
- Comprehensive constraint validation
- **Field Specifications**:
  - `ID`: UNIQUEIDENTIFIER with DEFAULT NEWID()
  - `Status`: NVARCHAR(20), must be one of: 'Active', 'Pending', 'Expired', 'Invalid'
  - `Currency`: NCHAR(3), exactly 3 uppercase characters (ISO 4217)
  - `InputPricePerUnit`: DECIMAL(18,8), must be >= 0
  - `OutputPricePerUnit`: DECIMAL(18,8), must be >= 0
  - `ProcessingType`: NVARCHAR(20), must be either 'Realtime' or 'Batch'
  - `Comments`: NVARCHAR(1000), NULL
  - `StartedAt`: DATETIMEOFFSET(7), NULL, DEFAULT SYSDATETIMEOFFSET()
  - `EndedAt`: DATETIMEOFFSET(7), NULL, must be > StartedAt when both are present

### Foreign Key Relationships

```sql
AIModelCost.ModelID    → __mj.AIModel.ID
AIModelCost.VendorID   → __mj.AIVendor.ID
AIModelCost.PriceTypeID → __mj.AIModelPriceType.ID
AIModelCost.UnitTypeID  → __mj.AIModelPriceUnitType.ID
```

## Implementation Workflow

### 1. Cost Calculation Process
```csharp
// Pseudo-code for cost calculation
var pricing = GetActivePricing(modelId, processingType);
var driver = GetDriverClass(pricing.UnitTypeID);
var inputCost = driver.CalculateCost(apiResponse.InputTokens, pricing.InputPricePerUnit);
var outputCost = driver.CalculateCost(apiResponse.OutputTokens, pricing.OutputPricePerUnit);
var totalCost = inputCost + outputCost;
```

### 2. Pricing Updates
```sql
-- Expire old pricing
UPDATE __mj.AIModelCost 
SET EndedAt = SYSDATETIMEOFFSET(), Status = 'Expired'
WHERE ModelID = @ModelId AND Status = 'Active';

-- Add new pricing
INSERT INTO __mj.AIModelCost (ModelID, VendorID, Status, Currency, 
    InputPricePerUnit, OutputPricePerUnit, ProcessingType, ...)
VALUES (@ModelId, @VendorId, 'Active', 'USD', @NewInputPrice, @NewOutputPrice, 'Realtime', ...);
```

### 3. Historical Analysis
```sql
-- Cost trends over time
SELECT StartedAt, InputPricePerUnit, OutputPricePerUnit
FROM __mj.AIModelCost 
WHERE ModelID = @ModelId 
ORDER BY StartedAt DESC;
```

## Benefits

### Flexibility
- Supports any vendor pricing model through driver classes
- Handles both simple and complex temporal tracking needs
- Extensible for future pricing mechanisms

### Accuracy
- Precise decimal storage (18,8) for micro-pricing scenarios - 18 total digits with 8 decimal places
- Timezone-aware temporal tracking with DATETIMEOFFSET(7) - 7-digit fractional seconds precision
- Comprehensive constraint validation prevents data integrity issues:
  - Non-negative price validation
  - Date range validation (EndedAt > StartedAt)
  - String trimming validation (no whitespace-only values)
  - Enum validation for Status and ProcessingType
  - Currency format validation (3 uppercase characters)

### Operational Efficiency
- Single-query cost lookups for active pricing
- Historical pricing analysis for cost optimization
- Automated temporal management with status tracking

### Vendor Agnostic
- Unified interface across all AI vendors
- Consistent cost calculation regardless of vendor pricing models
- Easy integration of new vendors through existing schema

## Usage Examples

### Current Claude 4 Sonnet Pricing
```sql
INSERT INTO __mj.AIModelCost VALUES (
    NEWID(), @ClaudeModelId, @AnthropicVendorId,
    DEFAULT, NULL, 'Active', 'USD',
    @TokensPriceTypeId, 3.00, 15.00, @Per1MTokensUnitId,
    'Realtime', 'Standard Claude 4 Sonnet pricing as of Jan 2025'
);
```

### Batch Processing Discount
```sql
INSERT INTO __mj.AIModelCost VALUES (
    NEWID(), @ClaudeModelId, @AnthropicVendorId,
    DEFAULT, NULL, 'Active', 'USD',
    @TokensPriceTypeId, 1.50, 7.50, @Per1MTokensUnitId,
    'Batch', '50% batch discount for Claude 4 Sonnet'
);
```

## Future Enhancements

### Planned Features
- Volume discount tiers with usage thresholds
- Regional pricing support for geographic variations
- Automated pricing update notifications
- Cost prediction based on historical usage patterns

### Integration Points
- Real-time cost calculation in API request/response cycle
- Cost analytics dashboard for usage optimization
- Budget alerts and spending limits
- Vendor cost comparison analysis

## Conclusion

This AI cost tracking system provides MJ with comprehensive, accurate, and flexible cost management for AI services. By addressing the lack of vendor pricing APIs through a robust database schema and driver class architecture, the system enables precise cost calculation, historical analysis, and operational efficiency across multiple AI vendors and pricing models.