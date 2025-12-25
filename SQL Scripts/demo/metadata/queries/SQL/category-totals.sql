-- Product Category Revenue Totals Query
-- Aggregates product revenue by category from invoice line items
-- Calculates total revenue, product count, and average metrics per category
-- Returns category summary suitable for bar chart and drilldown visualization

SELECT
  p.Category,
  COUNT(DISTINCT p.ID) AS ProductCount,
  SUM(ili.TotalPrice) AS TotalRevenue,
  AVG(ili.TotalPrice) AS AvgRevenue,
  SUM(ili.Quantity) AS TotalQuantity,
  COUNT(DISTINCT ili.InvoiceID) AS InvoiceCount
FROM CRM.vwProducts p
INNER JOIN CRM.vwInvoiceLineItems ili ON ili.ProductID = p.ID
INNER JOIN CRM.vwInvoices i ON i.ID = ili.InvoiceID
WHERE i.Status = 'Paid'
  AND p.IsActive = 1
{% if Category %}  AND p.Category = {{ Category | sqlString }}
{% endif %}{% if StartDate %}  AND i.InvoiceDate >= {{ StartDate | sqlDate }}
{% endif %}{% if EndDate %}  AND i.InvoiceDate <= {{ EndDate | sqlDate }}
{% endif %}GROUP BY p.Category
ORDER BY TotalRevenue DESC
