================================================================================
DBAutoDoc Benchmark Report - AdventureWorks2022
================================================================================

================================================================================
1. PRIMARY KEY DETECTION
================================================================================

Ground Truth: 71 | AutoDoc: 104
Correct: 42 | Missed: 29 | Extra: 62
Precision: 40.4% | Recall: 59.2% | F1: 48.0%

--- Missed PKs: 12 single, 17 composite, 14 using BusinessEntityID ---
  dbo.AWBuildVersion -> [SystemInformationID]
  Person.BusinessEntityAddress -> [BusinessEntityID,AddressID,AddressTypeID]
  Person.BusinessEntityContact -> [BusinessEntityID,PersonID,ContactTypeID]
  Person.CountryRegion -> [CountryRegionCode]
  Sales.CountryRegionCurrency -> [CountryRegionCode,CurrencyCode]
  Sales.Currency -> [CurrencyCode]
  Production.Document -> [DocumentNode]
  Person.EmailAddress -> [BusinessEntityID,EmailAddressID]
  HumanResources.Employee -> [BusinessEntityID]
  HumanResources.EmployeeDepartmentHistory -> [BusinessEntityID,StartDate,DepartmentID,ShiftID]
  HumanResources.EmployeePayHistory -> [BusinessEntityID,RateChangeDate]
  dbo.ErrorLog -> [ErrorLogID]
  Person.Password -> [BusinessEntityID]
  Person.Person -> [BusinessEntityID]
  Person.PersonPhone -> [BusinessEntityID,PhoneNumber,PhoneNumberTypeID]
  Production.ProductCostHistory -> [ProductID,StartDate]
  Production.ProductDocument -> [ProductID,DocumentNode]
  Production.ProductInventory -> [ProductID,LocationID]
  Production.ProductListPriceHistory -> [ProductID,StartDate]
  Purchasing.PurchaseOrderDetail -> [PurchaseOrderID,PurchaseOrderDetailID]
  Sales.SalesOrderDetail -> [SalesOrderID,SalesOrderDetailID]
  Sales.SalesPerson -> [BusinessEntityID]
  Sales.SalesPersonQuotaHistory -> [BusinessEntityID,QuotaDate]
  Sales.SalesTerritoryHistory -> [BusinessEntityID,StartDate,TerritoryID]
  Sales.SpecialOfferProduct -> [SpecialOfferID,ProductID]
  Sales.Store -> [BusinessEntityID]
  Production.UnitMeasure -> [UnitMeasureCode]
  Purchasing.Vendor -> [BusinessEntityID]
  Production.WorkOrderRouting -> [WorkOrderID,ProductID,OperationSequence]

--- Extra PKs (62) [showing first 15] ---
  Production.BillOfMaterials -> [ProductAssemblyID] (conf: 100)
  Person.BusinessEntityAddress -> [AddressID] (conf: 80)
  Person.BusinessEntityAddress -> [BusinessEntityID,AddressID,AddressTypeID,rowguid] (conf: 75)
  Person.BusinessEntityAddress -> [BusinessEntityID] (conf: 80)
  Person.BusinessEntityContact -> [BusinessEntityID] (conf: 80)
  Person.BusinessEntityContact -> [BusinessEntityID,PersonID,ContactTypeID,rowguid] (conf: 75)
  Sales.Customer -> [PersonID] (conf: 100)
  Person.EmailAddress -> [EmailAddressID] (conf: 100)
  HumanResources.Employee -> [BusinessEntityID,LoginID,rowguid] (conf: 75)
  HumanResources.Employee -> [OrganizationNode] (conf: 100)
  HumanResources.EmployeeDepartmentHistory -> [BusinessEntityID,DepartmentID,ShiftID] (conf: 75)
  HumanResources.EmployeeDepartmentHistory -> [DepartmentID] (conf: 80)
  Person.Password -> [BusinessEntityID,rowguid] (conf: 75)
  Person.Person -> [BusinessEntityID,rowguid] (conf: 75)
  Sales.PersonCreditCard -> [CreditCardID] (conf: 80)

================================================================================
2. FOREIGN KEY DETECTION
================================================================================

Ground Truth FK relationships: 91
AutoDoc Discovered FK relationships: 87
Correct: 17 | Missed: 74 | Extra: 70
Precision: 19.5% | Recall: 18.7% | F1: 19.1%

