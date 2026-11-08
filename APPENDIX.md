# Appendix: Claims & Evidence and AI-use disclosure

Fictional casino with synthetic data. All figures are computed from the supplied tables by `submission/code/build_data.py` (see `results.json`).

## Claims & Evidence

| # | Claim | Table / query | Result | Alternative explanation tested | Limitation |
|---|---|---|---|---|---|
| 1 | M-1158 has a payout anomaly | machine_day + game_math: payout-positive spins / spins vs published hit_probability | Hit rate 38.5% vs 31.5% published (z = 124); hold 3.0% vs 10% design; shortfall $36,165 over six months | Pure luck: hit rate barely depends on bet size, and the gap is stable at 38-39% every month | Cause unknown. A lead to inspect, not an accusation |
| 2 | The other nine are normal for their slot | prepared_daily_view; zone x game benchmark (iterative fit on theo per available hour) | Draw vs similar machines 0.9-1.2; machine-to-machine noise 5.5%; zone and game explain 97% of expected win per hour | Manufacturer and lease class add nothing (p > 0.3 in OLS on log coin-in per hour) | Zone and game are partly entangled and cannot be separated cleanly |
| 3 | Luck is the main noise in house win | machine_day: luck = house win - expected win; variance = sum(bet^2) x game payout variance | Luck-score sd 1.11 (1.08 without M-1158) vs 1.0 for pure chance; the ten lost $63,357 to luck | A mis-set payout would push the spread well above 1; only M-1158 does | Normal approximation is rough for high-volatility games |
| 4 | Back Forty is quiet, and the closure cost it 31% | prepared_daily_view; walkway closure Mar 3-Apr 6 | Back Forty vs other zones, play per machine-day: 0.64 before, 0.44 during, 0.62 after; other zones +3% during | Seasonality: other zones did not fall in the same weeks | One zone, one event; not randomised. Traffic counters have outages |
| 5 | Events drive demand; conventions barely do | property_day vs same-weekday non-event days | CES +2%; Super Bowl +23%; March Madness +19%; CinemaCon +3%; NAB +6%; EDC +16%; Slot Tournament (promo) +18%; Locals Week (promo) +5% | Weekday mix and machine count controlled in the baseline; weather effect is small | One instance per event |
| 6 | Downtime is small; Ridgeline drives it | prepared_daily_view; operations; shift_roster | $90,313 lost (0.38% of expected win); Ridgeline 1.2 vs Halcyon 0.3 breakdowns per machine-month; day-shift technician cover 67% in April, 53% in May | Technician shortage: waits rose to 2.2 h in May, but waiting is only 28% of repair time | Lost win uses each machine's own average earning rate |
| 7 | Player losses are concentrated | player_period (card holders only) | Top 1% = 20% of net losses, top 10% = 59%; 14% of players ahead; net -$15,585,461 vs expected -$15,485,021 | Measured per player over six months, not per month | Card holders only (about 66% of play); never reconcile to machine meters |
| 8 | Comp price halved around April 28 | loyalty_ledger: points redeemed per $ of menu value, weekly; property_day | 12.5 -> 5.8 points per $1; comp cost per $1,000 wagered $0.74 -> $0.81 | Item mix: house cost / menu value is flat at about 28%, so it is a price change | Before/after, no control group |
| 9 | Model 1 beats the average day on a time holdout | property_day; train Jan 1-Apr 30, test May 1-Jun 30 | Mean absolute error $64,902/day (4.9%) vs $218,258 (training mean) and $68,699 (weekday mean) | Rolling four-week windows agree at every origin | Misses unfamiliar events (EDC); over-predicts about 2.7% in June; takes machine count (300-308) as known |
| 10 | Model 2 estimates expected play per machine | prepared_daily_view; train Jan-Apr, test May-Jun; gradient-boosted trees | Error per machine-day $950 vs $1,411 (average) and $1,119 (own average); zone x game x weekday table $936 | A lookup table is about as accurate, and own history wins on 61-day totals | Used for a what-if on other games, which is observational |
| 11 | Replacing the ten would not pay back in July | Model 2 what-if + action_catalog (lease $2,500 + $55/day, lead 14 days) | Best-case gain $23,695 over 16 operating days for all ten vs $33,800 to lease ten; none exceeds the $3,380 lease cost | A longer horizon could favour swapping Royal Draw machines in Back Forty (about 3 weeks to break even) | Effect of a different game on play is observed, not tested |
| 12 | Promotion weekends pay for themselves | events + Model 1 July forecast | Tournament expected win +19%, Locals Week +5%; at 10% two weekends add about $86,543 before the $30,000 cost | Pull-forward: no dip in the four days after the tournament | Two events only; $15,000 per event is assumed to cover all promotion costs |

## Priced actions (July 1-30)

| Action | Cost | Expected net (low / base / high) | Measurement plan |
|---|---:|---|---|
| A-INSPECT: inspect M-1158 | $1,200 | -$1.2k / +$4.0k / +$4.6k | Share of spins that pay returns to about 31.5%; hold back near 10% |
| A-PROMO: two promotion weekends (Jul 18-20, Jul 25-27) | $30,000 | +$7k / +$57k / +$130k | Compare each weekend with the Model 1 forecast; top 1% of players stay at or below 20% of losses; check the days after for a dip |
| A-WAYFINDING: signs in Back Forty | $7,500 | -$7.5k / +$4.5k / +$16k | Back Forty vs rest-of-floor ratio rises from 0.62 to at least 0.63 within three weeks |

Total spent $38,700; $61,300 kept. No conflicting moves or replacements, no comp actions.

## AI-use disclosure

- **Tool:** Claude (Anthropic), used through Claude Code.
- **Used for:** exploring the data, writing the Python build script (`build_data.py`), the dashboard code (`index.html`, `app.js`), and drafting the write-up, appendix and video script.
- **Checks:** every number is computed from the supplied tables, not typed by hand; the repo's `verify_data.py` and `verify_semantics.py` pass; analytic choices and recommendations were reviewed by the team.
- **Not used:** there is no live AI on the dashboard; all text is fixed.
- **Outside data:** NOAA weather (public domain) for one descriptive check only. LVCVA and Missouri tables are not used because their redistribution terms are not cleared.
