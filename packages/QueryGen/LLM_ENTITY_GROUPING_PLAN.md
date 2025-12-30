# LLM-Based Entity Grouping Implementation Plan

## Overview

Replace the deterministic hub-and-spoke entity grouping algorithm with an LLM-based semantic approach that understands business context and generates meaningful entity combinations for query generation.

## Key Design Decision: Single vs Multiple LLM Calls

### Option A: Single LLM Call (RECOMMENDED)
**Generate all entity groups in one LLM invocation**

**Advantages:**
- **Cost Efficient**: One LLM call instead of N calls (for 57 entities: $0.01 vs potentially $0.50+)
- **Global Context**: LLM can see full schema and avoid duplicate/overlapping groups
- **Better Diversity**: Can balance groups across different business domains in single pass
- **Consistent Quality**: All groups generated with same context and reasoning
- **Simpler Implementation**: One prompt, one validation pass

**Disadvantages:**
- **Output Length**: Could hit output token limits for very large schemas (100+ entities)
- **All-or-Nothing**: If generation fails, must retry entire operation

**Recommendation**: Use single call with structured JSON output. For schemas with 50-100 entities, this is clearly optimal. Only switch to batching if you exceed ~150 entities or hit output token limits.

### Option B: Multiple LLM Calls
**Generate groups iteratively or per-hub-entity**

**Advantages:**
- **Scales to Large Schemas**: Can handle 500+ entity schemas
- **Fault Tolerance**: Partial results if some calls fail

**Disadvantages:**
- **High Cost**: 50-100x more expensive for typical schemas
- **Context Loss**: Each call doesn't know what previous calls generated
- **Duplicate Groups**: More complex deduplication needed
- **Quality Issues**: Inconsistent reasoning across calls

---

## Phase 1: Core LLM Entity Grouping

### 1.1 Update EntityGroup Interface

**File**: `/packages/QueryGen/src/types/schema.ts`

```typescript
export interface EntityGroup {
  entities: EntityInfo[];
  relationships: EntityRelationshipInfo[];
  primaryEntity: EntityInfo;
  relationshipType: 'single' | 'parent-child' | 'many-to-many';

  // NEW: LLM-generated semantic metadata
  businessDomain: string;           // "Sales Pipeline", "Inventory Management"
  businessRationale: string;        // Why this grouping makes business sense
  expectedQuestionTypes: string[];  // ["trend_analysis", "aggregation", "comparison"]
}
```

**Changes:**
- Add semantic fields to existing interface (no breaking changes to consumers)
- For single-entity groups, use sensible defaults (domain = entity name, etc.)

### 1.2 Create LLM Entity Grouping Prompt

**File**: `/metadata/prompts/entity-grouping/entity-group-generator.prompt.md`

