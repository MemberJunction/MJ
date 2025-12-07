-- Top Products Ranking Query
-- Ranks products by total revenue from invoice line items
-- Supports filtering by category, date range, and configurable top N
-- Returns product performance metrics suitable for bar/table visualization

SELECT TOP ({% if TopN %}{{ TopN | sqlNumber }}{% else %}10{% endif %})
  p.Name AS ProductName,
  p.Category,
  SUM(ili.TotalPrice) AS TotalRevenue,
  SUM(ili.Quantity) AS TotalQuantity,
  COUNT(DISTINCT ili.InvoiceID) AS InvoiceCount,
  AVG(ili.UnitPrice) AS AvgPrice
FROM CRM.vwProducts p
INNER JOIN CRM.vwInvoiceLineItems ili ON ili.ProductID = p.ID
INNER JOIN CRM.vwInvoices i ON i.ID = ili.InvoiceID
WHERE i.Status = 'Paid'
  AND p.IsActive = 1
{% if Category %}  AND p.Category = {{ Category | sqlString }}
{% endif %}{% if StartDate %}  AND i.InvoiceDate >= {{ StartDate | sqlDate }}
{% endif %}{% if EndDate %}  AND i.InvoiceDate <= {{ EndDate | sqlDate }}
{% endif %}GROUP BY p.Name, p.Category
ORDER BY TotalRevenue DESC
