"""Write the Claims & Evidence appendix (APPENDIX.md) from results.json, so every number matches the dashboard."""
import json
from pathlib import Path
root = Path(__file__).resolve().parents[2]
R = json.loads((root / "submission/code/results.json").read_text())
usd = lambda n: ("-" if n < 0 else "") + "$" + f"{abs(n):,.0f}"
k = lambda n: ("-" if n < 0 else "") + "$" + f"{abs(n)/1000:.1f}k"
M = lambda n: ("-" if n < 0 else "") + "$" + f"{abs(n)/1e6:.1f}M"
pct = lambda x, d=0: f"{x*100:.{d}f}%"
sp = lambda x, d=0: ("+" if x >= 0 else "-") + f"{abs(x)*100:.{d}f}%"
F, bm, ca, pp, mm = R["forecast"], R["downtime_by_mfr"], R["conc_all"], R["comp_pre_post"], R["machine_model"]
m58 = next(b for b in R["bottom10"] if b["machine_id"] == "M-1158")
hr = sum(r["hit_rate"] for r in R["M1158_monthly"]) / len(R["M1158_monthly"]); pub = R["M1158_monthly"][0]["published"]
ev = {e["name"]: e for e in R["events"]}
gains = [x["gain16_best"] for x in R["replace_model"]]
rows = [
 ("M-1158 has a payout anomaly", "machine_day, game_math: hit rate vs published",
  f"Pays on {pct(hr,1)} of spins vs {pct(pub,1)} published (z = {m58['hit_z']:.0f}); hold {pct(R['M1158_hold'],1)} vs 10% design",
  "Bad luck: the gap is steady at 38-39% every month", "Cause unknown; a lead to inspect, not an accusation"),
 ("The other nine are low for ordinary reasons", "prepared_daily_view: zone x game benchmark, luck score",
  f"Zone and game explain {pct(R['zone_game_r2'])} of expected win per hour; luck spread {R['luck_z_sd_ex_M1158']:.2f} vs 1.0 for chance; the ten lost {k(-R['bottom10_total_luck'])} to luck",
  "Manufacturer and lease type add nothing", "Zone and game cannot be fully separated"),
 ("Back Forty is quiet, and the closure cost it 31%", "prepared_daily_view: before, during, after Mar 3-Apr 6",
  f"Play vs other zones: {R['b40_ratio']['pre']:.2f} to {R['b40_ratio']['closure']:.2f} to {R['b40_ratio']['after']:.2f}; other zones {sp(R['other_zones_closure_change'])}",
  "Seasonality: other zones did not fall", "One zone, one event; not randomised"),
 ("Events drive demand; conventions barely do", "property_day vs same-weekday normal days",
  f"Super Bowl {sp(ev['Super Bowl']['ci_lift'])}, March Madness {sp(ev['March Madness']['ci_lift'])}, tournament {sp(ev['Slot Tournament (promo)']['ci_lift'])}, EDC {sp(ev['EDC']['ci_lift'])}, CES {sp(ev['CES']['ci_lift'])}",
  "Weekday and machine count are controlled", "One instance of each event"),
 ("Downtime is small", "prepared_daily_view, operations",
  f"{k(R['downtime_total_lost_theo'])} lost ({pct(R['downtime_pct_of_theo'],2)} of expected win); Ridgeline {bm['Ridgeline']['faults_per_machine_month']:.1f} vs Halcyon {bm['Halcyon']['faults_per_machine_month']:.1f} breakdowns per machine-month",
  f"Technician shortage: waiting is only {pct(R['repair_wait_share_of_downtime'])} of repair time", "Uses each machine's average earning rate"),
 ("Player losses are concentrated", "player_period",
  f"Top 1% of players = {pct(ca['loss_top1'])} of losses; net {M(R['players_total']['net'])} vs expected {M(-R['players_total']['theo'])}",
  "Measured per player over six months", "Card holders only (about 66% of play)"),
 ("Comps got twice as cheap around April 28", "loyalty_ledger, property_day",
  f"{R['comp_ppf_pre']:.1f} to {R['comp_ppf_post']:.1f} points per $1; comp cost per $1,000 wagered ${pp[0]['comp_cost_per_1k_ci']:.2f} to ${pp[1]['comp_cost_per_1k_ci']:.2f}",
  "Item mix: house cost / menu value is flat", "Before and after, no control group"),
 ("The forecast beats a simple baseline", "property_day: train Jan-Apr, test May-Jun",
  f"Error {k(F['model']['mae'])} a day ({pct(F['model']['mape'],1)}) vs {k(F['baseline_const']['mae'])} for the average day",
  "Rolling four-week windows agree", "Misses unfamiliar events such as EDC"),
 ("Replacing the ten would not pay back in July", "Model 2 what-if, action_catalog",
  f"Best swap gains {k(min(gains))}-{k(max(gains))} per machine over 16 days vs a $3,380 lease; a lookup table is as accurate as Model 2",
  "A longer horizon could favour Royal Draw swaps in Back Forty", "Effect of a different game is observed, not tested"),
 ("Promotion weekends pay for themselves", "events, Model 1 July forecast",
  f"Tournament {sp(R['promo']['tour_theo_lift'])} expected win, Locals Week {sp(R['promo']['locals_ci_lift'])}; at 10%, two weekends add about {k(2*R['promo']['weekend1']['base_ci']*0.10*R['promo']['hold_theo'])} before cost",
  "No dip in the four days after the tournament", "Two past events; $15,000 each assumed to cover all costs"),
]
out = ["# Appendix: Claims & Evidence and AI-use disclosure", "",
       "Fictional casino with synthetic data. Every figure is computed from the supplied tables by `build_data.py` (see `results.json`).", "",
       "## Claims & Evidence", "", "| # | Claim | Table / query | Result | Alternative explanation | Limitation |", "|---|---|---|---|---|---|"]
for i, r in enumerate(rows, 1): out.append(f"| {i} | " + " | ".join(r) + " |")
out += ["", "## AI-use disclosure", "",
 "- **Tool:** Claude (Anthropic), used through Claude Code.",
 "- **Used for:** exploring the data, writing the Python and dashboard code, and drafting the text.",
 "- **Not used:** there is no live AI on the dashboard, and every number comes from the supplied tables. Outside data: NOAA weather only, for one descriptive check.", ""]
(root / "submission/APPENDIX.md").write_text("\n".join(out))
print("rows", len(rows))