```markdown
# Entity Group Generator

You are a database analyst helping to identify meaningful entity groupings for business intelligence query generation.

## Task

Given a database schema, identify logical entity groups that make sense for business questions. Each group should represent a coherent business concept or process that users would naturally ask questions about.

## Input Schema

**Schema Name**: {{ schemaName }}

**Entities** ({{ entities.length }} total):

{% for entity in entities %}
### {{ entity.Name }}
- **Description**: {{ entity.Description || 'No description' }}
- **Schema**: {{ entity.SchemaName }}
- **Fields**: {{ entity.Fields.length }} fields
- **Related Entities**:
  {% for rel in entity.RelatedEntities %}
  - {{ rel.RelatedEntity }} ({{ rel.Type }})
  {% endfor %}
{% endfor %}

## Relationship Graph

```
{{ relationshipGraph }}
```

## Guidelines

1. **Business Relevance**: Focus on entity combinations that support real business questions
   - ✅ GOOD: "Customers + Orders + OrderDetails" (sales analysis)
   - ❌ BAD: "SystemLogs + UserPreferences + EmailTemplates" (unrelated)

2. **Relationship Types**:
   - **Single Entity**: Standalone entities with rich data (all entities should get a single-entity group)
   - **Parent-Child**: Natural hierarchies (Customer → Orders, Product → Categories)
   - **Many-to-Many**: Bridge tables connecting related concepts (Products ↔ Categories via ProductCategories)
   - **Transactional Flow**: Process chains (Lead → Opportunity → Quote → Order)

3. **Size Constraints**:
   - Minimum: {{ minGroupSize }} entities
   - Maximum: {{ maxGroupSize }} entities
   - Target total groups: {{ targetGroupCount }}

4. **Connectivity**: All entities in a group must be connected by foreign key relationships

5. **Coverage**: Prioritize covering all important entities at least once

6. **Business Domains**: Common domains include:
   - Sales & Revenue (customers, orders, payments)
   - Inventory & Products (products, categories, suppliers, stock)
   - Marketing (campaigns, leads, conversions)
   - Operations (shipments, fulfillment, logistics)
   - Finance (invoices, payments, accounts)
   - Human Resources (employees, departments, roles)
   - Customer Service (tickets, cases, support)

## Output Format

Return a JSON array of entity groups. Each group MUST include:

```json
{
  "groups": [
    {
      "entities": ["EntityName1", "EntityName2", "EntityName3"],
      "primaryEntity": "EntityName1",
      "businessDomain": "Sales Pipeline Analysis",
      "businessRationale": "Tracks customer journey from lead to closed sale, essential for sales forecasting and conversion analysis",
      "relationshipType": "parent-child",
      "expectedQuestionTypes": ["trend_analysis", "funnel_analysis", "conversion_rates"]
    }
  ]
}
```

**Important**:
- `entities`: Array of exact entity names from the schema (must match exactly)
- `primaryEntity`: The "hub" or most important entity in the group
- `businessDomain`: Clear business domain label (2-5 words)
- `businessRationale`: One sentence explaining why this grouping matters
- `relationshipType`: One of: "single", "parent-child", "many-to-many"
- `expectedQuestionTypes`: Array of question types this group supports

## Example Output

```json
{
  "groups": [
    {
      "entities": ["Customers"],
      "primaryEntity": "Customers",
      "businessDomain": "Customer Master Data",
      "businessRationale": "Core customer information and demographics for segmentation and analysis",
      "relationshipType": "single",
      "expectedQuestionTypes": ["segmentation", "demographics", "customer_profiling"]
    },
    {
      "entities": ["Customers", "Orders"],
      "primaryEntity": "Customers",
      "businessDomain": "Customer Purchasing Behavior",
      "businessRationale": "Links customers to their purchase history for lifetime value and repeat purchase analysis",
      "relationshipType": "parent-child",
      "expectedQuestionTypes": ["lifetime_value", "repeat_purchase", "customer_retention"]
    },
    {
      "entities": ["Products", "Categories", "Suppliers"],
      "primaryEntity": "Products",
      "businessDomain": "Product Catalog Management",
      "businessRationale": "Complete product information including categorization and sourcing for inventory and procurement decisions",
      "relationshipType": "parent-child",
      "expectedQuestionTypes": ["product_mix", "supplier_analysis", "category_performance"]
    }
  ]
}
```

Generate entity groups now.
```

**File**: `/metadata/prompts/entity-grouping/.entity-grouping-prompts.json`

