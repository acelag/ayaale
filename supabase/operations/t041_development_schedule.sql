-- Run only on the designated free development project after the T041 migration.
select cron.schedule('ayaale-offer-lifecycle', '* * * * *', 'select private.run_offer_lifecycle()');
