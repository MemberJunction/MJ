SELECT 
  ili.ItemType,
  COUNT(DISTINCT ili.InvoiceID) AS InvoiceCount,
  COUNT(ili.ID) AS LineItemCount,
  SUM(ili.Amount) AS TotalRevenue,
  AVG(ili.Amount) AS AvgLineAmount,
  MIN(ili.Amount) AS MinLineAmount,
  MAX(ili.Amount) AS MaxLineAmount
FROM [AssociationDemo].[vwInvoiceLineItems] ili
INNER JOIN [AssociationDemo].[vwInvoices] inv ON ili.InvoiceID = inv.ID
WHERE inv.Status IN ('Paid', 'Partial')
  {% if StartDate %}AND inv.InvoiceDate >= {{ StartDate | sqlDate }}{% endif %}
  {% if EndDate %}AND inv.InvoiceDate <= {{ EndDate | sqlDate }}{% endif %}
  {% if ItemTypes %}AND ili.ItemType IN {{ ItemTypes | sqlIn }}{% endif %}
GROUP BY ili.ItemType
ORDER BY TotalRevenue DESC