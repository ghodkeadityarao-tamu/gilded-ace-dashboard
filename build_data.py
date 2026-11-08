"""Dashboard Royale - data build.

Reads the challenge parquet files and writes:
  submission/dashboard/data.js     (compact data for the interactive dashboard)
  submission/code/results.json     (headline numbers used in the write-up / appendix)

Run from the repository root:  .venv/bin/python submission/code/build_data.py

Money: all outputs in dollars. Ratios are ratio-of-sums. Inactive days (not installed /
retired) are excluded everywhere (scheduled hours = 0 there).
"""
import json, warnings
from pathlib import Path
import duckdb
import numpy as np
import pandas as pd
import statsmodels.formula.api as smf

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[2]
OUT_DASH = ROOT / "submission" / "dashboard"
OUT_CODE = ROOT / "submission" / "code"
DATA = ROOT / "data"
con = duckdb.connect()
Q = lambda s: con.sql(s).df()
P = lambda p: f"'{DATA / p}'"

R = {}  # results for the write-up

# ---------------------------------------------------------------- calendar & machines
cal = Q(f"select gaming_date, scheduled_seconds, local_weekday from {P('2_machine_decision/calendar_day.parquet')} order by 1")
dates = [str(x.date()) for x in cal.gaming_date]
D = len(dates)

md = Q(f"""
select m.machine_id, m.gaming_date, m.active, m.scheduled_seconds, m.available_seconds, m.occupied_seconds,
       m.paid_spins, m.payout_positive_spins, m.coin_in_cents, m.payout_cents, m.house_win_cents,
       m.theo_cents::double theo_cents, m.sum_bet_squared, g.payout_multiplier_variance::double v,
       g.configured_rtp::double rtp, g.hit_probability::double hp, g.volatility_class vol, g.theme
from {P('2_machine_decision/machine_day.parquet')} m join {P('2_machine_decision/game_math.parquet')} g using(config_id)
""")
pdv = Q(f"""select machine_id, gaming_date, zone_name, bank_id, manufacturer, lease_class, faults_opened
            from {P('1_prepared_views/prepared_daily_view.parquet')} where active""")
mach = Q(f"select * from {P('2_machine_decision/machines.parquet')}")

attr = (pdv.groupby("machine_id")
        .agg(zone=("zone_name", lambda s: s.mode().iat[0]), bank=("bank_id", lambda s: s.mode().iat[0]),
             mfr=("manufacturer", "first"), lease=("lease_class", "first"), faults=("faults_opened", "sum"))
        .reset_index())
gm = md[md.active].groupby("machine_id").agg(theme=("theme", "first"), vol=("vol", "first"), rtp=("rtp", "first"),
                                              hp=("hp", "first")).reset_index()
attr = attr.merge(gm, on="machine_id").merge(mach[["machine_id", "install_date", "retire_date"]], on="machine_id")
attr = attr.sort_values("machine_id").reset_index(drop=True)
mids = list(attr.machine_id)
midx = {m: i for i, m in enumerate(mids)}

md["di"] = md.gaming_date.map({pd.Timestamp(d).date(): i for i, d in enumerate(dates)})
md["mi"] = md.machine_id.map(midx)
md["ci"] = md.coin_in_cents / 100
md["hw"] = md.house_win_cents / 100
md["theo"] = md.theo_cents / 100
md["av"] = md.available_seconds / 3600
md["sch"] = md.scheduled_seconds / 3600
md["oc"] = md.occupied_seconds / 3600
md["var"] = md.sum_bet_squared * md.v / 1e4  # variance of house win in USD^2


def grid(col, dtype=float):
    a = np.zeros((len(mids), D), dtype=dtype)
    a[md.mi.values, md.di.values] = md[col].values
    return a


G = {k: grid(k) for k in ["ci", "hw", "theo", "av", "sch", "oc", "var", "paid_spins", "payout_positive_spins"]}

# ---------------------------------------------------------------- Q1: machine analysis (full period)
def machine_table(d0=0, d1=D):
    sl = slice(d0, d1)
    t = pd.DataFrame({k: G[k][:, sl].sum(1) for k in G})
    t["machine_id"] = mids
    t = t.merge(attr, on="machine_id")
    return t


def ipf_expected(t, iters=60):
    """Multiplicative zone x game model of theo per available hour, weighted by hours."""
    t = t[t.av > 0].copy()
    zf = {z: 1.0 for z in t.zone.unique()}
    gf = {g: 1.0 for g in t.theme.unique()}
    for _ in range(iters):
        for z in zf:
            s = t.zone == z
            zf[z] = t.theo[s].sum() / (t.av[s] * t.theme[s].map(gf)).sum()
        for g in gf:
            s = t.theme == g
            gf[g] = t.theo[s].sum() / (t.av[s] * t.zone[s].map(zf)).sum()
    return zf, gf


tab = machine_table()
zf, gf = ipf_expected(tab)
tab["rate"] = tab.theo / tab.av
tab["exp_rate"] = tab.zone.map(zf) * tab.theme.map(gf)
tab["appeal"] = tab.rate / tab.exp_rate
tab["luck"] = tab.hw - tab.theo
tab["z"] = tab.luck / np.sqrt(tab["var"])
tab["avail"] = tab.av / tab.sch
tab["hit_rate"] = tab.payout_positive_spins / tab.paid_spins
tab["hit_z"] = (tab.hit_rate - tab.hp) / np.sqrt(tab.hp * (1 - tab.hp) / tab.paid_spins)
full = tab[tab.sch >= 0.9 * tab.sch.max()]
R["luck_z_sd"] = float(full.z.std())
R["luck_z_sd_ex_M1158"] = float(full[full.machine_id != "M-1158"].z.std())
lg = np.log(full.appeal)
mad = np.median(np.abs(lg - np.median(lg))) * 1.4826
tab["appeal_rz"] = (np.log(tab.appeal) - np.median(lg)) / mad
R["appeal_robust_sd"] = float(mad)
R["zone_game_r2"] = None
# R2 of zone+game on theo/hr (full-tenure machines)
r = smf.ols("np.log(rate)~C(zone)+C(theme)", full).fit()
R["zone_game_r2"] = float(r.rsquared)

