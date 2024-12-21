# Recommendation-Rex Documentation

## Overview

**Recommendation-Rex** is designed to integrate with the Memberjunction framework and leverage the **Rasa.io Rex recommendation service**. Rex allows you to deliver personalized and tailored content based on individual characteristics, preferences, and interests. This package facilitates seamless usage of Rex through Memberjunction's Recommendation Engine.

## Prerequisites

To use Recommendation-Rex, ensure the following are in place:

1. **Rasa Rex Engine Account**: A valid account and API key.
2. **SQL Server**: Memberjunction framework installed and configured.
3. **Vector Database**: Setup with all relevant records vectorized and stored.
4. **Rasa Rex Engine Configuration**: Linked to your vector database.

---

## How It Works

Recommendation-Rex operates as part of Memberjunction's Recommendation Engine. Below is a step-by-step guide:

### 1. **Integration via Memberjunction**
The package should not used directly. Instead, integrate it through the **Memberjunction Recommendation Engine**:  
[Memberjunction Recommendations Engine](https://github.com/MemberJunction/MJ/tree/next/packages/AI/Recommendations/Engine)

### 2. **Prepare Your Data**
Create a list in the database containing the records you want to generate recommendations for. The recommendation engine also supports directly fedding it the entitiy records you want recommendations for.

### 3. **Invoke the Recommend Function**
Use the Recommendation Engine's `Recommend` function and pass in:
- **List ID**: The ID of the database list you created.
- **Options Parameter**: Specify additional settings, such as:
  - Entities to generate recommendations for.
  - The desired number of recommendations.

### 4. **Recommendation Process**
The engine triggers a recommendation run:
1. Identifies the vector associated with the source record.
2. Performs a **similarity search** within the vector database to find similar vectors.
3. Rex returns a list of similar vectors, which the engine converts back into database records.

### 5. **Storing and Using Recommendations**
The recommended items are stored in the database as new records.  
The developer or user retrieves and processes these records for use in their application.

### 6. **Error Handling**
If errors occur during the recommendation run, they are logged in a dedicated database list for troubleshooting. This ensures all issues are documented for review.

---

## Additional Notes

- **Flexibility**: Recommendation-Rex is designed for scalability and works with complex datasets.
- **Responsibility**: While the recommendation engine handles the recommendation logic, it's up to the user to fetch and utilize the final recommended records.

For more details on configuring and using Memberjunction's Recommendation Engine, visit the [documentation](https://docs.memberjunction.org/).
