# @memberjunction/core

The `@memberjunction/core` library provides a comprehensive interface for accessing and managing metadata within MemberJunction, along with facilities for working with entities, applications, and various other aspects central to the MemberJunction ecosystem. This library primarily exports a `Metadata` class which acts as the gateway to many functionalities.

## Installation

```bash
npm install @memberjunction/core

```markdown
## Usage

### Importing the Library

```javascript
import { Metadata } from '@memberjunction/core';
```

### Working with the Metadata Class

The `Metadata` class is a crucial part of this library, providing access to a wide array of metadata, instantiating derived classes of `BaseEntity` for record access and manipulation, and more.

#### Instantiating the Metadata Class

```javascript
const md = new Metadata();
```

#### Refreshing Cached Metadata

```javascript
await md.Refresh();
```

#### Getting Applications, Entities, and Other Info

```javascript
const applications = md.Applications;
const entities = md.Entities;
const currentUser = md.CurrentUser;
// ... and so on for other properties
```

#### Helper Functions

```javascript
// Get Entity ID from name
const entityId = md.EntityIDFromName('EntityName');

// Get Entity name from ID
const entityName = md.EntityNameFromID(1);

// ... and other helper functions as defined in the class
```

#### Working with Datasets

```javascript
// Example: Getting a dataset by name
const dataset = await md.GetDatasetByName('DatasetName');
```

This is a brief overview of how to interact with the `Metadata` class. The methods and properties provided by the `Metadata` class serve as a bridge to access and manage data in a structured and coherent manner within the MemberJunction ecosystem.

## RunView and RunViewParams

The `@memberjunction/core` library also provides a mechanism for running either a stored or dynamic view through the `RunView` class. The parameters for running these views are specified through the `RunViewParams` type.

### Importing Necessary Classes and Types

```javascript
import { RunView, RunViewParams } from '@memberjunction/core';
```

### Using RunViewParams

`RunViewParams` is a type that helps in specifying the parameters required to run a view. The fields in `RunViewParams` allow you to specify whether you want to run a stored or dynamic view, and provide additional filters, sorting, and other options. Here's an example of how you might create a `RunViewParams` object:

```javascript
const params: RunViewParams = {
    ViewName: 'MyView',
    ExtraFilter: 'Age > 25',
    OrderBy: 'LastName ASC',
    Fields: ['FirstName', 'LastName'],
    UserSearchString: 'Smith'
    // ... other optional properties as needed
};
```

### Using the RunView Class

The `RunView` class provides a method to run a view based on the provided parameters. 

#### Instantiating the RunView Class

```javascript
const rv = new RunView();
```

#### Running a View

```javascript
const result = await rv.RunView(params);
```

In this example, `params` is an object of type `RunViewParams` which contains the information necessary to run the view. The `RunView` method will return a `Promise<RunViewResult>` which will contain the result of running the view.

