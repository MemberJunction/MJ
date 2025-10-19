# Infographic System Implementation Plan

**Status**: IN PROGRESS
**Started**: 2025-10-19
**Est. Completion**: 3-4 weeks

---

## PHASE 1: SHARED INFRASTRUCTURE ✅ COMPLETE

### Task 1.1: Create Type Definitions ✅
- [x] Create `packages/Actions/CoreActions/src/custom/visualization/shared/svg-types.ts`
- [x] Define `ViewBox`, `Branding`, `Palette`, `Accessibility`, `AnimationOptions`
- [x] Define `FontSpec`, `ExportControls`, `SVGActionResult`
- [x] Define diagram-specific types: `FlowNode`, `FlowEdge`, `OrgNode`, `ERTable`, etc.
- [x] Define network types: `GraphNode`, `GraphEdge`, `NetworkLayout`
- [x] Define word cloud types: `WordItem`, `CloudLayout`

### Task 1.2: Create SVG Utilities ✅
- [x] Create `packages/Actions/CoreActions/src/custom/visualization/shared/svg-utils.ts`
- [x] Implement `createSVG()` - base SVG creation with jsdom
- [x] Implement `sanitizeText()` - XSS prevention
- [x] Implement `sanitizeSVG()` - strip external refs and event handlers
- [x] Implement `generateId()` - unique ID generation with prefix
- [x] Implement `addA11y()` - add title/desc elements
- [x] Implement `addStyles()` - inject inline CSS from palette
- [x] Implement `calculateViewBox()` - auto-sizing with padding

### Task 1.3: Create Theming System ✅
- [x] Create `packages/Actions/CoreActions/src/custom/visualization/shared/svg-theming.ts`
- [x] Define `PALETTES` constant with mjDefault, gray, pastel, highContrast
- [x] Implement `getPalette()` - retrieve palette by name
- [x] Implement `getColorForIndex()` - categorical color cycling
- [x] Implement `getSequentialColor()` - sequential color scales
- [x] Implement `generateCSS()` - create inline styles from palette
- [x] Implement `getFontStack()` - system font fallbacks

### Task 1.4: Package Dependencies ✅
- [x] Add `@dagrejs/dagre` to package.json
- [x] Add `d3-cloud` to package.json
- [x] Add `d3-force` to package.json
- [x] Add `d3-hierarchy` to package.json
- [x] Add `d3-scale` to package.json
- [x] Add `d3-shape` to package.json
- [x] Add type definitions for d3 packages
- [x] Run `npm install` at repo root
- [x] Verify TypeScript types are available

---

## PHASE 2: CREATE SVG DIAGRAM ACTION

### Task 2.1: Action Class Setup
- [ ] Create `packages/Actions/CoreActions/src/custom/visualization/create-svg-diagram.action.ts`
- [ ] Extend `BaseAction` class
- [ ] Add `@RegisterClass` decorator with "__CreateSVGDiagram"
- [ ] Implement `InternalRunAction()` method
- [ ] Add JSDoc documentation with examples

### Task 2.2: Parameter Extraction
- [ ] Implement `getParamValue()` helper (or reuse from base)
- [ ] Extract `DiagramType` parameter ('flow' | 'org' | 'er')
- [ ] Extract `Nodes` parameter (JSON array)
- [ ] Extract `Edges` parameter (JSON array)
- [ ] Extract `Direction` parameter ('TB' | 'LR' | 'RL' | 'BT')
- [ ] Extract `Width`, `Height` parameters
- [ ] Extract `Title`, `Palette`, `Seed` parameters
- [ ] Validate required parameters per diagram type

### Task 2.3: Flowchart Implementation (Dagre)
- [ ] Implement `renderFlowDiagram()` method
- [ ] Create dagre graph with rankdir, nodesep, ranksep
- [ ] Add nodes with width/height based on kind (start, process, decision, end)
- [ ] Add edges to graph
- [ ] Run `dagre.layout(graph)`
- [ ] Render nodes as SVG shapes (rect, diamond, rounded rect, circle)
- [ ] Add node labels as `<text>` elements
- [ ] Render edges as `<path>` with arrows
- [ ] Add edge labels if provided
- [ ] Handle dashed edges
- [ ] Apply palette colors by node type

### Task 2.4: Org Chart Implementation (D3 Hierarchy)
- [ ] Implement `renderOrgChart()` method
- [ ] Convert `OrgNode` tree to d3-hierarchy structure
- [ ] Create tree layout with `d3.tree()`
- [ ] Set node size and separation
- [ ] Calculate layout positions
- [ ] Render nodes as rounded rectangles
- [ ] Add avatar placeholders (circle with initials if no avatarUrl)
- [ ] Add name and role text
- [ ] Render connecting lines between parent/child
- [ ] Handle highlight styling for specific nodes
- [ ] Apply hierarchical coloring (depth-based)

