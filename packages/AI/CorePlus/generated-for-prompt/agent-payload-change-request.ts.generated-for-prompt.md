```ts
type AgentPayloadChangeRequest<P = any> = {
    newElements?: Partial<P>;  // A partial of P that includes all new elements added that were **not** previously present in
    updateElements?: Partial<P>;  // A partial of P that includes all elements that should be updated in the payload.
    replaceElements?: Partial<P>;  // This partial of P includes all elements that should be replaced in the payload.
    removeElements?: Partial<P>;  // This partial of P includes all elements that should be removed from the payload. When an
    reasoning?: string;  // Description of the reasoning behind the changes requested.
};
```

Key patterns for `updateElements`:
- Use `{}` as placeholder for unchanged array items — only include properties being changed
- Use `"__DELETE__"` to remove properties or array elements at any nesting depth
- Nest objects to target deep properties surgically (e.g., `{ user: { email: "new@x.com" } }`)
- **Arrays merge positionally** — a shorter update array does NOT remove trailing elements. To shrink an array, use `replaceElements` instead.

`replaceElements` replaces the entire target object/array. Use when providing a complete replacement rather than surgical updates. **Use for primitive arrays** (e.g., `string[]`) when you want to set the exact final value.
`removeElements` marks top-level items for removal by setting their value to `"__DELETE__"`.
