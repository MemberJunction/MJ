/**
 * Defines a structured way to request changes to the payload
 */
export type AgentPayloadChangeRequest<P = any> = {
    /**
     * A partial of P that includes all new elements added that were **not** previously present in
     * the payload prior to the prompt execution. This allows the AI to specify the new elements
     * to be added clearly here. The structure is identical to the payload type P with just the
     * portions filled out that need to be added.
     * 
     * To add a new item:
     * 
     * {    
     *   "newItem": "newValue"
     * }
     * To add multiple new items:
     * 
     * {
     *   newItem1: "newValue1",
     *   newItem2: "newValue2"
     * }
     */
    newElements?: Partial<P>;

    /**
     * A partial of P that includes all elements that should be updated in the payload.
     * The structure is identical to the payload type P with just the portions filled out
     * that need to be updated. **DO NOT INCLUDE ELEMENTS THAT ARE NOT CHANGING**.
     */
    updateElements?: Partial<P>;

    /**
     * This partial of P includes all elements that should be removed from the payload. When an
     * item needs to be removed, include the item here with a value of "_DELETE_".
     * 
     * For 1 removal:
     * {
     *   itemToRemove: '_DELETE_'
     * }
     * 
     * This indicates that the itemToRemove should be removed from the payload.
     * 
     * For multiple removals:
     * {
     *   itemToRemove1: '_DELETE_',
     *   itemToRemove2: '_DELETE_'
     * }
     * 
     * ARRAYS: It is important to include **ALL** array elements so the order is specified properly but the contents of array items being kept does **NOT**
     * need to be specified. For example, if the payload was:
     * {
     *   items: [
     *     { id: '1', value: 'keep' },
     *     { id: '2', value: 'this one goes away' }, 
     *     { id: '3', value: 'keep' }
     *   ]
     * }
     * 
     * To remove the 2nd item:
     * {
     *  items: [
     *   {},
     *   "_DELETE_",
     *   {}
     * }
     * 
     * NOTE: For token efficiency, do **NOT** emit array elements that are being **kept** 
     * instead emit empty objects `{}` for items being kept.  
     * 
     * NESTED OBJECTS:
     * {
     *   nestedObject: {
     *     itemToRemove: '_DELETE_'
     *   }
     * }
     * 
     * In this case if there was a payload like this:
     * {
     *   nestedObject: {
     *    itemToRemove: 'value',
     *    itemToKeep: 'value'
     *   },
     *   anotherItemToRemove: '_DELETE_',
     *   anotherItemToKeep: 12345  
     * }
     *
     * The result of the operation would be :
     * {
     *   nestedObject: {
     *     itemToKeep: 'value'
     *   },
     *   anotherItemToKeep: 12345
     * }
     */
    removeElements?: Partial<P>;

    /**
     * Description of the reasoning behind the changes requested.
     */
    reasoning?: string;
}