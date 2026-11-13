# Calendar-based platform estimates

Deploy `OtaFinance.gs` with `Code.gs` and the existing `Push.gs`/manifest. No new OAuth scope is required. The live script's private account configuration must be preserved.

`otaInfo` snapshots imported calendar ranges into the private app data's `otaLedger`. Pending estimates use the current selected overnight package's price from `data.prices` times the number of stay nights (checkout excluded). Fees are rounded to whole VND from a manually configured percentage; estimated net is gross minus fee. This does not fetch official reservation prices, platform promotions, taxes, or banking transactions. Unconfigured fee percentages and missing package prices produce an explicit unavailable estimate, never a zero default. Agoda entries may be added manually without changing room availability.

Only an authenticated Admin can change `OTA_CONFIG` through `otaSetConfig`. Configuration is kept separately from ordinary app data so staff cannot overwrite percentages through the general save endpoint. Both overnight packages are selectable per platform. Pending estimates change when prices/settings change; confirmed receipts preserve the quote snapshot and actual amount.

`otaReceive` requires explicit confirmation of a real reservation and receipt of funds, reservation reference, actual net VND amount and a non-future receipt date. It validates the quote again under a script lock, prevents duplicate receipt IDs/references, and atomically creates one income transaction. The general save route preserves server-owned ledger/receipt records so old clients or merge retries cannot delete/rewrite confirmed transactions. Other calendar and booking records are not modified.

Check `node tests/check-ota-finance.cjs` for fee calculations, checkout exclusion, changed quote rejection, Admin authorization, repeat confirmation, actual cash amount, history protection, missing configuration and manual Agoda entries. Do not test using fake income in production.
