Source: https://learn.microsoft.com/en-us/connectors/blackbaudraisersedge/
Fetched via WebFetch (JS-rendered content unavailable to curl; retrieved through search-indexed render)
Connector: "Blackbaud Raisers Edge NXT" (Constituent API family)

## Complete Actions List

### Constituent Management
| Operation ID | Description |
|---|---|
| CreateIndividualConstituent | Creates a new individual constituent |
| CreateOrganizationConstituent | Creates a new organization constituent |
| GetConstituent | Returns information about a constituent |
| ListConstituents | Returns a list of constituents |
| UpdateConstituent | Updates a constituent |
| SearchConstituent | Performs a constituent search based on provided search text |
| GetConstituentProfilePicture | Returns the current profile picture for a constituent |
| UpdateConstituentProfilePicture | Updates the current profile picture for a constituent |

### Constituent Addresses
| Operation ID | Description |
|---|---|
| CreateConstituentAddress | Creates a new constituent address |
| ListConstituentAddresses | Lists the addresses for a constituent |
| UpdateConstituentAddress | Updates a constituent address |

### Constituent Phones
| Operation ID | Description |
|---|---|
| CreateConstituentPhone | Creates a new constituent phone |
| ListConstituentPhones | Lists the phones for a constituent |
| UpdateConstituentPhone | Updates a constituent phone |

### Constituent Emails
| Operation ID | Description |
|---|---|
| CreateConstituentEmailAddress | Creates a new constituent email address |
| ListConstituentEmailAddresses | Lists the email addresses for a constituent |
| UpdateConstituentEmailAddress | Updates a constituent email address |

### Constituent Notes
| Operation ID | Description |
|---|---|
| CreateConstituentNote | Creates a new constituent note |
| ListConstituentNotes | Lists the notes for a constituent |
| UpdateConstituentNote | Updates a constituent note |

### Other Constituent Details
| Operation ID | Description |
|---|---|
| CreateConstituentAlias | Creates a new constituent alias |
| ListConstituentAliases | Lists the aliases for a constituent |
| UpdateConstituentAlias | Updates a constituent alias |
| CreateConstituentCode | Creates a new constituent code |
| ListConstituentCodes | Lists the constituent codes for a constituent |
| UpdateConstituentCode | Updates a constituent code |
| DeleteConstituentCode | Deletes a constituent code |
| CreateConstituentOnlinePresence | Creates a new constituent online presence |
| ListConstituentOnlinePresences | Lists the online presences for a constituent |
| UpdateConstituentOnlinePresence | Updates a constituent online presence |
| CreateConstituentEducation | Creates a new constituent education |
| ListConstituentEducations | Lists the education records for a constituent |
| UpdateConstituentEducation | Updates a constituent education |
| CreateConstituentRating | Creates a new constituent rating |
| ListConstituentRatings | Returns the list of ratings for a constituent |

### Constituent Relationships
| Operation ID | Description |
|---|---|
| CreateIndividualRelationship | Creates a new individual relationship |
| CreateOrganizationRelationship | Creates a new organization relationship |
| ListConstituentRelationships | Lists the relationships for a constituent |
| UpdateIndividualRelationship | Updates an individual relationship |
| UpdateOrganizationRelationship | Updates an organization relationship |

### Constituent Attachments & Custom Fields
| Operation ID | Description |
|---|---|
| CreateConstituentAttachment | Creates a new constituent attachment |
| ListConstituentAttachments | Lists the attachments for a constituent |
| UpdateConstituentAttachment | Updates a constituent attachment |
| CreateConstituentCustomField | Creates a new constituent custom field |
| ListConstituentCustomFields | Lists the custom fields for a constituent |
| UpdateConstituentCustomField | Updates a constituent custom field |

### Constituent Giving & Status
| Operation ID | Description |
|---|---|
| GetConstituentFirstGift | Returns the first gift for a constituent |
| GetConstituentLatestGift | Returns the latest gift for a constituent |
| GetConstituentGreatestGift | Returns the greatest gift for a constituent |
| GetConstituentLifetimeGiving | Returns the lifetime giving summary for a constituent |
| GetConstituentProspectStatus | Returns the current prospect status for a constituent |

