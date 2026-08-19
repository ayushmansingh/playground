WITH he_diy_quotes as
(SELECT
date_part,
date_format(from_unixtime(event_detail.event_timestamp/1000) AT TIME ZONE 'Asia/Kolkata', '%Y-%m-%d %H:%i') as ist_timestamp,
JSON_EXTRACT_SCALAR(event_detail.request_info,'$.ticketId') as ticket_id,
event_detail.quote_details.quote_request_id
FROM mmt_holidays_lake.mmt_holidays_b2c_hol_server_logging
WHERE date_part >= '2026-08-08'
AND event_detail.event_name = ('QUOTE_CREATE_TRIP_BUILDER')
-- AND user_context.uuid = 'UGHFWCAGPTL'
),

quote_actions as
(SELECT 
date_part, 
date_format(from_unixtime(event_detail.event_timestamp/1000) AT TIME ZONE 'Asia/Kolkata', '%Y-%m-%d %H:%i') as ist_timestamp,
user_context.uuid,
event_detail.event_name,
event_detail.ticket_details.id as ticket_id,
event_detail.ticket_details.quote_id as quote_id,
event_detail.ticket_details.agent_id as agent_id,
event_detail.ticket_details.created_by as agent_uuid,
JSON_EXTRACT_SCALAR(event_detail.request_info,'$.quoteRequestId') as quoteRequestId
FROM mmt_holidays_lake.mmt_holidays_b2c_hol_server_logging
WHERE 1=1
AND event_detail.event_name IN ('QUOTE_DOWNLOAD','QUOTE_SEND','QUOTE_SAVE')
AND date_part >= '2026-08-08'
-- AND event_detail.ticket_details.created_by = 'UGHFWCAGPTL'
-- AND event_detail.ticket_details.id = '23966069461774784'
-- AND event_detail.ticket_details.quote_id = '45079264'
),


psm_detail as
(SELECT 
date_part, 
date_format(from_unixtime(event_detail.event_timestamp/1000) AT TIME ZONE 'Asia/Kolkata', '%Y-%m-%d %H:%i') as ist_timestamp,
event_detail.ticket_details.id as ticket_id,
event_detail.ticket_details.quote_id as quote_id
FROM mmt_holidays_lake.mmt_holidays_b2c_hol_server_logging
WHERE 1=1
AND event_detail.event_name IN ('PRE_SALES_DETAIL')
AND date_part >= '2026-08-08'
-- AND event_detail.ticket_details.created_by = 'UGHFWCAGPTL'
-- AND event_detail.ticket_details.id = '23966069461774784'
-- AND event_detail.ticket_details.quote_id = '45053385'
),

psm_review as
(SELECT 
date_part, 
date_format(from_unixtime(event_detail.event_timestamp/1000) AT TIME ZONE 'Asia/Kolkata', '%Y-%m-%d %H:%i') as ist_timestamp,
event_detail.ticket_details.id as ticket_id,
event_detail.ticket_details.quote_id as quote_id
FROM mmt_holidays_lake.mmt_holidays_b2c_hol_server_logging
WHERE 1=1
AND event_detail.event_name IN ('PRE_SALES_REVIEW')
AND date_part >= '2026-08-08'
-- AND event_detail.ticket_details.created_by = 'UGHFWCAGPTL'
-- AND event_detail.ticket_details.id = '23966069461774784'
-- AND event_detail.ticket_details.quote_id = '45053385'
),

bookings as
(SELECT 
Date(a.created_time) AS created_date,
payment_reference_id, 
cast(quote_id as varchar) as quote_id,
navision_status
FROM dpt_warehouse_holiday_hpcms_db_new.online_bookings a
LEFT JOIN dpt_warehouse_holiday_hpcms_db_new.online_bookings_extra_info c ON a.id = c.booking_id
WHERE a.date_part >= '2026-08-08'
-- AND navision_status = 'Y'
),


output as
(SELECT 
a.date_part,
a.ist_timestamp,
a.ticket_id,
a.quote_request_id,
b.quote_id,
MAX(CASE WHEN event_name = 'QUOTE_SAVE' then 1 else 0 end) as save,
MAX(CASE WHEN event_name = 'QUOTE_SEND' then 1 else 0 end) as send,
MAX(CASE WHEN event_name = 'QUOTE_DOWNLOAD' then 1 else 0 end) as download,
MAX(CASE WHEN c.date_part is not null THEN 1 end) as psm_detail,
MAX(CASE WHEN d.date_part is not null THEN 1 end) as psm_review,
MAX(CASE WHEN payment_reference_id is not null then payment_reference_id end) as checkout,
MAX(CASE WHEN payment_reference_id is not null and navision_status = 'Y' then payment_reference_id end) as booking
FROM he_diy_quotes a
LEFT JOIN quote_actions b
ON a.date_part <= b.date_part
AND a.quote_request_id = b.quoteRequestId
AND a.ticket_id = b.ticket_id
LEFT JOIN psm_detail c
ON b.quote_id = c.quote_id
AND b.date_part <= c.date_part
LEFT JOIN psm_review d
ON b.quote_id = d.quote_id
AND b.date_part <= d.date_part
LEFT JOIN bookings e
ON b.quote_id = e.quote_id
GROUP BY 1,2,3,4,5)

-- SELECT * FROM output

SELECT 
date_part,
-- booking,
COUNT(*) as created,
SUM(save) as saved,
SUM(send) as sent,
SUM(download) as downloaded,
SUM(psm_detail) as psm_detail,
SUM(psm_review) as psm_review,
COUNT(DISTINCT checkout) as checkout,
COUNT(DISTINCT booking) as bookings
FROM output
GROUP BY 1
ORDER BY 1 DESC