# decomposition of shortfall vs fleet-average full-period machine (additive, sums exactly)
Rbar = tab.theo.sum() / tab.av.sum()
SCH_FULL = tab.sch.max()
tab["baseline"] = Rbar * SCH_FULL
tab["c_tenure"] = Rbar * (SCH_FULL - tab.sch)
tab["c_avail"] = Rbar * (tab.sch - tab.av)
tab["c_struct"] = (Rbar - tab.exp_rate) * tab.av
tab["c_appeal"] = (tab.exp_rate - tab.rate) * tab.av
tab["c_luck"] = -tab.luck
chk = (tab.baseline - tab.hw) - tab[["c_tenure", "c_avail", "c_struct", "c_appeal", "c_luck"]].sum(1)
assert chk.abs().max() < 1e-6, chk.abs().max()
bottom = tab[tab.sch > 0].sort_values("hw").head(10)
R["bottom10"] = bottom[["machine_id", "zone", "theme", "sch", "hw", "theo", "luck", "z", "appeal", "avail", "hit_z",
                        "c_tenure", "c_avail", "c_struct", "c_appeal", "c_luck"]].round(3).to_dict("records")
R["bottom10_total_hw"] = float(bottom.hw.sum())
R["bottom10_total_theo"] = float(bottom.theo.sum())
R["bottom10_total_luck"] = float(bottom.luck.sum())
R["fleet_mean_hw_full_tenure"] = float(full.hw.mean())
R["n_anomalies_hit_z_gt4"] = tab[tab.hit_z.abs() > 4].machine_id.tolist()
R["n_hold_z_beyond_3p5"] = tab[tab.z.abs() > 3.5].machine_id.tolist()
R["expected_min_z_310"] = -2.9  # E[min of 310 N(0,1)] ~ -2.8..-2.9

# M-1158 detail
m58 = midx["M-1158"]
mo = np.array([d[:7] for d in dates])
rows = []
for m in sorted(set(mo)):
    s = mo == m
    sp, ht = G["paid_spins"][m58, s].sum(), G["payout_positive_spins"][m58, s].sum()
    rows.append(dict(month=m, hit_rate=ht / sp, published=float(attr.hp[m58]),
                     hold=G["hw"][m58, s].sum() / G["ci"][m58, s].sum(), theo_hold=1 - float(attr.rtp[m58])))
R["M1158_monthly"] = rows
R["M1158_shortfall_usd"] = float(-tab.luck[m58])
R["M1158_shortfall_per_day"] = float(-tab.luck[m58] / 181)
R["M1158_hold"] = float(tab.hw[m58] / tab.ci[m58])

# ---------------------------------------------------------------- Q2: demand
prop = Q(f"select * from {P('1_prepared_views/property_day.parquet')} order by gaming_date")
for c in prop.columns:
    if str(prop[c].dtype).startswith(("decimal", "Decimal", "object")) and c not in ("events_active", "local_weekday"):
        try: prop[c] = prop[c].astype(float)
        except Exception: pass
prop["ev"] = prop.events_active.fillna("")
ev = Q(f"select * from {P('4_context/events.parquet')}")
ev_short = {"EV-CES25": "CES", "EV-SB59": "Super Bowl", "EV-MM25": "March Madness", "EV-CC25": "CinemaCon",
            "EV-NAB25": "NAB", "EV-EDC25": "EDC", "EV-P-TOURN": "Slot Tournament (promo)", "EV-P-LOCALS": "Locals Week (promo)"}
ev_rows = []
nonev = prop[prop.ev == ""]
base_wd = nonev.groupby("local_weekday")[["coin_in_usd", "house_win_usd", "theo_usd"]].mean()
for _, e in ev.iterrows():
    s = prop[(prop.gaming_date >= pd.Timestamp(e.start_date)) & (prop.gaming_date <= pd.Timestamp(e.end_date))]
    # baseline: same-weekday mean on non-event days, scaled by active machines
    b = base_wd.loc[s.local_weekday].values
    lift = s[["coin_in_usd", "house_win_usd", "theo_usd"]].values / b
    daily = np.log(lift[:, 0])
    ev_rows.append(dict(id=e.event_id, name=ev_short[e.event_id], type=e.event_type, start=str(pd.Timestamp(e.start_date).date()), end=str(pd.Timestamp(e.end_date).date()),
                        days=len(s), ci_lift=float(lift[:, 0].mean() - 1), hw_lift=float(lift[:, 1].mean() - 1),
                        theo_lift=float(lift[:, 2].mean() - 1),
                        extra_ci=float((s.coin_in_usd.values - b[:, 0]).sum()), extra_theo=float((s.theo_usd.values - b[:, 2]).sum()),
                        extra_hw=float((s.house_win_usd.values - b[:, 1]).sum()), local_scope=e.local_scope))
R["events"] = ev_rows

# Back Forty natural experiment: ratio of Back Forty to other-zone coin-in per machine-day
zd = Q(f"""select gaming_date, zone_name, sum(coin_in_usd)::double ci, count(*) md, sum(theo_usd)::double theo,
           sum(available_hours) av, sum(occupied_hours) oc
           from {P('1_prepared_views/prepared_daily_view.parquet')} where active group by 1,2 order by 1,2""")
zones = sorted(zd.zone_name.unique())
ZG = {k: np.zeros((len(zones), D)) for k in ["ci", "md", "theo", "av", "oc"]}
zi = {z: i for i, z in enumerate(zones)}
di = {pd.Timestamp(d): i for i, d in enumerate(dates)}
for r_ in zd.itertuples():
    for k in ZG: ZG[k][zi[r_.zone_name], di[r_.gaming_date]] = getattr(r_, k)