--- Correct FKs (first 10) ---
  address.stateprovinceid -> stateprovince.stateprovinceid (conf: 100)
  customer.territoryid -> salesterritory.territoryid (conf: 93)
  document.owner -> employee.businessentityid (conf: 90)
  emailaddress.businessentityid -> person.businessentityid (conf: 93)
  employeepayhistory.businessentityid -> employee.businessentityid (conf: 100)
  jobcandidate.businessentityid -> employee.businessentityid (conf: 85)
  personphone.businessentityid -> person.businessentityid (conf: 100)
  productsubcategory.productcategoryid -> productcategory.productcategoryid (conf: 93)
  purchaseorderdetail.productid -> product.productid (conf: 89)
  salesorderdetail.productid -> specialofferproduct.productid (conf: 92)

--- Missed FKs (74) [first 20] ---
  BillOfMaterials.componentid -> Product.productid
  BillOfMaterials.productassemblyid -> Product.productid
  BillOfMaterials.unitmeasurecode -> UnitMeasure.unitmeasurecode
  BusinessEntityAddress.addressid -> Address.addressid
  BusinessEntityAddress.addresstypeid -> AddressType.addresstypeid
  BusinessEntityAddress.businessentityid -> BusinessEntity.businessentityid
  BusinessEntityContact.businessentityid -> BusinessEntity.businessentityid
  BusinessEntityContact.contacttypeid -> ContactType.contacttypeid
  BusinessEntityContact.personid -> Person.businessentityid
  CountryRegionCurrency.countryregioncode -> CountryRegion.countryregioncode
  CountryRegionCurrency.currencycode -> Currency.currencycode
  CurrencyRate.fromcurrencycode -> Currency.currencycode
  CurrencyRate.tocurrencycode -> Currency.currencycode
  Customer.personid -> Person.businessentityid
  Customer.storeid -> Store.businessentityid
  Employee.businessentityid -> Person.businessentityid
  EmployeeDepartmentHistory.businessentityid -> Employee.businessentityid
  EmployeeDepartmentHistory.departmentid -> Department.departmentid
  EmployeeDepartmentHistory.shiftid -> Shift.shiftid
  Password.businessentityid -> Person.businessentityid
  ... and 54 more

--- Extra FKs (70) [first 20] ---
  billofmaterials.componentid -> production.product.productid (conf: 100)
  billofmaterials.productassemblyid -> production.product.productid (conf: 100)
  billofmaterials.unitmeasurecode -> production.unitmeasure.unitmeasurecode (conf: 100)
  businessentityaddress.addressid -> person.address.addressid (conf: 100)
  businessentityaddress.addresstypeid -> person.addresstype.addresstypeid (conf: 100)
  businessentityaddress.businessentityid -> person.businessentity.businessentityid (conf: 100)
  businessentitycontact.businessentityid -> person.businessentity.businessentityid (conf: 100)
  businessentitycontact.contacttypeid -> person.contacttype.contacttypeid (conf: 100)
  businessentitycontact.personid -> person.person.businessentityid (conf: 100)
  customer.territoryid -> salesorderheader.territoryid (conf: 93)
  customer.territoryid -> salesperson.territoryid (conf: 93)
  customer.territoryid -> salesterritoryhistory.territoryid (conf: 93)
  emailaddress.businessentityid -> businessentity.businessentityid (conf: 92)
  emailaddress.businessentityid -> businessentityaddress.businessentityid (conf: 93)
  emailaddress.businessentityid -> employee.businessentityid (conf: 100)
  emailaddress.businessentityid -> employeedepartmenthistory.businessentityid (conf: 100)
  emailaddress.businessentityid -> password.businessentityid (conf: 93)
  emailaddress.businessentityid -> personphone.businessentityid (conf: 93)
  employee.businessentityid -> businessentity.businessentityid (conf: 95)
  employeedepartmenthistory.businessentityid -> humanresources.employee.businessentityid (conf: 100)
  ... and 50 more

================================================================================
3. DESCRIPTION COVERAGE & QUALITY
================================================================================

Ground Truth: 71 table, 485 column descriptions
AutoDoc: 25 table, 0 column descriptions
Table Coverage: 25/71 (35%)
Tables with both descriptions: 25