```json
{
  "prompts": [
    {
      "type": "AIPromptEntity",
      "fields": {
        "Name": "Entity Group Generator",
        "Description": "Analyzes database schema to generate semantically meaningful entity groupings for business query generation",
        "Prompt": "@file:entity-group-generator.prompt.md",
        "PromptRole": "User",
        "CategoryID": "@lookup:AI Prompt Categories.Name=Query Generation",
        "IsActive": true,
        "JSONSchema": "@file:entity-group-generator.schema.json"
      },
      "children": [
        {
          "type": "AIPromptModelEntity",
          "relation": "PromptID",
          "records": [
            { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=Claude 4.5 Sonnet", "VendorID": "@lookup:MJ: AI Vendors.Name=Anthropic", "Priority": 6 } },
            { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=Kimi K2", "VendorID": "@lookup:MJ: AI Vendors.Name=Groq", "Priority": 5 } },
            { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=GPT-4.5o", "VendorID": "@lookup:MJ: AI Vendors.Name=OpenAI", "Priority": 4 } },
            { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=Gemini 2.0 Flash", "VendorID": "@lookup:MJ: AI Vendors.Name=Google", "Priority": 3 } },
            { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=Llama 3.3 70B Versatile", "VendorID": "@lookup:MJ: AI Vendors.Name=Groq", "Priority": 2 } },
            { "fields": { "PromptID": "@parent:ID", "ModelID": "@lookup:AI Models.Name=Gemini 2.0 Flash Thinking", "VendorID": "@lookup:MJ: AI Vendors.Name=Google", "Priority": 1 } }
          ]
        }
      ]
    }
  ]
}
```

**File**: `/metadata/prompts/entity-grouping/entity-group-generator.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["groups"],
  "properties": {
    "groups": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["entities", "primaryEntity", "businessDomain", "businessRationale", "relationshipType", "expectedQuestionTypes"],
        "properties": {
          "entities": {
            "type": "array",
            "items": { "type": "string" },
            "minItems": 1,
            "maxItems": 10,
            "description": "Array of entity names in this group (must match schema exactly)"
          },
          "primaryEntity": {
            "type": "string",
            "description": "The hub or most important entity in the group"
          },
          "businessDomain": {
            "type": "string",
            "minLength": 3,
            "maxLength": 100,
            "description": "Clear business domain label"
          },
          "businessRationale": {
            "type": "string",
            "minLength": 10,
            "maxLength": 500,
            "description": "One sentence explaining business value"
          },
          "relationshipType": {
            "type": "string",
            "enum": ["single", "parent-child", "many-to-many"],
            "description": "Type of relationships between entities"
          },
          "expectedQuestionTypes": {
            "type": "array",
            "items": { "type": "string" },
            "minItems": 1,
            "maxItems": 5,
            "description": "Types of questions this group can answer"
          }
        }
      }
    }
  }
}
```

### 1.3 Create Graph Visualization Helper

**File**: `/packages/QueryGen/src/utils/graph-helpers.ts`

```typescript
import { EntityInfo } from '@memberjunction/core';

/**
 * Generates a simple text-based relationship graph for LLM prompts
 */
export function generateRelationshipGraph(entities: EntityInfo[]): string {
  const lines: string[] = [];

  for (const entity of entities) {
    if (entity.RelatedEntities.length === 0) continue;

    const relations = entity.RelatedEntities
      .map(rel => `→ ${rel.RelatedEntity}`)
      .join(', ');

    lines.push(`${entity.Name}: ${relations}`);
  }

  return lines.join('\n');
}

/**
 * Generates a Mermaid diagram (if needed for richer visualization)
 */
export function generateMermaidDiagram(entities: EntityInfo[]): string {
  const lines = ['graph LR'];
  const processedPairs = new Set<string>();

  for (const entity of entities) {
    const safeEntityName = entity.Name.replace(/\s/g, '_');

    for (const rel of entity.RelatedEntities) {
      const safeRelatedName = rel.RelatedEntity.replace(/\s/g, '_');
      const pairKey = [safeEntityName, safeRelatedName].sort().join('|');

      if (!processedPairs.has(pairKey)) {
        lines.push(`  ${safeEntityName}[${entity.Name}] --> ${safeRelatedName}[${rel.RelatedEntity}]`);
        processedPairs.add(pairKey);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Formats entity metadata for LLM prompt (concise version)
 */
export interface EntityMetadataForPrompt {
  Name: string;
  Description: string;
  SchemaName: string;
  FieldCount: number;
  RelatedEntities: Array<{ name: string; type: string }>;
}

export function formatEntitiesForPrompt(entities: EntityInfo[]): EntityMetadataForPrompt[] {
  return entities.map(entity => ({
    Name: entity.Name,
    Description: entity.Description || 'No description available',
    SchemaName: entity.SchemaName || 'dbo',
    FieldCount: entity.Fields.length,
    RelatedEntities: entity.RelatedEntities.map(rel => ({
      name: rel.RelatedEntity,
      type: rel.Type
    }))
  }));
}
```