b40, hl = zi["Back Forty"], zi["High-Limit Room"]
others = [i for i, z in enumerate(zones) if z not in ("Back Forty", "High-Limit Room")]
dts = pd.to_datetime(dates)
ratio = (ZG["ci"][b40] / ZG["md"][b40]) / (ZG["ci"][others].sum(0) / ZG["md"][others].sum(0))
per = {"pre": (dts < "2025-03-03"), "closure": (dts >= "2025-03-03") & (dts < "2025-04-07"),
       "after": (dts >= "2025-04-07")}
R["b40_ratio"] = {k: float(ratio[v].mean()) for k, v in per.items()}
R["b40_closure_effect"] = R["b40_ratio"]["closure"] / R["b40_ratio"]["pre"] - 1
R["b40_after_effect"] = R["b40_ratio"]["after"] / R["b40_ratio"]["pre"] - 1
# bootstrap-ish: day-level SE
sd = ratio[per["pre"]].std()
R["b40_ratio_daily_sd"] = float(sd)
R["b40_closure_t"] = float((ratio[per["closure"]].mean() - ratio[per["pre"]].mean()) / np.sqrt(sd**2 / per["pre"].sum() + ratio[per["closure"]].std()**2 / per["closure"].sum()))
R["b40_theo_per_day_after"] = float(ZG["theo"][b40][per["after"]].mean())
R["b40_ci_per_day_after"] = float(ZG["ci"][b40][per["after"]].mean())
R["other_zones_closure_change"] = float((ZG["ci"][others].sum(0)[per["closure"]] / ZG["md"][others].sum(0)[per["closure"]]).mean() /
                                       (ZG["ci"][others].sum(0)[per["pre"]] / ZG["md"][others].sum(0)[per["pre"]]).mean() - 1)
# traffic (entries per working hour) by zone and month
zt = Q(f"""select zone_id, strftime(hour_start_local,'%Y-%m') m, sum(entries_count)::double e, sum(coverage_minutes)::double cm
           from {P('4_context/zone_traffic_hourly.parquet')} where counter_status<>'offline' and hour_start_local<'2025-07-01'
           group by 1,2""")
zt["per_h"] = zt.e / zt.cm * 60
R["traffic_zone_month"] = zt.pivot(index="zone_id", columns="m", values="per_h").round(2).to_dict("index")

# weekday x weather (NOAA only; LVCVA/Missouri tables are not used: redistribution not cleared)
weather = Q(f"select source_date, tmax_c::double tmax, prcp_mm::double prcp from {P('4_context/real_sources/weather_daily.parquet')} order by 1")
prop = prop.merge(weather.rename(columns={"source_date": "gaming_date"}), on="gaming_date", how="left")
prop["lci"] = np.log(prop.coin_in_usd)
fit = smf.ols("lci~C(local_weekday)+np.log(active_machines)+I(events_active.notna())", prop.assign(events_active=prop.events_active)).fit()
R["weather_note"] = {}
fw = smf.ols("lci~C(local_weekday)+np.log(active_machines)+tmax+I(prcp>0)", prop[prop.ev == ""]).fit(cov_type="HC3")
R["weather_note"] = {"tmax_coef": float(fw.params["tmax"]), "tmax_p": float(fw.pvalues["tmax"]),
                     "rain_coef": float(fw.params["I(prcp > 0)[T.True]"]), "rain_p": float(fw.pvalues["I(prcp > 0)[T.True]"])}
# weekday coin-in profile (non-event days)
R["weekday_mean_ci"] = nonev.groupby("local_weekday").coin_in_usd.mean().round(0).to_dict()
mon = prop.assign(m=prop.gaming_date.dt.strftime("%Y-%m")).groupby("m").agg(
    ci=("coin_in_usd", "sum"), hw=("house_win_usd", "sum"), theo=("theo_usd", "sum"), av=("available_machine_hours", "sum"),
    oc=("occupied_machine_hours", "sum"), md=("active_machines", "sum"), days=("gaming_date", "count"))
mon["hold"] = mon.hw / mon.ci
mon["occ_rate"] = mon.oc / mon.av
mon["ci_per_md"] = mon.ci / mon.md
R["monthly"] = mon.round(4).reset_index().to_dict("records")

# ---------------------------------------------------------------- Q3: downtime
sch_h, av_h = G["sch"], G["av"]
theo_rate_md = np.divide(G["theo"], av_h, out=np.zeros_like(av_h), where=av_h > 0)
mrate = G["theo"].sum(1) / np.maximum(av_h.sum(1), 1e-9)  # machine's own theo per available hour
lost_h = sch_h - av_h
lost_theo = lost_h * mrate[:, None]
R["downtime_total_hours"] = float(lost_h.sum())
R["downtime_total_lost_theo"] = float(lost_theo.sum())
R["downtime_pct_of_scheduled"] = float(lost_h.sum() / sch_h.sum())
R["downtime_pct_of_theo"] = float(lost_theo.sum() / G["theo"].sum())
bymfr = {}
for m_ in attr.mfr.unique():
    s = (attr.mfr == m_).values
    bymfr[m_] = dict(machines=int(s.sum()), faults=int(attr.faults[s].sum()), lost_hours=float(lost_h[s].sum()),
                     lost_theo=float(lost_theo[s].sum()), avail=float(av_h[s].sum() / sch_h[s].sum()),
                     faults_per_machine_month=float(attr.faults[s].sum() / sch_h[s].sum() * 24 * 30.4))
