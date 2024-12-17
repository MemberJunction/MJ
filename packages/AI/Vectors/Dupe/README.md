# AI Vector Dupe Documentation

**AI Vector Dupe** is a package designed to identify duplicate records in a database by generating vector representations and finding similar vectors. Users can then take actions, such as merging or deleting the detected duplicates.

---

## Prerequisites

Before using the package, ensure the following requirements are met:

1. **SQL Server with MemberJunction Framework**  
   [MemberJunction Documentation](https://docs.memberjunction.org/#/)

2. **Embedding Model API Key**  
   Supported embedding models include OpenAI, Mistral, and others supported by MemberJunction.

3. **Vector Database API Key**  
   Currently, only **Pinecone** is supported for vector storage.

---

## How to Run the Package

Follow these steps to use the **AI Vector Dupe** package:

1. **Load Required Packages**  
   Ensure this package, along with your embedding and vector database packages, is loaded into your application. Verify they are not tree-shaken out.

2. **Prepare Records**  
   Create a list of records to search for duplicates.  
   **Note:** Currently, this package supports finding duplicates **within the same entity**. Support for cross-entity duplicate checks is planned for future updates.

3. **Call the `getDuplicateRecords` Function**  
   Create an instance of the `DuplicateRecordDetector` class and call the `getDuplicateRecords` function with the following parameters:

   | Parameter          | Type           | Description                                                                 |
   |--------------------|----------------|-----------------------------------------------------------------------------|
   | `listID`           | `string`       | The ID of the list containing the records to analyze.                       |
   | `entityID`         | `string`       | The ID of the entity the records belong to.                                 |
   | `probabilityScore` | `number` (optional) | The minimum similarity score to consider a record as a potential duplicate. |

   **Return:** A `Promise` that resolves after processing. For large datasets, it is recommended **not to `await`** the result.

---

## Workflow: `getDuplicateRecords` Function

The `getDuplicateRecords` function performs the following steps:

1. **Fetch Records**  
   Fetches the list by `listID` and retrieves all records contained within it.

2. **Generate or Fetch Vectors**  
   - If configured, generates new vectors for all records associated with the specified `entityID` and upserts them into the vector database.  
   - If not configured to upsert new vectors, it queries the vector database to fetch existing vectors for the records.

3. **Search for Similar Vectors**  
   For each vector, queries the vector database to find **n** similar vectors (where **n** is user-specified).

4. **Fetch Related Records**  
   Fetches database records corresponding to the similar vectors retrieved.

5. **Merge Duplicates (Optional)**  
   If configured, merges records marked as duplicates into the source record based on a **similarity probability threshold**.  
   - Example: If the similarity score exceeds `0.95`, the record is merged.

6. **Track Results**  
   Records are created in the database to log:  
   - The duplicate record search run.  
   - Which records were analyzed.  
   - Which records were marked as potential duplicates.

---

## Example Usage

Here is an example of how to use the package:

```javascript
const { DuplicateRecordDetector } = require('ai-vector-dupe');

// Create an instance of the DuplicateRecordDetector
const detector = new DuplicateRecordDetector();

// Call getDuplicateRecords
detector.getDuplicateRecords({
  listID: 'example-list-id',
  entityID: 'example-entity-id',
  probabilityScore: 0.9
});
