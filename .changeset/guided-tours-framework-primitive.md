---
"@memberjunction/graph": minor
"@memberjunction/tours-runtime": minor
"@memberjunction/ng-tours": minor
"@memberjunction/tours-server": minor
"@memberjunction/core-entities": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-agents": minor
"@memberjunction/task-graph": minor
"@memberjunction/standards": minor
"@memberjunction/server": minor
"@memberjunction/ng-shared-generic": minor
"@memberjunction/ng-base-forms": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-task-graph-editor": minor
"@memberjunction/ng-base-application": minor
"@memberjunction/ng-shared": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/ng-explorer-app": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
---

Add the Guided Tours framework primitive (Phases 0–3) and extract `@memberjunction/graph` as a standalone zero-dependency graph engine.

- **`@memberjunction/graph`**: Extract generic DAG/state-machine traversal (`IGraphRepository`, `FindEligibleNodes`, `EvaluateOutgoingEdges`, `IsJoinSatisfied`, `DetectCycle`), topological/reachability/dominator algorithms, and pure Sugiyama layered layout (`LayoutGraphNodes`, `RankGraphNodes`, `GraphLayoutBounds`) from `@memberjunction/ai-core-plus` into a standalone L0 package shared by Flow agents, TaskGraph, and Guided Tours.
- **Guided Tours schema, JSONTypes & Remote Operations**: Add the 14-table Guided Tours schema (`Tour`, `TourVersion`, `TourStep`, `TourStepPath`, `TourStepType`, `TourTrigger`, `TourPrerequisite`, `TourSurface`, `TourSurfaceTour`, `LearningPath`, `LearningPathTour`, `TourRun`, `TourRunStep`, `TourOverride`), strongly typed `Configuration` / `Anchor` / `Completion` / `Goal` / `Prepare` / `LaunchPolicy` / `Definition` `JSONType` interfaces, and 5 `Tours.*` Remote Operations (`RecordEvents`, `EvaluatePredicates`, `GetSurfaceTours`, `ClaimGuestRuns`, `PublishTour`).
- **`@memberjunction/tours-runtime` & `TourEngine`**: Add the pure TypeScript `TourSession` runtime with pluggable step logic (`Spotlight`, `Coachmark`, `Modal`, `Banner`, `Hotspot`, `Checklist`, `Choice`, `AskAgent`, `EmbeddedComponent`), 13 anchor strategies, 10 completion checks, 7 smart triggers, eligibility & interruption-budget chain, `Visual` / `Verify` / `Recorder` directors, `TourAgentToolkit`, and `TourEngine` client metadata/progress cache.
- **`@memberjunction/ng-tours` & `<mj-tour-host>` web element**: Add Light DOM tour overlays isolated via `@layer mj-tours-defaults` + `mjt-` classes + `--mj-z-tour-*` tokens, SVG `evenodd` spotlight cutout, `SiblingInertManager` / `TourFocusManager`, runtime `ComponentSpec` interactive steps (`<mj-react-component>`), and a two-stage standalone `<mj-tour-host>` custom element (`mj-tours.js` shell + lazy `mj-tours-session.js` + split step chunks).
- **`@memberjunction/tours-server` & shared embed sessions**: Add `MJTourEntityServer` / `MJTourStepEntityServer` / `MJTourVersionEntityServer` immutability & canonical SHA-256 snapshotting, server predicates, Remote Operations, Actions, `TourSurface` (`ts_*`) guest session support in `WidgetSessionService` with RV4 guest-to-user claim and RV5 erasure, 6 core shipped tours, 2 interactive `ComponentSpec` tour widgets, and 3 learning paths.
- **MJ Explorer, Tour Studio, Voice Channel & `tour-anchors` check**: Integrate `ExplorerTourHost`, shell Help/Tours launcher, Omnibar tour search & `"how do I"` signal, Home learning-path strip, 4-tab `TourStudioDashboard` (Catalog, Graph & Step Builder, Learning Paths & Overrides, Analytics & Broken-Step Queue), headless `TourChannel` realtime voice plugin, `FormAnchorNavigator`, and the `tour-anchors` static standards check.
