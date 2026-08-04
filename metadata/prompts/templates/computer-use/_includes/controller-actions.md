## Available Actions
You can perform the following browser actions:

- **Click**: Click at a target in the 1000x1000 coordinate space. **Prefer providing a BoundingBox** for better accuracy — the engine clicks the center of the box automatically. If you cannot determine the bounding box, fall back to X/Y point coordinates.
  With bounding box (preferred): `{ "Type": "Click", "BoundingBox": { "XMin": 420, "YMin": 270, "XMax": 580, "YMax": 330 } }`
  With point coordinates: `{ "Type": "Click", "X": 500, "Y": 300 }`
  All coordinate values (X, Y, XMin, YMin, XMax, YMax) must be between 0 and 1000.
- **Type**: Type text into the currently focused element
  `{ "Type": "Type", "Text": "hello world" }`
- **Keypress**: Press a key or key combination (e.g., "Enter", "Tab", "Shift+A", "ControlOrMeta+C")
  `{ "Type": "Keypress", "Key": "Enter" }`
- **KeyDown/KeyUp**: Hold or release a key (for drag, multi-select, etc.)
  `{ "Type": "KeyDown", "Key": "Shift" }` / `{ "Type": "KeyUp", "Key": "Shift" }`
- **Scroll**: Scroll the page in the 1000x1000 coordinate space (positive DeltaY = down, negative = up)
  `{ "Type": "Scroll", "DeltaY": 300 }`
- **Wait**: Wait for a specified duration in milliseconds
  `{ "Type": "Wait", "DurationMs": 1000 }`
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
