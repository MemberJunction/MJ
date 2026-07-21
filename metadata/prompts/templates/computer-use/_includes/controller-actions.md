## Available Actions
You can perform the following browser actions:

- **Click**: Click at a target in the 1000x1000 coordinate space. **Prefer providing a BoundingBox** for better accuracy — the engine clicks the center of the box automatically. If you cannot determine the bounding box, fall back to X/Y point coordinates.
  With bounding box (preferred): `{ "Type": "Click", "BoundingBox": { "XMin": 420, "YMin": 270, "XMax": 580, "YMax": 330 } }`
  With point coordinates: `{ "Type": "Click", "X": 500, "Y": 300 }`
  All coordinate values (X, Y, XMin, YMin, XMax, YMax) must be between 0 and 1000.
  **Double-click** (e.g. to open a grid row): add `"ClickCount": 2`. **Right-click** (context menu): add `"Button": "right"`.
  `{ "Type": "Click", "BoundingBox": { ... }, "ClickCount": 2 }`
  **Selector targeting (more reliable than coordinates when you can name the element):** add a `Selector` (a CSS selector) and the engine clicks that element with automatic actionability waiting — X/Y/BoundingBox are then ignored. Prefer text- or role-anchored selectors over fragile structural ones:
  `{ "Type": "Click", "Selector": "button:has-text(\"Save\")" }`
  **Modifiers** (held during the click) enable shift-click range-select and open-in-new: add `"Modifiers": ["Shift"]` or `["ControlOrMeta"]`.
- **Type**: Type text into the currently focused element
  `{ "Type": "Type", "Text": "hello world" }`
  Optionally focus a specific field first with a `Selector`: `{ "Type": "Type", "Selector": "input[name=\"email\"]", "Text": "a@b.com" }`
- **Keypress**: Press a key or key combination (e.g., "Enter", "Tab", "Shift+A", "ControlOrMeta+C")
  `{ "Type": "Keypress", "Key": "Enter" }`
  You may also supply modifiers structurally: `{ "Type": "Keypress", "Key": "a", "Modifiers": ["ControlOrMeta"] }` (select-all).
- **KeyDown/KeyUp**: Hold or release a key (for drag, multi-select, etc.)
  `{ "Type": "KeyDown", "Key": "Shift" }` / `{ "Type": "KeyUp", "Key": "Shift" }`
- **Scroll**: Scroll the page in the 1000x1000 coordinate space (positive DeltaY = down, negative = up)
  `{ "Type": "Scroll", "DeltaY": 300 }`
  To bring a specific element into view instead, give a `Selector`: `{ "Type": "Scroll", "Selector": "tr:has-text(\"Total\")" }`
- **Wait**: Wait for something to happen. **Strongly prefer waiting for the element you expect over a fixed duration** — give a `Selector` and the engine waits (bounded) until it appears:
  `{ "Type": "Wait", "Selector": ".record-form" }` (preferred — "wait for the thing, not a guess")
  Only when there is no such element, fall back to a duration: `{ "Type": "Wait", "DurationMs": 1000 }`
- **Navigate**: Navigate to a URL
  `{ "Type": "Navigate", "Url": "https://example.com" }`
- **GoBack/GoForward**: Browser history navigation
  `{ "Type": "GoBack" }` / `{ "Type": "GoForward" }`
- **Refresh**: Refresh the current page
  `{ "Type": "Refresh" }`
- **Drag**: Drag from a start point to an end point. Use this for column resize, column reorder, slider handles, and any other UI that requires mouse-down → mouse-move → mouse-up. **Prefer providing StartBoundingBox / EndBoundingBox** over raw coordinates so the engine drags between centroids.
  Resize a column wider (drag the right-edge separator further right):
  `{ "Type": "Drag", "StartBoundingBox": { "XMin": 478, "YMin": 258, "XMax": 482, "YMax": 274 }, "EndBoundingBox": { "XMin": 600, "YMin": 258, "XMax": 604, "YMax": 274 } }`
  Reorder a column (drag the column header to a new position):
  `{ "Type": "Drag", "StartBoundingBox": { "XMin": 420, "YMin": 258, "XMax": 540, "YMax": 274 }, "EndBoundingBox": { "XMin": 700, "YMin": 258, "XMax": 820, "YMax": 274 } }`
  Or with raw coordinates: `{ "Type": "Drag", "StartX": 480, "StartY": 266, "EndX": 600, "EndY": 266 }`
  Optional `Steps` field controls smoothness (default 10; HTML5 drag-and-drop usually needs at least 5).
