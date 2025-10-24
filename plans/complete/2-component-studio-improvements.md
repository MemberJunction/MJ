# Plan 2: Component Studio Artifact Improvements

## Overview

This document outlines UI/UX improvements to the **Component Studio dashboard** for better artifact management with the new schema and Collections support.

**Scope**: Frontend TypeScript/Angular changes only
**Estimated Effort**: 7-8 days
**Risk Level**: Low (UI changes, existing functionality preserved)
**Dependencies**: [Plan 1: Data Migration](./1-conversation-artifact-data-migration.md) must complete first

**Related Plans**:
- [Plan 1: Data Migration](./1-conversation-artifact-data-migration.md) - Database migration (prerequisite)
- [Plan 3: Component Artifact Viewer](./3-component-artifact-viewer-improvements.md) - Viewer plugin (independent)

---

## Current State

### Component Studio Location
**Path**: `/packages/Angular/explorer/dashboards/src/ComponentStudio/`

### Existing Features
1. **Export to Artifact** - Saves component spec to old ConversationArtifact schema
2. **Import from File** - Loads JSON component from file
3. **Import from Text** - Paste JSON component text
4. **Deprecated Filter** - Toggle showing deprecated components (UI looks crappy)

### Problems
1. ❌ Uses legacy `ConversationArtifactEntity` / `ConversationArtifactVersionEntity`
2. ❌ No Collections support (can't organize artifacts into collections)
3. ❌ No "Load from Artifact" feature (can import files, but not from DB)
4. ❌ Deprecated filter UI doesn't match Favorites button style

---

## Proposed Improvements

### 1. Migrate to New Schema

**Update**: `artifact-selection-dialog.component.ts`

**Changes**:
- Replace `ConversationArtifactEntity` → `ArtifactEntity`
- Replace `ConversationArtifactVersionEntity` → `ArtifactVersionEntity`
- Update all queries to use new entity names
- Add `EnvironmentID` to new artifacts
- Store component spec in `ArtifactVersion.Content` field (not `Configuration`)
- Generate SHA-256 `ContentHash` for deduplication

**Code Changes**:
```typescript
// OLD
import {
  ConversationArtifactEntity,
  ConversationArtifactVersionEntity
} from '@memberjunction/core-entities';

artifacts: ConversationArtifactEntity[] = [];
artifactVersions: ConversationArtifactVersionEntity[] = [];

// NEW
import {
  ArtifactEntity,
  ArtifactVersionEntity,
  CollectionEntity,
  CollectionArtifactEntity
} from '@memberjunction/core-entities';

artifacts: ArtifactEntity[] = [];
artifactVersions: ArtifactVersionEntity[] = [];
```

**Query Updates**:
```typescript
// OLD
const result = await rv.RunView<ConversationArtifactEntity>({
  EntityName: 'MJ: Conversation Artifacts',
  // ...
});

// NEW
const result = await rv.RunView<ArtifactEntity>({
  EntityName: 'MJ: Artifacts',
  // ...
});
```

---

### 2. Enhanced Save Dialog with Collections

**Add Tabbed Interface** to `artifact-selection-dialog.component.html`:

#### Tab 1: Existing Artifacts
- Keep current filter panel (search, artifact type, user)
- Add **Collection filter** dropdown
- Show artifact's collections as badges

#### Tab 2: Collections (NEW)
**Layout**: Two-panel design

**Left Panel - Collections List**:
- User's collections (owned + shared with edit permission)
- Search/filter collections
- Permission badges (Owner/Editor)
- Shows artifact count per collection

**Right Panel - Artifacts in Collection**:
- Shows artifacts in selected collection
- Sorted by Sequence
- Version count and last updated
- "Add New Artifact to This Collection" button

#### Tab 3: Create New (Enhanced)
**Form Fields**:
- Artifact Name (required)
- Description (optional)
- Artifact Type (dropdown, default: 'Component')
- **Add to Collection** (optional dropdown)
  - If selected, show Sequence number input
  - Checkbox: "Remember this collection for components"

**Smart Defaults**:
- Pre-select default collection if user has one saved
- Auto-generate name from component name
- Remember last-used artifact type

**Save Button Text** (dynamic):
- "Create & Add to [Collection Name]"
- "Save as v2 in [Collection]"
- "Update v2"
- "Create Artifact"

#### Updated Result Interface
```typescript
export interface ArtifactSelectionResult {
  artifact: ArtifactEntity;
  action: 'new-version' | 'update-version';
  versionToUpdate?: ArtifactVersionEntity;
  collectionID?: string; // NEW
  sequence?: number; // NEW
}
```

#### TypeScript Implementation
```typescript
export class ArtifactSelectionDialogComponent {
  // Tab state
  activeTab = 0; // 0=Existing, 1=Collections, 2=Create New

  // Collections tab
  collections: CollectionEntity[] = [];
  selectedCollection: CollectionEntity | null = null;
  collectionArtifacts: ArtifactEntity[] = [];

  // Create new tab
  userCollections: CollectionEntity[] = [];
  selectedCollectionForNew: string | null = null;
  newArtifactSequence = 0;
  setAsDefaultCollection = false;

  async ngOnInit() {
    await Promise.all([
      this.loadArtifacts(),
      this.loadUserCollections()
    ]);
  }

  async loadUserCollections() {
    const md = new Metadata();
    const currentUserId = md.CurrentUser?.ID;

    const result = await rv.RunView<CollectionEntity>({
      EntityName: 'MJ: Collections',
      ExtraFilter: `UserID = '${currentUserId}' OR ID IN (
        SELECT CollectionID FROM __mj.vwCollectionPermissions
        WHERE UserID = '${currentUserId}' AND CanEdit = 1
      )`,
      OrderBy: 'Name',
      ResultType: 'entity_object'
    });

    if (result.Success) {
      this.collections = result.Results || [];
      this.userCollections = [...this.collections];
    }
  }

  async selectCollection(collection: CollectionEntity) {
    this.selectedCollection = collection;

    // Load artifacts in this collection
    const result = await rv.RunView<ArtifactEntity>({
      EntityName: 'MJ: Artifacts',
      ExtraFilter: `ID IN (
        SELECT ArtifactID FROM __mj.vwCollectionArtifacts
        WHERE CollectionID = '${collection.ID}'
      )`,
      OrderBy: 'Name',
      ResultType: 'entity_object'
    });

    if (result.Success) {
      this.collectionArtifacts = result.Results || [];
    }
  }

  getSaveButtonText(): string {
    if (this.activeTab === 2 && this.selectedCollectionForNew) {
      const collection = this.userCollections.find(c => c.ID === this.selectedCollectionForNew);
      return `Create & Add to "${collection?.Name}"`;
    }

    if (this.versionAction === 'update') {
      return `Update v${this.selectedVersion!.VersionNumber}`;
    }

    const nextVersion = this.getNextVersionNumber();
    return `Save as v${nextVersion}`;
  }

  async save() {
    const result: ArtifactSelectionResult = {
      artifact: this.selectedArtifact || await this.createNewArtifact()!,
      action: this.versionAction === 'update' ? 'update-version' : 'new-version',
      versionToUpdate: this.versionAction === 'update' ? this.selectedVersion! : undefined,
      collectionID: this.selectedCollectionForNew || undefined,
      sequence: this.selectedCollectionForNew ? this.newArtifactSequence : undefined
    };

    // Save default collection preference if checked
    if (this.setAsDefaultCollection && this.selectedCollectionForNew) {
      // Save to UserPreference or DashboardUserState
      await this.saveUserPreference('defaultComponentCollection', this.selectedCollectionForNew);
    }

    this.dialog.close(result);
  }
}
```

#### Main Component Updates
**File**: `component-studio-dashboard.component.ts`

```typescript
public async exportToArtifact(): Promise<void> {
  // ... open dialog ...

  if (!result || !result.action) return;

  try {
    const artifact = result.artifact; // Now ArtifactEntity
    let version: ArtifactVersionEntity;

    if (result.action === 'update-version' && result.versionToUpdate) {
      version = result.versionToUpdate;
    } else {
      // Create new version
      version = await this.metadata.GetEntityObject<ArtifactVersionEntity>(
        'MJ: Artifact Versions'
      );
      version.ArtifactID = artifact.ID;
      version.VersionNumber = await this.getNextVersionNumber(artifact.ID);
    }

    // Store component spec in Content field
    const currentSpec = this.getComponentSpec();
    version.Content = JSON.stringify(currentSpec, null, 2);

    // Generate content hash
    version.ContentHash = await this.generateSHA256Hash(version.Content);

    // Set metadata
    version.Name = currentSpec.name;
    version.Description = currentSpec.description || null;
    version.UserID = this.metadata.CurrentUser!.ID;
    version.Comments = `Saved from Component Studio at ${new Date().toISOString()}`;

    const saved = await version.Save();

    if (saved) {
      // If collection selected, create CollectionArtifact link
      if (result.collectionID) {
        const collectionLink = await this.metadata.GetEntityObject<CollectionArtifactEntity>(
          'MJ: Collection Artifacts'
        );
        collectionLink.CollectionID = result.collectionID;
        collectionLink.ArtifactID = artifact.ID;
        collectionLink.Sequence = result.sequence || 0;
        await collectionLink.Save();
      }

      // Show success notification
      MJNotificationService.Instance.CreateSimpleNotification(
        `Component saved as v${version.VersionNumber}`,
        'success',
        3500
      );
    }
  } catch (error) {
    console.error('Error saving artifact:', error);
    MJNotificationService.Instance.CreateSimpleNotification(
      'Failed to save component',
      'error',
      5000
    );
  }
}

private async generateSHA256Hash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

private async getNextVersionNumber(artifactID: string): Promise<number> {
  const rv = new RunView();
  const result = await rv.RunView<ArtifactVersionEntity>({
    EntityName: 'MJ: Artifact Versions',
    ExtraFilter: `ArtifactID = '${artifactID}'`,
    OrderBy: 'VersionNumber DESC',
    MaxRows: 1,
    ResultType: 'entity_object'
  });

  if (result.Success && result.Results?.length > 0) {
    return result.Results[0].VersionNumber + 1;
  }
  return 1;
}
```

---

### 3. Load from Artifact Feature (NEW)

**Add Import Menu Item**:

```html
<div class="dropdown-menu">
  <button class="dropdown-item" (click)="importFromFile()">
    <i class="fa-solid fa-file"></i> Import from File
  </button>
  <button class="dropdown-item" (click)="importFromText()">
    <i class="fa-solid fa-keyboard"></i> Import from Text
  </button>
  <!-- NEW -->
  <button class="dropdown-item" (click)="importFromArtifact()">
    <i class="fa-solid fa-database"></i> Import from Artifact
  </button>
</div>
```

**New Component**: `artifact-load-dialog.component.ts`

```typescript
export interface ArtifactLoadResult {
  spec: ComponentSpec;
  artifactID: string;
  versionID: string;
  versionNumber: number;
  artifactName: string;
}

@Component({
  selector: 'app-artifact-load-dialog',
  templateUrl: './artifact-load-dialog.component.html'
})
export class ArtifactLoadDialogComponent {
  activeTab = 0; // 0=Artifacts, 1=Collections

  artifacts: ArtifactEntity[] = [];
  artifactVersions: ArtifactVersionEntity[] = [];
  selectedArtifact: ArtifactEntity | null = null;
  selectedVersion: ArtifactVersionEntity | null = null;

  // Preview
  previewSpec: ComponentSpec | null = null;
  previewError: string | null = null;

  async loadArtifacts() {
    const rv = new RunView();
    const result = await rv.RunView<ArtifactEntity>({
      EntityName: 'MJ: Artifacts',
      ExtraFilter: `TypeID IN (SELECT ID FROM __mj.vwArtifactTypes WHERE Name = 'Component')`,
      OrderBy: '__mj_UpdatedAt DESC',
      MaxRows: 100,
      ResultType: 'entity_object'
    });

    if (result.Success) {
      this.artifacts = result.Results || [];
    }
  }

  async selectVersion(version: ArtifactVersionEntity) {
    this.selectedVersion = version;
    await this.loadPreview(version);
  }

  async loadPreview(version: ArtifactVersionEntity) {
    try {
      this.previewError = null;

      // Try Content field first (new schema)
      if (version.Content) {
        this.previewSpec = JSON.parse(version.Content) as ComponentSpec;
      }
      // Fallback to Configuration field (legacy)
      else if (version.Configuration) {
        const config = JSON.parse(version.Configuration);
        // Extract from SkipAPIAnalysisCompleteResponse if needed
        if (config.componentOptions && config.componentOptions.length > 0) {
          this.previewSpec = config.componentOptions[0].option;
        } else {
          this.previewSpec = config;
        }
      }
      else {
        this.previewError = 'No content found in this version';
      }
    } catch (error) {
      this.previewError = `Failed to parse: ${error}`;
      this.previewSpec = null;
    }
  }

  load() {
    const result: ArtifactLoadResult = {
      spec: this.previewSpec!,
      artifactID: this.selectedArtifact!.ID,
      versionID: this.selectedVersion!.ID,
      versionNumber: this.selectedVersion!.VersionNumber,
      artifactName: this.selectedArtifact!.Name
    };

    this.dialog.close(result);
  }
}
```

**Main Component Method**:

```typescript
public async importFromArtifact(): Promise<void> {
  this.closeImportDropdown();

  const dialogRef = this.dialogService.open({
    content: ArtifactLoadDialogComponent,
    width: 1200,
    height: 900
  });

  const result = await dialogRef.result.toPromise() as ArtifactLoadResult | undefined;

  if (!result) return;

  try {
    // Create file-loaded component from artifact
    const artifactComponent: FileLoadedComponent = {
      id: this.generateId(),
      name: result.spec.name,
      description: result.spec.description,
      specification: result.spec,
      filename: `${result.artifactName} (v${result.versionNumber})`,
      loadedAt: new Date(),
      isFileLoaded: true,
      type: result.spec.type || 'Component',
      status: 'Artifact' // NEW status badge (blue)
    };

    // Store source reference for potential re-save
    (artifactComponent as any).sourceArtifactID = result.artifactID;
    (artifactComponent as any).sourceVersionID = result.versionID;

    // Add to list
    this.fileLoadedComponents.push(artifactComponent);
    this.combineAndFilterComponents();

    // Auto-select and run
    this.expandedComponent = artifactComponent;
    this.runComponent(artifactComponent);

  } catch (error) {
    console.error('Error loading from artifact:', error);
    MJNotificationService.Instance.CreateSimpleNotification(
      'Failed to load component',
      'error',
      5000
    );
  }
}
```

---

### 4. Improved Deprecated Filter UI

**Current (Crappy)**:
```html
<button class="deprecated-toggle" [class.active]="showDeprecatedComponents">
  @if (showDeprecatedComponents) {
    <i class="fa-solid fa-exclamation-triangle"></i> Show Deprecated
  } @else {
    <i class="fa-regular fa-exclamation-triangle"></i> Hide Deprecated
  }
</button>
```

**New (Clean)**:
```html
<label class="filter-checkbox deprecated-filter">
  <input type="checkbox"
         [(ngModel)]="showDeprecatedComponents"
         (change)="toggleShowDeprecatedComponents()">
  <i class="fa-solid fa-exclamation-triangle"></i>
  <span>Include deprecated</span>
  <span class="count-badge">{{ getDeprecatedCount() }}</span>
</label>
```

**TypeScript**:
```typescript
public getDeprecatedCount(): number {
  return this.allComponents.filter(c =>
    this.getComponentStatus(c) === 'Deprecated'
  ).length;
}
```

**Styling**:
```scss
.filter-checkbox.deprecated-filter {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  background: white;

  &:hover {
    background: #f8f9fa;
    border-color: #adb5bd;
  }

  input[type="checkbox"] {
    width: 14px;
    height: 14px;
    cursor: pointer;
    accent-color: #f59e0b;
  }

  i {
    color: #f59e0b;
    font-size: 13px;
  }

  span {
    font-size: 13px;
    color: #495057;
    font-weight: 500;
  }

  .count-badge {
    margin-left: 4px;
    background: #f59e0b;
    color: white;
    padding: 2px 6px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
  }
}
```

---

## Implementation Plan

### Phase 1: Schema Migration (2 days)
- [ ] Update imports to use new entity classes
- [ ] Update all RunView queries
- [ ] Add EnvironmentID handling
- [ ] Update save logic (Content field + ContentHash)
- [ ] Test artifact save/load with new schema

### Phase 2: Collections Support (3 days)
- [ ] Create tabbed interface in save dialog
- [ ] Implement Collections tab (list + artifacts)
- [ ] Update Create New tab with collection selector
- [ ] Add CollectionArtifact link creation
- [ ] Save/load user preferences for default collection
- [ ] Test collection workflows

### Phase 3: Load from Artifact (2 days)
- [ ] Create ArtifactLoadDialogComponent
- [ ] Implement artifact browsing UI
- [ ] Add version selection + preview
- [ ] Handle legacy Configuration vs new Content field
- [ ] Add "Import from Artifact" menu item
- [ ] Test load workflows

### Phase 4: UI Polish (0.5 days)
- [ ] Redesign deprecated filter checkbox
- [ ] Update styling to match Favorites button
- [ ] Add count badge
- [ ] Test filter interactions

### Phase 5: Testing & Fixes (2 days)
- [ ] Test all save scenarios (new/update/collection)
- [ ] Test all load scenarios (artifacts/collections)
- [ ] Test filters and search
- [ ] Cross-browser testing
- [ ] Bug fixes

**Total: 7-8 days**

---

## Testing Checklist

### Save to Artifact
- [ ] Save component to new standalone artifact
- [ ] Save to existing artifact (new version)
- [ ] Update existing version
- [ ] Save to new artifact in collection
- [ ] Save to existing artifact in collection
- [ ] Default collection remembered
- [ ] Filters work in dialog
- [ ] Pagination works

### Load from Artifact
- [ ] Load from standalone artifact
- [ ] Load from artifact in collection
- [ ] Load different versions
- [ ] Preview shows correct spec
- [ ] Handle malformed JSON
- [ ] Handle missing Content/Configuration
- [ ] Loaded component runs

### Deprecated Filter
- [ ] Toggle on/off works
- [ ] Count badge correct
- [ ] Works with other filters
- [ ] Keyboard accessible
- [ ] Visual styling matches design

---

## Files to Modify

| File | Changes |
|------|---------|
| `component-studio-dashboard.component.ts` | Update exportToArtifact, add importFromArtifact |
| `component-studio-dashboard.component.html` | Add import menu item, update filter UI |
| `component-studio-dashboard.component.scss` | Add deprecated filter styling |
| `artifact-selection-dialog.component.ts` | Migrate to new schema, add tabs/collections |
| `artifact-selection-dialog.component.html` | Add tabbed UI, collections panel |
| `artifact-selection-dialog.component.css` | Update styles for tabs |
| `artifact-load-dialog.component.ts` | **NEW** - Load from artifact dialog |
| `artifact-load-dialog.component.html` | **NEW** - Load dialog UI |
| `artifact-load-dialog.component.css` | **NEW** - Load dialog styles |

---

## Success Criteria

- ✅ Component Studio uses new Artifact/ArtifactVersion schema
- ✅ Can save components to collections
- ✅ Can load components from artifacts in database
- ✅ Collections properly linked via CollectionArtifact
- ✅ Deprecated filter has improved UX
- ✅ All existing functionality preserved
- ✅ No regressions in component testing/running

---

## Open Questions

1. **Default Environment**: How to get default EnvironmentID?
   - Use `Metadata.EnvironmentID`?
   - Query for first environment?

2. **User Preferences**: Where to save "default collection"?
   - DashboardUserState?
   - UserPreference table?
   - Local storage?

3. **Collection Permissions**: Check CanEdit before saving?
   - Yes - load CollectionPermission records
   - No - rely on server-side validation

4. **Content vs Configuration**: Always use Content for component specs?
   - **Recommendation**: Yes, use `Content` for actual JSON
   - Reserve `Configuration` for metadata

---

**Document Version**: 1.0
**Last Updated**: 2025-01-21
**Implementation Status**: ⏳ Pending Review
