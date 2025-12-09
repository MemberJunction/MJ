-- Invoice Line Items by Product Query
-- Returns invoice line item records filtered by product ID or category
-- Joins line items with products for drill-down display
-- Used by ProductCategoryAnalysis component for DataGrid drill-down
-- Note: ProductID uses ID-based filtering (robust), Category remains string-based (no FK in demo schema)

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
  {% if ProductID %}AND p.ID = {{ ProductID }}
  {% else %}AND p.Category = {{ Category | sqlString }}
  {% endif %}{% if StartDate %}  AND i.InvoiceDate >= {{ StartDate | sqlDate }}
{% endif %}{% if EndDate %}  AND i.InvoiceDate <= {{ EndDate | sqlDate }}
{% endif %}ORDER BY
  ili.ID DESC