### 1.4 Implement LLMEntityGrouper Class

**File**: `/packages/QueryGen/src/core/EntityGrouper.ts` (REPLACE EXISTING)

```typescript
import { EntityInfo, EntityRelationshipInfo, Metadata } from '@memberjunction/core';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner, AIPromptParams } from '@memberjunction/ai-prompts';
import { EntityGroup } from '../types/schema';
import { generateRelationshipGraph, formatEntitiesForPrompt } from '../utils/graph-helpers';
import { extractErrorMessage } from '../utils/error-helpers';

/**
 * LLM response format from Entity Group Generator prompt
 */
interface LLMEntityGroupResponse {
  groups: Array<{
    entities: string[];
    primaryEntity: string;
    businessDomain: string;
    businessRationale: string;
    relationshipType: 'single' | 'parent-child' | 'many-to-many';
    expectedQuestionTypes: string[];
  }>;
}

/**
 * Generates entity groups using LLM-based semantic analysis
 *
 * This replaces the deterministic hub-and-spoke algorithm with an
 * intelligent approach that understands business context and generates
 * meaningful entity combinations.
 */
export class EntityGrouper {
  private readonly promptName = 'Entity Group Generator';

  /**
   * Generate semantically meaningful entity groups using LLM analysis
   *
   * @param entities - All entities to analyze
   * @param minSize - Minimum entities per group (typically 1)
   * @param maxSize - Maximum entities per group (typically 3-5)
   * @param targetGroupCount - Desired number of groups (approximate)
   * @returns Array of validated entity groups with business context
   */
  async generateEntityGroups(
    entities: EntityInfo[],
    minSize: number,
    maxSize: number,
    targetGroupCount: number = 75
  ): Promise<EntityGroup[]> {
    try {
      // 1. Prepare schema data for LLM
      const schemaData = this.prepareSchemaData(entities, minSize, maxSize, targetGroupCount);

      // 2. Call LLM to generate groups
      const llmResponse = await this.callLLMForGrouping(schemaData);

      // 3. Validate and convert to EntityGroup objects
      const validatedGroups = this.validateAndConvertGroups(llmResponse, entities);

      // 4. Deduplicate any similar groups
      const deduplicatedGroups = this.deduplicateGroups(validatedGroups);

      return deduplicatedGroups;
    } catch (error: unknown) {
      throw new Error(extractErrorMessage(error, 'EntityGrouper.generateEntityGroups'));
    }
  }

  /**
   * Prepare schema data for LLM prompt
   */
  private prepareSchemaData(
    entities: EntityInfo[],
    minSize: number,
    maxSize: number,
    targetGroupCount: number
  ): Record<string, unknown> {
    const formattedEntities = formatEntitiesForPrompt(entities);
    const relationshipGraph = generateRelationshipGraph(entities);

    // Get schema name from first entity (assume single schema)
    const schemaName = entities[0]?.SchemaName || 'Unknown';

    return {
      schemaName,
      entities: formattedEntities,
      relationshipGraph,
      minGroupSize: minSize,
      maxGroupSize: maxSize,
      targetGroupCount
    };
  }

  /**
   * Call LLM via AIPromptRunner to generate entity groups
   */
  private async callLLMForGrouping(
    schemaData: Record<string, unknown>
  ): Promise<LLMEntityGroupResponse> {
    const promptParams = new AIPromptParams();
    promptParams.prompt = this.promptName;
    promptParams.data = schemaData;
    promptParams.requireValidJSON = true;

    const runner = new AIPromptRunner();
    const result = await runner.ExecutePrompt(promptParams);

    if (!result.Success) {
      throw new Error(`LLM grouping failed: ${result.ErrorMessage}`);
    }

    if (!result.OutputJSON) {
      throw new Error('LLM did not return JSON output');
    }

    return result.OutputJSON as LLMEntityGroupResponse;
  }

  /**
   * Validate LLM output and convert to EntityGroup objects
   */
  private validateAndConvertGroups(
    llmResponse: LLMEntityGroupResponse,
    entities: EntityInfo[]
  ): EntityGroup[] {
    const entityMap = new Map(entities.map(e => [e.Name, e]));
    const validGroups: EntityGroup[] = [];

    for (const llmGroup of llmResponse.groups) {
      try {
        // Validate all entity names exist
        const groupEntities = llmGroup.entities
          .map(name => entityMap.get(name))
          .filter((e): e is EntityInfo => e !== undefined);

        if (groupEntities.length !== llmGroup.entities.length) {
          console.warn(`Skipping group "${llmGroup.businessDomain}": contains unknown entities`);
          continue;
        }

        // Validate primary entity exists
        const primaryEntity = entityMap.get(llmGroup.primaryEntity);
        if (!primaryEntity) {
          console.warn(`Skipping group "${llmGroup.businessDomain}": primary entity "${llmGroup.primaryEntity}" not found`);
          continue;
        }

        // Build relationships array (collect all relationships between entities in the group)
        const relationships = this.extractRelationships(groupEntities);

        // Validate connectivity (all entities must be reachable from primary)
        if (groupEntities.length > 1 && !this.isConnected(groupEntities, relationships)) {
          console.warn(`Skipping group "${llmGroup.businessDomain}": entities are not connected`);
          continue;
        }

        // Create EntityGroup with LLM metadata
        validGroups.push({
          entities: groupEntities,
          relationships,
          primaryEntity,
          relationshipType: llmGroup.relationshipType,
          businessDomain: llmGroup.businessDomain,
          businessRationale: llmGroup.businessRationale,
          expectedQuestionTypes: llmGroup.expectedQuestionTypes
        });
      } catch (error: unknown) {
        console.warn(`Skipping invalid group: ${extractErrorMessage(error, 'validateGroup')}`);
      }
    }

    if (validGroups.length === 0) {
      throw new Error('No valid entity groups generated by LLM');
    }

    return validGroups;
  }

  /**
   * Extract relationships between entities in a group
   */
  private extractRelationships(entities: EntityInfo[]): EntityRelationshipInfo[] {
    const entityNames = new Set(entities.map(e => e.Name));
    const relationships: EntityRelationshipInfo[] = [];

    for (const entity of entities) {
      for (const rel of entity.RelatedEntities) {
        if (entityNames.has(rel.RelatedEntity)) {
          relationships.push(rel);
        }
      }
    }

    return relationships;
  }

  /**
   * Check if all entities in a group are connected by relationships
   */
  private isConnected(entities: EntityInfo[], relationships: EntityRelationshipInfo[]): boolean {
    if (entities.length <= 1) return true;

    // Build adjacency map
    const adjacency = new Map<string, Set<string>>();
    for (const entity of entities) {
      adjacency.set(entity.Name, new Set());
    }

    for (const rel of relationships) {
      const entityName = entities.find(e =>
        e.RelatedEntities.includes(rel)
      )?.Name;

      if (entityName) {
        adjacency.get(entityName)?.add(rel.RelatedEntity);
        adjacency.get(rel.RelatedEntity)?.add(entityName); // Bidirectional
      }
    }

    // BFS from first entity
    const visited = new Set<string>();
    const queue = [entities[0].Name];
    visited.add(entities[0].Name);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = adjacency.get(current) || new Set();

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    // All entities should be visited
    return visited.size === entities.length;
  }

  /**
   * Remove duplicate or highly similar groups
   */
  private deduplicateGroups(groups: EntityGroup[]): EntityGroup[] {
    const seen = new Set<string>();
    const unique: EntityGroup[] = [];

    for (const group of groups) {
      // Create normalized key (sorted entity names)
      const key = group.entities.map(e => e.Name).sort().join('|');

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(group);
      }
    }

    return unique;
  }
}
```

