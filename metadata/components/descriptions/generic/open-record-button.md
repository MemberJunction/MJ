Intelligent button that opens MemberJunction entity records using metadata-driven primary key detection. Requires record object and entityName props. Auto-detects primary keys from entity metadata (handles single keys like 'ID' or composite keys like 'OrderID + LineNumber'). Calls callbacks.OpenEntityRecord with proper key-value pairs. Four variant styles: primary (blue filled), default (blue filled), text (transparent with blue text), link (underlined text). Three sizes: small, medium, large. Optional icon (emoji/unicode). Validates all primary key values exist before enabling button. Fires recordOpened event on success. Shows descriptive tooltip.

#### OpenRecordButton - ONLY use when:
✅ Need a standalone button to open a specific entity record
✅ Record and entity name are available in component scope
✅ Opening records from custom UI (detail panels, lists, cards, search results)
✅ Want automatic primary key handling (no manual key extraction)
✅ Need multiple open-record buttons in same view with different styling

❌ DO NOT USE OpenRecordButton when:
- DataGrid or EntityDataGrid already handles row clicks → Built-in record opening is simpler
- SingleRecordView with allowOpenRecord=true → It uses OpenRecordButton internally
- Need complex pre-open validation/confirmation → Use direct callbacks.OpenEntityRecord call with custom logic
- Record is not a MemberJunction entity → Use custom navigation logic
- Opening external links or non-entity routes → Use regular anchor tags or router links

**Use Cases**: 'View Details' buttons, drill-down from charts to records, master-detail 'Open in Full View' actions, search result 'View Record' buttons, related record links in custom forms.