R["downtime_by_mfr"] = bymfr
ops = Q(f"select * from {P('2_machine_decision/operations.parquet')} where event_type='fault_repair'")
ops["wait_h"] = (ops.work_started_at_utc - ops.opened_at_utc).dt.total_seconds() / 3600
ops["work_h"] = (ops.available_at_utc - ops.work_started_at_utc).dt.total_seconds() / 3600
ops["m"] = ops.opened_at_local.dt.strftime("%Y-%m")
opm = ops.groupby("m").agg(faults=("wait_h", "size"), wait_h=("wait_h", "mean"), work_h=("work_h", "mean"), cost=("direct_cost_cents", "sum"))
opm["cost"] /= 100
R["repair_by_month"] = opm.round(3).reset_index().to_dict("records")
R["repair_wait_share_of_downtime"] = float(ops.wait_h.sum() / (ops.wait_h.sum() + ops.work_h.sum()))
R["repair_wait_hours_total"] = float(ops.wait_h.sum())
roster = Q(f"select gaming_date, shift, planned_headcount, actual_headcount from {P('5_optional/shift_roster.parquet')} where role='slot_tech'")
roster["m"] = roster.gaming_date.dt.strftime("%Y-%m")
rs = roster.groupby(["m", "shift"]).agg(p=("planned_headcount", "sum"), a=("actual_headcount", "sum")).reset_index()
rs["fill"] = rs.a / rs.p
R["tech_fill"] = rs.pivot(index="m", columns="shift", values="fill").round(3).to_dict("index")
# hourly profile of lost hours (machine_hour)
hrs = Q(f"""select local_hour, sum(3600 - available_seconds)::double lost_s, sum(3600)::double s
            from {P('5_optional/machine_hour.parquet')} where active group by 1 order by 1""")
R["downtime_by_hour"] = (hrs.lost_s / hrs.s).round(5).tolist()
# Ridgeline fault trend by month
fm = pdv.assign(m=pdv.gaming_date.dt.strftime("%Y-%m")).groupby(["m", "manufacturer"]).faults_opened.sum().unstack()
R["faults_by_mfr_month"] = fm.to_dict("index")
# repair-time sensitivity: what removing ALL tech waiting would be worth (upper bound on technician action)
avg_rate = G["theo"].sum() / av_h.sum()
R["tech_upper_bound_6m_usd"] = float(ops.wait_h.sum() * avg_rate)
R["avg_theo_per_avail_hour"] = float(avg_rate)

# ---------------------------------------------------------------- Q4/Q5: players & comps
pp = Q(f"""select player_id, period_month, coalesce(home_region,'Unknown') reg, coalesce(age_band,'Unknown') age, opening_tier tier,
           observed_visits visits, carded_play_hours hrs, tracked_coin_in_usd::double ci, tracked_payout_usd::double pay,
           tracked_net_usd::double net, theo_usd::double theo, comps_redeemed comps, comp_face_value_usd::double face,
           comp_cost_usd::double comp, tracked_contribution_usd::double contrib, points_earned pe, points_redeemed pr,
           linked_pos_cash_usd::double cash, linked_pos_cogs_usd::double cogs
           from {P('1_prepared_views/player_period.parquet')}""")
months = sorted(pp.period_month.unique())
R["players_total"] = {k: float(pp[k].sum()) for k in ["ci", "pay", "net", "theo", "comp", "face", "contrib", "cash", "cogs"]}
R["players_unique"] = int(pp.player_id.nunique())
cube = (pp.groupby(["period_month", "reg", "age", "tier"])
        .agg(n=("player_id", "size"), visits=("visits", "sum"), hrs=("hrs", "sum"), ci=("ci", "sum"), pay=("pay", "sum"),
             net=("net", "sum"), theo=("theo", "sum"), comps=("comps", "sum"), face=("face", "sum"), comp=("comp", "sum"),
             contrib=("contrib", "sum"), pe=("pe", "sum"), pr=("pr", "sum"))
        .reset_index())


def conc(df):
    """Concentration of NET LOSS among players in df (player-level over the rows given)."""
    g = df.groupby("player_id").agg(net=("net", "sum"), ci=("ci", "sum"), contrib=("contrib", "sum"))
    if len(g) == 0: return None
    loss = (-g.net).clip(lower=0).sort_values(ascending=False).values
    tot = loss.sum()
    n = len(g)
    ci_sorted = g.ci.sort_values(ascending=False).values
    out = dict(players=int(n), winners=float((g.net > 0).mean()), net=float(g.net.sum()), ci=float(g.ci.sum()),
               median_net=float(g.net.median()), p90_loss=float(-g.net.quantile(0.10)),
               loss_top1=float(loss[: max(1, int(n * .01))].sum() / tot), loss_top5=float(loss[: max(1, int(n * .05))].sum() / tot),
               loss_top10=float(loss[: max(1, int(n * .10))].sum() / tot),
               ci_top1=float(ci_sorted[: max(1, int(n * .01))].sum() / ci_sorted.sum()),
               ci_top10=float(ci_sorted[: max(1, int(n * .10))].sum() / ci_sorted.sum()))
    # Lorenz at 21 points (share of players -> share of net loss; players ordered biggest loss first)
    cs = np.cumsum(loss) / tot
    xs = np.linspace(0, 1, 21)
    out["lorenz"] = [0.0] + [float(cs[min(n - 1, max(0, int(np.ceil(x * n)) - 1))]) for x in xs[1:]]
    return out


conc_tab = {}
periods = {"all": pp}
for m_ in months: periods[m_] = pp[pp.period_month == m_]
for pk, pdf in periods.items():
    conc_tab[pk] = {"all|all": conc(pdf)}
    for col, nm in [("reg", "region"), ("age", "age"), ("tier", "tier")]:
        for v in sorted(pdf[col].unique()):
            conc_tab[pk][f"{nm}|{v}"] = conc(pdf[pdf[col] == v])
R["conc_all"] = {k: v for k, v in conc_tab["all"]["all|all"].items() if k != "lorenz"}

# comps: ledger redemption price (points per $ of menu value) by week, and the policy break
led = Q(f"""select date_trunc('week', event_at_utc) w, sum(-points_delta)::double pts, sum(face_value_cents)/100.0 face,
            sum(economic_cost_cents)/100.0 cost, count(*) n
            from {P('3_guests/loyalty_ledger.parquet')} where event_type='redeem' and event_at_utc<'2025-07-01' group by 1 order by 1""")
