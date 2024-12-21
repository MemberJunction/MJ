# Entity Vectorizer Overview

The Entity Vectorizer is a robust software tool designed for transforming entities into vector representations and storing them in a vector database. Built upon the powerful [MemberJunction framework](https://docs.memberjunction.org/), the Entity Vectorizer ensures efficient handling and processing of large batches of data. This overview provides insights into its core functionalities, architecture, and usage.

# Prerequisites

Before you can vectorize an entity, ensure the following setup is complete:  

1. **SQL Database with Memberjunction Framework**  
   A SQL database must be configured with the Memberjunction framework installed. This serves as the foundation for managing entity records and templates needed for the vectorization process.

2. **API Key for the Embedding Model**  
   Obtain an API key for the embedding model of your choice. Memberjunction supports a variety of popular embedding models, such as OpenAI and Mistral. This key is necessary for accessing the model during the vectorization process.

3. **API Key for the Vector Database**  
   Acquire an API key for the vector database you plan to use. Currently, Memberjunction supports Pinecone as the vector storage solution, which integrates seamlessly with this package.

4. **Entity Document Record and Template**  
   Ensure you have an Entity document record defined, along with an associated template. The template specifies the properties of the entity that will be included in the vectorization process, guiding the transformation of data into its vector representation.

## Process Overview

The Entity Vectorizer operates via a systematic process to ensure efficient vectorization and storage of entity data. Below is a detailed breakdown of each step involved:

1. **Entity Document Retrieval**:
   - The process begins by taking an **Entity Document ID** as input.
   - Using this ID, the system retrieves the corresponding **Entity Document record**. This record contains essential information and metadata about the entity, which is crucial for the subsequent steps.

2. **Model and Database Configuration**:
   - Once the Entity Document record is obtained, the system identifies the appropriate **embedding model**. This model is critical as it determines how the entity data will be transformed into vector representations.
   - Additionally, the system fetches details regarding the **vector database** where the resulting vectors will be stored. This includes information about the specific database or configuration settings necessary for data insertion.

3. **Data Fetching and Vectorization**:
   - With the embedding model and database information in place, the system fetches all records under the specified **Entity**. If a **list ID** is provided, it fetches all records associated with that list.
   - The retrieved records are then vectorized using the selected embedding model. This step involves transforming each record into a high-dimensional vector, which captures the nuances and characteristics of the data.

4. **Vector Upsertion**:
   - The vectorized data is then **upserted** into the vector database.

5. **EntityRecordDocument Creation**:
   - For each vector upserted, a corresponding **EntityRecordDocument record** is generated. This record serves as a link between the vector stored in the database and the original record in MemberJunction.
   - The EntityRecordDocument ensures traceability and provides a means to reference back to the original data, enabling users to maintain a clear mapping between vectors and their source records.
   - 
# How to Vectorize Records

Follow these steps to use the package:

1. **Add the Package**  
   Add the `Entity Vectorizer` package to your existing project. Alternatively, you can use the `test-vectorization` package available in the Memberjunction repository:  
   [Memberjunction Test Vectorization](https://github.com/MemberJunction/MJ/tree/next/test-vectorization)

2. **Include Embedding Model and Vector Database Packages**  
   Ensure that the packages for the embedding model and vector database you plan to use are added to your existing project. These packages must not be tree-shaken out during the build process, as they are required for vectorization to work properly.

3. **Instantiate the `EntityVectorSyncer` Class**  
   Create an instance of the `EntityVectorSyncer` class and call its `config` method. This ensures all necessary engines (e.g., embedding and vector databases) are set up properly.

4. **Call the `VectorizeEntity` Function**  
   Use the `VectorizeEntity` function, passing in the required parameters. At a minimum, you must provide:  

   - **`EntityID`**: The name of the entity you want to vectorize.  
   - **`EntityDocumentID`**: The ID of the Entity Document to use.  
   - **`listBatchCount`** *(optional but recommended)*: Determines the size of the batch of records to fetch from the database at a time.  
   - **`listID`** *(optional but recommended)*: If specified, only the records within this list will be vectorized. If omitted, all records within the specified entity will be vectorized.
   - 
5. **Note on Long Running Processes**  
   The process of vectorizing records may take a significant amount of time (1+ hour(s)) depending on the size of the dataset and the performance of the configured systems. Although the `VectorizeEntity` function returns a promise, it is often best not to `await` it. Instead, let it run in the background to avoid blocking your application’s main workflow.