--- Description Quality Comparison (all overlapping) ---

  [dbo.awbuildversion]
    GT:      Current version number of the AdventureWorks 2016 sample database. 
    AutoDoc: Stores metadata regarding the current version and build date of the AdventureWorks database. It serves as a system-level configuration table to track the schema version and the last time it was update

  [dbo.databaselog]
    GT:      Audit table tracking all DDL changes made to the AdventureWorks database. Data is captured by the database trigger ddlDatabaseTriggerLog.
    AutoDoc: A central audit log that tracks Data Definition Language (DDL) changes and administrative operations within the database. It records schema modifications, object creations, and metadata updates (exten

  [dbo.errorlog]
    GT:      Audit table tracking errors in the the AdventureWorks database that are caught by the CATCH block of a TRY...CATCH construct. Data is inserted by stored procedure dbo.uspLogError when it is executed f
    AutoDoc: The dbo.ErrorLog table serves as a centralized repository for capturing and auditing database-related errors. It is specifically designed to store metadata from SQL Server's TRY...CATCH blocks, allowi

  [humanresources.department]
    GT:      Lookup table containing the departments within the Adventure Works Cycles company.
    AutoDoc: The HumanResources.Department table serves as a foundational lookup table that defines the organizational structure of the company. It stores the names of specific departments and categorizes them int

  [humanresources.employee]
    GT:      Employee information such as salary, department, and title.
    AutoDoc: This table stores detailed information about employees within the organization, including their identification, organizational hierarchy, job roles, and personal demographics. It serves as the central

  [humanresources.employeedepartmenthistory]
    GT:      Employee department transfers.
    AutoDoc: This table, identified as HumanResources.EmployeeDepartmentHistory, tracks the historical and current assignments of employees to specific departments and work shifts. It serves as a junction table th

  [humanresources.employeepayhistory]
    GT:      Employee pay history.
    AutoDoc: This table, identified as HumanResources.EmployeePayHistory, tracks the historical salary and wage information for employees. It records every pay rate change, the effective date of the change, and th

  [humanresources.jobcandidate]
    GT:      Résumés submitted to Human Resources by job applicants.
    AutoDoc: Stores resumes and application details for job candidates. It serves as a repository for recruitment data, allowing the Human Resources department to track potential hires and link them to formal empl

  [humanresources.shift]
    GT:      Work shift lookup table.
    AutoDoc: The HumanResources.Shift table is a foundational lookup table that defines the standard work shifts within the organization. It stores the names and time boundaries (start and end times) for different

  [person.address]
    GT:      Street address information for customers, employees, and vendors.
    AutoDoc: Stores physical address information for various entities such as customers, employees, and vendors. It serves as a centralized repository for street-level location data, including geographic coordinat

  [person.addresstype]
    GT:      Types of addresses stored in the Address table. 
    AutoDoc: A lookup table that defines the various categories or purposes of addresses stored in the database, such as Billing, Shipping, or Home addresses.

  [person.businessentity]
    GT:      Source of the ID that connects vendors, customers, and employees with address and contact information.
    AutoDoc: Acts as the foundational identity table for all primary entities within the database, including individuals, vendors, and stores. It provides a centralized, unique BusinessEntityID that serves as a ro

  [person.businessentityaddress]
    GT:      Cross-reference table mapping customers, vendors, and employees to their addresses.
    AutoDoc: This table serves as a many-to-many junction table that associates business entities (such as persons, stores, or vendors) with specific physical addresses. It includes a classification for the type o

  [person.businessentitycontact]
    GT:      Cross-reference table mapping stores, vendors, and employees to people
    AutoDoc: This table, likely Person.BusinessEntityContact, serves as a junction table that associates individual people with business entities (such as stores or vendors). It defines the specific role or 'Conta

  [person.contacttype]
    GT:      Lookup table containing the types of business entity contacts.
    AutoDoc: A lookup table that defines various job titles or roles for contacts associated with business entities. It serves as a standardized list of professional categories such as 'Sales Representative', 'Pur

  [person.countryregion]
    GT:      Lookup table containing the ISO standard codes for countries and regions.
    AutoDoc: A foundational lookup table that stores ISO-standard country and region codes along with their full names. It serves as the primary geographic reference for the database, providing the base data for s

  [person.emailaddress]
    GT:      Where to send a person email.
    AutoDoc: Stores email addresses for individuals and organizations. It functions as a child table to Person.BusinessEntity, providing a dedicated location for electronic contact information for employees, custo

  [person.password]
    GT:      One way hashed authentication information
    AutoDoc: The Person.Password table stores security credentials, specifically hashed passwords and their corresponding salts, for individuals identified in the Person.Person table. It serves as the authenticati

  [person.person]
    GT:      Human beings involved with AdventureWorks: employees, customer contacts, and vendor contacts.
    AutoDoc: The Person.Person table serves as the central repository for all individuals associated with the organization, including employees, customers, vendor contacts, and sales representatives. It stores cor

  [person.personphone]
    GT:      Telephone number and type of a person.
    AutoDoc: The Person.PersonPhone table stores telephone numbers associated with individuals (persons) in the database. It supports multiple phone numbers per person by categorizing them into different types suc

  [person.phonenumbertype]
    GT:      Type of phone number of a person.
    AutoDoc: A foundational lookup table that defines the standard categories for phone numbers, such as 'Cell', 'Home', and 'Work'. It provides a centralized reference for classifying contact information associat

  [person.stateprovince]
    GT:      State and province lookup table.
    AutoDoc: Stores geographical state and province information, serving as a lookup table for addresses and linking regional geography to sales territories.

  [production.billofmaterials]
    GT:      Items required to make bicycles and bicycle subassemblies. It identifies the heirarchical relationship between a parent product and its components.
    AutoDoc: Stores the hierarchical relationship between products and their constituent parts or sub-assemblies, defining the manufacturing structure (Bill of Materials) for finished goods.

  [production.culture]
    GT:      Lookup table containing the languages in which some AdventureWorks data is stored.
    AutoDoc: A reference table that defines the various languages and regional cultures supported by the database. It is primarily used to facilitate the localization of product descriptions and other content, all

  [production.document]
    GT:      Product maintenance documents.
    AutoDoc: Stores technical product documentation, maintenance manuals, and service guidelines for the company's products. It uses a hierarchical structure to organize documents into folders and sub-documents, a

--- Tables GT has but AutoDoc missed: 46 ---
  production.illustration
  production.location
  production.product
  production.productcategory
  production.productcosthistory
  production.productdescription
  production.productdocument
  production.productinventory
  production.productlistpricehistory
  production.productmodel
  ... and 36 more

================================================================================
4. OVERALL SUMMARY
================================================================================

Run: 25 prompts, 1,153,862 tokens, 3 iterations

Metric                          Precision     Recall         F1
--------------------------------------------------------------
Primary Key Detection              40.4%     59.2%     48.0%
Foreign Key Detection              19.5%     18.7%     19.1%
Table Description Coverage                    35.2%           

Overall Score: 34.1% (Grade: F)

================================================================================
5. ROOT CAUSE ANALYSIS & IMPROVEMENT IDEAS
================================================================================

PK Issues:
  - 14 tables use BusinessEntityID as PK (shared key pattern) - AutoDoc doesn't recognize these
  - 17 composite PKs missed - composite key detection may be too conservative
  - 5 natural keys (non-ID columns like CountryRegionCode, CurrencyCode)
  - 62 false positive PKs - over-generating candidates

FK Issues:
  - 74 missed FKs out of 91 total
  - 70 extra FKs generated (noise)
  - Need better column-to-column matching vs table-level matching

Description Issues:
  - Only 25/71 tables got descriptions (35%)
  - 0 column descriptions generated
  - 3 iterations but many tables not processed

--- Improvement Recommendations ---
  1. CRITICAL: Fix description generation - only 35% table coverage, 0% column coverage
  2. PK: Handle shared-key pattern (BusinessEntityID used as PK in child tables)
  3. PK: Improve composite key detection (17 missed composite PKs)
  4. PK: Support natural keys (CountryRegionCode, CurrencyCode, UnitMeasureCode)
  5. FK: Normalize schema prefixes in comparison (many FKs may be correct but misformatted)
  6. FK: Reduce false positives (84 extra FKs = noise)
  7. Description: Investigate why only 25/71 tables were analyzed in 3 iterations