led["ppf"] = led.pts / led.face
led["w"] = led.w.dt.strftime("%Y-%m-%d")
R["comp_points_per_face_usd_weekly"] = led[["w", "ppf", "n"]].round(3).to_dict("records")
dled = Q(f"""select cast(event_at_local as date) d, sum(-points_delta)::double pts, sum(face_value_cents)/100.0 face
             from {P('3_guests/loyalty_ledger.parquet')} l, (select 1) where event_type='redeem'
             and cast(event_at_local as date) between date '2025-04-20' and date '2025-05-05' group by 1 order by 1""") if False else None
try:
    dled = Q(f"""select cast(event_at_utc as date) d, sum(-points_delta)::double/(sum(face_value_cents)/100.0) ppf, count(*) n
                 from {P('3_guests/loyalty_ledger.parquet')} where event_type='redeem'
                 and cast(event_at_utc as date) between date '2025-04-22' and date '2025-05-03' group by 1 order by 1""")
    R["comp_break_daily"] = [{"d": str(r_.d), "ppf": float(r_.ppf)} for r_ in dled.itertuples()]
except Exception as e:
    R["comp_break_daily"] = []
pre = led[(led.w >= "2025-03-31") & (led.w <= "2025-04-21")]
post = led[(led.w >= "2025-05-05")]
R["comp_ppf_pre"], R["comp_ppf_post"] = float(pre.ppf.mean()), float(post.ppf.mean())
R["comp_price_cut_pct"] = float(post.ppf.mean() / pre.ppf.mean() - 1)
# effect on property: split by gaming date 2025-04-28
prop["post_comp"] = prop.gaming_date >= "2025-04-29"
pc = prop.groupby("post_comp").agg(face=("comp_face_value_usd", "sum"), cost=("comp_cost_usd", "sum"), ci=("coin_in_usd", "sum"),
                                  ca=("carded_coin_in_share", "mean"), days=("gaming_date", "count"), cash=("pos_cash_usd", "sum"))
pc["face_per_day"] = pc.face / pc.days
pc["cost_per_day"] = pc.cost / pc.days
pc["comp_cost_per_1k_ci"] = pc.cost / pc.ci * 1000
R["comp_pre_post"] = pc.round(4).reset_index().to_dict("records")
# carded behaviour pre/post (per active carded player-month proxy: coin-in per visit)
m_ = pp.assign(post=pp.period_month >= "2025-05")
beh = m_.groupby("post").agg(ci=("ci", "sum"), visits=("visits", "sum"), n=("player_id", "size"), face=("face", "sum"), comp=("comp", "sum"))
beh["ci_per_visit"] = beh.ci / beh.visits
beh["ci_per_playermonth"] = beh.ci / beh.n
R["comp_behaviour"] = beh.round(3).reset_index().to_dict("records")
# model-adjusted check: log(daily carded share-adjusted coin-in per machine) with weekday+event controls, post indicator
prop["cipm"] = prop.coin_in_usd / prop.active_machines
cmod = smf.ols("np.log(cipm)~C(local_weekday)+I(ev!='')+post_comp+gaming_date.dt.dayofyear", prop.assign()).fit(cov_type="HC3")
R["comp_post_effect_on_coin_in"] = {"coef": float(cmod.params["post_comp[T.True]"]), "se": float(cmod.bse["post_comp[T.True]"]),
                                    "p": float(cmod.pvalues["post_comp[T.True]"])}
cmod2 = smf.ols("np.log(cipm)~C(local_weekday)+I(ev!='')+post_comp", prop).fit(cov_type="HC3")
R["comp_post_effect_no_trend"] = {"coef": float(cmod2.params["post_comp[T.True]"]), "se": float(cmod2.bse["post_comp[T.True]"])}

# ---------------------------------------------------------------- forecast (pre-specified; fit on Jan-Apr only)
fc = prop[["gaming_date", "local_weekday", "coin_in_usd", "active_machines", "ev"]].copy()
fc["y"] = fc.coin_in_usd
fc["ypm"] = fc.y / fc.active_machines
fc["wd"] = fc.local_weekday
train = fc[fc.gaming_date < "2025-05-01"]
test = fc[fc.gaming_date >= "2025-05-01"]


def fit_predict(train, df):
    """Weekday profile (per machine, non-event days) scaled to the trailing 28-day level of the training window."""
    base = train[train.ev == ""]
    prof = base.groupby("wd").ypm.mean()
    prof = prof / prof.mean()
    last = train.tail(28)
    lvl = (last.ypm / last.wd.map(prof)).mean()  # per-machine level, event days included, trailing 28d
    # use non-event days only for the level to avoid inflating it
    lvl_ne = (last[last.ev == ""].ypm / last[last.ev == ""].wd.map(prof)).mean()
    return df.wd.map(prof).values * lvl_ne * df.active_machines.values, prof, lvl_ne


const_pred = np.full(len(test), train.y.mean())
wd_pred = test.wd.map(train.groupby("wd").y.mean()).values
mdl_pred, prof, lvl = fit_predict(train, test)
mae = lambda a, b: float(np.mean(np.abs(a - b)))
mape = lambda a, b: float(np.mean(np.abs(a - b) / a))
y = test.y.values
R["forecast"] = {
    "train": [str(train.gaming_date.min().date()), str(train.gaming_date.max().date())],
    "test": [str(test.gaming_date.min().date()), str(test.gaming_date.max().date())],
    "n_test": int(len(test)),
    "baseline_const": dict(mae=mae(y, const_pred), mape=mape(y, const_pred), bias=float((const_pred - y).mean())),
    "baseline_weekday_mean": dict(mae=mae(y, wd_pred), mape=mape(y, wd_pred), bias=float((wd_pred - y).mean())),
    "model": dict(mae=mae(y, mdl_pred), mape=mape(y, mdl_pred), bias=float((mdl_pred - y).mean())),
    "model_nonevent_days_mae": mae(y[test.ev.values == ""], mdl_pred[test.ev.values == ""]),
    "const_nonevent_days_mae": mae(y[test.ev.values == ""], const_pred[test.ev.values == ""]),
    "model_event_days_mae": mae(y[test.ev.values != ""], mdl_pred[test.ev.values != ""]),
    "weekday_profile": {k: float(v) for k, v in prof.items()},
    "level_per_machine": float(lvl),
}
# rolling-origin check (expanding window, 4-week horizon) as robustness
ro = []
for cut in pd.to_datetime(["2025-03-01", "2025-04-01", "2025-05-01"]):
    tr_ = fc[fc.gaming_date < cut]; te_ = fc[(fc.gaming_date >= cut) & (fc.gaming_date < cut + pd.Timedelta(days=28))]
    pm, _, _ = fit_predict(tr_, te_)
    ro.append(dict(origin=str(cut.date()), model=mae(te_.y.values, pm), const=mae(te_.y.values, np.full(len(te_), tr_.y.mean())),
                   n=int(len(te_))))
