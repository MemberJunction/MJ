/**
 * Structured payload change request
 */
export type AgentPayloadChangeRequest<P = any> = {
    /**
     * New elements to add
     * Example: { newItem: "value" }
     */
    newElements?: Partial<P>;

    /**
     * Elements to update (only include changed fields)
     */
    updateElements?: Partial<P>;

    /**
     * Elements to remove. Use "_DELETE_" as value
     * Arrays: Include all items, use {} for kept items, "_DELETE_" for removed
     * Example: { items: [{}, "_DELETE_", {}] } removes 2nd item
     */
    removeElements?: Partial<P>;

    /**
     * Change reasoning
     */
    reasoning?: string;
}