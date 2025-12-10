-- Product Ranking Query
-- Ranks products by total revenue from invoice line items
-- Returns top N products by revenue with optional category filtering
-- When Category parameter omitted, ranks across all categories
-- When Category parameter provided, ranks within that category
-- Replaces both top-products-ranking.sql and category-top-products.sql

SELECT TOP ({% if TopN %}{{ TopN | sqlNumber }}{% else %}10{% endif %})
  p.ID AS ProductID,
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
{% endif %}GROUP BY p.ID, p.Name, p.Category
ORDER BY TotalRevenue DESC
