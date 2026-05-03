## Canvas Container Requirements (CRITICAL)

When using Chart.js directly, the canvas element MUST be wrapped in a container with:

- `position: 'relative'` -- Chart.js requires this for responsive sizing
- Explicit height (e.g. `height: '300px'` or `` height: `${height}px` ``) -- without this the canvas collapses to 0px
- `width: '100%'` -- fills parent width

### Pattern

```jsx
<div style={{ width: '100%', height: '300px', position: 'relative' }}>
  <canvas ref={canvasRef} />
</div>
```

### Chart.js Config

Always include in chart options:

```js
options: {
  responsive: true,
  maintainAspectRatio: false,
}
```

## Lifecycle

- Always destroy chart instances in the useEffect cleanup to prevent memory leaks
- Use a ref to store the chart instance: `chartRef.current = new Chart(...)`
- Cleanup: `return () => { chartRef.current?.destroy(); }`

## Access Pattern

- Use as global: `new Chart(canvasRef.current, config)`
- Do NOT use `window.Chart`
- Do NOT use `unwrapLibraryComponents` -- Chart.js is a utility library
