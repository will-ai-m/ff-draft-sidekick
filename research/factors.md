# Factors That Affect Fantasy Football Performance — Research Synthesis (July 2026)

Synthesized from nine web-grounded research passes over published analytics work (PFF, 4for4, RotoViz, Establish The Run, Open Source Football, Football Outsiders/FTN, SumerSports, peer-reviewed sports-medicine literature). Every effect size below traces to a fetched source; full citations live in the per-topic agent reports. Ratings: **signal** = predictive power for fantasy points, **stability** = year-over-year stickiness, **use** = Draft / Weekly / Both.

## The one pattern that organizes everything

**Volume/opportunity metrics are sticky (r ≈ 0.5–0.7 YoY); efficiency and scoring-rate metrics are noise (r ≈ 0.0–0.3).** Targets, target share, air-yards share, WOPR, snap/route participation persist. TD rate, YPC, red-zone conversion, fumble recovery, INT rate, catchable-target rate all regress hard. Rank players on opportunity; use efficiency deviations as regression flags, not as skill.

---

## TIER 1 — High signal, cheap to build (implement first)

| Factor | Key numbers | Stability | Use |
|---|---|---|---|
| **Opportunity metrics** (targets, target share, air-yards share, WOPR = 1.5×TgtShare + 0.7×AirYdsShare, expected fantasy points) | WOPR/target-share/air-yards-share all >0.70 YoY correlation — the stickiest stats in football; raw targets ~0.95 correlated with WR PPR points | High | Both |
| **TD regression (xTD vs actual)** | Raw receiving-TD YoY R² = 0.03–0.08 (near-zero); xTD stickiness 0.38 vs 0.28 raw; historical regression flags hit 90.7% (137/151) | The *regression* is reliable, the TDs aren't | Draft primarily |
| **Vegas implied team totals & spreads** | Most information-dense single pregame number for scoring volume; spread drives game script: pass rate 50% leading / 56% tied / 66% trailing; RB target share doubles when trailing (29%→52%) | Mechanism stable across seasons | Weekly |
| **Vegas season win totals** | QBs on high-win-total teams: 18.4–18.5 pts/gm vs 14.2 on low; RBs 26.6 vs 20.6 — replicated across two independent seasons (PFF/Barrett) | Mechanism durable | Draft |
| **Injury designations** | Questionable plays ~71% of the time, Doubtful ~6%; playing-through penalties: RB −8.7%, WR −9.9% (foot −20 to −25%), TE −8.5%, QB ≈ no effect | Aggregate rates stable; team reporting culture varies | Weekly |
| **Pace + PROE** | Pace YoY r = 0.43–0.47 when QB or HC is retained (drops to ~0.31–0.39 when one changes); ~24-pt spread in neutral-script pass probability between extreme teams; PROE early-season R² to full season = 0.32, adjusted pace = 0.47 | Moderate-good — best of the "team environment" factors | Both |
| **Snap share / route participation trends** | Leading indicator of role change; industry consensus is strong but one direct test found weak same-season correlation — use as alert, not score | Mixed | Weekly |

## TIER 2 — Real, quantified, secondary adjustments

| Factor | Key numbers | Stability | Use |
|---|---|---|---|
| **Wind** (best weather factor) | Completion % 60.3 → 54.7 above 20 mph; deep-pass rate −6% relative; ~15 mph is onset threshold; kicking distance/accuracy suffers; crosswinds worst | High (physics) | Weekly |
| **Dome vs outdoor** | +9% combined scoring indoors (46.2 vs 42.4 pts/gm); completion 61.1% vs 58.8% | Very high | Both |
| **Cold + dome-team interaction** | Dome teams 0-8 on road at ≤20°F, 3-23 at ≤30°F; effect is temperature-driven acclimation, not wind; home cold-weather team YPC rises 4.05→4.30+ below freezing | Directionally stable (dated study) | Weekly |
| **Rain / snow** | Rain is overrated: <5% effect on most metrics, moderate rain −4.7% pass rate, +7.7% RB targets; snow is large (−7 to −12 pts FG%, ~25% scoring drop) but rare | Direction stable, magnitude noisy | Weekly |
| **OL quality (RB rushing only)** | Adjusted Line Yards → RB fantasy: R² ≈ 0.29–0.46 (stronger at extremes, ~0.59 top/bottom-10); ~zero effect on RB receiving and only ~14% of QB fantasy variance; metric choice matters (ALY ≫ ESPN win rates) | Moderate; one-tier nudge, not several | Draft; injury-replacement projection in-season |
| **QB quality / catchable target rate** | Explains big WR over/under-performance (e.g., Higgins 78% CTR with Burrow vs 58% without) but CTR itself is unstable (~0.28–0.29 YoY) | Low stability → use as a **re-rate trigger when the QB changes**, not a static multiplier | Both |
| **Red zone: trips vs conversion** | Trip rate is sticky (r ≈ 0.65 with overall offense quality); conversion/efficiency is noise (YoY ~0.01–0.24); player RZ conversion ≥40% regressed down 92% of the time, <12% regressed up 92% | Split factor: keep trips, regress conversion | Draft |
| **Age curves** | RB peak 25.5, steep decline post-28, no 15+ PPG age-33 seasons since 2000; WR peak 26–28, cliff at 32; TE later peak, holds to 34; QB plateau 25–33 (dual-threat rushing falls off post-29) | High as population prior | Draft |
| **Draft capital (years 1–3)** | R1–2 RBs = ~55% RB1-season hit rate vs ~6% for R4; R4+ WRs = 4.4% top-30 hit rate; decays as real usage data accumulates | High early, decays | Draft |
| **Rookie/prospect metrics** | Draft capital r ≈ 0.29, College Dominator r ≈ 0.22, Breakout Age r ≈ 0.43 (lower confidence) to NFL production; combine athleticism ~useless for WR fantasy (r = 0.014 RAS) | One-time inputs | Draft |
| **Injury-type recurrence** | ACL: 25% re-injury (vs 9% controls), large multi-season production deficits for RB/WR; hamstring: 38.4% recurrence, 11.9% same-season; generalized "injury-prone" is NOT supported | Specific-injury recurrence real; general fragility myth | Both |
| **Coach 4th-down aggressiveness** | r = 0.30 to offensive EPA/play; sticky coach trait YoY | Moderate | Both |
| **Personnel groupings** | League drifting heavier (11-personnel 63%→58% 2023–25); heavy sets concentrate targets on WR1/TE, shrink WR3/flex pool | Scheme-driven, gradual drift | Both |
| **Home/away** | DST +1.3 pts (~21%), QB +7%, K +0.2–0.5, WR ≈ 0 — tiebreaker only | Weak, time-varying | Weekly |
| **Garbage time (audit lens)** | Inflates WR/pass-catcher stats far more than RB; audit prior-year box scores for garbage-time share before projecting forward | Not a repeatable skill | Draft audit |

