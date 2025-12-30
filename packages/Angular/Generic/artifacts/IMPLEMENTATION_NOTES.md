# Artifact Viewer Plugin Architecture - Implementation Notes

## Status: 90% Complete - Needs Final Fixes

### What's Been Created

1. **SQL Migration** ✅
   - `V202510111001__v2.105.x__Add_ArtifactType_DriverClass.sql`
   - Adds `DriverClass` column to ArtifactType table
   - Populates default driver class values for all existing artifact types
   - CodeGen has already run and created entity metadata

2. **Package Structure** ✅
   - Created `@memberjunction/ng-artifacts` package
   - Package.json with correct dependencies
   - tsconfig.json configured

3. **Core Interfaces** ✅
   - `IArtifactViewerPlugin` - Plugin interface
   - `IArtifactViewerComponent` - Component interface
   - `ArtifactMetadata` - Metadata type
   - Base component: `BaseArtifactViewerPluginComponent`

4. **Plugin Components** (Partially Complete)
   - ✅ JsonArtifactViewerPlugin
   - ✅ CodeArtifactViewerPlugin
   - ⚠️ MarkdownArtifactViewerPlugin (needs fixing)
   - ⚠️ HtmlArtifactViewerPlugin (needs fixing)
   - ⚠️ SvgArtifactViewerPlugin (needs fixing)
   - ⚠️ ComponentArtifactViewerPlugin (needs fixing)

5. **Dynamic Viewer** ⚠️
   - `ArtifactViewerDynamicComponent` created but needs fixes

### Remaining Issues to Fix

#### 1. Update All Plugin Interfaces
All plugin components need these changes:
- Change `ConversationArtifactEntity` → `ArtifactVersionEntity`
- Change `artifact` → `artifactVersion` input
- Update `canHandle()` signature to: `canHandle(artifactTypeName: string, contentType?: string): boolean`
- Update `getMetadata()` signature to accept `ArtifactVersionEntity`

#### 2. Fix Module Issues
- Remove `BaseArtifactViewerPluginComponent` from declarations (it's abstract)
- Remove `ReactComponentsModule` import (doesn't exist - should be from `@memberjunction/ng-react`)

#### 3. Fix MJGlobal Import
The dynamic viewer uses `MJGlobal` which should be imported from `@memberjunction/global`, not `@memberjunction/core`.

Change:
```typescript
import { MJGlobal, Metadata, LogError } from '@memberjunction/core';
```

To:
```typescript
import { Metadata, LogError } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
```

#### 4. Fix ArtifactType Load Method
In `artifact-viewer-dynamic.component.ts`, change:
```typescript
const loaded = await artifactType.Load(this.artifact.ArtifactType, 'Name');
```

To:
```typescript
// Load by filtering on Name field
const rv = new RunView();
const result = await rv.RunView<ArtifactTypeEntity>({
  EntityName: 'MJ: Artifact Types',
  ExtraFilter: `Name='${this.artifact.ArtifactType}'`,
  ResultType: 'entity_object'
});
if (result.Success && result.Results?.length > 0) {
  artifactType = result.Results[0];
}
```

#### 5. Plugin Registration
The `@RegisterClass` decorator needs the correct base class reference. Should be:
```typescript
@RegisterClass(BaseArtifactViewerPluginComponent, 'PluginClassName')
```

But since BaseArtifactViewerPluginComponent implements IArtifactViewerPlugin, we may need to register directly with IArtifactViewerPlugin as the parent type.

### Quick Fix Strategy

**Option A: Minimal Working Version (Recommended)**
1. Remove Markdown, HTML, SVG, Component plugins from module temporarily
2. Remove `ArtifactViewerDynamicComponent` temporarily
3. Keep only JSON and Code plugins which are already fixed
4. Remove ngx-markdown and ReactComponentsModule imports
5. Build and test with just these two plugins

**Option B: Complete Implementation**
1. Update all 4 remaining plugins (Markdown, HTML, SVG, Component)
2. Fix dynamic viewer component
3. Add ngx-markdown to package.json dependencies
4. Find correct React module import from @memberjunction/ng-react

### Files That Need Updates

1. `markdown-artifact-viewer.component.ts` - Update interfaces
2. `html-artifact-viewer.component.ts` - Update interfaces
3. `svg-artifact-viewer.component.ts` - Update interfaces
4. `component-artifact-viewer.component.ts` - Update interfaces
5. `artifact-viewer-dynamic.component.ts` - Fix MJGlobal import and Load method
6. `artifacts.module.ts` - Remove abstract class from declarations, fix imports

### Testing Plan

Once fixed:
1. Build artifacts package: `cd packages/Angular/generic/artifacts && npm run build`
2. Run npm install from repo root
3. Build conversations package
4. Run full repo build: `npm run build`
5. Test in MJ Explorer by viewing conversation artifacts

### Integration with Conversations Package

The conversations package already has:
- ✅ Dependency added to package.json
- ✅ ArtifactsModule imported in conversations.module.ts
- ⚠️ Still uses old artifact-viewer-panel.component.ts (needs migration)

Future work: Update artifact-viewer-panel to use the new plugin system instead of hardcoded JSON viewer.

## Architecture Summary

### How It Works

1. **ArtifactType Table**: Now has `DriverClass` field (e.g., 'JsonArtifactViewerPlugin')
2. **Plugin Registration**: Each plugin registers itself with `@RegisterClass` decorator
3. **Dynamic Loading**: `MJGlobal.Instance.ClassFactory.CreateInstance()` loads plugins at runtime
4. **Component Rendering**: Angular ViewContainerRef dynamically creates the appropriate viewer component

### Plugin Flow

```
Artifact → Load ArtifactType → Get DriverClass →
  Create Plugin Instance → Get Component Type →
  Dynamically Create Component → Render Artifact
```

### Benefits

- ✅ Extensible - New plugins can be added without modifying core code
- ✅ Type-safe - Full TypeScript typing throughout
- ✅ Decoupled - Plugins are independent Angular components
- ✅ Database-driven - DriverClass stored in database, can be changed dynamically
- ✅ @RegisterClass Pattern - Consistent with MJ architecture

## Next Steps

1. Choose Quick Fix Option A or B
2. Apply fixes listed above
3. Build and test
4. Document usage for other developers
5. Create example of adding new plugin type

## Questions for User

1. Should we include Markdown/HTML/SVG/Component plugins in initial release or ship with just JSON/Code?
2. Do we have ngx-markdown available or should we remove Markdown plugin?
3. What's the correct module name from @memberjunction/ng-react for React components?
4. Should dynamic viewer component load artifact type from database or receive it as input?
