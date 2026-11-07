-- Apply only to the designated free development project with T041 and T042 installed.
select cron.schedule('ayaale-offer-reminders', '*/15 * * * *', 'select private.queue_offer_and_inactivity_reminders()');
