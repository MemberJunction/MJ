/**
 * Priority queue implementation for managing queued execution tasks
 *
 * Items with lower priority values are dequeued first (0 = highest priority).
 * Maintains sorted order for efficient dequeue operations.
 *
 * @template T - Item type, must have a numeric 'priority' property
 *
 * @example
 * ```typescript
 * interface Task {
 *   id: string;
 *   priority: number;
 * }
 *
 * const queue = new PriorityQueue<Task>();
 *
 * // Add tasks (lower priority number = higher priority)
 * queue.enqueue({ id: 'a', priority: 100 });
 * queue.enqueue({ id: 'b', priority: 50 });  // Higher priority
 * queue.enqueue({ id: 'c', priority: 200 });
 *
 * // Dequeue in priority order
 * const first = queue.dequeue(); // { id: 'b', priority: 50 }
 * const second = queue.dequeue(); // { id: 'a', priority: 100 }
 * ```
 */
export class PriorityQueue<T extends { priority: number }> {
    /**
     * Ordered list of items (lowest priority first)
     */
    private items: T[] = [];

    /**
     * Creates a priority queue
     *
     * @param initialItems - Optional initial items to populate queue
     */
    constructor(initialItems?: T[]) {
        if (initialItems) {
            this.items = [...initialItems];
            this.sort();
        }
    }

    /**
     * Add an item to the queue
     *
     * Items are inserted in priority order (lower priority value = higher priority).
     * O(n) time complexity in worst case (insertion at end).
     *
     * @param item - Item to enqueue
     */
    public enqueue(item: T): void {
        // Find insertion point using binary search
        const insertIndex = this.findInsertionIndex(item.priority);
        this.items.splice(insertIndex, 0, item);
    }

    /**
     * Remove and return the highest priority item
     *
     * @returns Highest priority item, or undefined if queue is empty
     */
    public dequeue(): T | undefined {
        return this.items.shift();
    }

    /**
     * View the highest priority item without removing it
     *
     * @returns Highest priority item, or undefined if queue is empty
     */
    public peek(): T | undefined {
        return this.items[0];
    }

    /**
     * Get the number of items in the queue
     *
     * @returns Number of items
     */
    public size(): number {
        return this.items.length;
    }

    /**
     * Check if queue is empty
     *
     * @returns True if queue has no items
     */
    public isEmpty(): boolean {
        return this.items.length === 0;
    }

    /**
     * Remove a specific item from the queue
     *
     * @param item - Item to remove
     * @returns True if item was found and removed
     */
    public remove(item: T): boolean {
        const index = this.items.indexOf(item);
        if (index !== -1) {
            this.items.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Remove item by predicate function
     *
     * @param predicate - Function to test each item
     * @returns True if any items were removed
     */
    public removeWhere(predicate: (item: T) => boolean): boolean {
        const originalLength = this.items.length;
        this.items = this.items.filter(item => !predicate(item));
        return this.items.length < originalLength;
    }

    /**
     * Clear all items from the queue
     */
    public clear(): void {
        this.items = [];
    }

    /**
     * Get all items in priority order (does not remove them)
     *
     * @returns Array of all items in priority order
     */
    public toArray(): T[] {
        return [...this.items];
    }

    /**
     * Find items matching a predicate
     *
     * @param predicate - Function to test each item
     * @returns Array of matching items in priority order
     */
    public find(predicate: (item: T) => boolean): T[] {
        return this.items.filter(predicate);
    }

    /**
     * Check if queue contains an item matching predicate
     *
     * @param predicate - Function to test each item
     * @returns True if any item matches
     */
    public contains(predicate: (item: T) => boolean): boolean {
        return this.items.some(predicate);
    }

    /**
     * Get items with specific priority
     *
     * @param priority - Priority value to match
     * @returns Array of items with matching priority
     */
    public getItemsWithPriority(priority: number): T[] {
        return this.items.filter(item => item.priority === priority);
    }

    /**
     * Get items within priority range
     *
     * @param minPriority - Minimum priority (inclusive)
     * @param maxPriority - Maximum priority (inclusive)
     * @returns Array of items within priority range
     */
    public getItemsInPriorityRange(minPriority: number, maxPriority: number): T[] {
        return this.items.filter(item => item.priority >= minPriority && item.priority <= maxPriority);
    }

    /**
     * Get queue statistics
     *
     * @returns Statistics about queue contents
     */
    public getStatistics(): PriorityQueueStatistics {
        if (this.items.length === 0) {
            return {
                size: 0,
                isEmpty: true,
                minPriority: null,
                maxPriority: null,
                averagePriority: null
            };
        }

        const priorities = this.items.map(item => item.priority);
        const sum = priorities.reduce((a, b) => a + b, 0);

        return {
            size: this.items.length,
            isEmpty: false,
            minPriority: this.items[0].priority,
            maxPriority: this.items[this.items.length - 1].priority,
            averagePriority: sum / this.items.length
        };
    }

    /**
     * Update priority of an item and reposition in queue
     *
     * @param item - Item to update
     * @param newPriority - New priority value
     * @returns True if item was found and updated
     */
    public updatePriority(item: T, newPriority: number): boolean {
        const index = this.items.indexOf(item);
        if (index === -1) {
            return false;
        }

        // Remove item
        this.items.splice(index, 1);

        // Update priority and re-insert
        item.priority = newPriority;
        this.enqueue(item);

        return true;
    }

    /**
     * Get count of items by priority levels
     *
     * @returns Map of priority values to count of items at that priority
     */
    public getPriorityDistribution(): Map<number, number> {
        const distribution = new Map<number, number>();

        for (const item of this.items) {
            const count = distribution.get(item.priority) || 0;
            distribution.set(item.priority, count + 1);
        }

        return distribution;
    }

    /**
     * Drain queue up to specified count
     *
     * Removes and returns up to 'count' highest priority items.
     *
     * @param count - Maximum number of items to drain
     * @returns Array of drained items in priority order
     */
    public drain(count: number): T[] {
        const drained: T[] = [];
        const drainCount = Math.min(count, this.items.length);

        for (let i = 0; i < drainCount; i++) {
            const item = this.dequeue();
            if (item) {
                drained.push(item);
            }
        }

        return drained;
    }

    /**
     * Find insertion index for a given priority using binary search
     *
     * @param priority - Priority value to find insertion point for
     * @returns Index where item should be inserted
     * @private
     */
    private findInsertionIndex(priority: number): number {
        let left = 0;
        let right = this.items.length;

        while (left < right) {
            const mid = Math.floor((left + right) / 2);
            if (this.items[mid].priority <= priority) {
                left = mid + 1;
            } else {
                right = mid;
            }
        }

        return left;
    }

    /**
     * Sort all items by priority (used during initialization)
     *
     * @private
     */
    private sort(): void {
        this.items.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Verify queue maintains correct priority order
     *
     * Used for testing and debugging.
     *
     * @returns True if queue is properly sorted
     */
    public isValid(): boolean {
        for (let i = 1; i < this.items.length; i++) {
            if (this.items[i - 1].priority > this.items[i].priority) {
                return false;
            }
        }
        return true;
    }
}

/**
 * Statistics about a priority queue
 */
export interface PriorityQueueStatistics {
    /**
     * Number of items in queue
     */
    size: number;

    /**
     * Whether queue is empty
     */
    isEmpty: boolean;

    /**
     * Lowest priority value (highest priority item)
     */
    minPriority: number | null;

    /**
     * Highest priority value (lowest priority item)
     */
    maxPriority: number | null;

    /**
     * Average priority value
     */
    averagePriority: number | null;
}
