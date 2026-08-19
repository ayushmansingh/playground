# HE DIY Dashboard PRD

## Goal

Create a local operational dashboard for the two HE DIY Redash dashboards:

- Query `172937`: Day-On-Day New HE DIY Dashboard
- Query `174655`: Agent Level Day-on-Day New vs Old HE DIY performance

## Users

Business and ops users who need to inspect day-on-day funnel movement, compare New vs Old HE DIY performance, and drill into agent-level output.

## Requirements

- Keep filters inside the relevant tab.
- For query `172937`, show only date and trend metric filters because the source is New DIY only.
- For query `174655`, show date, New/Old, agent search, sort, and trend metric filters.
- Show aggregate KPIs: created, saved, sent, bookings, save rate, send rate, booking rate.
- Show query `172937` as a day-on-day trend and table.
- Show query `174655` as an agent performance table with agent search, New/Old filter, comparison cards, and a New DIY vs Old DIY trend line chart.
- Show nearest-day values on chart hover.
- Provide Refresh Redash control using the local env key.
- Fall back to the latest snapshot if live refresh fails.
- Keep Redash keys server-side only.

## Current Data Constraint

Both live Redash executions currently fail with:

```text
INVALID_GLUE_SCHEMA: Delta Lake table schema in Glue does not match the most recent schema of the Delta Lake transaction log.
```

The app therefore starts from the cached snapshot produced on `2026-08-19`.

## Suggested Challenge

Fix or route around the Glue schema mismatch on the shared dependencies:

- `mmt_holidays_lake.mmt_holidays_b2c_hol_server_logging`
- `dpt_warehouse_holiday_hpcms_db_new.online_bookings`
- `dpt_warehouse_holiday_hpcms_db_new.online_bookings_extra_info`

Without that, the dashboard can be used for analysis but cannot be trusted for live refresh.