## TIER 3 — Narrow, weak, or hand-maintained

- **Coordinator/play-caller changes** — no rigorous quantitative study exists (explicit industry gap); 21/32 teams changed OC in 2026. Treat as an **uncertainty widener** (wider projection intervals), not a point adjustment. Requires a hand-maintained coach/play-caller table (no free structured dataset).
- **Coaching-tree "scheme stickiness"** — weak prior; McDaniels counterexample (top-8 with Belichick, 22nd-place average elsewhere). Scheme travels inconsistently once separated from personnel.
- **Circadian/travel** — West Coast teams beat the spread in 66% of *night* games vs East Coast opponents (5.26 pts ATS, 1970–2011, published in *SLEEP*). Night-game-specific; the popular "West Coast team at 1pm ET" penalty is NOT similarly validated.
- **Rest/bye** — post-bye edge mostly died with the 2011 CBA (2024 study: no significant effect); Thursday short-week effects small and possibly eroding.
- **Altitude** — Denver ≈ +5 yds kicking range (physics, stable). Mexico City fatigue plausible, under-studied.
- **Turf vs grass** — injury-rate gap real in 2021–22 data (OR 1.60 season-ending surgery) but contested since (2023 near-parity); marginal draft-risk factor only.
- **Divisional familiarity / 2nd meetings** — weak and weakening; skip or near-zero weight.
- **Week 18 rest risk** — real every year, direction certain, magnitude unpredictable; handle via manual/news tracking, not modeling.
- **Primetime splits** — single-source, confounded; low confidence.

## DEBUNKED — deliberately excluded (equal value: knowing what to ignore)

| Myth | Evidence |
|---|---|
| Revenge games | 49.5% of 384 skill players beat their average (coin flip); QBs 35% — worse than baseline |
| Contract-year boost | No statistically significant effect (Football Outsiders 12-yr regression; multiple replications) |
| Trap / letdown games | Good teams won *more* (80.5% / 82.2% vs 79.5% baseline), not significant (Harvard, 2002–2011) |
| Hot hand (efficiency streaks) | Streaks are TD/efficiency outliers, the most mean-reverting stats; usage increases are the real signal |
| Simple strength-of-schedule / "funnel defense" season rankings | Defensive fantasy-points-allowed YoY correlation just 0.16–0.27; top-5 units repeat 20–30% |
| Preseason box scores | Meaningless; preseason ADP predicts as well as the first 4 real games (r 0.599 vs 0.585). Preseason *usage* (first-team snaps) is informative, production is not |
| "Cold-weather teams are tougher runners" | Road YPC identical across climate origins (3.89–3.99); real effect is home-acclimation interaction |
| Fumble recovery / raw INT rate as skill | Recovery YoY correlation ≈ 0 to negative; TWP→INT conversion r = 0.12 |
| Generalized "injury-prone" label | Only same-body-part recurrence is predictive |

## Top factors by predictive value per unit of implementation effort

1. Trailing opportunity metrics (target share, WOPR, xFP) — free from nflverse, highest signal
2. Vegas implied team totals + spreads (weekly) / win totals (draft)
3. TD & efficiency regression flags (xTD vs actual, RZ conversion extremes)
4. Injury designation → play-probability + play-through penalties
5. Pace + PROE (computed from PBP, conditioned on QB/HC continuity)
6. Snap/route participation trend alerts
7. Wind ≥15 mph + dome/outdoor flags
8. Age-curve priors + draft capital (draft season)
9. OL composite (ALY-style) for RB rushing projection
10. QB-change re-rate trigger (catchable-target framework)
11. Injury-type recurrence discounts (ACL/hamstring)
12. Dome-team-in-cold road penalty
13. Coach aggressiveness index
14. Personnel-grouping target concentration
15. Coordinator-change uncertainty widening
