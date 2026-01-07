Read-only display component for a **single entity record** with metadata-driven formatting. Four layout modes: list (vertical label-value pairs), table (2-column with configurable label width), inline (horizontal compact), card (styled with border/shadow). Auto-formats field types: dates (short/long/relative like 'Yesterday'), numbers (commas), currency ($USD for Amount/Price/Cost fields), booleans (✓ Yes / ✗ No), decimals (2 places). Supports: explicit field selection/ordering, text truncation (maxTextLength default 200), empty field hiding, field highlighting (yellow background), clickable fields (onFieldClicked event). Optional OpenRecordButton with cancelable onOpenRecord event.

#### SingleRecordView - ONLY use when:
✅ Displaying exactly ONE entity record's details
✅ Read-only view (no editing needed)
✅ Want automatic metadata-driven field formatting
✅ Drill-down destination showing selected record details
✅ Master-detail detail panel (e.g., selected invoice from list)
✅ Profile pages, record previews, tooltips/popovers, quick view panels

❌ DO NOT USE SingleRecordView when:
- Displaying multiple records in a list → **Use DataGrid or EntityDataGrid instead**
- Need editable form → Use MemberJunction's form components or custom forms
- Displaying aggregated/calculated data (not a record) → Use custom layout or charts
- Need complex layout with tabs, accordions, or sections → Build custom component
- Record has many fields requiring grouping/organization → Build custom sectioned layout

**Use Cases**: Drill-down detail panels ('Show me the full invoice after clicking chart segment'), sidebar record previews, master-detail detail views, selected item summary, record quick-view popovers, profile cards, confirmation dialogs showing record details.
