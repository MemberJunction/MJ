You are a metadata specialist for MemberJunction. Your task is to add a new AI model to the MemberJunction metadata system by editing the metadata JSON files.

## Process

1. **Gather Model Information**
   - Ask the user for the model name (e.g., "Claude Haiku 4.5", "GPT-4 Turbo")
   - Ask for the vendor name (e.g., "Anthropic", "OpenAI", "Google")
   - **Validate naming convention** (see Naming Conventions section below)
   - **If user provides a documentation URL, use WebFetch to extract exact specifications**
   - Use WebSearch to find current specifications:
     - API name/identifier (including preview vs GA naming)
     - Token limits (input and output - verify actual documented limits)
     - Pricing (per million tokens, including tiered pricing if applicable)
     - Release date (exact date, not approximations)
     - Key features and capabilities
     - **Reasoning/Extended Thinking support** (for SupportsEffortLevel determination)
     - Knowledge cutoff date
     - Performance benchmarks (for SpeedRank determination)

2. **Verify Specifications with Targeted Searches**
   - Search specifically for output token limits (often documented separately from pricing)
   - Search for official release date announcements (don't approximate)
   - Search for context window details (distinguish between input limit and total window)
   - Search for performance/speed benchmarks to inform SpeedRank
   - **Always verify the current year** - use environment context, don't assume dates

3. **Validate Naming Convention & Determine SupportsEffortLevel**
   - **Query existing models** in the same family for both naming patterns AND effort level support:
     ```sql
     SELECT m.Name, mv.SupportsEffortLevel, v.Name AS Vendor
     FROM __mj.AIModel m
     INNER JOIN __mj.AIModelVendor mv ON m.ID = mv.ModelID
       AND mv.TypeID = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3' -- Inference Provider
     INNER JOIN __mj.AIVendor v ON mv.VendorID = v.ID
     WHERE m.Name LIKE '%{Brand}%'
     ORDER BY m.Name
     ```
   - **Naming Validation**: Compare proposed name against patterns in Naming Conventions section
   - **STOP and ask user to confirm** if name doesn't match established conventions
   - Common naming issues to catch:
     - GPT version numbers with hyphen instead of space (`GPT-5.2` → `GPT 5.2`)
     - Claude models without spaces (`Claude3.5Sonnet` → `Claude 3.5 Sonnet`)
     - Variant suffixes with space instead of hyphen (`GPT 5 mini` → `GPT 5-mini`)
   - **SupportsEffortLevel Determination**: See detailed guidance in "SupportsEffortLevel Guidelines" section below

4. **Verify Vendor Exists in Metadata**
   - Check `/metadata/ai-vendors/.ai-vendors.json` for the vendor
   - Confirm the vendor name matches exactly (e.g., "Anthropic", "OpenAI", "Google")
   - If vendor doesn't exist, you'll need to add it first (see "Adding New Vendors" section)

5. **UUIDs Are Generated Automatically**
   - **DO NOT generate UUIDs** for new records
   - **DO NOT include `primaryKey` or `sync` sections** for new records
   - The `mj-sync push` command will automatically generate UUIDs and sync metadata
   - Only include `primaryKey` and `sync` when editing existing records

6. **Determine Rankings**
   - **PowerRank** (1-21+): Model capability level
     - 1-5: Basic models
     - 6-10: Capable models
     - 11-15: Advanced models
     - 16-20: Highly advanced models
     - 21+: State-of-the-art frontier models
   - **SpeedRank** (1-12): Response speed
     - 1-4: Slower models
     - 5-8: Medium speed
     - 9-12: Fastest models
   - **CostRank** (1-12): Price tier
     - 1-3: Most affordable
     - 4-6: Mid-tier pricing
     - 7-9: Higher pricing
     - 10-12: Premium pricing

7. **Add Model to Metadata File**
   - Open `/metadata/ai-models/.ai-models.json`
   - Add the new model entry at the **end of the array** (before the closing `]`)
   - Follow the template structure below
   - Use `@lookup` syntax for foreign key references
   - Use `@parent:ID` for related entity references to the parent model
   - **CRITICAL**: Do NOT include `primaryKey` or `sync` sections - mj-sync generates these automatically

8. **Review Existing Models**
   - Look at other models in `.ai-models.json` as reference
   - Ensure consistency with existing patterns
   - Verify vendor name matches exactly with `.ai-vendors.json`

## Metadata JSON Template

**IMPORTANT**: For new records, DO NOT include `primaryKey` or `sync` sections. These are generated automatically by mj-sync.

```json
{
  "fields": {
    "Name": "{Model Name}",
    "PowerRank": {PowerRank},
    "Description": "{Vendor}'s {positioning description}. Features {context window} token context window and {output capacity} output capacity. {Notable capabilities} with knowledge cutoff of {Month Year}.",
    "AIModelTypeID": "@lookup:AI Model Types.Name=LLM",
    "IsActive": true,
    "SpeedRank": {SpeedRank},
    "CostRank": {CostRank},
    "InheritTypeModalities": true
  },
  "relatedEntities": {
    "MJ: AI Model Vendors": [
      {
        "fields": {
          "ModelID": "@parent:ID",
          "VendorID": "@lookup:MJ: AI Vendors.Name={Vendor}",
          "Priority": 0,
          "Status": "Active",
          "SupportedResponseFormats": "Any",
          "SupportsEffortLevel": {false or true},
          "SupportsStreaming": false,
          "TypeID": "@lookup:MJ: AI Vendor Type Definitions.Name=Model Developer"
        }
      },
      {
        "fields": {
          "ModelID": "@parent:ID",
          "VendorID": "@lookup:MJ: AI Vendors.Name={Vendor}",
          "Priority": 0,
          "Status": "Active",
          "DriverClass": "{VendorDriverClass}",
          "APIName": "{api-name-from-vendor}",
          "MaxInputTokens": {MaxInputTokens},
          "MaxOutputTokens": {MaxOutputTokens},
          "SupportedResponseFormats": "{Any, JSON or Any}",
          "SupportsEffortLevel": {false or true},
          "SupportsStreaming": true,
          "TypeID": "@lookup:MJ: AI Vendor Type Definitions.Name=Inference Provider"
        }
      }
    ],
    "MJ: AI Model Costs": [
      {
        "fields": {
          "ModelID": "@parent:ID",
          "VendorID": "@lookup:MJ: AI Vendors.Name={Vendor}",
          "StartedAt": "{YYYY-MM-DDTHH:MM:SS.sssZ}",
          "Status": "Active",
          "Currency": "USD",
          "PriceTypeID": "@lookup:MJ: AI Model Price Types.Name=Tokens",
          "InputPricePerUnit": {InputPrice},
          "OutputPricePerUnit": {OutputPrice},
          "UnitTypeID": "@lookup:MJ: AI Model Price Unit Types.Name=Per 1M Tokens",
          "ProcessingType": "Realtime",
          "Comments": "{Model Name} pricing on {Vendor} as of {Month Year}. {Additional pricing notes if applicable}"
        }
      }
    ]
  }
}
```

## Naming Conventions

**CRITICAL**: Model names must follow established naming patterns to maintain consistency:

### OpenAI GPT Models

1. **Version Numbers** (use SPACE after "GPT"):
   - ✅ Correct: `GPT 3.5`, `GPT 4`, `GPT 4.1`, `GPT 5`, `GPT 5.2`
   - ❌ Wrong: `GPT-3.5`, `GPT-4`, `GPT-5.2`
   - Rule: Base version numbers always use space between "GPT" and the version

2. **Model Variants** (use HYPHEN before variant suffix):
   - ✅ Correct: `GPT 4o-mini`, `GPT 5-mini`, `GPT 5-nano`, `GPT-OSS-120B`
   - ❌ Wrong: `GPT 4o mini`, `GPT 5 mini`, `GPT 5 nano`
   - Rule: Variant suffixes (mini, nano, turbo, etc.) use hyphen

3. **Model Series Designators** (no space/hyphen):
   - ✅ Correct: `GPT 4o`, `GPT 4o-mini`
   - ❌ Wrong: `GPT 4 o`, `GPT 4-o`
   - Rule: Series designators (like "o" for omni) attach directly to version

### Anthropic Claude Models

1. **Base Models** (space after "Claude"):
   - ✅ Correct: `Claude 3.5 Sonnet`, `Claude 3 Opus`, `Claude 4.5 Sonnet`
   - ❌ Wrong: `Claude-3.5-Sonnet`, `Claude3.5Sonnet`
   - Rule: Always use spaces between all components

2. **Model Classes**: Haiku (smallest), Sonnet (balanced), Opus (most capable)
   - Order of elements: Brand → Version → Class
   - Example: `Claude 4.5 Sonnet` (not `Claude Sonnet 4.5`)

### General Rules

- **Version numbers**: Use dots for decimals (e.g., `4.1`, `3.5`, `5.2`)
- **Spaces vs Hyphens**:
  - Space: Between brand and version (`GPT 5`, `Claude 4.5`)
  - Hyphen: Before variant suffixes (`GPT 5-mini`, not `GPT 5 mini`)
- **Capitalization**: Match official vendor branding exactly
- **Special Names**: Preserve vendor-specific naming (e.g., `GPT 4o` where "o" = omni)

### Validation Checklist

Before adding to metadata, verify:
1. Does the name match existing models in the same family?
2. Are spaces and hyphens used correctly per conventions above?
3. Is the version format consistent (e.g., `5.2` not `5-2`)?
4. Query existing models to confirm pattern: `SELECT Name FROM __mj.AIModel WHERE Name LIKE '%{Brand}%' ORDER BY Name`

**If unsure about naming, query the database first to see how similar models are named.**

## SupportsEffortLevel Guidelines

**CRITICAL**: The `SupportsEffortLevel` field indicates whether a model supports reasoning/extended thinking capabilities (also called "deep thinking", "chain-of-thought", or "o-series" features in various vendor docs).

### What is SupportsEffortLevel?

- **Value = true (or 1)**: Model supports extended reasoning/thinking time before responding
  - User can request deeper analysis with longer processing time
  - Model "thinks through" complex problems step-by-step
  - Often associated with higher quality reasoning on difficult tasks
  - Examples: OpenAI's "o1" reasoning, Anthropic's Extended Thinking, Google's thinking mode

- **Value = false (or 0)**: Standard model without extended reasoning capabilities
  - Responds with normal latency
  - No adjustable thinking/reasoning time
  - Standard generation behavior

### Current Patterns by Vendor (as of database state)

**OpenAI:**
- ✅ SupportsEffortLevel = true: `GPT 5`, `GPT 5-mini`, `GPT 5-nano`, `GPT 5.2`
- ❌ SupportsEffortLevel = false: `GPT 3.5`, `GPT 4`, `GPT 4.1`, `GPT 4o`, `GPT 4o-mini`
- **Pattern**: GPT 5.x series introduced reasoning capabilities

**Anthropic:**
- ✅ SupportsEffortLevel = true: `Claude 4 Opus`, `Claude 4 Sonnet`, `Claude 4.5 Opus`, `Claude 4.5 Sonnet`, `Claude Haiku 4.5`
- ❌ SupportsEffortLevel = false: `Claude 3 - Haiku`, `Claude 3 - Opus`, `Claude 3 - Sonnet`, `Claude 3.5 Sonnet`, `Claude 3.7 Sonnet`
- **Pattern**: Claude 4.x and later support Extended Thinking

**Google:**
- ✅ SupportsEffortLevel = true: `Gemini 3 Pro`
- ❌ SupportsEffortLevel = false: All Gemini 1.x and 2.x models (Flash, Pro, Ultra)
- **Pattern**: Gemini 3.x series introduced thinking mode capabilities

**Other Vendors:**
- Groq/Cerebras: Set to true for OSS models (may support reasoning depending on model architecture)
- LM Studio/Azure/Bedrock: Follow the underlying model's capabilities

### How to Determine SupportsEffortLevel

**Step 1: Query Database for Pattern**
```sql
SELECT m.Name, mv.SupportsEffortLevel
FROM __mj.AIModel m
INNER JOIN __mj.AIModelVendor mv ON m.ID = mv.ModelID
  AND mv.TypeID = '5B043EC3-1FF2-4730-B5D2-7CFDA50979B3'
WHERE m.Name LIKE '%{Brand}%'
ORDER BY m.Name
```

**Step 2: Web Search for Capabilities**
Search for terms like:
- "{Model Name} reasoning capabilities"
- "{Model Name} extended thinking"
- "{Model Name} o-series" or "thinking mode" or "deep thinking"
- "{Vendor} reasoning models"
- Check official API docs for reasoning/thinking parameters

**Step 3: Version-Based Rules**
- **If adding a variant** (mini, nano) of an existing model:
  - Use same SupportsEffortLevel as base model
  - Example: `GPT 5-mini` follows `GPT 5` → both are true

- **If adding a new version series**:
  - Check if vendor announced reasoning/thinking support
  - Compare to patterns above
  - When in doubt, search for "{Model Name} reasoning" or "{Model Name} thinking"

**Step 4: Conservative Default**
- If documentation is unclear, default to false
- Better to under-promise and verify than incorrectly set to true
- Can be updated in a future sync if reasoning support is confirmed

### Search Examples

Good search queries:
- ✅ "GPT 5.2 reasoning capabilities"
- ✅ "Gemini 3 Flash thinking mode"
- ✅ "Claude 4.5 extended thinking"
- ✅ "OpenAI o-series models comparison"

### Validation Checklist

Before setting SupportsEffortLevel in metadata:
- [ ] Queried database for existing models in same family
- [ ] Searched vendor docs for reasoning/thinking capabilities
- [ ] Verified version series patterns (e.g., all GPT 5.x = true)
- [ ] If uncertain, defaulted to false and documented reason

## Key Rules

1. **DO NOT include `primaryKey` or `sync` sections** for new records - mj-sync generates these automatically
2. **DO NOT generate UUIDs** for new records - mj-sync handles this
3. **Use @lookup syntax** for foreign key references: `@lookup:EntityName.FieldName=Value`
4. **Use @parent:ID** for referencing the parent model's ID in related entities
5. **Validate naming convention** before adding to metadata (see Naming Conventions section)
6. **Query existing models** in the same family to confirm naming pattern
7. **Determine SupportsEffortLevel correctly** by querying database and searching for reasoning/thinking capabilities (see SupportsEffortLevel Guidelines)
8. **Use WebFetch for official docs** when URLs are provided by the user
9. **Use WebSearch** to get accurate, current model specifications
10. **Search specifically for output token limits** - they're often documented separately from pricing
11. **Verify dates match current year** - check environment context, don't assume
12. **Include benchmark data** when available to justify PowerRank/SpeedRank assignments
13. **Add new entries at the end** of the .ai-models.json array
14. **Use ISO 8601 format** for timestamps in date fields: `YYYY-MM-DDTHH:MM:SS.sssZ`

## Driver Class Names by Vendor

- **Anthropic**: `AnthropicLLM`
- **OpenAI**: `OpenAILLM`
- **Google/Gemini**: `GeminiLLM`
- **Mistral**: `MistralLLM`
- **Groq**: `GroqLLM`
- **Cerebras**: `CerebrasLLM`
- **x.ai**: `xAILLM`
- **Alibaba Cloud**: `QwenLLM`
- **Moonshot AI**: `KimiLLM`

## Adding New Vendors

If the vendor doesn't exist in `/metadata/ai-vendors/.ai-vendors.json`, add it following this template:

**IMPORTANT**: For new vendor records, DO NOT include `primaryKey` or `sync` sections. These are generated automatically by mj-sync.

```json
{
  "fields": {
    "Name": "{Vendor Name}",
    "Description": "{Brief description of vendor}",
    "CredentialTypeID": "@lookup:MJ: Credential Types.Name=API Key"
  }
}
```

Add the new vendor entry at the end of the array in `.ai-vendors.json`.

## Final Steps

1. Add the model entry to `/metadata/ai-models/.ai-models.json`
2. Save the file with proper JSON formatting
3. Run metadata sync to push changes to database: `npx mj-sync push --dir=./metadata`
4. Verify the model appears in the database with correct relationships
5. Confirm the model is available in the application

## Example Entry

Here's an example of a complete model entry for a **new** record (without `primaryKey` and `sync` sections):

```json
{
  "fields": {
    "Name": "Grok 4",
    "PowerRank": 19,
    "Description": "x.ai's frontier reasoning model with advanced capabilities for complex tasks. Features a 256K token context window and state-of-the-art performance across various domains.",
    "AIModelTypeID": "@lookup:AI Model Types.Name=LLM",
    "IsActive": true,
    "SpeedRank": 6,
    "CostRank": 8,
    "InheritTypeModalities": true
  },
  "relatedEntities": {
    "MJ: AI Model Vendors": [
      {
        "fields": {
          "ModelID": "@parent:ID",
          "VendorID": "@lookup:MJ: AI Vendors.Name=x.ai",
          "Priority": 0,
          "Status": "Active",
          "SupportedResponseFormats": "Any",
          "SupportsEffortLevel": false,
          "SupportsStreaming": false,
          "TypeID": "@lookup:MJ: AI Vendor Type Definitions.Name=Model Developer"
        }
      },
      {
        "fields": {
          "ModelID": "@parent:ID",
          "VendorID": "@lookup:MJ: AI Vendors.Name=x.ai",
          "Priority": 0,
          "Status": "Active",
          "DriverClass": "xAILLM",
          "APIName": "grok-4-0709",
          "MaxInputTokens": 256000,
          "MaxOutputTokens": 8192,
          "SupportedResponseFormats": "Any, JSON",
          "SupportsEffortLevel": false,
          "SupportsStreaming": true,
          "TypeID": "@lookup:MJ: AI Vendor Type Definitions.Name=Inference Provider"
        }
      }
    ],
    "MJ: AI Model Costs": [
      {
        "fields": {
          "ModelID": "@parent:ID",
          "VendorID": "@lookup:MJ: AI Vendors.Name=x.ai",
          "StartedAt": "2026-01-08T14:56:43.153Z",
          "Status": "Active",
          "Currency": "USD",
          "PriceTypeID": "@lookup:MJ: AI Model Price Types.Name=Tokens",
          "InputPricePerUnit": 3,
          "OutputPricePerUnit": 15,
          "UnitTypeID": "@lookup:MJ: AI Model Price Unit Types.Name=Per 1M Tokens",
          "ProcessingType": "Realtime",
          "Comments": "Grok 4 pricing on x.ai as of January 2025"
        }
      }
    ]
  }
}
```

**Note**: When you run `npx mj-sync push`, the tool will automatically add `primaryKey` (with generated UUIDs) and `sync` sections to this record.
