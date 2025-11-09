# LousyDB - Legacy Database Demo

## Purpose

This database represents a **realistic legacy system** commonly found in enterprise environments - the kind of poorly-documented, metadata-deficient databases that DBAutoDoc's **Relationship Discovery Phase** is specifically designed to handle.

## The Problem

Many real-world databases suffer from:

- ❌ **No Primary Keys Defined** - Tables lack PK constraints despite having unique identifiers
- ❌ **No Foreign Keys Defined** - Relationships exist in data but not in schema metadata
- ❌ **Cryptic Naming** - Short, abbreviated table and column names (`cst`, `ord`, `pmt`)
- ❌ **Single-Character Codes** - Status fields use cryptic codes (`A`, `T`, `P`, `C`) without documentation
- ❌ **Data Quality Issues** - Orphaned records, NULL foreign keys, inconsistent data
- ❌ **No Documentation** - Zero comments or extended properties explaining anything

### Why This Happens

1. **Legacy Systems** - Databases created 20+ years ago before modern best practices
2. **Migration Artifacts** - Data imported from mainframes, AS/400, or flat files
3. **Performance Myths** - Developers believed FK constraints "slowed down" the system
4. **Lost Knowledge** - Original developers long gone, no documentation maintained
5. **Technical Debt** - "We'll fix it later" became "We can't touch it now"

## The Database

**LousyDB** simulates a customer management system with two schemas:

### Schema: `sales`
Customer and order management
- `cst` - Customers (cryptic table name, no PK/FK defined)
- `ord` - Orders
- `oli` - Order line items
- `pmt` - Payments
- `shp` - Shipments
- `rtn` - Returns
- `cst_note` - Customer notes
- `addr` - Addresses
- `phn` - Phone numbers
- `eml` - Email addresses

### Schema: `inv`
Inventory and product management
- `prd` - Products
- `cat` - Categories
- `sup` - Suppliers
- `whs` - Warehouses
- `stk` - Stock levels
- `po` - Purchase orders
- `po_dtl` - PO details
- `rcv` - Receiving records
- `adj` - Inventory adjustments
- `cnt` - Cycle counts

## Data Characteristics

### Cryptic Column Names
- `cst_id` instead of `customer_id`
- `sts` instead of `status`
- `dt` instead of `date`
- `amt` instead of `amount`
- `qty` instead of `quantity`

### Single-Character Status Codes
Without documentation, impossible to know what they mean:
- **Customer Status**: `A` (Active), `I` (Inactive), `S` (Suspended), `T` (Terminated)
- **Order Status**: `P` (Pending), `C` (Confirmed), `S` (Shipped), `D` (Delivered), `X` (Cancelled)
- **Payment Status**: `P` (Pending), `A` (Approved), `R` (Rejected), `F` (Failed)
- **Shipment Status**: `N` (New), `P` (Packed), `S` (Shipped), `D` (Delivered)

### Data Quality Issues
Intentionally realistic problems:
- **Orphaned Records**: ~5% of orders reference non-existent customers
- **NULL Foreign Keys**: ~10% of optional FKs are NULL
- **Duplicate Entries**: Some customers have duplicate records
- **Inconsistent Data**: Phone numbers in various formats
- **Missing Data**: Many optional fields left NULL

## What DBAutoDoc Discovery Will Find

The **Relationship Discovery Phase** should detect:

### Primary Keys (High Confidence)
- `cst.cst_id` - 100% unique, sequential INT, good naming
- `ord.ord_id` - 100% unique, GUID pattern
- `prd.prd_id` - 100% unique, natural key pattern
- Similar patterns across all 20 tables

### Foreign Keys (Variable Confidence)
- **High Confidence (85-95%)**:
  - `ord.cst_id` → `cst.cst_id` (95% overlap, perfect naming match)
  - `oli.ord_id` → `ord.ord_id` (100% overlap, good naming)

- **Medium Confidence (65-85%)**:
  - `pmt.ord_id` → `ord.ord_id` (90% overlap, 10% NULL for account credits)
  - `shp.ord_id` → `ord.ord_id` (95% overlap, some unshipped orders)

- **Lower Confidence (50-65%)**:
  - `addr.cst_id` → `cst.cst_id` (some orphaned addresses from deleted customers)

### Composite Keys
- `stk` table: (`prd_id`, `whs_id`) combination is unique
- `po_dtl` table: (`po_id`, `prd_id`, `seq`) combination is unique

## Testing the Discovery

1. **Create the database**:
   ```sql
   -- First create the database
   sqlcmd -S localhost -d master -Q "CREATE DATABASE LousyDB"

   -- Then run the schema/data creation script
   sqlcmd -S localhost -d LousyDB -i create_lousydb.sql
   ```

2. **Configure DBAutoDoc** with discovery enabled:
   ```json
   {
     "analysis": {
       "relationshipDiscovery": {
         "enabled": true,
         "triggers": {
           "runOnMissingPKs": true,
           "runOnInsufficientFKs": true
         },
         "tokenBudget": {
           "ratioOfTotal": 0.25
         }
       }
     }
   }
   ```

3. **Run analysis**:
   ```bash
   db-auto-doc analyze --config=config.json
   ```

4. **Review results** in state file:
   - Check `relationshipDiscoveryPhase` section
   - Review discovered primary keys with confidence scores
   - Review discovered foreign keys with evidence
   - See token usage for discovery vs analysis phases

## Expected Results

DBAutoDoc should:
- ✅ Identify all 20 primary keys (100% success rate expected)
- ✅ Discover 25-30 foreign key relationships
- ✅ Flag orphaned records and data quality issues
- ✅ Use ~25% of token budget for discovery, 75% for documentation
- ✅ Generate comprehensive documentation despite missing metadata

## Real-World Impact

This demo shows how DBAutoDoc can:
1. **Rescue Legacy Systems** - Make undocumented databases understandable
2. **Enable Modernization** - Provide the schema knowledge needed for refactoring
3. **Improve Data Quality** - Identify orphaned records and referential integrity issues
4. **Save Time** - Automated discovery vs. weeks of manual reverse engineering
5. **Preserve Knowledge** - Document systems before tribal knowledge is lost

## Files

- `README.md` - This file
- `create_lousydb.sql` - Creates schemas, tables, and sample data
- `config.json` - Sample DBAutoDoc configuration with discovery enabled
