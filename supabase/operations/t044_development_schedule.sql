-- UTC minute 35 is five minutes after the hour in Sri Lanka.
select cron.schedule('ayaale-partner-lifecycle-emails', '35 * * * *', 'select private.queue_partner_lifecycle_emails()');