R["forecast"]["rolling"] = ro
# 80% interval from training residuals of in-sample profile (ratio errors)
resid = (train[train.ev == ""].y.values / (train[train.ev == ""].wd.map(prof).values * lvl * train[train.ev == ""].active_machines.values))
R["forecast"]["ratio_q10_q90"] = [float(np.quantile(resid, .1)), float(np.quantile(resid, .9))]
# final July projection: refit on Jan-Jun (non-event days), horizon Jul 1-30
full_train = fc
fut = pd.DataFrame({"gaming_date": pd.date_range("2025-07-01", "2025-07-30")})
fut["wd"] = fut.gaming_date.dt.strftime("%a")
fut["active_machines"] = 308
mp, prof2, lvl2 = fit_predict(full_train, fut)
fut["pred"] = mp
R["forecast"]["july"] = [{"d": str(r_.gaming_date.date()), "wd": r_.wd, "pred": float(r_.pred)} for r_ in fut.itertuples()]
R["forecast"]["july_total"] = float(fut.pred.sum())
R["forecast"]["profile_final"] = {k: float(v) for k, v in prof2.items()}
R["forecast"]["level_final"] = float(lvl2)
# full-period fitted/predicted series for the chart
all_pred, _, _ = fit_predict(train, fc)  # frozen on Jan-Apr
fc["pred"] = all_pred
fc["pred_const"] = train.y.mean()
FC_SERIES = {"pred": fc.pred.round(0).tolist(), "const": [round(float(train.y.mean()))] * len(fc)}

# ---------------------------------------------------------------- recommendations: priced
cat = Q(f"select * from {P('2_machine_decision/action_catalog.parquet')}")
cat_rows = cat.to_dict("records")
GAME_RATE = {k: float(v) for k, v in gf.items()}

# promo: use the property's own tournament weekend as the empirical analogue (single event -> wide range)
tour = [e for e in ev_rows if e["id"] == "EV-P-TOURN"][0]
locals_ = [e for e in ev_rows if e["id"] == "EV-P-LOCALS"][0]
# July weekend baselines from the frozen forecast (Fri-Sun)
jul = fut.copy()
def weekend_theo_base(d):
    s = jul[(jul.gaming_date >= d) & (jul.gaming_date <= pd.Timestamp(d) + pd.Timedelta(days=2))]
    return float(s.pred.sum())
promo_ci_base = weekend_theo_base("2025-07-18")  # Fri Jul 18 - Sun Jul 20 (lead 14 days from Jul 1 -> day 15 = Jul 15)
promo_ci_base2 = weekend_theo_base("2025-07-25")
hold_theo = float(prop.theo_usd.sum() / prop.coin_in_usd.sum())
R["promo"] = dict(tour_ci_lift=tour["ci_lift"], tour_theo_lift=tour["theo_lift"], tour_extra_theo=tour["extra_theo"],
                  locals_ci_lift=locals_["ci_lift"], hold_theo=hold_theo,
                  weekend1=dict(dates=["2025-07-18", "2025-07-20"], base_ci=promo_ci_base), weekend2=dict(dates=["2025-07-25", "2025-07-27"], base_ci=promo_ci_base2))
R["tournament_event_check"] = dict(ci_lift=tour["ci_lift"], hw_lift=tour["hw_lift"])

# Back Forty signage: break-even lift
b40_theo_day = R["b40_theo_per_day_after"]
sign_days = 30 - 10
R["signage"] = dict(theo_per_day=b40_theo_day, effective_days=sign_days, cost=7500.0,
                    breakeven_lift=7500.0 / (b40_theo_day * sign_days), hl_theo_per_day=float(ZG["theo"][hl][-60:].mean()),
                    b40_machines=int(ZG["md"][b40][-1]))
# comp
R["comp_pilot"] = dict(cost=4000.0)
# replacement economics (why not replace)
repl = bottom[["machine_id", "zone", "theme", "exp_rate", "rate", "appeal", "av", "sch"]].copy()
repl["upside_30d"] = np.maximum(0, (1 - repl.appeal)) * repl.exp_rate * 24 * 30
R["replace_bottom10"] = dict(upside_30d_total=float(repl.upside_30d.sum()),
                             lease_cost_each=3380.0, buy_cost_each=22000.0,
                             lease_total=10 * 3380.0, buy_total=10 * 22000.0)
# preventive maintenance Ridgeline economics
rl = bymfr["Ridgeline"]
pm_days = 30 - 7
rl_lost_per_month = rl["lost_theo"] / 6
rl_machines = rl["machines"]
rl_rate = float(G["theo"][(attr.mfr == "Ridgeline").values].sum() / G["av"][(attr.mfr == "Ridgeline").values].sum())
pm_downtime_cost = 94 * 1.5 * rl_rate
R["pm"] = dict(cost=9000.0, ridgeline_lost_theo_per_month=rl_lost_per_month, pm_downtime_cost=pm_downtime_cost,
               benefit_if_faults_cut_30pct=0.30 * rl_lost_per_month * pm_days / 30, rl_rate=rl_rate, rl_machines=rl_machines)
R["tech"] = dict(cost=11520.0, upper_bound_month=R["tech_upper_bound_6m_usd"] / 6)

