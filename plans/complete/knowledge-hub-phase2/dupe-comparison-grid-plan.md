# Duplicate Record Comparison Grid — UX Prototype Plan

## Context

The duplicate detection kanban board shows cards for potential duplicate records (e.g., "Claude 3.5 Sonnet" at 96% match). The current expanded card view shows source and match metadata in a narrow vertical layout within the kanban column — no side-by-side field comparison, no diff highlighting. Users need to compare field values across the source record and all its candidate matches to make informed approve/reject decisions.

## Design: Full-Screen Comparison Overlay

Replace the current inline card expansion with a **full-screen comparison overlay** that pops out of the kanban, presenting a field-by-field comparison grid.

### Overlay Shell
- **Fixed backdrop** using `var(--mj-bg-overlay)`, click-to-close
- **Content panel**: `92vw × 88vh`, max `1400px × 900px`, centered, rounded corners, shadow
- **Animation**: Scale 0.95→1.0 + fade in (200ms cubic-bezier), reverse on close
- **Escape key** closes via `@HostListener`
- **Trigger**: Click card header → `OpenComparison(group)` instead of current `ToggleExpand`
- Remove the current inline expanded view entirely (it's redundant with this)

### Header Bar
- **Left**: Entity icon (36px badge) + record name (18px bold) + entity badge + "N potential duplicates"
- **Right**: "All Fields / Differences Only" segmented toggle + close button

### Comparison Grid (CSS Grid)
```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│   Field      │   SOURCE     │  Match 1     │  Match 2     │
│              │  Claude 3.5  │  96% Claude 3│  93% Claude 4│
│              │  Sonnet      │  - Sonnet    │  Sonnet      │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ Name         │ Claude 3.5.. │ Claude 3 -.. │ Claude 4 S.. │  ← highlighted (different)
│ Description  │ Fast, affor..│ Fast, cost-..│ Most intell..│  ← highlighted
│ Status       │ Active       │ Active       │ Active       │  ← dimmed (same)
│ Type         │ LLM          │ LLM          │ LLM          │  ← dimmed
│ PowerRank    │ 3            │ 2            │ 5            │  ← highlighted
└──────────────┴──────────────┴──────────────┴──────────────┘
```

- **Grid columns**: `200px` (sticky label) + `repeat(N, minmax(200px, 1fr))`
- **Sticky label column** (`position: sticky; left: 0; z-index: 2`) — always visible when scrolling horizontally
- **Sticky header row** (`position: sticky; top: 0; z-index: 3`) — always visible when scrolling vertically
- **Row striping** for readability

### Diff Highlighting
- **Same values**: `color: var(--mj-text-muted)` — de-emphasized
- **Different values**: `background: color-mix(in srgb, var(--mj-status-warning) 10%, transparent)` + `border-left: 3px solid var(--mj-status-warning)` — amber tint
- **Missing values**: Italic "(not available)" in `var(--mj-text-disabled)`
- **Comparison logic**: Case-insensitive, whitespace-trimmed string equality
- **Diff count badge** in each match column header: "3 differences"

### Toggle: All Fields vs Differences Only
- Segmented button in the header
- "Differences only" filters to rows where at least one match value differs from source
- Footer shows "Showing X of Y fields"

### Per-Match Actions
- Small approve/reject icon buttons in each match column header
- Approved → green left border on column, Rejected → red
- Bulk "Approve All" / "Reject All" in the footer bar

### Field Resolution
- Use `Metadata.Entities.find(e => e.Name === entityName).Fields` to get `DisplayName`, `Category`, `Sequence` (sort order)
- Fields from RecordMetadata not in entity fields shown in "Other" category
- Skip internal fields: Name, Entity, EntityIcon, RecordID, TemplateID, __mj_UpdatedAt, primary keys

## Files to Modify

| File | Changes |
|------|---------|
| `packages/Angular/Explorer/dashboards/src/AI/components/duplicates/duplicate-detection-resource.component.ts` | Add ComparisonGroup, ComparisonFields, ComparisonMatches, ComparisonShowAllFields properties. Add OpenComparison, CloseComparison, buildComparisonFields, buildComparisonMatches, GetVisibleFields, AreValuesEqual, ApproveIndividualMatch, RejectIndividualMatch methods. Remove ExpandedGroupId and related code. |
| `packages/Angular/Explorer/dashboards/src/AI/components/duplicates/duplicate-detection-resource.component.html` | Replace inline card expansion with card click → OpenComparison. Remove ~120 lines of inline expansion HTML. Add comparison overlay template at bottom. |
| `packages/Angular/Explorer/dashboards/src/AI/components/duplicates/duplicate-detection-resource.component.css` | Remove expanded card CSS. Add ~200 lines for overlay, grid, diff highlighting, toggle, footer. |

## New TypeScript Interfaces

```typescript
interface ComparisonFieldRow {
    FieldName: string;
    DisplayName: string;
    Category: string | null;
    SourceValue: string | undefined;
    MatchValues: (string | undefined)[];
    HasDifference: boolean;
}

interface ComparisonMatchInfo {
    Match: MJDuplicateRunDetailMatchEntity;
    Name: string;
    Score: number;
    Metadata: RecordMetadataInfo;
    DiffCount: number;
}
```

## Existing Code to Reuse

- `parseRecordMetadata()` — already parses JSON from RecordMetadata field
- `GetScoreClass()` — returns score-high/medium/low CSS class
- `ApproveMatch()` / `RejectMatch()` — existing group-level approve/reject for bulk actions
- `FormatDate()` — date formatting
- Entity field metadata: `new Metadata().Entities.find(e => e.Name === entityName).Fields` — gives EntityFieldInfo[] with DisplayName, Category, Sequence, Type
- Score indicator classes: `.score-high`, `.score-medium`, `.score-low` (already in CSS)

## Verification

1. Build: `cd packages/Angular/Explorer/dashboards && npm run build`
2. Run a duplicate detection on "AI Models" entity
3. Click a kanban card → overlay opens with comparison grid
4. Verify diff highlighting (same values dimmed, different values amber)
5. Toggle "Differences Only" → fewer rows shown
6. Approve/reject individual matches in column headers
7. Test with 1 match, 4+ matches (horizontal scroll), many fields (vertical scroll)
8. Test dark mode rendering
9. Press Escape → overlay closes
