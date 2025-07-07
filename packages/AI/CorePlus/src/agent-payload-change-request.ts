/**
 * This type is used by AI Models to provide a structured way to request changes to the agent's payload.
 */
export type AgentPayloadChangeRequest<P = any> = {
    /**
     * A partial of P that includes all new elements added that were **not** previously present in
     * the payload prior to the prompt execution. This allows the AI to specify the new elements
     * to be added clearly here. The structure is identical to the payload type P with just the
     * portions filled out that need to be added.
     * 
     * For example, if the existing payload was:
     * ```typescript
     * {
     *   "example": "value"
     * }
     * 
     * ```
     * And the AI wanted to add a new item, it would specify:
     * ```typescript
     * {    
     *   "newItem": "newValue"
     * }
     * ```
     * This indicates that the newItem should be added to the payload and the resulting payload would be:
     * ```typescript
     * {
     *   "example": "value",
     *   "newItem": "newValue"      
     * }    
     * ```
     * 
     * If the AI wanted to add multiple new items, it can do so by including them all in the same object:
     * ```typescript
     * {
     *   newItem1: "newValue1",
     *   newItem2: "newValue2"
     * }
     * ```
     */
    newElements?: Partial<P>;

    /**
     * A partial of P that includes all elements that should be updated in the payload.
     * This allows the AI to specify which elements should be updated in the payload.
     * The structure is identical to the payload type P with just the portions filled out
     * that need to be updated. **DO NOT INCLUDE ELEMENTS THAT ARE NOT CHANGING**.
     */
    updateElements?: Partial<P>;

    /**
     * This partial of P includes all elements that should be removed from the payload. When an
     * item needs to be removed, rather than the normal value, the AI should simply include the
     * item with a value of "_DELETE_". By doing this, the AI is telling us exactly which elements
     * to remove. 
     * 
     * For simple properties, you simple do:
     * ```typescript
     * {
     *   itemToRemove: '_DELETE_'
     * }
     * ```
     * 
     * This indicates that the itemToRemove should be removed from the payload.
     * 
     * If the AI wants to remove multiple items, it can do so by including them all in the same object:
     * ```typescript
     * {
     *   itemToRemove1: '_DELETE_',
     *   itemToRemove2: '_DELETE_'
     * }
     * ```
     * 
     * ARRAYS: It is important to include **ALL** array elements so the order is specified properly but the contents of array items being kept does **NOT**
     * need to be specified. For example, if the payload was:
     * ```typescript
     * {
     *   items: [
     *     { id: '1', value: 'keep' },
     *     { id: '2', value: 'this one goes away' }, 
     *     { id: '3', value: 'keep' }
     *   ]
     * }
     * ```
     * And the AI wanted to remove the second item, it would specify:
     * ```typescript
     * {
     *  items: [
     *   {},
     *   "_DELETE_",
     *   {}
     * }
     * ```
     * The above return value for the removeElements attribute would result in the following payload after processing
     * ```typescript
     * {
     *  items: [
     *     { id: '1', value: 'keep' },
     *     { id: '3', value: 'keep' }
     *  ]
     * }
     * ```
     * Important note: For token efficiency, the AI model should **NOT** emit array elements fully that it wants to **keep** 
     * but rather emit empty objects `{}` for those items. This indicates that the item should be kept as is since it is NOT
     * equal to a string literal of "_DELETE_".
     * 
     * 
     * NESTED OBJECTS:
     * ```typescript
     * {
     *   nestedObject: {
     *     itemToRemove: '_DELETE_'
     *   }
     * }
     * ```
     * 
     * In this case if there was a payload like this:
     * ```typescript        
     * {
     *   nestedObject: {
     *    itemToRemove: 'value',
     *    itemToKeep: 'value'
     *   },
     *   anotherItemToRemove: '_DELETE_',
     *   anotherItemToKeep: 12345  
     * }
     * ```
     * The result of the operation would be :
     * ```typescript
     * {
     *   nestedObject: {
     *     itemToKeep: 'value'
     *   },
     *   anotherItemToKeep: 12345
     * }
     */
    removeElements?: Partial<P>;

    /**
     * Brief description of the reasoning behind the changes requested.
     * This should be a concise explanation of why the changes are necessary, helping with debugging and transparency.
     * @optional
     */
    reasoning?: string;
}