# ---------------------------------------------------------------- machine-level model (Model 2)
from sklearn.ensemble import HistGradientBoostingRegressor

mdv = Q(f"""select machine_id, gaming_date, zone_name zone, theme, configured_rtp::double rtp, coin_in_usd::double ci,
            local_weekday wd, federal_holiday, events_active ev, bank_id
            from {P('1_prepared_views/prepared_daily_view.parquet')} where active""")
mdv["ev"] = mdv.ev.fillna("")
mdv["dow"] = pd.to_datetime(mdv.gaming_date).dt.dayofweek
mdv["hol"] = mdv.federal_holiday.notna().astype(int)
for k, pat in [("f_sport", "Super Bowl|College"), ("f_conv", "CES|CinemaCon|NAB"), ("f_fest", "EDC"), ("f_promo", "Winter Slot|Locals")]:
    mdv[k] = mdv.ev.str.contains(pat).astype(int)
mdv["f_closure"] = ((mdv.zone == "Back Forty") & (mdv.gaming_date >= "2025-03-03") & (mdv.gaming_date < "2025-04-07")).astype(int)
ZONES_L, THEMES_L = sorted(mdv.zone.unique()), sorted(mdv.theme.unique())
mdv["zc"] = mdv.zone.map({z: i for i, z in enumerate(ZONES_L)}); mdv["tc"] = mdv.theme.map({t: i for i, t in enumerate(THEMES_L)})
FEATS = ["zc", "tc", "dow", "hol", "f_sport", "f_conv", "f_fest", "f_promo", "f_closure"]
trn = mdv[mdv.gaming_date < "2025-05-01"]; tst = mdv[mdv.gaming_date >= "2025-05-01"].copy()
gbm = HistGradientBoostingRegressor(max_iter=300, learning_rate=.06, max_depth=5, categorical_features=[0, 1], random_state=7).fit(trn[FEATS], trn.ci)
tst["pred"] = gbm.predict(tst[FEATS])
tst["b_const"] = trn.ci.mean()
own = trn.groupby("machine_id").ci.mean(); zt = trn.groupby(["zone", "theme"]).ci.mean(); zt_wd = trn.groupby(["zone", "theme", "dow"]).ci.mean()
tst["b_own"] = tst.machine_id.map(own)
tst["b_peer"] = [zt.get((a, b), trn.ci.mean()) for a, b in zip(tst.zone, tst.theme)]
tst["b_own"] = tst.b_own.fillna(tst.b_peer)
tst["b_peerwd"] = [zt_wd.get((a, b, c), np.nan) for a, b, c in zip(tst.zone, tst.theme, tst.dow)]
tst["b_peerwd"] = tst.b_peerwd.fillna(tst.b_peer)
mae_d = lambda c: float(np.mean(np.abs(tst.ci - tst[c])))
tot = tst.groupby("machine_id").agg(ci=("ci", "sum"), pred=("pred", "sum"), b_own=("b_own", "sum"), b_peer=("b_peer", "sum"), b_peerwd=("b_peerwd", "sum"), b_const=("b_const", "sum"), n=("ci", "size"))
mae_m = lambda c: float(np.mean(np.abs(tot.ci - tot[c])))
cols_ = [("model", "pred"), ("training_mean", "b_const"), ("machine_own_mean", "b_own"), ("zone_game_mean", "b_peer"), ("zone_game_weekday_mean", "b_peerwd")]
mm = {"train": ["2025-01-01", "2025-04-30"], "test": ["2025-05-01", "2025-06-30"], "n_train_rows": int(len(trn)), "n_test_rows": int(len(tst)),
      "features": ["zone", "game", "weekday", "holiday", "event type flags", "Back Forty closure flag"],
      "daily_mae": {k: mae_d(c) for k, c in cols_}, "total_mae": {k: mae_m(c) for k, c in cols_},
      "mean_daily_ci": float(tst.ci.mean()), "mean_total_ci": float(tot.ci.mean())}
newm = set(trn.groupby("machine_id").size()[lambda x: x < 30].index) | (set(tst.machine_id) - set(trn.machine_id))
tn = tst[tst.machine_id.isin(newm)]
mm["new_machines"] = {"n": len(newm), "rows": int(len(tn)), "daily_mae_model": float(np.mean(np.abs(tn.ci - tn.pred))) if len(tn) else None,
                      "daily_mae_fallback": float(np.mean(np.abs(tn.ci - tn.b_own))) if len(tn) else None}
R["machine_model"] = mm
MM_SCATTER = [{"id": i, "actual": round(float(r.ci), 0), "pred": round(float(r.pred), 0), "own": round(float(r.b_own), 0)} for i, r in tot.iterrows()]

gbm2 = HistGradientBoostingRegressor(max_iter=300, learning_rate=.06, max_depth=5, categorical_features=[0, 1], random_state=7).fit(mdv[FEATS], mdv.ci)
rtp_by_theme = mdv.groupby("theme").rtp.first().to_dict()
jul_days = pd.date_range("2025-07-15", "2025-07-30")  # first 16 operating days after a 14-day lead
def expected_win_per_day(zone, theme):
    X = pd.DataFrame({"zc": ZONES_L.index(zone), "tc": THEMES_L.index(theme), "dow": jul_days.dayofweek, "hol": 0, "f_sport": 0, "f_conv": 0, "f_fest": 0, "f_promo": 0, "f_closure": 0})
    return float(gbm2.predict(X[FEATS]).mean() * (1 - rtp_by_theme[theme]))
repl_rows = []
for r_ in bottom.itertuples():
    zone, theme = r_.zone, r_.theme
    cur = expected_win_per_day(zone, theme)
    alts = {t: expected_win_per_day(zone, t) for t in THEMES_L if t != theme}
    best_t = max(alts, key=alts.get); med = float(np.median(list(alts.values())))
    repl_rows.append(dict(id=r_.machine_id, zone=zone, theme=theme, cur_per_day=cur, best_theme=best_t, best_per_day=alts[best_t], median_per_day=med,
                          gain16_best=(alts[best_t] - cur) * 16, gain16_median=(med - cur) * 16, lease_cost=3380.0, buy_cost=22000.0))
