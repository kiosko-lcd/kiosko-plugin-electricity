# Fixtures

Answers of REE's APIs saved with `curl` on 24 November 2026 (around 21:50,
Europe/Madrid), as they came. Data © Red Eléctrica de España (see NOTICE).

| File | Request |
|---|---|
| `redata-2026-11-24-25-peninsula.json` | `https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real?time_trunc=hour&geo_ids=8741&start_date=2026-11-24T00:00&end_date=2026-11-25T23:59` (today and tomorrow, 48 hours) |
| `redata-2026-11-24-canarias.json` | the same, `geo_ids=8742`, 24 November only |
| `redata-2026-10-25-dst-end.json` | `geo_ids=8741`, 25 October 2026: summer time ends, 25 hours (02:00 twice, `+02:00` then `+01:00`) |
| `redata-2026-03-29-dst-start.json` | `geo_ids=8741`, 29 March 2026: summer time starts, 23 hours (no 02:00) |
| `redata-unpublished.json` | `start_date=2026-11-26T00:00&end_date=2026-11-26T23:59`, a day not published yet: HTTP 502 |
| `redata-error.json` | `geo_ids=8741` without `time_trunc` (or `time_trunc=quarter_hour`): HTTP 400 |
| `esios-1001-2026-11-24.json` | `https://api.esios.ree.es/indicators/1001?start_date=2026-11-24T00:00&end_date=2026-11-24T23:59`, trimmed to Península and Canarias |

REData answers a range half published with the part it has (asking for today
and tomorrow before 20:15 gives today's 24 hours), and a range with nothing
yet with an error. It has no quarter-hourly PVPC (`time_trunc=quarter_hour`
fails); the parser test makes quarter-hours up by splitting these hours.
