---
layout: Reference
title: Blackbaud RENXT Gifts - Connectors | Microsoft Learn
canonicalUrl: https://learn.microsoft.com/en-us/connectors/blackbaudgifts/
ms.subservice: connectors
author: miriver
ms.author: miriver
ms.manager: jwarner
ms.service: power-platform
ms.date: 2024-03-01T00:00:00.0000000Z
breadcrumb_path: /connectors/breadcrumb/toc.json
uhfHeaderId: MSDocsHeader-PowerPlatform
feedback_system: None
ms.topic: generated-reference
locale: en-us
document_id: 7de5582d-13f0-348c-47ef-868983b69675
document_version_independent_id: 7de5582d-13f0-348c-47ef-868983b69675
updated_at: 2025-11-14T01:00:00.0000000Z
original_content_git_url: https://github.com/MicrosoftDocs/BusinessApplicationPlatform-Connectors/blob/live/docs/blackbaudgifts/index.yml
gitcommit: https://github.com/MicrosoftDocs/BusinessApplicationPlatform-Connectors/blob/48a9375046661d90e1473a500afeee4dff58d05f/docs/blackbaudgifts/index.yml
git_commit_id: 48a9375046661d90e1473a500afeee4dff58d05f
site_name: Docs
depot_name: MSDN.businessplatform-connectors
page_type: powerconnector
toc_rel: ../toc.json
feedback_product_url: ''
feedback_help_link_type: ''
feedback_help_link_url: ''
asset_id: blackbaudgifts/index
moniker_range_name: 
monikers: []
item_type: Content
source_path: docs/blackbaudgifts/index.yml
cmProducts:
- https://authoring-docs-microsoft.poolparty.biz/devrel/86a4b315-a9f1-4577-b985-6fb0e0e67420
spProducts:
- https://authoring-docs-microsoft.poolparty.biz/devrel/96ac410d-d052-4707-8007-df31dd0fe041
platformId: de0744e5-0db3-cd99-bc45-c56d2e028669
---

# Blackbaud RENXT Gifts