R["replace_model"] = repl_rows
R["replace_model_total_best16"] = float(sum(max(0, x["gain16_best"]) for x in repl_rows))
R["replace_model_total_median16"] = float(sum(x["gain16_median"] for x in repl_rows))
R["replace_n_worth_lease_best"] = int(sum(x["gain16_best"] > x["lease_cost"] for x in repl_rows))
R["replace_n_worth_lease_median"] = int(sum(x["gain16_median"] > x["lease_cost"] for x in repl_rows))

# ---------------------------------------------------------------- write dashboard data
def r1(a, n=1): return np.round(a, n).tolist()

machines_out = []
for i, m_ in enumerate(mids):
    a = attr.iloc[i]
    machines_out.append(dict(id=m_, zone=a.zone, bank=a.bank, theme=a.theme, vol=a.vol, mfr=a.mfr, lease=a.lease, rtp=float(a.rtp),
                             hp=float(a.hp), faults=int(a.faults),
                             ci=r1(G["ci"][i], 0), hw=r1(G["hw"][i], 1), theo=r1(G["theo"][i], 1), av=r1(G["av"][i], 2),
                             sch=r1(G["sch"][i], 2), oc=r1(G["oc"][i], 2), var=np.round(G["var"][i], 0).tolist(),
                             sp=G["paid_spins"][i].astype(int).tolist(), ht=G["payout_positive_spins"][i].astype(int).tolist()))

prop_out = dict(
    dates=dates, wd=list(prop.local_weekday), ev=[(e or "") for e in prop.ev],
    ci=r1(prop.coin_in_usd, 0), pay=r1(prop.payout_usd, 0), hw=r1(prop.house_win_usd, 0), theo=r1(prop.theo_usd, 0),
    av=r1(prop.available_machine_hours, 1), oc=r1(prop.occupied_machine_hours, 1), am=prop.active_machines.astype(int).tolist(),
    carded=np.round(prop.carded_coin_in_share, 4).tolist(), cash=r1(prop.pos_cash_usd, 0), cogs=r1(prop.pos_cogs_usd, 0),
    face=r1(prop.comp_face_value_usd, 0), comp=r1(prop.comp_cost_usd, 0), faults=prop.faults_opened.astype(int).tolist(),
    contrib=r1(prop.contribution_after_supplied_costs_usd, 0), entries=prop.total_zone_entries_observed.fillna(0).astype(int).tolist(),
    cover=np.round(prop.counter_coverage_share.fillna(0), 3).tolist(), supplied=r1(prop.machine_supplied_costs_usd, 0),
    labor=r1(prop.tech_labor_cost_usd, 0), incidents=prop.incidents_reported.fillna(0).astype(int).tolist())

zone_out = dict(zones=zones, **{k: [r1(ZG[k][i], 1) for i in range(len(zones))] for k in ZG})

cube_out = dict(cols=["m", "reg", "age", "tier", "n", "visits", "hrs", "ci", "pay", "net", "theo", "comps", "face", "comp", "contrib", "pe", "pr"],
                rows=[[r_.period_month, r_.reg, r_.age, r_.tier, int(r_.n), int(r_.visits), round(r_.hrs, 1), round(r_.ci, 0), round(r_.pay, 0),
                       round(r_.net, 0), round(r_.theo, 0), int(r_.comps), round(r_.face, 0), round(r_.comp, 0), round(r_.contrib, 0),
                       int(r_.pe), int(r_.pr)] for r_ in cube.itertuples()])

blob = dict(machines=machines_out, prop=prop_out, zones=zone_out, cube=cube_out, conc=conc_tab, events=ev_rows, mm_scatter=MM_SCATTER,
            catalog=cat_rows, results=R, fc=FC_SERIES,
            comp_weekly=R["comp_points_per_face_usd_weekly"], traffic=R["traffic_zone_month"],
            decomposition_baseline=dict(rbar=float(Rbar), sch_full=float(SCH_FULL)),
            zone_factor=zf, game_factor=gf, repair=R["repair_by_month"], tech_fill=R["tech_fill"],
            dt_hour=R["downtime_by_hour"], faults_mfr_month=R["faults_by_mfr_month"])


def default(o):
    if isinstance(o, (np.integer,)): return int(o)
    if isinstance(o, (np.floating,)): return float(o)
    if isinstance(o, (pd.Timestamp,)): return str(o.date())
    if isinstance(o, (np.ndarray,)): return o.tolist()
    return str(o)


OUT_DASH.mkdir(parents=True, exist_ok=True)
(OUT_DASH / "data.js").write_text("window.DATA=" + json.dumps(blob, default=default, separators=(",", ":")) + ";")
(OUT_CODE / "results.json").write_text(json.dumps(R, default=default, indent=1))
print("data.js", round((OUT_DASH / "data.js").stat().st_size / 1e6, 2), "MB")
print(json.dumps({k: R[k] for k in ["luck_z_sd", "luck_z_sd_ex_M1158", "zone_game_r2", "appeal_robust_sd", "bottom10_total_hw", "bottom10_total_theo",
                                    "bottom10_total_luck", "n_anomalies_hit_z_gt4", "n_hold_z_beyond_3p5", "b40_ratio", "b40_closure_effect",
                                    "b40_after_effect", "b40_closure_t", "other_zones_closure_change", "downtime_total_lost_theo",
                                    "downtime_pct_of_scheduled", "downtime_pct_of_theo", "repair_wait_share_of_downtime", "comp_ppf_pre",
                                    "comp_ppf_post", "comp_price_cut_pct", "conc_all", "forecast", "promo", "signage", "pm", "tech",
                                    "replace_bottom10", "comp_post_effect_on_coin_in", "comp_post_effect_no_trend", "comp_pre_post",
                                    "comp_behaviour", "weather_note", "M1158_shortfall_usd", "M1158_hold", "players_total"]}, default=default, indent=1))
