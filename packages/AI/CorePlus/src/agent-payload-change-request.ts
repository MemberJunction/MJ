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
     * 
     * Example - update single item:
     *  {
     *     "itemToUpdate": "newValue"
     *  }
     * 
     *  To update multiple items:
     *  {
     *      itemToUpdate1: "newValue1",
     *      itemToUpdate2: "newValue2"
     *  }
     * 
     *  Arrays: Include placeholder objects `{}` for items that are being kept in the array.
     *  For example, if the payload was:
     *  {
     *      items: [
     *          {}, // placeholder object is ignored
     *          { someKey: 'this is a new value for someKey' },
     *          {} // placeholder object is ignored - since it is trailing, can be ommitted, this is for illustration
     *      ]
     *  }
     * 
     * DELETION WITHIN UPDATES:
     * You can use "__DELETE__" within updateElements to remove properties or array elements at any depth:
     * 
     * Deleting object properties:
     * {
     *   updateElements: {
     *     user: {
     *       name: "New Name",      // update this property
     *       tempData: "__DELETE__"   // remove this property
     *     }
     *   }
     * }
     * 
     * Deleting array elements:
     * {
     *   updateElements: {
     *     items: [
     *       {},          // keep item 0
     *       "__DELETE__",  // remove item 1
     *       { value: 5 }, // update item 2
     *       "__DELETE__"   // remove item 3
     *     ]
     *   }
     * }
     * 
     * Complex nested example - updating and deleting within deep structures:
     * {
     *   updateElements: {
     *     dataRequirements: {
     *       dynamicData: {
     *         requiredEntities: [
     *           {
     *             displayFields: ["Name", "UpdatedAt"], // update array
     *             fieldMetadata: [
     *               {},          // keep field 0
     *               {},          // keep field 1
     *               {},          // keep field 2
     *               "__DELETE__"   // remove field 3 (e.g., LastUpdated)
     *             ],
     *             oldProperty: "__DELETE__"  // remove this property
     *           }
     *         ]
     *       }
     *     }
     *   }
     * }
     * 
     * IMPORTANT: When using "__DELETE__" in arrays, deletions are processed after updates at each depth level,
     * ensuring correct index management. Multiple deletions in the same array are handled properly.
     * 
     * Alternative for complete replacement: If you need to completely replace a complex structure,
     * you can use removeElements + newElements pattern:
     * {
     *   removeElements: { complexObject: "__DELETE__" },
     *   newElements: { complexObject: { keyA: "valA", keyB: "valB" } }
     * }
     */
    updateElements?: Partial<P>;

    /**
     * This partial of P includes all elements that should be removed from the payload. When an
     * item needs to be removed, include the item here with a value of "__DELETE__".
     * 
     * For 1 removal:
     * {
     *   itemToRemove: '__DELETE__'
     * }
     * 
     * This indicates that the itemToRemove should be removed from the payload.
     * 
     * For multiple removals:
     * {
     *   itemToRemove1: '__DELETE__',
     *   itemToRemove2: '__DELETE__'
     * }
     * 
     * Arrays: Include placeholder objects `{}` for items that are being kept in the array.
     * For updating object elements in arrays, only include the properties to change:
     * 
     * Original array:
     * {
     *   items: [
     *     { id: 1, name: "Item 1", value: 100 },
     *     { id: 2, name: "Item 2", value: 200 },
     *     { id: 3, name: "Item 3", value: 300 }
     *   ]
     * }
     * 
     * To update only the value of the second item:
     * {
     *   items: [
     *     {}, // placeholder - keeps item 1 unchanged
     *     { value: 250 }, // updates ONLY the value property of item 2
     *     {} // placeholder - keeps item 3 unchanged (can be omitted if trailing)
     *   ]
     * }
     * 
     * Result after merge:
     * {
     *   items: [
     *     { id: 1, name: "Item 1", value: 100 },
     *     { id: 2, name: "Item 2", value: 250 }, // only value changed
     *     { id: 3, name: "Item 3", value: 300 }
     *   ]
     * }
     * 
     * NOTE: For token efficiency, do **NOT** emit array elements that are being **kept** 
     * instead emit empty objects `{}` for items being kept.  
     * 
     * NESTED OBJECTS:
     * {
     *   nestedObject: {
     *     itemToRemove: '__DELETE__'
     *   }
     * }
     * 
     * In this case if there was a payload like this:
     * {
     *   nestedObject: {
     *    itemToRemove: 'value',
     *    itemToKeep: 'value'
     *   },
     *   anotherItemToRemove: '__DELETE__',
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