# Plan: Refactor Storybook Stories to Use Real Components

## Background

The current Storybook stories (created Feb 3, 2026) use **mock components** that duplicate the structure and styles of real components. This was done to avoid complex service dependency mocking, but it's not best practice.

### Current State (Anti-Pattern)
```typescript
// Each story file defines a mock component
@Component({
  selector: 'mj-component-mock',
  template: `...copied template...`,
  styles: [`...copied styles...`]
})
class ComponentMockComponent { ... }
```

**Problems:**
- Stories can drift from actual implementation
- Changes to real components won't be reflected
- Maintenance burden of keeping mocks in sync
- Not testing actual component behavior

---

## Best Practice Approach

### Use Real Components with Mocked Services

```typescript
import { ScoreIndicatorComponent } from '@memberjunction/ng-testing';

const meta: Meta<ScoreIndicatorComponent> = {
  title: 'Components/ScoreIndicator',
  component: ScoreIndicatorComponent,  // Real component
  decorators: [
    moduleMetadata({
      imports: [TestingModule],
      providers: [
        // Mock only the services, not the component
        { provide: SomeService, useValue: mockServiceInstance }
      ]
    })
  ]
};

export const Default: Story = {
  args: {
    score: 0.85,      // Binds to real @Input()
    showBar: true,
    showIcon: true
  }
};
```

### Benefits
- Single source of truth
- Stories automatically reflect component changes
- Catches regressions early
- Tests real animations, interactions, edge cases
- Documentation stays accurate

---

## Components to Refactor

### Tier 1: No Service Dependencies (Easy)
These components have no injected services - can use real components directly.

| Story File | Real Component | Module |
|------------|----------------|--------|
| `score-indicator.stories.ts` | `ScoreIndicatorComponent` | `TestingModule` |
| `review-status-indicator.stories.ts` | `ReviewStatusIndicatorComponent` | `TestingModule` |
| `step-info-control.stories.ts` | `StepInfoControlComponent` | `CustomFormsModule` |

**Note:** `score-indicator` and `review-status-indicator` are already correctly using real components via TestingModule.

### Tier 2: Simple Service Dependencies (Medium)
These need basic service mocks.

| Story File | Real Component | Services to Mock |
|------------|----------------|------------------|
| `entity-link-pill.stories.ts` | `EntityLinkPillComponent` | `Metadata` (static), `SharedService` |
| `actionable-commands.stories.ts` | `ActionableCommandsComponent` | None (just Kendo) |

### Tier 3: Complex Service Dependencies (Harder)
These need more sophisticated mocking.

| Story File | Real Component | Services to Mock |
|------------|----------------|------------------|
| `evaluation-mode-toggle.stories.ts` | `EvaluationModeToggleComponent` | `EvaluationPreferencesService` |
| `active-agent-indicator.stories.ts` | `ActiveAgentIndicatorComponent` | `AgentStateService` (Observable-based) |
| `artifact-message-card.stories.ts` | `ArtifactMessageCardComponent` | `RunView`, `ArtifactIconService` |

---

## Implementation Plan

### Phase 1: Tier 1 Components (No Dependencies)

**Files to modify:**
- `packages/MJExplorer/src/stories/step-info-control.stories.ts`

**Approach:**
1. Remove mock component class
2. Import real component and its module
3. Use `args` to bind to real `@Input()` properties
4. Update story templates to use real selector

**Example refactor:**
```typescript
// BEFORE (mock)
@Component({ selector: 'mj-step-info-control-mock', ... })
class StepInfoControlMockComponent { ... }

// AFTER (real)
import { MemberJunctionCoreEntityFormsModule } from '@memberjunction/ng-core-entity-forms';

const meta: Meta = {
  title: 'Components/StepInfoControl',
  decorators: [
    moduleMetadata({ imports: [MemberJunctionCoreEntityFormsModule] })
  ]
};
```

### Phase 2: Tier 2 Components (Simple Mocks)

**Create shared mock utilities:**
```
packages/MJExplorer/src/stories/.storybook-mocks/
  - index.ts
  - metadata.mock.ts
  - shared-service.mock.ts
```

