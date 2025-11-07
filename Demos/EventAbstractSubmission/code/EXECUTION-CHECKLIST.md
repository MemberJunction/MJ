# Event Abstract Submission UI - Execution Checklist

**Start Time:** 2025-10-31
**Goal:** Complete rebuild of Angular UI following MJ patterns

## Execution Order

### Phase 1: Cleanup ✓
- [x] Delete old form implementations
- [x] Delete old dashboard implementations
- [x] Delete old services
- [x] Keep: module.ts, public-api.ts, package.json, tsconfig.json, angular.json

### Phase 2: Core Structure ✓
- [x] Update module.ts with proper imports
- [x] Create directory structure
- [x] Create shared form-styles.css

### Phase 3: Services ✓
- [x] EventService (real MJ data access)
- [x] SubmissionService (real MJ data access)
- [x] SpeakerService (real MJ data access)

### Phase 4: Shared Components ✓
- [x] KpiCardComponent
- [x] StatusBadgeComponent
- [x] SubmissionListComponent
- [x] SpeakerListComponent

### Phase 5: Forms ✓
- [x] EventFormComponent
- [x] SubmissionFormComponent
- [x] SpeakerFormComponent

### Phase 6: Dashboards ✓
- [x] EventManagementDashboardComponent
- [x] AbstractSubmissionDashboardComponent

### Phase 7: Finalization ✓
- [x] Update public-api.ts
- [x] Build UI package
- [x] Build MJExplorer
- [x] Verify no errors

## File Checklist

### Services (3 files)
- [ ] src/services/event.service.ts
- [ ] src/services/submission.service.ts
- [ ] src/services/speaker.service.ts

### Shared Components (4 files)
- [ ] src/dashboards/components/kpi-card.component.ts
- [ ] src/dashboards/components/status-badge.component.ts
- [ ] src/dashboards/components/submission-list.component.ts
- [ ] src/dashboards/components/speaker-list.component.ts

### Forms (6 files)
- [ ] src/forms/event-form/event-form.component.ts
- [ ] src/forms/event-form/event-form.component.html
- [ ] src/forms/submission-form/submission-form.component.ts
- [ ] src/forms/submission-form/submission-form.component.html
- [ ] src/forms/speaker-form/speaker-form.component.ts
- [ ] src/forms/speaker-form/speaker-form.component.html

### Dashboards (6 files)
- [ ] src/dashboards/event-management/event-management-dashboard.component.ts
- [ ] src/dashboards/event-management/event-management-dashboard.component.html
- [ ] src/dashboards/event-management/event-management-dashboard.component.scss
- [ ] src/dashboards/abstract-submission/abstract-submission-dashboard.component.ts
- [ ] src/dashboards/abstract-submission/abstract-submission-dashboard.component.html
- [ ] src/dashboards/abstract-submission/abstract-submission-dashboard.component.scss

### Module Files (3 files)
- [ ] src/module.ts (update)
- [ ] src/public-api.ts (update)
- [ ] src/forms/shared/form-styles.css (create)

## Build Commands

```bash
# Build UI package
cd /Users/amith/Dropbox/develop/Mac/MJ/Demos/EventAbstractSubmission/code/UI
npm run build

# Build MJExplorer
cd /Users/amith/Dropbox/develop/Mac/MJ/packages/Angular/Explorer
npm run build
```

## Success Criteria
- [ ] All TypeScript files compile without errors
- [ ] All components follow MJ patterns
- [ ] No Angular Material imports
- [ ] No ReactiveFormsModule usage
- [ ] All forms extend BaseFormComponent
- [ ] All dashboards extend BaseDashboard
- [ ] All services use RunView/Metadata
- [ ] MJExplorer builds successfully