### 1.5 Update Generate Command

**File**: `/packages/QueryGen/src/cli/commands/generate.ts`

Minimal changes needed - EntityGrouper interface stays the same:

```typescript
// Line ~68 - Add targetGroupCount parameter
const entityGroups = await grouper.generateEntityGroups(
  allEntities,
  config.minEntitiesPerGroup,
  config.maxEntitiesPerGroup,
  config.targetGroupCount || 75  // NEW: Add target count
);
```

**File**: `/packages/QueryGen/src/cli/config.ts`

Add new configuration option:

```typescript
export interface QueryGenConfig {
  // ... existing fields ...
  targetGroupCount: number;  // NEW: Desired number of entity groups
}

export function loadConfig(options: Record<string, unknown>): QueryGenConfig {
  return {
    // ... existing config ...
    targetGroupCount: (options.targetGroupCount as number) || 75
  };
}
```

### 1.6 Update CLI Command Flags

**File**: `/packages/MJCLI/src/commands/querygen/generate.ts`

```typescript
static flags = {
  // ... existing flags ...
  'target-groups': Flags.integer({
    char: 't',
    description: 'Target number of entity groups to generate',
    default: 75
  }),
};

// In run():
const options: Record<string, unknown> = {
  // ... existing options ...
  targetGroupCount: flags['target-groups'],
};
```

