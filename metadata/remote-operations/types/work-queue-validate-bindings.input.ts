/** Input for `WorkQueue.ValidateBindings`. */
export interface WorkQueueValidateBindingsInput {
    /** Validate only this transport's bindings against its resources. Omit to validate the whole topology. */
    transportName?: string;
}