### Task 2.5: ER Diagram Implementation (Dagre)
- [ ] Implement `renderERDiagram()` method
- [ ] Parse `ERTable` array
- [ ] Create dagre graph for table layout
- [ ] Calculate table node sizes based on attribute count
- [ ] Render table headers with entity name
- [ ] Render attribute rows (name, type, PK/FK indicators)
- [ ] Add PK/FK icons (🔑/🔗)
- [ ] Parse `ERRelation` array
- [ ] Render relationship lines (1-1, 1-N, N-M)
- [ ] Add cardinality labels
- [ ] Apply database-style colors (header bg, alternating rows)

### Task 2.6: Common Diagram Features
- [ ] Implement title rendering at top
- [ ] Add `<defs>` for reusable elements (arrows, gradients)
- [ ] Add shadow effects (optional)
- [ ] Implement border radius control
- [ ] Add `<title>` tooltips to nodes
- [ ] Handle edge cases (empty nodes, invalid connections)
- [ ] Return `SVGActionResult` with diagnostics

---

## PHASE 3: CREATE SVG WORD CLOUD ACTION

### Task 3.1: Action Class Setup
- [ ] Create `packages/Actions/CoreActions/src/custom/visualization/create-svg-word-cloud.action.ts`
- [ ] Extend `BaseAction` class
- [ ] Add `@RegisterClass` decorator with "__CreateSVGWordCloud"
- [ ] Implement `InternalRunAction()` method
- [ ] Add JSDoc documentation

### Task 3.2: Parameter Extraction
- [ ] Extract `CloudType` parameter ('cloud' | 'tagbar')
- [ ] Extract `Words` parameter (JSON array of {text, weight})
- [ ] Extract `MaxWords` parameter (default 50)
- [ ] Extract `Rotation` parameter ('none' | 'few' | 'mixed')
- [ ] Extract `MinFont`, `MaxFont` parameters
- [ ] Extract `Seed` parameter for deterministic layout
- [ ] Extract `Width`, `Height`, `Title`, `Palette`
- [ ] Validate and sort words by weight