### Constituent Preferences & Consent
| Operation ID | Description |
|---|---|
| CreateConstituentConsent | Creates a new constituent consent record |
| ListConstituentConsents | Lists the consent records for a constituent |
| CreateConstituentSolicitCode | Creates a new constituent solicit code |
| ListConstituentSolicitCodes | Lists the solicit codes for a constituent |
| UpdateConstituentSolicitCode | Updates a constituent solicit code |

### Constituent Actions
| Operation ID | Description |
|---|---|
| CreateAction | Creates a new constituent action |
| GetAction | Returns information about a constituent action |
| ListActions | Returns a list of actions |
| ListConstituentActions | Lists the actions for a constituent |
| UpdateAction | Updates a constituent action |
| CreateActionAttachment | Creates a new action attachment |
| ListActionAttachments | Lists the attachments for an action |
| UpdateActionAttachment | Updates an action attachment |
| CreateActionCustomField | Creates a new action custom field |
| ListActionCustomFields | Lists the custom fields for an action |
| UpdateActionCustomField | Updates an action custom field |

### Fundraiser Assignments
| Operation ID | Description |
|---|---|
| CreateFundraiserAssignment | Creates a new fundraiser assignment |
| ListConstituentFundraiserAssignments | Lists the fundraiser assignments for a constituent |
| ListFundraiserAssignments | List the assignments for a fundraiser |

## Field Schemas (per entity - abbreviated from full fetch)

### Individual Constituent
Title, First name, Last name*, Suffix, Lookup ID, Preferred name, Middle name, Former name,
Title 2, Suffix 2, Gender, Marital status, Gives anonymously?, Birth date (fuzzy d/m/y),
Birthplace, Ethnicity, Income, Religion, Custom addressee?, Addressee format, Addressee custom name,
Custom salutation?, Salutation format, Salutation custom name

### Organization Constituent
Name*, Lookup ID, Gives anonymously?, Industry, Number of employees, Matches gifts?,
Matching gift factor, Min/Max match per gift, Min/Max match per constituent, Matching gift notes

### Constituent Address (IOF: ConstituentAddress)
Address type*, Country, Address lines, City, State, Postal code, Suburb, County,
Information source, Region, CART, LOT, DPC, Valid from, Valid to, Primary?, Do not mail?

### Constituent Phone (IOF: ConstituentPhone)
Type*, Number*, Primary?, Do not call?, Inactive?

### Constituent Email (IOF: ConstituentEmailAddress)
Email type*, Email address*, Primary?, Do not email?, Inactive?

### Constituent Note (IOF: ConstituentNote)
Type*, Date (fuzzy d/m/y), Summary, Note

### Constituent Online Presence
Type*, Link*, Primary?, Inactive?

### Constituent Education
School*, Type, Class of, Status, Start date, End date, Degree, GPA, Subject of study,
Primary?, Majors[], Minors[], Campus, Social organization, Known name, Class of degree,
Department, Faculty, Registration number

### Constituent Rating
body (dynamic) - represents rating to create; Read model: ID, Constituent ID, Source, Category,
Date, Description/value, Comments, Inactive?, Type (computed)

### Constituent Code
Constituent code*, Start date, End date, Sequence

### Constituent Relationship
Constituent ID*, Relation ID*, Type, Reciprocal type, Start date, End date, Notes,
Is spouse?, Is constituent head of household? (individual), Is spouse head of household? (individual),
Is contact? (org), Contact type (org), Position (org), Is primary business? (org)

### Action (constituent action / interaction)
Constituent ID*, Category*, Completed?, Completed on, Date*, Note, Direction, Fundraiser(s)[],
Location, Opportunity ID, Outcome, Priority, Start time, End time, Status, Summary, Type

### Attachment (generic - used by Constituent/Action/Gift/Opportunity/Campaign/Fund/Appeal)
Type* (Physical|Link), Name, Date, URL, File name, File ID, Thumbnail ID, Tags[]

## Throttling
API calls per connection: 500 / 60 seconds