---

## Phase 2: Testing & Validation

### 2.1 Test on AssociationDemo Schema

```bash
# Test with verbose output to see group details
QUERYGEN_COUNT_ONLY=true mj querygen generate \
  --max-entities 3 \
  --target-groups 75 \
  --verbose

# Expected output:
# Found 75 entity groups
#   Single entities: 58
#   Pairs (1-hop): ~10-15
#   Triples (bridge/connected): ~2-5
#   Sample groups:
#     Single: Customers
#     Pair: Customers + Orders
#     Triple: Organizations + OrganizationContacts + Contacts
```

### 2.2 Validation Checklist

- [ ] All entity names in LLM output match schema exactly
- [ ] Primary entities exist in entity list
- [ ] All multi-entity groups are connected
- [ ] Business domains are meaningful and diverse
- [ ] No duplicate groups (same entity set)
- [ ] Group count is within reasonable range (50-150)
- [ ] Single-entity groups generated for all important entities
- [ ] LLM respects maxGroupSize constraint

### 2.3 Error Handling

Key error scenarios to handle:
1. **LLM returns invalid JSON**: Retry with explicit JSON mode
2. **Entity names don't match**: Fuzzy matching with warning
3. **Disconnected groups**: Skip with warning
4. **Too few groups**: Lower threshold or ask LLM to generate more
5. **Too many groups**: Take top N by business relevance score

---

## Phase 3: Integration with Question Generation

### 3.1 Update Business Question Prompt

**File**: `/metadata/prompts/business-question-generator.template.md`

Add new fields to template data:

```markdown
## Entity Group Context

**Business Domain**: {{ businessDomain }}

**Business Rationale**: {{ businessRationale }}

**Expected Question Types**: {{ expectedQuestionTypes | join(", ") }}

## Entities in Group
...
```

### 3.2 Pass Metadata to Question Generator

**File**: `/packages/QueryGen/src/core/QuestionGenerator.ts`

Update `formatEntityGroupForPrompt()` to include new fields:

