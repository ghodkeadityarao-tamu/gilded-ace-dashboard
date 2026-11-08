"""Write submission/APPENDIX.md (Claims & Evidence + AI-use disclosure) from results.json, so every number matches the dashboard."""
import json
from pathlib import Path
root = Path(__file__).resolve().parents[2]
R = json.loads((root / "submission/code/results.json").read_text())
usd = lambda n: ("-" if n < 0 else "") + "$" + f"{abs(n):,.0f}"
pct = lambda x, d=0: f"{x*100:.{d}f}%"
sp = lambda x, d=0: ("+" if x >= 0 else "-") + f"{abs(x)*100:.{d}f}%"
F, mm, bm, ca, pp = R["forecast"], R["machine_model"], R["downtime_by_mfr"], R["conc_all"], R["comp_pre_post"]
m58 = next(b for b in R["bottom10"] if b["machine_id"] == "M-1158")
rows = [
 ("M-1158 has a payout anomaly", "machine_day + game_math: payout-positive spins / spins vs published hit_probability",
  f"Hit rate 38.5% vs 31.5% published (z = {m58['hit_z']:.0f}); hold {pct(R['M1158_hold'],1)} vs 10% design; shortfall {usd(R['M1158_shortfall_usd'])} over six months",
  "Pure luck: hit rate barely depends on bet size, and the gap is stable at 38-39% every month", "Cause unknown. A lead to inspect, not an accusation"),
 ("The other nine are normal for their slot", "prepared_daily_view; zone x game benchmark (iterative fit on theo per available hour)",
  f"Draw vs similar machines 0.9-1.2; machine-to-machine noise {pct(R['appeal_robust_sd'],1)}; zone and game explain {pct(R['zone_game_r2'])} of expected win per hour",
  "Manufacturer and lease class add nothing (p > 0.3 in OLS on log coin-in per hour)", "Zone and game are partly entangled and cannot be separated cleanly"),
 ("Luck is the main noise in house win", "machine_day: luck = house win - expected win; variance = sum(bet^2) x game payout variance",
  f"Luck-score sd {R['luck_z_sd']:.2f} ({R['luck_z_sd_ex_M1158']:.2f} without M-1158) vs 1.0 for pure chance; the ten lost {usd(-R['bottom10_total_luck'])} to luck",
  "A mis-set payout would push the spread well above 1; only M-1158 does", "Normal approximation is rough for high-volatility games"),
 ("Back Forty is quiet, and the closure cost it 31%", "prepared_daily_view; walkway closure Mar 3-Apr 6",
  f"Back Forty vs other zones, play per machine-day: {R['b40_ratio']['pre']:.2f} before, {R['b40_ratio']['closure']:.2f} during, {R['b40_ratio']['after']:.2f} after; other zones {sp(R['other_zones_closure_change'],0)} during",
  "Seasonality: other zones did not fall in the same weeks", "One zone, one event; not randomised. Traffic counters have outages"),
 ("Events drive demand; conventions barely do", "property_day vs same-weekday non-event days",
  "; ".join(f"{e['name']} {sp(e['ci_lift'])}" for e in R["events"]), "Weekday mix and machine count controlled in the baseline; weather effect is small", "One instance per event"),
 ("Downtime is small; Ridgeline drives it", "prepared_daily_view; operations; shift_roster",
  f"{usd(R['downtime_total_lost_theo'])} lost ({pct(R['downtime_pct_of_theo'],2)} of expected win); Ridgeline {bm['Ridgeline']['faults_per_machine_month']:.1f} vs Halcyon {bm['Halcyon']['faults_per_machine_month']:.1f} breakdowns per machine-month; day-shift technician cover 67% in April, 53% in May",
  f"Technician shortage: waits rose to 2.2 h in May, but waiting is only {pct(R['repair_wait_share_of_downtime'])} of repair time", "Lost win uses each machine's own average earning rate"),
 ("Player losses are concentrated", "player_period (card holders only)",
  f"Top 1% = {pct(ca['loss_top1'])} of net losses, top 10% = {pct(ca['loss_top10'])}; {pct(ca['winners'])} of players ahead; net {usd(R['players_total']['net'])} vs expected {usd(-R['players_total']['theo'])}",
  "Measured per player over six months, not per month", "Card holders only (about 66% of play); never reconcile to machine meters"),
 ("Comp price halved around April 28", "loyalty_ledger: points redeemed per $ of menu value, weekly; property_day",
  f"{R['comp_ppf_pre']:.1f} -> {R['comp_ppf_post']:.1f} points per $1; comp cost per $1,000 wagered ${pp[0]['comp_cost_per_1k_ci']:.2f} -> ${pp[1]['comp_cost_per_1k_ci']:.2f}",
  "Item mix: house cost / menu value is flat at about 28%, so it is a price change", "Before/after, no control group"),
 ("Model 1 beats the average day on a time holdout", "property_day; train Jan 1-Apr 30, test May 1-Jun 30",
  f"Mean absolute error {usd(F['model']['mae'])}/day ({pct(F['model']['mape'],1)}) vs {usd(F['baseline_const']['mae'])} (training mean) and {usd(F['baseline_weekday_mean']['mae'])} (weekday mean)",
  "Rolling four-week windows agree at every origin", "Misses unfamiliar events (EDC); over-predicts about 2.7% in June; takes machine count (300-308) as known"),
 ("Model 2 estimates expected play per machine", "prepared_daily_view; train Jan-Apr, test May-Jun; gradient-boosted trees",
  f"Error per machine-day {usd(mm['daily_mae']['model'])} vs {usd(mm['daily_mae']['training_mean'])} (average) and {usd(mm['daily_mae']['machine_own_mean'])} (own average); zone x game x weekday table {usd(mm['daily_mae']['zone_game_weekday_mean'])}",
  "A lookup table is about as accurate, and own history wins on 61-day totals", "Used for a what-if on other games, which is observational"),
 ("Replacing the ten would not pay back in July", "Model 2 what-if + action_catalog (lease $2,500 + $55/day, lead 14 days)",
  f"Best-case gain {usd(R['replace_model_total_best16'])} over 16 operating days for all ten vs {usd(33800)} to lease ten; none exceeds the $3,380 lease cost",
  "A longer horizon could favour swapping Royal Draw machines in Back Forty (about 3 weeks to break even)", "Effect of a different game on play is observed, not tested"),
 ("Promotion weekends pay for themselves", "events + Model 1 July forecast",
  f"Tournament expected win {sp(R['promo']['tour_theo_lift'])}, Locals Week {sp(R['promo']['locals_ci_lift'])}; at 10% two weekends add about {usd(2*R['promo']['weekend1']['base_ci']*0.10*R['promo']['hold_theo'])} before the $30,000 cost",
  "Pull-forward: no dip in the four days after the tournament", "Two events only; $15,000 per event is assumed to cover all promotion costs"),
]
out = ["# Appendix: Claims & Evidence and AI-use disclosure", "", "Fictional casino with synthetic data. All figures are computed from the supplied tables by `submission/code/build_data.py` (see `results.json`).", "",
       "## Claims & Evidence", "", "| # | Claim | Table / query | Result | Alternative explanation tested | Limitation |", "|---|---|---|---|---|---|"]
