-- Payment Method Failure Analysis
-- Analyzes payment effectiveness by method, comparing successful vs failed transactions
-- and calculating financial impact of failures

SELECT 
    p.PaymentMethod,
    COUNT(p.ID) AS TotalTransactions,
    SUM(CASE WHEN p.Status = 'Failed' THEN 1 ELSE 0 END) AS FailedTransactions,
    SUM(CASE WHEN p.Status = 'Completed' THEN 1 ELSE 0 END) AS CompletedTransactions,
    SUM(CASE WHEN p.Status = 'Failed' THEN p.Amount ELSE 0 END) AS TotalAmountLost,
    AVG(CASE WHEN p.Status = 'Failed' THEN p.Amount ELSE NULL END) AS AvgFailedAmount,
    MIN(CASE WHEN p.Status = 'Failed' THEN p.PaymentDate ELSE NULL END) AS FirstFailureDate,
    MAX(CASE WHEN p.Status = 'Failed' THEN p.PaymentDate ELSE NULL END) AS LastFailureDate
FROM [AssociationDemo].[vwPayments] p
{% if StartDate %}WHERE p.PaymentDate >= {{ StartDate | sqlDate }}{% endif %}
{% if EndDate %}{% if StartDate %}AND{% else %}WHERE{% endif %} p.PaymentDate <= {{ EndDate | sqlDate }}{% endif %}
GROUP BY p.PaymentMethod
HAVING COUNT(p.ID) > 0
ORDER BY FailedTransactions DESC, TotalAmountLost DESC