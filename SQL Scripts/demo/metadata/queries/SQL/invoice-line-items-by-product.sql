-- Invoice Line Items by Product Query
-- Returns invoice line item records filtered by product name or category
-- Joins line items with products for drill-down display
-- Used by ProductCategoryAnalysis component for DataGrid drill-down
-- Note: Filters by human-readable fields (Name, Category) for consistency with other golden examples

SELECT
  ili.ID,
  ili.Product,
  ili.Quantity,
  ili.UnitPrice,
  ili.TotalPrice,
  ili.Description,
  i.InvoiceDate,
  i.Account AS AccountName,
  p.Category
FROM
  CRM.vwInvoiceLineItems ili
  INNER JOIN CRM.vwProducts p ON ili.ProductID = p.ID
  LEFT JOIN CRM.vwInvoices i ON ili.InvoiceID = i.ID
WHERE
  p.IsActive = 1
  {% if ProductName %}AND p.Name = {{ ProductName | sqlString }}
  {% else %}AND p.Category = {{ Category | sqlString }}
  {% endif %}{% if StartDate %}  AND i.InvoiceDate >= {{ StartDate | sqlDate }}
{% endif %}{% if EndDate %}  AND i.InvoiceDate <= {{ EndDate | sqlDate }}
{% endif %}ORDER BY
  ili.ID DESC
