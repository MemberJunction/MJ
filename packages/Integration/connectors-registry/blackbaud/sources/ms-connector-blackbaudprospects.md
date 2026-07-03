Source: https://learn.microsoft.com/en-us/connectors/blackbaudprospects/
Fetched via WebFetch (full page, JS-rendered Microsoft docs)
Connector: "Blackbaud Raisers Edge NXT Prospects" (Prospect/Opportunity API family - RENXT, NOT Blackbaud CRM)

## Actions
| Operation ID | Description |
|---|---|
| CreateConstituentRating | Creates a new constituent rating |
| CreateOpportunity | Creates a new opportunity |
| CreateOpportunityAttachment | Creates a new opportunity attachment |
| CreateOpportunityCustomField | Creates a new opportunity custom field |
| GetOpportunity | Returns information about an opportunity |
| GetConstituentProspectStatus | Returns the current prospect status for a constituent |
| ListConstituentRatings | Returns the list of ratings for a constituent |
| ListOpportunities | Returns a list of opportunities |
| ListOpportunityAttachments | Lists the attachments for an opportunity |
| ListOpportunityCustomFields | Lists the custom fields for an opportunity |
| EditOpportunity | Updates an opportunity |
| EditOpportunityAttachment | Updates an opportunity attachment |
| EditOpportunityCustomField | Updates an opportunity custom field |

## Definitions

### OpportunityApi.OpportunityRead (Opportunity)
ID, Constituent ID, Purpose, Name (255 char limit), Status, Deadline, Ask date, ask_amount.value,
Expected date, expected_amount.value, Funded date, funded_amount.value, Campaign ID, Fund ID,
Fundraiser(s) (array of OpportunityApi.Fundraiser), Inactive?, linked_gifts (array of string),
Date added, Date modified

### OpportunityApi.Fundraiser
Constituent ID, credit_amount.value

### OpportunityApi.OpportunityAttachmentRead
ID, Opportunity ID (parent_id), Type, Name, Date, URL, File name, File ID, Thumbnail ID,
Thumbnail URL, Content type, File size, Tags[]

### OpportunityApi.OpportunityCustomFieldRead
ID, Opportunity ID (parent_id), Category, Type, Value, Text value, Number value, Date value,
Currency value, Boolean value, Table entry value, Constituent ID value, fuzzydate_value (d/m/y),
Date, Comment, Date added, Date modified

### ConstituentApi.RatingRead
ID, Constituent ID, Source, Category, Date, Description/value, Comments, Inactive?, Type (computed)

### ConstituentApi.ProspectStatusRead
Status, Days elapsed, Start date, Comments

Throttling: API calls per connection: 100/60s
