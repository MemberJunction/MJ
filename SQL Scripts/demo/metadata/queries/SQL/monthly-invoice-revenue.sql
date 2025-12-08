-- Monthly Invoice Revenue Query
-- Flexible aggregation query for invoice revenue analysis by month
-- Supports filtering by year, month, and multiple status values
-- Optionally groups by status when multiple status values are provided
-- Returns time-series data suitable for charts and trend analysis

SELECT
  YEAR(i.InvoiceDate) AS Year,
  MONTH(i.InvoiceDate) AS Month,
  DATENAME(month, i.InvoiceDate) AS MonthName,
{% if StatusList and ',' in StatusList %}  i.Status,
{% endif %}  SUM(i.TotalAmount) AS TotalRevenue,
  SUM(i.SubTotal) AS TotalSubTotal,
  SUM(i.TaxAmount) AS TotalTax,
  SUM(i.AmountPaid) AS TotalPaid,
  SUM(i.BalanceDue) AS TotalOutstanding,
  COUNT(*) AS InvoiceCount,
  AVG(i.TotalAmount) AS AvgInvoice
FROM CRM.vwInvoices i
WHERE 1=1
{% if StatusList %}  {% if ',' in StatusList %}  AND i.Status IN (
      SELECT TRIM(value)
      FROM STRING_SPLIT({{ StatusList | sqlString }}, ',')
  )
  {% else %}  AND i.Status = {{ StatusList | sqlString }}
  {% endif %}{% else %}  AND i.Status = 'Paid'
{% endif %}{% if Year %}  AND YEAR(i.InvoiceDate) = {{ Year | sqlNumber }}
{% endif %}{% if Month %}  AND MONTH(i.InvoiceDate) = {{ Month | sqlNumber }}
{% endif %}{% if StartDate %}  AND i.InvoiceDate >= {{ StartDate | sqlDate }}
{% endif %}{% if EndDate %}  AND i.InvoiceDate <= {{ EndDate | sqlDate }}
{% endif %}GROUP BY
  YEAR(i.InvoiceDate),
  MONTH(i.InvoiceDate),
  DATENAME(month, i.InvoiceDate)
{% if StatusList and ',' in StatusList %}  ,i.Status
{% endif %}ORDER BY
  Year DESC,
  Month DESC
{% if StatusList and ',' in StatusList %}  ,i.Status
{% endif %}
