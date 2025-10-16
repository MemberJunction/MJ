/**
 * Defines a structured way to request changes to the payload. If you are making a COMPLEX change to an object
 * you can either use `updateElements` as described below to make **surgical** changes to the payload, OR, a simple
 * approach is to use `replaceElements` to remove the entire object and replace it with a new object.
 * 
 * If you are providing the ENTIRE object again, use the **replaceElements** instead of **updateElements** approach like this:
 * {
 *   replaceElements: {
 *     user: { // user object will REPLACE the entire existing object
 *       id: "new-id",
 *       name: "new-name"
 *       moreComplexData: {
 *         keyA: "valA",
 *         keyB: "valB"
 *       }
 *     }
 *   }
 * }
 * 
 * Alternatively, to make surgical changes review the documentation below for @see updateElements where you can make
 * small incremental additions/updates/removals to the payload which is more token efficient and cleaner.
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
     * you can use replaceElements pattern INSTEAD of updateElements:
     * {
     *   replaceElements: { complexObject: { keyA: "valA", keyB: "valB" } } // This replaces the entire complexObject
     * }
     */
    updateElements?: Partial<P>;

    /**
     * This partial of P includes all elements that should be replaced in the payload.
     * The structure is identical to the payload type P with just the portions filled out
     * that need to be replaced. This is useful when you want to replace an entire object
     * or array with a new version. See @see updateElements for surgical updates instead of doing
     * complete replacements.
     */
    replaceElements?: Partial<P>;

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


/**
 * Used for enumerating a list of possible responses to show a user
 */
export type BaseAgentSuggestedResponse = {
    /**
     * Text of the response to show the user in the UI
     */
    text: string;

    /**
     * If set to true, this option will show default text from the text property but allow the user to edit it. With this option set to true you
     * can also leave the text property blank and just allow the user to enter their own text.
     */
    allowInput?: boolean;

    /**
     * Optional, CSS class to apply to the response icon, for example a font-awesome class
     * to visually indicate the type of response (info, warning, error, success, other).
     */
    iconClass?: string;

    /**
     * Optional, a value associated with the response that will be sent back to the the next request along with
     * the text. This can be used to represent a choice or selection made by the user with a more structured
     * value.
     */
    value?: string;
}