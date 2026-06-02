# Classify — Setup & Onboarding UX

**Branch:** `knowledge-hub-classify-redesign`
**Status:** Plan (not yet implemented)
**Author:** Jordan Fanapour / Claude
**Created:** 2026-06-02
**Depends on:** [knowledge-hub-classify-redesign.md](./knowledge-hub-classify-redesign.md) (decomposition + new features, merged)

---

## 1. Problem

Setting up a classification pipeline in MJ Explorer is unintuitive. The prerequisites are dispersed across multiple tabs and apps, the required order of operations is unclear, and critical concepts (Entity Documents, Content Source Types, taxonomy modes) are never explained in the UI. Jordan's experience setting up AGRIP's MEL classification required Claude Code with repo access to explain the steps — a typical user would be lost.

### Specific pain points

1. **Entity Document creation** happens on the Vectors tab, not within the Classify app. Users don't know they need one, don't know where to create one, and don't understand what it does.

2. **Setup order is opaque**: Content Source Types → Content Types → Entity Documents → Content Sources → (optionally) vectorize → run pipeline. None of this is explained or guided.

3. **No seed taxonomy generation**: The first pipeline run produces a poor taxonomy without domain context. Users must manually build or import a starting taxonomy — Jordan spent ~2 hours with Claude teaching it about AGRIP before getting a usable seed.

4. **No contextual prompt injection**: The tag extraction prompt has no mechanism for injecting domain-specific context (e.g., "AGRiP's members are Risk Pools, so 'Pools' alone is not a useful tag"). Tags come back non-sensical without business context.

5. **No tutorial or onboarding**: There's no in-app guidance explaining what classification does, why you'd use it, or how to get started.

---

## 2. Current State (Ground Truth)

### Setup flow today

```
1. Navigate to Vectors tab → Create Entity Document (define which entity, which fields to serialize)
2. Navigate to Classify tab → Content Types tab → Create a Content Type (set AI model, min/max tags)
3. Navigate to Classify tab → Sources tab → Create a Content Source:
   - Select Content Source Type (e.g., "Entity")
   - Select Content Type (created in step 2)
   - Select Entity Document (created in step 1)
   - Configure JSON blob (taxonomy mode, thresholds, etc.) — partially exposed in the new source form
4. (Optional) Vectorize the Entity Document content
5. Run the classification pipeline
```

### Tag extraction prompt

File: `metadata/prompts/templates/knowledge-hub/content-autotagging.template.md`

- Extracts title, description, and keywords with weights (0.0–1.0) from content text
- When `ShareTaxonomyWithLLM=true`, the existing tag hierarchy is injected as `{{ existingTaxonomy }}` and the model is instructed to reuse exact tag names
- **No mechanism for injecting domain context** — the prompt has no `{{ organizationContext }}` or `{{ sourceContext }}` variable
- **No seed taxonomy generation prompt exists** — taxonomy grows organically via `auto-grow`/`free-flow` modes in `TagEngine.ResolveTag()`

### Taxonomy modes (from `IContentSourceConfiguration`)

| Mode | Behavior |
|---|---|
| `constrained` | Match only — return null if no match above threshold |
| `auto-grow` | Create new tag under a root subtree if no match |
| `free-flow` | Create new root-level tag if no match |

Tag resolution runs through a multi-tier vector-similarity pipeline in `TagEngine.ResolveTag()`. Scores in `[SuggestThreshold, TagMatchThreshold)` route to `MJ: Tag Suggestions` for human review.

---

## 3. Proposed Features

### 3.1 Guided Setup Wizard

A step-by-step wizard dialog that walks users through creating their first classification pipeline. Triggered by a prominent "Set Up Classification" button on an empty Sources tab (or via a "Get Started" card on the Overview tab when no sources exist).

**Wizard steps:**

| Step | What the user does | What the system does |
|---|---|---|
| 1. Choose Source Type | Select "Entity" (or other source type from a card layout) | Sets the Content Source Type |
| 2. Select Entity | Pick the entity to classify (e.g., "Member Engagement Logs") from a searchable dropdown | Filters available Entity Documents |
| 3. Entity Document | Select an existing Entity Document or create one inline. If creating inline: select which fields to include in the document template (checkboxes), preview the serialized output for one sample record | Creates the Entity Document if needed |
| 4. Content Type | Select an existing Content Type or create one inline. Show a brief explanation: "Content Types control which AI model extracts tags and how many tags per item." | Creates the Content Type if needed |
| 5. Taxonomy Strategy | Choose taxonomy mode via visual cards (Constrained / Auto-Grow / Free-Flow) with plain-language explanations. Option to import/generate a seed taxonomy (see 3.2). Set thresholds with a visual slider showing the match/suggest/reject bands. | Populates `IContentSourceConfiguration` |
| 6. Domain Context | Optional: provide organization-level and source-level context for the AI (see 3.3). Show example: "e.g., AGRiP is an association of government risk pools. 'Pools' refers to member organizations, not swimming pools." | Saves context to configuration |
| 7. Review & Create | Summary of all selections. "Create & Run" or "Create" buttons. | Creates Content Source, optionally kicks off first pipeline run |