### Task 3.3: Word Cloud Implementation (d3-cloud)
- [ ] Implement `renderWordCloud()` method
- [ ] Set up seeded random number generator
- [ ] Calculate font sizes using log scale (weight → fontSize)
- [ ] Configure d3-cloud with canvas, spiral, padding
- [ ] Set rotation angles based on `Rotation` parameter
- [ ] Run layout algorithm (async)
- [ ] Convert canvas layout to SVG `<text>` elements
- [ ] Position text elements at computed coordinates
- [ ] Apply rotation transforms
- [ ] Apply palette colors (gradient or categorical)
- [ ] Handle overflow (words that don't fit)

### Task 3.4: Tag Bar Implementation (Custom)
- [ ] Implement `renderTagBar()` method
- [ ] Sort words by weight descending
- [ ] Cap at `MaxWords`
- [ ] Calculate bar widths proportional to weight
- [ ] Determine if horizontal or vertical orientation
- [ ] Render rectangles with width/height based on weight
- [ ] Add text labels inside or beside bars
- [ ] Apply alternating or gradient colors
- [ ] Add hover-friendly spacing
- [ ] Ensure text doesn't overflow bars

### Task 3.5: Common Features
- [ ] Add title rendering
- [ ] Handle empty word lists gracefully
- [ ] Add weight normalization (prevent extreme size ratios)
- [ ] Return warnings if words were truncated
- [ ] Return `SVGActionResult` with word count diagnostic

---

## PHASE 4: CREATE SVG NETWORK ACTION

### Task 4.1: Action Class Setup
- [ ] Create `packages/Actions/CoreActions/src/custom/visualization/create-svg-network.action.ts`
- [ ] Extend `BaseAction` class
- [ ] Add `@RegisterClass` decorator with "__CreateSVGNetwork"
- [ ] Implement `InternalRunAction()` method
- [ ] Add JSDoc documentation

### Task 4.2: Parameter Extraction
- [ ] Extract `NetworkType` parameter ('force' | 'tree' | 'radial')
- [ ] Extract `Nodes` parameter (JSON array of {id, label, group, size})
- [ ] Extract `Edges` parameter (JSON array of {source, target, weight, directed})
- [ ] Extract `Physics` parameter (charge, linkDistance, iterations)
- [ ] Extract `ShowLabels`, `ShowLegend` parameters
- [ ] Extract `Width`, `Height`, `Title`, `Palette`, `Seed`
- [ ] Validate node/edge references

### Task 4.3: Force Network Implementation (d3-force)
- [ ] Implement `renderForceNetwork()` method
- [ ] Set up seeded random number generator for positions
- [ ] Initialize nodes with random positions
- [ ] Create force simulation with forceLink, forceManyBody, forceCenter, forceCollide
- [ ] Run simulation for N iterations (headless - no animation)
- [ ] Render edges as `<line>` or `<path>` (curved for overlap)
- [ ] Add arrows for directed edges
- [ ] Render nodes as `<circle>` with size based on node.size or degree
- [ ] Apply group colors from palette
- [ ] Add node labels if `ShowLabels` is true
- [ ] Position labels to avoid overlap

### Task 4.4: Decision Tree Implementation (d3-hierarchy.tree)
- [ ] Implement `renderDecisionTree()` method
- [ ] Build tree structure from node hierarchy
- [ ] Create tree layout with `d3.tree()`
- [ ] Set orientation (TB or LR)
- [ ] Calculate layout
- [ ] Render nodes based on `nodeShape` (rect, circle, pill)
- [ ] Show values/probabilities if present
- [ ] Render links as paths (elbow or diagonal)
- [ ] Handle collapsed nodes (visual indicator)
- [ ] Add interactivity markers if enabled

### Task 4.5: Radial Network Implementation (d3-force + radial constraint)
- [ ] Implement `renderRadialNetwork()` method
- [ ] Identify central node(s)
- [ ] Use force simulation with radial force
- [ ] Arrange nodes in concentric circles by distance from center
- [ ] Render with same edge/node logic as force network
- [ ] Emphasize center node(s) with larger size/different color

### Task 4.6: Common Features
- [ ] Implement legend rendering (groups with color swatches)
- [ ] Handle large graphs (warn if > 500 nodes, suggest sampling)
- [ ] Add edge weight visualization (stroke width)
- [ ] Prevent edge/node label overlap (basic collision detection)
- [ ] Return complexity warnings in diagnostics
- [ ] Return `SVGActionResult`

---

## PHASE 5: ACTION METADATA REGISTRATION

### Task 5.1: Create SVG Diagram Metadata
- [ ] Create `metadata/actions/.create-svg-diagram.json`
- [ ] Define action fields: Name, Description, Category, Status
- [ ] Set Category to "Visualization"
- [ ] Add icon: "fa-solid fa-diagram-project"
- [ ] Create Action Params for DiagramType, Nodes, Edges, Direction, Width, Height, Title, Palette, Seed
- [ ] Add detailed parameter descriptions with examples

### Task 5.2: Create SVG Word Cloud Metadata
- [ ] Create `metadata/actions/.create-svg-word-cloud.json`
- [ ] Define action fields
- [ ] Set icon: "fa-solid fa-cloud-word"
- [ ] Create Action Params for CloudType, Words, MaxWords, Rotation, MinFont, MaxFont, Width, Height, Title, Palette, Seed
- [ ] Add usage examples in Description

### Task 5.3: Create SVG Network Metadata
- [ ] Create `metadata/actions/.create-svg-network.json`
- [ ] Define action fields
- [ ] Set icon: "fa-solid fa-network-wired"
- [ ] Create Action Params for NetworkType, Nodes, Edges, Physics, ShowLabels, ShowLegend, Width, Height, Title, Palette, Seed
- [ ] Add examples for each network type

### Task 5.4: Update CoreActions Index
- [ ] Edit `packages/Actions/CoreActions/src/index.ts`
- [ ] Add exports for new actions
- [ ] Add loader functions to ensure classes aren't tree-shaken

---

## PHASE 6: INFOGRAPHIC AGENT - METADATA & PROMPTS

### Task 6.1: Study Existing Agent Patterns
- [x] Review Research Agent structure (.research-agent.json)
- [x] Review Report Writer structure (nested agent pattern)
- [x] Review agent relationship configuration (SubAgentOutputMapping)
- [x] Review payload path configuration (PayloadSelfWritePaths, etc.)
- [x] Note Loop agent type usage pattern

### Task 6.2: Create Infographic Agent Prompt
- [ ] Create `metadata/prompts/.infographic-agent-prompt.json`
- [ ] Define prompt with visualization guidance
- [ ] Add examples of good infographic compositions
- [ ] Include output format requirements
- [ ] Add template sections with placeholders

### Task 6.3: Create Infographic Agent Metadata
- [ ] Create `metadata/agents/.infographic-agent.json`
- [ ] Define agent fields (Name, Description, TypeID, etc.)
- [ ] Add AI Agent Prompts relationship
- [ ] Add AI Agent Actions relationships for all visualization actions
- [ ] Set ResultExpirationTurns/Mode for action results

### Task 6.4: Create Infographic Types
- [ ] Create `packages/AI/CorePlus/src/infographic-types.ts`
- [ ] Define `InfographicBrief` interface
- [ ] Define `PanelSpec`, `LayoutSpec`, `DataSource` types
- [ ] Define `InfographicResult` interface
- [ ] Export from CorePlus index

---

## PHASE 7: INFOGRAPHIC AGENT - IMPLEMENTATION

### Task 7.1: Create Agent Class Skeleton
- [ ] Create `packages/AI/Agents/src/agents/infographic-agent.ts`
- [ ] Extend `BaseAgent` class
- [ ] Set up constructor
- [ ] Register class properly

### Task 7.2: Implement Panel Rendering Logic
- [ ] Implement `renderPanel()` method
- [ ] Add error handling for action failures
- [ ] Add validation for data shape vs panel type

### Task 7.3: Implement Layout Calculation
- [ ] Implement `calculateLayout()` method
- [ ] Handle different grid columns
- [ ] Account for gutter spacing
- [ ] Reserve space for header/footer

### Task 7.4: Implement SVG Composition
- [ ] Implement `composeSVG()` method
- [ ] Create master SVG element
- [ ] Add header/footer text blocks
- [ ] Wrap panels in groups with transforms
- [ ] Ensure unique IDs
- [ ] Consolidate defs and styles

### Task 7.5: Implement HTML Block Composition
- [ ] Implement `composeHTML()` method
- [ ] Create HTML wrapper with CSS Grid
- [ ] Add responsive styling
- [ ] Ensure print-friendly

### Task 7.6: Implement Main Orchestration
- [ ] Parse InfographicBrief from payload
- [ ] Calculate layout
- [ ] Render panels
- [ ] Compose final output
- [ ] Return InfographicResult

### Task 7.7: Add Sanitization & Security
- [ ] Implement sanitize() method
- [ ] Strip external references
- [ ] Remove event handlers
- [ ] Validate hrefs
- [ ] Apply to all output

---

## PHASE 8: INTEGRATION WITH RESEARCH REPORT WRITER

### Task 8.1: Add Infographic Agent Relationship
- [ ] Edit `metadata/agents/.research-agent.json`
- [ ] Add AI Agent Relationship for Infographic Agent to Research Report Writer

### Task 8.2: Update Report Writer Prompt
- [ ] Edit `metadata/prompts/.research-report-writer-prompt.json`
- [ ] Add Infographic Agent usage guidance
- [ ] Add examples and best practices

### Task 8.3: Update Report Writer Action Access
- [ ] Verify agent relationships are correct
- [ ] Test action chain access

---

## PHASE 9: TESTING & VALIDATION

### Task 9.1: Unit Tests for Actions
- [ ] Test Create SVG Diagram (flow, org, ER)
- [ ] Test Create SVG Word Cloud (cloud, tagbar)
- [ ] Test Create SVG Network (force, tree, radial)
- [ ] Test error handling

### Task 9.2: Integration Tests for Infographic Agent
- [ ] Test single-panel infographic
- [ ] Test multi-panel layouts
- [ ] Test header/footer rendering
- [ ] Test palette consistency
- [ ] Test partial failures

### Task 9.3: End-to-End Tests
- [ ] Test Research Report Writer calling Infographic Agent
- [ ] Test direct Infographic Agent invocation
- [ ] Test complex scenarios

### Task 9.4: Security & Performance Testing
- [ ] Verify XSS prevention
- [ ] Test sanitization
- [ ] Test performance with large datasets
- [ ] Verify complexity warnings
- [ ] Test deterministic output

---

## PHASE 10: DOCUMENTATION & EXAMPLES

### Task 10.1: Action Documentation
- [ ] Write README for visualization actions
- [ ] Add code examples
- [ ] Document parameter schemas
- [ ] Create visual gallery

### Task 10.2: Infographic Agent Documentation
- [ ] Write usage guide
- [ ] Document InfographicBrief schema
- [ ] Provide example briefs
- [ ] Document best practices

### Task 10.3: Integration Documentation
- [ ] Update Research Report Writer docs
- [ ] Add infographic examples
- [ ] Create tutorial

---

## Progress Tracking

**Phase 1**: ⏳ IN PROGRESS
**Phase 2**: ⏸️ NOT STARTED
**Phase 3**: ⏸️ NOT STARTED
**Phase 4**: ⏸️ NOT STARTED
**Phase 5**: ⏸️ NOT STARTED
**Phase 6**: ⏸️ NOT STARTED
**Phase 7**: ⏸️ NOT STARTED
**Phase 8**: ⏸️ NOT STARTED
**Phase 9**: ⏸️ NOT STARTED
**Phase 10**: ⏸️ NOT STARTED

**Overall Progress**: 0/150 tasks complete (0%)