**Mock patterns:**
```typescript
// metadata.mock.ts
export const mockMetadata = {
  EntityByName: (name: string) => ({
    Name: name,
    Icon: 'fa-database'
  })
};

// In story
providers: [
  { provide: Metadata, useValue: mockMetadata }
]
```

### Phase 3: Tier 3 Components (Observable Mocks)

**Create service mocks with BehaviorSubject:**
```typescript
// agent-state.mock.ts
@Injectable()
export class MockAgentStateService {
  private agents$ = new BehaviorSubject<MockActiveAgent[]>([]);

  getActiveAgents() {
    return this.agents$.asObservable();
  }

  // Method to set agents in stories
  setAgents(agents: MockActiveAgent[]) {
    this.agents$.next(agents);
  }
}
```

**Use in stories with decorators:**
```typescript
let mockService: MockAgentStateService;

const meta: Meta = {
  decorators: [
    moduleMetadata({
      providers: [
        { provide: AgentStateService, useClass: MockAgentStateService }
      ]
    }),
    (story) => {
      mockService = TestBed.inject(AgentStateService) as MockAgentStateService;
      return story();
    }
  ]
};
```

---

## File Structure After Refactor

```
packages/MJExplorer/src/stories/
├── .storybook-mocks/
│   ├── index.ts
│   ├── mock-user-info.ts
│   ├── agent-state.mock.ts
│   ├── evaluation-preferences.mock.ts
│   └── artifact-icon.mock.ts
├── score-indicator.stories.ts       (already correct)
├── review-status-indicator.stories.ts (already correct)
├── step-info-control.stories.ts     (refactored)
├── entity-link-pill.stories.ts      (refactored)
├── actionable-commands.stories.ts   (refactored)
├── evaluation-mode-toggle.stories.ts (refactored)
├── active-agent-indicator.stories.ts (refactored)
├── artifact-message-card.stories.ts  (refactored)
└── ... (existing stories)
```

---

## Verification

1. **Storybook builds:** `cd packages/MJExplorer && npm run storybook`
2. **All stories render:** Check each refactored story at http://localhost:6006
3. **Args work:** Verify Storybook controls update component state
4. **No TypeScript errors:** `npm run build` in MJExplorer

---

## Notes

- Keep existing story variants (AllStatuses, InTableContext, etc.)
- Preserve documentation in story descriptions
- Some components may need minor adjustments to work outside their normal context
- Consider adding `@storybook/addon-interactions` for testing component behavior

---

## Status

| Phase | Status |
|-------|--------|
| Phase 1 (Tier 1) | ✅ Complete |
| Phase 2 (Tier 2) | ✅ Complete |
| Phase 3 (Tier 3) | ✅ Complete |

### Detailed Progress

**✅ Using real components:**
- `score-indicator.stories.ts` → TestingModule
- `review-status-indicator.stories.ts` → TestingModule
- `step-info-control.stories.ts` → MemberJunctionCoreEntityFormsModule
- `actionable-commands.stories.ts` → ConversationsModule
- `entity-link-pill.stories.ts` → MemberJunctionCoreEntityFormsModule ✅
- `evaluation-mode-toggle.stories.ts` → TestingModule + MockEvaluationPreferencesService ✅
- `active-agent-indicator.stories.ts` → ConversationsModule + MockAgentStateService ✅
- `artifact-message-card.stories.ts` → ArtifactsModule + MockArtifactIconService ✅

### Mock Utilities Created

```
packages/MJExplorer/src/stories/.storybook-mocks/
├── index.ts                        # Re-exports all mocks
├── mock-user-info.ts               # createMockUserInfo() helper
├── evaluation-preferences.mock.ts  # MockEvaluationPreferencesService
├── agent-state.mock.ts             # MockAgentStateService + createMockAgent()
└── artifact-icon.mock.ts           # MockArtifactIconService
```

### Refactoring Approach Summary

| Component | Approach |
|-----------|----------|
| `entity-link-pill` | Direct swap - uses Metadata internally, SharedService for click (logs in Storybook) |
| `evaluation-mode-toggle` | Mock EvaluationPreferencesService with BehaviorSubject |
| `active-agent-indicator` | Mock AgentStateService.getActiveAgents() with per-story factory |
| `artifact-message-card` | Pass pre-loaded artifact/artifactVersion inputs to skip DB queries |

---

## Completed: Feb 3, 2026