**Design principles:**
- Each step has a brief explanation (2-3 sentences) of what the concept is and why it matters
- Steps auto-skip when prerequisites already exist (e.g., if only one Content Type exists, step 4 shows it pre-selected with a "Looks good" confirmation)
- The wizard creates all intermediate records — the user never has to navigate to another tab
- After completion, the user lands on the Sources tab with their new source selected

**Implementation:**
- New standalone component: `ClassifySetupWizardComponent` (`classify-setup-wizard`)
- Dialog-based (not a separate route) — opened from the Sources tab or Overview tab
- Each step is a sub-template within the component (not separate components — the wizard is a single linear flow)
- Uses `Metadata.GetEntityObject()` to create Entity Documents, Content Types, and Content Sources programmatically

### 3.2 Seed Taxonomy Generation

A new capability that generates a suggested starting taxonomy from a sample of content items before running the full pipeline.

**How it works:**

1. User clicks "Generate Seed Taxonomy" during wizard step 5 (or from the Taxonomy tab for an existing source)
2. System samples N content items from the source (e.g., 20–50 items, configurable)
3. A dedicated **seed taxonomy prompt** (new) analyzes the sample and proposes a hierarchical taxonomy:
   - Top-level categories (5–15)
   - Sub-categories under each (2–8 per parent)
   - Brief descriptions for each proposed tag
4. Results are presented in a reviewable tree UI:
   - User can approve, edit, delete, or rearrange proposed tags
   - User can add their own tags
   - "Accept All" and "Accept Selected" bulk actions
5. Accepted tags are created as `MJ: Tags` records under the configured `TagRootID`

**New prompt needed:**
- `metadata/prompts/templates/knowledge-hub/seed-taxonomy-generation.template.md`
- Input: sample content texts (concatenated with separators), domain context (if provided in 3.3), existing tags (if any)
- Output: structured JSON — array of `{ name, description, parentName?, children?: [] }`
- The prompt should explicitly instruct the model to consider the domain context and avoid generic/obvious categories

**Backend:**
- New method on `TagEngine`: `generateSeedTaxonomy(sourceID: string, sampleSize: number, contextUser: UserInfo): Promise<ProposedTag[]>`
- Loads sample content items via `RunView` with `MaxRows = sampleSize`
- Calls the seed taxonomy prompt via `AIPromptRunner`
- Returns proposed tags without persisting — the UI handles approval

**UI component:**
- `ClassifySeedTaxonomyComponent` (`classify-seed-taxonomy`) — embedded in the wizard and also accessible from the Taxonomy tab
- Tree view of proposed tags with checkboxes, inline edit, drag-to-rearrange
- "Generate Again" button to re-run with different sample or adjusted context

### 3.3 Contextual Prompt Injection

Add a mechanism for injecting domain-specific context into the tag extraction prompt at three scopes, with configurable inheritance.

**Scope hierarchy:**

```
Organization-wide context (global)
  └─ Content Type context (per type)
       └─ Content Source context (per source)
```

**Aggregation modes:**
- **Additive** (default): Child context is appended to parent context. The LLM sees all applicable context concatenated.
- **Substitutive**: Child context replaces parent context entirely. Useful when a source needs completely different domain framing.

**Where context is stored:**

| Scope | Storage | Field |
|---|---|---|
| Organization-wide | New field: `MJ: System Settings` or a dedicated `MJ: Knowledge Hub Settings` record | `ClassificationContext` (text) |
| Content Type | `MJContentType.Description` field (already exists, currently underused) or new `ClassificationContext` column | Text field |
| Content Source | `IContentSourceConfiguration.ClassificationContext` (new field in the JSON interface) | Text within JSON |

**Schema considerations:**
- **Organization-wide context**: Could use `MJ: System Settings` (key-value) or add a dedicated record. Using System Settings avoids a migration: `UserInfoEngine.Instance.GetSetting('mj.knowledgeHub.classificationContext')` at the org level (not per-user). However, System Settings is per-user today. Alternative: add a `ClassificationContext NVARCHAR(MAX)` column to `MJ: Content Types` (covers org + type level if we designate one "default" type). **Decision needed.**
- **Content Source context**: Adding `ClassificationContext` to `IContentSourceConfiguration` requires no migration — it's a JSON blob. Just extend the TypeScript interface.

