# AMITH TASK LIST
STUDY ALL CODE CHANGES
TEST SQL SERVER MANUALLY
SPIN UP WORKBENCH TO TEST SQL in many ways, test migrations, etc
MERGE

# CodeGenLib
- in RunCodeGenBase we have two hardcoded providers setup setupPostgres and setupSQLServer - that's ok, but ideally we'd have this as plugin. That is more pedantic as even if we added 2-3 more over time not too horrible to have that here. Worth noting in our documentation as an area for improvement
- overall seems well archiected. One heuristic I like to consider is how much generic code in base class and how much in each subclass. the SQL Server and PG classes are pretty simple so that means the logic flow is all in the base class - as intended. Seems good.
- Critically review the code and look for holes in the design and impleemntation and include in report

# MJCore
## `databaseProviderBase.ts`
- debug package in the package.json - I think this was added during this workstream. What is this? Is this safe in browsers as well as node. Do we actually use it?
- DatabaseProviderBase has `_uuidFunctionPattern` and `_dbDefaultFunctionPattern` that tries to capture both SQL and PG. Bad, instead we should make these abstract getter properties and use in the base class where needed but sub-classes for SQL and PG must implement this specific to their variant. In fact in SQL DIalect package is really where we should have this source of truth, but still implement as abstract getter in DB provider base and in sub-classes for PG/SQL just call the appropriate helper static method in the SQL Dialect object?
- DiffObjects seems like a useful utility method we could probably promote up to ProviderBase, no? Check what it does, doesn't seem to do anything with back end stuff so we could prompote this method and the things it uses internally to ProviderBase in case ever needed in other non-db providers
- Remove the (Phase X) markers in various comment blocks, that was just related to this workstream and has no longer term meaning

## `util.ts`
- the TypeScriptTypeFromSQLType helper method was updated to support PG but the FormatValueInternal method wasn't
- also, the SQLFullType method and SQLMaxLength method and other bits in here should be reviewed again

## SQLServerDataProvider
- I see some things in this class that make me wonder if we could put the core logic for them in the DatabaseProviderBase and just define some more abstract methods for the inner bits so we don't repliate so much between PG and SQL providers. Examples:
  - `InternalRunView` so much of this is the flow of running a view, checking various things, logging, etc, and has nothing to do with SQL or PG. This is a great example to move to DatabaseProviderBase and the bits that are SQL Server specific we turn into abstract methods and then put those in SQL Server Data Provider. After that we can go to PG proivder and so the same thing. We should add unit tests for this work in databaseprovider base and each provider too.
  - `RenderViewWhereClause` mostly generic
  - `RunQueriesWithCacheCheck` and similar - lots of logic, very little SQL server specific
  - `RunViewsWithCacheCheck` and similar 
  - `Entity AI Actions` stuff like HandleEntityActions - nothing here that is SQL or not specific or is this in here because we can't do this stuff in the base provider due to dependencies with action engine - I think that is why - so if that is the case let's add a new package called @memberjunction/generic-database-provider and in there build a helper class that has some of these methods and we can simply call them from both PG and SQL Server to reduce code. If other similar places have patterns like this where we WOULD have put stuff into DatabaseProviderBase but did NOT due to the dependencies issue in MJCore (DatabaseProviderBase has to stay there) we can do same thing
  - `Load` method seems like a candidate for refactoring into base database provider class with new abstract methods for the inner bits that have sql or PG specific stuff.
  - `GetDatasetByName` also seems like candidate for refactoing, only one bit of this is really doing db stuff - mostly logical flow
  - `ProcessEntityRows` - same thing

## PG data provider
- no comments other than afer you do all above work on SQL Server Data Provider and build the MJCore and SQL data provider packages and run unit tests in it, then you'll have to come into this package and update it to work properly with the new abstract methods and rip out a lot of the code that was copied in from SQL data provider.

## scripts folder 
- what is in here, is this stuff from before we had the SQL converter toolchain built? study and report back