---
layout: Reference
title: Blackbaud Raisers Edge NXT Fundraising - Connectors | Microsoft Learn
canonicalUrl: https://learn.microsoft.com/en-us/connectors/blackbaudfundraising/
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
document_id: c194c3f4-6dce-c8d1-bf53-d546e8b44475
document_version_independent_id: c194c3f4-6dce-c8d1-bf53-d546e8b44475
updated_at: 2025-04-24T01:00:00.0000000Z
original_content_git_url: https://github.com/MicrosoftDocs/BusinessApplicationPlatform-Connectors/blob/live/docs/blackbaudfundraising/index.yml
gitcommit: https://github.com/MicrosoftDocs/BusinessApplicationPlatform-Connectors/blob/63f1cb79629cd01a13220e8a88319b4e7f88925c/docs/blackbaudfundraising/index.yml
git_commit_id: 63f1cb79629cd01a13220e8a88319b4e7f88925c
site_name: Docs
depot_name: MSDN.businessplatform-connectors
page_type: powerconnector
toc_rel: ../toc.json
feedback_product_url: ''
feedback_help_link_type: ''
feedback_help_link_url: ''
asset_id: blackbaudfundraising/index
moniker_range_name: 
monikers: []
item_type: Content
source_path: docs/blackbaudfundraising/index.yml
cmProducts:
- https://microsoft-devrel.poolparty.biz/DevRelOfferingOntology/c0439c36-80e3-415f-8e4c-6951e3f1b136
- https://authoring-docs-microsoft.poolparty.biz/devrel/5287f575-02f0-405f-92b7-800456526b0c
- https://authoring-docs-microsoft.poolparty.biz/devrel/68cb9039-df60-49b0-8ef8-89ad96497f63
spProducts:
- https://microsoft-devrel.poolparty.biz/DevRelOfferingOntology/2812d699-d85f-4a7f-839d-44e218b35d24
- https://authoring-docs-microsoft.poolparty.biz/devrel/06e86142-34c2-4b94-ab9c-9477c21f7152
- https://authoring-docs-microsoft.poolparty.biz/devrel/725b6df3-93e8-472d-834e-e7e0d2953d35
platformId: 98ee1c89-3e08-6fe8-7607-11452d3f8e6d
---

# Blackbaud Raisers Edge NXT Fundraising