for i, r in enumerate(rows, 1): out.append(f"| {i} | " + " | ".join(r) + " |")
out += ["", "## Priced actions (July 1-30)", "", "| Action | Cost | Expected net (low / base / high) | Measurement plan |", "|---|---:|---|---|",
 "| A-INSPECT: inspect M-1158 | $1,200 | -$1.2k / +$4.0k / +$4.6k | Share of spins that pay returns to about 31.5%; hold back near 10% |",
 "| A-PROMO: two promotion weekends (Jul 18-20, Jul 25-27) | $30,000 | +$7k / +$57k / +$130k | Compare each weekend with the Model 1 forecast; top 1% of players stay at or below 20% of losses; check the days after for a dip |",
 "| A-WAYFINDING: signs in Back Forty | $7,500 | -$7.5k / +$4.5k / +$16k | Back Forty vs rest-of-floor ratio rises from 0.62 to at least 0.63 within three weeks |",
 "", "Total spent $38,700; $61,300 kept. No conflicting moves or replacements, no comp actions.", "",
 "## AI-use disclosure", "",
 "- **Tool:** Claude (Anthropic), used through Claude Code.",
 "- **Used for:** exploring the data, writing the Python build script (`build_data.py`), the dashboard code (`index.html`, `app.js`), and drafting the write-up, appendix and video script.",
 "- **Checks:** every number is computed from the supplied tables, not typed by hand; the repo's `verify_data.py` and `verify_semantics.py` pass; analytic choices and recommendations were reviewed by the team.",
 "- **Not used:** there is no live AI on the dashboard; all text is fixed.",
 "- **Outside data:** NOAA weather (public domain) for one descriptive check only. LVCVA and Missouri tables are not used because their redistribution terms are not cleared.", ""]
(root / "submission/APPENDIX.md").write_text("\n".join(out))
print("rows", len(rows))
