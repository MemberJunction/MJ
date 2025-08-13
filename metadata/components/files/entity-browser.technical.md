## Technical Architecture

### Component Structure
- **Root Component (EntityBrowser)**: Manages overall layout and state coordination
- **EntityList (Child)**: Displays entities in grid/card view with sorting
- **EntityDetails (Child)**: Sliding panel showing entity fields and relationships
- **EntityFilter (Child)**: Collapsible filter panel with dynamic filters

### State Management
- Selected entity ID (persisted in savedUserSettings)
- View mode (grid/card) (persisted)
- Active filters (persisted)
- Sort configuration (persisted)
- Panel visibility states (details open, filters collapsed)
- Search query
- Loading states for async operations

### Layout
```
+------------------+------------------------+------------------+
|                  |                        |                  |
|   Filter Panel   |    Entity Grid/Cards   |  Details Panel   |
|   (Collapsible)  |    (Main Content)      |    (Sliding)     |
|                  |                        |                  |
|  [Schema Filter] |  +-----+  +-----+      |  Entity: Orders  |
|  [Table Filter]  |  | Card |  | Card |     |                  |
|  [Search Box]    |  +-----+  +-----+      |  Fields:         |
|                  |                        |  - ID            |
|  Sort By:        |  +-----+  +-----+      |  - CustomerID    |
|  [Name ↓]        |  | Card |  | Card |     |  - OrderDate     |
|                  |  +-----+  +-----+      |                  |
|                  |                        |  Relationships:  |
|                  |                        |  → Customers     |
|                  |                        |  → OrderItems    |
|                  |                        |                  |
|                  |                        |  [Open Record]   |
+------------------+------------------------+------------------+
```

### Data Flow
1. Root component loads entities on mount
2. Passes entity data to EntityList
3. EntityList handles selection and passes selectedId up
4. Root loads fields/relationships for selected entity
5. Passes detailed data to EntityDetails
6. Filter changes trigger data reload
7. All user preferences saved via onSaveUserSettings

### Interaction Patterns
- Click entity card → Select and open details
- Click filter → Apply and reload data
- Click sort → Update sort and reload
- Click 'Open' → Trigger OpenEntityRecord callback
- Press Escape → Close details panel
- Click outside → Close details panel