![](https://conn-afd-prod-endpoint-bmc9bqahasf3grgk.b01.azurefd.net/releases/v1.0.1780/1.0.1780.4444/BlackbaudGifts/icon.png)
Blackbaud Raiser's Edge NXT is a comprehensive cloud-based fundraising and donor management software solution built specifically for nonprofits and the entire social good community. Use the Gifts connector to manage gifts.

This connector is available in the following products and regions:

| Service | Class | Regions |
| --- | --- | --- |
| **Copilot Studio** | Premium | All [Power Automate regions](/en-us/flow/regions-overview) except the following:  - US Government (GCC)  - US Government (GCC High)  - China Cloud operated by 21Vianet  - US Department of Defense (DoD) |
| **Logic Apps** | Standard | All [Logic Apps regions](https://azure.microsoft.com/global-infrastructure/services/?products=logic-apps&amp;regions=all) except the following:  - Azure Government regions  - Azure China regions  - US Department of Defense (DoD) |
| **Power Apps** | Premium | All [Power Apps regions](/en-us/powerapps/administrator/regions-overview#what-regions-are-available) except the following:  - US Government (GCC)  - US Government (GCC High)  - China Cloud operated by 21Vianet  - US Department of Defense (DoD) |
| **Power Automate** | Premium | All [Power Automate regions](/en-us/flow/regions-overview) except the following:  - US Government (GCC)  - US Government (GCC High)  - China Cloud operated by 21Vianet  - US Department of Defense (DoD) |

| Contact | - |
| --- | --- |
| Name | Blackbaud Support |
| URL | https://www.blackbaud.com/support |
| Email | skyapi@blackbaud.com |

| Connector Metadata | - |
| --- | --- |
| Publisher | Blackbaud, Inc. |
| Website | https://www.blackbaud.com/products/blackbaud-raisers-edge-nxt |
| Privacy policy | https://www.blackbaud.com/privacy-shield |
| Categories | Sales and CRM;Productivity |

[Raiser's Edge NXT](https://www.blackbaud.com/products/blackbaud-raisers-edge-nxt) is a comprehensive cloud-based fundraising and donor management software solution built specifically for nonprofits and the entire social good community.

This connector is built on top of Blackbaud's [SKY API](https://developer.blackbaud.com/skyapi), and provides operations to help manage gifts and related entities found within The Raiser's Edge NXT, including:

- Gifts and constituent giving summaries
- Gift batches
- Receipts
- Acknowledgements
- and more...

For more information, please view the [documentation](https://docs.blackbaud.com/microsoft-connectors-docs/microsoft-power-platform).

## Prerequisites

To use this connector, you must have a [Blackbaud ID](https://signin.blackbaud.com) account with access to one or more Blackbaud environments.

In addition, your organization's administrator must also perform an admin-level action within the system to enable this connector to access your Blackbaud environment. More information about these prerequisites can be found in the [initial setup](https://docs.blackbaud.com/microsoft-connectors-docs/microsoft-power-platform/initial-setup-tutorial) documentation.

## How to get credentials?

Your organization's administrator will send you an invitation to the organization's Raiser's Edge NXT environment and configure your user account permissions within the environment. No additional credentials are required to use this connector.

## Known issues and limitations

The connector will operate in the context of your user account, and will therefore be subject to your user permissions within the environment.

## Throttling Limits

| Name | Calls | Renewal Period |
| --- | --- | --- |
| API calls per connection | 100 | 60 seconds |

## Actions

| Add a gift to batch | Add a gift to the specified gift batch. |
| --- | --- |
| Create a constituent tax declaration | Creates a new Gift Aid tax declaration for a constituent. |
| Create a gift | Creates a new gift. |
| Create a gift attachment | Creates a new gift attachment. |
| Create a gift batch | Creates a new gift batch. |
| Create a gift custom field | Creates a new gift custom field. |
| Create a gift note | Creates a new gift note. |
| Create a gift tribute | Creates a new gift tribute. |
| Create a pledge | Creates a new pledge. |
| Create a pledge payment | Creates a new pledge payment. |
| Create a stock gift | Creates a new stock gift. |
| Get a gift | Returns information about a gift. |
| Get a gift by lookup ID | Returns a gift's system record ID from the specified lookup ID. |
| Get constituent first gift | Returns the first gift for a constituent. |
| Get constituent greatest gift | Returns the greatest gift for a constituent. |
| Get constituent latest gift | Returns the latest gift for a constituent. |
| Get constituent lifetime giving | Returns the lifetime giving summary for a constituent. |
| List constituent tax declarations | Lists the Gift Aid tax declarations for a constituent (only applicable for UK versions). |
| List gift attachments | Lists the attachments for a gift. |
| List gift batches | List the gift batches. |
| List gift custom fields | Lists the custom fields for a gift. |
| List gift notes | Lists the notes for a gift. |
| List gift tribute acknowledgees | List the acknowledgees for a gift tribute. |
| List gift tributes | Lists the tributes for a gift. |
| List gifts | Returns a list of gifts. |
| List pledge installments | Lists the installments for a pledge. |
| List pledge payments | Lists the payments for a pledge. |
| Sell a stock gift | Updates a stock gift to sold. |
| Update a constituent tax declaration | Updates a constituent tax declaration. |
| Update a gift attachment | Updates a gift attachment. |
| Update a gift custom field | Updates a gift custom field. |
| Update a gift note | Updates a gift note. |
| Update a gift tribute | Updates a gift tribute. |
| Update a gift tribute acknowledgee | Updates a gift tribute acknowledgee. |
| Update gift acknowledgement details | Updates the acknowledgement details for a gift. |
| Update gift receipt details | Updates the receipt details for a gift. |

### Add a gift to batch

- Operation ID:
    - AddGiftToBatch

Add a gift to the specified gift batch.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Batch | batch\_id | True | string | The batch to which the gift will be added. |
| Constituent ID | constituent\_id | True | string | The system record ID of the constituent associated with the gift. |
| Amount | value | True | double | The amount of the gift. |
| Date | date | True | date | The gift date (ex: '2020-09-18'). |
| Type | type | True | string | The gift type. |
| campaign ID | campaign\_id |  | string | The system record ID of the campaign associated with the gift split. |
| fund ID | fund\_id | True | string | The system record ID of the fund associated with the gift split. |
| appeal ID | appeal\_id |  | string | The system record ID of the appeal associated with the gift split. |
| package ID | package\_id |  | string | The system record ID of the package associated with the gift split. |
| amount | value | True | double | The amount of the gift split. |
| Payment method | payment\_method | True | string | The payment method. |
| Check number | check\_number |  | string | The check number (only applicable when payment method is "PersonalCheck"). |
| day | d |  | integer | The day in the fuzzy date. |
| month | m |  | integer | The month in the fuzzy date. |
| year | y |  | integer | The year in the fuzzy date. |
| Reference | reference |  | string | The payment reference (only applicable when payment method is "Other"). |
| day | d |  | integer | The day in the fuzzy date. |
| month | m |  | integer | The month in the fuzzy date. |
| year | y |  | integer | The year in the fuzzy date. |
| Is anonymous? | is\_anonymous |  | boolean | Is the gift anonymous? If no value is provided, the default anonymity of the donor will be used. |
| Subtype | subtype |  | string | The subtype of the gift. |
| Comment | reference |  | string | Notes to track special details about a gift such as the motivation behind it or a detailed description of a gift-in-kind. |
| Lookup ID | lookup\_id |  | string | The user-defined identifier for the gift. |
| Use fundraiser credits? | default\_fundraiser\_credits |  | boolean | Use the default fundraiser credits? |
| Use soft credits? | default\_soft\_credits |  | boolean | Use the default soft credits? |
| Constituency | constituency |  | string | The constituency of the gift. |
| Post status | post\_status |  | string | The post status of the gift. |
| Post date | post\_date |  | date | The date the gift was posted (ex: '2020-09-18'). |
| Receipt status | status | True | string | The receipt status of the gift. |
| Receipt amount | value | True | double | The amount of the receipt for the gift. |
| Receipt date | date |  | date | The date that the gift was receipted (ex: '2020-09-18'). |

#### Returns

Contains a collection of batch gift error records and the batch gifts that the operation added

- Results
    - GiftApi.BatchGiftAddResults

### Create a constituent tax declaration

- Operation ID:
    - CreateTaxDeclaration

Creates a new Gift Aid tax declaration for a constituent.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Constituent ID | constituent\_id | True | integer | The system record ID of the constituent. |
| Declaration starts | declaration\_starts | True | date-time | The date the tax declaration starts (ex: '2020-09-18T04:13:56Z'). |
| Declaration ends | declaration\_ends |  | date-time | The date the tax declaration ends (ex: '2020-09-18T04:13:56Z'). |
| Declaration made | declaration\_made |  | date-time | The date the tax declaration was made (ex: '2020-09-18T04:13:56Z'). |
| Indicator | declaration\_indicator |  | string | The declaration indicator. |
| Source | declaration\_source |  | string | The declaration source. |
| Confirmation sent | confirmation\_sent |  | date-time | The date the confirmation was sent (ex: '2020-09-18T04:13:56Z'). |
| Confirmation returned | confirmation\_returned |  | date-time | The date the confirmation was returned (ex: '2020-09-18T04:13:56Z'). |
| Pays tax | constituent\_pays\_tax |  | string | Indicates whether the constituent pays tax. |
| Status | tax\_payer\_status |  | string | The tax payer status. |
| Comments | tax\_notes |  | string | Comments for the tax declaration. |
| Sequence | sequence |  | integer | The numeric sequence associated with the tax declaration. |

#### Returns

Created tax declaration

- Body
    - NXTDataIntegrationApi.CreatedTaxDeclaration

### Create a gift

- Operation ID:
    - CreateGift

Creates a new gift.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Constituent ID | constituent\_id | True | string | The system record ID of the constituent associated with the gift. |
| Amount | value | True | double | The amount of the gift. |
| Date | date | True | date | The gift date (ex: '2020-09-18'). |
| Type | type | True | string | The gift type. |
| campaign ID | campaign\_id |  | string | The system record ID of the campaign associated with the gift split. |
| fund ID | fund\_id | True | string | The system record ID of the fund associated with the gift split. |
| appeal ID | appeal\_id |  | string | The system record ID of the appeal associated with the gift split. |
| package ID | package\_id |  | string | The system record ID of the package associated with the gift split. |
| amount | value | True | double | The amount of the gift split. |
| Payment method | payment\_method | True | string | The payment method. |
| Check number | check\_number |  | string | The check number (only applicable when payment method is "PersonalCheck"). |
| day | d |  | integer | The day in the fuzzy date. |
| month | m |  | integer | The month in the fuzzy date. |
| year | y |  | integer | The year in the fuzzy date. |
| Reference | reference |  | string | The payment reference (only applicable when payment method is "Other"). |
| day | d |  | integer | The day in the fuzzy date. |
| month | m |  | integer | The month in the fuzzy date. |
| year | y |  | integer | The year in the fuzzy date. |
| Is anonymous? | is\_anonymous |  | boolean | Is the gift anonymous? If no value is provided, the default anonymity of the donor will be used. |
| Subtype | subtype |  | string | The subtype of the gift. |
| Comment | reference |  | string | Notes to track special details about a gift such as the motivation behind it or a detailed description of a gift-in-kind. |
| Lookup ID | lookup\_id |  | string | The user-defined identifier for the gift. |
| Use fundraiser credits? | default\_fundraiser\_credits |  | boolean | Use the default fundraiser credits? |
| Use soft credits? | default\_soft\_credits |  | boolean | Use the default soft credits? |
| Constituency | constituency |  | string | The constituency of the gift. |
| Batch prefix | batch\_prefix |  | string | The prefix to use for batch gifts. This must include at least one letter, and is required when 'Batch number' has a value. |
| Batch number | batch\_number |  | string | The batch number. Character limit: 50 (including the batch prefix). |
| Post status | post\_status |  | string | The post status of the gift. |
| Post date | post\_date |  | date | The date the gift was posted (ex: '2020-09-18'). |
| Receipt status | status | True | string | The receipt status of the gift. |
| Receipt amount | value | True | double | The amount of the receipt for the gift. |
| Receipt date | date |  | date | The date that the gift was receipted (ex: '2020-09-18'). |

#### Returns

Created gift

- Body
    - GiftApi.CreatedGift

### Create a gift attachment

- Operation ID:
    - CreateGiftAttachment

Creates a new gift attachment.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Gift ID | parent\_id | True | string | The system record ID of the gift associated with the attachment. |
| Type | type | True | string | The attachment type. Physical attachments are uploaded files such as images, PDFs, or Word documents that are saved locally or on the network. They are stored and managed in the system. Link attachments are links to files such as images, blog posts, or YouTube videos that are online or in a cloud storage account. They are stored and managed externally. |
| Name | name |  | string | The name of the attachment. Character limit: 150. |
| Date | date |  | date-time | The date of the attachment (ex: '2020-09-18T04:13:56Z'). This field defaults to the current date and time if not supplied. |
| URL | url |  | string | The URL for the attachment. This is required for link attachments and not applicable for physical attachments. |
| File name | file\_name |  | string | The name of the file. Character limit: 36. For physical attachments only. |
| File ID | file\_id |  | string | The identifier of the file. Character limit: 36. For physical attachments only. |
| Thumbnail ID | thumbnail\_id |  | string | The identifier of the thumbnail. Character limit: 36. For physical attachments only. |
| Tags | tags |  | array of string | The tags associated with the attachment. |

#### Returns

Created gift attachment

- Body
    - GiftApi.CreatedGiftAttachment

### Create a gift batch

- Operation ID:
    - CreateGiftBatch

Creates a new gift batch.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Description | batch\_description |  | string | The description of the batch. |
| Expected number | expected\_number |  | integer | The number of gifts expected in the batch. |
| Expected total | expected\_batch\_total |  | double | The total value of gifts in the batch. |
| Batch number | batch\_number |  | string | The unique identifier specific to the batch. |

#### Returns

Created gift batch

- Body
    - GiftBatchApi.CreatedBatch

### Create a gift custom field

- Operation ID:
    - CreateGiftCustomField

Creates a new gift custom field.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| body | body | True | dynamic | An object that represents the custom field to create. |

#### Returns

Created gift custom field

- Body
    - GiftApi.CreatedGiftCustomField

### Create a gift note

- Operation ID:
    - CreateGiftNote

Creates a new gift note.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Gift ID | gift\_id | True | integer | The system record ID of the gift associated with the note. |
| Type | note\_type\_id | True | integer | The note type. |
| day | d |  | integer | The day in the fuzzy date. |
| month | m |  | integer | The month in the fuzzy date. |
| year | y |  | integer | The year in the fuzzy date. |
| Summary | summary |  | string | The note summary. Character limit: 255. |
| Note | text |  | string | The note text. |
| Author | author |  | string | The note author. Character limit: 50. |

#### Returns

Created note

- Body
    - NXTDataIntegrationApi.CreatedGiftNote

### Create a gift tribute

- Operation ID:
    - CreateGiftTribute

Creates a new gift tribute.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Gift ID | gift\_id | True | integer | The system record ID of the gift associated with the gift tribute. |
| Tribute ID | tribute\_id | True | integer | The system record ID of the tribute associated with the gift tribute. |

#### Returns

Created gift tribute

- Body
    - NXTDataIntegrationApi.CreatedGiftTribute

### Create a pledge

- Operation ID:
    - CreatePledge

Creates a new pledge.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Constituent ID | id | True | string | The system record ID of the constituent. |
| Amount | value | True | double | The amount of the pledge. |
| Date | gift\_date | True | date | The pledge date (ex: '2020-09-18'). |
| Frequency | frequency | True | string | The installment frequency for the pledge. |
| # of installments | number\_of\_installments | True | integer | The number of installments for the pledge. |
| Start date | start\_date | True | date | The date that the pledge schedule starts. |
| amount | value | True | double | The amount of the gift split. |
| fund ID | fund\_id | True | string | The system record ID of the fund associated with the gift split. |
| campaign ID | campaign\_id |  | string | The system record ID of the campaign associated with the gift split. |
| appeal ID | appeal\_id |  | string | The system record ID of the appeal associated with the gift split. |
| package ID | package\_id |  | string | The system record ID of the package associated with the gift split. |
| Payment method | method | True | string | The payment method. |
| Check number | check\_number |  | string | The check number. |
| Reference | reference\_number |  | string | The payment reference (only applicable when payment method is "Other"). |
| Send reminder? | send\_reminder |  | boolean | Send pledge reminders? |
| Is anonymous? | anonymous |  | boolean | Is the gift anonymous? If no value is provided, the default anonymity of the donor will be used. |
| Subtype | name |  | string | The subtype of the gift. |
| Comment | comments |  | string | Notes to track special details about a gift such as the motivation behind it. |
| Lookup ID | lookup\_id |  | string | The user-defined identifier for the gift. |
| Gift code | value |  | string | The gift code associated with the gift. |
| Constituency | value |  | string | The constituency of the gift. |
| Post status | gift\_post\_status |  | string | The post status of the gift. |
| Post date | gift\_post\_date |  | date | The date the gift is to be posted (ex: '2020-09-18'). |
| Status | gift\_status |  | string | The status of the pledge. |
| day | d |  | integer | The day in the fuzzy date. |
| month | m |  | integer | The month in the fuzzy date. |
| year | y |  | integer | The year in the fuzzy date. |
| Receipt status | receipt\_status | True | string | The receipt status of the gift. |
| Receipt amount | value | True | double | The amount of the receipt for the gift. |
| Receipt date | receipt\_date |  | date | The date that the gift was receipted (ex: '2020-09-18'). |
| Receipt number | receipt\_number |  | integer | The receipt number. |
| Receipt stack | value |  | string | The receipt stack. |
| Acknowledge status | status | True | string | The acknowledgement status of the gift. |
| Acknowledge date | acknowledgement\_date |  | date | The date that the gift was acknowledged (ex: '2020-09-18'). |
| Letter | value |  | string | The letter associated with the acknowledgement. |
| type | credit\_type | True | string | The type of recognition credit. |
| recipient ID | constituent\_id | True | string | The system record ID of the recipient of the recognition credit. |
| amount | value | True | double | The amount credited to the recipient. |
| date | date |  | date | The date of the installment (ex: '2020-09-18'). |
| amount | amount |  | double | The amount of the installment. |

#### Returns

Created gift

- Body
    - GiftApi.CreatedGift

### Create a pledge payment

- Operation ID:
    - CreatePledgePayment

Creates a new pledge payment.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Constituent ID | id | True | string | The system record ID of the constituent. |
| Amount | value | True | double | The amount of the pledge payment. |
| Date | gift\_date | True | date | The pledge payment date (ex: '2020-09-18'). |
| amount | value | True | double | The amount of the gift split. |
| fund ID | fund\_id | True | string | The system record ID of the fund associated with the gift split. |
| campaign ID | campaign\_id |  | string | The system record ID of the campaign associated with the gift split. |
| appeal ID | appeal\_id |  | string | The system record ID of the appeal associated with the gift split. |
| package ID | package\_id |  | string | The system record ID of the package associated with the gift split. |
| Payment method | method | True | string | The payment method. |
| Check number | check\_number |  | string | The check number. |
| Reference | reference\_number |  | string | The payment reference (only applicable when payment method is "Other"). |
| Is anonymous? | anonymous |  | boolean | Is the gift anonymous? If no value is provided, the default anonymity of the donor will be used. |
| pledge | pledge\_id |  | string | The system record ID of the pledge being paid. |
| installment | installment\_id |  | string | The system record ID of the installment being paid. |
| amount | amount\_applied |  | double | The amount applied to the installment. |
| Subtype | name |  | string | The subtype of the gift. |
| Comment | comments |  | string | Notes to track special details about a gift such as the motivation behind it. |
| Lookup ID | lookup\_id |  | string | The user-defined identifier for the gift. |
| Gift code | value |  | string | The gift code associated with the gift. |
| Constituency | value |  | string | The constituency of the gift. |
| Post status | gift\_post\_status |  | string | The post status of the gift. |
| Post date | gift\_post\_date |  | date | The date the gift is to be posted (ex: '2020-09-18'). |
| Receipt status | receipt\_status | True | string | The receipt status of the gift. |
| Receipt amount | value | True | double | The amount of the receipt for the gift. |
| Receipt date | receipt\_date |  | date | The date that the gift was receipted (ex: '2020-09-18'). |
| Receipt number | receipt\_number |  | integer | The receipt number. |
| Receipt stack | value |  | string | The receipt stack. |
| Acknowledge status | status | True | string | The acknowledgement status of the gift. |
| Acknowledge date | acknowledgement\_date |  | date | The date that the gift was acknowledged (ex: '2020-09-18'). |
| Letter | value |  | string | The letter associated with the acknowledgement. |
| type | credit\_type | True | string | The type of recognition credit. |
| recipient ID | constituent\_id | True | string | The system record ID of the recipient of the recognition credit. |
| amount | value | True | double | The amount credited to the recipient. |

#### Returns

Created gift

- Body
    - GiftApi.CreatedGift

### Create a stock gift

- Operation ID:
    - CreateStock

Creates a new stock gift.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Constituent ID | id | True | string | The system record ID of the constituent. |
| Amount | value | True | double | The amount of the gift. |
| Date | gift\_date | True | date | The gift date (ex: '2020-09-18'). |
| Issuer | issuer |  | string | The stock issuer. |
| Issuer symbol | symbol |  | string | The stock issuer symbol. |
| Number of units | units |  | integer | The number of units of stock. |
| Median price per unit | unit\_price |  | double | The median price per unit. |
| amount | value | True | double | The amount of the gift split. |
| fund ID | fund\_id | True | string | The system record ID of the fund associated with the gift split. |
| campaign ID | campaign\_id |  | string | The system record ID of the campaign associated with the gift split. |
| appeal ID | appeal\_id |  | string | The system record ID of the appeal associated with the gift split. |
| package ID | package\_id |  | string | The system record ID of the package associated with the gift split. |
| Payment method | method | True | string | The payment method. |
| Check number | check\_number |  | string | The check number. |
| Reference | reference\_number |  | string | The payment reference (only applicable when payment method is "Other"). |
| Is anonymous? | anonymous |  | boolean | Is the gift anonymous? If no value is provided, the default anonymity of the donor will be used. |
| Subtype | name |  | string | The subtype of the gift. |
| Comment | comments |  | string | Notes to track special details about a gift such as the motivation behind it. |
| Lookup ID | lookup\_id |  | string | The user-defined identifier for the gift. |
| Gift code | value |  | string | The gift code associated with the gift. |
| Constituency | value |  | string | The constituency of the gift. |
| Post status | gift\_post\_status |  | string | The post status of the gift. |
| Post date | gift\_post\_date |  | date | The date the gift is to be posted (ex: '2020-09-18'). |
| Receipt status | receipt\_status | True | string | The receipt status of the gift. |
| Receipt amount | value | True | double | The amount of the receipt for the gift. |
| Receipt date | receipt\_date |  | date | The date that the gift was receipted (ex: '2020-09-18'). |
| Receipt number | receipt\_number |  | integer | The receipt number. |
| Receipt stack | value |  | string | The receipt stack. |
| Acknowledge status | status | True | string | The acknowledgement status of the gift. |
| Acknowledge date | acknowledgement\_date |  | date | The date that the gift was acknowledged (ex: '2020-09-18'). |
| Letter | value |  | string | The letter associated with the acknowledgement. |
| type | credit\_type | True | string | The type of recognition credit. |
| recipient ID | constituent\_id | True | string | The system record ID of the recipient of the recognition credit. |
| amount | value | True | double | The amount credited to the recipient. |

#### Returns

Created gift

- Body
    - GiftApi.CreatedGift

### Get a gift

- Operation ID:
    - GetGift

Returns information about a gift.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Gift ID | gift\_id | True | string | The system record ID of the gift to get. |

#### Returns

Gift

- Body
    - GiftApi.GiftRead

### Get a gift by lookup ID

- Operation ID:
    - GetGiftIdFromLookupId

Returns a gift's system record ID from the specified lookup ID.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Lookup ID | giftlookupid | True | string | The gift lookup ID. |

#### Returns

Gift ID map

- Body
    - NXTDataIntegrationApi.GiftIdMap

### Get constituent first gift

- Operation ID:
    - GetConstituentFirstGift

Returns the first gift for a constituent.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Constituent ID | constituent\_id | True | string | The system record ID of the constituent. |

#### Returns

Giving summary

- Body
    - ConstituentApi.GivingSummaryRead

### Get constituent greatest gift

- Operation ID:
    - GetConstituentGreatestGift

Returns the greatest gift for a constituent.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Constituent ID | constituent\_id | True | string | The system record ID of the constituent. |

#### Returns

Giving summary

- Body
    - ConstituentApi.GivingSummaryRead

### Get constituent latest gift

- Operation ID:
    - GetConstituentLatestGift

Returns the latest gift for a constituent.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Constituent ID | constituent\_id | True | string | The system record ID of the constituent. |

#### Returns

Giving summary

- Body
    - ConstituentApi.GivingSummaryRead

### Get constituent lifetime giving

- Operation ID:
    - GetConstituentLifetimeGiving

Returns the lifetime giving summary for a constituent.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Constituent ID | constituent\_id | True | string | The system record ID of the constituent. |

#### Returns

Lifetime giving

- Body
    - ConstituentApi.LifetimeGivingRead

### List constituent tax declarations

- Operation ID:
    - ListConstituentTaxDeclarations

Lists the Gift Aid tax declarations for a constituent (only applicable for UK versions).

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Constituent ID | constituent\_id | True | integer | The system record ID of the constituent. |
| Limit | limit |  | integer | Represents the number of records to return. The default is 500. There is no maximum. |
| Offset | offset |  | integer | Represents the number of records to skip. For use with pagination. |

#### Returns

Tax declarations

- Body
    - NXTDataIntegrationApi.TaxDeclarationCollection

### List gift attachments

- Operation ID:
    - ListGiftAttachments

Lists the attachments for a gift.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Gift ID | gift\_id | True | string | The system record ID of the gift. |

#### Returns

Attachments

- Body
    - GiftApi.ApiCollectionOfGiftAttachmentRead

### List gift batches

- Operation ID:
    - ListGiftBatches

List the gift batches.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Batch number | batch\_number |  | string | Represents a filter for results that match the specified number. |
| Approved? | approved |  | boolean | Represents a filter for the status of the gift batch. |
| Has exceptions? | has\_exceptions |  | boolean | Represents a filter for whether the gift batch contains exceptions. |
| Limit | limit |  | integer | Represents the number of records to return. The default is 500. The maximum is 5000. |
| Offset | offset |  | integer | Represents the number of records to skip. For use with pagination. |
| Search text | search\_text |  | string | Represents a filter for text included in the batch description or batch number fields. |
| Created by | created\_by |  | string | Represents a filter for gift batches created by the specified user. |

#### Returns

Gift batches

- Body
    - GiftBatchApi.ApiCollectionOfGiftBatch

### List gift custom fields

- Operation ID:
    - ListGiftCustomFields

Lists the custom fields for a gift.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Gift ID | gift\_id | True | string | The system record ID of the gift. |

#### Returns

Custom fields

- Body
    - GiftApi.ApiCollectionOfGiftCustomFieldRead

### List gift notes

- Operation ID:
    - ListGiftNotes

Lists the notes for a gift.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Gift ID | gift\_id | True | integer | The system record ID of the giftt. |
| Limit | limit |  | integer | Represents the number of records to return. |
| Offset | offset |  | integer | Represents the number of records to skip. For use with pagination. |

#### Returns

Gift notes

- Body
    - NXTDataIntegrationApi.GiftNoteCollection

### List gift tribute acknowledgees

- Operation ID:
    - ListGiftTributeAcknowledgees

List the acknowledgees for a gift tribute.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Gift tribute ID | gift\_tribute\_id | True | integer | The system record ID of the gift tribute. |

#### Returns

Gift tribute acknowledgees

- Body
    - NXTDataIntegrationApi.GiftTributeAcknowledgeeCollection

### List gift tributes

- Operation ID:
    - ListGiftTributes

Lists the tributes for a gift.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Gift ID | gift\_id | True | integer | The system record ID of the gift. |

#### Returns

Gift tributes

- Body
    - NXTDataIntegrationApi.GiftTributeCollection

### List gifts

- Operation ID:
    - ListGifts

Returns a list of gifts.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| List | list\_id |  | string | Defines a list identifier used to filter the set of gifts to those included in the specified list. If this value is set, other specified filters will be ignored. |
| Type | gift\_type |  | string | Represents a comma-separated list of gift types to filter the results. For example, "MatchingGiftPledge,RecurringGift" returns only gifts of type MatchingGiftPledge or RecurringGift. |
| Constituent ID | constituent\_id |  | string | Represents a comma-separated list of constituent system record IDs to filter the results. For example, "280,1232" returns only gifts from constituent 280 or constituent 1232. |
| Campaign ID | campaign\_id |  | string | Represents a comma-separated list of campaign system record IDs to filter the results. For example, "506,918" returns only gifts to campaign 506 or campaign 918. |
| Fund ID | fund\_id |  | string | Represents a comma-separated list of fund system record IDs to filter the results. For example, "506,918" returns only gifts to fund 506 or fund 918. |
| Appeal ID | appeal\_id |  | string | Represents a comma-separated list of appeal system record IDs to filter the results. For example, "506,918" returns only gifts to appeal 506 or appeal 918. |
| Limit | limit |  | integer | Represents the number of records to return. The default is 500. The maximum is 5000. |
| Offset | offset |  | integer | Represents the number of records to skip. For use with pagination. |
| Start gift date | start\_gift\_date |  | date-time | Represents a filter for gifts with a gift date on or after the specified date (ex: '2020-09-18T04:13:56Z'). |
| End gift date | end\_gift\_date |  | date-time | Represents a filter for gifts with a gift date on or before the specified date (ex: '2020-09-18T04:13:56Z'). |
| Start gift amount | start\_gift\_amount |  | double | Represents a filter for gifts with an amount greater than or equal to the specified amount. |
| End gift amount | end\_gift\_amount |  | double | Represents a filter for gifts with an amount less than or equal to the specified amount. |
| Post status | post\_status |  | string | Represents a comma-separated list of gift post statuses to filter the results. For example, "DoNotPost,Posted" returns only gifts that are marked as DoNotPost or Posted. |
| Receipt status | receipt\_status |  | string | Represents a comma-separated list of gift receipt statuses to filter the results. For example, "DoNotReceipt,Receipted" returns only gifts that are marked as DoNotReceipt or Receipted. |
| Acknowledgement status | acknowledgement\_status |  | string | Represents a comma-separated list of gift acknowledgement statuses to filter the results. For example, "DoNotAcknowledge,Acknowledged" returns only gifts that are marked as DoNotAcknowledge or Acknowledged. |
| Sorted by | sort |  | string | Represents a list of fields to sort the results by. Results are in ascending order by default, and a '-' sign denotes descending order. For example, "date\_added,-date" sorts gifts by the "date\_added" field in ascending order and then by the "gift date" field in descending order. If only the date\_modified field or only the date\_added field is provided, then this adds the sort\_token parameter to the next\_link URL to ensure that gifts are stably sorted. |
| Added on or after | date\_added |  | date-time | Filter the results to gifts created on or after the specified date (ex: '2020-09-18T04:13:56Z'). |
| Modified on or after | last\_modified |  | date-time | Filter the results to gifts modified on or after the specified date (ex: '2020-09-18T04:13:56Z'). |

#### Returns

Gifts

- Body
    - GiftApi.ApiCollectionOfGiftRead

### List pledge installments

- Operation ID:
    - ListPledgeInstallments

Lists the installments for a pledge.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Pledge ID | gift\_id | True | string | The system record ID of the pledge. |

#### Returns

Installments

- Body
    - Gift2Api.PledgeInstallmentCollection

### List pledge payments

- Operation ID:
    - ListPledgePayments

Lists the payments for a pledge.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Pledge ID | gift\_id | True | string | The system record ID of the pledge. |

#### Returns

Payments

- Body
    - Gift2Api.PledgePaymentCollection

### Sell a stock gift

- Operation ID:
    - SellStockGift

Updates a stock gift to sold.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Gift ID | gift\_id | True | string | The system record ID of the stock gift to sell. |
| Sale date | stock\_sale\_date | True | date | The date the stock was sold (ex: '2005-09-18'). |
| Sale value | stock\_sale\_value | True | double | The value of the stock sale. |
| Broker fee | broker\_fee |  | double | The sold stock broker fee. |
| Post status | post\_status |  | string | The post status of the sold gift. |
| Post date | post\_date |  | date | The posted date of the sold stock (ex: '2020-09-18'). |
| Notes | notes |  | string | The notes for the sold stock. Character limit: 255. |
| Issuer | issuer |  | string | The stock issuer. |
| Issuer symbol | symbol |  | string | The stock issuer symbol. |
| Number of units | units |  | integer | The number of units sold. |
| Median price per unit | unit\_price |  | double | The median price per unit sold. |

### Update a constituent tax declaration

- Operation ID:
    - EditTaxDeclaration

Updates a constituent tax declaration.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Tax declaration ID | tax\_declaration\_id | True | integer | The system record ID of the tax declaration to update. |
| Declaration starts | declaration\_starts |  | date-time | The date the tax declaration starts (ex: '2020-09-18T04:13:56Z'). |
| Declaration ends | declaration\_ends |  | date-time | The date the tax declaration ends (ex: '2020-09-18T04:13:56Z'). |
| Declaration made | declaration\_made |  | date-time | The date the tax declaration was made (ex: '2020-09-18T04:13:56Z'). |
| Indicator | declaration\_indicator |  | string | The declaration indicator. |
| Source | declaration\_source |  | string | The declaration source. |
| Confirmation sent | confirmation\_sent |  | date-time | The date the confirmation was sent (ex: '2020-09-18T04:13:56Z'). |
| Confirmation returned | confirmation\_returned |  | date-time | The date the confirmation was returned (ex: '2020-09-18T04:13:56Z'). |
| Pays tax | constituent\_pays\_tax |  | string | Indicates whether the constituent pays tax. |
| Status | tax\_payer\_status |  | string | The tax payer status. |
| Comments | tax\_notes |  | string | Comments for the tax declaration. |
| Sequence | sequence |  | integer | The numeric sequence associated with the tax declaration. |

### Update a gift attachment

- Operation ID:
    - EditGiftAttachment

Updates a gift attachment.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Attachment ID | attachment\_id | True | string | The system record ID of the attachment to update. |
| Name | name |  | string | The name of the attachment. Character limit: 150. |
| Date | date |  | date-time | The date of the attachment (ex: '2020-09-18T04:13:56Z'). |
| URL | url |  | string | The URL for the attachment. This is required for link attachments and not applicable for physical attachments. |
| Tags | tags |  | array of string | The tags associated with the attachment. |

### Update a gift custom field

- Operation ID:
    - EditGiftCustomField

Updates a gift custom field.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Custom field ID | custom\_field\_id | True | string | The system record ID of the custom field to update. |
| body | body | True | dynamic | An object that represents the properties of the custom field to update. |

### Update a gift note

- Operation ID:
    - EditGiftNote

Updates a gift note.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Note ID | id | True | integer | The system record ID of the note to update. |
| Type | note\_type\_id |  | integer | The note type. |
| day | d |  | integer | The day in the fuzzy date. |
| month | m |  | integer | The month in the fuzzy date. |
| year | y |  | integer | The year in the fuzzy date. |
| Summary | summary |  | string | The note summary. Character limit: 255. |
| Note | text |  | string | The note text. |
| Author | author |  | string | The note author. Character limit: 50. |

### Update a gift tribute

- Operation ID:
    - EditGiftTribute

Updates a gift tribute.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Gift tribute ID | gift\_tribute\_id | True | integer | The system record ID of the gift tribute to update. |
| Tribute type | tribute\_type |  | integer | The tribute type. |
| Acknowledge status | acknowledge |  | string | The gift tribute acknowledge status. |

### Update a gift tribute acknowledgee

- Operation ID:
    - EditGiftTributeAcknowledgee

Updates a gift tribute acknowledgee.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Gift tribute acknowledgee ID | gift\_tribute\_acknowledgee\_id | True | integer | The system record ID of the gift tribute acknowledgee to update. |
| Letter | letter |  | integer | The letter sent to the acknowledgee. |
| Letter date | letter\_date |  | date-time | The date on which the letter was sent. |

### Update gift acknowledgement details

- Operation ID:
    - EditGiftAcknowledgement

Updates the acknowledgement details for a gift.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Acknowledgement ID | acknowledgement\_id | True | string | The system record ID of the gift acknowledgement to update. It uses the parent gift's ID as its value. |
| Status | status |  | string | The status of the acknowledgement. When status is set to DoNotAcknowledge, letter and date should be null. When status is set to NeedsAcknowledgement, date should be null. |
| Date | date |  | date-time | The date associated with the acknowledgement (ex: '2020-09-18T04:13:56Z'). |
| Letter | letter |  | string | The letter associated with the acknowledgement. |

### Update gift receipt details

- Operation ID:
    - EditGiftReceipt

Updates the receipt details for a gift.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Receipt ID | receipt\_id | True | string | The system record ID of the gift receipt to update. It uses the parent gift's ID as its value. |
| Status | status |  | string | The receipt status of the gift. When status is set to NeedsReceipt or DoNotReceipt, receipt date should be null. |
| Amount | value |  | double | The receipt amount. |
| Date | date |  | date-time | The date on the receipt (ex: '2020-09-18T04:13:56Z'). |
| Number | number |  | integer | The number of the receipt. |

## Definitions

### ConstituentApi.AppealRead

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The system record ID of the appeal. |
| description | description | string | The appeal description. |

### ConstituentApi.CampaignRead

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The system record ID of the campaign. |
| description | description | string | The campaign description. |

### ConstituentApi.FundRead

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The system record ID of the fund. |
| description | description | string | The fund description. |

### ConstituentApi.GivingSummaryRead

Giving summary

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The system record ID of the gift. |
| Type | type | string | The gift type. |
| Date | date | date-time | The gift date. |
| value | amount.value | double | The amount of the gift. |
| Appeal | appeals | array of ConstituentApi.AppealRead | The set of appeals associated with the gift. |
| Campaign | campaigns | array of ConstituentApi.CampaignRead | The set of campaigns associated with the gift. |
| Fund | funds | array of ConstituentApi.FundRead | The set of funds associated with the gift. |

### ConstituentApi.LifetimeGivingRead

Lifetime giving

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| Consecutive years given | consecutive\_years\_given | integer | The number of consecutive years the constituent has given. |
| Total years given | total\_years\_given | integer | The total number of years the constituent has given. |
| value | total\_giving.value | double | The total amount given by the constituent. |
| value | total\_pledge\_balance.value | double | The total unpaid pledge balance for the constituent. |
| value | total\_received\_giving.value | double | The total received amount given by the constituent. |
| value | total\_committed\_matching\_gifts.value | double | This computed field calculates the total amount of matching gift commitments attributed to the constituent. |
| value | total\_received\_matching\_gifts.value | double | The total amount of payments toward matching gift pledges attributed to the constituent. |
| value | total\_soft\_credits.value | double | The total amount of soft credits applied to the constituent. |

### GiftApi.AcknowledgementRead

Acknowledgement

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| date | date | date-time | The date associated with the acknowledgement. |
| letter | letter | string | The letter associated with the acknowledgement. |
| status | status | string | The status of the acknowledgement. Available values are: ACKNOWLEDGED, NEEDSACKNOWLEDGEMENT, and DONOTACKNOWLEDGE. |

### GiftApi.ApiCollectionOfGiftAttachmentRead

Attachments

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| Count | count | integer | The number of items available for retrieval into the collection after applying any request parameters. The limit and offset parameters do not affect the count, but to facilitate paging, they may affect the number of items in the value result set. |
| value | value | array of GiftApi.GiftAttachmentRead | The set of items included in the response. This may be a subset of the items in the collection. |

### GiftApi.ApiCollectionOfGiftCustomFieldRead

Custom fields

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| Count | count | integer | The number of items available for retrieval into the collection after applying any request parameters. The limit and offset parameters do not affect the count, but to facilitate paging, they may affect the number of items in the value result set. |
| value | value | array of GiftApi.GiftCustomFieldRead | The set of items included in the response. This may be a subset of the items in the collection. |

### GiftApi.ApiCollectionOfGiftRead

Gifts

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| Count | count | integer | The number of items available for retrieval into the collection after applying any request parameters. The limit and offset parameters do not affect the count, but to facilitate paging, they may affect the number of items in the value result set. |
| value | value | array of GiftApi.GiftRead | The set of items included in the response. This may be a subset of the items in the collection. |

### GiftApi.BatchGiftAddResults

Contains a collection of batch gift error records and the batch gifts that the operation added

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| errors | errors | array of GiftApi.GiftBatchGiftError | The batch gift errors associated with the batch gift add operation |
| gifts | gifts | array of GiftApi.BatchGiftRead | The collection of batch gifts that were added by the batch gift add operation |

### GiftApi.GiftBatchGiftError

Represents exceptions preventing items from being added to the batch.

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| affected field | affected\_field | string | The field affected by the error |
| batch ID | batch\_id | string | The system record ID of the batch |
| exception error code | exception\_error\_code | integer | The exception error code |
| exception error message | exception\_error\_message | string | The exception error message |
| exception error name | exception\_error\_name | string | The exception error name |
| gift ID | gift\_id | string | The system record ID of the gift |
| lookup ID | lookup\_id | string | The user-defined identifier for the gift. |

### GiftApi.BatchGiftRead

Batch gift

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| batch ID | batch\_id | string | The ID of the batch to which the gift was added. |
| errors | errors | array of GiftApi.GiftBatchGiftError | The errors associated with the batch gift. |
| ID | id | string | The system record ID of the batch gift. |
| constituent ID | constituent\_id | string | The system record ID of the constituent associated with the gift. |
| type | type | string | The gift type. |
| subtype | subtype | string | The subtype of the gift. |
| date | date | date-time | The gift date. |
| value | amount.value | double | The amount of the gift. |
| value | balance.value | double | The balance remaining on the gift. |
| batch number | batch\_number | string | The batch number associated with this gift. |
| status | gift\_status | string | The status of the gift. |
| anonymous? | is\_anonymous | boolean | Is the gift anonymous? |
| constituency | constituency | string | The constituency of the gift. |
| lookup ID | lookup\_id | string | The user-defined identifier for the gift. |
| origin | origin | string | The origin of the gift. |
| post status | post\_status | string | The general ledger post status of the gift. Available values are Posted, NotPosted, and DoNotPost. When post\_status is set to DoNotPost&gt;, post\_date should be null. When it is set to NotPosted, post\_date is required but remains editable. When it is set to Posted, post\_date is required and is no longer editable. |
| post date | post\_date | date-time | The date that the gift was posted to general ledger. |
| reference | reference | string | Notes to track special details about a gift such as the motivation behind it or a detailed description of a gift-in-kind. |
| day | recurring\_gift\_status\_date.d | integer | The day in the fuzzy date. |
| month | recurring\_gift\_status\_date.m | integer | The month in the fuzzy date. |
| year | recurring\_gift\_status\_date.y | integer | The year in the fuzzy date. |
| frequency | recurring\_gift\_schedule.frequency | string | Installment frequency of the recurring gift to view. Available values are WEEKLY, EVERY\_TWO\_WEEKS, EVERY\_FOUR\_WEEKS, MONTHLY, QUARTERLY, ANNUALLY. |
| start | recurring\_gift\_schedule.start\_date | date-time | Date the recurring gift should start. |
| end | recurring\_gift\_schedule.end\_date | date-time | Date the recurring gift should end. |
| value | gift\_aid\_amount.value | double | This computed field calculates the total qualified amount of tax reclaimed from Gift Aid across all gift\_splits for this gift. For the UK only. |
| gift aid qualification status | gift\_aid\_qualification\_status | string | This computed field determines the Gift Aid qualification status based on tax declaration information and the database format. Available values are: Qualified, NotQualified, and PartlyQualified. For the UK only. |
| gift code | gift\_code | string | The gift code value associated with the gift. |
| gift splits | gift\_splits | array of GiftApi.GiftSplitRead | The set of gift splits associated with the gift. |
| fundraisers | fundraisers | array of GiftApi.GiftFundraiserRead | The set of fundraisers who receive credit for the gift. |
| Soft credits | soft\_credits | array of GiftApi.SoftCreditRead | The set of soft credits associated with the gift. |
| Receipts | receipts | array of GiftApi.ReceiptRead | The set of receipts associated with the gift. |
| Acknowledgements | acknowledgements | array of GiftApi.AcknowledgementRead | The set of acknowledgements associated with the gift. |
| Payments | payments | array of GiftApi.PaymentRead | The payments on the gift. |
| Linked gifts | linked\_gifts | array of string | The identifiers of other gifts that are linked to this gift. |
| Date added | date\_added | date-time | The date when the gift was created. |
| Date modified | date\_modified | date-time | The date when the gift was last modified. |

### GiftApi.CreatedGift

Created gift

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The ID of the newly created gift. |

### GiftApi.CreatedGiftAttachment

Created gift attachment

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The ID of the newly created gift attachment. |

### GiftApi.CreatedGiftCustomField

Created gift custom field

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The ID of the newly created gift custom field. |

### GiftApi.GiftAttachmentRead

Attachment

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The system record ID of the attachment. |
| Gift ID | parent\_id | string | The system record ID of the gift associated with the attachment. |
| Type | type | string | The attachment type. Physical attachments are uploaded files such as images, PDFs, or Word documents that are saved locally or on the network. They are stored and managed in the system. Link attachments are links to files such as images, blog posts, or YouTube videos that are online or in a cloud storage account. They are stored and managed externally. |
| Name | name | string | The name of the attachment. Character limit: 150. |
| Date | date | date-time | The date of the attachment. |
| URL | url | string | The URL for the attachment. This is required for link attachments and not applicable for physical attachments. |
| File name | file\_name | string | The name of the file. Character limit: 36. For physical attachments only. |
| File ID | file\_id | string | The identifier of the file. Character limit: 36. For physical attachments only. |
| Thumbnail ID | thumbnail\_id | string | The identifier of the thumbnail. Character limit: 36. For physical attachments only. |
| Thumbnail URL | thumbnail\_url | string | The URL for a thumbnail. For physical attachments that are images only. Contains a time-bound signature that limits access to 60 minutes. |
| Content type | content\_type | string | The content type. For physical attachments only. |
| File size | file\_size | integer | The file size in bytes. For physical attachments only. |
| Tags | tags | array of string | The tags associated with the attachment. |

### GiftApi.GiftCustomFieldRead

Custom field

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The system record ID of the custom field. |
| Gift ID | parent\_id | string | The system record ID of the gift associated with the custom field. |
| Category | category | string | The custom field category. |
| Type | type | string | The type of data that the custom field represents. |
| Value | value |  | The value of the custom field. |
| Text value | text\_value | string | The text value of the custom field. |
| Number value | number\_value | integer | The numeric value of the custom field. |
| Date value | date\_value | date | The date value of the custom field. |
| Currency value | currency\_value | double | The currency value of the custom field. |
| Boolean value | boolean\_value | boolean | The boolean value of the custom field. |
| Table entry value | codetableentry\_value | string | The table entry value of the custom field. |
| Constituent ID value | constituentid\_value | string | The constituent ID value of the custom field. |
| day | fuzzydate\_value.d | integer | The day in the fuzzy date. |
| month | fuzzydate\_value.m | integer | The month in the fuzzy date. |
| year | fuzzydate\_value.y | integer | The year in the fuzzy date. |
| Date | date | date | The date on the custom field. |
| Comment | comment | string | The comment on the custom field. Character limit: 50. |
| Date added | date\_added | date-time | The date when the custom field was created. |
| Date modified | date\_modified | date-time | The date when the custom field was last modified. |

### GiftApi.GiftFundraiserRead

Gift fundraiser

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| value | amount.value | double | The amount credited to the fundraiser for the gift. |
| fundraiser ID | constituent\_id | string | The constituent system record ID for the fundraiser associated with the gift. |

### GiftApi.GiftRead

Gift

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The system record ID of the gift. |
| Constituent ID | constituent\_id | string | The system record ID of the constituent associated with the gift. |
| Type | type | string | The gift type. |
| Subtype | subtype | string | The subtype of the gift. |
| Date | date | date-time | The gift date. |
| value | amount.value | double | The amount of the gift. |
| value | balance.value | double | The balance remaining on the gift. |
| Batch number | batch\_number | string | The batch number associated with this gift. |
| Status | gift\_status | string | The status of the gift. |
| Anonymous? | is\_anonymous | boolean | Is the gift anonymous? |
| Constituency | constituency | string | The constituency of the gift. |
| Lookup ID | lookup\_id | string | The user-defined identifier for the gift. |
| Origin | origin | string | The origin of the gift. |
| Post status | post\_status | string | The general ledger post status of the gift. Available values are Posted, NotPosted, and DoNotPost. When post\_status is set to DoNotPost&gt;, post\_date should be null. When it is set to NotPosted, post\_date is required but remains editable. When it is set to Posted, post\_date is required and is no longer editable. |
| Post date | post\_date | date-time | The date that the gift was posted to general ledger. |
| Reference | reference | string | Notes to track special details about a gift such as the motivation behind it or a detailed description of a gift-in-kind. |
| day | recurring\_gift\_status\_date.d | integer | The day in the fuzzy date. |
| month | recurring\_gift\_status\_date.m | integer | The month in the fuzzy date. |
| year | recurring\_gift\_status\_date.y | integer | The year in the fuzzy date. |
| frequency | recurring\_gift\_schedule.frequency | string | Installment frequency of the recurring gift to view. Available values are WEEKLY, EVERY\_TWO\_WEEKS, EVERY\_FOUR\_WEEKS, MONTHLY, QUARTERLY, ANNUALLY. |
| start | recurring\_gift\_schedule.start\_date | date-time | Date the recurring gift should start. |
| end | recurring\_gift\_schedule.end\_date | date-time | Date the recurring gift should end. |
| value | gift\_aid\_amount.value | double | This computed field calculates the total qualified amount of tax reclaimed from Gift Aid across all gift\_splits for this gift. For the UK only. |
| Gift aid qualification status | gift\_aid\_qualification\_status | string | This computed field determines the Gift Aid qualification status based on tax declaration information and the database format. Available values are: Qualified, NotQualified, and PartlyQualified. For the UK only. |
| Gift code | gift\_code | string | The gift code value associated with the gift. |
| Gift splits | gift\_splits | array of GiftApi.GiftSplitRead | The set of gift splits associated with the gift. |
| Fundraisers | fundraisers | array of GiftApi.GiftFundraiserRead | The set of fundraisers who receive credit for the gift. |
| Soft credits | soft\_credits | array of GiftApi.SoftCreditRead | The set of soft credits associated with the gift. |
| Receipts | receipts | array of GiftApi.ReceiptRead | The set of receipts associated with the gift. |
| Acknowledgements | acknowledgements | array of GiftApi.AcknowledgementRead | The set of acknowledgements associated with the gift. |
| Payments | payments | array of GiftApi.PaymentRead | The payments on the gift. |
| Linked gifts | linked\_gifts | array of string | The identifiers of other gifts that are linked to this gift. |
| Date added | date\_added | date-time | The date when the gift was created. |
| Date modified | date\_modified | date-time | The date when the gift was last modified. |

### GiftApi.GiftSplitRead

Gift split

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The system record ID of the gift split. |
| value | amount.value | double | The amount of the gift split. |
| appeal ID | appeal\_id | string | The system record ID of the appeal associated with the gift split. |
| campaign ID | campaign\_id | string | The system record ID of the campaign associated with the gift split. |
| fund ID | fund\_id | string | The system record ID of the fund associated with the gift split. |
| value | gift\_aid\_amount.value | double | The amount of tax reclaimed from gift aid for this gift split. For the UK only. |
| gift aid qualification status | gift\_aid\_qualification\_status | string | The gift aid qualification status of the gift split. Available values are: Qualified, and NotQualified. For the UK only. |
| package ID | package\_id | string | The system record ID of the package associated with the gift split. |

### GiftApi.ReceiptRead

Receipt

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| value | amount.value | double | The amount of the receipt. |
| date | date | date-time | The date on the receipt. |
| number | number | integer | The number of the receipt. |
| status | status | string | The status of the receipt. Available values are: RECEIPTED, NEEDSRECEIPT, and DONOTRECEIPT. |

### GiftApi.PaymentRead

Payment

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| account token | account\_token | string | The tokenized account information (ex: credit card) from the external payment provider. Only applies to payment methods of "CreditCard" and "DirectDebit". |
| BBPS configuration ID | bbps\_configuration\_id | string | The BBPS configuration ID. Only applies to payment methods of "CreditCard" and "DirectDebit". |
| BBPS transaction ID | bbps\_transaction\_id | string | The BBPS transaction ID. Only applies to payment methods of "CreditCard" and "DirectDebit". |
| day | check\_date.d | integer | The day in the fuzzy date. |
| month | check\_date.m | integer | The month in the fuzzy date. |
| year | check\_date.y | integer | The year in the fuzzy date. |
| check number | check\_number | string | The check number. Only applies to payment method of "PersonalCheck". |
| checkout transaction ID | checkout\_transaction\_id | string | The checkout transaction ID. Only applies to payment methods of "CreditCard" and "DirectDebit". |
| payment method | payment\_method | string | The payment method. Available values are listed below. |
| reference | reference | string | The reference. Only applies to payment method of "Other". |
| day | reference\_date.d | integer | The day in the fuzzy date. |
| month | reference\_date.m | integer | The month in the fuzzy date. |
| year | reference\_date.y | integer | The year in the fuzzy date. |

### GiftApi.SoftCreditRead

Soft credit

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The system record ID of the soft credit. |
| value | amount.value | double | The amount of the soft credit. |
| constituent ID | constituent\_id | string | The system record ID of the constituent associated with the soft credit. |
| gift ID | gift\_id | string | The system record ID of the gift associated with the soft credit. |

### Gift2Api.PledgeInstallment

Represents the installment object.

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The system record ID of the installment. |
| date | date | date-time | The date of the installment. |
| year | year | integer | The year of the installment date. |
| value | amount.value | double | The amount of the installment. |
| balance | balance | double | The balance of the installment. |
| remaining pledge balance | remaining\_pledge\_balance | double | The remaining balance of the pledge. |
| sequence | sequence | integer | The installment display order sequence. |

### Gift2Api.PledgeInstallmentCollection

Installments

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| Start date | start\_date | date-time | The date that the gift schedule starts. |
| Frequency | frequency | string | The frequency of the gift schedule. |
| Concurrency token | concurrency\_token | string | A concurrency token. |
| installments | installments | array of Gift2Api.PledgeInstallment | The set of items included in the response. This may be a subset of the items in the collection. |

### Gift2Api.PledgePayment

Represents the pledge payment object.

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| installment ID | installment\_id | string | The system record ID of the installment being paid. |
| gift ID | payment\_gift\_id | string | The system record ID of the payment gift. |
| value | amount\_applied.value | double | The amount applied to the installment. |

### Gift2Api.PledgePaymentCollection

Payments

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| pledge\_payments | pledge\_payments | array of Gift2Api.PledgePayment | The set of items included in the response. This may be a subset of the items in the collection. |

### GiftBatchApi.ApiCollectionOfGiftBatch

Gift batches

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| Count | count | integer | The total number of gift batches in the response. |
| value | value | array of GiftBatchApi.GiftBatch | The set of items included in the response. |

### GiftBatchApi.CreatedBatch

Created gift batch

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | batch\_id | string | The system record ID of the newly created gift batch. |

### GiftBatchApi.GiftBatch

Represents the gift batch object

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The system record ID of the batch. |
| description | batch\_description | string | The batch description. |
| batch number | batch\_number | string | The batch number |
| projected number | projected\_number\_of\_gifts | integer | The projected number of gifts in the batch. |
| actual number | number\_of\_gifts | integer | The actual number of gifts in the batch. |
| projected amount | projected\_amount | double | The projected value of gifts in the batch. |
| actual amount | actual\_amount | double | The actual value of gifts in the batch. |
| has exceptions? | has\_exceptions | boolean | Does the batch have exceptions? |
| approved? | is\_approved | boolean | Is the batch approved? |
| Created by | created\_by | string | The name of the user who created the batch. |
| Created on | created\_on | date-time | The date when the batch was created. |

### NXTDataIntegrationApi.CreatedGiftNote

Created note

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The ID of the newly created note. |

### NXTDataIntegrationApi.CreatedGiftTribute

Created gift tribute

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The ID of the newly created gift tribute. |

### NXTDataIntegrationApi.CreatedTaxDeclaration

Created tax declaration

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The ID of the newly created tax declaration. |

### NXTDataIntegrationApi.GiftIdMap

Gift ID map

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | system\_record\_id | integer | The gift system record ID. |

### NXTDataIntegrationApi.GiftNote

Note

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| Gift ID | gift\_id | integer | The system record ID of the gift associated with the note. |
| Type | type | string | The note type. |
| day | date.d | integer | The day in the fuzzy date. |
| month | date.m | integer | The month in the fuzzy date. |
| year | date.y | integer | The year in the fuzzy date. |
| Summary | summary | string | The note summary. |
| Note | text | string | The note text. |
| Author | author | string | The author of the note. |

### NXTDataIntegrationApi.GiftNoteCollection

Gift notes

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| Count | count | integer | The number of items available for retrieval into the collection after applying any request parameters. The limit and offset parameters do not affect the count, but to facilitate paging, they may affect the number of items in the value result set. |
| value | value | array of NXTDataIntegrationApi.GiftNote | The set of items included in the response. This may be a subset of the items in the collection. |

### NXTDataIntegrationApi.GiftTribute

Gift tribute

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | integer | The system record ID of the gift tribute. |
| Gift ID | gift\_id | integer | The system record ID of the gift. |
| Tribute ID | tribute\_id | integer | The system record ID of the tribute. |
| Tribute type | tribute\_type | integer | The tribute type. |
| Acknowledge status | acknowledge | string | The gift tribute acknowledge status. |
| Sequence | sequence | integer | The gift tribute sequence. |

### NXTDataIntegrationApi.GiftTributeAcknowledgee

A gift tribute acknowledgee record in Raiser's Edge.

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | integer | The system record ID of the gift tribute acknowledgee. |
| Gift tribute ID | gift\_tribute\_id | integer | The system record ID of the gift tribute. |
| Is self acknowledge? | self\_acknowledge | boolean | Is this acknowledgee a self-acknowledge? |
| Relationships ID | relationships\_id | integer | The system record ID of the relationship for the acknowledgee. |
| Letter | letter | integer | The letter sent to the acknowledgee. |
| Letter date | letter\_date | date-time | The date on which the letter was sent. |

### NXTDataIntegrationApi.GiftTributeAcknowledgeeCollection

Gift tribute acknowledgees

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| Count | count | integer | The number of items available for retrieval into the collection after applying any request parameters. The limit and offset parameters do not affect the count, but to facilitate paging, they may affect the number of items in the value result set. |
| value | value | array of NXTDataIntegrationApi.GiftTributeAcknowledgee | The set of items included in the response. This may be a subset of the items in the collection. |

### NXTDataIntegrationApi.GiftTributeCollection

Gift tributes

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| Count | count | integer | The number of items available for retrieval into the collection after applying any request parameters. The limit and offset parameters do not affect the count, but to facilitate paging, they may affect the number of items in the value result set. |
| value | value | array of NXTDataIntegrationApi.GiftTribute | The set of items included in the response. This may be a subset of the items in the collection. |

### NXTDataIntegrationApi.TaxDeclaration

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | declaration\_id | integer |  |
| Declaration starts | declaration\_starts | date-time | The date the tax declaration starts. |
| Declaration ends | declaration\_ends | date-time | The date the tax declaration ends. |
| Declaration made | declaration\_made | date-time | The date the tax declaration was made. |
| Indicator ID | declaration\_indicator\_id | integer | The declaration indicator ID. |
| Indicator | declaration\_indicator | string | The declaration indicator. |
| Source ID | declaration\_source\_id | integer | The declaration source ID. |
| Source | declaration\_source | string | The declaration source. |
| Confirmation sent | confirmation\_sent | date-time | The date the confirmation was sent. |
| Confirmation returned | confirmation\_returned | date-time | The date the confirmation was returned. |
| Pays tax | constituent\_pays\_tax | string | Indicates whether the constituent pays tax. |
| Status ID | tax\_payer\_status\_id | integer | The tax payer status ID. |
| Status | tax\_payer\_status | string | The tax payer status. |
| Comments | tax\_notes | string | Comments for the tax declaration. |
| Sequence | sequence | integer | The numeric sequence associated with the tax declaration. |

### NXTDataIntegrationApi.TaxDeclarationCollection

Tax declarations

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| Count | count | integer | The number of items available for retrieval into the collection after applying any request parameters. The limit and offset parameters do not affect the count, but to facilitate paging, they may affect the number of items in the value result set. |
| value | value | array of NXTDataIntegrationApi.TaxDeclaration | The set of items included in the response. This may be a subset of the items in the collection. |