```typescript
private formatEntityGroupForPrompt(group: EntityGroup): Record<string, unknown> {
  return {
    businessDomain: group.businessDomain,
    businessRationale: group.businessRationale,
    expectedQuestionTypes: group.expectedQuestionTypes,
    entities: group.entities.map(e => ({
      name: e.Name,
      // ... rest of entity metadata
    }))
  };
}
```

This provides additional context to help the question generator create more relevant, targeted questions.

---

## Phase 4: Monitoring & Refinement

### 4.1 Add Telemetry

Track key metrics:
- LLM token usage for grouping call
- Number of groups generated vs target
- Number of groups filtered out (invalid)
- Distribution of group sizes (1, 2, 3+ entities)
- Business domain diversity

### 4.2 Quality Metrics

Define success criteria:
- **Coverage**: % of entities included in at least one group
- **Relevance**: Human review of sample groups (1-10 rating)
- **Diversity**: Number of unique business domains
- **Connectivity**: % of multi-entity groups that are properly connected
- **Downstream Success**: % of groups that generate valid SQL queries

### 4.3 Prompt Refinement

Iterate on prompt based on:
- Quality of business domains (too generic? too specific?)
- Relevance of entity combinations
- Balance of group sizes
- Coverage of important entities

---

## Future Enhancements

### Enhancement 1: Graph Theory Pre-Clustering

**Goal**: Use deterministic graph algorithms to suggest entity communities, then let LLM refine/label them.

**Algorithms to Explore:**

1. **Community Detection** (Louvain Algorithm)
   - Detects densely connected clusters of entities
   - Use as "suggested groupings" input to LLM
   - LLM validates and adds business context

2. **Centrality Measures** (PageRank, Betweenness)
   - Identify "hub" entities (high degree centrality)
   - Prioritize these entities in grouping
   - Filter out low-value peripheral entities

3. **Minimum Spanning Tree**
   - Find core skeleton of schema relationships
   - Focus LLM attention on primary relationships
   - Avoid redundant/weak connections

**Implementation Approach:**

```typescript
class HybridEntityGrouper {
  async generateEntityGroups(entities: EntityInfo[]): Promise<EntityGroup[]> {
    // 1. Run graph algorithms
    const communities = this.detectCommunities(entities);
    const centralEntities = this.computeCentrality(entities);

    // 2. Generate "suggested groups" from graph analysis
    const suggestedGroups = this.createSuggestedGroups(communities, centralEntities);

    // 3. Pass suggestions to LLM for validation + labeling
    const promptData = {
      entities: formatEntitiesForPrompt(entities),
      suggestedGroups: suggestedGroups,
      instructions: "Review these algorithmically-generated groups. Validate, merge, split, or add business context as needed."
    };

    // 4. LLM refines and adds semantic labels
    const refinedGroups = await this.callLLMWithSuggestions(promptData);

    return refinedGroups;
  }
}
```

**Benefits:**
- Reduces LLM workload (validates vs generates from scratch)
- Leverages mathematical rigor for connectivity
- LLM focuses on semantic labeling and edge cases
- Potentially better quality for very large schemas (200+ entities)

**Dependencies:**
- Graph library (e.g., `graphology`, `jsnx`)
- Community detection implementation (Louvain)
- Performance testing on large schemas

### Enhancement 2: Semantic Similarity Clustering

**Goal**: Embed entity descriptions and cluster by semantic similarity BEFORE considering relationships.

**Approach:**
```typescript
// 1. Embed all entity descriptions
const embeddings = await Promise.all(
  entities.map(e => AIEngine.Instance.EmbedTextLocal(e.Description))
);

// 2. Cluster by cosine similarity (k-means or hierarchical)
const semanticClusters = kMeansClustering(embeddings, k=10);

// 3. Within each cluster, apply relationship constraints
const groups = semanticClusters.flatMap(cluster =>
  this.generateGroupsWithinCluster(cluster, relationships)
);
```

