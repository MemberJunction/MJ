"""
ASOF_CORE — the subset of the member-period features expressible by TODAY's
FeatureAssemblyExecutor `DatedFeatureSpec` (activity_count + days_since_last_activity
per dated source) plus static member/period fields.

This is the A6.7 reconciliation twin: Track A trains `gbt_core` on exactly this
subset standalone; the future integration step assembles the same features through
the real infra and must reproduce the holdout number. Keep this list in lockstep
with what DatedFeatureSpec can express — nothing else may sneak in.
"""
from __future__ import annotations

# per dated source: activity_count -> *_before ; days_since_last_activity -> *_recency_days
ASOF_CORE_NUM = [
    "events_before", "event_recency_days",       # EventRegistration.RegisteredOn
    "courses_before",                             # CourseEnrollment.EnrolledOn (count)
    "orders_before", "order_recency_days",       # Order.OrderDate
    "payments_before",                            # Payment.PaymentDate (count)
    # static, directly-selectable fields (plain `select` steps, no aggregation)
    "dues_amount", "auto_renew",
]
ASOF_CORE_CAT = ["tier", "segment"]