![](https://conn-afd-prod-endpoint-bmc9bqahasf3grgk.b01.azurefd.net/releases/v1.0.1732/1.0.1732.4070/blackbaudfundraising/icon.png)
Blackbaud Raiser's Edge NXT is a comprehensive cloud-based fundraising and donor management software solution built specifically for nonprofits and the entire social good community. Use the Fundraising connector to manage campaigns, funds, appeals, and packages.

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

This connector is built on top of Blackbaud's [SKY API](https://developer.blackbaud.com/skyapi), and provides operations to help manage fundraising entities found within The Raiser's Edge NXT, including:

- Campaigns
- Funds
- Appeals
- Packages
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

| Create a campaign | Creates a new campaign. |
| --- | --- |
| Create a campaign attachment | Creates a new campaign attachment. |
| Create a campaign custom field | Creates a new campaign custom field. |
| Create a constituent appeal | Creates a new constituent appeal. |
| Create a fund | Creates a new fund. |
| Create a fund attachment | Creates a new fund attachment. |
| Create a fund custom field | Creates a new fund custom field. |
| Create an appeal | Creates a new appeal. |
| Create an appeal attachment | Creates a new appeal attachment. |
| Create an appeal custom field | Creates a new appeal custom field. |
| Get a campaign | Returns information about a campaign. |
| Get a fund | Returns information about a fund. |
| Get a package | Returns information about a package. |
| Get an appeal | Returns information about an appeal. |
| List appeal attachments | Lists the attachments for an appeal. |
| List appeal custom fields | Lists the custom fields for an appeal. |
| List appeals | Returns a list of appeals. |
| List campaign attachments | Lists the attachments for an campaign. |
| List campaign custom fields | Lists the custom fields for a campaign. |
| List campaigns | Returns a list of campaigns. |
| List constituent appeals | Lists the appeals for a constituent. |
| List constituent fund relationships | Lists the fund relationships for a constituent. |
| List fund attachments | Lists the attachments for a fund. |
| List fund constituent relationships | Lists the constituent relationships for a fund. |
| List fund custom fields | Lists the custom fields for a fund. |
| List funds | Returns a list of funds. |
| List packages | Returns a list of packages. |
| Update a campaign | Updates a campaign. |
| Update a campaign attachment | Updates a campaign attachment. |
| Update a campaign custom field | Updates a campaign custom field. |
| Update a constituent appeal | Updates a constituent appeal. |
| Update a fund | Updates a fund. |
| Update a fund attachment | Updates a fund attachment. |
| Update a fund custom field | Updates a fund custom field. |
| Update an appeal | Updates an appeal. |
| Update an appeal attachment | Updates an appeal attachment. |
| Update an appeal custom field | Updates an appeal custom field. |

### Create a campaign

- Operation ID:
    - CreateCampaign

Creates a new campaign.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Lookup ID | campaign\_id | True | string | The user-defined identifier for the campaign. |
| Description | description | True | string | The campaign description. |
| Start date | start\_date |  | date | The start date for the campaign (ex: '2005-09-18'). |
| End date | end\_date |  | date | The end date for the campaign (ex: '2005-09-18'). |
| Category | campaign\_category\_id |  | integer | The campaign category. |
| Goal | goal |  | double | The target amount to raise through the campaign. |
| Notes | notes |  | string | The notes associated with the campaign. |
| Inactive? | inactive |  | boolean | Is the campaign inactive (meaning, the current date is after any start date and before any end date)? |
| Default fund ID | default\_fund\_id |  | integer | The ID for the default fund associated with the campaign. |

#### Returns

Created campaign

- Body
    - NXTDataIntegrationApi.CreatedCampaign

### Create a campaign attachment

- Operation ID:
    - CreateCampaignAttachment

Creates a new campaign attachment.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Campaign ID | parent\_id | True | string | The system record ID of the campaign associated with the attachment. |
| Type | type | True | string | The attachment type. Physical attachments are uploaded files such as images, PDFs, or Word documents that are saved locally or on the network. They are stored and managed in the system. Link attachments are links to files such as images, blog posts, or YouTube videos that are online or in a cloud storage account. They are stored and managed externally. |
| Name | name |  | string | The name of the attachment. Character limit: 150. |
| Date | date |  | date-time | The date of the attachment (ex: '2020-09-18T04:13:56Z'). This field defaults to the current date and time if not supplied. |
| URL | url |  | string | The URL for the attachment. This is required for link attachments and not applicable for physical attachments. |
| File name | file\_name |  | string | The name of the file. Character limit: 36. For physical attachments only. |
| File ID | file\_id |  | string | The identifier of the file. Character limit: 36. For physical attachments only. |
| Thumbnail ID | thumbnail\_id |  | string | The identifier of the thumbnail. Character limit: 36. For physical attachments only. |
| Tags | tags |  | array of string | The tags associated with the attachment. |

#### Returns

Created campaign attachment

- Body
    - FundraisingApi.CreatedCampaignAttachment

### Create a campaign custom field

- Operation ID:
    - CreateCampaignCustomField

Creates a new campaign custom field.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| body | body | True | dynamic | An object that represents the custom field to create. |

#### Returns

Created campaign custom field

- Body
    - FundraisingApi.CreatedCampaignCustomField

### Create a constituent appeal

- Operation ID:
    - CreateConstituentAppeal

Creates a new constituent appeal.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Constituent ID | constituent\_id | True | integer | The system record ID of the constituent associated with the constituent appeal. |
| Appeal description | appeal\_description | True | string | The appeal description; used to look up the appeal record ID. |
| Package description | package\_description |  | string | The package description; used to look up the package record ID. |
| Date | appeal\_date |  | date | The date for the constituent appeal (ex: '2005-09-18'). |
| Response | response\_description |  | string | The long description of the response for the constituent appeal. |
| Marketing segment | marketing\_segment |  | string | The marketing segment associated with the constituent appeal. |
| Marketing source code | marketing\_source\_code |  | string | The marketing source code associated with the constituent appeal. |
| Mailing ID | mailing\_id |  | integer | The mailing ID of the constituent appeal. |
| Finder number | market\_finder\_number |  | string | The market finder number associated with the constituent appeal. |
| Comments | comments |  | string | The comments associated with the constituent appeal. |
| Import ID | import\_id |  | string | The import ID of the constituent appeal. |

#### Returns

Created constituent appeal

- Body
    - NXTDataIntegrationApi.CreatedConstituentAppeal

### Create a fund

- Operation ID:
    - CreateFund

Creates a new fund.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Lookup ID | fund\_id | True | string | The user-defined identifier for the fund. |
| Description | description | True | string | The fund description. |
| Start date | start\_date |  | date | The start date for the fund (ex: '2005-09-18'). |
| End date | end\_date |  | date | The end date for the fund (ex: '2005-09-18'). |
| Category | fund\_category\_id |  | integer | The fund category. |
| Type | fund\_type\_id |  | integer | The fund type. |
| Goal | goal |  | double | The target amount to raise for the fund. |
| Notes | notes |  | string | The notes associated with the fund. |
| Restricted? | restricted |  | boolean | Is the fund restricted to specific users? |
| Inactive? | inactive |  | boolean | Is the fund inactive (meaning, the current date is after any start date and before any end date)? |
| Campaign ID | campaign\_id |  | integer | The ID for a campaign associated with the fund. |
| Default appeal ID | default\_appeal\_id |  | integer | The ID for the default appeal associated with the fund. |

#### Returns

Created fund

- Body
    - NXTDataIntegrationApi.CreatedFund

### Create a fund attachment

- Operation ID:
    - CreateFundAttachment

Creates a new fund attachment.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Fund ID | parent\_id | True | string | The system record ID of the fund associated with the attachment. |
| Type | type | True | string | The attachment type. Physical attachments are uploaded files such as images, PDFs, or Word documents that are saved locally or on the network. They are stored and managed in the system. Link attachments are links to files such as images, blog posts, or YouTube videos that are online or in a cloud storage account. They are stored and managed externally. |
| Name | name |  | string | The name of the attachment. Character limit: 150. |
| Date | date |  | date-time | The date of the attachment (ex: '2020-09-18T04:13:56Z'). This field defaults to the current date and time if not supplied. |
| URL | url |  | string | The URL for the attachment. This is required for link attachments and not applicable for physical attachments. |
| File name | file\_name |  | string | The name of the file. Character limit: 36. For physical attachments only. |
| File ID | file\_id |  | string | The identifier of the file. Character limit: 36. For physical attachments only. |
| Thumbnail ID | thumbnail\_id |  | string | The identifier of the thumbnail. Character limit: 36. For physical attachments only. |
| Tags | tags |  | array of string | The tags associated with the attachment. |

#### Returns

Created fund attachment

- Body
    - FundraisingApi.CreatedFundAttachment

### Create a fund custom field

- Operation ID:
    - CreateFundCustomField

Creates a new fund custom field.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| body | body | True | dynamic | An object that represents the custom field to create. |

#### Returns

Created fund custom field

- Body
    - FundraisingApi.CreatedFundCustomField

### Create an appeal

- Operation ID:
    - CreateAppeal

Creates a new appeal.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Lookup ID | appeal\_id | True | string | The user-defined identifier for the appeal. |
| Description | description | True | string | The appeal description. |
| Start date | start\_date |  | date | The start date for the appeal (ex: '2005-09-18'). |
| End date | end\_date |  | date | The end date for the appeal (ex: '2005-09-18'). |
| Category | appeal\_category\_id |  | integer | The appeal category. |
| Goal | goal |  | double | The target amount to raise through the appeal. |
| Default gift amount | default\_gift\_amount |  | double | The monetary amount of the default gift. This property defaults to 0.00 if no amount is specified. |
| Number solicited | number\_solicited |  | integer | The number of constituents solicited in the appeal. |
| Notes | notes |  | string | The notes associated with the appeal. |
| Default campaign ID | campaign\_id |  | integer | The ID for a campaign associated with the appeal. |
| Default fund ID | default\_fund\_id |  | integer | The ID for the default fund associated with the appeal. |
| Inactive? | inactive |  | boolean | Is the appeal inactive (meaning, the current date is after any start date and before any end date)? |

#### Returns

Created appeal

- Body
    - NXTDataIntegrationApi.CreatedAppeal

### Create an appeal attachment

- Operation ID:
    - CreateAppealAttachment

Creates a new appeal attachment.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Appeal ID | parent\_id | True | string | The system record ID of the appeal associated with the attachment. |
| Type | type | True | string | The attachment type. Physical attachments are uploaded files such as images, PDFs, or Word documents that are saved locally or on the network. They are stored and managed in the system. Link attachments are links to files such as images, blog posts, or YouTube videos that are online or in a cloud storage account. They are stored and managed externally. |
| Name | name |  | string | The name of the attachment. Character limit: 150. |
| Date | date |  | date-time | The date of the attachment (ex: '2020-09-18T04:13:56Z'). This field defaults to the current date and time if not supplied. |
| URL | url |  | string | The URL for the attachment. This is required for link attachments and not applicable for physical attachments. |
| File name | file\_name |  | string | The name of the file. Character limit: 36. For physical attachments only. |
| File ID | file\_id |  | string | The identifier of the file. Character limit: 36. For physical attachments only. |
| Thumbnail ID | thumbnail\_id |  | string | The identifier of the thumbnail. Character limit: 36. For physical attachments only. |
| Tags | tags |  | array of string | The tags associated with the attachment. |

#### Returns

Created appeal attachment

- Body
    - FundraisingApi.CreatedAppealAttachment

### Create an appeal custom field

- Operation ID:
    - CreateAppealCustomField

Creates a new appeal custom field.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| body | body | True | dynamic | An object that represents the custom field to create. |

#### Returns

Created appeal custom field

- Body
    - FundraisingApi.CreatedAppealCustomField

### Get a campaign

- Operation ID:
    - GetCampaign

Returns information about a campaign.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Campaign ID | campaign\_id | True | string | The system record ID of the campaign to get. |

#### Returns

Campaign

- Body
    - FundraisingApi.CampaignRead

### Get a fund

- Operation ID:
    - GetFund

Returns information about a fund.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Fund ID | fund\_id | True | string | The system record ID of the fund to get. |

#### Returns

Fund

- Body
    - FundraisingApi.FundRead

### Get a package

- Operation ID:
    - GetPackage

Returns information about a package.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Package ID | package\_id | True | string | The system record ID of the package to get. |

#### Returns

Package

- Body
    - FundraisingApi.PackageRead

### Get an appeal

- Operation ID:
    - GetAppeal

Returns information about an appeal.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Appeal ID | appeal\_id | True | string | The system record ID of the appeal to get. |

#### Returns

Appeal

- Body
    - FundraisingApi.AppealRead

### List appeal attachments

- Operation ID:
    - ListAppealAttachments

Lists the attachments for an appeal.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Appeal ID | appeal\_id | True | string | The system record ID of the appeal. |

#### Returns

Attachments

- Body
    - FundraisingApi.ApiCollectionOfAppealAttachmentRead

### List appeal custom fields

- Operation ID:
    - ListAppealCustomFields

Lists the custom fields for an appeal.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Appeal ID | appeal\_id | True | string | The system record ID of the appeal. |

#### Returns

Custom fields

- Body
    - FundraisingApi.ApiCollectionOfAppealCustomFieldRead

### List appeals

- Operation ID:
    - ListAppeals

Returns a list of appeals.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Limit | limit |  | integer | Represents the number of records to return. The default is 500. The maximum is 5000. |
| Offset | offset |  | integer | Represents the number of records to skip. For use with pagination. |
| Include inactive? | include\_inactive |  | boolean | Include inactive appeals? |
| Added on or after | date\_added |  | date-time | Filter the results to appeals created on or after the specified date (ex: '2020-09-18T04:13:56Z'). |
| Modified on or after | last\_modified |  | date-time | Filter the results to appeals modified on or after the specified date (ex: '2020-09-18T04:13:56Z'). |

#### Returns

Appeals

- Body
    - FundraisingApi.ApiCollectionOfAppealRead

### List campaign attachments

- Operation ID:
    - ListCampaignAttachments

Lists the attachments for an campaign.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Campaign ID | campaign\_id | True | string | The system record ID of the campaign. |

#### Returns

Attachments

- Body
    - FundraisingApi.ApiCollectionOfCampaignAttachmentRead

### List campaign custom fields

- Operation ID:
    - ListCampaignCustomFields

Lists the custom fields for a campaign.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Campaign ID | campaign\_id | True | string | The system record ID of the campaign. |

#### Returns

Custom fields

- Body
    - FundraisingApi.ApiCollectionOfCampaignCustomFieldRead

### List campaigns

- Operation ID:
    - ListCampaigns

Returns a list of campaigns.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Limit | limit |  | integer | Represents the number of records to return. The default is 500. The maximum is 5000. |
| Offset | offset |  | integer | Represents the number of records to skip. For use with pagination. |
| Include inactive? | include\_inactive |  | boolean | Include inactive campaigns? |
| Added on or after | date\_added |  | date-time | Filter the results to campaigns created on or after the specified date (ex: '2020-09-18T04:13:56Z'). |
| Modified on or after | last\_modified |  | date-time | Filter the results to campaigns modified on or after the specified date (ex: '2020-09-18T04:13:56Z'). |

#### Returns

Campaigns

- Body
    - FundraisingApi.ApiCollectionOfCampaignRead

### List constituent appeals

- Operation ID:
    - ListConstituentAppeals

Lists the appeals for a constituent.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Constituent ID | constituent\_id | True | string | The system record ID of the constituent. |

#### Returns

Constituent appeals

- Body
    - ConstituentApi.ApiCollectionOfConstituentAppealRead

### List constituent fund relationships

- Operation ID:
    - ListConstituentFundRelationships

Lists the fund relationships for a constituent.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Constituent ID | constituentId | True | integer | The system record ID of the constituent. |
| Limit | limit |  | integer | Represents the number of records to return. |
| Offset | offset |  | integer | Represents the number of records to skip. For use with pagination. |

#### Returns

Fund relationships

- Body
    - NXTDataIntegrationApi.FundRelationshipCollection

### List fund attachments

- Operation ID:
    - ListFundAttachments

Lists the attachments for a fund.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Fund ID | fund\_id | True | string | The system record ID of the fund. |

#### Returns

Attachments

- Body
    - FundraisingApi.ApiCollectionOfFundAttachmentRead

### List fund constituent relationships

- Operation ID:
    - ListFundConstituentRelationships

Lists the constituent relationships for a fund.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Fund ID | fundId | True | integer | The system record ID of the fund. |
| Limit | limit |  | integer | Represents the number of records to return. |
| Offset | offset |  | integer | Represents the number of records to skip. For use with pagination. |

#### Returns

Constituent relationships

- Body
    - NXTDataIntegrationApi.ConstituentRelationshipCollection

### List fund custom fields

- Operation ID:
    - ListFundCustomFields

Lists the custom fields for a fund.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Fund ID | fund\_id | True | string | The system record ID of the fund. |

#### Returns

Custom fields

- Body
    - FundraisingApi.ApiCollectionOfFundCustomFieldRead

### List funds

- Operation ID:
    - ListFunds

Returns a list of funds.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Limit | limit |  | integer | Represents the number of records to return. The default is 500. The maximum is 5000. |
| Offset | offset |  | integer | Represents the number of records to skip. For use with pagination. |
| Include inactive? | include\_inactive |  | boolean | Include inactive funds? |
| Added on or after | date\_added |  | date-time | Filter the results to funds created on or after the specified date (ex: '2020-09-18T04:13:56Z'). |
| Modified on or after | last\_modified |  | date-time | Filter the results to funds modified on or after the specified date (ex: '2020-09-18T04:13:56Z'). |

#### Returns

Funds

- Body
    - FundraisingApi.ApiCollectionOfFundRead

### List packages

- Operation ID:
    - ListPackages

Returns a list of packages.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Appeal ID | appeal\_id |  | string | Represents a comma-separated list of appeal system record IDs to filter the results. For example, "506,918" returns only packages for appeal 506 or appeal 918. |
| Limit | limit |  | integer | Represents the number of records to return. The default is 500. The maximum is 5000. |
| Offset | offset |  | integer | Represents the number of records to skip. For use with pagination. |
| Include inactive? | include\_inactive |  | boolean | Include inactive packages? |
| Added on or after | date\_added |  | date-time | Filter the results to packages created on or after the specified date (ex: '2020-09-18T04:13:56Z'). |
| Modified on or after | last\_modified |  | date-time | Filter the results to packages modified on or after the specified date (ex: '2020-09-18T04:13:56Z'). |

#### Returns

Packages

- Body
    - FundraisingApi.ApiCollectionOfPackageRead

### Update a campaign

- Operation ID:
    - EditCampaign

Updates a campaign.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Campaign ID | id | True | integer | The system record ID of the campaign to update. |
| Lookup ID | campaign\_id |  | string | The user-defined identifier for the campaign. |
| Description | description |  | string | The campaign description. |
| Start date | start\_date |  | date | The start date for the campaign (ex: '2005-09-18'). |
| End date | end\_date |  | date | The end date for the campaign (ex: '2005-09-18'). |
| Category | campaign\_category\_id |  | integer | The campaign category. |
| Goal | goal |  | double | The target amount to raise through the campaign. |
| Notes | notes |  | string | The notes associated with the campaign. |
| Inactive? | inactive |  | boolean | Is the campaign inactive (meaning, the current date is after any start date and before any end date)? |
| Default fund ID | default\_fund\_id |  | integer | The ID for the default fund associated with the campaign. |

### Update a campaign attachment

- Operation ID:
    - EditCampaignAttachment

Updates a campaign attachment.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Attachment ID | attachment\_id | True | string | The system record ID of the attachment to update. |
| Name | name |  | string | The name of the attachment. Character limit: 150. |
| Date | date |  | date-time | The date of the attachment (ex: '2020-09-18T04:13:56Z'). |
| URL | url |  | string | The URL for the attachment. This is required for link attachments and not applicable for physical attachments. |
| Tags | tags |  | array of string | The tags associated with the attachment. |

### Update a campaign custom field

- Operation ID:
    - EditCampaignCustomField

Updates a campaign custom field.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Custom field ID | custom\_field\_id | True | string | The system record ID of the custom field to update. |
| body | body | True | dynamic | An object that represents the properties of the custom field to update. |

### Update a constituent appeal

- Operation ID:
    - EditConstituentAppeal

Updates a constituent appeal.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Constitutent appeal ID | id | True | integer | The system record ID of the constituent appeal to update. |
| Appeal description | appeal\_description |  | string | The appeal description; used to look up the appeal record ID. |
| Package description | package\_description |  | string | The package description; used to look up the package record ID. |
| Date | appeal\_date |  | date | The date for the constituent appeal (ex: '2005-09-18'). |
| Response | response\_description |  | string | The long description of the response for the constituent appeal. |
| Marketing segment | marketing\_segment |  | string | The marketing segment associated with the constituent appeal. |
| Marketing source code | marketing\_source\_code |  | string | The marketing source code associated with the constituent appeal. |
| Mailing ID | mailing\_id |  | integer | The mailing ID of the constituent appeal. |
| Finder number | market\_finder\_number |  | string | The market finder number associated with the constituent appeal. |
| Comments | comments |  | string | The comments associated with the constituent appeal. |

### Update a fund

- Operation ID:
    - EditFund

Updates a fund.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Fund ID | id | True | integer | The system record ID of the fund to update. |
| Lookup ID | fund\_id |  | string | The user-defined identifier for the fund. |
| Description | description |  | string | The fund description. |
| Start date | start\_date |  | date | The start date for the fund (ex: '2005-09-18'). |
| End date | end\_date |  | date | The end date for the fund (ex: '2005-09-18'). |
| Category | fund\_category\_id |  | integer | The fund category. |
| Type | fund\_type\_id |  | integer | The fund type. |
| Goal | goal |  | double | The target amount to raise for the fund. |
| Notes | notes |  | string | The notes associated with the fund. |
| Restricted? | restricted |  | boolean | Is the fund restricted to specific users? |
| Inactive? | inactive |  | boolean | Is the fund inactive (meaning, the current date is after any start date and before any end date)? |
| Campaign ID | campaign\_id |  | integer | The ID for a campaign associated with the fund. |
| Default appeal ID | default\_appeal\_id |  | integer | The ID for the default appeal associated with the fund. |

### Update a fund attachment

- Operation ID:
    - EditFundAttachment

Updates a fund attachment.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Attachment ID | attachment\_id | True | string | The system record ID of the attachment to update. |
| Name | name |  | string | The name of the attachment. Character limit: 150. |
| Date | date |  | date-time | The date of the attachment (ex: '2020-09-18T04:13:56Z'). |
| URL | url |  | string | The URL for the attachment. This is required for link attachments and not applicable for physical attachments. |
| Tags | tags |  | array of string | The tags associated with the attachment. |

### Update a fund custom field

- Operation ID:
    - EditFundCustomField

Updates a fund custom field.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Custom field ID | custom\_field\_id | True | string | The system record ID of the custom field to update. |
| body | body | True | dynamic | An object that represents the properties of the custom field to update. |

### Update an appeal

- Operation ID:
    - EditAppeal

Updates an appeal.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Appeal ID | id | True | integer | The system record ID of the appeal to update. |
| Lookup ID | appeal\_id |  | string | The user-defined identifier for the appeal. |
| Description | description |  | string | The appeal description. |
| Start date | start\_date |  | date | The start date for the appeal (ex: '2005-09-18'). |
| End date | end\_date |  | date | The end date for the appeal (ex: '2005-09-18'). |
| Category | appeal\_category\_id |  | integer | The appeal category. |
| Goal | goal |  | double | The target amount to raise through the appeal. |
| Default gift amount | default\_gift\_amount |  | double | The monetary amount of the default gift. This property defaults to 0.00 if no amount is specified. |
| Number solicited | number\_solicited |  | integer | The number of constituents solicited in the appeal. |
| Notes | notes |  | string | The notes associated with the appeal. |
| Default campaign ID | campaign\_id |  | integer | The ID for a campaign associated with the appeal. |
| Default fund ID | default\_fund\_id |  | integer | The ID for the default fund associated with the appeal. |
| Inactive? | inactive |  | boolean | Is the appeal inactive (meaning, the current date is after any start date and before any end date)? |

### Update an appeal attachment

- Operation ID:
    - EditAppealAttachment

Updates an appeal attachment.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Attachment ID | attachment\_id | True | string | The system record ID of the attachment to update. |
| Name | name |  | string | The name of the attachment. Character limit: 150. |
| Date | date |  | date-time | The date of the attachment (ex: '2020-09-18T04:13:56Z'). |
| URL | url |  | string | The URL for the attachment. This is required for link attachments and not applicable for physical attachments. |
| Tags | tags |  | array of string | The tags associated with the attachment. |

### Update an appeal custom field

- Operation ID:
    - EditAppealCustomField

Updates an appeal custom field.

#### Parameters

| Name | Key | Required | Type | Description |
| --- | --- | --- | --- | --- |
| Custom field ID | custom\_field\_id | True | string | The system record ID of the custom field to update. |
| body | body | True | dynamic | An object that represents the properties of the custom field to update. |

## Definitions

### ConstituentApi.ApiCollectionOfConstituentAppealRead

Constituent appeals

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| Count | count | integer | The number of items available for retrieval into the collection after applying any request parameters. The limit and offset parameters do not affect the count, but to facilitate paging, they may affect the number of items in the value result set. |
| value | value | array of ConstituentApi.ConstituentAppealRead | The set of items included in the response. This may be a subset of the items in the collection. |

### ConstituentApi.ConstituentAppealRead

Constituent appeal

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The system record ID of the constituent appeal. |
| ID | appeal.id | string | The system record ID of the appeal. |
| description | appeal.description | string | The appeal description. |
| ID | package.id | string | The system record ID of the package. |
| description | package.description | string | The package description. |
| Date | date | date-time | The constituent appeal date. |
| Response | response | string | The response for the constituent appeal. |
| Marketing segment | marketing\_segment | string | The marketing segment for the constituent appeal. |
| Marketing source code | marketing\_source\_code | string | The marketing source code for the constituent appeal. |
| Mailing ID | mailing\_id | string | The user-defined mailing identifier for the constituent appeal. |
| Finder number | finder\_number | string | The marketing finder number for the constituent appeal. |
| Comments | comments | string | User comments for the constituent appeal. |

### FundraisingApi.ApiCollectionOfAppealAttachmentRead

Attachments

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| Count | count | integer | The number of items available for retrieval into the collection after applying any request parameters. The limit and offset parameters do not affect the count, but to facilitate paging, they may affect the number of items in the value result set. |
| value | value | array of FundraisingApi.AppealAttachmentRead | The set of items included in the response. This may be a subset of the items in the collection. |

### FundraisingApi.ApiCollectionOfAppealCustomFieldRead

Custom fields

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| Count | count | integer | The number of items available for retrieval into the collection after applying any request parameters. The limit and offset parameters do not affect the count, but to facilitate paging, they may affect the number of items in the value result set. |
| value | value | array of FundraisingApi.AppealCustomFieldRead | The set of items included in the response. This may be a subset of the items in the collection. |

### FundraisingApi.ApiCollectionOfAppealRead

Appeals

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| Count | count | integer | The number of items available for retrieval into the collection after applying any request parameters. The limit and offset parameters do not affect the count, but to facilitate paging, they may affect the number of items in the value result set. |
| value | value | array of FundraisingApi.AppealRead | The set of items included in the response. This may be a subset of the items in the collection. |

### FundraisingApi.ApiCollectionOfCampaignAttachmentRead

Attachments

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| Count | count | integer | The number of items available for retrieval into the collection after applying any request parameters. The limit and offset parameters do not affect the count, but to facilitate paging, they may affect the number of items in the value result set. |
| value | value | array of FundraisingApi.CampaignAttachmentRead | The set of items included in the response. This may be a subset of the items in the collection. |

### FundraisingApi.ApiCollectionOfCampaignCustomFieldRead

Custom fields

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| Count | count | integer | The number of items available for retrieval into the collection after applying any request parameters. The limit and offset parameters do not affect the count, but to facilitate paging, they may affect the number of items in the value result set. |
| value | value | array of FundraisingApi.CampaignCustomFieldRead | The set of items included in the response. This may be a subset of the items in the collection. |

### FundraisingApi.ApiCollectionOfCampaignRead

Campaigns

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| Count | count | integer | The number of items available for retrieval into the collection after applying any request parameters. The limit and offset parameters do not affect the count, but to facilitate paging, they may affect the number of items in the value result set. |
| value | value | array of FundraisingApi.CampaignRead | The set of items included in the response. This may be a subset of the items in the collection. |

### FundraisingApi.ApiCollectionOfFundAttachmentRead

Attachments

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| Count | count | integer | The number of items available for retrieval into the collection after applying any request parameters. The limit and offset parameters do not affect the count, but to facilitate paging, they may affect the number of items in the value result set. |
| value | value | array of FundraisingApi.FundAttachmentRead | The set of items included in the response. This may be a subset of the items in the collection. |

### FundraisingApi.ApiCollectionOfFundCustomFieldRead

Custom fields

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| Count | count | integer | The number of items available for retrieval into the collection after applying any request parameters. The limit and offset parameters do not affect the count, but to facilitate paging, they may affect the number of items in the value result set. |
| value | value | array of FundraisingApi.FundCustomFieldRead | The set of items included in the response. This may be a subset of the items in the collection. |

### FundraisingApi.ApiCollectionOfFundRead

Funds

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| Count | count | integer | The number of items available for retrieval into the collection after applying any request parameters. The limit and offset parameters do not affect the count, but to facilitate paging, they may affect the number of items in the value result set. |
| value | value | array of FundraisingApi.FundRead | The set of items included in the response. This may be a subset of the items in the collection. |

### FundraisingApi.ApiCollectionOfPackageRead

Packages

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| Count | count | integer | The number of items available for retrieval into the collection after applying any request parameters. The limit and offset parameters do not affect the count, but to facilitate paging, they may affect the number of items in the value result set. |
| value | value | array of FundraisingApi.PackageRead | The set of items included in the response. This may be a subset of the items in the collection. |

### FundraisingApi.AppealAttachmentRead

Attachment

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The system record ID of the attachment. |
| Appeal ID | parent\_id | string | The system record ID of the appeal associated with the attachment. |
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

### FundraisingApi.AppealCustomFieldRead

Custom field

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The system record ID of the custom field. |
| Appeal ID | parent\_id | string | The system record ID of the appeal associated with the custom field. |
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

### FundraisingApi.AppealRead

Appeal

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The system record ID of the appeal. |
| Category | category | string | The category of the appeal. |
| Date added | date\_added | date-time | The date when the appeal was created. |
| Date modified | date\_modified | date-time | The date when the appeal was last modified. |
| Description | description | string | The display name of the appeal. |
| End date | end\_date | date-time | The end date of the appeal. |
| value | goal.value | double | The monetary value. |
| Inactive? | inactive | boolean | Is the appeal active (meaning, the current date is after any start date and before any end date)? |
| Lookup ID | lookup\_id | string | The user-defined identifier for the appeal. |
| Start date | start\_date | date-time | The start date of the appeal. |

### FundraisingApi.CampaignAttachmentRead

Attachment

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The system record ID of the attachment. |
| Campaign ID | parent\_id | string | The system record ID of the campaign associated with the attachment. |
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

### FundraisingApi.CampaignCustomFieldRead

Custom field

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The system record ID of the custom field. |
| Campaign ID | parent\_id | string | The system record ID of the campaign associated with the custom field. |
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

### FundraisingApi.CampaignRead

Campaign

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The system record ID of the campaign. |
| Category | category | string | The category of the campaign. |
| Date added | date\_added | date-time | The date when the campaign was created. |
| Date modified | date\_modified | date-time | The date when the campaign was last modified. |
| Description | description | string | The display name of the campaign. |
| End date | end\_date | date-time | The end date of the campaign. |
| value | goal.value | double | The monetary value. |
| Inactive? | inactive | boolean | Is the campaign inactive (meaning, the current date is after any start date and before any end date)? |
| Lookup ID | lookup\_id | string | The user-defined identifier for the campaign. |
| Start date | start\_date | date-time | The start date of the campaign. |

### FundraisingApi.CreatedAppealAttachment

Created appeal attachment

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The ID of the newly created appeal attachment. |

### FundraisingApi.CreatedAppealCustomField

Created appeal custom field

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The ID of the newly created appeal custom field. |

### FundraisingApi.CreatedCampaignAttachment

Created campaign attachment

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The ID of the newly created campaign attachment. |

### FundraisingApi.CreatedCampaignCustomField

Created campaign custom field

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The ID of the newly created campaign custom field. |

### FundraisingApi.CreatedFundAttachment

Created fund attachment

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The ID of the newly created fund attachment. |

### FundraisingApi.CreatedFundCustomField

Created fund custom field

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The ID of the newly created fund custom field. |

### FundraisingApi.FundAttachmentRead

Attachment

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The system record ID of the attachment. |
| Fund ID | parent\_id | string | The system record ID of the fund associated with the attachment. |
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

### FundraisingApi.FundCustomFieldRead

Custom field

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The system record ID of the custom field. |
| Fund ID | parent\_id | string | The system record ID of the fund associated with the custom field. |
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

### FundraisingApi.FundRead

Fund

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The system record ID of the fund. |
| Category | category | string | The category of the fund. |
| Date added | date\_added | date-time | The date when the fund was created. |
| Date modified | date\_modified | date-time | The date when the fund was last modified. |
| Description | description | string | The display name of the fund. |
| End date | end\_date | date-time | The end date of the fund. |
| value | goal.value | double | The monetary value. |
| Inactive? | inactive | boolean | Is the fund inactive (meaning, the current date is after any start date and before any end date)? |
| Lookup ID | lookup\_id | string | The user-defined identifier for the fund. |
| Start date | start\_date | date-time | The start date of the fund. |
| Type | type | string | The type of the fund. |

### FundraisingApi.PackageRead

Package

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The system record ID of the package. |
| Appeal ID | appeal\_id | string | The system record ID of the appeal associated with this package. |
| Category | category | string | The category of the package. |
| Date added | date\_added | date-time | The date when the package was created. |
| Date modified | date\_modified | date-time | The date when the package was last modified. |
| value | default\_gift\_amount.value | double | The monetary value. |
| Description | description | string | The display name of the package. |
| End date | end | date-time | The end date of the package. |
| value | goal.value | double | The monetary value. |
| Inactive? | inactive | boolean | Is the package inactive (meaning, the current date is after any start date and before any end date)? |
| Lookup ID | lookup\_id | string | The user-defined identifier for the package. |
| Notes | notes | string | The notes on the package. |
| Recipient count | recipient\_count | integer | The number of recipients of the package. |
| Start date | start | date-time | The start date of the package. |

### NXTDataIntegrationApi.ConstituentRelationship

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| Constituent ID | relation\_id | integer | The system record ID of the related constituent. |
| Relation description | relation\_description | string | The relation description. |
| Relationship type | relationship\_type | string | The relationship type. |
| Reciprocal relationship type | reciprocal\_relationship\_type | string | The reciprocal relationship type. |
| Date from | date\_from | date-time | The start date for the relationship. |
| Date to | date\_to | date-time | The end date for the relationship. |
| Notes | notes | string | The relationship notes. |

### NXTDataIntegrationApi.ConstituentRelationshipCollection

Constituent relationships

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| Count | count | integer | The number of items available for retrieval into the collection after applying any request parameters. The limit and offset parameters do not affect the count, but to facilitate paging, they may affect the number of items in the value result set. |
| value | value | array of NXTDataIntegrationApi.ConstituentRelationship | The set of items included in the response. This may be a subset of the items in the collection. |

### NXTDataIntegrationApi.CreatedAppeal

Created appeal

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The ID of the newly created appeal. |

### NXTDataIntegrationApi.CreatedCampaign

Created campaign

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The ID of the newly created campaign. |

### NXTDataIntegrationApi.CreatedConstituentAppeal

Created constituent appeal

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The ID of the newly created constituent appeal. |

### NXTDataIntegrationApi.CreatedFund

Created fund

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| ID | id | string | The ID of the newly created fund. |

### NXTDataIntegrationApi.FundRelationship

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| Fund ID | relation\_id | integer | The system record ID of the related fund. |
| Relation description | relation\_description | string | The relation description. |
| Relationship type | relationship\_type | string | The relationship type. |
| Reciprocal relationship type | reciprocal\_relationship\_type | string | The reciprocal relationship type. |
| Date from | date\_from | date-time | The start date for the relationship. |
| Date to | date\_to | date-time | The end date for the relationship. |
| Notes | notes | string | The relationship notes. |

### NXTDataIntegrationApi.FundRelationshipCollection

Fund relationships

| Name | Path | Type | Description |
| --- | --- | --- | --- |
| Count | count | integer | The number of items available for retrieval into the collection after applying any request parameters. The limit and offset parameters do not affect the count, but to facilitate paging, they may affect the number of items in the value result set. |
| value | value | array of NXTDataIntegrationApi.FundRelationship | The set of items included in the response. This may be a subset of the items in the collection. |