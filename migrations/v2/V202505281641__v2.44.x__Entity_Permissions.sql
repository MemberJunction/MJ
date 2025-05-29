-- Allow deletes and updates for Template Contents Entity
UPDATE ${flyway:defaultSchema}.EntityPermission Set CanUpdate=1, CanDelete=1 WHERE ID IN ('43C6BAE9-7188-4FD9-BB3A-372BA5101AD9','8815D320-0198-46C3-85C5-AD643D64F33E') -- UI and Developer roles ]