**Prompt template changes:**
- Add `{{ classificationContext }}` variable to `content-autotagging.template.md`
- The pipeline assembles the effective context by walking the scope hierarchy and applying the aggregation mode
- Context is prepended to the system prompt section, framing the LLM's understanding before it sees the content

**UI:**
- **Organization-wide**: New "Classification Settings" section in the Knowledge Hub Configuration tab (or a settings dialog accessible from the Classify app header)
- **Content Type**: Text area in the Content Type form (existing or new field)
- **Content Source**: Text area in the source form dialog (new section in the existing `source-type-form.dialog`)
- Each level shows an "Aggregation Mode" toggle: Additive / Substitutive
- Preview panel showing the effective combined context for the selected source

### 3.4 Inline Entity Document Creation

When creating a Content Source for an Entity-type source, if no Entity Document exists for the selected entity, the source form should offer to create one inline rather than sending the user to the Vectors tab.

**Current behavior:** The source form's Entity Document dropdown shows "No documents found" and the user is stuck.

**Proposed behavior:**
1. Entity dropdown selected → system checks for existing Entity Documents
2. If none found: show a callout: "No Entity Document exists for [Entity Name]. Create one now?" with a "Create Entity Document" button
3. Button opens an inline sub-form (accordion or expandable section within the wizard/source form):
   - Auto-populated entity name
   - Field selector: checkboxes for which entity fields to include in the document template (pre-selected: all string/text fields; deselected: IDs, timestamps, system fields)
   - Preview: show a sample serialized document for one record
   - "Create" button
4. After creation, the Entity Document dropdown auto-selects the new document

**Implementation:**
- Modify `ClassifySourceTypeFormDialogComponent` to handle inline Entity Document creation
- Use `Metadata.GetEntityObject<MJEntityDocumentEntity>('MJ: Entity Documents')` to create the record
- Load entity field metadata from `Metadata.EntityByName(entityName).Fields` to populate the field selector
- The Entity Document's template configuration defines which fields are serialized — populate this from the user's checkbox selections

---

## 4. Implementation Phases

### Phase 1 — Contextual Prompt Injection (highest impact, lowest effort)
1. Add `ClassificationContext` field to `IContentSourceConfiguration` interface
2. Add `{{ classificationContext }}` to the tag extraction prompt template
3. Add context text area to the source form dialog
4. Wire the pipeline to assemble and inject the effective context
5. Decide on organization-wide and content-type-level storage (see open questions)

### Phase 2 — Inline Entity Document Creation
1. Add Entity Document existence check to the source form
2. Build inline creation sub-form with field selector
3. Wire creation and auto-selection in the dropdown

### Phase 3 — Seed Taxonomy Generation
1. Author the seed taxonomy generation prompt
2. Add `generateSeedTaxonomy()` method to `TagEngine`
3. Build the `ClassifySeedTaxonomyComponent` with tree review UI
4. Integrate into the Taxonomy tab and the setup wizard

### Phase 4 — Guided Setup Wizard
1. Build `ClassifySetupWizardComponent` with all 7 steps
2. Wire trigger points (empty Sources tab, Overview "Get Started" card)
3. Test with a non-technical user and iterate on copy/flow

---

## 5. Open Questions

1. **Organization-wide context storage**: `MJ: System Settings` is per-user today. Options: (a) add a new entity `MJ: Knowledge Hub Settings` with a single row, (b) add `ClassificationContext` column to `MJ: Content Types` and designate a "default" type, (c) use a new `MJ: Configuration` record scoped to the Knowledge Hub app. Recommendation: option (a) is cleanest but requires a migration + CodeGen.

2. **Content Type context field**: Reuse the existing `Description` column (already there, underused) or add a dedicated `ClassificationContext` column? Using `Description` avoids a migration but conflates two purposes.

3. **Seed taxonomy sample size**: What's the right default? Too few items (< 10) may produce a thin taxonomy; too many (> 100) wastes tokens. Suggest default of 30 with a user-adjustable slider.

4. **Seed taxonomy prompt model**: Should the seed taxonomy prompt use the Content Type's configured AI model, or a separate "taxonomy generation" model configuration? The taxonomy generation task may benefit from a more capable model than the one used for per-item tag extraction.

5. **Wizard vs. progressive disclosure**: An alternative to the wizard is progressive disclosure within the Sources tab itself — when the user clicks "Add Source", the form itself guides them through the prerequisites inline, creating missing records as needed. This is less "wizard-like" but keeps the user in context. Which approach does the team prefer?

6. **Aggregation mode default**: Should the default be "additive" (child context supplements parent) or "substitutive" (child context replaces parent)? Additive seems safer as a default — users explicitly opt into overriding.