**Example**: "Customer", "Lead", "Contact" would cluster together semantically even if not directly related via FK, enabling cross-entity analysis.

### Enhancement 3: User Feedback Loop

**Goal**: Learn from query success/failure to improve grouping over time.

**Approach:**
- Track which entity groups produce valid SQL queries
- Track which groups generate queries users actually run
- Use this feedback to adjust group generation (upweight successful patterns)
- Could fine-tune a small LLM on "good group examples" from production

### Enhancement 4: Schema-Specific Presets

**Goal**: Maintain curated entity grouping templates for common schema patterns.

**Examples:**
- **E-commerce**: Customers, Orders, Products, Categories, Reviews, Payments
- **CRM**: Accounts, Contacts, Opportunities, Activities, Cases
- **ERP**: Inventory, Suppliers, PurchaseOrders, Warehouses, Shipments

**Implementation:**
- Detect schema type via entity name matching
- Provide preset as "example groups" to LLM
- LLM adapts preset to actual schema

---

## Success Criteria

**Phase 1 (Core LLM Grouping) Complete When:**
- [ ] LLM generates 50-150 groups for typical schema (50-100 entities)
- [ ] All generated groups pass connectivity validation
- [ ] Business domains are diverse and meaningful (manual review)
- [ ] Group generation completes in <30 seconds for typical schema
- [ ] Token cost is <$0.05 per schema analysis
- [ ] Integration with question generation works seamlessly

**Future Enhancement Complete When:**
- [ ] Hybrid approach reduces LLM token usage by 50%
- [ ] Graph algorithms improve coverage of important entities
- [ ] Semantic clustering identifies cross-domain query opportunities
- [ ] Telemetry shows improved query success rates

---

## Rollout Plan

1. **Week 1**: Implement Phase 1 (Core LLM Grouping)
   - Create prompt and metadata
   - Implement EntityGrouper with LLM
   - Add validation logic

2. **Week 2**: Testing & Refinement
   - Test on AssociationDemo schema
   - Test on production schemas (Customers, Orders, etc.)
   - Refine prompt based on quality metrics

3. **Week 3**: Integration
   - Update question generator to use new metadata
   - End-to-end testing (groups → questions → SQL)
   - Performance optimization

4. **Week 4+**: Future Enhancements
   - Implement graph theory pre-clustering (if needed)
   - Add telemetry and monitoring
   - Iterate based on production usage

---

## Open Questions

1. **Prompt Engineering**: Should we include example business questions in the entity grouping prompt to guide the LLM?
   - **Leaning YES**: Helps LLM understand what "meaningful for business questions" means

2. **Retry Strategy**: If LLM generates poor groups, should we retry with adjusted prompt or fall back to deterministic?
   - **Recommend**: Retry once with explicit "generate more diverse groups" instruction, then fall back

3. **Group Size Distribution**: Should we guide LLM on distribution (e.g., "50% single, 30% pairs, 20% triples")?
   - **Recommend**: Let LLM decide naturally based on schema, but monitor distribution

4. **Cost Controls**: Should we add a max token budget and truncate schema if exceeded?
   - **Recommend**: Yes, add warning if schema exceeds 100 entities, offer to focus on subset

5. **Human Review**: Should we add a CLI flag to output groups for manual review before proceeding?
   - **Recommend**: Yes, add `--review-groups` flag that pauses after grouping for inspection

---

## Conclusion

The LLM-based approach solves the combinatorial explosion problem while adding semantic understanding that deterministic algorithms cannot provide. The single-call design is optimal for typical schemas (50-100 entities) and can be extended with graph theory for larger schemas if needed.

**Estimated Implementation Time**: 1-2 weeks for Phase 1, 1-2 weeks for refinement and testing.

**Estimated Cost Per Run**: $0.01-0.03 per schema analysis (one-time cost during setup).

**Expected Quality Improvement**: Significant - groups will be business-relevant rather than structurally arbitrary.
