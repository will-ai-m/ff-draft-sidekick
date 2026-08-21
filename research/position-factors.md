# Per-Position Factor Catalog — What Drives Half-PPR Fantasy Output (QB / RB / WR / TE)

**Question answered:** for each position, what are *all* the factors that affect fantasy output, and how much does each one matter?

**How the % works.** Each factor carries two weights, and each column sums to 100 within a position:

- **Weekly %** — share of *predictable* week-to-week variance in a player's half-PPR points that this factor accounts for, given everything knowable before kickoff.
- **Season %** — share of predictable variance in *season-long* output at draft time (no trailing usage yet, no injury report, no weather, no game line).

The two columns are different models, not a discounted version of each other: roughly a third of season weight at RB/WR/TE sits in factors with zero weekly relevance (age curve, draft capital, ADP, vacated targets), and weekly-only inputs (weather, opponent, injury news, market) hold ~15–20% of weekly weight and ~2% of season. **A factor at 0 / 0 is either debunked or arithmetically redundant with factors already weighted** — it is kept so the catalog is complete and nobody re-adds it later.

**Method.** 21-agent workflow, run 2026-08-17: one researcher per position built an initial list from published analytics (PFF, 4for4, Sharp Football, Fantasy Points, FantasyLife, Football Outsiders/FTN, SumerSports, RotoViz, sports-medicine literature); three rounds of gap-hunting per position added factors until the round cap; then a calibrator per position deduped, adversarially re-verified every effect size ≥3% against the primary source, applied the half-PPR translation, and assigned weights. Every number that could not be located in a source is flagged `estimated` or `weak` rather than carried forward.

**Honesty flags.**
- Gap-hunting hit its 3-round cap at all four positions without going dry, so the lists may still be incomplete at the tail (sub-0.5% factors).
- Roughly 30–40% of non-zero entries carry `estimated` or `weak` evidence — mechanism is clear but no published coefficient exists. They hold ~17–25% of weekly weight. Every factor above ~3% at either horizon traces to a re-verified published number.
- Weights are the calibrator's judgment informed by the evidence, not fitted coefficients. The build plan's backtest (2021–2025 vs. archived ECR) is what should ultimately set them.
- Several figures inherited from `factors.md` were found to be misread and are corrected here (see each position's *Verification corrections*). Notably: the "RB target share doubles when trailing 29→52%" claim, the Vegas win-total "18.4 vs 14.2" citation, and the RB "26.6 ppg" number.

**Related:** [factors.md](factors.md) (cross-position tiering), [PLAN.md](../PLAN.md) (how factors feed the engine).

---

## Contents

- [QB](#qb) — 86 factors
- [RB](#rb) — 74 factors
- [WR](#wr) — 76 factors
- [TE](#te) — 76 factors
- [Cross-position comparison](#cross-position-comparison)
- [Appendix: factor detail (mechanism, evidence, notes)](#appendix-factor-detail)

---

## QB

**86 factors.** Weekly column sums to 100.0; season column sums to 100.0.

### Summary

QB prediction is dominated by two volume channels and one environment number, in that order: how many dropbacks the offense gives him, how many designed/scramble carries he personally gets, and the Vegas implied team total that sets TD expectation. Everything else is a modifier.

The single most important structural fact, and the one the merged list initially got backwards: **passing volume and rushing volume have opposite horizon profiles.** Pass attempts per game are highly self-stable (YoY r=0.61, fantasyclassroom) and are the biggest same-week driver of points (Sharp Football: pass attempts r=0.38, passing yards r=0.63 to weekly QB fantasy points), but they are nearly *useless* as a cross-QB season-long differentiator — 4for4 measured pass attempts/game → next-season FPG at **r = −0.07**, and pass yards/game at r = 0.10, because high-attempt QBs are disproportionately bad QBs on trailing teams. Rushing runs the other way: rushing attempts are the stickiest counted QB stat measured (Sharp YoY R²=0.54 ≈ r 0.74; Fantasy Points r=0.576 to next-season FPG; 4for4 r=0.47), so rushing carries the largest season weight — but its *same-week* correlation to QB fantasy points is only 0.15 across all starters, because 20+ of 32 starters run almost never. Rushing is a near-deterministic floor for ~8-10 QBs, not a weekly swing factor for the position as a whole. Hence rushing volume ranks #1 weekly on **predictable** variance share (it is the component you can forecast most reliably) while passing volume ranks a close #2 on raw weekly leverage.

TDs are the dominant weekly point source (Sharp: total TD r=0.81 to weekly points, passing TD r=0.62) and the least predictable input (pass TD/game YoY R²=0.28, per-game r≈0.34 in fantasyclassroom). That gap is the core of QB modeling: you cannot project TDs from TD rate, so TD expectation must be reconstructed from red-zone trip rate + implied team total + league-mean TD rate, with the QB's own TD rate used only as a mean-reversion flag. Same logic for INTs (TWP→INT conversion r=0.12), which matter because of the −2 penalty, not because the rate is a skill.

Matchup is deliberately small. Defensive fantasy-points-allowed carries YoY r of only 0.16–0.27, top-5 units repeat 20–30%, and QB output tracks own-offense quality far more than opponent identity — so opponent pass defense gets 2.7% weekly and near-zero season weight, versus 2.6% for own OL and 3.6% season for receiving corps.

**Half-PPR is a no-op within QB.** QBs record no receptions, so half-PPR, full-PPR, and standard scoring produce identical QB point totals. No factor weight here required a reception-value adjustment. The half-PPR format matters for QB only in cross-position VOR (half-PPR compresses RB/WR/TE values relative to full PPR, which marginally raises QB positional value at the draft board level) — that is a replacement-level question, not a factor-weight question, and is deliberately not encoded in these weights.

Aging must be two curves, never one. Pocket-passing skill plateaus 25–33; the rushing component collapses ~25.7% from age 26 to 27, ~66% total from 22 to 30, and ~80% by 33 (PFF). A single QB age multiplier is actively wrong for the exact players (dual-threats) whose projections have the most at stake.

### Weight by category

| Category | Weekly % | Season % | # factors |
|---|---:|---:|---:|
| Opportunity/Volume | 26.8 | 22.5 | 8 |
| Efficiency/Talent | 19.7 | 15.3 | 12 |
| Game Script/Vegas | 12.6 | 9.1 | 3 |
| Team Environment | 10.1 | 14.5 | 9 |
| Health/Injury | 6.5 | 6.5 | 8 |
| Matchup/Opponent | 6.4 | 0.9 | 6 |
| Weather/Venue | 4.7 | 0.7 | 8 |
| Variance Driver | 4.6 | 3.3 | 5 |
| Coaching/Scheme | 2.8 | 5.9 | 5 |
| Age/Career Arc | 2.3 | 15.2 | 6 |
| Situational/Schedule | 2.0 | 0.9 | 7 |
| Market/Consensus | 1.6 | 5.1 | 3 |
| Other | 0.0 | 0.0 | 6 |

### All factors, ranked by weekly weight

Stability = year-over-year stickiness of the underlying stat. Evidence = quality of the published support for the weight (strong / moderate / weak / estimated). Click a factor name for its mechanism, key numbers, and verification notes.

| # | Factor | Weekly % | Season % | Category | Stability | Evidence |
|---:|---|---:|---:|---|---|---|
| 1 | [QB rushing volume (designed runs + scrambles)](#qb-qb-rushing-volume-designed-runs-scrambles) | 10.5 | 12 | Opportunity/Volume | high | strong |
| 2 | [Team pass attempts / dropback volume per game](#qb-team-pass-attempts-dropback-volume-per-game) | 10 | 4.5 | Opportunity/Volume | high | strong |
| 3 | [Vegas implied team total](#qb-vegas-implied-team-total) | 7 | 8 | Game Script/Vegas | high | moderate |
| 4 | [Point spread / game script (pass-rate shift)](#qb-point-spread-game-script-pass-rate-shift) | 4.6 | 0.6 | Game Script/Vegas | high | strong |
| 5 | [Composite passing efficiency (ANY/A, EPA per dropback)](#qb-composite-passing-efficiency-any-a-epa-per-dropback) | 4.2 | 4 | Efficiency/Talent | medium | strong |
| 6 | [Passing TD rate (regression flag)](#qb-passing-td-rate-regression-flag) | 3.7 | 1.6 | Efficiency/Talent | low | strong |
| 7 | [Red-zone pass attempts / team RZ trip rate](#qb-red-zone-pass-attempts-team-rz-trip-rate) | 3.2 | 2.6 | Opportunity/Volume | high | moderate |
| 8 | [Opponent pass defense EPA / pressure rate](#qb-opponent-pass-defense-epa-pressure-rate) | 2.7 | 0.3 | Matchup/Opponent | low | weak |
| 9 | [Offensive line pass-block quality / pressure rate allowed](#qb-offensive-line-pass-block-quality-pressure-rate-allowed) | 2.6 | 3.2 | Team Environment | medium | moderate |
| 10 | [CPOE (completion percentage over expected)](#qb-cpoe-completion-percentage-over-expected) | 2.6 | 2.2 | Efficiency/Talent | medium | moderate |
| 11 | [Sack rate / time-to-throw / pressure-to-sack (QB pocket skill)](#qb-sack-rate-time-to-throw-pressure-to-sack-qb-pocket-skill) | 2.4 | 2 | Efficiency/Talent | high | strong |
| 12 | [Designed-run rate / goal-line rushing role](#qb-designed-run-rate-goal-line-rushing-role) | 2.3 | 2.8 | Opportunity/Volume | medium | estimated |
| 13 | [QB injury designation / practice-participation trajectory → play probability](#qb-qb-injury-designation-practice-participation-trajectory-play-probability) | 2.2 | 1 | Health/Injury | high | strong |
| 14 | [INT rate / turnover-worthy-play-to-INT conversion (regression flag)](#qb-int-rate-turnover-worthy-play-to-int-conversion-regression-flag) | 2.1 | 1.5 | Efficiency/Talent | low | strong |
| 15 | [Wind](#qb-wind) | 1.9 | 0.2 | Weather/Venue | high | strong |
| 16 | [PROE (pass rate over expected)](#qb-proe-pass-rate-over-expected) | 1.8 | 2 | Team Environment | medium | strong |
| 17 | [Pace (neutral-script plays per game, QB/HC continuity)](#qb-pace-neutral-script-plays-per-game-qb-hc-continuity) | 1.7 | 2 | Team Environment | high | strong |
| 18 | [Big-Time-Throw rate vs Turnover-Worthy-Play rate (PFF signature stats)](#qb-big-time-throw-rate-vs-turnover-worthy-play-rate-pff-signature-stats) | 1.7 | 1.8 | Efficiency/Talent | medium | strong |
| 19 | [Receiving corps quality (separation / talent of pass catchers)](#qb-receiving-corps-quality-separation-talent-of-pass-catchers) | 1.6 | 3.6 | Team Environment | medium | moderate |
| 20 | [Weekly market consensus (QB player props + DFS salary)](#qb-weekly-market-consensus-qb-player-props-dfs-salary) | 1.6 | 0.3 | Market/Consensus | medium | estimated |
| 21 | [Red-zone play-calling tendency (rush-heavy vs pass-heavy at the goal line)](#qb-red-zone-play-calling-tendency-rush-heavy-vs-pass-heavy-at-the-goal-line) | 1.4 | 1.2 | Coaching/Scheme | medium | moderate |
| 22 | [Backup-QB downgrade risk (own team)](#qb-backup-qb-downgrade-risk-own-team) | 1.3 | 1.5 | Health/Injury | low | weak |
| 23 | [Fumble rate / ball-security (lost fumbles)](#qb-fumble-rate-ball-security-lost-fumbles) | 1.3 | 0.5 | Variance Driver | medium | estimated |
| 24 | [Throwing-arm / hand / rib / oblique injury-specific performance penalty](#qb-throwing-arm-hand-rib-oblique-injury-specific-performance-penalty) | 1.2 | 0.5 | Health/Injury | n/a | moderate |
| 25 | [In-season OL injury / availability (protection cascade)](#qb-in-season-ol-injury-availability-protection-cascade) | 1.1 | 1.4 | Health/Injury | n/a | estimated |
| 26 | [Game-script sensitivity (rushing floor vs dropback-only ceiling)](#qb-game-script-sensitivity-rushing-floor-vs-dropback-only-ceiling) | 1.1 | 0.8 | Variance Driver | n/a | estimated |
| 27 | [TD-dependence / scoring variance (boom-bust index)](#qb-td-dependence-scoring-variance-boom-bust-index) | 1.1 | 0.7 | Variance Driver | n/a | estimated |
| 28 | [Dual-threat rushing-decline cliff (post-27)](#qb-dual-threat-rushing-decline-cliff-post-27) | 1 | 6 | Age/Career Arc | high | strong |
| 29 | [Garbage-time inflation adjustment](#qb-garbage-time-inflation-adjustment) | 1 | 0.5 | Game Script/Vegas | n/a | moderate |
| 30 | [QB rushing efficiency (YPC, rushing yards over expected on QB carries)](#qb-qb-rushing-efficiency-ypc-rushing-yards-over-expected-on-qb-carries) | 0.9 | 0.6 | Efficiency/Talent | medium | estimated |
| 31 | [Opponent run defense quality (rushing-QB floor)](#qb-opponent-run-defense-quality-rushing-qb-floor) | 0.9 | 0.25 | Matchup/Opponent | low | estimated |
| 32 | [Opponent defensive injuries (secondary / pass rush availability)](#qb-opponent-defensive-injuries-secondary-pass-rush-availability) | 0.9 | 0 | Matchup/Opponent | n/a | estimated |
| 33 | [OL run-block quality for QB scramble and designed-run lanes](#qb-ol-run-block-quality-for-qb-scramble-and-designed-run-lanes) | 0.8 | 1.2 | Team Environment | medium | estimated |
| 34 | [Performance-under-pressure splits (completion% / EPA pressured vs clean pocket)](#qb-performance-under-pressure-splits-completion-epa-pressured-vs-clean-pocket) | 0.8 | 0.8 | Efficiency/Talent | medium | estimated |
| 35 | [Cold temperature](#qb-cold-temperature) | 0.8 | 0.15 | Weather/Venue | medium | moderate |
| 36 | [Opponent blitz rate / man vs zone tendency](#qb-opponent-blitz-rate-man-vs-zone-tendency) | 0.8 | 0.1 | Matchup/Opponent | medium | estimated |
| 37 | [In-season WR/TE corps injury and availability cascade](#qb-in-season-wr-te-corps-injury-and-availability-cascade) | 0.7 | 0.4 | Team Environment | medium | estimated |
| 38 | [Dome vs outdoor](#qb-dome-vs-outdoor) | 0.7 | 0.25 | Weather/Venue | high | strong |
| 39 | [Opponent QB-contain / spy scheme vs mobile QBs](#qb-opponent-qb-contain-spy-scheme-vs-mobile-qbs) | 0.7 | 0.2 | Matchup/Opponent | low | estimated |
| 40 | [Experience / career-starts stability](#qb-experience-career-starts-stability) | 0.6 | 1.3 | Age/Career Arc | medium | moderate |
| 41 | [Home / away split](#qb-home-away-split) | 0.6 | 0.6 | Situational/Schedule | low | moderate |
| 42 | [Blowout benching / early-exit risk (winning big)](#qb-blowout-benching-early-exit-risk-winning-big) | 0.6 | 0.1 | Variance Driver | low | moderate |
| 43 | [QB job / snap security risk (performance benching, competition, gadget packages)](#qb-qb-job-snap-security-risk-performance-benching-competition-gadget-packages) | 0.5 | 1.2 | Variance Driver | low | estimated |
| 44 | [Week 18 rest risk](#qb-week-18-rest-risk) | 0.5 | 0.3 | Situational/Schedule | n/a | weak |
| 45 | [Snow](#qb-snow) | 0.5 | 0 | Weather/Venue | medium | strong |
| 46 | [OC / play-caller change (uncertainty widener)](#qb-oc-play-caller-change-uncertainty-widener) | 0.4 | 1.5 | Coaching/Scheme | n/a | weak |
| 47 | [Scheme fit (mobile/RPO system vs pro-style)](#qb-scheme-fit-mobile-rpo-system-vs-pro-style) | 0.4 | 1.5 | Coaching/Scheme | low | weak |
| 48 | [Injury-type recurrence (lower-body, threatening the rushing role)](#qb-injury-type-recurrence-lower-body-threatening-the-rushing-role) | 0.4 | 1.4 | Health/Injury | high | strong |
| 49 | [Play-action rate (team scheme)](#qb-play-action-rate-team-scheme) | 0.4 | 0.9 | Team Environment | medium | strong |
| 50 | [Rookie / first-year-starter within-season improvement curve](#qb-rookie-first-year-starter-within-season-improvement-curve) | 0.4 | 0.9 | Age/Career Arc | low | estimated |
| 51 | [Coach 4th-down aggressiveness](#qb-coach-4th-down-aggressiveness) | 0.4 | 0.5 | Coaching/Scheme | medium | moderate |
| 52 | [No-huddle / two-minute snap rate](#qb-no-huddle-two-minute-snap-rate) | 0.4 | 0.3 | Opportunity/Volume | medium | estimated |
| 53 | [Red-zone-specific passing efficiency (RZ passer rating / RZ dropback EPA)](#qb-red-zone-specific-passing-efficiency-rz-passer-rating-rz-dropback-epa) | 0.4 | 0.3 | Efficiency/Talent | medium | moderate |
| 54 | [aDOT / deep-ball rate](#qb-adot-deep-ball-rate) | 0.4 | 0.3 | Efficiency/Talent | medium | moderate |
| 55 | [Opponent defensive takeaway / INT-generation rate](#qb-opponent-defensive-takeaway-int-generation-rate) | 0.4 | 0.1 | Matchup/Opponent | low | weak |
| 56 | [QB age plateau (pocket-passing skill, holds 25-33)](#qb-qb-age-plateau-pocket-passing-skill-holds-25-33) | 0.3 | 3 | Age/Career Arc | high | strong |
| 57 | [Personnel / shotgun-spread tendency](#qb-personnel-shotgun-spread-tendency) | 0.3 | 0.8 | Team Environment | medium | estimated |
| 58 | [Team possessions / drives per game (own defense & special teams, opponent tempo)](#qb-team-possessions-drives-per-game-own-defense-special-teams-opponent-tempo) | 0.3 | 0.2 | Opportunity/Volume | medium | estimated |
| 59 | [Third-down / money-down passer efficiency](#qb-third-down-money-down-passer-efficiency) | 0.3 | 0.1 | Efficiency/Talent | low | moderate |
| 60 | [Bye week / short week (Thursday) rest](#qb-bye-week-short-week-thursday-rest) | 0.3 | 0 | Situational/Schedule | low | moderate |
| 61 | [Primetime / travel-circadian](#qb-primetime-travel-circadian) | 0.3 | 0 | Situational/Schedule | low | weak |
| 62 | [Rain](#qb-rain) | 0.3 | 0 | Weather/Venue | medium | strong |
| 63 | [Coach / OC QB-development track record ('QB whisperer' effect)](#qb-coach-oc-qb-development-track-record-qb-whisperer-effect) | 0.2 | 1.2 | Coaching/Scheme | low | weak |
| 64 | [Offensive-line continuity / starts-together (pass-block chemistry)](#qb-offensive-line-continuity-starts-together-pass-block-chemistry) | 0.2 | 0.4 | Team Environment | medium | weak |
| 65 | [Concussion / head-injury history and HIA protocol return](#qb-concussion-head-injury-history-and-hia-protocol-return) | 0.2 | 0.15 | Health/Injury | low | estimated |
| 66 | [Heat / humidity](#qb-heat-humidity) | 0.2 | 0 | Weather/Venue | low | estimated |
| 67 | [International / neutral-site games (London, Germany, Brazil, Madrid)](#qb-international-neutral-site-games-london-germany-brazil-madrid) | 0.2 | 0 | Situational/Schedule | low | estimated |
| 68 | [QB personal play-action efficiency differential](#qb-qb-personal-play-action-efficiency-differential) | 0.15 | 0.15 | Efficiency/Talent | medium | weak |
| 69 | [Altitude](#qb-altitude) | 0.15 | 0.1 | Weather/Venue | low | weak |
| 70 | [Two-point conversion attempt involvement (pass or rush)](#qb-two-point-conversion-attempt-involvement-pass-or-rush) | 0.1 | 0.1 | Opportunity/Volume | low | estimated |
| 71 | [Referee crew tendencies (roughing the passer, defensive holding, DPI rates)](#qb-referee-crew-tendencies-roughing-the-passer-defensive-holding-dpi-rates) | 0.1 | 0 | Situational/Schedule | medium | weak |
| 72 | [Retractable-roof open/closed game-day decision](#qb-retractable-roof-open-closed-game-day-decision) | 0.1 | 0 | Weather/Venue | n/a | estimated |
| 73 | [Return-from-major-injury rushing-volume ramp (multi-year recovery trajectory)](#qb-return-from-major-injury-rushing-volume-ramp-multi-year-recovery-trajectory) | 0.05 | 0.4 | Health/Injury | low | estimated |
| 74 | [Playing surface (turf vs grass) — injury exposure](#qb-playing-surface-turf-vs-grass-injury-exposure) | 0.05 | 0.15 | Health/Injury | low | weak |
| 75 | [ADP / preseason ECR (market prior)](#qb-adp-preseason-ecr-market-prior) | 0 | 3 | Market/Consensus | high | strong |
| 76 | [Draft capital / rookie QB hit rate](#qb-draft-capital-rookie-qb-hit-rate) | 0 | 2.4 | Age/Career Arc | high | strong |
| 77 | [Season passing yardage / TD prop market (Vegas player props)](#qb-season-passing-yardage-td-prop-market-vegas-player-props) | 0 | 1.8 | Market/Consensus | n/a | estimated |
| 78 | [Second-year sophomore jump](#qb-second-year-sophomore-jump) | 0 | 1.6 | Age/Career Arc | medium | moderate |
| 79 | ['Cold-weather QB toughness'](#qb-cold-weather-qb-toughness) | 0 | 0 | Other | n/a | strong |
| 80 | [Completions per game](#qb-completions-per-game) | 0 | 0 | Opportunity/Volume | high | strong |
| 81 | [Contract-year boost](#qb-contract-year-boost) | 0 | 0 | Other | n/a | strong |
| 82 | [Divisional / second-meeting familiarity](#qb-divisional-second-meeting-familiarity) | 0 | 0 | Situational/Schedule | n/a | weak |
| 83 | [Preseason box-score stats](#qb-preseason-box-score-stats) | 0 | 0 | Other | n/a | strong |
| 84 | [Revenge games](#qb-revenge-games) | 0 | 0 | Other | n/a | strong |
| 85 | [Simple strength-of-schedule / 'funnel defense' season rankings](#qb-simple-strength-of-schedule-funnel-defense-season-rankings) | 0 | 0 | Other | n/a | strong |
| 86 | [Trap / letdown games](#qb-trap-letdown-games) | 0 | 0 | Other | n/a | strong |

### Top 15 by season (draft-time) weight

| # | Factor | Season % | Weekly % |
|---:|---|---:|---:|
| 1 | QB rushing volume (designed runs + scrambles) | 12 | 10.5 |
| 2 | Vegas implied team total | 8 | 7 |
| 3 | Dual-threat rushing-decline cliff (post-27) | 6 | 1 |
| 4 | Team pass attempts / dropback volume per game | 4.5 | 10 |
| 5 | Composite passing efficiency (ANY/A, EPA per dropback) | 4 | 4.2 |
| 6 | Receiving corps quality (separation / talent of pass catchers) | 3.6 | 1.6 |
| 7 | Offensive line pass-block quality / pressure rate allowed | 3.2 | 2.6 |
| 8 | ADP / preseason ECR (market prior) | 3 | 0 |
| 9 | QB age plateau (pocket-passing skill, holds 25-33) | 3 | 0.3 |
| 10 | Designed-run rate / goal-line rushing role | 2.8 | 2.3 |
| 11 | Red-zone pass attempts / team RZ trip rate | 2.6 | 3.2 |
| 12 | Draft capital / rookie QB hit rate | 2.4 | 0 |
| 13 | CPOE (completion percentage over expected) | 2.2 | 2.6 |
| 14 | PROE (pass rate over expected) | 2 | 1.8 |
| 15 | Pace (neutral-script plays per game, QB/HC continuity) | 2 | 1.7 |

### Verification corrections

What the adversarial pass changed relative to the first-draft list, and why:

**Adversarial verification — three material corrections found.**

1. **Pass-attempt volume was over-weighted at season horizon (was 10/7).** The cited "r=0.61" is attempts→attempts self-stability (fantasyclassroom, verified), which the merged list silently used as evidence of predictive value for *points*. 4for4's "Most Predictable Quarterback Stats" measures the actual quantity — pass attempts/game → next-season fantasy PPG — at **r = −0.07**, and pass yards/game at r = 0.10. Season weight cut 7 → 4.5; weekly kept at 10.0 (Sharp Football confirms attempts r=0.38 and passing yards r=0.63 to same-week points, so the weekly mechanism is real). This is the largest single reallocation in the pass.

2. **The Vegas 18.4-vs-14.2 citation does not say what the list claimed.** The list stated it as "QBs on high-win-total teams vs low-total teams." Fetching PFF's "Metrics that Matter: Vegas win totals" shows the split is **winning teams vs losing teams** over the prior three seasons — a post-hoc game-outcome split, not a pregame win-total split, and therefore partly reverse-causal (QBs who score a lot help their teams win). Evidence downgraded strong → moderate and the confound is stated in the entry. Weights were *not* cut much, because Vegas implied total's value as the most information-dense pregame scoring-environment number is independently well-established; only this specific citation is weaker than claimed.

3. **QB rushing volume's weekly weight was too high relative to its weekly evidence (was 14).** The stability evidence is excellent and triangulates across three independent sources (Sharp YoY R²=0.54 for rush attempts, R²=0.55 rush yards; Fantasy Points r=0.576 to next-season FPG; 4for4 r=0.47). But Sharp's same-week correlation of rushing attempts to QB fantasy points is only **0.15** — rushing is a floor mechanism concentrated in ~8-10 QBs, not a leaguewide weekly swing. Weekly 14 → 10.5; season 12 → 12.0 (raised in relative terms since pass volume fell). The researcher's "rushing PPG r=0.52 vs passing PPG r=0.35, 49% more predictive" claim could not be sourced and was replaced with the three verified figures.

**Other corrected raw_signals:**
- **Passing TD rate**: list said "TDs r=0.36, TD rate r=0.21." Verified values are pass TD/game YoY r=0.34 all-starters / 0.25 young / 0.29 old (fantasyclassroom), YoY R²=0.277 for pass TD/game and 0.456 for pass TD/season (Sharp), and pass TD *rate* → next-season FPG r=0.35 (4for4). Corrected; the "0.21" was not found in any source. Still the least stable major input, still modeled as a regression flag, but weekly weight raised to 3.7 given passing TD's 0.62 same-week correlation to points.
- **CPOE**: "YoY r=0.41" replaced with SumerSports' measured 0.46 unfiltered / 0.51 filtered. Offsetting downgrade: 4for4 has CPOE → next-season FPG at only r=0.13. Net weight roughly unchanged (2.6/2.2) — self-stable but weakly point-predictive.
- **Sack rate / time-to-throw**: TTT YoY r=0.70 verified (fantasyclassroom). But 4for4 has TTT → next-season FPG at only 0.24 and pressure-to-sack rate at −0.17. Weight held at 2.4/2.0 rather than raised to match the 0.70.
- **"Pressure-to-sack R²≈0.38"** (OL entry) — not verifiable at that figure; the entry's weight is now carried by the OL-quality → QB-variance figure from factors.md (~14%) and evidence downgraded to moderate.
- **"Each 1-spot in opponent defensive rank costs ~0.07 PPG / offense matters 3x"** — could not be located at draftedge or elsewhere. Downgraded to weak, and the entry is now anchored on the verified defensive-FPA YoY r=0.16–0.27 shrinkage rationale instead.
- **"QBs accounted for 21.2% of league rushing TDs"** — not verifiable this pass; downgraded to estimated.
- **Dual-threat aging** verified and strengthened: 25.7% rushing-production decline age 26→27 confirmed, plus ~66% decline 22→30 and ~80% by 33 (PFF).

**Merges (7 entries removed):**
- "Passing yards/attempt, ANY/A" + "Dropback EPA / composite efficiency" → one *Composite passing efficiency* entry. They measure the same construct; carrying both was double-counting.
- "DFS salary" + "Weekly QB prop lines" → one *Weekly market consensus* entry (both are same-week market aggregation; different feeds, one signal).
- "Two-QB / committee timeshare risk" + "In-season performance-based benching" → one *QB job/snap security risk* entry.
- "Team possessions/drives per game" + "Opponent ball-control / time-of-possession" → one *possession-count* entry (both price how many drives your QB gets).
- **"Completions per game" zeroed to 0/0** per the flagged correction — it is attempts × completion rate, both already weighted. Retained as an explicit redundancy diagnostic so it isn't re-added later.

**Splits (per flagged corrections, 2 entries → 4):**
- "Altitude & playing surface" → *Altitude* (Weather/Venue, in-game physics) and *Turf-vs-grass injury exposure* (moved to Health/Injury, since the entry's own text conceded it is an injury-risk not a performance factor).
- "Precipitation (rain/snow)" → *Rain* (weak, <5% effect on most metrics — near-noise, 0.3 weekly) and *Snow* (large when it occurs, ~25% scoring drop, but rare — 0.5 weekly). Left merged, a calibrator would have over-weighted rain.

**Reconciliation applied to the injury cluster** (flagged twice): the QB-designation entry's "≈no play-through penalty" is now explicitly scoped to the *aggregate across all designations*, and states that it does not license zeroing the throwing-arm/hand/rib/oblique entry or the concussion entry, which price mechanism-specific penalties. Backup-QB downgrade now carries the explicit sub-clause that a pocket-only backup typically strips the designed-QB-run package entirely rather than downgrading it.

**Opponent defensive injuries** (availability) and **opponent takeaway/INT rate** (performance rate) kept as separate entries with cross-referencing notes, per the flagged correction — different data sources, different stability.

**Monotonicity audit.** Every factor with a verified r ≥ 0.45 to next-season points or R² ≥ 0.45 YoY now sits in the top 12 of at least one column: QB rushing volume, pass volume, composite passing efficiency, RZ trip rate, CPOE, time-to-throw, designed-run rate. The two apparent violations are deliberate and flagged in-entry: (a) time-to-throw r=0.70 sits at 2.4% because 4for4 shows it converts to only r=0.24 of next-season points — high self-stability, low point-relevance; (b) completions r=0.66 sits at 0 because it is arithmetically redundant.

**Horizon discipline.** Weekly-only inputs (weather, opponent, in-week injury news, weekly market) hold ~19% of weekly weight and ~2% of season. Draft-time-only inputs (ADP, draft capital, sophomore jump, season props, age curves) hold 0% weekly and ~12% of season. Game script flipped hard by horizon (4.6 weekly / 0.6 season) since a season-long schedule averages toward neutral.

**Honesty flags.** 31 of 86 entries carry evidence_quality "estimated" or "weak"; all sit at ≤1.5% weekly except backup-QB downgrade (1.3, weak) and weekly market consensus (1.6, estimated) — both retained at that level because the mechanism is unambiguous even where no one has published a coefficient. No number in this catalog was invented; where a claimed figure could not be located, the entry says so explicitly rather than carrying the unverified number forward.

---

## RB

**74 factors.** Weekly column sums to 100.0; season column sums to 100.0.

### Summary

RB is the most volume-dominated position in fantasy, and half-PPR does not change that — it only shifts the internal mix. The opportunity cluster (weighted opportunity, receiving role, early-down share, route participation, red-zone share, snap share, committee structure, vacated touches) carries roughly 47% of weekly and 36% of season-long predictable variance, more than any other position's volume cluster. Everything else is a modifier on a touch count.

Three things dominate and they are not equally appreciated:

1. VOLUME, RZ-WEIGHTED. Weighted opportunity is the master input because it prices touches by scoring value rather than counting them: an inside-5 carry is worth 2.91 fantasy points against 0.68 for a carry from the 20-to-10. The r=0.95/0.97 headline is descriptive and near-tautological — the real work is projecting next week's weighted opportunity, which is why the role-composition rows (early-down share, route participation, RZ share) carry independent weight as residuals rather than being folded in.

2. THE RECEIVING ROLE, WHICH HALF-PPR PUNISHES LESS THAN EXPECTED. This is the largest correction in this pass. An RB target is worth 2.74x a carry in full PPR and 1.36x in standard; half-PPR lands at roughly 2.05x (target ~1.19 pts vs carry 0.58). So the half-PPR adjustment trims receiving weight modestly from a PPR-based prior — it does not halve it. Three-down backs keep most of their structural edge here. The offsetting half-PPR effect is on the variance side: without the full reception floor, RB weekly outcomes are more TD-dependent and boom-bust than PPR studies imply, which is why the TD-regression and variance rows matter more in this format.

3. GAME SCRIPT IS BIDIRECTIONAL, UNIQUELY. Spread reshapes the rush/receive MIX rather than scaling total value: leads produce carries, deficits produce checkdowns. This means a spread term applied uniformly to RBs is wrong — it must be applied by archetype (early-down workhorse vs receiving specialist), and it must be nonlinear at the tails, where blowouts pull starters and hand volume to backups.

What is structurally distinctive to RB and has no analogue at other positions: (a) committee risk — a single teammate can take a third of a player's value, and touch splits move week to week even inside a stable committee; (b) cumulative workload wear layered on the earliest and steepest age cliff in fantasy (peak 25.3-25.5, -25.2% PPR ppg from age 28 to 29); (c) single-beneficiary vacated opportunity — a backfield injury usually consolidates onto ONE back, unlike WR/TE where targets split several ways, which makes RB the position where one transaction moves projections most; (d) the highest per-touch contact exposure, which is why in-game attrition needs its own tail term.

What almost nobody should weight: rushing efficiency. YPC has a YoY r of roughly 0.15-0.41 and requires ~1,978 carries to stabilize, which the source correctly summarizes as "never." Four separate efficiency instruments (YPC, EPA/success rate, RYOE, explosive rate) all measure the same noisy quantity and are consolidated here into one 2.5% weekly row. Real skill signal at RB comes from role and, secondarily, from contact-adjusted metrics (yards after contact, missed tackles forced) that survive a change of offensive line — not from rate stats.

The single cheapest unexploited edge found in this pass: practice-participation trajectory. Among Questionable players, 86% play after full final-practice participation, 71% after limited, and 42% after not practicing. That 44-point spread inside one designation is larger than most modeling factors on this list, it is free in nflverse, and the commonly quoted flat "Questionable = 71%" is actually just the limited-practice subgroup.

### Weight by category

| Category | Weekly % | Season % | # factors |
|---|---:|---:|---:|
| Opportunity/Volume | 52.3 | 41.1 | 11 |
| Game Script/Vegas | 11.5 | 4.5 | 4 |
| Team Environment | 9.1 | 9.8 | 8 |
| Efficiency/Talent | 8.9 | 7.3 | 5 |
| Health/Injury | 6.4 | 9.6 | 7 |
| Matchup/Opponent | 4.0 | 0.5 | 2 |
| Weather/Venue | 2.0 | 0.8 | 5 |
| Coaching/Scheme | 1.8 | 3.6 | 4 |
| Variance Driver | 1.8 | 2.8 | 4 |
| Situational/Schedule | 1.2 | 0.0 | 7 |
| Market/Consensus | 0.7 | 7.2 | 3 |
| Age/Career Arc | 0.3 | 12.8 | 3 |
| Other | 0.0 | 0.0 | 11 |

### All factors, ranked by weekly weight

Stability = year-over-year stickiness of the underlying stat. Evidence = quality of the published support for the weight (strong / moderate / weak / estimated). Click a factor name for its mechanism, key numbers, and verification notes.

| # | Factor | Weekly % | Season % | Category | Stability | Evidence |
|---:|---|---:|---:|---|---|---|
| 1 | [Weighted Opportunity (RZ-weighted touch volume: carries + targets)](#rb-weighted-opportunity-rz-weighted-touch-volume-carries-targets) | 16 | 13 | Opportunity/Volume | high | strong |
| 2 | [Receiving role / RB target share](#rb-receiving-role-rb-target-share) | 8.5 | 6.5 | Opportunity/Volume | medium | strong |
| 3 | [Vegas spread / game script (bidirectional rush-vs-receive mix)](#rb-vegas-spread-game-script-bidirectional-rush-vs-receive-mix) | 6.5 | 0 | Game Script/Vegas | high | strong |
| 4 | [Early-down / carry share](#rb-early-down-carry-share) | 5.5 | 3.5 | Opportunity/Volume | high | moderate |
| 5 | [Route participation rate (incl. passing-down role)](#rb-route-participation-rate-incl-passing-down-role) | 5 | 2.5 | Opportunity/Volume | medium | moderate |
| 6 | [Red-zone / goal-line opportunity share (RZ volume)](#rb-red-zone-goal-line-opportunity-share-rz-volume) | 4.5 | 2.5 | Opportunity/Volume | medium | strong |
| 7 | [Injury designation + practice-participation trajectory](#rb-injury-designation-practice-participation-trajectory) | 4.5 | 0 | Health/Injury | high | strong |
| 8 | [Committee structure / bell-cow touch concentration](#rb-committee-structure-bell-cow-touch-concentration) | 3.5 | 5.5 | Opportunity/Volume | medium | moderate |
| 9 | [Vegas implied team total](#rb-vegas-implied-team-total) | 3.5 | 0.5 | Game Script/Vegas | high | strong |
| 10 | [OL run-blocking quality (Adjusted Line Yards-style composite)](#rb-ol-run-blocking-quality-adjusted-line-yards-style-composite) | 3 | 3.5 | Team Environment | medium | strong |
| 11 | [Snap share (role-change leading indicator)](#rb-snap-share-role-change-leading-indicator) | 3 | 1.5 | Opportunity/Volume | medium | moderate |
| 12 | [Rushing efficiency composite (RYOE-led; success rate/EPA per rush; YPC as regression flag)](#rb-rushing-efficiency-composite-ryoe-led-success-rate-epa-per-rush-ypc-as-regression-flag) | 2.5 | 2 | Efficiency/Talent | low | moderate |
| 13 | [TD regression (actual vs expected TDs, rushing + receiving)](#rb-td-regression-actual-vs-expected-tds-rushing-receiving) | 2.5 | 2 | Efficiency/Talent | medium | strong |
| 14 | [Opponent run-defense quality (opponent-adjusted EPA/success + box rate + missed-tackle rate allowed)](#rb-opponent-run-defense-quality-opponent-adjusted-epa-success-box-rate-missed-tackle-rate-allowed) | 2.5 | 0.3 | Matchup/Opponent | low | moderate |
| 15 | [Vacated touches (in-season / offseason backfield redistribution)](#rb-vacated-touches-in-season-offseason-backfield-redistribution) | 2 | 3.5 | Opportunity/Volume | medium | estimated |
| 16 | [Yards after contact / elusiveness (missed tackles forced)](#rb-yards-after-contact-elusiveness-missed-tackles-forced) | 2 | 1.8 | Efficiency/Talent | medium | moderate |
| 17 | [TPRR (targets per route run)](#rb-tprr-targets-per-route-run) | 2 | 1.5 | Opportunity/Volume | medium | estimated |
| 18 | [In-season OL availability & continuity (starters out, same-five streak)](#rb-in-season-ol-availability-continuity-starters-out-same-five-streak) | 1.8 | 0.8 | Team Environment | low | estimated |
| 19 | [Receiving efficiency (YPRR, catch rate, YAC over expected)](#rb-receiving-efficiency-yprr-catch-rate-yac-over-expected) | 1.5 | 1.2 | Efficiency/Talent | low | estimated |
| 20 | [Pass-protection role & trust (route-rate gate)](#rb-pass-protection-role-trust-route-rate-gate) | 1.5 | 0.6 | Opportunity/Volume | medium | weak |
| 21 | [Opponent pass-defense profile vs RBs (coverage LB/nickel quality + blitz rate)](#rb-opponent-pass-defense-profile-vs-rbs-coverage-lb-nickel-quality-blitz-rate) | 1.5 | 0.2 | Matchup/Opponent | medium | estimated |
| 22 | [Blowout / garbage-time nonlinearity at spread extremes](#rb-blowout-garbage-time-nonlinearity-at-spread-extremes) | 1.5 | 0 | Game Script/Vegas | medium | moderate |
| 23 | [Team offensive pace (neutral-script plays per game)](#rb-team-offensive-pace-neutral-script-plays-per-game) | 1.2 | 1.8 | Team Environment | medium | strong |
| 24 | [Team pass/run mix (PROE)](#rb-team-pass-run-mix-proe) | 1.2 | 1.8 | Team Environment | medium | strong |
| 25 | [Post-return workload ramp](#rb-post-return-workload-ramp) | 1.2 | 0.5 | Health/Injury | low | estimated |
| 26 | [In-game or in-season role-loss shock (fumble benching, performance benching)](#rb-in-game-or-in-season-role-loss-shock-fumble-benching-performance-benching) | 1 | 0.3 | Coaching/Scheme | low | weak |
| 27 | [Designed / scheme touches (screens, jet sweeps, motion and gadget usage)](#rb-designed-scheme-touches-screens-jet-sweeps-motion-and-gadget-usage) | 0.8 | 0.5 | Opportunity/Volume | medium | weak |
| 28 | [Dome / indoor venue (scoring environment)](#rb-dome-indoor-venue-scoring-environment) | 0.8 | 0.3 | Weather/Venue | high | moderate |
| 29 | [Rain / snow (run-game tilt)](#rb-rain-snow-run-game-tilt) | 0.8 | 0 | Weather/Venue | medium | moderate |
| 30 | [Play-through penalty by injury type / body part](#rb-play-through-penalty-by-injury-type-body-part) | 0.7 | 0.4 | Health/Injury | high | strong |
| 31 | [QB pressure / sack rate -> RB checkdown-target boost](#rb-qb-pressure-sack-rate-rb-checkdown-target-boost) | 0.7 | 0.2 | Team Environment | low | weak |
| 32 | [Committee volatility / week-to-week touch-split noise](#rb-committee-volatility-week-to-week-touch-split-noise) | 0.6 | 2.5 | Variance Driver | low | estimated |
| 33 | [Backup-QB downgrade / QB-tier shift](#rb-backup-qb-downgrade-qb-tier-shift) | 0.5 | 0.4 | Team Environment | low | estimated |
| 34 | [TD / game-script sensitivity (weekly boom-bust structure)](#rb-td-game-script-sensitivity-weekly-boom-bust-structure) | 0.5 | 0.3 | Variance Driver | n/a | moderate |
| 35 | [Home / away split](#rb-home-away-split) | 0.5 | 0 | Situational/Schedule | low | moderate |
| 36 | [Mobile / rushing-QB goal-line vulture effect](#rb-mobile-rushing-qb-goal-line-vulture-effect) | 0.4 | 0.5 | Team Environment | low | weak |
| 37 | [Goal-line conversion efficiency (TD rate given inside-5 opportunity)](#rb-goal-line-conversion-efficiency-td-rate-given-inside-5-opportunity) | 0.4 | 0.3 | Efficiency/Talent | low | moderate |
| 38 | [DFS salary / market-implied role signal](#rb-dfs-salary-market-implied-role-signal) | 0.4 | 0.2 | Market/Consensus | low | estimated |
| 39 | [In-game injury-exit risk (post-kickoff attrition)](#rb-in-game-injury-exit-risk-post-kickoff-attrition) | 0.4 | 0 | Variance Driver | n/a | estimated |
| 40 | [Scheme fit (zone vs gap/power blocking)](#rb-scheme-fit-zone-vs-gap-power-blocking) | 0.3 | 1 | Coaching/Scheme | low | estimated |
| 41 | [Personnel-grouping usage (21/22 personnel, fullback rate)](#rb-personnel-grouping-usage-21-22-personnel-fullback-rate) | 0.3 | 0.8 | Team Environment | high | weak |
| 42 | [Coach 4th-down aggressiveness (incl. goal-to-go tendency)](#rb-coach-4th-down-aggressiveness-incl-goal-to-go-tendency) | 0.3 | 0.3 | Coaching/Scheme | medium | moderate |
| 43 | [Rookie in-season role-acceleration curve](#rb-rookie-in-season-role-acceleration-curve) | 0.3 | 0.3 | Age/Career Arc | medium | weak |
| 44 | [Player prop market (anytime-TD odds, rush-yards O/U)](#rb-player-prop-market-anytime-td-odds-rush-yards-o-u) | 0.3 | 0 | Market/Consensus | low | weak |
| 45 | [Two-minute drill / hurry-up usage](#rb-two-minute-drill-hurry-up-usage) | 0.3 | 0 | Variance Driver | low | weak |
| 46 | [Wind](#rb-wind) | 0.3 | 0 | Weather/Venue | high | moderate |
| 47 | [OC / play-caller change](#rb-oc-play-caller-change) | 0.2 | 2 | Coaching/Scheme | low | weak |
| 48 | [Late-season elimination / evaluation mode (Weeks 14-18)](#rb-late-season-elimination-evaluation-mode-weeks-14-18) | 0.2 | 0 | Situational/Schedule | low | weak |
| 49 | [Week 18 rest risk (playoff-seeded teams resting starters)](#rb-week-18-rest-risk-playoff-seeded-teams-resting-starters) | 0.2 | 0 | Situational/Schedule | low | moderate |
| 50 | [Short week (Thursday) / travel](#rb-short-week-thursday-travel) | 0.15 | 0 | Situational/Schedule | low | weak |
| 51 | [Special-teams return role (kick/punt return TD equity)](#rb-special-teams-return-role-kick-punt-return-td-equity) | 0.15 | 0 | Situational/Schedule | low | weak |
| 52 | [Extreme venue / travel disruption (altitude, international neutral sites)](#rb-extreme-venue-travel-disruption-altitude-international-neutral-sites) | 0.1 | 0 | Weather/Venue | n/a | weak |
| 53 | [Age curve (peak age and decline slope)](#rb-age-curve-peak-age-and-decline-slope) | 0 | 8 | Age/Career Arc | high | strong |
| 54 | [ADP / ECR consensus prior (cold-start prior)](#rb-adp-ecr-consensus-prior-cold-start-prior) | 0 | 7 | Market/Consensus | high | strong |
| 55 | [Draft capital (rookies and years 1-3)](#rb-draft-capital-rookies-and-years-1-3) | 0 | 4.5 | Age/Career Arc | high | strong |
| 56 | [Vegas season win total (team-quality prior)](#rb-vegas-season-win-total-team-quality-prior) | 0 | 4 | Game Script/Vegas | high | moderate |
| 57 | [Cumulative workload wear (370-carry curse; career-touch wall)](#rb-cumulative-workload-wear-370-carry-curse-career-touch-wall) | 0 | 3.5 | Health/Injury | high | moderate |
| 58 | [Injury-type recurrence (ACL, hamstring)](#rb-injury-type-recurrence-acl-hamstring) | 0 | 3 | Health/Injury | high | strong |
| 59 | [Age x injury interaction](#rb-age-x-injury-interaction) | 0 | 1.2 | Health/Injury | low | estimated |
| 60 | [Body size / weight as workload-tolerance prior](#rb-body-size-weight-as-workload-tolerance-prior) | 0 | 1 | Health/Injury | high | moderate |
| 61 | [Turf vs grass (injury risk)](#rb-turf-vs-grass-injury-risk) | 0 | 0.5 | Weather/Venue | low | weak |
| 62 | [Bye week](#rb-bye-week) | 0 | 0 | Situational/Schedule | n/a | strong |
| 63 | [Cold-weather teams produce tougher runners](#rb-cold-weather-teams-produce-tougher-runners) | 0 | 0 | Other | n/a | strong |
| 64 | [College workload / college carries as an NFL longevity predictor](#rb-college-workload-college-carries-as-an-nfl-longevity-predictor) | 0 | 0 | Other | n/a | strong |
| 65 | [Committee-independent role projection: vacated opportunity at draft time — see Vacated touches](#rb-committee-independent-role-projection-vacated-opportunity-at-draft-time-see-vacated-touches) | 0 | 0 | Other | n/a | strong |
| 66 | [Contract status (contract year / extension year)](#rb-contract-status-contract-year-extension-year) | 0 | 0 | Other | n/a | strong |
| 67 | [Fumble propensity as a repeatable skill](#rb-fumble-propensity-as-a-repeatable-skill) | 0 | 0 | Other | n/a | strong |
| 68 | [Generalized injury-prone label](#rb-generalized-injury-prone-label) | 0 | 0 | Other | n/a | strong |
| 69 | [Hot hand (efficiency streaks)](#rb-hot-hand-efficiency-streaks) | 0 | 0 | Other | n/a | strong |
| 70 | [Preseason box-score production](#rb-preseason-box-score-production) | 0 | 0 | Other | n/a | strong |
| 71 | [Primetime spotlight & divisional-game familiarity](#rb-primetime-spotlight-divisional-game-familiarity) | 0 | 0 | Situational/Schedule | low | weak |
| 72 | [Revenge games](#rb-revenge-games) | 0 | 0 | Other | n/a | strong |
| 73 | [Simple strength-of-schedule / season-long funnel-defense rankings](#rb-simple-strength-of-schedule-season-long-funnel-defense-rankings) | 0 | 0 | Other | n/a | strong |
| 74 | [Trap / letdown games](#rb-trap-letdown-games) | 0 | 0 | Other | n/a | strong |

### Top 15 by season (draft-time) weight

| # | Factor | Season % | Weekly % |
|---:|---|---:|---:|
| 1 | Weighted Opportunity (RZ-weighted touch volume: carries + targets) | 13 | 16 |
| 2 | Age curve (peak age and decline slope) | 8 | 0 |
| 3 | ADP / ECR consensus prior (cold-start prior) | 7 | 0 |
| 4 | Receiving role / RB target share | 6.5 | 8.5 |
| 5 | Committee structure / bell-cow touch concentration | 5.5 | 3.5 |
| 6 | Draft capital (rookies and years 1-3) | 4.5 | 0 |
| 7 | Vegas season win total (team-quality prior) | 4 | 0 |
| 8 | Cumulative workload wear (370-carry curse; career-touch wall) | 3.5 | 0 |
| 9 | Early-down / carry share | 3.5 | 5.5 |
| 10 | OL run-blocking quality (Adjusted Line Yards-style composite) | 3.5 | 3 |
| 11 | Vacated touches (in-season / offseason backfield redistribution) | 3.5 | 2 |
| 12 | Injury-type recurrence (ACL, hamstring) | 3 | 0 |
| 13 | Committee volatility / week-to-week touch-split noise | 2.5 | 0.6 |
| 14 | Red-zone / goal-line opportunity share (RZ volume) | 2.5 | 4.5 |
| 15 | Route participation rate (incl. passing-down role) | 2.5 | 5 |

### Verification corrections

What the adversarial pass changed relative to the first-draft list, and why:

DEDUPES AND MERGES (78 input rows to 70 output rows, with far more consolidation than that count suggests since the merges hit the heaviest-weighted clusters):
- Red-zone cluster (flagged, VALID): four overlapping entries collapsed to two, orthogonalized as RZ VOLUME (4.5 weekly / 2.5 season) vs RZ EFFICIENCY GIVEN VOLUME (0.4 / 0.3), with weighted opportunity keeping its own RZ-weighted term. Summed as four independent weights they would have triple-counted red-zone usage.
- Rushing efficiency: YPC + success rate/EPA + RYOE + explosive run rate merged into one composite. As separate rows they summed to 6.5% weekly on the noisiest statistic in football; now 2.5%.
- Opponent run defense + light-box rate + missed-tackle rate allowed merged into one opponent run-defense row (5 to 2.5 weekly).
- Opponent coverage-vs-RB + opponent blitz rate merged (receiving-side matchup).
- Pass-blocking snap rate + pass-protection whiff/trust merged (same gate, two time points).
- Third-down/passing-down role merged into route participation (route participation is the measurement of that role).
- In-season OL availability + OL continuity merged.
- In-game fumble benching + performance benching merged (same detector: a snap-share discontinuity).
- Altitude + international travel merged into extreme venue/travel disruption.

CORRECTIONS APPLIED (adversarial verification of every raw_signal at or above 3%):
1. RB target vs carry value — WRONG. Merged list said "17% more in standard, 91% more in full PPR." PFF/Barrett's actual figures are 1.36x (36% more) standard and 2.74x (174% more) PPR; carry = 0.58 pts, PPR target = 1.59 pts. Half-PPR derives to ~2.05x. The original numbers understated RB target value by roughly half, which would have systematically under-ranked receiving backs.
2. Game script "RB target share doubles when trailing (29% to 52%)" — MISREAD SOURCE, inherited from factors.md. PFF measured the DISTRIBUTION of all RB targets across game states (52% of RB targets occur while trailing, 29% while leading), not a doubling of any player's target share. Weight now rests on the verified 50/56/66 pass-rate shift.
3. Vegas win total — WRONG NUMBER AND WRONG UNIT. Actual is 26.2 (not 26.6) vs 20.6, and it is TEAM RB-ROOM fantasy points per game, not per player. 26.2 ppg for one back would be RB1-overall pace. Both the merged list and factors.md read it as per-player. Evidence downgraded to moderate (paywalled primary, recovered from secondary reporting).
4. Draft capital — POOLED TIERS INCORRECTLY. 85.7% top-36 / 71.4% top-24 / 50% top-12 are FIRST-ROUND ONLY (12 of 14 backs). Rounds 2-3 combined hit top-36 only 19 of 50 times (38%); R2 alone is ~45% top-24 / 22% top-12. Splitting R1 from R2 restores one of the sharpest real discontinuities in the data.
5. Weighted opportunity R2 = 0.82 — UNVERIFIABLE, REMOVED. Replaced with the sourceable r=0.95/0.97 vs 0.89/0.90 set, plus an explicit note that these are same-season descriptive correlations and close to tautological.
6. OL / Adjusted Line Yards — RANGE TIGHTENED. Verified R2 = 0.289 (DraftSharks, measured against half-PPR specifically) to 0.431 (4for4) / 0.43 (Fantasy Footballers). The merged list's 0.46 upper bound and its "~0.59 at top/bottom-10 extremes" claim could not be located and were dropped.
7. Injury practice trajectory — UPGRADED, not corrected. Football Outsiders "Questionable Behavior" quantifies exactly what the prior audit called an unquantified gap: 86% / 71% / 42% play rates by final-practice status. Evidence moderate to strong, weight raised to 4.5.
8. Mobile-QB goal-line vulture — CONTRADICTED BY THE ONLY PUBLISHED TEST. PFF's own Narrative Street study found R2=0.01 for QB rushing-TD share vs RB TD attempts, max correlation 0.08 across all metrics, verdict "narrative is busted." The merged list rated it stability HIGH and evidence MODERATE on Hurts/Jackson anecdotes alone. Cut from 0.8/0.7 to 0.4/0.5, evidence moderate to weak, with an explicit instruction to validate on 2022-2025 data before it earns weight.
9. Two-minute drill (flagged, VALID on both counts) — the unsourced anecdote (138 yards + TD on 8 carries, no player/team/game named) removed as an invented figure; recategorized from Opportunity/Volume to Variance Driver since it is game-flow contingent and unforecastable pregame.
10. 370-carry curse — numbers verified (27%/10% and 33%/11%, FO 2004) but evidence DOWNGRADED strong to moderate for two reasons the merged list omitted: critics attribute much of it to regression to the mean on an outlier season, and 370-carry seasons are nearly extinct in the committee era, so the threshold now almost never fires. Recommended reformulation as a continuous workload-stress term.
11. RB opportunity stability — merged list cited ">0.70 YoY" for RB target share; that is the WR figure. RB YoY stability tops out just under 0.60 (Sharp Football). Stability downgraded high to medium on the receiving-role row.

CORRECTION REJECTED:
- Home/away (RB-specific) — the flag alleged an ungrounded extrapolation contradicting factors.md. VERIFIED AND KEPT. PFF's Narrative Street home/away study explicitly reports RBs scoring 3.3% more fantasy points PER CARRY at home and explicitly calls RB the smallest per-attempt gap of any position. No contradiction with factors.md's "WR smallest" line, which measures TOTAL fantasy points, a different denominator. Evidence upgraded weak to moderate.

WEIGHT RE-ASSIGNMENT LOGIC:
- Monotone with evidence: the strong-evidence, high-effect rows (weighted opportunity, receiving role, game script, age curve, ADP, draft capital) hold the top weights. Two deliberate departures, both justified in-row: play-through penalty by injury type has strong evidence but a genuinely small effect (-8.7%), so it sits at 0.7 weekly — evidence quality bounds confidence in a weight, it does not set its magnitude; and OC change carries 2% season weight on weak evidence because 21 of 32 teams changed coordinator, so prevalence times uncertainty is large even though direction is unknown.
- Half-PPR adjustment: receiving/target weight trimmed modestly (not halved) since the real half-PPR target multiple is 2.05x rather than PPR's 2.74x; TD-related weight (RZ volume, TD regression, TD variance) raised correspondingly, since the halved reception floor makes RB outcomes more TD-driven than PPR studies imply.
- Horizon: weekly favors Vegas, matchup, health, weather, and observed usage (age/draft capital/ADP/recurrence/workload-wear all set to 0 weekly since they cannot change within a season); season favors role, age, draft capital, market prior, vacated opportunity, and team environment (game script, opponent matchup, weather, injury designation set to 0 or near-0 in season since they are unknowable at draft time and already aggregated into the win-total row).
- Both columns sum to exactly 100.0. Debunked rows carry 0/0: contract year, revenge games, trap/letdown, hot hand, simple SOS, preseason box scores, cold-weather toughness, generalized injury-prone, fumble propensity, college workload, bye week (hard filter), primetime/divisional (zeroed from 0.1 — the project's own research says skip it).

HONESTY ON ESTIMATION: 22 of the 70 rows carry evidence_quality "estimated" or "weak" and together hold about 17% of weekly weight. Ten rows were downgraded from the merged list's grades (TPRR, vacated touches, backup-QB downgrade, opponent matchup rows, mobile-QB vulture, workload wear, win total, receiving-role stability, home/away direction of change was upward). No row in the top ten by weekly weight rests on an unverified number.

ONE STRUCTURAL WARNING FOR THE ENGINE: the ADP/ECR prior at 7% season weight is both partly circular (ADP is built from these same factors, so blending it additively double-counts them) and the eval baseline the project measures itself against. Implement it as a shrinkage target for cold-start players that decays as the engine's own role estimate becomes well-identified — never as an additive term — or the backtest will show you matching ECR by construction.

---

## WR

**76 factors.** Weekly column sums to 100.0; season column sums to 100.0.

### Summary

WR prediction is dominated by one question — how many targets, at what depth, in how many plays — and everything else is a modifier on that. The top seven weekly factors (target share, implied team total, TPRR, route participation, air-yards share, red-zone target share, injury designation) carry 41.0% of weekly weight between them, and the Opportunity/Volume category alone carries 42.8% weekly and 41.1% season. That concentration is earned: target share, air-yards share and WOPR all sit above 0.70 YoY, TPRR at 0.65 with R²=0.36 to next-season targets — the stickiest player-level stats in football — while the receiver-skill metrics that fantasy content obsesses over (contested-catch rate, drop rate, YACOE, raw YAC) are at or near zero predictive power. Contested catch and drop rate are zeroed outright here; YACOE needs ~163 targets to stabilize, which makes it structurally unusable as a weekly input.

Four dynamics are distinctly WR-shaped and drive most of the deviation from a generic skill-position model:

1. **Depth-of-target is the format lever.** aDOT is the single axis that separates a possession-slot role (high catch volume, halved to 0.5/reception in this format) from a vertical role (undiscounted yardage and TD equity). It also mediates nearly every other WR factor: the shadow-coverage penalty is ≥2 points only at aDOT 12-15 and ~0.5 elsewhere; the two-high-shell suppression lands entirely on deep roles; the wind penalty is a deep-passing penalty, not a team penalty. In this model aDOT is less a factor than an interaction term that half a dozen other factors have to be multiplied through.

2. **Alignment and coverage granularity matter more than at any other position.** WR is the only position where the opponent adjustment has three genuinely separate lanes — boundary CB1 shadow assignment, slot/nickel corner grade, and the defense's structural shell rate — and where the player's own slot-vs-perimeter rate determines which lane applies. Aggregate opponent pass-defense EPA, which is all most models use, is both the weakest of these (positional points-allowed YoY 0.16-0.27) and the one most often stale by kickoff when a starting corner is out.

3. **WR carries the largest play-through injury penalty of the skill positions** (−9.9% overall vs RB −8.7%, TE −8.5%, QB +2.3%), with extreme by-type variance: toe −35.0%, foot −19.8%, ankle −11.8%, but knee only −4.9%. A generic "playing hurt" discount is materially wrong in both directions here. Combined with the finding that the headline 71% Questionable play rate is itself conditional on practice participation, health is 9.2% of weekly weight across four separate inputs and none of them is the injury tag alone.

4. **The season column is a different model, not a discounted version of the weekly one.** 35.2% of season weight sits in factors with literally zero weekly relevance — age curve, draft capital, experience-year breakout window, offseason target-pool change, injury-type recurrence, Vegas win totals, ADP — because at draft time there is no trailing usage, no Vegas game line, no injury report and no weather. Two cautions on that column: ADP correlates 0.599 with late-season points versus 0.585 for a month of actual games, so the model earns very little over the market until roughly Week 5; and the largest season-side bet, offseason target-pool change at 4.6%, has no published validation at all — it is mechanism and industry practice only, and it is the first thing the backtest should try to falsify.

### Weight by category

| Category | Weekly % | Season % | # factors |
|---|---:|---:|---:|
| Opportunity/Volume | 41.6 | 41.1 | 14 |
| Team Environment | 9.7 | 10.8 | 7 |
| Game Script/Vegas | 9.2 | 5.4 | 3 |
| Health/Injury | 9.0 | 5.1 | 5 |
| Matchup/Opponent | 8.8 | 1.9 | 8 |
| Efficiency/Talent | 6.9 | 8.6 | 7 |
| Weather/Venue | 4.4 | 0.6 | 7 |
| Market/Consensus | 4.3 | 5.6 | 4 |
| Coaching/Scheme | 3.4 | 5.5 | 4 |
| Variance Driver | 1.4 | 0.5 | 1 |
| Situational/Schedule | 0.9 | 0.0 | 7 |
| Other | 0.4 | 1.0 | 3 |
| Age/Career Arc | 0.0 | 13.9 | 6 |

### All factors, ranked by weekly weight

Stability = year-over-year stickiness of the underlying stat. Evidence = quality of the published support for the weight (strong / moderate / weak / estimated). Click a factor name for its mechanism, key numbers, and verification notes.

| # | Factor | Weekly % | Season % | Category | Stability | Evidence |
|---:|---|---:|---:|---|---|---|
| 1 | [Target share (trailing team-target share)](#wr-target-share-trailing-team-target-share) | 11.5 | 11 | Opportunity/Volume | high | strong |
| 2 | [Vegas implied team total & game total (weekly)](#wr-vegas-implied-team-total-game-total-weekly) | 5.8 | 0.4 | Game Script/Vegas | high | strong |
| 3 | [TPRR (targets per route run)](#wr-tprr-targets-per-route-run) | 5.2 | 5 | Opportunity/Volume | high | strong |
| 4 | [Route participation rate (routes ÷ team pass plays; snap share as fallback proxy)](#wr-route-participation-rate-routes-team-pass-plays-snap-share-as-fallback-proxy) | 5.2 | 4.5 | Opportunity/Volume | medium | moderate |
| 5 | [Air yards share (team share of air yards)](#wr-air-yards-share-team-share-of-air-yards) | 4.5 | 4.6 | Opportunity/Volume | high | strong |
| 6 | [Red-zone / end-zone target share (player-level)](#wr-red-zone-end-zone-target-share-player-level) | 4.5 | 3.8 | Opportunity/Volume | medium | moderate |
| 7 | [Injury designation / play probability](#wr-injury-designation-play-probability) | 4.3 | 0 | Health/Injury | high | strong |
| 8 | [Vegas spread / game script](#wr-vegas-spread-game-script) | 3.4 | 0 | Game Script/Vegas | high | strong |
| 9 | [QB quality / arm talent (incl. catchable-target-rate mechanism)](#wr-qb-quality-arm-talent-incl-catchable-target-rate-mechanism) | 3.3 | 4 | Team Environment | medium | moderate |
| 10 | [Player-specific Vegas prop markets (receiving yards O/U, receptions O/U, anytime-TD odds)](#wr-player-specific-vegas-prop-markets-receiving-yards-o-u-receptions-o-u-anytime-td-odds) | 2.6 | 0.6 | Market/Consensus | low | estimated |
| 11 | [Practice participation trajectory & post-return snap ramp](#wr-practice-participation-trajectory-post-return-snap-ramp) | 2.5 | 0 | Health/Injury | medium | moderate |
| 12 | [In-season target redistribution (teammate ruled out, and role compression on their return)](#wr-in-season-target-redistribution-teammate-ruled-out-and-role-compression-on-their-return) | 2.4 | 0 | Opportunity/Volume | n/a | estimated |
| 13 | [TD rate / red-zone conversion regression flag (incl. TD-dependence)](#wr-td-rate-red-zone-conversion-regression-flag-incl-td-dependence) | 2.2 | 2.6 | Efficiency/Talent | low | strong |
| 14 | [Target concentration / team target-tree rank](#wr-target-concentration-team-target-tree-rank) | 2 | 2.5 | Opportunity/Volume | medium | moderate |
| 15 | [aDOT / route-depth role (incl. schemed short-game touch share)](#wr-adot-route-depth-role-incl-schemed-short-game-touch-share) | 2 | 1.4 | Opportunity/Volume | medium | moderate |
| 16 | [Opponent pass defense EPA / points allowed to WRs (heavily regressed)](#wr-opponent-pass-defense-epa-points-allowed-to-wrs-heavily-regressed) | 2 | 0.8 | Matchup/Opponent | low | moderate |
| 17 | [Opponent coverage scheme: man/zone mix, two-high shell rate & pass-rush pressure](#wr-opponent-coverage-scheme-man-zone-mix-two-high-shell-rate-pass-rush-pressure) | 2 | 0.5 | Matchup/Opponent | medium | moderate |
| 18 | [Team pace (plays/game, incl. no-huddle/hurry-up rate)](#wr-team-pace-plays-game-incl-no-huddle-hurry-up-rate) | 1.9 | 2.5 | Team Environment | medium | strong |
| 19 | [PROE (pass rate over expected)](#wr-proe-pass-rate-over-expected) | 1.8 | 2 | Team Environment | medium | strong |
| 20 | [Play-through performance penalty (by injury type)](#wr-play-through-performance-penalty-by-injury-type) | 1.8 | 0.4 | Health/Injury | high | strong |
| 21 | [Wind](#wr-wind) | 1.8 | 0 | Weather/Venue | high | strong |
| 22 | [Shadow coverage (CB1 travels with the WR)](#wr-shadow-coverage-cb1-travels-with-the-wr) | 1.6 | 0 | Matchup/Opponent | medium | strong |
| 23 | [ECR / DFS salary (weekly consensus proxies)](#wr-ecr-dfs-salary-weekly-consensus-proxies) | 1.5 | 1.6 | Market/Consensus | medium | estimated |
| 24 | [Slot vs perimeter alignment rate](#wr-slot-vs-perimeter-alignment-rate) | 1.5 | 1.3 | Efficiency/Talent | medium | moderate |
| 25 | [WOPR composite (1.5×TgtShare + 0.7×AirYdsShare)](#wr-wopr-composite-1-5-tgtshare-0-7-airydsshare) | 1.5 | 1.3 | Opportunity/Volume | high | strong |
| 26 | [xFP composite (expected fantasy points from opportunity)](#wr-xfp-composite-expected-fantasy-points-from-opportunity) | 1.5 | 1.3 | Opportunity/Volume | high | moderate |
| 27 | [YPRR (yards per route run)](#wr-yprr-yards-per-route-run) | 1.4 | 2.8 | Efficiency/Talent | medium | moderate |
| 28 | [Offensive scheme profile (personnel groupings, play-action rate, pre-snap motion, passing-concept identity)](#wr-offensive-scheme-profile-personnel-groupings-play-action-rate-pre-snap-motion-passing-concept-identity) | 1.4 | 2 | Coaching/Scheme | medium | moderate |
| 29 | [Target-concentration volatility / boom-bust role profile](#wr-target-concentration-volatility-boom-bust-role-profile) | 1.4 | 0.5 | Variance Driver | low | estimated |
| 30 | [Pass-funnel effect (opponent run-defense strength inducing pass-heavier game plans)](#wr-pass-funnel-effect-opponent-run-defense-strength-inducing-pass-heavier-game-plans) | 1.2 | 0.3 | Matchup/Opponent | medium | weak |
| 31 | [Opponent defensive injuries (secondary starters out)](#wr-opponent-defensive-injuries-secondary-starters-out) | 1.2 | 0 | Matchup/Opponent | n/a | estimated |
| 32 | [Separation / route-winning skill (incl. press-release win rate)](#wr-separation-route-winning-skill-incl-press-release-win-rate) | 1 | 1.2 | Efficiency/Talent | medium | estimated |
| 33 | [Pass protection: OL quality + in-season OL availability](#wr-pass-protection-ol-quality-in-season-ol-availability) | 1 | 0.9 | Team Environment | medium | weak |
| 34 | [OC / play-caller change (incl. scheme-stickiness prior)](#wr-oc-play-caller-change-incl-scheme-stickiness-prior) | 0.8 | 2 | Coaching/Scheme | low | weak |
| 35 | [Red-zone play-calling tendency (pass-heavy vs run-heavy)](#wr-red-zone-play-calling-tendency-pass-heavy-vs-run-heavy) | 0.8 | 1 | Coaching/Scheme | medium | estimated |
| 36 | [In-season trade / offseason team change (new-system adjustment)](#wr-in-season-trade-offseason-team-change-new-system-adjustment) | 0.8 | 0.9 | Team Environment | low | weak |
| 37 | [YAC over expected (YACOE, incl. broken-tackle rate)](#wr-yac-over-expected-yacoe-incl-broken-tackle-rate) | 0.8 | 0.7 | Efficiency/Talent | low | weak |
| 38 | [Dome vs outdoor](#wr-dome-vs-outdoor) | 0.8 | 0.3 | Weather/Venue | high | strong |
| 39 | [Cold temperature (incl. dome-team-on-the-road interaction)](#wr-cold-temperature-incl-dome-team-on-the-road-interaction) | 0.8 | 0 | Weather/Venue | medium | strong |
| 40 | [Opponent slot / nickel-defender quality](#wr-opponent-slot-nickel-defender-quality) | 0.6 | 0 | Matchup/Opponent | medium | moderate |
| 41 | [Team red-zone trip rate](#wr-team-red-zone-trip-rate) | 0.5 | 0.6 | Opportunity/Volume | high | strong |
| 42 | [Money-down / third-down target share](#wr-money-down-third-down-target-share) | 0.5 | 0.3 | Opportunity/Volume | medium | estimated |
| 43 | [Backup-QB start (discrete in-season event)](#wr-backup-qb-start-discrete-in-season-event) | 0.5 | 0.1 | Team Environment | low | weak |
| 44 | [Bye week & Week 18 rest risk](#wr-bye-week-week-18-rest-risk) | 0.5 | 0 | Situational/Schedule | n/a | strong |
| 45 | [Garbage-time production inflation (prior-season audit lens)](#wr-garbage-time-production-inflation-prior-season-audit-lens) | 0.4 | 1 | Other | n/a | moderate |
| 46 | [Coach 4th-down aggressiveness](#wr-coach-4th-down-aggressiveness) | 0.4 | 0.5 | Coaching/Scheme | medium | moderate |
| 47 | [Non-injury absence risk (suspension / holdout / legal)](#wr-non-injury-absence-risk-suspension-holdout-legal) | 0.4 | 0.5 | Health/Injury | low | estimated |
| 48 | [QB scramble-drill / off-script mobility](#wr-qb-scramble-drill-off-script-mobility) | 0.4 | 0.4 | Team Environment | medium | weak |
| 49 | [Heat / humidity (extreme-heat outdoor games)](#wr-heat-humidity-extreme-heat-outdoor-games) | 0.4 | 0 | Weather/Venue | medium | weak |
| 50 | [Rain / snow](#wr-rain-snow) | 0.4 | 0 | Weather/Venue | medium | moderate |
| 51 | [Short week, travel/circadian effects & international neutral-site games](#wr-short-week-travel-circadian-effects-international-neutral-site-games) | 0.4 | 0 | Situational/Schedule | low | moderate |
| 52 | [WR designed rush attempts (jet sweep / end-around / reverse)](#wr-wr-designed-rush-attempts-jet-sweep-end-around-reverse) | 0.3 | 0.2 | Opportunity/Volume | medium | estimated |
| 53 | [Opponent DC / defensive-scheme change (uncertainty widener)](#wr-opponent-dc-defensive-scheme-change-uncertainty-widener) | 0.2 | 0.3 | Matchup/Opponent | n/a | weak |
| 54 | [Vegas line movement (open-to-close shift / steam)](#wr-vegas-line-movement-open-to-close-shift-steam) | 0.2 | 0 | Market/Consensus | low | weak |
| 55 | [Turf vs grass](#wr-turf-vs-grass) | 0.1 | 0.3 | Weather/Venue | low | weak |
| 56 | [Altitude (Denver ~5,280 ft / Mexico City ~7,350 ft)](#wr-altitude-denver-5-280-ft-mexico-city-7-350-ft) | 0.1 | 0 | Weather/Venue | medium | weak |
| 57 | [Age curve](#wr-age-curve) | 0 | 5.2 | Age/Career Arc | high | strong |
| 58 | [Vegas season win total (draft-time team-quality prior)](#wr-vegas-season-win-total-draft-time-team-quality-prior) | 0 | 5 | Game Script/Vegas | high | strong |
| 59 | [Offseason target-pool change (vacated departures net of incoming competition)](#wr-offseason-target-pool-change-vacated-departures-net-of-incoming-competition) | 0 | 4.6 | Opportunity/Volume | n/a | weak |
| 60 | [Injury-type recurrence (incl. age × injury interaction)](#wr-injury-type-recurrence-incl-age-injury-interaction) | 0 | 4.2 | Health/Injury | high | strong |
| 61 | [Draft capital (years 1-3)](#wr-draft-capital-years-1-3) | 0 | 4 | Age/Career Arc | high | strong |
| 62 | [ADP (average draft position)](#wr-adp-average-draft-position) | 0 | 3.4 | Market/Consensus | high | strong |
| 63 | [NFL experience-year curve (Year-1 discount, Year 2-3 breakout window)](#wr-nfl-experience-year-curve-year-1-discount-year-2-3-breakout-window) | 0 | 3.3 | Age/Career Arc | medium | moderate |
| 64 | [Breakout age (age at first collegiate target dominance)](#wr-breakout-age-age-at-first-collegiate-target-dominance) | 0 | 0.8 | Age/Career Arc | n/a | weak |
| 65 | [College Dominator rating (college target/yardage market share)](#wr-college-dominator-rating-college-target-yardage-market-share) | 0 | 0.6 | Age/Career Arc | n/a | weak |
| 66 | [Combine athleticism / RAS](#wr-combine-athleticism-ras) | 0 | 0 | Efficiency/Talent | n/a | strong |
| 67 | [Contested-catch rate & drop rate](#wr-contested-catch-rate-drop-rate) | 0 | 0 | Efficiency/Talent | low | strong |
| 68 | [Contract year](#wr-contract-year) | 0 | 0 | Age/Career Arc | n/a | strong |
| 69 | [Divisional-game familiarity (second meetings)](#wr-divisional-game-familiarity-second-meetings) | 0 | 0 | Situational/Schedule | low | weak |
| 70 | [Home / away](#wr-home-away) | 0 | 0 | Situational/Schedule | low | strong |
| 71 | [Hot hand / efficiency streaks](#wr-hot-hand-efficiency-streaks) | 0 | 0 | Other | n/a | strong |
| 72 | [Naive strength of schedule (season points-allowed-to-WR rankings)](#wr-naive-strength-of-schedule-season-points-allowed-to-wr-rankings) | 0 | 0 | Matchup/Opponent | low | strong |
| 73 | [Preseason box-score production](#wr-preseason-box-score-production) | 0 | 0 | Other | n/a | strong |
| 74 | [Primetime split](#wr-primetime-split) | 0 | 0 | Situational/Schedule | low | weak |
| 75 | [Revenge games](#wr-revenge-games) | 0 | 0 | Situational/Schedule | n/a | strong |
| 76 | [Trap / letdown games](#wr-trap-letdown-games) | 0 | 0 | Situational/Schedule | n/a | strong |

### Top 15 by season (draft-time) weight

| # | Factor | Season % | Weekly % |
|---:|---|---:|---:|
| 1 | Target share (trailing team-target share) | 11 | 11.5 |
| 2 | Age curve | 5.2 | 0 |
| 3 | TPRR (targets per route run) | 5 | 5.2 |
| 4 | Vegas season win total (draft-time team-quality prior) | 5 | 0 |
| 5 | Air yards share (team share of air yards) | 4.6 | 4.5 |
| 6 | Offseason target-pool change (vacated departures net of incoming competition) | 4.6 | 0 |
| 7 | Route participation rate (routes ÷ team pass plays; snap share as fallback proxy) | 4.5 | 5.2 |
| 8 | Injury-type recurrence (incl. age × injury interaction) | 4.2 | 0 |
| 9 | Draft capital (years 1-3) | 4 | 0 |
| 10 | QB quality / arm talent (incl. catchable-target-rate mechanism) | 4 | 3.3 |
| 11 | Red-zone / end-zone target share (player-level) | 3.8 | 4.5 |
| 12 | ADP (average draft position) | 3.4 | 0 |
| 13 | NFL experience-year curve (Year-1 discount, Year 2-3 breakout window) | 3.3 | 0 |
| 14 | YPRR (yards per route run) | 2.8 | 1.4 |
| 15 | TD rate / red-zone conversion regression flag (incl. TD-dependence) | 2.6 | 2.2 |

### Verification corrections

What the adversarial pass changed relative to the first-draft list, and why:

**Merges (76 submitted entries → 68; 10 merge operations).** Snap share → route participation (strictly a noisier proxy for the same playing-time construct). Catchable-target rate → QB quality (flagged correction: same arm-talent construct at two timescales; the naive sum was 4.2 weekly, the merged factor is 3.3). Two-high shell rate → opponent coverage scheme (shell rate IS a coverage tendency). Motion usage + passing-concept identity + personnel/play-action → one "offensive scheme profile" (PFF groups all three; the concept-identity author flagged the double-count himself). Press-release win rate → separation (a sub-skill of the same unmeasured construct — both were estimated with no fantasy coefficient, so splitting implied evidence that does not exist). Schemed short-passing touches → aDOT (the left tail of the same distribution). Teammate-return compression → in-season redistribution (same table, opposite sign). Offseason target-competition addition → vacated target share, now "offseason target-pool change (net)" (modeling only the subtraction side systematically over-projects returning WRs on teams that added competition). In-season OL injury event → OL pass-protection quality (one construct, static and dynamic inputs). International neutral-site games → short-week/travel/circadian (same mechanism, no independent evidence).

**Corrections applied (all 9 flagged, plus 4 found in verification).** Applied: split breakout age (r≈0.43) from College Dominator (r≈0.22) as two separate items; backup-QB start kept separate from QB quality as a sign-ambiguous uncertainty widener with an explicit warning against a fixed-direction penalty; altitude restored; opponent slot/nickel-corner quality added as a distinct matchup lane; QB-quality/CTR double-count resolved by merging; slot alignment reclassified from Opportunity/Volume to Efficiency/Talent (it does not add targets, it changes conversion on targets already earned); in-season OL availability represented; half-PPR translation applied at the weight level (below); Year-2/3 breakout merged with rather than kept alongside the Year-1 discount — I judged these to be one distribution, not two factors, which is a partial rejection of that correction's framing while honoring its substance. Found during verification: (a) WR foot injuries are −19.8%, not "−20 to −25%" — the −25%+ tier is TOE at −35.0%, a different tag; (b) the 71% Questionable play rate is conditional on limited practice participation, not the unconditional rate (ESPN's unconditional cut is ~75%, and Doubtful ranges <3% to ~7% by study); (c) game-script pass rate when leading is 49%, not 50%, and the 56% tied figure was not independently confirmed; (d) the WR age "cliff at 32" is overstated — WRs 30-34 still produce ~92% of late-20s PPG, so it is a right-tail (WR1-probability) collapse after 29, not a mean step-function at 32.

**Verified.** Web-confirmed: target share ~0.70 YoY; TPRR 0.65 YoY and R²=0.36 to next-season targets; shadow coverage ≥2 pts at aDOT 12-15 vs ≤0.5 elsewhere; WR play-through −9.9% and the full by-injury-type table; ADP 0.599 vs 0.585; R4+ WR 4.4% top-30 hit rate (9 receivers since 2015); 52% of first-time WR1 seasons in Year 2-3 and 68% by Year 3 — with the new caveat that Year 4 now rivals Year 2, so the window is widening; WR peak age 26-27.

**Downgrades (evidence-driven).** Player prop markets 4.0→2.6 weekly: no published effect size, and props are heavily redundant with the implied total, matchup and injury layers already in the model, so the honest quantity is marginal information over the model, not the line's full predictive power. Pass-funnel 2.5→1.2 and moderate→weak: the submitted entry did not reconcile with factors.md's explicit debunk of funnel-defense rankings; only the current-season within-year EPA split survives. In-season trade 2.0→0.8 and it must be sign-neutral — the PFF study's mean is POSITIVE (62.31→73.61) on n=10 with a bimodal spread. Heat/humidity 1.0→0.4 and moderate→weak: the ~8% figure comes from a betting content site with no analytics corroboration, and cannot sit near wind, whose numbers trace to real sources. QB scramble mobility 1.0→0.4 and in-season OL event folded in at a lower combined weight — both weak-evidence items were outweighing published-effect-size factors. Vacated targets moderate→weak after a direct search found no source quantifying its predictive accuracy (this is now flagged as the season column's largest unvalidated bet). Contested-catch/drop rate 0.5/0.4→0/0: the evidence for "not predictive" is strong, so under the project's own convention it belongs with the debunked set, and its regression-flag use is already performed by the TD-regression and garbage-time factors.

**Upgrades.** Practice-participation trajectory estimated→moderate: verification showed the headline designation study is itself practice-conditioned, which is direct evidence of non-redundancy rather than mere plausibility. Team red-zone trip rate held at strong evidence despite a floor-level weight (redundancy exemption, not an evidence judgment).

**Half-PPR translation (the structural gap the prior critic flagged).** With receptions at 0.5 rather than 1.0, the scoring mass shifts from catch count toward per-target yardage and TDs. Applied as: target share 12.2→11.5 weekly; air-yards share 4.2→4.5; player RZ target share 4.2→4.5; aDOT 1.7→2.0; TD-regression flag raised at both horizons; WR designed rushes noted as format-invariant (rushing points are not halved). Net effect is a ~1.5-point transfer within Opportunity/Volume from catch-count metrics to depth-and-scoring metrics rather than a transfer out of the category. Also flagged in-line: the slot's +11.5% per-target premium is partly a catch-rate premium and should be applied discounted in this format.

**Redundancy exemptions to the monotone-with-evidence rule (4).** WOPR (>0.70 YoY, weighted 1.5 weekly), xFP, team RZ trip rate (r≈0.65, weighted 0.5) and breakout age (r≈0.43, weighted 0.8) all carry weights far below what their raw evidence would justify. WOPR and xFP are deterministic functions of factors already weighted above them — the engine must use EITHER WOPR OR (target share + air-yards share), never all three. RZ trip rate is near-collinear with the Vegas implied total weekly. Breakout age is additionally overridden by its source's own explicit low-confidence caveat and by its collinearity with draft capital, which teams set from the same college tape.

**Additions by the calibrator (4, all zero-weight nulls).** Home/away (WR ≈ 0 while DST is +21% — a WR-specific measured null the list omitted), naive SOS by prior-year points-allowed rankings (distinct from the regressed current-season EPA factor that keeps a small weight), and combine athleticism/RAS (r=0.014 — the most decisive null in the WR prospect literature, and heavily marketed in draft content). These complete the debunk catalog to 11 zero-weight entries.

**Sums.** Weekly = 100.0 exactly across 68 factors; season = 100.0 exactly. Category shares weekly: Opportunity 42.8, Team Environment 10.0, Game Script/Vegas 9.2, Health 9.2, Matchup 9.2, Efficiency 6.9, Market 4.7, Weather 4.4, Coaching 3.4, Variance 1.4, Situational 1.3, Other 0.4, Age 0. Season: Opportunity 41.1, Age/Career 13.9, Team Environment 10.8, Efficiency 8.6, Market 5.6, Coaching 5.5, Vegas 5.4, Health 5.1, Matchup 1.9, Other 1.0, Weather 0.6, Variance 0.5, Situational 0.

**Honest accounting of estimation.** 14 factors are flagged "estimated" and 12 "weak" — 38% of the non-zero list has no published effect size. They hold 24.6% of weekly weight and 18.3% of season weight combined. The three largest unvalidated positions are player prop markets (2.6 weekly), in-season target redistribution (2.4 weekly) and offseason target-pool change (4.6 season). Every factor above 3% at either horizon now traces to a re-verified published number.

---

## TE

**76 factors.** Weekly column sums to 100.0; season column sums to 100.0.

### Summary

TE is the most opportunity-concentrated and most role-gated position in half-PPR. Target share (YoY r=0.695) and route share (r=0.583) are the two stickiest TE stats measured, and together they carry 25.5% of weekly and 23.5% of season weight — more than any other position should assign to trailing usage. Everything else is either a modifier on that role or a driver of the interval around it.

Four things make TE genuinely distinctive, and the weights encode each:

1. **The blocking gate is upstream of everything.** Every in-line blocking snap is a route that cannot happen. This is a mechanical suppressor with no analogue at WR, and it is why route share (not snap share) is the correct denominator and why blocking-snap rate carries more SEASON than weekly weight — it predicts change in role for players whose measured role is not yet stable.

2. **TD concentration is real but frequently overstated.** TE receiving TDs correlate 0.74 with same-season PPG and only 0.33 with next-season PPG, at 0.28 YoY stability (FantasyLife 2026) — so trailing TDs are close to pure noise while trailing TD-driven fantasy points look like signal. The honest magnitude: a typical TE1 line (70/750/6) is ~25% TDs in half-PPR, only modestly above a WR1's ~21%. The distinctive part is variance-to-mean, not mean composition — at ~9 pts/game a single TD is two-thirds of a median week. Hence RZ/EZ target share at 6.4% weekly (the position's highest non-usage weight) but only 2.5% season, and a separate TD-regression flag that pulls the mean while the TD-dependence variance driver widens the interval.

3. **Matchup is noisier at TE than anywhere else in football.** Fantasy points allowed to TE has a year-to-year correlation of 0.16 — the lowest of the four positions (QB 0.27, RB 0.22, WR low; 4for4 2026 over 2015-2025), with top-5 TE defenses repeating just 21% of the time. The residual signal that does exist is structural (TEs are covered by linebackers and safeties, not shadow corners), so the engine should use opponent LB/S coverage personnel and their injury status, never a points-allowed rank. Total opponent-side weight is 2.8% weekly.

4. **Rookie and prospect priors behave unlike WR.** Combine athleticism, near-worthless at WR (RAS r=0.014), retains a modest positive correlation at TE even after controlling for draft capital (FantasyPoints SPORQ) — big, fast bodies create the mismatch the position monetizes. And the rookie learning curve is the steepest of any skill position, making Year 2-3 the modal breakout window rather than Year 1. Draft capital, age curve, rookie curve, athleticism, and archetype together carry 10.7% of season weight and 0.1% weekly.

The half-PPR translation shifts weight in a consistent direction throughout: receptions are worth 0.5 rather than 1.0, so pure target-count volume is worth somewhat less than PPR-derived studies imply, while yardage efficiency (YPRR, YACOE), red-zone role, and team scoring environment are worth somewhat more. This is why YPRR sits at 4.0% weekly rather than the 3.0% the source list gave it, and why RZ target share outranks every non-usage factor.

One thing the engine should treat as a warning rather than a factor: 4for4's 2026 TE model finds ADP is "by far the most important variable," with everything else measured as incremental lift over it. That is a statement about how much the market already knows, not a license to weight consensus heavily — PLAN.md §5 benchmarks this engine against ECR, so any ECR/ADP input must decay hard once real usage lands, or the engine will reproduce consensus and score exactly at parity forever. Season ADP weight is 8.5%; weekly is 1.0%.

Finally: FantasyLife's finding that receiving yards per game is the single best next-season predictor (r=0.65, beating fantasy PPG) is NOT listed as a factor because it is a composite of the volume and efficiency terms already weighted — but it is the right sanity check on the whole model. If the engine's season projection disagrees sharply with a TE's trailing YPG, the burden of proof is on the engine.

### Weight by category

| Category | Weekly % | Season % | # factors |
|---|---:|---:|---:|
| Opportunity/Volume | 44.0 | 37.3 | 13 |
| Team Environment | 13.9 | 13.1 | 11 |
| Efficiency/Talent | 8.6 | 8.9 | 7 |
| Game Script/Vegas | 8.5 | 4.9 | 3 |
| Health/Injury | 7.8 | 4.6 | 4 |
| Variance Driver | 6.1 | 3.0 | 3 |
| Matchup/Opponent | 3.2 | 0.9 | 4 |
| Market/Consensus | 2.7 | 9.0 | 3 |
| Coaching/Scheme | 2.1 | 5.9 | 5 |
| Weather/Venue | 1.8 | 0.8 | 3 |
| Situational/Schedule | 1.1 | 0.3 | 5 |
| Age/Career Arc | 0.2 | 11.3 | 6 |
| Other | 0.0 | 0.0 | 9 |

### All factors, ranked by weekly weight

Stability = year-over-year stickiness of the underlying stat. Evidence = quality of the published support for the weight (strong / moderate / weak / estimated). Click a factor name for its mechanism, key numbers, and verification notes.

| # | Factor | Weekly % | Season % | Category | Stability | Evidence |
|---:|---|---:|---:|---|---|---|
| 1 | [Trailing target share](#te-trailing-target-share) | 15 | 13.5 | Opportunity/Volume | high | strong |
| 2 | [Route participation & snap share](#te-route-participation-snap-share) | 10.5 | 10 | Opportunity/Volume | high | strong |
| 3 | [Red zone / end zone / goal-line target share](#te-red-zone-end-zone-goal-line-target-share) | 6.4 | 2.5 | Opportunity/Volume | medium | strong |
| 4 | [Injury designation / practice-participation trajectory](#te-injury-designation-practice-participation-trajectory) | 5.9 | 1 | Health/Injury | high | strong |
| 5 | [Team implied total / scoring environment](#te-team-implied-total-scoring-environment) | 5 | 1.5 | Game Script/Vegas | high | strong |
| 6 | [Yards per route run (YPRR)](#te-yards-per-route-run-yprr) | 4 | 3.3 | Efficiency/Talent | medium | strong |
| 7 | [Spread / game-script shift](#te-spread-game-script-shift) | 3.5 | 0 | Game Script/Vegas | high | moderate |
| 8 | [QB quality / accuracy, incl. backup-QB downgrade](#te-qb-quality-accuracy-incl-backup-qb-downgrade) | 3.2 | 2 | Team Environment | low | moderate |
| 9 | [In-season vacated-target reallocation](#te-in-season-vacated-target-reallocation) | 3 | 0 | Opportunity/Volume | n/a | estimated |
| 10 | [TD dependence / boom-bust variance](#te-td-dependence-boom-bust-variance) | 2.8 | 1 | Variance Driver | low | strong |
| 11 | [TPRR (targets per route run)](#te-tprr-targets-per-route-run) | 2.6 | 2 | Opportunity/Volume | medium | moderate |
| 12 | [Team pace (offensive plays per game)](#te-team-pace-offensive-plays-per-game) | 2.3 | 1.8 | Team Environment | medium | strong |
| 13 | [Team pass rate / PROE](#te-team-pass-rate-proe) | 2 | 1.8 | Team Environment | medium | strong |
| 14 | [Two-TE committee volatility](#te-two-te-committee-volatility) | 2 | 1.2 | Variance Driver | low | estimated |
| 15 | [Slot / big-slot alignment rate](#te-slot-big-slot-alignment-rate) | 1.8 | 1 | Opportunity/Volume | medium | moderate |
| 16 | [Opponent coverage matchup (LB/S coverage quality, man/zone rate, points allowed to TE)](#te-opponent-coverage-matchup-lb-s-coverage-quality-man-zone-rate-points-allowed-to-te) | 1.8 | 0.4 | Matchup/Opponent | low | strong |
| 17 | [In-line blocking-snap rate (route suppressor)](#te-in-line-blocking-snap-rate-route-suppressor) | 1.6 | 2.2 | Opportunity/Volume | high | moderate |
| 18 | [TD rate / red-zone conversion regression flag](#te-td-rate-red-zone-conversion-regression-flag) | 1.6 | 1.8 | Efficiency/Talent | low | strong |
| 19 | [Target-tree competition (WR corps + pass-catching RB)](#te-target-tree-competition-wr-corps-pass-catching-rb) | 1.5 | 1.6 | Team Environment | medium | estimated |
| 20 | [TD / receiving-yardage prop market signal](#te-td-receiving-yardage-prop-market-signal) | 1.4 | 0.3 | Market/Consensus | low | estimated |
| 21 | [QB-specific portable TE-target tendency](#te-qb-specific-portable-te-target-tendency) | 1.3 | 2.2 | Team Environment | high | weak |
| 22 | [Weekly target-floor volatility (low-share TEs)](#te-weekly-target-floor-volatility-low-share-tes) | 1.3 | 0.8 | Variance Driver | low | estimated |
| 23 | [CROE (catch rate over expectation)](#te-croe-catch-rate-over-expectation) | 1.2 | 0.7 | Efficiency/Talent | low | moderate |
| 24 | [YAC over expected (YACOE) / YAC per reception](#te-yac-over-expected-yacoe-yac-per-reception) | 1.1 | 0.5 | Efficiency/Talent | low | moderate |
| 25 | [Play-through penalty by injury type](#te-play-through-penalty-by-injury-type) | 1.1 | 0.3 | Health/Injury | high | strong |
| 26 | [ADP / preseason ECR](#te-adp-preseason-ecr) | 1 | 8.5 | Market/Consensus | high | strong |
| 27 | [Air yards share / aDOT](#te-air-yards-share-adot) | 1 | 0.9 | Opportunity/Volume | medium | estimated |
| 28 | [In-season OL starter injury / replacement (pressure-rate shock)](#te-in-season-ol-starter-injury-replacement-pressure-rate-shock) | 1 | 0.3 | Team Environment | n/a | estimated |
| 29 | [Pre-snap motion rate / TE-in-motion usage](#te-pre-snap-motion-rate-te-in-motion-usage) | 0.9 | 0.7 | Coaching/Scheme | medium | moderate |
| 30 | [Adverse weather (wind / cold / precipitation)](#te-adverse-weather-wind-cold-precipitation) | 0.9 | 0.1 | Weather/Venue | high | strong |
| 31 | [Designed rush-attempt / gadget-touch usage](#te-designed-rush-attempt-gadget-touch-usage) | 0.8 | 0.5 | Opportunity/Volume | medium | moderate |
| 32 | [Play-action rate](#te-play-action-rate) | 0.8 | 0.4 | Team Environment | medium | estimated |
| 33 | [Dome vs outdoor / altitude](#te-dome-vs-outdoor-altitude) | 0.8 | 0.2 | Weather/Venue | high | strong |
| 34 | [Empty-backfield (no-RB) rate](#te-empty-backfield-no-rb-rate) | 0.7 | 0.3 | Opportunity/Volume | medium | estimated |
| 35 | [Post-return ramp-up](#te-post-return-ramp-up) | 0.6 | 0.5 | Health/Injury | medium | estimated |
| 36 | [OL pass-protection quality / pressure rate (static)](#te-ol-pass-protection-quality-pressure-rate-static) | 0.6 | 0.4 | Team Environment | medium | weak |
| 37 | [Situational role rate (3rd-down + 2-minute usage)](#te-situational-role-rate-3rd-down-2-minute-usage) | 0.6 | 0.4 | Opportunity/Volume | medium | estimated |
| 38 | [Opponent defensive injuries](#te-opponent-defensive-injuries) | 0.6 | 0 | Matchup/Opponent | n/a | estimated |
| 39 | [Red-zone / TE-featuring play-calling tendency](#te-red-zone-te-featuring-play-calling-tendency) | 0.5 | 1.4 | Coaching/Scheme | medium | weak |
| 40 | [Red-zone run/pass mix (team-level gate)](#te-red-zone-run-pass-mix-team-level-gate) | 0.5 | 0.7 | Team Environment | medium | estimated |
| 41 | [Personnel-grouping usage (12-personnel / 2-TE rate)](#te-personnel-grouping-usage-12-personnel-2-te-rate) | 0.5 | 0.4 | Team Environment | medium | moderate |
| 42 | [Play-caller TE-usage portable fingerprint](#te-play-caller-te-usage-portable-fingerprint) | 0.4 | 1.8 | Coaching/Scheme | medium | weak |
| 43 | [Two-high safety shell rate (opponent)](#te-two-high-safety-shell-rate-opponent) | 0.4 | 0.3 | Matchup/Opponent | medium | weak |
| 44 | [Opponent pass-rush / pressure rate](#te-opponent-pass-rush-pressure-rate) | 0.4 | 0.2 | Matchup/Opponent | medium | estimated |
| 45 | [Run-blocking grade (snap-retention mechanism)](#te-run-blocking-grade-snap-retention-mechanism) | 0.3 | 1.2 | Efficiency/Talent | high | weak |
| 46 | [Home/away split](#te-home-away-split) | 0.3 | 0.3 | Situational/Schedule | low | moderate |
| 47 | [In-season ECR / DFS-salary momentum](#te-in-season-ecr-dfs-salary-momentum) | 0.3 | 0.2 | Market/Consensus | low | estimated |
| 48 | [Week 18 rest risk](#te-week-18-rest-risk) | 0.3 | 0 | Situational/Schedule | low | weak |
| 49 | [Injury-type recurrence (specific body part)](#te-injury-type-recurrence-specific-body-part) | 0.2 | 2.8 | Health/Injury | high | strong |
| 50 | [OC / scheme change (uncertainty widener)](#te-oc-scheme-change-uncertainty-widener) | 0.2 | 1.7 | Coaching/Scheme | low | weak |
| 51 | [New TE roster investment / depth-chart competition threat](#te-new-te-roster-investment-depth-chart-competition-threat) | 0.2 | 1.5 | Team Environment | n/a | estimated |
| 52 | [Man-coverage YPRR (role-retention leading indicator)](#te-man-coverage-yprr-role-retention-leading-indicator) | 0.2 | 1.2 | Efficiency/Talent | medium | weak |
| 53 | [Drop rate](#te-drop-rate) | 0.2 | 0.2 | Efficiency/Talent | low | estimated |
| 54 | [Bye week](#te-bye-week) | 0.2 | 0 | Situational/Schedule | high | strong |
| 55 | [Short week / Thursday / travel-circadian](#te-short-week-thursday-travel-circadian) | 0.2 | 0 | Situational/Schedule | low | weak |
| 56 | [Rookie TE learning curve (Year 1 depressed → Year 2-3 breakout)](#te-rookie-te-learning-curve-year-1-depressed-year-2-3-breakout) | 0.1 | 1.7 | Age/Career Arc | medium | moderate |
| 57 | [Veteran TE trade / free-agency assimilation lag](#te-veteran-te-trade-free-agency-assimilation-lag) | 0.1 | 0.6 | Age/Career Arc | low | estimated |
| 58 | [Turf vs. grass injury risk](#te-turf-vs-grass-injury-risk) | 0.1 | 0.5 | Weather/Venue | high | weak |
| 59 | [Coach 4th-down aggressiveness](#te-coach-4th-down-aggressiveness) | 0.1 | 0.3 | Coaching/Scheme | medium | moderate |
| 60 | [Primetime / divisional familiarity](#te-primetime-divisional-familiarity) | 0.1 | 0 | Situational/Schedule | low | weak |
| 61 | [Age curve](#te-age-curve) | 0 | 4.2 | Age/Career Arc | high | strong |
| 62 | [Offseason vacated-target share](#te-offseason-vacated-target-share) | 0 | 4 | Opportunity/Volume | medium | estimated |
| 63 | [Vegas season win totals](#te-vegas-season-win-totals) | 0 | 3.4 | Game Script/Vegas | high | moderate |
| 64 | [Draft capital (rookie / Year 1-3 prior)](#te-draft-capital-rookie-year-1-3-prior) | 0 | 3 | Age/Career Arc | high | moderate |
| 65 | [Prospect athleticism (RAS / SPORQ)](#te-prospect-athleticism-ras-sporq) | 0 | 1.3 | Age/Career Arc | medium | moderate |
| 66 | [Prospect archetype: in-line Y-TE vs. move/big-slot TE](#te-prospect-archetype-in-line-y-te-vs-move-big-slot-te) | 0 | 0.5 | Age/Career Arc | n/a | estimated |
| 67 | [Contract-year status](#te-contract-year-status) | 0 | 0 | Other | n/a | strong |
| 68 | [Garbage-time inflation of trailing box scores](#te-garbage-time-inflation-of-trailing-box-scores) | 0 | 0 | Other | n/a | moderate |
| 69 | [Generalized 'injury-prone' label](#te-generalized-injury-prone-label) | 0 | 0 | Other | n/a | strong |
| 70 | [Half-PPR scoring-format translation](#te-half-ppr-scoring-format-translation) | 0 | 0 | Other | n/a | strong |
| 71 | [Hot hand / efficiency streaks](#te-hot-hand-efficiency-streaks) | 0 | 0 | Other | n/a | strong |
| 72 | [Positional replacement-level flatness (TE tier structure)](#te-positional-replacement-level-flatness-te-tier-structure) | 0 | 0 | Other | high | moderate |
| 73 | [Preseason box-score production](#te-preseason-box-score-production) | 0 | 0 | Other | n/a | strong |
| 74 | [Revenge games / trap-letdown games](#te-revenge-games-trap-letdown-games) | 0 | 0 | Other | n/a | strong |
| 75 | [Simple SOS / funnel-defense season rankings](#te-simple-sos-funnel-defense-season-rankings) | 0 | 0 | Other | n/a | strong |
| 76 | [WOPR composite (1.5×TgtShare + 0.7×AirYdsShare)](#te-wopr-composite-1-5-tgtshare-0-7-airydsshare) | 0 | 0 | Opportunity/Volume | high | moderate |

### Top 15 by season (draft-time) weight

| # | Factor | Season % | Weekly % |
|---:|---|---:|---:|
| 1 | Trailing target share | 13.5 | 15 |
| 2 | Route participation & snap share | 10 | 10.5 |
| 3 | ADP / preseason ECR | 8.5 | 1 |
| 4 | Age curve | 4.2 | 0 |
| 5 | Offseason vacated-target share | 4 | 0 |
| 6 | Vegas season win totals | 3.4 | 0 |
| 7 | Yards per route run (YPRR) | 3.3 | 4 |
| 8 | Draft capital (rookie / Year 1-3 prior) | 3 | 0 |
| 9 | Injury-type recurrence (specific body part) | 2.8 | 0.2 |
| 10 | Red zone / end zone / goal-line target share | 2.5 | 6.4 |
| 11 | In-line blocking-snap rate (route suppressor) | 2.2 | 1.6 |
| 12 | QB-specific portable TE-target tendency | 2.2 | 1.3 |
| 13 | QB quality / accuracy, incl. backup-QB downgrade | 2 | 3.2 |
| 14 | TPRR (targets per route run) | 2 | 2.6 |
| 15 | Play-caller TE-usage portable fingerprint | 1.8 | 0.4 |

### Verification corrections

What the adversarial pass changed relative to the first-draft list, and why:

**All three flagged corrections were valid and applied.**

1. *WOPR double-counting* — VALID, zeroed. WOPR is a fixed linear combination (1.5×TgtShare + 0.7×AirYdsShare) of two factors that are both independently weighted, target share being the largest weight in both columns. Weighting it a third time as a separate Opportunity/Volume entry was straightforward double-counting. Retained as an entry at 0/0 with a note that it is the correct *implementation* form of the opportunity composite (use it OR the two inputs, never both), rather than deleted, so the completeness audit shows why it is not scored.
2. *Catch rate → CROE* — VALID, reformulated. Raw catch rate conflates route depth with hands. Replaced with a CROE entry, and evidence upgraded from "estimated" to "moderate" on 4for4's 2026 TE model, which ranks CROE sixth in variable importance with ~+5 points over expectation as the meaningful threshold.
3. *PROE ≠ volume* — VALID, both entries rewritten. PROE now correctly described as a rate; team pace added as the volume multiplier. I also fixed a cross-contaminated raw_signal that neither the researcher nor the gap-hunter caught: factors.md's "r=0.43-0.47 with QB/HC continuity" is the **pace** figure, not PROE's, and the "~24-pt neutral-script pass-probability spread" is a **PROE** dispersion stat, not a pace stat. Both entries had them swapped. PROE's own published figure is early-season R²=0.32 to full season.

**Corrections I found independently through web verification:**

- **Opponent matchup, cut 4.0 → 1.8 weekly.** The merged list cited "defensive fantasy-points-allowed YoY 0.16-0.27" as a cross-position range without noting that **0.16 IS the TE value and is the lowest of all four positions** (4for4 2026, 2015-2025; top-5 TE defenses repeat 21%, bottom-5 16%). TE matchup must be shrunk harder than at any other position, not equally. Evidence_quality raised to "strong" for the null itself.
- **Two-high safety shell, cut 1.0 → 0.4 weekly and downgraded to weak — direction is contested.** The gap-hunter's sole source (Fantasy In Frames) is fully paywalled and unverifiable; the free coverage I could reach argues the **opposite** sign, describing two-high zone shells as vulnerable to easy receptions over the middle — which would *help* TEs, not suppress them. A factor whose sign is unresolved cannot carry a signed adjustment. Rewrote the mechanism as direction-ambiguous and flagged it as needing a direct measurement (TE points/route vs 1-high and 2-high) before it earns weight.
- **RZ conversion rate corrected, 44% → 41.8-43.2%.** The "≈44% (Lineups/PFF)" figure was slightly high and mis-attributed. PFF's actual article reports ~37% for all receivers on end-zone targets and ~19% per red-zone target; the TE-specific 41.8-43.2% comes from Sharp Football. The TE-vs-all-receiver *edge* (42% vs 37%) survives and is the load-bearing fact, so evidence went **up** to strong.
- **Man-coverage YPRR downgraded to weak.** The merged list quoted the "35% gap" without the source's own caveat that the split "isn't strongly predictive," and that **zone** YPRR ranks first because NFL defenses play zone ~3× as often and TE aDOT is shallow. Weight cut and the implementation note now points at zone YPRR.
- **Prospect athleticism softened, 1.5 → 1.3 season.** The "20 TEs with a TE1 season, only 3 tested poorly" claim is survivorship reasoning with no control group — it never reports how many well-testing TEs busted. Broader coverage describes the RAS-to-success correlation as modest with enormous variance (Andrews the standing counterexample). What actually carries the factor is FantasyPoints' SPORQ retaining positive correlation *after* controlling for draft capital. The position-specific deviation from the WR null is real; its size is modest, not large.
- **OL pass-protection downgraded to weak.** The "~60% more points/play in a clean pocket" figure traces to a search synthesis, not a citable study, and the sign of the TE effect is genuinely ambiguous (pressure creates checkdowns but suppresses scoring).
- **Play-caller fingerprint and RZ-tendency both downgraded to weak.** Both rest on cases where player and scheme are perfectly confounded (Petzing kept the same TE; the Goedert/Ferguson RZ splits cannot separate a TE-featuring coordinator from a good TE).
- **QB-specific TE tendency downgraded to weak.** One quarterback across three teams is a clean pattern but still an anecdote.
- **Short week / circadian downgraded to weak.** The one solid result is a 1970-2011 *team-level ATS* finding, not a player-level fantasy finding.

**Upgrades from the 4for4 2026 "Most Predictable Tight End Stats" model** (which ranks variables by incremental importance over ADP), all previously marked "estimated" at 1% or less: **TPRR** 1.0 → 2.6 weekly (3rd-ranked variable), **slot rate** 1.0 → 1.8 (4th), **TE rushing attempts** 0.3 → 0.8 (6th; an offensive-trust signal, not a scoring source), **CROE** and **YAC/reception** upgraded to moderate. **YPRR** raised 3.0 → 4.0 weekly on two independent findings: r=0.65 with next-season points among high-route TEs (FantasyLife) and >0.60 YoY for pass-catchers (SumerSports) — well above the "efficiency is noise" band the source synthesis assumed. **ADP season** 7 → 8.5 on 4for4 calling it "by far the most important variable."

**Merges:** "Target-tree competition (WR1/WR2 crowding)" + "RB/checkdown target competition" collapsed into one entry — same zero-sum target-pool mechanism, different competitors, and scoring them separately double-counted the same pie. "Catch rate" absorbed into CROE.

**One deliberate monotonicity exception, declared:** route share (r=0.583) outweighs YPRR (r=0.65) 10.5 to 4.0. These are different statistics — 0.583 is the metric's own YoY stickiness, while 0.65 is a correlation to next-season points measured *only within an already-high-route population*, so it is conditioned on the very variable it is being compared against. YPRR's predictive power is substantially mediated by role, which the redundancy carve-out covers. Same reasoning applies to TPRR, whose 4for4 model rank sits above where I weighted it: TPRR × route share reconstructs target share, so weighting all three at their apparent standalone importance would triple-count.

**Horizon separation:** weekly favors Vegas/injury/health/matchup/weather (implied total 5.0, practice trajectory 5.9, spread 3.5, in-season vacated targets 3.0) and zeroes all draft-time priors. Season favors role, market, age, draft capital, vacated opportunity, and durability (ADP 8.5, age 4.2, offseason vacated 4.0, win totals 3.4, draft capital 3.0, injury recurrence 2.8) and zeroes spread, bye, short week, Week 18, and opponent injuries.

**Zeroed / structural:** six debunked factors (contract year, revenge & trap games, hot hand, simple SOS, preseason box scores, generalized injury-prone) plus four non-factors kept at 0/0 as audit lenses — positional replacement flatness (VOR layer, PLAN.md §4.2), half-PPR translation (points-conversion step), garbage-time inflation (preprocessing on the highest-weighted factor), and WOPR (redundant composite).

**Honest estimation accounting:** of 78 entries, 17 carry TE-isolated published effect sizes (target share, route share, YPRR, EZ conversion, TE TD stability, TE points-allowed 0.16, TE play-through -8.5%, the 4for4 model ranks, plus the debunked set); the rest are cross-position figures applied by analogy, mechanism arguments, or estimates. Every one of those is flagged. The three biggest unmeasured gaps worth commissioning, all cheap on nflverse data: (a) TE share of in-season vacated targets after a WR injury — currently 3.0% weekly on pure arithmetic; (b) veteran-TE year-1-with-new-team target-share trajectory — 0.6% season on nothing at all; (c) TE points per route against 1-high vs 2-high shells, to resolve the sign problem above.

---

## Cross-position comparison

Category share of weekly weight, side by side:

| Category | QB wk | RB wk | WR wk | TE wk | QB szn | RB szn | WR szn | TE szn |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Opportunity/Volume | 26.8 | 52.3 | 41.6 | 44.0 | 22.5 | 41.1 | 41.1 | 37.3 |
| Efficiency/Talent | 19.7 | 8.9 | 6.9 | 8.6 | 15.3 | 7.3 | 8.6 | 8.9 |
| Team Environment | 10.1 | 9.1 | 9.7 | 13.9 | 14.5 | 9.8 | 10.8 | 13.1 |
| Game Script/Vegas | 12.6 | 11.5 | 9.2 | 8.5 | 9.1 | 4.5 | 5.4 | 4.9 |
| Health/Injury | 6.5 | 6.4 | 9.0 | 7.8 | 6.5 | 9.6 | 5.1 | 4.6 |
| Matchup/Opponent | 6.4 | 4.0 | 8.8 | 3.2 | 0.9 | 0.5 | 1.9 | 0.9 |
| Variance Driver | 4.6 | 1.8 | 1.4 | 6.1 | 3.3 | 2.8 | 0.5 | 3.0 |
| Weather/Venue | 4.7 | 2.0 | 4.4 | 1.8 | 0.7 | 0.8 | 0.6 | 0.8 |
| Coaching/Scheme | 2.8 | 1.8 | 3.4 | 2.1 | 5.9 | 3.6 | 5.5 | 5.9 |
| Market/Consensus | 1.6 | 0.7 | 4.3 | 2.7 | 5.1 | 7.2 | 5.6 | 9.0 |
| Situational/Schedule | 2.0 | 1.2 | 0.9 | 1.1 | 0.9 | 0.0 | 0.0 | 0.3 |
| Age/Career Arc | 2.3 | 0.3 | 0.0 | 0.2 | 15.2 | 12.8 | 13.9 | 11.3 |
| Other | 0.0 | 0.0 | 0.4 | 0.0 | 0.0 | 0.0 | 1.0 | 0.0 |

What the comparison says:

- **Opportunity/volume dominates everywhere, but most at RB (52% weekly) and TE (44%).** QB is the outlier at 27% because efficiency (19.7%) and the game environment carry more of the load — a QB's own passing skill is a much bigger share of his points than a WR's catching skill is of his.
- **Matchup is small at every position and smallest at TE.** Fantasy points allowed to a position has YoY correlation of only 0.16–0.27, with TE at the bottom (0.16). Opponent adjustments belong at 3–9% weekly and near-zero at season.
- **Health carries more weekly weight than matchup at RB, WR, and TE.** The practice-participation trajectory inside a Questionable tag (86% play after full practice, 71% after limited, 42% after DNP) is the single cheapest unexploited edge in the catalog and is free in nflverse.
- **Age/career arc is a season-only model.** 12–15% of season weight at every position, ~0% weekly. It must be two curves at QB (pocket skill plateaus 25–33; rushing collapses ~26% from age 26 to 27).
- **The market prior (ADP/ECR) is 3–8.5% of season weight** and is partly circular with every other factor. Implement it as a decaying shrinkage target for cold-start players, never as an additive term, or the backtest will show you matching consensus by construction.
- **Half-PPR moves weight within categories, not between them.** At RB the target-vs-carry multiple falls from 2.74× (full PPR) to ~2.05× — receiving weight trims modestly, it does not halve. At WR/TE weight shifts from catch-count metrics (target share) toward depth-and-scoring metrics (air-yards share, red-zone share, YPRR). QB is a no-op.

---

## Appendix: factor detail

Mechanism, key numbers (with source where verified), data source, and calibrator notes for every factor.

### QB — detail

<a id="qb-qb-rushing-volume-designed-runs-scrambles"></a>
#### QB rushing volume (designed runs + scrambles)

**Weekly 10.5% · Season 12%** · Opportunity/Volume · stability: high · evidence: strong

- **Mechanism:** Rush attempts and yards convert directly to points and open a 6-pt rushing-TD path unavailable to pocket passers, producing a weekly floor that accrues regardless of passing game state.
- **Key numbers:** Triangulated across three independent sources: rushing attempts/season YoY R²=0.54 and rushing yards/season R²=0.55 — the two highest of any QB stat measured (Sharp Football, 'QB Stats That Matter' 2025); rushing attempts r=0.576 with next-season FPG, highest on the list (Fantasy Points 2026 QB stats); rush attempts/gm r=0.47 and rush yards/gm r=0.47 to next-season FPG (4for4 'Most Predictable Quarterback Stats'). COUNTERWEIGHT: same-week correlation of rushing attempts to QB fantasy points is only 0.15 (Sharp), because most starters barely run.
- **Data:** nflverse PBP rush attempts + NGS scramble tag
- **Notes:** Weekly weight cut from the researcher's 14 because the 0.15 same-week correlation shows this is a floor mechanism concentrated in ~8-10 QBs, not a leaguewide weekly swing. Still #1 weekly on PREDICTABLE variance share since it is the most reliably forecastable component. The unsourced 'rushing PPG r=0.52 vs passing 0.35, 49% more predictive' claim was dropped.

<a id="qb-team-pass-attempts-dropback-volume-per-game"></a>
#### Team pass attempts / dropback volume per game

**Weekly 10% · Season 4.5%** · Opportunity/Volume · stability: high · evidence: strong

- **Mechanism:** Dropbacks mechanically scale passing yards, TDs, completions and INT exposure — the umbrella passing-volume stat.
- **Key numbers:** Self-stability is high: pass attempts/gm YoY r=0.61 all starters, 0.63 young, 0.48 age-30+ (fantasyclassroom 'QB Stability (Per Game)'). Same-week correlation to QB fantasy points r=0.38, passing yards r=0.63 (Sharp Football 2025). BUT cross-QB predictive value at season horizon is ~zero: pass attempts/gm → next-season FPG r = −0.07 and pass yards/gm r = 0.10 (4for4).
- **Data:** nflverse PBP
- **Notes:** CORRECTED. Season weight cut 7→4.5: the merged list used attempts→attempts stability as if it were evidence of point-prediction, but high-attempt QBs are disproportionately bad QBs on trailing teams, so attempts do not separate good from bad season-long QBs. Weekly weight retained — within a week the mechanism is direct.

<a id="qb-vegas-implied-team-total"></a>
#### Vegas implied team total

**Weekly 7% · Season 8%** · Game Script/Vegas · stability: high · evidence: moderate

- **Mechanism:** The most information-dense single pregame number for expected team scoring volume, and therefore for QB TD expectation.
- **Key numbers:** PFF 'Metrics that Matter: Vegas win totals' — QBs on WINNING teams average 18.4 fantasy PPG vs 14.2 on LOSING teams over the prior three seasons. Mechanism corroborated by the factors.md Tier 1 synthesis of implied totals as the densest pregame scoring signal.
- **Data:** nflverse schedules (closing lines); Vegas season win totals at draft time
- **Notes:** CITATION CORRECTED and evidence downgraded strong→moderate. Verified fetch shows the 18.4/14.2 split is winning-vs-losing teams (post-hoc game outcome), NOT high-vs-low Vegas win-total teams as the merged list claimed — so it is partly reverse-causal. Weight held because implied total's pregame value is independently established; only this citation is weaker than stated.

<a id="qb-point-spread-game-script-pass-rate-shift"></a>
#### Point spread / game script (pass-rate shift)

**Weekly 4.6% · Season 0.6%** · Game Script/Vegas · stability: high · evidence: strong

- **Mechanism:** Trailing teams pass far more than leading teams, directly inflating dropback volume while suppressing designed-run and goal-line rushing share.
- **Key numbers:** Pass rate ~66% when trailing vs ~49-50% when leading, ~56% when tied (factors.md Tier 1; 2017 leaguewide split independently confirmed this pass at 66% trailing / 49% leading).
- **Data:** nflverse PBP + Vegas spread
- **Notes:** Cuts both directions for dual-threats: trailing lifts pass volume but strips the designed-run/goal-line package. Season weight near zero because a full schedule averages toward neutral script.

<a id="qb-composite-passing-efficiency-any-a-epa-per-dropback"></a>
#### Composite passing efficiency (ANY/A, EPA per dropback)

**Weekly 4.2% · Season 4%** · Efficiency/Talent · stability: medium · evidence: strong

- **Mechanism:** Yards and expected points generated per dropback — the multiplier that converts volume into yardage points; combines arm talent, scheme, and supporting cast.
- **Key numbers:** Passing yards/gm YoY r=0.61 (fantasyclassroom); passing yards/season YoY R²=0.51 (Sharp). Predictive value to next-season FPG is modest: EPA/dropback r=0.33, yards/attempt r=0.28 (4for4); EPA/dropback YoY R²=0.19 (Sharp). Same-week passing yards → fantasy points r=0.63 (Sharp).
- **Data:** nflverse PBP EPA; Football Outsiders/FTN ANY/A
- **Notes:** MERGED from two separate entries ('Passing yards/attempt, ANY/A' and 'Dropback EPA / composite efficiency') that measured the same construct — carrying both double-counted. Deliberately kept below its raw same-week correlation because CPOE, TD/INT rate and sack rate are separately weighted components of it.

<a id="qb-passing-td-rate-regression-flag"></a>
#### Passing TD rate (regression flag)

**Weekly 3.7% · Season 1.6%** · Efficiency/Talent · stability: low · evidence: strong

- **Mechanism:** TD conversion per dropback is the largest single weekly point source and the least stable QB input — extreme rates predict regression, not persistence.
- **Key numbers:** CORRECTED FIGURES: passing TD/game YoY r=0.34 all starters, 0.25 young, 0.29 age-30+ (fantasyclassroom); passing TD/game YoY R²=0.277 and passing TD/season R²=0.456 (Sharp); pass TD rate → next-season FPG r=0.35 (4for4). Same-week leverage is enormous: total TD r=0.81 and passing TD r=0.62 to weekly QB fantasy points, passing TD% r=0.60 (Sharp).
- **Data:** nflverse PBP
- **Notes:** CORRECTED — the merged list's 'TD rate r=0.21' appears in no source located this pass. Modeled strictly as mean-reversion: TD expectation is reconstructed from RZ trips + implied total + league-mean rate, never extrapolated from the QB's own rate.

<a id="qb-red-zone-pass-attempts-team-rz-trip-rate"></a>
#### Red-zone pass attempts / team RZ trip rate

**Weekly 3.2% · Season 2.6%** · Opportunity/Volume · stability: high · evidence: moderate

- **Mechanism:** More trips inside the 20 mean more passing-TD opportunity regardless of finishing efficiency — the sticky half of the red-zone story.
- **Key numbers:** Team RZ trip rate r≈0.65 with overall offensive quality; RZ conversion/efficiency is noise (YoY ~0.01-0.24) and player RZ conversion ≥40% regressed down 92% of the time (factors.md Tier 2 RZ split, from RotoViz/PFF RZ research).
- **Data:** nflverse PBP (drives reaching the RZ)
- **Notes:** Evidence downgraded strong→moderate: the r≈0.65 is trip rate against offensive quality, not trip-rate-to-next-year-trip-rate stability, so it is a weaker claim than the merged list implied. Keep trips, discard conversion — the primary mechanism for reconstructing TD expectation without extrapolating TD rate.

<a id="qb-opponent-pass-defense-epa-pressure-rate"></a>
#### Opponent pass defense EPA / pressure rate

**Weekly 2.7% · Season 0.3%** · Matchup/Opponent · stability: low · evidence: weak

- **Mechanism:** A stronger opposing pass rush and coverage suppress completion rate and yards/attempt and raise sack and INT risk.
- **Key numbers:** Anchored on the shrinkage evidence rather than a point estimate: defensive fantasy-points-allowed YoY correlation is only 0.16-0.27 and top-5 units repeat just 20-30% (factors.md DEBUNKED table). The merged list's '~0.07 expected PPG per rank spot, offense matters ~3x more' could NOT be located at draftedge or elsewhere this pass.
- **Data:** nflverse PBP defensive splits; PFF grades
- **Notes:** CORRECTED — evidence downgraded moderate→weak; the specific PPG-per-rank figure is unverified and was removed. Must be shrunk hard toward league mean. Season weight near zero: season-long SOS-by-position is explicitly debunked.

<a id="qb-offensive-line-pass-block-quality-pressure-rate-allowed"></a>
#### Offensive line pass-block quality / pressure rate allowed

**Weekly 2.6% · Season 3.2%** · Team Environment · stability: medium · evidence: moderate

- **Mechanism:** Better protection reduces sacks and hits, lengthens time-to-throw, and raises completion rate on the same play call — the team-supplied half of pocket outcomes.
- **Key numbers:** OL quality explains roughly 14% of QB fantasy variance (factors.md Tier 2, ALY-based framing); 4for4 2026 OL-impact work notes OL quality contaminates individual QB attribution substantially. The merged list's 'pressure-to-sack R²≈0.38' could not be verified at that figure this pass.
- **Data:** PFF pass-block grades / pressure rate; nflverse sacks
- **Notes:** Unverified R² removed from the signal. Distinct from the QB's own sack-avoidance skill (separately weighted) and from in-season OL availability (separately weighted). Higher season than weekly weight since unit quality is a durable draft-time environment input.

<a id="qb-cpoe-completion-percentage-over-expected"></a>
#### CPOE (completion percentage over expected)

**Weekly 2.6% · Season 2.2%** · Efficiency/Talent · stability: medium · evidence: moderate

- **Mechanism:** Accuracy skill adjusted for depth, pressure and down-distance; drives completions and yardage independent of scheme volume.
- **Key numbers:** CORRECTED: CPOE self-stability r=0.46 unfiltered, rising to 0.51 when noisy plays are filtered out (SumerSports, 'Cutting Through Noise to Increase CPOE Stability'), and CPOE is documented as stickier year-to-year than EPA. COUNTERWEIGHT: CPOE → next-season fantasy PPG is only r=0.13 (4for4).
- **Data:** NGS / nfelo CPOE via nflverse
- **Notes:** CORRECTED — the merged list's 0.41 replaced with the measured 0.46/0.51. Net weight roughly unchanged: genuinely self-stable, but weakly predictive of fantasy points because QB scoring is volume-dominated. Far more trustworthy than raw completion% (r=0.11 to next-season FPG) or TD rate.

<a id="qb-sack-rate-time-to-throw-pressure-to-sack-qb-pocket-skill"></a>
#### Sack rate / time-to-throw / pressure-to-sack (QB pocket skill)

**Weekly 2.4% · Season 2%** · Efficiency/Talent · stability: high · evidence: strong

- **Mechanism:** QBs who avoid sacks preserve dropback value and convert pressure into throws rather than lost yardage — a genuine, highly repeatable pocket-management trait.
- **Key numbers:** Average time-to-throw YoY r=0.70 and 'Aggressiveness' r=0.63 all starters / 0.72 young — among the stickiest QB advanced stats measured (fantasyclassroom, 2016-2022 NGS set). COUNTERWEIGHT: time-to-throw → next-season FPG only r=0.24, and pressure-to-sack rate → next-season FPG r=−0.17 (4for4).
- **Data:** NGS time-to-throw / aggressiveness; nflverse sacks and pressures
- **Notes:** DELIBERATE MONOTONICITY EXCEPTION: r=0.70 self-stability would argue for a top-5 weight, but the 0.24 conversion to next-season points caps its real value. High stability, modest point-relevance. Distinct from OL pass-block quality (team-supplied protection).

<a id="qb-designed-run-rate-goal-line-rushing-role"></a>
#### Designed-run rate / goal-line rushing role

**Weekly 2.3% · Season 2.8%** · Opportunity/Volume · stability: medium · evidence: estimated

- **Mechanism:** Scheme-called QB runs — RPO keepers, sneaks, zone-read, red-zone packages — are stickier than improvised scrambles because they are playcaller-driven rather than situation-driven.
- **Key numbers:** Scramble rate ranges from ~15.7% down to single digits across starters and is largely scheme-set (Fantasy Points 'Statistically Significant: Scrambles/QB Runs' 2025). The merged list's '21.2% of league rushing TDs came from QBs' could not be verified this pass and is carried as estimated.
- **Data:** nflverse PBP (rush gap / scramble flag), NGS
- **Notes:** Evidence downgraded moderate→estimated for the unverified TD-share figure. OVERLAPS with the QB rushing-volume entry — this isolates the playcaller-set, repeatable component from total volume, which is why it is weighted separately but modestly.

<a id="qb-qb-injury-designation-practice-participation-trajectory-play-probability"></a>
#### QB injury designation / practice-participation trajectory → play probability

**Weekly 2.2% · Season 1%** · Health/Injury · stability: high · evidence: strong

- **Mechanism:** Injury report status converts to a play-probability multiplier; for QB the binary plays-or-doesn't question dominates, and the DNP→Limited→Full trajectory is the leading indicator for that binary.
- **Key numbers:** Questionable plays ~71% of the time, Doubtful ~6%; aggregate play-through penalty for QB ≈ no effect, vs RB −8.7%, WR −9.9%, TE −8.5% (factors.md Tier 1).
- **Data:** nflverse injury reports
- **Notes:** SCOPE CORRECTED per flagged review. The '≈no penalty' figure is an AVERAGE ACROSS ALL DESIGNATIONS AND INJURY TYPES and holds best for minor lower-body designations. It explicitly does NOT license zeroing the throwing-arm/hand/rib/oblique entry or the concussion entry, which price mechanism-specific passing-mechanics penalties. Use this entry for the play/no-play multiplier only; apply type-specific penalties on top.

<a id="qb-int-rate-turnover-worthy-play-to-int-conversion-regression-flag"></a>
#### INT rate / turnover-worthy-play-to-INT conversion (regression flag)

**Weekly 2.1% · Season 1.5%** · Efficiency/Talent · stability: low · evidence: strong

- **Mechanism:** Interceptions carry a −2 penalty and swing single weeks, but roughly a third of INTs are luck (tips, drops-turned-picks) and the rate regresses hard to league mean.
- **Key numbers:** TWP→INT conversion YoY r=0.12 (PFF, 'Hidden story behind QB interceptions'); 96% of extreme-rate QBs regress toward the mean (PFF INT-rate regression work). INT rate → next-season fantasy PPG r=−0.25 and TWP rate r=−0.16 (4for4) — real but weak directional signal.
- **Data:** PFF charting (TWP); nflverse PBP (INT)
- **Notes:** Model as mean reversion, never as extrapolated skill. Weekly weight reflects the −2 swing, not any predictability in the rate itself.

<a id="qb-wind"></a>
#### Wind

**Weekly 1.9% · Season 0.2%** · Weather/Venue · stability: high · evidence: strong

- **Mechanism:** High wind degrades deep-ball accuracy and completion percentage and pushes offenses off the pass — the strongest weather effect on any position.
- **Key numbers:** Completion % falls 60.3% → 54.7% above 20 mph; deep-pass rate −6% relative; ~15 mph is the onset threshold; crosswinds worst (factors.md Tier 2).
- **Data:** Open-Meteo hourly forecast at kickoff + nflverse game weather
- **Notes:** Physics-driven, so direction is highly reliable. Season weight is trace — it only prices a QB's schedule exposure to windy venues, which is already partly in the dome/outdoor entry.

<a id="qb-proe-pass-rate-over-expected"></a>
#### PROE (pass rate over expected)

**Weekly 1.8% · Season 2%** · Team Environment · stability: medium · evidence: strong

- **Mechanism:** Teams that pass more than situationally expected route volume to the QB rather than the RB — the scheme-identity mechanism that turns team plays into QB dropbacks specifically.
- **Key numbers:** ~24-point spread in neutral-script pass probability between extreme teams; early-season PROE R²=0.32 to full-season PROE, rising to 0.47 when pace-adjusted (factors.md Tier 1).
- **Data:** nflverse PBP (xpass model)
- **Notes:** Overlaps with team pass attempts by construction (attempts ≈ plays × pass rate) — weighted separately only because it is the forecastable component, whereas realized attempts are partly game-script noise.

<a id="qb-pace-neutral-script-plays-per-game-qb-hc-continuity"></a>
#### Pace (neutral-script plays per game, QB/HC continuity)

**Weekly 1.7% · Season 2%** · Team Environment · stability: high · evidence: strong

- **Mechanism:** More offensive snaps per game mechanically raises the ceiling on every QB counting stat.
- **Key numbers:** Pace YoY r=0.43-0.47 when QB or HC is retained, dropping to 0.31-0.39 when either changes (factors.md Tier 1; Football Outsiders/FTN).
- **Data:** nflverse PBP (seconds per play)
- **Notes:** Position-agnostic Tier 1 factor; the continuity conditioning matters — 21 of 32 teams changed OC entering 2026, so the lower stability band applies broadly this cycle.

<a id="qb-big-time-throw-rate-vs-turnover-worthy-play-rate-pff-signature-stats"></a>
#### Big-Time-Throw rate vs Turnover-Worthy-Play rate (PFF signature stats)

**Weekly 1.7% · Season 1.8%** · Efficiency/Talent · stability: medium · evidence: strong

- **Mechanism:** PFF's charted BTT (excellent ball location/timing, often tight-window downfield) and TWP (decisions that should have been picked) decompose QB risk-reward more precisely and more stably than raw TD/INT rates.
- **Key numbers:** For QBs with >140 dropbacks in back-to-back seasons, TWP rate YoY r=0.38 and BTT rate YoY r=0.28 (PFF, 'Re-evaluating the NFL passer rating using big-time & turnover-worthy throws') — both more stable than raw graded-throw rates. Predictive value to next-season FPG: BTT r=0.26, TWP r=−0.16 (4for4).
- **Data:** PFF premium subscription (signature stats)
- **Notes:** Sits alongside, not in place of, CPOE and composite efficiency — it is a stabler risk-reward decomposition of the same underlying passing quality, so weights on all three are held modest to avoid triple-counting. Requires a paid feed.

<a id="qb-receiving-corps-quality-separation-talent-of-pass-catchers"></a>
#### Receiving corps quality (separation / talent of pass catchers)

**Weekly 1.6% · Season 3.6%** · Team Environment · stability: medium · evidence: moderate

- **Mechanism:** Elite separators convert marginal throws into completions and YAC, lifting the QB's efficiency ceiling independent of his own arm talent.
- **Key numbers:** Top-24 WRs played with a top-14 AY/A QB 55.8% of the time vs 21.7% with a bottom-tier QB (Fantasy Points 'Statistically Significant: Separation Score' 2025) — a QB↔receiver co-dependence figure, read here in the receiver→QB direction. Corroborating mechanism: catchable-target rate swings (e.g. 78% with a top QB vs 58% without) documented in factors.md Tier 2.
- **Data:** NGS separation; PFF receiving grades
- **Notes:** Much higher season than weekly weight — supporting-cast quality is a durable draft-time environment input and barely moves week to week. Note the cited figure is directionally ambiguous (it measures WRs benefiting from QBs); the reverse-direction inference is the weaker leg.

<a id="qb-weekly-market-consensus-qb-player-props-dfs-salary"></a>
#### Weekly market consensus (QB player props + DFS salary)

**Weekly 1.6% · Season 0.3%** · Market/Consensus · stability: medium · evidence: estimated

- **Mechanism:** Sportsbook passing-yard and passing-TD lines plus DFS pricing aggregate matchup, Vegas total, weather and injury news into a single fast-updating QB-specific number — a consensus cross-check that has already priced everything the model computes separately.
- **Key numbers:** No published correlation to QB half-PPR points located this pass. Mechanism is analogous to the verified season-long ADP finding (preseason ADP predicts as well as the first 4 real games, r=0.599 vs 0.585) applied to an in-week market. Estimated.
- **Data:** The Odds API (weekly player props); DraftKings/FanDuel salary feeds; ESPN unofficial odds endpoint
- **Notes:** MERGED from two separate entries ('DFS salary / weekly market consensus' and 'Weekly QB passing-yards prop lines') — same signal, different feeds. Largely redundant with Vegas total + matchup + injury layers, so its real value is as an independent sanity check and an explanation-UI input, not as new information.

<a id="qb-red-zone-play-calling-tendency-rush-heavy-vs-pass-heavy-at-the-goal-line"></a>
#### Red-zone play-calling tendency (rush-heavy vs pass-heavy at the goal line)

**Weekly 1.4% · Season 1.2%** · Coaching/Scheme · stability: medium · evidence: moderate

- **Mechanism:** Determines whether red-zone TDs accrue to the QB as 6-point rushing TDs or 4-point passing TDs — a 2-point-per-score swing with no analog at any other position.
- **Key numbers:** The QB run game becomes more prevalent at the goal line each season, with specific dual-threats used as designed goal-line scorers by scheme (PFF 'Dual Threats' 2026). No leaguewide coefficient located; magnitude is mechanical (6 vs 4 points) rather than statistical.
- **Data:** nflverse PBP (goal-to-go play calls by team)
- **Notes:** A major reason certain mobile QBs beat passing-only projections. Overlaps the designed-run-rate entry; this one specifically prices the TD-type allocation rather than the carry volume.

<a id="qb-backup-qb-downgrade-risk-own-team"></a>
#### Backup-QB downgrade risk (own team)

**Weekly 1.3% · Season 1.5%** · Health/Injury · stability: low · evidence: weak

- **Mechanism:** When a starter misses time the backup resets the team's passing efficiency and volume ceiling — AND, when a dual-threat starter is replaced by a pocket-only backup, the designed-QB-run package is typically stripped entirely rather than merely downgraded, collapsing the rushing floor to zero.
- **Key numbers:** No consistent league-average point delta published; PFF's backup-QB work shows the downgrade is not automatic (Jake Browning averaged ~19 fantasy PPG replacing Burrow in 2023). Effect must be modeled per-backup.
- **Data:** hand-maintained depth-chart / backup-QB table
- **Notes:** SCOPE EXPANDED per flagged correction — now carries two separate components: (1) passing-efficiency/volume downgrade, backup-specific and sometimes near-zero; (2) rushing-package collapse, which is close to total when a mobile starter is replaced by a pocket passer. Do not apply a fixed league-average downgrade.

<a id="qb-fumble-rate-ball-security-lost-fumbles"></a>
#### Fumble rate / ball-security (lost fumbles)

**Weekly 1.3% · Season 0.5%** · Variance Driver · stability: medium · evidence: estimated

- **Mechanism:** Lost fumbles are −2 points directly; scrambling QBs and QBs who absorb more sacks/hits carry materially higher fumble exposure, a downside that rides alongside the rushing upside no other entry prices.
- **Key numbers:** Fumble RECOVERY is established non-skill (YoY correlation ≈0 to negative, factors.md DEBUNKED), but fumble INCIDENCE is a separate quantity. No QB-specific fumble-incidence YoY stability figure located this pass — estimated from the mechanical link between rushing/sack exposure and fumble opportunities.
- **Data:** nflverse PBP (fumbles, fumbles lost, by rusher and by sack)
- **Notes:** Distinct from INT-rate regression and from sack rate. Project incidence (semi-stable) and apply league-average recovery odds (pure noise) — never project recovery.

<a id="qb-throwing-arm-hand-rib-oblique-injury-specific-performance-penalty"></a>
#### Throwing-arm / hand / rib / oblique injury-specific performance penalty

**Weekly 1.2% · Season 0.5%** · Health/Injury · stability: n/a · evidence: moderate

- **Mechanism:** A mechanistically distinct injury class: throwing-shoulder and UCL, hand/thumb, and core rib/oblique injuries degrade passing velocity, accuracy and rotational torque even when the QB is medically cleared to play.
- **Key numbers:** PMC11480804: NFL QBs with throwing-elbow UCL injuries show high return-to-play rates but measurably inferior post-injury performance among older players. Qualitative and clinical support for oblique/rib altering throwing mechanics; no aggregated fantasy-points effect size located this pass.
- **Data:** nflverse injury reports (designation only — injury TYPE requires hand-parsing or a news layer)
- **Notes:** This is the explicit exception to the aggregate 'QBs who play show ≈no penalty' finding. Apply on top of the play-probability multiplier, not instead of it. Requires an injury-type text layer nflverse does not provide structurally.

<a id="qb-in-season-ol-injury-availability-protection-cascade"></a>
#### In-season OL injury / availability (protection cascade)

**Weekly 1.1% · Season 1.4%** · Health/Injury · stability: n/a · evidence: estimated

- **Mechanism:** Losing starting O-line pieces raises pressure and sack rate mid-season even for a good pocket manager, independent of the unit's preseason grade.
- **Key numbers:** No QB-specific published effect size located this pass; mechanism supported by OL quality explaining ~14% of QB fantasy variance (factors.md Tier 2) and by ALY-based OL work showing R²=0.29-0.46 to rushing outcomes, applied here to pass protection.
- **Data:** nflverse injury reports + depth charts
- **Notes:** The dynamic complement to the static preseason OL-grade entry — flagged by the prior structural audit as a genuine gap. Season weight represents ex-ante OL fragility (age, depth quality), not a known injury.

<a id="qb-game-script-sensitivity-rushing-floor-vs-dropback-only-ceiling"></a>
#### Game-script sensitivity (rushing floor vs dropback-only ceiling)

**Weekly 1.1% · Season 0.8%** · Variance Driver · stability: n/a · evidence: estimated

- **Mechanism:** Rushing QBs carry a higher weekly floor because rush yards accrue regardless of game state, while pure pocket passers are more dependent on positive script and volume to reach their ceiling.
- **Key numbers:** Derived from the verified rushing-stability and game-script splits above (rush attempts YoY R²=0.54; pass rate 49% leading vs 66% trailing). No single published coefficient for the interaction itself.
- **Data:** derived (nflverse PBP script state × QB rush share)
- **Notes:** The mechanism behind the industry 'rushing QB = safer floor' framing. Distinct from raw rushing-volume weight: this prices the variance shape, not the expected points.

<a id="qb-td-dependence-scoring-variance-boom-bust-index"></a>
#### TD-dependence / scoring variance (boom-bust index)

**Weekly 1.1% · Season 0.7%** · Variance Driver · stability: n/a · evidence: estimated

- **Mechanism:** QBs whose output leans on TD rate rather than yardage volume carry more week-to-week variance, since TDs are the highest-leverage and least stable input.
- **Key numbers:** Derived, not independently measured: total TD correlates 0.81 with weekly QB fantasy points while passing TD/game YoY R² is only 0.28 (Sharp Football 2025) — the gap between weekly leverage and season stability IS the variance. Points-from-TDs ÷ total points is the derived index.
- **Data:** derived from nflverse box scores
- **Notes:** Feeds floor/ceiling bands and start-sit confidence, not the median point projection. Explicitly a derived composite of the TD-rate and yardage entries — must not be allowed to shift the point estimate or it double-counts them.

<a id="qb-dual-threat-rushing-decline-cliff-post-27"></a>
#### Dual-threat rushing-decline cliff (post-27)

**Weekly 1% · Season 6%** · Age/Career Arc · stability: high · evidence: strong

- **Mechanism:** The rushing component of dual-threat QB value collapses in the late twenties, years before passing skill declines — the single largest threat to the position's biggest season-long driver.
- **Key numbers:** VERIFIED: QBs entering their age-27 season saw a 25.7% decline in rushing fantasy production versus age-26 (among those debuting since 2000); QB rushing production drops ~66% between ages 22 and 30 and ~80% by age 33 (PFF, 'Do quarterbacks run less as they get older?'). Dual-threat peak age ~26.1 vs a ~4.5-year-later pocket-passer peak.
- **Data:** nflverse rush attempts/yards by QB age
- **Notes:** Evidence upgraded moderate→strong on verification, and this is now the third-largest season weight. It must be applied as a SEPARATE curve from the pocket-passing age plateau — a single QB aging multiplier is actively wrong for exactly the players whose projections have the most at stake.

<a id="qb-garbage-time-inflation-adjustment"></a>
#### Garbage-time inflation adjustment

**Weekly 1% · Season 0.5%** · Game Script/Vegas · stability: n/a · evidence: moderate

- **Mechanism:** Large trailing scripts inflate passing counting stats on low-leverage snaps that do not reflect repeatable opportunity.
- **Key numbers:** Garbage time inflates pass-catcher and passing stats far more than rushing stats (factors.md Tier 2 audit lens); no QB-specific magnitude published, so applied as a share-of-production audit rather than a fixed discount.
- **Data:** nflverse PBP (win probability at snap)
- **Notes:** A correction applied ON TOP of Vegas total and spread, not an independent point driver. Most important as a draft-time audit of prior-year box scores before they feed a season projection.

<a id="qb-qb-rushing-efficiency-ypc-rushing-yards-over-expected-on-qb-carries"></a>
#### QB rushing efficiency (YPC, rushing yards over expected on QB carries)

**Weekly 0.9% · Season 0.6%** · Efficiency/Talent · stability: medium · evidence: estimated

- **Mechanism:** Yards-over-expected on QB carries is a skill layer sitting on top of rushing attempt volume.
- **Key numbers:** No QB-specific RYOE year-over-year figure located this pass. Indirect support: rushing yards/game YoY R²=0.44 vs rushing attempts/season R²=0.54 (Sharp), implying the efficiency residual is less stable than the volume it rides on. Estimated by analogy to documented moderate RB RYOE stability.
- **Data:** nflverse PBP + NGS rushing (RYOE)
- **Notes:** Strictly secondary to attempts and designed-run share. Flagged estimated since no QB-specific published YoY figure exists.

<a id="qb-opponent-run-defense-quality-rushing-qb-floor"></a>
#### Opponent run defense quality (rushing-QB floor)

**Weekly 0.9% · Season 0.25%** · Matchup/Opponent · stability: low · evidence: estimated

- **Mechanism:** A weak run defense specifically raises the floor for a rushing QB's designed-run and scramble yardage and his goal-line TD odds.
- **Key numbers:** No QB-rushing-specific published effect size located this pass; extends the general run-defense matchup logic validated against RB rushing, which is a different rushing profile (interior gap runs vs. perimeter scrambles and read-option keeps).
- **Data:** nflverse PBP rush EPA allowed
- **Notes:** Kept separate from the pass-defense matchup because rushing and passing matchups diverge sharply. Near-zero relevance for pocket passers — should be applied conditionally on the QB's designed-run rate.

<a id="qb-opponent-defensive-injuries-secondary-pass-rush-availability"></a>
#### Opponent defensive injuries (secondary / pass rush availability)

**Weekly 0.9% · Season 0%** · Matchup/Opponent · stability: n/a · evidence: estimated

- **Mechanism:** A missing starting corner or edge rusher measurably softens a defense mid-season, independent of its season-long ranking.
- **Key numbers:** No QB-specific effect size located this pass; rests on the general opponent-injury redistribution logic in the project's adjustment layer. Estimated.
- **Data:** nflverse injury reports and depth charts
- **Notes:** KEPT DISTINCT from opponent takeaway/INT rate per flagged correction — this is an AVAILABILITY signal (who is on the field), that one is a PERFORMANCE-RATE signal. Different data sources, different stability profiles, must not be collapsed into one weight. Zero season weight: unknowable at draft time.

<a id="qb-ol-run-block-quality-for-qb-scramble-and-designed-run-lanes"></a>
#### OL run-block quality for QB scramble and designed-run lanes

**Weekly 0.8% · Season 1.2%** · Team Environment · stability: medium · evidence: estimated

- **Mechanism:** Run-blocking on RPO mesh points, zone-read lanes and scramble windows sets the ceiling on a dual-threat QB's rushing efficiency, independent of pass-protection quality.
- **Key numbers:** No QB-rushing-specific ALY-style study located this pass. factors.md documents OL quality explaining ~14% of QB fantasy variance under a pass-protection framing; the run-block-for-QB-legs channel is a distinct, unmeasured sub-component. Estimated.
- **Data:** nflverse PBP (rush EPA/success on QB carries by team); FTN blocking-scheme charting
- **Notes:** Matters specifically for dual-threat projections and is near-irrelevant for pocket passers — apply conditionally on designed-run rate. Distinct from the pass-block entry.

<a id="qb-performance-under-pressure-splits-completion-epa-pressured-vs-clean-pocket"></a>
#### Performance-under-pressure splits (completion% / EPA pressured vs clean pocket)

**Weekly 0.8% · Season 0.8%** · Efficiency/Talent · stability: medium · evidence: estimated

- **Mechanism:** Distinct from sack avoidance (whether pressure becomes a sack): some QBs hold accuracy and decision quality when hurried, others collapse even after controlling for sack rate.
- **Key numbers:** The leaguewide pressured-vs-clean completion% gap is large (commonly cited at 20+ points), but no player-level year-over-year persistence figure for the GAP itself was located this pass — estimated.
- **Data:** PFF premium (pressure splits); nflverse pressure/time-to-throw fields as a free proxy
- **Notes:** Complements rather than duplicates the sack-rate/time-to-throw entry. Held low because the persistence of the split — the thing that would make it projectable — is unmeasured.

<a id="qb-cold-temperature"></a>
#### Cold temperature

**Weekly 0.8% · Season 0.15%** · Weather/Venue · stability: medium · evidence: moderate

- **Mechanism:** Cold impairs grip and ball-handling, suppressing completion rate and raising fumble risk — but the effect is acclimation-driven, not absolute.
- **Key numbers:** Dome teams 0-8 on the road at ≤20°F and 3-23 at ≤30°F; home cold-weather-team rushing efficiency actually rises below freezing (4.05 → 4.30+ YPC) (factors.md Tier 2).
- **Data:** Open-Meteo + nflverse game weather
- **Notes:** Must be applied as the dome-team-on-cold-road interaction, not as a main effect on temperature — the naive main effect is confounded and the 'cold-weather toughness' framing is separately debunked.

<a id="qb-opponent-blitz-rate-man-vs-zone-tendency"></a>
#### Opponent blitz rate / man vs zone tendency

**Weekly 0.8% · Season 0.1%** · Matchup/Opponent · stability: medium · evidence: estimated

- **Mechanism:** High-blitz, man-heavy defenses raise sack and INT risk specifically for QBs who struggle against pressure or in tight windows.
- **Key numbers:** No aggregate published effect size located this pass; rests qualitatively on the pressure-rate/CPOE interaction literature (nfelo over-expected metrics explainer). Estimated.
- **Data:** PFF blitz and coverage charting
- **Notes:** A style-matchup nudge layered on the aggregate pass-defense number; only meaningful in interaction with the QB's own under-pressure splits. Requires paid charting.

<a id="qb-in-season-wr-te-corps-injury-and-availability-cascade"></a>
#### In-season WR/TE corps injury and availability cascade

**Weekly 0.7% · Season 0.4%** · Team Environment · stability: medium · evidence: estimated

- **Mechanism:** Losing a WR1 or TE1 mid-season shrinks the QB's effective separation and catch-radius pool, lowering completion rate, YAC and red-zone conversion with scheme, OL and QB skill unchanged.
- **Key numbers:** No QB-specific effect size located this pass. Mirrors the project's own catchable-target-rate re-rate finding (78% vs 58% CTR swings with QB quality) applied in the reverse direction. Estimated.
- **Data:** nflverse injuries + depth charts
- **Notes:** The dynamic in-season complement to the static receiving-corps-quality entry — exactly the same static-vs-dynamic split the catalog already draws between OL grade and OL availability.

<a id="qb-dome-vs-outdoor"></a>
#### Dome vs outdoor

**Weekly 0.7% · Season 0.25%** · Weather/Venue · stability: high · evidence: strong

- **Mechanism:** Controlled conditions raise completion percentage and scoring across the board by removing wind, precipitation and temperature effects at once.
- **Key numbers:** +9% combined scoring indoors (46.2 vs 42.4 points/game); completion percentage 61.1% indoors vs 58.8% outdoors (factors.md Tier 1).
- **Data:** nflverse roof/surface field
- **Notes:** Season weight small because home roof type is already priced into ADP and team-quality priors — double-counting risk. Primarily a weekly input, and partly an umbrella over the separately-weighted wind/rain/snow entries, so its own weight is held down.

<a id="qb-opponent-qb-contain-spy-scheme-vs-mobile-qbs"></a>
#### Opponent QB-contain / spy scheme vs mobile QBs

**Weekly 0.7% · Season 0.2%** · Matchup/Opponent · stability: low · evidence: estimated

- **Mechanism:** Defenses that deploy a dedicated spy or a disciplined contain rush suppress scramble and designed-run yardage independent of their general run-defense quality.
- **Key numbers:** No direct effect-size study located this pass. The mechanism is scheme-discipline-based and is not captured by the opponent-run-defense entry, whose evidence base is RB-facing gap defense. Estimated, low confidence.
- **Data:** FTN charting (defender assignment / spy usage) where available; otherwise hand-tagged from film and coverage reporting
- **Notes:** Narrow but real for the ~8-10 designed dual-threats; near-zero relevance for pocket passers. Should be applied conditionally on designed-run rate, like the other rushing-matchup entries.

<a id="qb-experience-career-starts-stability"></a>
#### Experience / career-starts stability

**Weekly 0.6% · Season 1.3%** · Age/Career Arc · stability: medium · evidence: moderate

- **Mechanism:** Career start count narrows the range of plausible outcomes, but counterintuitively in the measured data younger QBs are MORE year-to-year predictable than older ones.
- **Key numbers:** Year-over-year per-game fantasy PPG stability: young QBs (under 30) r=0.55 vs age-30+ r=0.27, all starters r=0.45 (fantasyclassroom 'QB Stability (Per Game)'). Corroborated across component stats: pass attempts 0.63 young vs 0.48 old; completions 0.68 vs 0.51.
- **Data:** nflverse career game logs
- **Notes:** Cuts hard against the naive 'veteran = safer projection' prior — the data says the opposite, likely because aging veterans are the ones whose roles and skills are actively changing. Use to set projection interval width by age band.

<a id="qb-home-away-split"></a>
#### Home / away split

**Weekly 0.6% · Season 0.6%** · Situational/Schedule · stability: low · evidence: moderate

- **Mechanism:** Home field (crowd noise disrupting opponent communication, no travel, familiar surface and sightlines) modestly lifts QB output.
- **Key numbers:** QB +7% at home vs away — one of the largest positional home/away splits measured, versus WR ≈0 and K +0.2-0.5 (factors.md Tier 2).
- **Data:** nflverse schedules
- **Notes:** QB is unusually home/away-sensitive relative to other positions, which is why this is not zeroed. Still a tiebreaker-grade adjustment; stability flagged low because home-field advantage has been shrinking leaguewide.

<a id="qb-blowout-benching-early-exit-risk-winning-big"></a>
#### Blowout benching / early-exit risk (winning big)

**Weekly 0.6% · Season 0.1%** · Variance Driver · stability: low · evidence: moderate

- **Mechanism:** Starters up by large margins are pulled in the fourth quarter or have passing volume shut down for clock-killing runs, capping the ceiling even when the pregame Vegas signal looked favorable — the mirror image of trailing-script inflation.
- **Key numbers:** In a sampled set of 484 QB games meeting blowout parameters, ~73% finished under 18 fantasy points (average ~197 pass yards, 0.5 TD) (Fantasy Footballers). Directionally well-documented in industry writing; methodology not independently verified this pass.
- **Data:** derived from live win-probability trajectory + snap counts by quarter (must be built from PBP; no off-the-shelf table)
- **Notes:** Prices the winning-big downside that the spread/game-script entry captures only in the trailing direction. Matters most for QBs on heavy favorites, precisely where implied-total-driven projections are most optimistic.

<a id="qb-qb-job-snap-security-risk-performance-benching-competition-gadget-packages"></a>
#### QB job / snap security risk (performance benching, competition, gadget packages)

**Weekly 0.5% · Season 1.2%** · Variance Driver · stability: low · evidence: estimated

- **Mechanism:** A healthy starter can lose the job outright to a backup or a highly-drafted rookie for performance reasons, or cede short-yardage and goal-line packages to a specialist — either zeroes or top-slices remaining value on an unpredictable timeline.
- **Key numbers:** No aggregated base-rate or hit-rate study located this pass; recurring annual event documented case-by-case (performance benchings of recent high-draft-capital starters; Taysom Hill-style specialist packages). Estimated.
- **Data:** hand-tracked depth-chart and news events; no structured dataset
- **Notes:** MERGED from 'Two-QB / committee timeshare risk' and 'In-season performance-based benching' — both price the same outcome (losing snaps while healthy) and separating them invited double-counting. Explicitly distinct from the backup-QB entry, which prices what happens when the STARTER gets hurt.

<a id="qb-week-18-rest-risk"></a>
#### Week 18 rest risk

**Weekly 0.5% · Season 0.3%** · Situational/Schedule · stability: n/a · evidence: weak

- **Mechanism:** Once playoff seeding is locked, starters are sometimes rested for Week 18, producing a binary zero-versus-full-game outcome that is unpredictable in advance.
- **Key numbers:** Real every year, direction certain, magnitude unpredictable — handled via manual and news tracking rather than modeling (factors.md Tier 3). No published base rate located.
- **Data:** playoff-seeding scenarios + beat-reporter news
- **Notes:** Irrelevant for 17 of 18 weeks but near-decisive in the one week most fantasy championships are already over. Season weight reflects the ex-ante uncertainty added to teams likely to clinch early.

<a id="qb-snow"></a>
#### Snow

**Weekly 0.5% · Season 0%** · Weather/Venue · stability: medium · evidence: strong

- **Mechanism:** Snow degrades grip, footing and visibility simultaneously and pushes offenses run-heavy and conservative — the genuinely large precipitation effect.
- **Key numbers:** Snow drops field-goal percentage 7-12 points and total scoring roughly 25% when it occurs, but games are rare (factors.md Tier 2).
- **Data:** Open-Meteo hourly forecast at kickoff + nflverse weather field
- **Notes:** SPLIT from the merged 'Precipitation (rain/snow)' entry per flagged correction. Effect size is strong but the base rate is very low, so expected weekly contribution is small — do NOT let the large conditional magnitude inflate the unconditional weight. Rain is weighted separately and far lower.

<a id="qb-oc-play-caller-change-uncertainty-widener"></a>
#### OC / play-caller change (uncertainty widener)

**Weekly 0.4% · Season 1.5%** · Coaching/Scheme · stability: n/a · evidence: weak

- **Mechanism:** A new play-caller changes scheme, tempo and QB usage with no reliable predictive model, so it should widen projection intervals rather than shift the point estimate.
- **Key numbers:** No rigorous quantitative study exists — an explicitly acknowledged industry gap; 21 of 32 teams changed OC entering 2026 (factors.md Tier 3). Corroborating: pace stability drops from r=0.43-0.47 to 0.31-0.39 when the HC or QB changes.
- **Data:** hand-maintained coach / play-caller YAML
- **Notes:** Should widen variance, NOT move the mean — the directional half of the coaching story is carried by the separate QB-development-track-record entry. High season weight relative to its weak evidence because two thirds of the league changed play-callers this cycle, making it near-universally applicable.

<a id="qb-scheme-fit-mobile-rpo-system-vs-pro-style"></a>
#### Scheme fit (mobile/RPO system vs pro-style)

**Weekly 0.4% · Season 1.5%** · Coaching/Scheme · stability: low · evidence: weak

- **Mechanism:** A QB's skill set interacts with the incoming play-caller's system — a mobile QB dropped into a rigid pro-style offense loses designed-run volume even under an objectively good OC.
- **Key numbers:** No effect size published. McDaniels counterexample as the caution: top-8 offense with the Belichick/Brady infrastructure, 22nd-place average elsewhere — scheme does not travel with the coach alone (factors.md Tier 3).
- **Data:** hand-maintained coach / scheme table
- **Notes:** A QB-specific refinement of the general scheme-stickiness finding. Matters almost entirely through its interaction with designed-run rate, which is where the largest season-long value is at stake — hence season weight well above its weak evidence base.

<a id="qb-injury-type-recurrence-lower-body-threatening-the-rushing-role"></a>
#### Injury-type recurrence (lower-body, threatening the rushing role)

**Weekly 0.4% · Season 1.4%** · Health/Injury · stability: high · evidence: strong

- **Mechanism:** ACL, hamstring and other lower-body injuries specifically threaten the rushing-volume component that dual-threat QBs depend on for their fantasy ceiling — the highest-value thing a QB injury can take away.
- **Key numbers:** ACL re-injury 25% vs 9% in controls; hamstring recurrence 38.4% overall and 11.9% within the same season (factors.md Tier 2, sports-medicine literature). Generalized 'injury-prone' labeling is NOT supported — only same-body-part recurrence predicts.
- **Data:** hand-maintained injury-history log
- **Notes:** The QB-specific reading of a validated position-agnostic factor: lower-body recurrence attacks precisely the rushing floor that carries the largest season weight in this catalog. Apply only to same-body-part history, never as a general fragility discount.

<a id="qb-play-action-rate-team-scheme"></a>
#### Play-action rate (team scheme)

**Weekly 0.4% · Season 0.9%** · Team Environment · stability: medium · evidence: strong

- **Mechanism:** Play-action dropbacks generate materially better EPA and yards per attempt than standard dropbacks leaguewide, so a PA-heavy scheme lifts the same QB's efficiency.
- **Key numbers:** EPA/play −0.031 on non-PA dropbacks vs +0.054 on PA; yards per attempt 6.72 vs 7.76 (PFF 2026, 'How play action, motion, and RPO rates define fantasy value').
- **Data:** nflverse PBP (play_action flag)
- **Notes:** Strong evidence but deliberately small weight: the EPA gain is already embedded in the composite passing-efficiency entry when computed from realized play. Weighted here only for the forward-looking scheme-change case (new OC raises or cuts PA rate).

<a id="qb-rookie-first-year-starter-within-season-improvement-curve"></a>
#### Rookie / first-year-starter within-season improvement curve

**Weekly 0.4% · Season 0.9%** · Age/Career Arc · stability: low · evidence: estimated

- **Mechanism:** First-year starters often improve materially WITHIN their debut season as reps and game speed accumulate — a weekly-relevant trajectory, distinct from the season-over-season sophomore jump.
- **Key numbers:** Only anecdotal and case-study support located this pass; no controlled first-half-vs-second-half study isolating first-year-starter in-season improvement was found. Estimated, low-moderate confidence. Related verified context: only 3 rookie QBs have finished top-12 per-game in the last 10 years.
- **Data:** nflverse weekly stats split by career start count
- **Notes:** Weekly-relevant in a way the sophomore-jump entry is not — a rookie's Week 15 projection should not use his Week 2 priors unweighted. Held low because the effect is unmeasured and confounded with opponent quality and scheme simplification.

<a id="qb-coach-4th-down-aggressiveness"></a>
#### Coach 4th-down aggressiveness

**Weekly 0.4% · Season 0.5%** · Coaching/Scheme · stability: medium · evidence: moderate

- **Mechanism:** Aggressive coaches sustain more drives and generate more offensive snaps and red-zone trips by going for it rather than punting or kicking.
- **Key numbers:** r=0.30 to offensive EPA/play; a sticky coach trait year-over-year (factors.md Tier 2).
- **Data:** nflverse PBP (4th-down decisions); hand-maintained coach table
- **Notes:** A second-order volume multiplier layered on pace and PROE, both of which already partly absorb it — weighted low to avoid triple-counting the same snaps.

<a id="qb-no-huddle-two-minute-snap-rate"></a>
#### No-huddle / two-minute snap rate

**Weekly 0.4% · Season 0.3%** · Opportunity/Volume · stability: medium · evidence: estimated

- **Mechanism:** Up-tempo and no-huddle sequences add bonus plays beyond neutral-script pace, concentrated at the ends of halves.
- **Key numbers:** No QB-specific year-over-year figure published; estimated from general tempo literature showing up-tempo teams run more snaps per drive. The related verified anchor is pace stability at r=0.43-0.47 with QB/HC continuity.
- **Data:** nflverse PBP (no-huddle flag)
- **Notes:** Mostly absorbed by the pace entry; retained separately only for the trailing-game no-huddle-burst sub-signal, which pace measured in neutral script misses by construction.

<a id="qb-red-zone-specific-passing-efficiency-rz-passer-rating-rz-dropback-epa"></a>
#### Red-zone-specific passing efficiency (RZ passer rating / RZ dropback EPA)

**Weekly 0.4% · Season 0.3%** · Efficiency/Talent · stability: medium · evidence: moderate

- **Mechanism:** The compressed field inside the 20 shrinks throwing windows, devaluing arm strength and aDOT relative to placement and anticipation — the skill layer that converts red-zone trips into passing TDs rather than field goals.
- **Key numbers:** FantasyData and Sharp Football chart 30+ point spreads in red-zone passer rating across starters, but no clean year-over-year stability coefficient was located this pass. The nearest prior is team-level RZ conversion, which is noisy (YoY r ≈ 0.01-0.24, factors.md Tier 2).
- **Data:** nflverse PBP filtered to red-zone / inside-10 dropbacks
- **Notes:** Held low on purpose: the best available prior for RZ conversion stability is 0.01-0.24, i.e. mostly noise, and the RZ-trip-rate entry already carries the sticky half of the red-zone story. Treat individual RZ efficiency as a mild regression flag, not a skill.

<a id="qb-adot-deep-ball-rate"></a>
#### aDOT / deep-ball rate

**Weekly 0.4% · Season 0.3%** · Efficiency/Talent · stability: medium · evidence: moderate

- **Mechanism:** Average depth of target sets the boom/bust shape of a passing offense — higher aDOT means more variance per attempt, not necessarily more points.
- **Key numbers:** aDOT → next-season fantasy PPG r=0.19, near the bottom of the measured list (4for4). Consensus framing treats it as a volatility rather than central-tendency driver (Sharp Football / PFF QB-stats work).
- **Data:** NGS air yards
- **Notes:** Evidence upgraded from estimated now that a published figure (r=0.19) is attached, but the figure is low, so the weight stays low. Feeds the TD-dependence/variance band, not the median projection.

<a id="qb-opponent-defensive-takeaway-int-generation-rate"></a>
#### Opponent defensive takeaway / INT-generation rate

**Weekly 0.4% · Season 0.1%** · Matchup/Opponent · stability: low · evidence: weak

- **Mechanism:** Some defenses generate interceptions (tips, forced throws, ball-hawking safeties) above the rate their general pass-defense EPA implies, raising INT risk for that week's opposing QB.
- **Key numbers:** Prior-season team defensive INT rate explains only ~7% of next-season variance and is confounded by the quality of opposing QBs faced (thepowerrank analysis) — real directionally, weak and noisy, requiring heavy shrinkage toward league mean.
- **Data:** nflverse team-defense PBP (INT rate, tipped-pass rate)
- **Notes:** KEPT DISTINCT from opponent defensive injuries per flagged correction — that is an availability signal, this is a performance-rate signal, with different sources and stability. The 7% explained variance justifies the low weight.

<a id="qb-qb-age-plateau-pocket-passing-skill-holds-25-33"></a>
#### QB age plateau (pocket-passing skill, holds 25-33)

**Weekly 0.3% · Season 3%** · Age/Career Arc · stability: high · evidence: strong

- **Mechanism:** Pure passing skill — accuracy, anticipation, decision-making — is durable through the early thirties, with none of the RB or WR aging cliffs.
- **Key numbers:** QB passing-skill plateau runs 25-33; pocket-passer peak age is roughly 4.5 years later than dual-threat peak (~26.1), and over a third of pocket-passer seasons occur at age 33+ (factors.md Tier 1; PFF QB aging work; Footballguys dynasty QB aging).
- **Data:** nflverse rosters + season stats by age
- **Notes:** MUST be modeled as a separate curve from the dual-threat rushing cliff — applying one QB aging multiplier is explicitly documented as misleading and would systematically misprice the highest-variance players at the position. Near-zero weekly weight: age does not move week to week.

<a id="qb-personnel-shotgun-spread-tendency"></a>
#### Personnel / shotgun-spread tendency

**Weekly 0.3% · Season 0.8%** · Team Environment · stability: medium · evidence: estimated

- **Mechanism:** Shotgun and spread-heavy offenses generate more dropbacks and more RPO and scramble opportunity than under-center run-heavy systems.
- **Key numbers:** No QB-specific stability figure found this pass; extends the validated personnel-groupings finding (leaguewide 11-personnel usage drifting 63% → 58% from 2023-25, concentrating targets and shifting dropback structure) by analogy (factors.md Tier 2).
- **Data:** nflverse PBP (formation); FTN charting
- **Notes:** An estimated extension of a factor validated for pass-catchers rather than for QBs. Substantially absorbed by PROE and pace; weighted low to avoid triple-counting the same dropbacks.

<a id="qb-team-possessions-drives-per-game-own-defense-special-teams-opponent-tempo"></a>
#### Team possessions / drives per game (own defense & special teams, opponent tempo)

**Weekly 0.3% · Season 0.2%** · Opportunity/Volume · stability: medium · evidence: estimated

- **Mechanism:** Independent of plays-per-drive pace, a defense and special-teams unit that forces three-and-outs, wins field position and generates takeaways hands its own offense more total drives — while a run-heavy clock-controlling opponent slightly reduces them.
- **Key numbers:** No QB-fantasy-specific effect size located this pass for either channel. Analysts note the opponent-ball-control effect is smaller than the popular narrative, since teams alternate possessions regardless of drive length unless a defense sustains stops for a full game. Estimated.
- **Data:** nflverse PBP (drives per game, plays per drive — directly computable, no new source needed)
- **Notes:** MERGED from 'Team possessions/drives per game' and 'Opponent ball-control / time-of-possession tendency' — both price how many drives the QB gets, from opposite sides, and separating them risked double-counting one possession-count adjustment. Heavily shrunk.

<a id="qb-third-down-money-down-passer-efficiency"></a>
#### Third-down / money-down passer efficiency

**Weekly 0.3% · Season 0.1%** · Efficiency/Talent · stability: low · evidence: moderate

- **Mechanism:** Efficiency specifically on third and fourth down extends drives, feeding every upstream volume factor — a compressed-decision skill layer distinct from general dropback EPA and from red-zone efficiency.
- **Key numbers:** Sharp Football Analysis: third-down success predicts win probability more strongly than early-down performance, but is explicitly flagged as something teams and QBs do NOT sustain year over year — real in-week descriptive signal, weak draft-time stickiness.
- **Data:** nflverse PBP (third/fourth-down dropback EPA and passer-rating splits, computable)
- **Notes:** The source's own conclusion — that it does not persist — is why this is weighted near the floor despite being a real descriptive effect. Season weight near zero for exactly that reason.

<a id="qb-bye-week-short-week-thursday-rest"></a>
#### Bye week / short week (Thursday) rest

**Weekly 0.3% · Season 0%** · Situational/Schedule · stability: low · evidence: moderate

- **Mechanism:** A bye is a missed week rather than a performance modifier; short weeks theoretically cut preparation time and could suppress output.
- **Key numbers:** The post-bye edge mostly died with the 2011 CBA (2024 study finds no significant effect); Thursday short-week effects are small and possibly eroding (factors.md Tier 3).
- **Data:** nflverse schedules
- **Notes:** The bye component itself carries zero weight — it is a scheduling gap handled by roster mechanics, not a point modifier. All residual weight sits on the Thursday short-week component.

<a id="qb-primetime-travel-circadian"></a>
#### Primetime / travel-circadian

**Weekly 0.3% · Season 0%** · Situational/Schedule · stability: low · evidence: weak

- **Mechanism:** Night games and long west-to-east travel could affect performance through rest and circadian disruption.
- **Key numbers:** West Coast teams beat the spread in 66% of night games against East Coast opponents (5.26 points ATS, 1970-2011, published in SLEEP) — a TEAM-LEVEL point-spread result, not an individual QB fantasy-points effect. The popular '1pm ET West Coast penalty' is NOT validated (factors.md Tier 3).
- **Data:** nflverse schedules (kickoff time, travel distance)
- **Notes:** Held very low because the only solid published finding is about point spreads, not individual QB production, and the dataset ends in 2011 — a different scheduling and travel era.

<a id="qb-rain"></a>
#### Rain

**Weekly 0.3% · Season 0%** · Weather/Venue · stability: medium · evidence: strong

- **Mechanism:** Wet conditions slightly degrade grip and footing and tilt playcalling marginally run-heavy.
- **Key numbers:** Rain is overrated: under 5% effect on most metrics; moderate rain drops pass rate about 4.7% with a corresponding +7.7% shift in RB targets (factors.md Tier 2).
- **Data:** Open-Meteo hourly forecast at kickoff + nflverse weather field
- **Notes:** SPLIT from the merged 'Precipitation (rain/snow)' entry per flagged correction, precisely so rain is not weighted at snow's magnitude. Near-noise for QB — the evidence is strong that the effect is SMALL, which is why the weight is small despite strong evidence quality.

<a id="qb-coach-oc-qb-development-track-record-qb-whisperer-effect"></a>
#### Coach / OC QB-development track record ('QB whisperer' effect)

**Weekly 0.2% · Season 1.2%** · Coaching/Scheme · stability: low · evidence: weak

- **Mechanism:** Some play-callers have repeatedly elevated multiple different starters through teaching and system fit — a DIRECTIONAL prior, unlike the generic OC-change entry which treats every change as pure uncertainty.
- **Key numbers:** No rigorous cross-coach regression located this pass — the same acknowledged industry gap as the OC-change entry. Qualitative support only (Shanahan-tree, McVay, Stefanski histories), with the McDaniels counterexample in factors.md Tier 3 as the standing caution. Estimated, low confidence.
- **Data:** hand-maintained coach table + subjective track-record tagging
- **Notes:** The directional counterpart to the OC-change uncertainty widener: this one may shift the point estimate for specific known-good play-callers, that one only widens intervals. Kept modest and explicitly subjective — this is the entry most exposed to hindsight bias in the whole catalog.

<a id="qb-offensive-line-continuity-starts-together-pass-block-chemistry"></a>
#### Offensive-line continuity / starts-together (pass-block chemistry)

**Weekly 0.2% · Season 0.4%** · Team Environment · stability: medium · evidence: weak

- **Mechanism:** A starting five with more snaps together handles stunts and protection calls better, raising pass-block win rate above what individual talent grades predict — a healthy line with a new free-agent starter still underperforms its grade early.
- **Key numbers:** 2025-26 analytics commentary (Sharp Football, Fantasy Points OL rankings) attributes pass-protection swings explicitly to starting-five continuity versus turnover, but no isolated regression coefficient was located this pass.
- **Data:** nflverse snap counts (derive a starts-together streak); PFF/Sharp OL continuity commentary
- **Notes:** Distinct from both the static OL pass-block grade (talent) and the in-season OL injury entry (health) — this is reps together. Computable for free from snap counts, which makes it cheap to ablate.

<a id="qb-concussion-head-injury-history-and-hia-protocol-return"></a>
#### Concussion / head-injury history and HIA protocol return

**Weekly 0.2% · Season 0.15%** · Health/Injury · stability: low · evidence: estimated

- **Mechanism:** A distinct injury class: concussion availability is gated by a mandated NFL protocol (binary clearance, not a probability multiplier like other designations), and the literature associates recent return-to-play with elevated short-term musculoskeletal re-injury risk and reaction-time deficits.
- **Key numbers:** No fantasy-points-specific effect size located this pass. General sports-medicine literature (the same body cited for injury-type recurrence in factors.md) documents elevated re-injury risk in the weeks following return from concussion; extension to NFL QB fantasy performance is estimated.
- **Data:** nflverse injury reports (concussion is explicitly tagged) + NFL protocol status
- **Notes:** Its practical value is that the protocol makes availability BINARY and news-gated rather than probabilistic, so the standard Questionable-71% multiplier is the wrong model here. Second explicit exception (with throwing-arm injuries) to the aggregate 'no QB play-through penalty' finding.

<a id="qb-heat-humidity"></a>
#### Heat / humidity

**Weekly 0.2% · Season 0%** · Weather/Venue · stability: low · evidence: estimated

- **Mechanism:** High heat and humidity plausibly degrade grip and late-game conditioning through dehydration and cramping — a distinct mechanism from cold-weather grip effects.
- **Key numbers:** No published QB-specific effect size located this pass; physiologically plausible but unquantified for passing efficiency. Estimated, weak.
- **Data:** Open-Meteo (temperature and humidity at kickoff)
- **Notes:** Low-confidence inclusion for category completeness. Explicit ablation candidate — likely to be dropped after backtest since nothing supports it quantitatively.

<a id="qb-international-neutral-site-games-london-germany-brazil-madrid"></a>
#### International / neutral-site games (London, Germany, Brazil, Madrid)

**Weekly 0.2% · Season 0%** · Situational/Schedule · stability: low · evidence: estimated

- **Mechanism:** Trans-Atlantic travel, an altered preparation schedule and a genuinely neutral crowd differ from domestic coast-to-coast travel and night games.
- **Key numbers:** No QB-specific performance study located this pass. The international slate has expanded to multiple games per season by 2026, but sample size per team and per QB remains very small. Estimated, weak.
- **Data:** nflverse schedules (game location flag)
- **Notes:** Best used as a manual review flag rather than a modeled weight — the per-QB sample will not support estimation for years. Distinct from the primetime/travel entry, which covers domestic travel only.

<a id="qb-qb-personal-play-action-efficiency-differential"></a>
#### QB personal play-action efficiency differential

**Weekly 0.15% · Season 0.15%** · Efficiency/Talent · stability: medium · evidence: weak

- **Mechanism:** Beyond the team's play-action RATE, individual QBs show durably different EPA and completion gains off play-action — a personal fake-selling and eye-manipulation skill separate from arm talent or aDOT.
- **Key numbers:** Sports Info Solutions research finds QBs gain EPA off play-action leaguewide, and that the SIZE of the individual gain varies beyond what scheme rate explains; no aggregated year-over-year correlation for the differential itself was located this pass.
- **Data:** nflverse PBP (play-action flag × EPA/CPOE split per QB, computable); SIS/PFF charting
- **Notes:** Distinct from the team play-action-rate entry (scheme) — this is the player residual. Weighted at the floor because the persistence of that residual is exactly what has not been measured, and small-sample PA splits are extremely noisy.

<a id="qb-altitude"></a>
#### Altitude

**Weekly 0.15% · Season 0.1%** · Weather/Venue · stability: low · evidence: weak

- **Mechanism:** Thinner air at elevation marginally extends ball flight, most measurably on kicks and secondarily on deep throws.
- **Key numbers:** Denver ≈ +5 yards of kicking range (physics-based, stable); Mexico City fatigue effects plausible but under-studied (factors.md Tier 3).
- **Data:** hand-built 32-row stadium table (lat/long/elevation)
- **Notes:** SPLIT from the merged 'Altitude & playing surface' entry per flagged correction — the turf/grass half was an injury-risk factor misfiled under Weather/Venue and now lives under Health/Injury. Almost entirely a kicker factor; retained for QB completeness at near-zero weight.

<a id="qb-two-point-conversion-attempt-involvement-pass-or-rush"></a>
#### Two-point conversion attempt involvement (pass or rush)

**Weekly 0.1% · Season 0.1%** · Opportunity/Volume · stability: low · evidence: estimated

- **Mechanism:** A successful two-point conversion awards the passer or rushing QB 2 points — a scoring path entirely separate from the passing-TD, rushing-TD, yardage and turnover mechanics every other entry covers.
- **Key numbers:** Leaguewide baseline: teams attempt roughly 1-2 two-point conversions per season at ~48-50% success; no published QB-fantasy-attributable effect size located this pass. Estimated.
- **Data:** nflverse PBP (two_point_attempt / two_point_conv_result fields)
- **Notes:** Small but a genuine scoring-mechanism gap — the catalog prices passing TDs, rushing TDs, INTs and fumbles but had nothing for the 2-point path. Correlated with 4th-down aggressiveness (same coach trait) and with trailing game script.

<a id="qb-referee-crew-tendencies-roughing-the-passer-defensive-holding-dpi-rates"></a>
#### Referee crew tendencies (roughing the passer, defensive holding, DPI rates)

**Weekly 0.1% · Season 0%** · Situational/Schedule · stability: medium · evidence: weak

- **Mechanism:** Officiating crews call roughing the passer, defensive holding/illegal contact and DPI at meaningfully different rates; those calls are automatic first downs that extend drives and add free dropbacks and red-zone trips.
- **Key numbers:** Crew-level penalty-rate variance is documented in general NFL officiating analysis (roughing-the-passer calls per game varying more than 2x across crews in some seasons), but no QB-fantasy-points translation was located this pass and the effect is small relative to other situational factors.
- **Data:** hand-maintained (no free structured referee-crew-assignment dataset located)
- **Notes:** Interesting and probably real at the margin, but hand-maintained with no free assignment feed — the data cost far exceeds the expected weight. Catalogued for completeness; not worth building.

<a id="qb-retractable-roof-open-closed-game-day-decision"></a>
#### Retractable-roof open/closed game-day decision

**Weekly 0.1% · Season 0%** · Weather/Venue · stability: n/a · evidence: estimated

- **Mechanism:** At retractable-roof stadiums the home team sets roof status roughly 90 minutes before kickoff and cannot reopen it once closed, which can convert a nominally indoor game into a real wind/cold/rain game after most projections are frozen.
- **Key numbers:** NFL operations rule: roof status locks ~1.5 hours pre-kickoff and the decision is one-way (open to closed only). No isolated fantasy-points effect size exists; conditional magnitude inherits the wind, cold and rain effect sizes already in the catalog.
- **Data:** hand-tracked per-venue roof history + gameday beat reporting; Open-Meteo forecast as the leading indicator
- **Notes:** Not an independent effect — it is a CONDITIONING event that switches the weather entries on or off, and matters mainly because the project's snapshot discipline freezes projections before the roof call is public. Handle as a flag on the weather layer rather than an additive term.

<a id="qb-return-from-major-injury-rushing-volume-ramp-multi-year-recovery-trajectory"></a>
#### Return-from-major-injury rushing-volume ramp (multi-year recovery trajectory)

**Weekly 0.05% · Season 0.4%** · Health/Injury · stability: low · evidence: estimated

- **Mechanism:** Distinct from recurrence probability: a dual-threat QB returning from ACL or Achilles surgery typically has designed-run rate suppressed in year one as the team protects him, with rushing aggressiveness ramping back in year two — a time-since-return trajectory, not a re-injury risk.
- **Key numbers:** No published fantasy-specific ramp coefficient located this pass. The general 'year-one dip, year-two recovery' pattern after ACL reconstruction is documented in the RB/WR sports-medicine literature already cited in factors.md; extension to QB designed-run usage specifically is estimated.
- **Data:** hand-maintained injury/surgery-date table + team-announced usage plans
- **Notes:** Kept separate from injury-type recurrence because the mechanisms genuinely differ — that entry prices probability of re-injury, this one prices deliberate usage suppression by the coaching staff. Season weight far exceeds weekly since it is a full-season role adjustment.

<a id="qb-playing-surface-turf-vs-grass-injury-exposure"></a>
#### Playing surface (turf vs grass) — injury exposure

**Weekly 0.05% · Season 0.15%** · Health/Injury · stability: low · evidence: weak

- **Mechanism:** Synthetic turf has been associated with elevated lower-extremity injury rates, which for a QB matters as availability and rushing-role risk rather than as any in-game performance effect.
- **Key numbers:** Turf injury odds ratio 1.60 for season-ending surgery in 2021-22 NFLPA data, but the finding is contested — 2023 data showed near-parity (factors.md Tier 3).
- **Data:** nflverse surface field; NFLPA turf injury data
- **Notes:** RECLASSIFIED per flagged correction: split out of the 'Altitude & playing surface' Weather/Venue entry and moved to Health/Injury, because the entry's own text conceded it affects injury risk rather than in-game performance. Season weight slightly exceeds weekly since it is a cumulative exposure risk, not a game-day modifier.

<a id="qb-adp-preseason-ecr-market-prior"></a>
#### ADP / preseason ECR (market prior)

**Weekly 0% · Season 3%** · Market/Consensus · stability: high · evidence: strong

- **Mechanism:** Aggregated market wisdom is itself a strong predictor and the best available cold-start prior before any in-season usage data exists.
- **Key numbers:** Preseason ADP predicts end-of-season outcomes about as well as the first four real games do (r=0.599 vs 0.585) — position-agnostic finding (factors.md DEBUNKED table, in the preseason-box-scores row).
- **Data:** nflverse load_ff_rankings() (FantasyPros ECR mirror); Fantasy Football Calculator ADP
- **Notes:** Zero weekly weight by construction — a draft-time prior that is fully superseded once in-season usage accumulates, and leaving any weekly weight on it would just import consensus into a model whose entire purpose is to beat consensus. Also the cold-start default the prior structural audit flagged as missing.

<a id="qb-draft-capital-rookie-qb-hit-rate"></a>
#### Draft capital / rookie QB hit rate

**Weekly 0% · Season 2.4%** · Age/Career Arc · stability: high · evidence: strong

- **Mechanism:** Early draft capital signals organizational investment — job security, weapons spending, and patience through bad stretches — and correlates with rookie-year opportunity independent of play quality.
- **Key numbers:** About 75% of first-round QBs reach a QB2-level season; only 3 rookie QBs have finished top-12 per-game in the last 10 years (dynastynerds; NBC Sports rookie-QB analysis). General draft-capital decay documented in factors.md Tier 2 (r≈0.29 to NFL production, decaying as usage data accumulates).
- **Data:** nflverse draft data
- **Notes:** Zero weekly weight — a draft-time-only prior fully superseded by observed in-season usage. Its real function is job security, which is why it partly offsets the QB job-security-risk entry for high-capital rookies.

<a id="qb-season-passing-yardage-td-prop-market-vegas-player-props"></a>
#### Season passing yardage / TD prop market (Vegas player props)

**Weekly 0% · Season 1.8%** · Market/Consensus · stability: n/a · evidence: estimated

- **Mechanism:** Sportsbook season-long player props aggregate QB-specific market information — weapons, scheme, coaching, injury risk — beyond what a team-level win total captures, and are priced close to draft time.
- **Key numbers:** No direct backtested correlation study located this pass. By analogy to the accepted team win-total split and to the verified ADP-market-prior finding (r=0.599), a player-specific market should be at least as informative preseason. Estimated, not directly quantified for QB fantasy points.
- **Data:** The Odds API / sportsbook player-props feed (paid or limited-credit)
- **Notes:** The player-specific analog to the team win-total logic the catalog already accepts. Partly redundant with ADP — both are markets pricing the same player — so it is weighted below ADP despite arguably being the sharper of the two.

<a id="qb-second-year-sophomore-jump"></a>
#### Second-year sophomore jump

**Weekly 0% · Season 1.6%** · Age/Career Arc · stability: medium · evidence: moderate

- **Mechanism:** Year-two QBs often post a substantial efficiency and production gain as scheme familiarity, supporting cast and play-calling trust improve together.
- **Key numbers:** PFF-sourced claim of ~75% rookie-to-sophomore production increase, though within-rookie-season improvement is modest (~1 fantasy point) (thefantasyfootballers rookie-progression analysis). The 75% figure is a large percentage off a very low rookie base, so it overstates the absolute jump.
- **Data:** nflverse season-over-season stats by experience year
- **Notes:** Evidence downgraded on the base-rate caveat — a 75% gain from a rookie baseline of ~12 PPG is a different claim than it sounds. Draft-season only; the within-season version is a separate entry with weekly relevance.

<a id="qb-cold-weather-qb-toughness"></a>
#### 'Cold-weather QB toughness'

**Weekly 0% · Season 0%** · Other · stability: n/a · evidence: strong

- **Mechanism:** Claimed: QBs and teams from cold-weather markets perform better on the road in cold games through acclimation or toughness.
- **Key numbers:** Road rushing efficiency is identical across climate origins (3.89-3.99 YPC); the real effect is HOME-team acclimation, i.e. a dome-team-on-cold-road penalty, not a traveling-player toughness trait (factors.md DEBUNKED table).
- **Data:** n/a
- **Notes:** DEBUNKED, but load-bearing: it establishes that the cold-temperature entry (0.8 weekly) must be implemented as a dome-team-on-road INTERACTION rather than as a main effect on temperature or on player origin.

<a id="qb-completions-per-game"></a>
#### Completions per game

**Weekly 0% · Season 0%** · Opportunity/Volume · stability: high · evidence: strong

- **Mechanism:** Accuracy-weighted volume — arithmetically attempts × completion rate, both of which are already separately modeled.
- **Key numbers:** Completions/game YoY r=0.66 all starters, 0.68 young, 0.51 age-30+ — the highest per-game passing stability measured (fantasyclassroom); same-week correlation to QB fantasy points r=0.47 (Sharp Football 2025).
- **Data:** nflverse PBP
- **Notes:** ZEROED per flagged correction. This is the highest-stability stat in the catalog and it still gets zero weight, because it is a deterministic product of pass attempts (weighted 10.0) and completion percentage/CPOE (weighted 2.6) — giving it independent weight would double-count that variance outright. Retained explicitly as a redundancy check so it is not mistakenly re-added later. This is the clearest deliberate monotonicity exception in the list.

<a id="qb-contract-year-boost"></a>
#### Contract-year boost

**Weekly 0% · Season 0%** · Other · stability: n/a · evidence: strong

- **Mechanism:** Claimed: players produce more in the final year of a contract.
- **Key numbers:** No statistically significant effect (Football Outsiders 12-year regression, plus multiple replications) (factors.md DEBUNKED table).
- **Data:** n/a
- **Notes:** DEBUNKED. Retained at zero weight for completeness.

<a id="qb-divisional-second-meeting-familiarity"></a>
#### Divisional / second-meeting familiarity

**Weekly 0% · Season 0%** · Situational/Schedule · stability: n/a · evidence: weak

- **Mechanism:** Claimed: familiarity from a first meeting changes the second meeting's player-level performance.
- **Key numbers:** 'Weak and weakening'; no QB-specific effect size published (factors.md Tier 3).
- **Data:** nflverse schedules
- **Notes:** Effectively debunked. Retained at zero weight for catalog completeness and so it is not re-proposed in a future research pass.

<a id="qb-preseason-box-score-stats"></a>
#### Preseason box-score stats

**Weekly 0% · Season 0%** · Other · stability: n/a · evidence: strong

- **Mechanism:** Claimed: preseason passing production predicts regular-season QB performance.
- **Key numbers:** Meaningless as production; preseason ADP alone predicts as well as the first four real games (r=0.599 vs 0.585). Preseason USAGE (first-team snaps) is informative; preseason production is not (factors.md DEBUNKED table).
- **Data:** n/a
- **Notes:** DEBUNKED with an important carve-out: preseason first-team SNAP data is a legitimate signal and feeds the job-security and draft-capital entries. Only the box-score production half is noise.

<a id="qb-revenge-games"></a>
#### Revenge games

**Weekly 0% · Season 0%** · Other · stability: n/a · evidence: strong

- **Mechanism:** Claimed: players facing a former team perform above their baseline.
- **Key numbers:** 49.5% of 384 skill players beat their average — a coin flip; QBs specifically only 35%, WORSE than baseline (factors.md DEBUNKED table).
- **Data:** n/a
- **Notes:** DEBUNKED and actively harmful for this position specifically — QBs underperform in revenge spots, so using it as a positive adjustment would be worse than ignoring it.

<a id="qb-simple-strength-of-schedule-funnel-defense-season-rankings"></a>
#### Simple strength-of-schedule / 'funnel defense' season rankings

**Weekly 0% · Season 0%** · Other · stability: n/a · evidence: strong

- **Mechanism:** Claimed: a defense's season-long points-allowed-by-position rank predicts next season's or next week's matchup difficulty.
- **Key numbers:** Defensive fantasy-points-allowed year-over-year correlation is only 0.16-0.27; top-5 units repeat just 20-30% (factors.md DEBUNKED table).
- **Data:** n/a
- **Notes:** DEBUNKED. This is the specific evidence that forces the heavy shrinkage on the opponent-pass-defense entry (2.7 weekly / 0.3 season) rather than a face-value matchup adjustment — the debunking is load-bearing for a weighted factor, not just trivia.

<a id="qb-trap-letdown-games"></a>
#### Trap / letdown games

**Weekly 0% · Season 0%** · Other · stability: n/a · evidence: strong

- **Mechanism:** Claimed: favored teams underperform after a big win or while looking ahead to a bigger game.
- **Key numbers:** Good teams actually won MORE in trap spots (80.5% / 82.2% vs a 79.5% baseline), not statistically significant (Harvard study, 2002-2011) (factors.md DEBUNKED table).
- **Data:** n/a
- **Notes:** DEBUNKED — the point estimate runs opposite to the myth. Retained at zero weight.


### RB — detail

<a id="rb-weighted-opportunity-rz-weighted-touch-volume-carries-targets"></a>
#### Weighted Opportunity (RZ-weighted touch volume: carries + targets)

**Weekly 16% · Season 13%** · Opportunity/Volume · stability: high · evidence: strong

- **Mechanism:** Single composite of carry and target volume weighted by the scoring value of each touch by field position; the master volume input from which most RB fantasy points mechanically follow.
- **Key numbers:** Same-season correlation to PPR fantasy points: Weighted Opportunity r=0.95 without RZ adjustment, r=0.97 with RZ adjustment, vs r=0.90 for raw opportunities (carries+targets) and r=0.89 for raw touches (Scott Barrett, PFF, RBs with 70+ touches). Formula: RZ carries x1.28 + RZ targets x2.39 + non-RZ carries x0.47 + non-RZ targets x1.54.
- **Data:** nflverse PBP (carries/targets by yardline_100) — fully computable
- **Notes:** CORRECTED: the merged list's 'R2 ~ 0.82 to season PPG since 2017' could not be located in any published source and was removed; the verified figures are the r=0.95/0.97 vs 0.89/0.90 same-season set. IMPORTANT CAVEAT the source does not flag: r=0.97 is a DESCRIPTIVE same-season correlation and is close to tautological (the metric is built from the same touches that generate the points). Its predictive value comes entirely from projecting next week's/next season's weighted opportunity, not from the 0.97. Subsumes raw touches, raw opportunities, and 'high-value touches' as inputs — kept as one row rather than four. Overlaps by construction with the target-share, early-down-share, and RZ-share rows below, which are weighted as ORTHOGONAL RESIDUALS (role composition given total volume), not as independent volume terms.

<a id="rb-receiving-role-rb-target-share"></a>
#### Receiving role / RB target share

**Weekly 8.5% · Season 6.5%** · Opportunity/Volume · stability: medium · evidence: strong

- **Mechanism:** Receptions plus receiving yardage; in half-PPR an RB target is worth roughly twice a carry, so the receiving role is the largest single differentiator between a true RB1 and an early-down committee back at equal total touches.
- **Key numbers:** CORRECTED. PFF/Barrett decade study: RB carry = 0.58 fantasy pts/opportunity, RB target = 1.59 pts in full PPR (2.74x a carry) and 1.36x a carry in standard. Half-PPR target value therefore ~1.19 pts = ~2.05x a carry (derived from the published standard and PPR endpoints). Sharp Football independently states RB targets are 'worth over 2x more fantasy points than a carry.' RB YoY opportunity-metric stability tops out just under r=0.60 (Sharp Football, RB stats-that-matter).
- **Data:** nflverse PBP targets + routes
- **Notes:** CORRECTED TWICE. (1) The merged list's '17% more than a carry in standard, 91% more in full PPR' is wrong — the published PFF figures are 36% more (1.36x) in standard and 174% more (2.74x) in PPR. The original numbers understated RB target value by roughly half. (2) The merged list claimed '>0.70 YoY' stability; that is the WR/pass-catcher target-share figure. RB-specific YoY stability tops out just under 0.60, so stability is downgraded from high to medium. Net effect of the half-PPR adjustment: the correct half-PPR multiple (2.05x) is below full-PPR (2.74x) but well above standard (1.36x), so receiving-role weight is trimmed only modestly from a PPR-based prior rather than halved.

<a id="rb-vegas-spread-game-script-bidirectional-rush-vs-receive-mix"></a>
#### Vegas spread / game script (bidirectional rush-vs-receive mix)

**Weekly 6.5% · Season 0%** · Game Script/Vegas · stability: high · evidence: strong

- **Mechanism:** Spread is uniquely bidirectional for RB: a lead raises rushing volume (clock-killing) while a deficit raises receiving volume (checkdowns), so spread reshapes the rushing/receiving MIX rather than simply scaling total value up or down as it does for WR/TE.
- **Key numbers:** Pass rate 50% leading / 56% tied / 66% trailing (project factors.md Tier 1). PFF: 52% of all RB targets occur while trailing vs 29% while leading; early-down workhorses gain from a lead, pass-catching specialists gain from a deficit. Sharp Football: teams run 53% of the time leading by multiple scores vs 28% trailing by multiple scores.
- **Data:** nflverse PBP + closing spread from load_schedules() + live win probability
- **Notes:** CORRECTED — MISREAD SOURCE. The merged list (inheriting the error from factors.md) said 'RB target share roughly doubles when trailing (29%->52%).' That is not what PFF measured. 52%/29% is the DISTRIBUTION OF ALL RB TARGETS across game states (52% of RB targets happen while trailing, 29% while leading), not a doubling of a player's team target share. The real per-state effect is much smaller than 'doubling' implies. Weight is set on the verified pass-rate shift (50/56/66), not on the misread figure. Season weight set to 0 because season-long expected game script is fully captured by the Vegas win-total row — carrying both would double-count.

<a id="rb-early-down-carry-share"></a>
#### Early-down / carry share

**Weekly 5.5% · Season 3.5%** · Opportunity/Volume · stability: high · evidence: moderate

- **Mechanism:** The early-down role sets a back's touch floor and is the precondition for goal-line work; it is the composition variable that most determines whether a given total volume is high-floor or matchup-dependent.
- **Key numbers:** Fantasy Footballers third-down-role research: 'better to have the early-down role with nothing else than everything but the early-down role.' PFF corroborates directionally — a passing-down role plus 8+ carries/game can still reach top-10, but early-down role dominates when a back has only one of the two. No single published correlation coefficient isolates early-down share from total volume.
- **Data:** nflverse PBP down/distance + snap counts
- **Notes:** Weighted as the ROLE-COMPOSITION residual given total weighted opportunity, not as an independent volume term. Evidence is a directional finding stated qualitatively, not a coefficient — weight is capped accordingly despite high mechanistic confidence.

<a id="rb-route-participation-rate-incl-passing-down-role"></a>
#### Route participation rate (incl. passing-down role)

**Weekly 5% · Season 2.5%** · Opportunity/Volume · stability: medium · evidence: moderate

- **Mechanism:** Filters snap share down to actual receiving opportunity: a back can hold 60% snap share but run routes on only ~30% of team dropbacks. This is the measurable form of 'the passing-down role' and gates every receiving-side factor downstream.
- **Key numbers:** RBs run routes on roughly 30% of team pass snaps even at ~60% overall snap share (FantasyLife/route-participation research); route participation is the binding constraint on RB target opportunity. No RB-specific published YoY r located.
- **Data:** FTN route/scheme charting via nflverse (2022+)
- **Notes:** MERGED: absorbs the separate 'Third-down/passing-down role' entry from the merged list, which measured the same construct with a coarser instrument. Keeping both would have double-counted the receiving-opportunity gate.

<a id="rb-red-zone-goal-line-opportunity-share-rz-volume"></a>
#### Red-zone / goal-line opportunity share (RZ volume)

**Weekly 4.5% · Season 2.5%** · Opportunity/Volume · stability: medium · evidence: strong

- **Mechanism:** Share of the team's high-leverage scoring-position touches, from the 20 in to inside the 5. Concentrates the highest points-per-touch opportunities on one back.
- **Key numbers:** PFF: a carry inside the 5-yard line averages 2.91 fantasy points, more than quadruple the 0.68 average for carries between the 20 and the 10. Team RZ trip rate is sticky (r~0.65 with overall offense quality, factors.md Tier 2) while conversion within trips is noise (YoY ~0.01-0.24).
- **Data:** nflverse PBP yardline_100
- **Notes:** MERGED + ORTHOGONALIZED per the flagged correction, which was valid. The merged list carried FOUR overlapping red-zone entries (weighted opportunity, RZ opportunity share, inside-5 carry share, goal-line conversion rate). Fix: (a) Weighted Opportunity already RZ-weights touches and keeps its own weight; (b) 'RZ opportunity share' and 'inside-5 carry share' are collapsed into THIS single RZ-VOLUME row, weighted as the residual RZ concentration beyond what team volume already implies; (c) 'goal-line conversion' is kept separate below as RZ EFFICIENCY GIVEN VOLUME at near-zero weight, because it is the noisy half. Decomposition is volume vs efficiency, not four additive linear terms.

<a id="rb-injury-designation-practice-participation-trajectory"></a>
#### Injury designation + practice-participation trajectory

**Weekly 4.5% · Season 0%** · Health/Injury · stability: high · evidence: strong

- **Mechanism:** Official designation maps to play probability, and practice participation across the week sharpens that probability substantially — the trajectory is not a soft supplement, it is most of the signal.
- **Key numbers:** UPGRADED WITH NEW EVIDENCE. Football Outsiders 'Questionable Behavior': among Questionable players, 86% play if they had FULL participation in the final practice, 71% if LIMITED, and only 42% if they DID NOT PRACTICE. Doubtful ~3-6%. The commonly cited flat '71% for Questionable' is specifically the LIMITED-practice subgroup, not the pooled rate.
- **Data:** nflverse load_injuries() (daily practice status) + ESPN unofficial for intra-week
- **Notes:** EVIDENCE UPGRADED from moderate to strong. The prior audit flagged practice trajectory as an unquantified gap; it is in fact quantified — the 86/71/42 split by final-practice status is a 44-point spread in play probability inside a single designation, which is larger than most of the modeling factors on this list. This is the highest-value cheap win in the weekly engine. Season weight 0: designations are not knowable at draft time (durability priors live in the recurrence and workload-wear rows).

<a id="rb-committee-structure-bell-cow-touch-concentration"></a>
#### Committee structure / bell-cow touch concentration

**Weekly 3.5% · Season 5.5%** · Opportunity/Volume · stability: medium · evidence: moderate

- **Mechanism:** How touches split within a backfield. A big-gap backfield concentrates value on one player; a small-gap backfield splits it and adds week-to-week volatility for both backs. Structurally distinctive to RB — no other position has a single teammate who can take a third of your value.
- **Key numbers:** RotoViz big-gap/small-gap backfield framework (Jack Miller) documents materially different hit/win rates by backfield-gap size; no single correlation coefficient published. ESPN 2026 trend work confirms backfield touch concentration as a primary draft-time sorting variable.
- **Data:** depth charts + snap/touch splits; hand-tracked ADP gaps
- **Notes:** Season weight exceeds weekly weight because at draft time the backfield structure is a large unresolved unknown, whereas in-week the observed touch split is already largely priced into weighted opportunity. Paired with the committee-volatility row below, which carries the interval rather than the point estimate.

<a id="rb-vegas-implied-team-total"></a>
#### Vegas implied team total

**Weekly 3.5% · Season 0.5%** · Game Script/Vegas · stability: high · evidence: strong

- **Mechanism:** The most information-dense single pregame number for a team's expected scoring volume and drive count, which sets the size of the RZ/TD opportunity pool the back is competing for.
- **Key numbers:** Identified across the project's research as the most information-dense single pregame number for scoring volume at every position; no RB-specific isolated coefficient published separately from the spread/game-script effect.
- **Data:** nflverse load_schedules() closing lines / ESPN odds endpoint
- **Notes:** Partially collinear with the spread row (total and spread jointly determine implied team total). Weighted as the scoring-environment component with game-script direction stripped out.

<a id="rb-ol-run-blocking-quality-adjusted-line-yards-style-composite"></a>
#### OL run-blocking quality (Adjusted Line Yards-style composite)

**Weekly 3% · Season 3.5%** · Team Environment · stability: medium · evidence: strong

- **Mechanism:** Blocking quality determines rushing-lane quality and yards before contact; it is the largest non-player input to RB rushing production and has essentially no effect on RB receiving production.
- **Key numbers:** CORRECTED RANGE. Adjusted Line Yards explains 28.9% of RB HALF-PPR production (DraftSharks); ALY had the highest correlation to fantasy points of any single stat examined at 43.1% (4for4, 2025 data); an independent replication reports R2=0.43 (Fantasy Footballers). Verified range R2 ~= 0.29-0.43. Near-zero effect on RB receiving (factors.md Tier 2).
- **Data:** Football Outsiders/FTN ALY or PFF run-block grades; approximable from nflverse PBP yards-before-contact
- **Notes:** CORRECTED: the merged list's upper bound of 0.46 and the '~0.59 at top/bottom-10 extremes' claim could not be verified in any fetched source and were removed. The 0.289 figure is the most directly relevant one here because it is measured against half-PPR specifically. Should be applied to the rushing stream only, never to the receiving stream.

<a id="rb-snap-share-role-change-leading-indicator"></a>
#### Snap share (role-change leading indicator)

**Weekly 3% · Season 1.5%** · Opportunity/Volume · stability: medium · evidence: moderate

- **Mechanism:** Ceiling on all other usage, and the earliest observable signal of a role change — snaps move before touches do.
- **Key numbers:** Industry-consensus leading indicator (factors.md Tier 1); one direct test found weak same-season correlation once touches are already known. Use as an alert/trend detector, not a standalone scorer.
- **Data:** nflverse load_snap_counts() (2012+)
- **Notes:** Deliberately weighted below its intuitive importance: conditional on weighted opportunity being known, snap share adds little. Its real value is as a change-detector feeding the news pipeline, which is an engine mechanism rather than a projection weight.

<a id="rb-rushing-efficiency-composite-ryoe-led-success-rate-epa-per-rush-ypc-as-regression-flag"></a>
#### Rushing efficiency composite (RYOE-led; success rate/EPA per rush; YPC as regression flag)

**Weekly 2.5% · Season 2%** · Efficiency/Talent · stability: low · evidence: moderate

- **Mechanism:** Whether a carry converts to yardage above what the blocking and defensive alignment predict. RYOE is the best-constructed member (defender-position-adjusted), success rate captures consistency, EPA captures explosiveness, and raw YPC is the noisiest and belongs only as a regression trigger.
- **Key numbers:** YPC YoY r ~ 0.15 to 0.41 across studies; best-fit next-year model is 3.05 + 0.28 x (this-year YPC), R2 ~ 0.28; YPC requires ~1,978 carries to stabilize, which the source concludes means it stabilizes 'never' within a career (Footballguys/Harstad, Football Perspective). RB rushing success rate spans ~38-62% leaguewide; EPA-to-success-rate correlation 0.80. NFL Next Gen Stats describes RYOE as among its most predictive advanced rushing metrics but publishes no YoY-r.
- **Data:** nflverse PBP EPA/success rate (free) + NFL NGS public RYOE leaderboard (free)
- **Notes:** MERGED FOUR ENTRIES: 'Yards per carry', 'Success rate / EPA per rush', 'RYOE', and 'Explosive run rate'. These are four instruments pointed at one quantity — yards produced per carry — and the merged list would have summed 6.5% weekly across them, badly over-weighting the noisiest statistic in football. Consolidated to a single low weight. Treat 5.5+ YPC without matching role/volume growth as a sell flag, never as skill carried forward.

<a id="rb-td-regression-actual-vs-expected-tds-rushing-receiving"></a>
#### TD regression (actual vs expected TDs, rushing + receiving)

**Weekly 2.5% · Season 2%** · Efficiency/Talent · stability: medium · evidence: strong

- **Mechanism:** Actual TDs regress hard toward expected-TD models; the actual-minus-expected GAP, not the raw TD rate, is the reliable input. For RB this is the largest single source of misvaluation carried forward from prior-year box scores.
- **Key numbers:** Receiving-TD YoY R2 = 0.03-0.08 (near zero); xTD stickiness 0.38 vs 0.28 for raw TDs; historical regression flags hit 90.7% (137/151); player RZ conversion >=40% regressed down 92% of the time and <12% regressed up 92% of the time (factors.md Tier 1/Tier 2).
- **Data:** nflverse PBP + an nflfastR-style xTD model (computable)
- **Notes:** The regression pattern is reliable; the raw rate it corrects is not. Implement as a pull-to-mean on the efficiency term, never as a forward extrapolation of a hot TD rate.

<a id="rb-opponent-run-defense-quality-opponent-adjusted-epa-success-box-rate-missed-tackle-rate-allowed"></a>
#### Opponent run-defense quality (opponent-adjusted EPA/success + box rate + missed-tackle rate allowed)

**Weekly 2.5% · Season 0.3%** · Matchup/Opponent · stability: low · evidence: moderate

- **Mechanism:** Weak run defenses concede more yards per touch and invite heavier game-planned run volume. Three previously separate signals — overall run-D quality, pre-snap box structure, and post-contact tackling execution — are one construct measured at three points on the same play.
- **Key numbers:** Generalized positional fantasy-points-allowed YoY correlation is only 0.16-0.27 leaguewide and top-5 defenses repeat as top-5 only 20-30% of the time (factors.md DEBUNKED row) — so this must be heavily shrunk. Opponent-adjusted rushing EPA/success rate is more stable than raw fantasy-points-allowed but no RB-specific published coefficient was located. Box-count-to-rushing-efficiency and missed-tackle-rate-allowed relationships are mechanically established but published only as tooling inputs (PFF, StatRankings), not as effect sizes.
- **Data:** nflverse PBP opponent-adjusted EPA/success rate + defenders_in_box; missed-tackle rate needs PFF (paid) or FTN charting
- **Notes:** MERGED THREE ENTRIES: 'Opponent run defense / DvP', 'Opponent light-box/stacked-box rate', and 'Opponent missed-tackle rate allowed'. Treating them as three additive weights would have triple-counted opponent run-defense quality against a signal the project's own research shows is mostly noise. Must be shrunk hard toward league mean — this is the single most over-weighted factor in mainstream fantasy content.

<a id="rb-vacated-touches-in-season-offseason-backfield-redistribution"></a>
#### Vacated touches (in-season / offseason backfield redistribution)

**Weekly 2% · Season 3.5%** · Opportunity/Volume · stability: medium · evidence: estimated

- **Mechanism:** When an RB1 is lost to injury, trade, or release, backfield touches typically consolidate onto ONE primary replacement — structurally different from WR/TE, where vacated targets split several ways. This makes RB the position where a single transaction produces the largest discrete projection change.
- **Key numbers:** No published correlation coefficient. The single-primary-beneficiary pattern for RB versus multi-way splits for WR/TE is well established qualitatively across industry work but has not been reduced to an r or an elasticity in any source located.
- **Data:** nflverse depth charts + injury/transaction feeds
- **Notes:** Evidence downgraded from moderate to estimated — it is a structural pattern with no measured effect size. Explicit gap flagged by the prior audit; correctly added. Season weight exceeds weekly weight because offseason vacated opportunity is a primary draft-time lever, while in-week it is a discrete event rather than a continuous feature.

<a id="rb-yards-after-contact-elusiveness-missed-tackles-forced"></a>
#### Yards after contact / elusiveness (missed tackles forced)

**Weekly 2% · Season 1.8%** · Efficiency/Talent · stability: medium · evidence: moderate

- **Mechanism:** Isolates runner skill from blocking quality by measuring only the portion of the run the blocking cannot explain. The most defensible efficiency signal at the position precisely because it is contact-adjusted.
- **Key numbers:** PFF Elusive Rating = (missed tackles forced / touches) x (YAC per attempt x 100); methodology published and widely used. No YoY-stability coefficient for the metric was located in any fetched source.
- **Data:** PFF (paid); approximable from nflverse yards-after-contact + FTN broken-tackle charting
- **Notes:** Kept separate from the rushing-efficiency composite because the contact adjustment makes it a materially different construct — it survives changes in offensive line quality in a way YPC and EPA do not, which is exactly what makes it useful for projecting a back into a new situation.

<a id="rb-tprr-targets-per-route-run"></a>
#### TPRR (targets per route run)

**Weekly 2% · Season 1.5%** · Opportunity/Volume · stability: medium · evidence: estimated

- **Mechanism:** How often a route converts into a target — the 'earns the look' rate. Distinct from route participation (how often he runs a route at all) and from target share (share of team targets); isolates coaching/QB trust in the receiving role from raw route volume.
- **Key numbers:** Industry-standard receiving-back metric (PFF, PlayerProfiler, RotoViz); no RB-specific published YoY r located. Estimated moderate stability by analogy to the WR TPRR literature (r ~ 0.4-0.5 YoY there), adjusted down because RB YoY opportunity stability tops out under 0.60 overall.
- **Data:** nflverse FTN route charting + target data (computable, 2022+)
- **Notes:** Evidence downgraded from moderate to estimated: the RB-specific coefficient does not exist in published work and the weight rests entirely on a cross-position analogy. Genuinely non-redundant with route participation and target share — it is the middle term that decomposes target share into (route rate) x (target rate given route).

<a id="rb-in-season-ol-availability-continuity-starters-out-same-five-streak"></a>
#### In-season OL availability & continuity (starters out, same-five streak)

**Weekly 1.8% · Season 0.8%** · Team Environment · stability: low · evidence: estimated

- **Mechanism:** Losing one or two starting linemen mid-season pushes run blocking below the preseason-projected tier for that stretch; separately, cohesion (combo-block timing, communication) degrades when the starting five shuffles even at constant individual talent.
- **Key numbers:** No published effect size for the RB rushing case. Derived as a within-season delta from the verified OL-quality relationship (ALY R2 ~ 0.29-0.43 to RB fantasy production). Published OL-continuity effects from FO/PFF are concentrated in pass protection and sack rate, not rushing.
- **Data:** nflverse injury reports + snap counts (starting-five streak is computable)
- **Notes:** MERGED 'In-season OL availability' and 'OL continuity' — both are the same within-season deviation from the preseason OL tier, differing only in whether the cause is absence or reshuffling. Modifier on the OL-quality row, not an independent factor.

<a id="rb-receiving-efficiency-yprr-catch-rate-yac-over-expected"></a>
#### Receiving efficiency (YPRR, catch rate, YAC over expected)

**Weekly 1.5% · Season 1.2%** · Efficiency/Talent · stability: low · evidence: estimated

- **Mechanism:** Whether route and target opportunity converts into receptions and yardage; YAC-over-expected isolates post-catch playmaking from scheme and QB placement.
- **Key numbers:** No RB-specific published YoY r located. Analogous pass-catcher efficiency metrics are unstable (catchable-target rate ~0.28-0.29 YoY, factors.md Tier 2), implying similarly modest stability — estimated by analogy.
- **Data:** nflverse PBP + FTN charting
- **Notes:** Weight raised slightly relative to a full-PPR framing: in half-PPR, receiving YARDAGE carries proportionally more of the receiving-stream value than the reception bonus does, so post-catch efficiency matters marginally more here than in PPR studies.

<a id="rb-pass-protection-role-trust-route-rate-gate"></a>
#### Pass-protection role & trust (route-rate gate)

**Weekly 1.5% · Season 0.6%** · Opportunity/Volume · stability: medium · evidence: weak

- **Mechanism:** Two sides of one gate. A back who is trusted in blitz pickup gets on the field on passing downs; but time actually spent in protection is time not running a route. Both determine whether snap share converts into receiving opportunity, and rookies are the population where this binds hardest.
- **Key numbers:** No published effect size on either side. RBs run routes on only ~30% of pass snaps despite ~60% overall snap share in some backfields, with protection responsibility a documented negative driver of route rate. The 'not trusted in pass pro' explanation for suppressed rookie passing-down snaps is widely reported in beat coverage but never aggregated.
- **Data:** PFF pass-block grade/whiff rate (paid) or FTN charting
- **Notes:** MERGED 'Pass-blocking snap rate (route-rate suppressor)' and 'Pass-protection quality/whiff rate as gatekeeper'. The merged list framed one as a volume suppressor and one as a skill gate, but they are the same mechanism at two points in time (do you get on the field, and what do you do once there), and both flow into the same observable: route participation rate. Largely already absorbed by that row — this weight is the residual.

<a id="rb-opponent-pass-defense-profile-vs-rbs-coverage-lb-nickel-quality-blitz-rate"></a>
#### Opponent pass-defense profile vs RBs (coverage LB/nickel quality + blitz rate)

**Weekly 1.5% · Season 0.2%** · Matchup/Opponent · stability: medium · evidence: estimated

- **Mechanism:** How well the defense covers RB routes (angle, wheel, screen) and how often it blitzes — the blitz being the mechanism that manufactures checkdown volume. Entirely separate from the same defense's run-stopping ability.
- **Key numbers:** PFF publishes team coverage-grade-vs-RB; no portable correlation coefficient to RB fantasy points located. Blitz-rate-to-RB-target relationship is mechanistically established (checkdowns are the primary pressure release) but unquantified for RB specifically.
- **Data:** PFF grades (paid) or nflverse PBP blitz/personnel proxy
- **Notes:** MERGED 'Opponent coverage LB/nickel quality vs RB routes' and 'Opponent blitz rate' — both are the receiving-stream half of the opponent matchup and were being weighted twice. Kept separate from the run-defense row because a defense can be elite against the run and poor covering backs; that dissociation is real and is why a single DvP number is inadequate.

<a id="rb-blowout-garbage-time-nonlinearity-at-spread-extremes"></a>
#### Blowout / garbage-time nonlinearity at spread extremes

**Weekly 1.5% · Season 0%** · Game Script/Vegas · stability: medium · evidence: moderate

- **Mechanism:** The linear spread model misses a tail: once a game is decided, the winning team pulls starters in Q4 (capping the favored RB1 even in a blowout win) while the losing team's backup vultures late carries and goal-line work. Both effects break the monotonic 'bigger favorite equals more RB volume' assumption.
- **Key numbers:** PFF 'Defining garbage time for fantasy production': team rush rate value rises to ~0.36 pts/play (vs ~0.15 passing) once win-probability thresholds are crossed, but the added volume concentrates on backups and committee mates rather than scaling the starter proportionally. factors.md notes garbage time inflates pass-catcher stats far more than RB.
- **Data:** nflverse PBP win probability + game state
- **Notes:** Genuine addition — the linear spread factor is directionally right and tail-wrong. Implement as a spread-magnitude interaction (a cap at extreme favorite spreads, a backup boost at extreme underdog spreads), not as an additive term.

<a id="rb-team-offensive-pace-neutral-script-plays-per-game"></a>
#### Team offensive pace (neutral-script plays per game)

**Weekly 1.2% · Season 1.8%** · Team Environment · stability: medium · evidence: strong

- **Mechanism:** More offensive plays means more carries and targets available to distribute across the backfield.
- **Key numbers:** Pace YoY r = 0.43-0.47 when QB or head coach is retained, dropping to ~0.31-0.39 when either changes (factors.md Tier 1).
- **Data:** nflverse PBP (computable)
- **Notes:** Season weight above weekly because the pace estimate is a team-season prior that barely moves week to week; weekly variation in plays is driven mostly by game script, which is already weighted separately.

<a id="rb-team-pass-run-mix-proe"></a>
#### Team pass/run mix (PROE)

**Weekly 1.2% · Season 1.8%** · Team Environment · stability: medium · evidence: strong

- **Mechanism:** A pass-heavy team has fewer called runs to distribute at equal pace, partly offset by more receiving value for a pass-catching back — so PROE shifts the rush/receive mix rather than uniformly cutting RB value.
- **Key numbers:** ~24-point spread in neutral-script pass probability between the most extreme teams; early-season PROE R2 to full-season PROE = 0.32, adjusted pace = 0.47 (factors.md Tier 1).
- **Data:** nflverse PBP xpass model
- **Notes:** Partially collinear with the game-script row (realized pass rate = neutral PROE + game-state adjustment). Weighted as the neutral-script component only.

<a id="rb-post-return-workload-ramp"></a>
#### Post-return workload ramp

**Weekly 1.2% · Season 0.5%** · Health/Injury · stability: low · evidence: estimated

- **Mechanism:** Backs returning from injury are eased back over roughly 2-4 weeks rather than resuming their pre-injury share immediately — a systematic, one-directional projection error if ignored.
- **Key numbers:** No published coefficient located. Team pitch-count/workload-management behavior on return is well documented in beat coverage but the magnitude and duration are estimated.
- **Data:** snap/touch trend post-return, computable from nflverse snap counts
- **Notes:** Small weight but high asymmetry: the error is always in the same direction (over-projection), which makes it worth carrying despite weak evidence. Pairs with the injury-designation row.

<a id="rb-in-game-or-in-season-role-loss-shock-fumble-benching-performance-benching"></a>
#### In-game or in-season role-loss shock (fumble benching, performance benching)

**Weekly 1% · Season 0.3%** · Coaching/Scheme · stability: low · evidence: weak

- **Mechanism:** A coach's-decision volume shock: a fumble frequently triggers an immediate benching for the remainder of that game and sometimes the next, and a struggling starter can shed touches to a backup over a multi-week stretch on pure performance grounds. Distinct from the correctly debunked idea that fumbling is a projectable trait.
- **Key numbers:** No published incidence rate for benching-following-fumble or for performance-driven role reduction. Well-documented anecdotally, particularly for rookies and committee backs; partially observable in advance through the snap-share trend detector.
- **Data:** snap counts pre/post event from nflverse PBP; news pipeline
- **Notes:** MERGED 'In-game fumble -> benching' and 'Performance-based benching / role reshuffling' — both are coach's-decision volume shocks detected by the same instrument (a discontinuity in snap share), differing only in trigger. This belongs in the news/event pipeline as a detector, not in the pre-kickoff feature vector, since it is mostly unobservable before it happens.

<a id="rb-designed-scheme-touches-screens-jet-sweeps-motion-and-gadget-usage"></a>
#### Designed / scheme touches (screens, jet sweeps, motion and gadget usage)

**Weekly 0.8% · Season 0.5%** · Opportunity/Volume · stability: medium · evidence: weak

- **Mechanism:** Touches manufactured by scheme rather than earned through route-running or between-tackle carries; they raise a back's floor independent of what route participation or early-down share predict, and they cluster heavily in specific coaching trees.
- **Key numbers:** No aggregate published effect size located; discussed qualitatively across 4for4 and PFF scheme-fit and high-value-touch analysis.
- **Data:** nflverse PBP play-type and motion tags + FTN charting
- **Notes:** Substantially overlaps the weighted-opportunity and route-participation rows — a screen already counts as a target there. The residual signal is the scheme-persistence part (this coordinator manufactures touches every year), which is what the small weight represents.

<a id="rb-dome-indoor-venue-scoring-environment"></a>
#### Dome / indoor venue (scoring environment)

**Weekly 0.8% · Season 0.3%** · Weather/Venue · stability: high · evidence: moderate

- **Mechanism:** Indoor games remove wind, precipitation, and cold, lifting overall offensive efficiency and scoring pace, which modestly raises team rushing yardage and rush-TD rate.
- **Key numbers:** Team-wide rushing 118.96 yds / 1.00 rush TD per game indoors vs 113.35 yds / 0.86 TD outdoors, i.e. 16.51 -> 17.89 team-wide rushing fantasy pts/gm (DraftKings Network). Combined scoring +9% indoors, 46.2 vs 42.4 pts/gm (Pinnacle 2003-2015, also in factors.md Tier 2).
- **Data:** nflverse load_schedules() roof field
- **Notes:** Correctly identified by the gap-hunt as absent from the RB list despite being a Tier-2 factor in the project's own research. Caveat retained: the team-wide rushing numbers include QB scrambles and designed QB runs, so the RB-only share of that 1.38 pts/gm lift is smaller than the headline. Small nudge, not a lever. The single-player CMC example (20.51 vs 27.41 FPPG) is anecdotal and carries no weight.

<a id="rb-rain-snow-run-game-tilt"></a>
#### Rain / snow (run-game tilt)

**Weekly 0.8% · Season 0%** · Weather/Venue · stability: medium · evidence: moderate

- **Mechanism:** Poor footing and visibility shift play-calling toward the run and raise checkdown targets — one of the few weather effects that is net POSITIVE for RB while being negative for the passing game.
- **Key numbers:** Moderate rain: -4.7% pass rate, +7.7% RB targets. Snow effects are large (~25% leaguewide scoring drop, -7 to -12 pts FG%) but rare. Rain is otherwise overrated: <5% effect on most metrics (factors.md Tier 2).
- **Data:** nflverse load_schedules() weather + Open-Meteo kickoff-hour forecast
- **Notes:** The +7.7% RB-target figure is the highest-value weather number for this position and is the reason weather is worth carrying at RB at all — most weather effects are QB/K stories.

<a id="rb-play-through-penalty-by-injury-type-body-part"></a>
#### Play-through penalty by injury type / body part

**Weekly 0.7% · Season 0.4%** · Health/Injury · stability: high · evidence: strong

- **Mechanism:** Playing while injured reduces per-game output by a body-part-specific amount even when the player suits up — so play probability alone under-adjusts.
- **Key numbers:** RB playing-through-injury penalty: -8.7% production; foot injuries specifically -20% to -25% (factors.md Tier 1; RB penalty sits between WR -9.9% and TE -8.5%, with QB ~ no effect).
- **Data:** nflverse load_injuries() + production
- **Notes:** Strong evidence but genuinely small magnitude — an 8.7% haircut is roughly one fantasy point for a starting RB. Weighted honestly rather than inflated to match its evidence grade; monotonicity with evidence does not require monotonicity with effect size.

<a id="rb-qb-pressure-sack-rate-rb-checkdown-target-boost"></a>
#### QB pressure / sack rate -> RB checkdown-target boost

**Weekly 0.7% · Season 0.2%** · Team Environment · stability: low · evidence: weak

- **Mechanism:** Heavily pressured QBs use the RB checkdown as the primary safety valve, inflating a pass-catching back's targets beyond what route share predicts — partly offset because sacks shrink total dropbacks.
- **Key numbers:** No RB-specific published effect size. Supporting mechanism only: checkdowns produce positive EPA and ~45-47% success rate on early downs and are the QB's primary pressure release (NFL Next Gen Stats / NBC Sports).
- **Data:** nflverse PBP pressure/sack flags + target data
- **Notes:** Offense-side twin of the opponent-blitz-rate component, which now lives in the opponent pass-defense row. Kept separate because a chronically pressured offense produces this effect every week regardless of opponent.

<a id="rb-committee-volatility-week-to-week-touch-split-noise"></a>
#### Committee volatility / week-to-week touch-split noise

**Weekly 0.6% · Season 2.5%** · Variance Driver · stability: low · evidence: estimated

- **Mechanism:** Even inside a stable committee the exact touch split moves week to week with game plan, matchup, and in-game performance, adding variance beyond what the season-long role split predicts. This is the interval companion to the committee-structure point estimate.
- **Key numbers:** Related to the RotoViz big-gap/small-gap research: even-split backfields show materially more week-to-week volatility than bell-cow backfields. No published coefficient for the volatility magnitude itself.
- **Data:** weekly touch-share variance, computable from nflverse
- **Notes:** Sizes confidence intervals, not point estimates. Season weight is high relative to weekly because draft-time RB risk is overwhelmingly about committee uncertainty resolving badly — this is where an RB's realistic downside distribution comes from.

<a id="rb-backup-qb-downgrade-qb-tier-shift"></a>
#### Backup-QB downgrade / QB-tier shift

**Weekly 0.5% · Season 0.4%** · Team Environment · stability: low · evidence: estimated

- **Mechanism:** When the starting QB is downgraded, offenses often shorten the playbook and lean on the run, which can raise RB carry share even as total scoring efficiency and implied team total fall — the two effects partly cancel for RB, unlike for pass catchers.
- **Key numbers:** No published effect size specific to RB volume located. Directionally plausible from documented offensive-coordination behavior around backup QBs, but never translated into an RB fantasy-points figure.
- **Data:** depth charts + PBP play-calling split by starter
- **Notes:** Explicit gap flagged by the prior audit; correctly added but must stay small. Note the partial cancellation: the volume gain is real and the implied-total loss is already captured by the Vegas rows, so the incremental RB effect is much smaller than the effect on WRs and TEs.

<a id="rb-td-game-script-sensitivity-weekly-boom-bust-structure"></a>
#### TD / game-script sensitivity (weekly boom-bust structure)

**Weekly 0.5% · Season 0.3%** · Variance Driver · stability: n/a · evidence: moderate

- **Mechanism:** A TD versus no-TD outcome is a 6-point half-PPR swing on an otherwise identical performance — the bluntest scoring boundary in the sport and the dominant source of week-to-week variance around a stable usage baseline.
- **Key numbers:** Structural property of the scoring format (a binary high-leverage event layered on continuous yardage and reception production), not a measured correlation. Anchored by the verified inside-5 figure: one goal-line carry is worth 2.91 fantasy points versus 0.68 for a carry from the 20-to-10.
- **Data:** nflverse PBP
- **Notes:** This factor IS variance rather than a predictor of it — it sizes floor/ceiling intervals and quantile models, and must not be added to the point projection. Half-PPR raises its relative importance versus full PPR, because the reception floor that damps RB variance in PPR is halved here.

<a id="rb-home-away-split"></a>
#### Home / away split

**Weekly 0.5% · Season 0%** · Situational/Schedule · stability: low · evidence: moderate

- **Mechanism:** Playing at home modestly raises RB per-carry production (comfort, crowd noise on the defense, no travel fatigue).
- **Key numbers:** VERIFIED. PFF 'Narrative Street: How significant are home/away splits?' — RBs score 3.3% more fantasy points PER CARRY at home, and RBs (per attempt) show the smallest home/road difference of any position studied.
- **Data:** nflverse load_schedules() home/away flag + PBP
- **Notes:** FLAGGED CORRECTION REJECTED AS INVALID. The flag alleged this entry was an ungrounded extrapolation contradicting factors.md's 'WR is smallest.' Both are true and not in conflict: factors.md reports home/away as TOTAL FANTASY POINTS by position (WR ~ 0), while PFF's study reports it PER CARRY / PER ATTEMPT (RB smallest per attempt). Different denominators, different rankings. The 3.3% figure is real and directly sourced. Entry kept, evidence upgraded from weak to moderate.

<a id="rb-mobile-rushing-qb-goal-line-vulture-effect"></a>
#### Mobile / rushing-QB goal-line vulture effect

**Weekly 0.4% · Season 0.5%** · Team Environment · stability: low · evidence: weak

- **Mechanism:** A QB used as a designed short-yardage and goal-line runner (sneak packages, tush push) competes with the RB room for the highest-value inside-5 touches, capping RB TD equity independent of the RB's own share of what remains.
- **Key numbers:** CONTRADICTED BY THE ONLY PUBLISHED STUDY. PFF 'Narrative Street: Does a running QB make it easier on the RB?' (2012-2016 leaguewide) found R2=0.01 between QB rushing-TD share and RB TD attempts, R2=0.02 for QB rush-attempt share vs RB YPC, and a maximum observed correlation of 0.08 across all metrics tested — verdict: 'this narrative is busted.' The supporting evidence in the merged list was case-based only (Hurts, Jackson-with-Henry), with no elasticity published.
- **Data:** nflverse PBP: QB rush attempts and rush TDs inside the 5/10, rush-TD share by position within team
- **Notes:** MAJOR DOWNGRADE. The merged list rated this stability 'high' and evidence 'moderate' on anecdote alone, while the one published test of exactly this question found no effect. Not zeroed, for two defensible reasons: the study predates the 2022+ tush-push era and the current generation of designed-QB-run offenses, and the arithmetic of a finite inside-5 carry pool is real at the extremes. But it is now weighted as a narrow, era-specific flag on a handful of teams rather than a general team-environment multiplier. If the engine implements this, it must be validated on 2022-2025 data before it earns any weight at all.

<a id="rb-goal-line-conversion-efficiency-td-rate-given-inside-5-opportunity"></a>
#### Goal-line conversion efficiency (TD rate given inside-5 opportunity)

**Weekly 0.4% · Season 0.3%** · Efficiency/Talent · stability: low · evidence: moderate

- **Mechanism:** Given goal-line opportunity, how often it converts — the efficiency half of the red-zone decomposition, separated from the volume half.
- **Key numbers:** Since 2018 only Derrick Henry (52.7%) and James Conner (52.5%) have converted more than 50% of inside-5 carries into TDs (PFF), but the samples are double-digit carries per season. Red-zone conversion YoY stability is 0.01-0.24 and player RZ conversion >=40% regressed down 92% of the time (factors.md Tier 2).
- **Data:** nflverse PBP yardline_100
- **Notes:** Deliberately kept at near-zero weight as the noisy half of the orthogonalized red-zone decomposition (volume gets 4.5/2.5; efficiency gets 0.4/0.3). The published evidence supports the REGRESSION of this metric, not its forward projection — so it functions as a sell flag on extreme converters, not as a skill input.

<a id="rb-dfs-salary-market-implied-role-signal"></a>
#### DFS salary / market-implied role signal

**Weekly 0.4% · Season 0.2%** · Market/Consensus · stability: low · evidence: estimated

- **Mechanism:** DFS pricing aggregates real-time market information about expected role and game script, sometimes faster than public depth charts update — a cheap consensus cross-check on the engine's own role estimate.
- **Key numbers:** No published effect-size figure located; used qualitatively across the industry as a role-confirmation signal.
- **Data:** DFS salary feeds (DraftKings/FanDuel)
- **Notes:** Best used as a disagreement detector — when the engine's projected role and the salary diverge sharply, that is a flag to check for news the pipeline missed, not a term to blend into the projection.

<a id="rb-in-game-injury-exit-risk-post-kickoff-attrition"></a>
#### In-game injury-exit risk (post-kickoff attrition)

**Weekly 0.4% · Season 0%** · Variance Driver · stability: n/a · evidence: estimated

- **Mechanism:** The pregame designation factor models whether a player starts; this models the separate risk that a fully healthy back exits mid-game with a new injury. RB has the highest per-touch contact exposure of the skill positions, making this the main way a projected 20-touch game becomes an 8-touch game with zero pregame warning.
- **Key numbers:** No aggregate in-game-exit-rate-by-position figure located in any source. Mechanistically grounded in RB's contact exposure per snap but not quantified.
- **Data:** no clean 'injury exit' flag exists in standard nflverse tables; would require hand-flagging or PBP substitution inference
- **Notes:** Genuine structural gap in the Variance Driver category, correctly identified by the gap hunt: the other two variance rows both assume the player finishes the game. Affects the floor side of the distribution only, and also raises the handcuff's ceiling. Low weight because it is unforecastable, not because it is unimportant.

<a id="rb-scheme-fit-zone-vs-gap-power-blocking"></a>
#### Scheme fit (zone vs gap/power blocking)

**Weekly 0.3% · Season 1%** · Coaching/Scheme · stability: low · evidence: estimated

- **Mechanism:** A runner's style (one-cut zone vision versus downhill gap power) interacts with the blocking scheme; mis-fit backs underperform their raw touch count.
- **Key numbers:** No single runner-scheme-fit correlation published. RotoViz backfield-composition research quantifies outcomes by backfield structure but not by scheme fit; PFF and FTN publish scheme charting without an attached fantasy-points effect size.
- **Data:** PFF/FTN scheme charting
- **Notes:** Season weight above weekly: scheme fit matters most when projecting a back into a NEW situation (free agency, trade, coordinator change), which is a draft-time problem. Within a season the fit is already priced into observed efficiency.

<a id="rb-personnel-grouping-usage-21-22-personnel-fullback-rate"></a>
#### Personnel-grouping usage (21/22 personnel, fullback rate)

**Weekly 0.3% · Season 0.8%** · Team Environment · stability: high · evidence: weak

- **Mechanism:** Teams that deploy two-back and fullback personnel more often give the lead back extra in-line blocking and concentrate goal-line work; orthogonal to overall pace and PROE.
- **Key numbers:** Descriptive team-level examples only (e.g. the 2019 49ers averaged 5.51 YPC out of 21 personnel); no cross-team regression coefficient located. Leaguewide 11-personnel drifted 63%->58% from 2023-25 (factors.md Tier 2).
- **Data:** nflverse FTN personnel-grouping charting (2022+)
- **Notes:** High stability (personnel tendency is a durable coaching trait) but weak evidence for the size of the effect, so weight stays small. Season weight above weekly because it is a persistent team trait rather than a week-to-week variable.

<a id="rb-coach-4th-down-aggressiveness-incl-goal-to-go-tendency"></a>
#### Coach 4th-down aggressiveness (incl. goal-to-go tendency)

**Weekly 0.3% · Season 0.3%** · Coaching/Scheme · stability: medium · evidence: moderate

- **Mechanism:** Aggressive coaches go for it on 4th down and near the goal line instead of kicking, manufacturing extra high-value RB opportunities.
- **Key numbers:** r=0.30 to offensive EPA/play and a sticky coach-level trait year over year (factors.md Tier 2). That is a general-offense finding applied here to RB goal-line opportunity specifically — the RB-specific extra-carry elasticity is not published.
- **Data:** nflverse PBP 4th-down decisions (computable)
- **Notes:** The 0.30 figure is real but is a coach-to-offense correlation, not a coach-to-RB-touches one; the weight reflects the extrapolation, not the coefficient.

<a id="rb-rookie-in-season-role-acceleration-curve"></a>
#### Rookie in-season role-acceleration curve

**Weekly 0.3% · Season 0.3%** · Age/Career Arc · stability: medium · evidence: weak

- **Mechanism:** Coaching staffs withhold three-down usage from rookie RBs until pass-protection competence is demonstrated in live reps, which often happens mid-season. A rookie's opportunity share should therefore be modeled as trending upward through the first half of the season independent of any change in his rushing ability.
- **Key numbers:** Case-study and beat-reporting evidence only (ESPN, Steelers Depot, 247Sports across multiple rookies); no aggregate regression coefficient. PFF's rookie-performance work addresses a related but different question (career forecasting from rookie-year production), not within-season trajectory.
- **Data:** nflverse snap counts/routes by week for Year-1 players — computable as a week-over-week route-share slope
- **Notes:** Applies to a small subpopulation (rookie RBs) but is a real structural gap: the list has no other within-season role-dynamics factor. Overlaps the pass-protection-gate row, which is the static version of the same mechanism; this one is the time derivative.

<a id="rb-player-prop-market-anytime-td-odds-rush-yards-o-u"></a>
#### Player prop market (anytime-TD odds, rush-yards O/U)

**Weekly 0.3% · Season 0%** · Market/Consensus · stability: low · evidence: weak

- **Mechanism:** Sportsbook prop lines aggregate injury news, expected game script, and red-zone usage on a faster cycle than any hand-built pipeline.
- **Key numbers:** No controlled backtest of prop-implied probability versus actual RB scoring located. Industry sources note books price props with lower precision than main markets and that public money biases short-priced stars — treat as noisy.
- **Data:** paid odds API (The Odds API) or scraped book lines
- **Notes:** The main-market Vegas rows (spread, total) are far better priced and already carry the weight; props add mostly noise plus a small amount of player-specific news. Also the only factor here with a real cost, which further argues for a low weight.

<a id="rb-two-minute-drill-hurry-up-usage"></a>
#### Two-minute drill / hurry-up usage

**Weekly 0.3% · Season 0%** · Variance Driver · stability: low · evidence: weak

- **Mechanism:** Situational spike-week production from hurry-up and two-minute possessions; entirely game-flow contingent and not forecastable pregame.
- **Key numbers:** estimated — no aggregate effect size found. PFF has documented two-minute-drill production qualitatively; the mechanism is plausible but unquantified.
- **Data:** nflverse PBP + game clock
- **Notes:** TWO FLAGGED CORRECTIONS APPLIED, BOTH VALID. (1) The merged list's mechanism cited a specific unsourced anecdote ('138 total yards + a TD on 8 carries in a two-minute drill') naming no player, team, game, or season — removed as an unverifiable figure. (2) Recategorized from Opportunity/Volume to Variance Driver: this is game-flow-contingent and unpredictable pregame, so it cannot function as an ex-ante volume input; it belongs in the ceiling distribution.

<a id="rb-wind"></a>
#### Wind

**Weekly 0.3% · Season 0%** · Weather/Venue · stability: high · evidence: moderate

- **Mechanism:** High wind suppresses passing far more than rushing, producing a minor indirect run tilt. Almost entirely a QB and kicker effect that reaches RB only through play-calling.
- **Key numbers:** Completion% 60.3 -> 54.7 above 20 mph; deep-pass rate -6% relative; ~15 mph is the onset threshold (factors.md Tier 2). The RB effect is indirect and has never been separately quantified.
- **Data:** nflverse weather + Open-Meteo kickoff-hour forecast
- **Notes:** Physics-stable and well quantified, but for the wrong position — the effect size is on passing, and the RB pass-through is unmeasured. Weighted for the run-tilt only; the rain/snow row carries the larger RB-specific weather signal.

<a id="rb-oc-play-caller-change"></a>
#### OC / play-caller change

**Weekly 0.2% · Season 2%** · Coaching/Scheme · stability: low · evidence: weak

- **Mechanism:** A new play-caller changes run/pass mix, personnel usage, and goal-line packages, invalidating the continuity assumption behind every trailing-usage prior.
- **Key numbers:** No rigorous quantitative study exists — an explicit industry research gap (factors.md Tier 3). 21 of 32 teams changed offensive coordinator entering 2026.
- **Data:** hand-maintained coach/play-caller YAML table
- **Notes:** Implement as an UNCERTAINTY WIDENER (wider projection intervals, more shrinkage of trailing usage toward position priors), never as a point adjustment — there is no published effect size to point-adjust with. The high season weight relative to its evidence grade is justified by prevalence, not by effect size: with 21/32 teams affected in 2026, the aggregate share of draft-time variance it touches is large even though the per-team direction is unknown.

<a id="rb-late-season-elimination-evaluation-mode-weeks-14-18"></a>
#### Late-season elimination / evaluation mode (Weeks 14-18)

**Weekly 0.2% · Season 0%** · Situational/Schedule · stability: low · evidence: weak

- **Mechanism:** Teams mathematically eliminated from contention often cut veteran and pending-free-agent workloads to evaluate younger backs — the mirror image of the Week 18 rest case, applying to bad teams over a longer window.
- **Key numbers:** No systematic published study located. Directionally well known in fantasy practice but never quantified.
- **Data:** playoff-odds model (nflverse or ESPN FPI) + news pipeline
- **Notes:** Distinct from Week 18 rest risk (that is good teams in the finale; this is bad teams over the fantasy playoffs) and correctly identified as missing. Matters disproportionately because it lands exactly in fantasy championship weeks.

<a id="rb-week-18-rest-risk-playoff-seeded-teams-resting-starters"></a>
#### Week 18 rest risk (playoff-seeded teams resting starters)

**Weekly 0.2% · Season 0%** · Situational/Schedule · stability: low · evidence: moderate

- **Mechanism:** Contending teams with seeding locked rest starters in Week 18, producing near-total value collapse — certain in direction, unpredictable in timing until news breaks.
- **Key numbers:** Occurs every season, direction certain, magnitude unpredictable (factors.md Tier 3). No usable point estimate; best handled by news tracking rather than a static weight.
- **Data:** manual news tracking, Week 18 only
- **Notes:** Weight applies to one week in eighteen, which is why it stays tiny even though the within-week effect is enormous. Implement as a Week-18-only override, not a season-long feature.

<a id="rb-short-week-thursday-travel"></a>
#### Short week (Thursday) / travel

**Weekly 0.15% · Season 0%** · Situational/Schedule · stability: low · evidence: weak

- **Mechanism:** Reduced practice and recovery time before a Thursday game, plus a validated circadian sub-case for West Coast teams playing night games in the East.
- **Key numbers:** Post-bye edge largely disappeared after the 2011 CBA (2024 study: no significant effect); Thursday short-week effects are small and possibly eroding. West Coast teams beat the spread in 66% of NIGHT games versus East Coast opponents (5.26 pts ATS, 1970-2011, published in SLEEP) — night-game-specific; the popular 'West Coast team at 1pm ET' penalty is not similarly validated.
- **Data:** nflverse load_schedules() + kickoff time and timezone
- **Notes:** The one validated component (the SLEEP circadian finding) is a betting-market result on team performance, not an RB fantasy-points result, and is drawn from a 1970-2011 sample. Near-tiebreaker weight only.

<a id="rb-special-teams-return-role-kick-punt-return-td-equity"></a>
#### Special-teams return role (kick/punt return TD equity)

**Weekly 0.15% · Season 0%** · Situational/Schedule · stability: low · evidence: weak

- **Mechanism:** Some depth and committee RBs retain return duties; most half-PPR formats award 6 points for a return TD even without scoring return yardage, adding incidental spike-week upside unrelated to offensive role.
- **Key numbers:** No aggregate effect size published; entirely dependent on league scoring settings.
- **Data:** nflverse special-teams/return data
- **Notes:** CONDITIONAL FACTOR: verify that return TDs score in this engine's league settings before applying any weight at all. If they do not, this is 0/0. Affects only the ceiling of low-ranked backs, which is where it occasionally matters for a flex decision.

<a id="rb-extreme-venue-travel-disruption-altitude-international-neutral-sites"></a>
#### Extreme venue / travel disruption (altitude, international neutral sites)

**Weekly 0.1% · Season 0%** · Weather/Venue · stability: n/a · evidence: weak

- **Mechanism:** Denver (5,280 ft) and Mexico City (~7,200 ft) reduce effective oxygen for non-acclimated visitors, with fatigue accumulating into the second half — plausibly degrading fourth-quarter burst for a 20+ touch back. The nine 2026 international games (Melbourne, Rio, London, Paris, Madrid, Munich, Mexico City) add long-haul travel, time-zone shift, and routine disruption that vary enormously by destination.
- **Key numbers:** No RB-specific fantasy effect size for either. Physiological sourcing only (~17% less effective oxygen in Denver); factors.md Tier 3 lists altitude as real but under-studied. International-game evidence is directional reporting only (Brazil heat/humidity flattening scoring; repeat London trips less disruptive).
- **Data:** load_schedules() venue/site fields + the plan's hand-built 32-row stadium table extended with elevation and a per-destination disruption tier
- **Notes:** MERGED 'Altitude' and 'International/neutral-site travel' — both are rare venue shocks affecting a handful of games per season with no measured RB effect, and separate weights implied a precision neither has. Best implemented as an uncertainty widener on the affected games rather than a point adjustment. London is a well-worn trip; Melbourne and Rio are not — the disruption tier must be hand-maintained, not inferred from an 'international' boolean.

<a id="rb-age-curve-peak-age-and-decline-slope"></a>
#### Age curve (peak age and decline slope)

**Weekly 0% · Season 8%** · Age/Career Arc · stability: high · evidence: strong

- **Mechanism:** RBs peak earliest and decline fastest among skill positions; the strongest population-level draft-time prior at the position.
- **Key numbers:** VERIFIED AND STRENGTHENED. Average peak age 25.3 in the 32-team era (25.5 in the 1980s-90s), mean across qualifying peak seasons 25.46, distribution peaking at age 25; ages 22-28 account for 84.8% of qualifying peak seasons. Backs debuting since 2000 lost 25.2% of PPR points per game and 37.0% of total PPR points from their age-28 to age-29 season. Peak seasons fall from 8.7% at age 28 to 5.2% at 29 to 3.8% at 30. No 15+ PPG age-33 season since 2000. MIT Sloan work finds RB speed metrics degrade from ~age 28.
- **Data:** nflverse historical rosters + production by age (computable)
- **Notes:** The single largest draft-time factor after role itself, and the one with the cleanest published evidence at this position. Weekly weight is 0 by construction: age does not change within a season. Compounds with, and does not substitute for, the cumulative-workload-wear row.

<a id="rb-adp-ecr-consensus-prior-cold-start-prior"></a>
#### ADP / ECR consensus prior (cold-start prior)

**Weekly 0% · Season 7%** · Market/Consensus · stability: high · evidence: strong

- **Mechanism:** Aggregated market and expert wisdom is the best available prior before the engine has its own edge, and the only usable input for genuine cold-start cases (rookies, post-trade situations, new backfields).
- **Key numbers:** VERIFIED. Footballguys/Harstad: preseason ADP correlated 0.599 with a player's last-12-game production, while his own first-four-game production correlated only 0.585 with the same target — i.e. after a month of real games, preseason ADP still predicted the rest of season better than the season-to-date sample did.
- **Data:** nflverse load_ff_rankings() (FantasyPros ECR mirror + archive), FFC ADP API
- **Notes:** Structural gap correctly flagged by the prior audit: the engine needs an explicit market-prior layer, not just component factors. Two implementation cautions. (1) It is partly circular — ADP is itself built from the same underlying factors, so blending it in at full weight double-counts them; use it as a shrinkage target, not an additive term. (2) It is the eval BASELINE the project measures itself against, so weighting it heavily guarantees matching ECR and forecloses beating it. High weight is correct for cold-start players and should decay sharply as the engine's own role estimate becomes well-identified.

<a id="rb-draft-capital-rookies-and-years-1-3"></a>
#### Draft capital (rookies and years 1-3)

**Weekly 0% · Season 4.5%** · Age/Career Arc · stability: high · evidence: strong

- **Mechanism:** NFL draft investment signals both projected role and team-assessed talent, and is the only meaningful opportunity predictor for a rookie before usage data exists.
- **Key numbers:** CORRECTED. The 85.7% / 71.4% / 50% figures are FIRST-ROUND ONLY: 12 of 14 (85.7%) first-round RBs finished top-36 over the last decade, 10 of 14 (71.4%) top-24, and 50% top-12. Second-round RBs are materially worse: ~45% top-24 and ~22% top-12, and across rounds 2-3 combined only 19 of 50 (38%) reached top-36. Day 3 RBs are near-zero (~1.3% top-24 over ten years). First-round RBs average ~13.06 PPR ppg in years 1-3 versus ~8.59 for Day 2 (+34%).
- **Data:** NFL draft results + fantasy-outcome archives (hand-joined to nflverse rosters)
- **Notes:** CORRECTION APPLIED: the merged list pooled rounds 1-2 under the first-round-only hit rates, materially overstating second-round RBs. Round 2 must be its own tier — the gap between R1 (71.4% top-24) and R2-3 (38% top-36) is one of the sharpest discontinuities in the dataset. Decays quickly as real usage accumulates; by a rookie's second season it should be nearly fully superseded by the opportunity rows.

<a id="rb-vegas-season-win-total-team-quality-prior"></a>
#### Vegas season win total (team-quality prior)

**Weekly 0% · Season 4%** · Game Script/Vegas · stability: high · evidence: moderate

- **Mechanism:** Preseason proxy for how often a team will be leading (run-heavy, clock-killing) and scoring in the red zone across a full season.
- **Key numbers:** CORRECTED AND RE-SCOPED. PFF: over the past three seasons winning teams averaged 26.2 fantasy points per game AT THE RUNNING BACK POSITION versus 20.6 for losing teams — a 5.6 pt/gm gap. Replicated across independent seasons.
- **Data:** preseason win-total markets
- **Notes:** CORRECTED ON BOTH THE NUMBER AND ITS MEANING. (1) The value is 26.2, not the 26.6 carried in the merged list and in factors.md. (2) More importantly, this is TEAM-LEVEL RB-ROOM production (all backs combined), not a single player's points per game — 26.2 ppg for one RB would be a season-long RB1-overall pace, which is obviously not what a team-tier split measures. The merged list and factors.md both read it as per-player. The correct interpretation is that a good team's backfield gets ~27% more total fantasy production to divide, which is then split by the committee-structure factor. Evidence downgraded to moderate because the primary article is paywalled and the figure was recovered from secondary reporting. Also note the composition caveat from the same source: early-down workhorses benefit from a lead, pass-catching specialists benefit from deficits, so this must be applied to backs by archetype, not uniformly.

<a id="rb-cumulative-workload-wear-370-carry-curse-career-touch-wall"></a>
#### Cumulative workload wear (370-carry curse; career-touch wall)

**Weekly 0% · Season 3.5%** · Health/Injury · stability: high · evidence: moderate

- **Mechanism:** An RB-specific overuse signal distinct from age: heavy single-season or career touch totals predict decline and missed time even controlling for age. No equivalent exists at any other position.
- **Key numbers:** VERIFIED. Football Outsiders (Aaron Schatz, 2004): the 14 backs with 370-389 carries in a season averaged a 27% drop in total yards and a 10% drop in YPC the following year; those with 390+ averaged 33% and 11% drops. Follow-up work reports all 28 historical 370-carry seasons showed next-year decline with 20 of 28 (71.4%) missing at least one game. The 1,500-1,800 career-touch wall is an industry claim without a comparable primary study.
- **Data:** season and career touch totals, computable from nflverse
- **Notes:** EVIDENCE DOWNGRADED from strong to moderate despite verifying the numbers, for two reasons the merged list did not surface. (1) Critics (Advanced NFL Stats and others) attribute much of the effect to regression to the mean plus age — a 370-carry season is by construction an outlier year, and outlier years are followed by worse years regardless of mechanism. (2) APPLICABILITY HAS COLLAPSED: 370-carry seasons are nearly extinct in the modern committee era, so the 370 threshold now fires almost never. The usable form of this factor for a 2026 engine is a continuous workload-stress term (season touches, career touches, consecutive high-workload seasons) rather than the historical 370 cliff. Compounds with, rather than substitutes for, the age curve.

<a id="rb-injury-type-recurrence-acl-hamstring"></a>
#### Injury-type recurrence (ACL, hamstring)

**Weekly 0% · Season 3%** · Health/Injury · stability: high · evidence: strong

- **Mechanism:** Same-body-part recurrence — not generalized fragility — predicts future missed time and multi-season production deficits.
- **Key numbers:** ACL: 25% re-injury rate versus 9% in controls, with large multi-season production deficits specifically for RB and WR; hamstring: 38.4% overall recurrence, 11.9% within the same season (peer-reviewed sports-medicine literature via factors.md Tier 2).
- **Data:** sports-medicine literature + hand-maintained injury-history log
- **Notes:** Must be applied ONLY as same-body-part recurrence. The generalized version of this idea is separately debunked below, and conflating them is the most common way this factor gets misused.

<a id="rb-age-x-injury-interaction"></a>
#### Age x injury interaction

**Weekly 0% · Season 1.2%** · Health/Injury · stability: low · evidence: estimated

- **Mechanism:** The same injury produces a larger and slower-recovering production deficit in a 30-year-old back than in a 24-year-old.
- **Key numbers:** No RB-specific published interaction effect located. General sports-medicine literature supports slower recovery with age, but it has not been quantified in fantasy points for this position.
- **Data:** injury history cross-tabulated with age
- **Notes:** Kept because it is mechanistically near-certain and because RB is the position where both marginal terms are already largest, but the interaction magnitude is entirely estimated. Risk of double-counting with the age-curve and recurrence rows — implement as a multiplicative interaction, not an additive third term.

<a id="rb-body-size-weight-as-workload-tolerance-prior"></a>
#### Body size / weight as workload-tolerance prior

**Weekly 0% · Season 1%** · Health/Injury · stability: high · evidence: moderate

- **Mechanism:** A body-composition durability prior distinct from age and from the debunked generalized injury-prone label: heavier, higher-BMI backs sustain workhorse workloads with fewer missed games.
- **Key numbers:** PFF 'How running back weight relates to workload': optimal weight band 213-221 lbs (research range 215-234) shows 11.1% higher representation among top-10 versus bottom-10 fantasy RB finishers; RBs with BMI under 28 miss more games.
- **Data:** combine/roster height-weight (nflverse) + PFF research citation
- **Notes:** Draft-time only — weight is fixed and carries no weekly information. The 11.1% representation gap is a population-level association that is heavily confounded with draft capital and role (teams give heavier backs the workhorse role in the first place), so it should not be stacked on top of role factors without shrinkage.

<a id="rb-turf-vs-grass-injury-risk"></a>
#### Turf vs grass (injury risk)

**Weekly 0% · Season 0.5%** · Weather/Venue · stability: low · evidence: weak

- **Mechanism:** Non-contact lower-body injury risk may differ by playing surface — a slow-accumulating season-long risk rather than a single-week production driver.
- **Key numbers:** OR 1.60 for season-ending surgery on turf in 2021-22 data, but near-parity in 2023 data — actively contested (factors.md Tier 3).
- **Data:** nflverse load_schedules() surface field + injury outcomes
- **Notes:** Contested evidence, tiny effect, and it applies to a player's home surface as a season-long exposure rather than to any single game. Weekly weight is 0 deliberately — there is no credible one-game production effect.

<a id="rb-bye-week"></a>
#### Bye week

**Weekly 0% · Season 0%** · Situational/Schedule · stability: n/a · evidence: strong

- **Mechanism:** Deterministic zero — the player does not play.
- **Key numbers:** Deterministic from the published schedule.
- **Data:** nflverse load_schedules()
- **Notes:** Implement as a HARD FILTER in the engine, never as a soft weight. Listed at 0/0 for category completeness only. Note it does affect season-long TOTAL points (16 games not 17) even though it does not affect points per game, which is what these weights are defined over.

<a id="rb-cold-weather-teams-produce-tougher-runners"></a>
#### Cold-weather teams produce tougher runners

**Weekly 0% · Season 0%** · Other · stability: n/a · evidence: strong

- **Mechanism:** Claimed: RBs on cold-weather teams are innately better runners independent of scheme or acclimation.
- **Key numbers:** Road YPC is essentially identical across cold-weather and warm-weather team origins (3.89-3.99). The real, well-documented effect is a home-acclimation interaction (cold-weather teams performing better specifically at home in the cold; home cold-weather-team YPC rises 4.05 to 4.30+ below freezing).
- **Data:** n/a — excluded
- **Notes:** DEBUNKED AS A TRAIT. The genuine acclimation interaction is small for rushing specifically and is not modeled as an RB factor here; the larger version of that effect (dome teams on the road in the cold) is a passing-game story.

<a id="rb-college-workload-college-carries-as-an-nfl-longevity-predictor"></a>
#### College workload / college carries as an NFL longevity predictor

**Weekly 0% · Season 0%** · Other · stability: n/a · evidence: strong

- **Mechanism:** Claimed: heavy college carry totals (300+ in a season, or high career totals) predict early NFL breakdown independent of NFL-side workload and age.
- **Key numbers:** Peer-reviewed finding of no correlation between college running-back carry volume and future injury risk or early-NFL performance (PMC, 'The Effect of the Number of Carries Among College Running Backs on Future Injury Risk and Performance in the National Football League').
- **Data:** n/a — excluded
- **Notes:** DEBUNKED — a valuable addition from the gap hunt. This myth is widely repeated by draft analysts and sits adjacent to the genuinely supported NFL-side cumulative-workload-wear row, creating a real risk that a builder folds college carries into that factor. Explicitly excluded so that mistake cannot be made silently. Only NFL-side workload counts.

<a id="rb-committee-independent-role-projection-vacated-opportunity-at-draft-time-see-vacated-touches"></a>
#### Committee-independent role projection: vacated opportunity at draft time — see Vacated touches

**Weekly 0% · Season 0%** · Other · stability: n/a · evidence: strong

- **Mechanism:** Placeholder removed; consolidated into the Vacated touches row above.
- **Key numbers:** n/a — merged
- **Data:** n/a
- **Notes:** DEDUPE ARTIFACT — retained only to make the merge explicit. All weight lives in the 'Vacated touches (in-season / offseason backfield redistribution)' row.

<a id="rb-contract-status-contract-year-extension-year"></a>
#### Contract status (contract year / extension year)

**Weekly 0% · Season 0%** · Other · stability: n/a · evidence: strong

- **Mechanism:** Claimed: playing for a new contract raises motivation and production.
- **Key numbers:** No statistically significant effect across a 12-year regression (Football Outsiders), replicated multiple times.
- **Data:** n/a — excluded
- **Notes:** DEBUNKED. Zero weight.

<a id="rb-fumble-propensity-as-a-repeatable-skill"></a>
#### Fumble propensity as a repeatable skill

**Weekly 0% · Season 0%** · Other · stability: n/a · evidence: strong

- **Mechanism:** Claimed: some backs are stably and projectably more fumble-prone.
- **Key numbers:** Fumble-RECOVERY YoY correlation is approximately zero to negative; fumble rate itself shows weak year-to-year stickiness.
- **Data:** n/a — excluded
- **Notes:** DEBUNKED AS A PROJECTABLE TRAIT. Model fumbles lost as game-level randomness at a league-average rate (worth -2 pts in this format). The genuinely real downstream consequence — getting benched after a fumble — is captured in the role-loss-shock row, which is a coaching-behavior factor rather than a skill factor.

<a id="rb-generalized-injury-prone-label"></a>
#### Generalized injury-prone label

**Weekly 0% · Season 0%** · Other · stability: n/a · evidence: strong

- **Mechanism:** Claimed: a player with multiple unrelated injuries across his career is innately fragile going forward.
- **Key numbers:** Only same-body-part recurrence is predictive; a general fragility label spanning unrelated injury types has no supporting evidence.
- **Data:** n/a — excluded
- **Notes:** DEBUNKED AS A GENERAL LABEL. The specific, valid version lives in the injury-type-recurrence row.

<a id="rb-hot-hand-efficiency-streaks"></a>
#### Hot hand (efficiency streaks)

**Weekly 0% · Season 0%** · Other · stability: n/a · evidence: strong

- **Mechanism:** Claimed: a back on a high-YPC or high-TD-rate streak is likelier to keep producing at that rate.
- **Key numbers:** Streaks concentrate in TD rate and YPC, the two most mean-reverting stats in football (YPC never stabilizes, ~1,978 carries required; receiving-TD YoY R2 0.03-0.08). Where a streak does persist, the real driver is a usage increase, which the opportunity rows already capture.
- **Data:** n/a — excluded
- **Notes:** DEBUNKED. Zero weight. The specific danger at RB is mistaking a genuine role expansion for a hot hand — the fix is to check whether weighted opportunity moved, not whether efficiency did.

<a id="rb-preseason-box-score-production"></a>
#### Preseason box-score production

**Weekly 0% · Season 0%** · Other · stability: n/a · evidence: strong

- **Mechanism:** Claimed: strong preseason rushing and receiving stats predict regular-season fantasy value.
- **Key numbers:** Meaningless. Preseason ADP predicts rest-of-season production about as well as a player's own first four regular-season games (r=0.599 vs 0.585), and preseason box scores add nothing on top.
- **Data:** n/a — excluded
- **Notes:** DEBUNKED FOR PRODUCTION ONLY. Preseason first-team SNAPS and role ARE informative and are captured under the committee-structure and snap-share rows. It is the box-score line specifically that carries no signal.

<a id="rb-primetime-spotlight-divisional-game-familiarity"></a>
#### Primetime spotlight & divisional-game familiarity

**Weekly 0% · Season 0%** · Situational/Schedule · stability: low · evidence: weak

- **Mechanism:** Claimed effects of primetime stage and divisional-rematch scouting familiarity on production.
- **Key numbers:** Primetime splits are single-source and confounded (low confidence); the divisional-familiarity / second-meeting effect is weak and weakening over time (factors.md Tier 3, which recommends skipping or near-zero weight).
- **Data:** nflverse load_schedules()
- **Notes:** ZEROED. The merged list carried this at 0.1 weekly; the project's own research says 'skip or near-zero weight,' and a 0.1 weight on a confounded single-source claim buys nothing but implementation surface. Excluded.

<a id="rb-revenge-games"></a>
#### Revenge games

**Weekly 0% · Season 0%** · Other · stability: n/a · evidence: strong

- **Mechanism:** Claimed: extra motivation facing a former team.
- **Key numbers:** 49.5% of 384 skill players beat their season average in revenge spots — a coin flip; QBs specifically at 35%, worse than baseline.
- **Data:** n/a — excluded
- **Notes:** DEBUNKED. Zero weight.

<a id="rb-simple-strength-of-schedule-season-long-funnel-defense-rankings"></a>
#### Simple strength-of-schedule / season-long funnel-defense rankings

**Weekly 0% · Season 0%** · Other · stability: n/a · evidence: strong

- **Mechanism:** Claimed: a defense's full-season fantasy-points-allowed-to-RB ranking reliably predicts future matchup difficulty.
- **Key numbers:** Defensive fantasy-points-allowed YoY correlation is only 0.16-0.27 leaguewide; top-5 units repeat as top-5 only 20-30% of the time.
- **Data:** n/a — excluded
- **Notes:** DEBUNKED AS A STANDALONE RANKING. Superseded by the heavily shrunk, opponent-adjusted matchup rows above. Season-long RB SOS in particular is close to worthless at draft time and is one of the most heavily marketed non-signals in the industry.

<a id="rb-trap-letdown-games"></a>
#### Trap / letdown games

**Weekly 0% · Season 0%** · Other · stability: n/a · evidence: strong

- **Mechanism:** Claimed: good teams underperform after a big win or ahead of a marquee opponent.
- **Key numbers:** Good teams actually won MORE often in trap spots (80.5% / 82.2% vs 79.5% baseline), not a statistically significant difference (Harvard, 2002-2011).
- **Data:** n/a — excluded
- **Notes:** DEBUNKED. Zero weight.


### WR — detail

<a id="wr-target-share-trailing-team-target-share"></a>
#### Target share (trailing team-target share)

**Weekly 11.5% · Season 11%** · Opportunity/Volume · stability: high · evidence: strong

- **Mechanism:** Directly gates reception and yardage volume — the single largest lever on WR half-PPR points.
- **Key numbers:** Target share YoY correlation ~0.70 (verified: Sharp Football Analysis 'WR Stats That Matter', Fantasy Classroom WR sticky-stats, SumerSports sticky-stats); raw targets ~0.95-correlated with WR PPR points (factors.md synthesis)
- **Data:** nflverse PBP (targets)
- **Notes:** Trimmed from 12.2/11.6 for half-PPR: a reception is 0.5 pt not 1.0, so raw target count carries slightly less of the scoring mass than PPR-derived studies imply; the difference was moved to air-yards share, RZ target share and aDOT (per-target yardage/TD channels). Still the dominant single factor at both horizons.

<a id="wr-vegas-implied-team-total-game-total-weekly"></a>
#### Vegas implied team total & game total (weekly)

**Weekly 5.8% · Season 0.4%** · Game Script/Vegas · stability: high · evidence: strong

- **Mechanism:** The most information-dense single pregame number for a team's expected scoring volume, which scales every pass-catcher's expected points.
- **Key numbers:** factors.md Tier 1: 'most information-dense single pregame number for scoring volume'; no isolated WR-level r published — the weight rests on the mechanism (implied points is the direct input to team TD/yardage supply) rather than a receiver-specific coefficient
- **Data:** nflverse schedules (closing lines)
- **Notes:** Evidence held at strong for the mechanism, but flagged: no source in this pass published a WR-specific correlation between implied total and half-PPR points. Small season weight retained because preseason schedule-implied totals exist at draft time (mostly subsumed by the win-total item).

<a id="wr-tprr-targets-per-route-run"></a>
#### TPRR (targets per route run)

**Weekly 5.2% · Season 5%** · Opportunity/Volume · stability: high · evidence: strong

- **Mechanism:** Normalizes target volume by actual route participation, isolating true target-earning rate from playing-time and personnel effects.
- **Key numbers:** VERIFIED: 0.65 YoY correlation, and prior-season TPRR has R²=0.36 to next-season targets — Fantasy Footballers TPRR Report (2023/2025 season previews); Fantasy Points Data ranks TPRR the most year-to-year-consistent of YPRR / Y/T / TPRR
- **Data:** nflverse FTN route charting (2022+) + PBP targets
- **Notes:** Partially redundant with target share (shared numerator) and with route participation (shared denominator) — it earns independent weight only as the residual 'target-earning rate at constant route volume'. Weight set below target share for that reason despite comparable YoY stickiness.

<a id="wr-route-participation-rate-routes-team-pass-plays-snap-share-as-fallback-proxy"></a>
#### Route participation rate (routes ÷ team pass plays; snap share as fallback proxy)

**Weekly 5.2% · Season 4.5%** · Opportunity/Volume · stability: medium · evidence: moderate

- **Mechanism:** Playing-time floor for accumulating targets; a WR who doesn't run routes can't be targeted regardless of talent. Snap share is the coarser backfill when route charting is unavailable.
- **Key numbers:** factors.md Tier 1: leading indicator of role change, industry consensus strong, but one direct same-season test found weak correlation — 'use as alert, not score'. No clean published r located this pass.
- **Data:** nflverse FTN charting (2022+) + nflverse snap counts (2012+)
- **Notes:** MERGED: absorbed the separate 'Snap share' item. Snap share is strictly a noisier proxy for the same construct (it includes run plays, which generate no targets) and carries no distinct information once routes are available — keeping both would double-count playing time. Pre-2022 backtests fall back to snap share.

<a id="wr-air-yards-share-team-share-of-air-yards"></a>
#### Air yards share (team share of air yards)

**Weekly 4.5% · Season 4.6%** · Opportunity/Volume · stability: high · evidence: strong

- **Mechanism:** Captures downfield role/ceiling independent of target count — a deep-role WR banks more yardage and TD equity per target.
- **Key numbers:** >0.70 YoY stability; one of the three canonical sticky WR stats alongside target share and WOPR (verified: Sharp Football Analysis, Fantasy Classroom WR sticky stats, SumerSports)
- **Data:** nflverse/FTN air yards charting
- **Notes:** Raised from 4.2/4.8→4.5/4.6 on the half-PPR adjustment: with receptions at 0.5 pt, the yardage/TD channel this metric proxies is worth relatively more against raw catch volume than in full PPR.

<a id="wr-red-zone-end-zone-target-share-player-level"></a>
#### Red-zone / end-zone target share (player-level)

**Weekly 4.5% · Season 3.8%** · Opportunity/Volume · stability: medium · evidence: moderate

- **Mechanism:** TD probability per target rises sharply inside the 10/5; a WR's personal share of these looks is a first-order TD-opportunity driver even though conversion itself regresses.
- **Key numbers:** Team-level RZ trip rate is sticky (r≈0.65 with offense quality); player RZ conversion is noise (YoY 0.01-0.24) — factors.md Tier 2, so the *share of trips* is the signal, not the conversion. No standalone published YoY r for player-level RZ target share located this pass.
- **Data:** nflverse PBP (red-zone/end-zone target subsets)
- **Notes:** Raised on the half-PPR adjustment (a 6-pt TD is a larger share of the total in half-PPR than in full PPR). Evidence quality held at moderate, not strong: the r≈0.65 figure is for team trip rate, not for player RZ target share, which is the quantity actually being weighted.

<a id="wr-injury-designation-play-probability"></a>
#### Injury designation / play probability

**Weekly 4.3% · Season 0%** · Health/Injury · stability: high · evidence: strong

- **Mechanism:** Pregame injury tags translate directly into the probability a player suits up and plays a full workload — the largest single discrete weekly re-rate.
- **Key numbers:** VERIFIED with a caveat: the ~71% figure is specifically Questionable players who had LIMITED practice participation (Football Outsiders 'Questionable Behavior'); ESPN's broader cut puts all-Questionable at ~75%. Doubtful play rates vary by study (WSJ 2006-11: <3%; ~6-7% in later cuts).
- **Data:** nflverse official injury reports
- **Notes:** CORRECTED: the headline 71% is conditional on practice participation, not the unconditional Questionable play rate — which is exactly why the practice-trajectory factor below is a separate, necessary input rather than a refinement. Doubtful should be modeled ~3-6%, not a point estimate.

<a id="wr-vegas-spread-game-script"></a>
#### Vegas spread / game script

**Weekly 3.4% · Season 0%** · Game Script/Vegas · stability: high · evidence: strong

- **Mechanism:** Trailing teams pass more and take more shots downfield late; leading teams run more, suppressing pass-catcher volume in the back half of games.
- **Key numbers:** VERIFIED (revised): pass rate ~49% leading / ~66% trailing (Football Perspective, Fantasy Points 'How Game Script Affects Fantasy'); the ~56% tied figure was not independently confirmed this pass. Game script explains ~20% of a team's raw run/pass ratio; the effect intensifies each quarter, peaking in Q4.
- **Data:** nflverse schedules (closing spread) + PBP
- **Notes:** Leading-side number corrected 50%→49%; tied-state 56% carried forward as unverified interpolation. Directionally this is a smaller WR factor than an RB factor — trailing script helps WRs but the biggest game-script swing in the literature is RB target share (29%→52%), not WR volume.

<a id="wr-qb-quality-arm-talent-incl-catchable-target-rate-mechanism"></a>
#### QB quality / arm talent (incl. catchable-target-rate mechanism)

**Weekly 3.3% · Season 4%** · Team Environment · stability: medium · evidence: moderate

- **Mechanism:** A good QB raises every pass-catcher's per-target value and the team's willingness to throw downfield; the proximate channel is how often the ball is actually catchable, which is a QB property, not a receiver skill.
- **Key numbers:** CTR YoY stability only 0.28-0.29 but explains large WR over/under-performance across QB changes (e.g., 78% CTR with an accurate QB vs 58% without — factors.md/PFF). No standalone team-level r to WR fantasy points located this pass.
- **Data:** nflverse (CPOE, EPA/play by passer) + PFF catchable-target charting
- **Notes:** MERGED per flagged correction: 'QB quality / arm talent' and 'Catchable target rate / QB-accuracy interaction' were the same construct measured at two timescales, and summing them (2.5+1.7 weekly, 2.9+1.5 season) double-counted. Combined weight is deliberately set BELOW the naive sum. Per factors.md, use CTR as a re-rate trigger on QB change, not as a static per-player multiplier.

<a id="wr-player-specific-vegas-prop-markets-receiving-yards-o-u-receptions-o-u-anytime-td-odds"></a>
#### Player-specific Vegas prop markets (receiving yards O/U, receptions O/U, anytime-TD odds)

**Weekly 2.6% · Season 0.6%** · Market/Consensus · stability: low · evidence: estimated

- **Mechanism:** Sportsbook lines on an individual player's weekly receiving yards, receptions, and TD odds are a money-backed, same-week point estimate of the exact quantity being projected — sharper and more current than season-long ADP/ECR.
- **Key numbers:** No peer-reviewed or industry r/R² to fantasy points located. Trade-press practice (FantasyAlarm, legalsportsbetting.com 2026) converts prop lines directly into projections; the supporting evidence is the general closing-line-efficiency literature, not a receiver-specific study. ESTIMATED.
- **Data:** paid/unavailable free — requires a player-prop odds feed (DraftKings/FanDuel/The Odds API player-props tier); PLAN.md's Odds API entry covers only team-level spread/total
- **Notes:** DOWNGRADED from 4.0 weekly. Two reasons: (a) no published effect size, so it cannot outweigh verified-r factors; (b) props are heavily redundant with what the rest of this model already contains — they embed implied total, matchup, injury news and role. Its honest independent contribution is marginal-information-over-the-model, not the full predictive power of the line. Mechanism is genuinely large, which is why it stays this high despite an 'estimated' flag.

<a id="wr-practice-participation-trajectory-post-return-snap-ramp"></a>
#### Practice participation trajectory & post-return snap ramp

**Weekly 2.5% · Season 0%** · Health/Injury · stability: medium · evidence: moderate

- **Mechanism:** The DNP→limited→full progression across the week, and the snap-count climb in the games immediately after a return, predict effective workload better than a single Friday designation.
- **Key numbers:** Indirectly VERIFIED by the injury-designation source itself: Football Outsiders' 71% play rate is conditioned on limited practice participation, proving practice status carries information beyond the designation tag. No published stability figure for the trajectory as a feature. ESTIMATED magnitude.
- **Data:** nflverse daily practice reports (in-season)
- **Notes:** UPGRADED from 'estimated' to 'moderate': the verification pass showed the headline designation study is itself practice-conditioned, which is direct evidence this factor is non-redundant with the designation tag rather than merely plausible.

<a id="wr-in-season-target-redistribution-teammate-ruled-out-and-role-compression-on-their-return"></a>
#### In-season target redistribution (teammate ruled out, and role compression on their return)

**Weekly 2.4% · Season 0%** · Opportunity/Volume · stability: n/a · evidence: estimated

- **Mechanism:** When a WR1/WR2 is ruled out, historical redistribution patterns predict which remaining players absorb the vacated share (rather than an even split); symmetrically, when that teammate returns, the beneficiary's usage compresses back toward its pre-injury baseline rather than persisting.
- **Key numbers:** No published effect size. PLAN.md specifies 'teammate-out target/carry redistribution using historical vacated-share patterns'; the reversion side has no separate literature but is the mechanical mirror using the same dataset. ESTIMATED.
- **Data:** nflverse targets + injury reports + snap/route tables (event-driven)
- **Notes:** MERGED: absorbed the separate 'Target/role compression on a teammate's return from injury' item. Same mechanism, same historical-redistribution table, opposite sign — modeling them as two factors would let the engine learn asymmetric priors it has no data to support. The engine must not treat a returning starter's first weeks as a fresh baseline for the backup.

<a id="wr-td-rate-red-zone-conversion-regression-flag-incl-td-dependence"></a>
#### TD rate / red-zone conversion regression flag (incl. TD-dependence)

**Weekly 2.2% · Season 2.6%** · Efficiency/Talent · stability: low · evidence: strong

- **Mechanism:** Receiving TDs are the highest-variance component of a WR's line; extreme conversion rates predict regression toward the mean in both directions, and heavy TD-dependence signals a lower, more volatile weekly floor.
- **Key numbers:** Raw receiving-TD YoY R²=0.03-0.08; xTD stickiness 0.38 vs 0.28 raw; historical extreme-conversion regression flags hit 90.7% (137/151); player RZ conversion ≥40% regressed down 92% of the time, <12% regressed up 92% (factors.md Tier 1/2)
- **Data:** nflverse PBP (xTD models)
- **Notes:** Evidence is strong for the REGRESSION, not for the TDs. Weight is the value of correcting a prior-year-TD-inflated baseline, and it is slightly higher in half-PPR than full PPR because TDs are a larger share of the scoring total when receptions are worth 0.5.

<a id="wr-target-concentration-team-target-tree-rank"></a>
#### Target concentration / team target-tree rank

**Weekly 2% · Season 2.5%** · Opportunity/Volume · stability: medium · evidence: moderate

- **Mechanism:** A team's WR1 vs WR2/3 hierarchy determines how much of the team's total pass volume flows to this specific player, and how exposed that share is to a scheme or personnel shift.
- **Key numbers:** PFF WR-utilization and personnel-grouping research (factors.md: heavier personnel concentrates targets on WR1/TE and shrinks the WR3/flex pool; 11-personnel 63%→58% league-wide 2023-25). No standalone r for tree rank.
- **Data:** nflverse targets + depth charts
- **Notes:** Substantially collinear with target share — it earns weight as the *structural* prior (how durable is this share) rather than as an additional level estimate. Keep the two from being summed as independent evidence of the same usage.

<a id="wr-adot-route-depth-role-incl-schemed-short-game-touch-share"></a>
#### aDOT / route-depth role (incl. schemed short-game touch share)

**Weekly 2% · Season 1.4%** · Opportunity/Volume · stability: medium · evidence: moderate

- **Mechanism:** Sets the per-catch yardage ceiling and the week-to-week variance profile. The low end of the distribution includes scheme-manufactured bubble screens and behind-LOS quick game, which bank a near-guaranteed 0.5 pt in half-PPR without the receiver having to win a route.
- **Key numbers:** PFF/FTN aDOT tracking is a standard industry input; no WR-specific stability r located this pass. Role classification (possession vs deep threat) is used throughout industry projection models. ESTIMATED magnitude.
- **Data:** nflverse/FTN air yards charting (negative/near-zero air-yards targets isolate the screen game)
- **Notes:** MERGED: absorbed 'Manufactured/schemed short-passing touches (bubble/WR screens)', which its own author flagged as likely subsumed by aDOT — it is the left tail of the same distribution. Raised from 1.7/1.2 for the half-PPR translation: aDOT is the primary lever that separates possession-slot volume value (discounted at 0.5/reception) from per-target yardage/TD value (undiscounted), and this list previously had no factor carrying that adjustment.

<a id="wr-opponent-pass-defense-epa-points-allowed-to-wrs-heavily-regressed"></a>
#### Opponent pass defense EPA / points allowed to WRs (heavily regressed)

**Weekly 2% · Season 0.8%** · Matchup/Opponent · stability: low · evidence: moderate

- **Mechanism:** Facing a genuinely bad pass defense modestly raises expected production, but naive points-allowed-by-position rankings are mostly noise and must be shrunk hard toward league average.
- **Key numbers:** Positional fantasy-points-allowed YoY correlation only 0.16-0.27; top-5 units repeat only 20-30% of the time (factors.md debunk of simple SOS). Only the current-season, regressed EPA-split version carries any real weight.
- **Data:** nflverse PBP (defensive EPA splits)
- **Notes:** Small season weight retained only for schedule-strength tilt at draft time, which the same YoY-0.16-0.27 finding says is near-worthless — keep it near the floor and never surface it as a headline draft reason.

<a id="wr-opponent-coverage-scheme-man-zone-mix-two-high-shell-rate-pass-rush-pressure"></a>
#### Opponent coverage scheme: man/zone mix, two-high shell rate & pass-rush pressure

**Weekly 2% · Season 0.5%** · Matchup/Opponent · stability: medium · evidence: moderate

- **Mechanism:** Man vs zone tendency changes which route types come open; two-high safety shells structurally suppress deep/explosive passing, compressing a high-aDOT WR's ceiling; pressure rate indirectly suppresses downfield accuracy and shot volume.
- **Key numbers:** League-wide two-high rate on pass plays rose 44% (2019) → 63% (2024), and the share of passes traveling 20+ air yards against two-high fell 11.6% (2020) → 9% (2024) — NFL Football Operations analytics. Man/zone and pressure charting are standard industry inputs with no consolidated WR fantasy effect size.
- **Data:** NGS / PFF pre-snap shell + coverage charting (not in base nflverse); man-zone proxies computable from FTN
- **Notes:** MERGED: absorbed the separate 'Two-high safety shell rate' item. Shell rate IS a coverage-scheme tendency and correlates strongly with a defense's man/zone profile — separate line items would double-count the same pre-snap structure. Interacts with aDOT: the two-high penalty lands almost entirely on deep-role WRs.

<a id="wr-team-pace-plays-game-incl-no-huddle-hurry-up-rate"></a>
#### Team pace (plays/game, incl. no-huddle/hurry-up rate)

**Weekly 1.9% · Season 2.5%** · Team Environment · stability: medium · evidence: strong

- **Mechanism:** More offensive snaps directly scales every downstream opportunity metric for every player on the offense.
- **Key numbers:** Pace YoY r=0.43-0.47 when QB or HC is retained, dropping to 0.31-0.39 on a continuity break (factors.md Tier 1)
- **Data:** nflverse PBP (plays/game)
- **Notes:** Must be conditioned on QB/HC continuity — using the unconditional prior on a team that changed either overstates stability by ~0.1 r.

<a id="wr-proe-pass-rate-over-expected"></a>
#### PROE (pass rate over expected)

**Weekly 1.8% · Season 2%** · Team Environment · stability: medium · evidence: strong

- **Mechanism:** Measures a team's pass-heaviness beyond what game state alone predicts, scaling the pass-catcher pool's share of the offense.
- **Key numbers:** ~24-pt spread in neutral-script pass probability between extreme teams; early-season PROE R² to full-season = 0.32, adjusted-pace R² = 0.47 (factors.md Tier 1)
- **Data:** nflverse PBP (xpass models)

<a id="wr-play-through-performance-penalty-by-injury-type"></a>
#### Play-through performance penalty (by injury type)

**Weekly 1.8% · Season 0.4%** · Health/Injury · stability: high · evidence: strong

- **Mechanism:** A WR who plays through a designation still suffers a measurable production hit relative to full health, and the size varies sharply by injury location.
- **Key numbers:** VERIFIED and CORRECTED (4for4 'How Injury Affects Weekly NFL Player Performance'): WR overall −9.9%; by type — toe −35.0%, foot −19.8%, ankle −11.8%, hamstring −8.0%, knee −4.9%. WR carries the largest positional penalty (RB −8.7%, TE −8.5%, QB +2.3%).
- **Data:** nflverse injury reports + PBP outcomes
- **Notes:** CORRECTED: the prior entry said 'foot −20% to −25%'. The source reports foot at −19.8%; the −25%+ tier belongs to TOE (−35.0%), a distinct designation. Toe is the single worst WR injury tag in the data and deserves its own flag.

<a id="wr-wind"></a>
#### Wind

**Weekly 1.8% · Season 0%** · Weather/Venue · stability: high · evidence: strong

- **Mechanism:** High wind degrades downfield passing accuracy and completion percentage, disproportionately hurting deep-aDOT WRs.
- **Key numbers:** Completion % 60.3→54.7 above 20 mph; deep-pass rate −6% relative; ~15 mph onset threshold; crosswinds worst (factors.md Tier 2 — the best-evidenced weather factor)
- **Data:** Open-Meteo forecast at stadium
- **Notes:** Should be applied as an interaction with aDOT, not a flat team penalty — the completion/deep-rate effect concentrates on vertical receivers and barely touches a screen-and-slant slot role.

<a id="wr-shadow-coverage-cb1-travels-with-the-wr"></a>
#### Shadow coverage (CB1 travels with the WR)

**Weekly 1.6% · Season 0%** · Matchup/Opponent · stability: medium · evidence: strong

- **Mechanism:** An elite CB assigned to travel with a specific WR suppresses that player's target quality and catch rate for the game, with the effect concentrated at intermediate route depths.
- **Key numbers:** VERIFIED (PFF, 'The impact of shadow coverage on receivers' fantasy production'): receivers with aDOT 12-15 yards lose at least 2 fantasy points when shadowed; receivers with aDOT below 12 or above 15 lose ~0.5 points or less.
- **Data:** PFF premium charting (paid); shadow assignments partially inferable from NGS/FTN alignment data
- **Notes:** One of the few WR matchup factors with a clean published points delta. Strictly conditional — it applies to a minority of player-weeks and is near-zero for most aDOT profiles, which is why a 2-point effect earns only 1.6% of weekly variance share.

<a id="wr-ecr-dfs-salary-weekly-consensus-proxies"></a>
#### ECR / DFS salary (weekly consensus proxies)

**Weekly 1.5% · Season 1.6%** · Market/Consensus · stability: medium · evidence: estimated

- **Mechanism:** FantasyPros expert consensus and DFS pricing fold in matchup, injury and role information that may not be fully captured elsewhere, serving as a market-efficiency sanity check.
- **Key numbers:** PLAN.md uses FantasyPros ECR as the project's own eval baseline; DFS salary is a standard weekly crowd-sourced value proxy. No independent predictive-power figure isolated for either as a model INPUT. ESTIMATED.
- **Data:** nflverse ECR mirror (load_ff_rankings) / DFS site APIs
- **Notes:** CIRCULARITY WARNING retained and sharpened: ECR is PLAN.md's evaluation benchmark. Feeding it in as an input guarantees the backtest reports a smaller gap to ECR than the model has actually earned. Recommend building the primary model without it and admitting it only if an ECR-free ablation shows genuine lift.

<a id="wr-slot-vs-perimeter-alignment-rate"></a>
#### Slot vs perimeter alignment rate

**Weekly 1.5% · Season 1.3%** · Efficiency/Talent · stability: medium · evidence: moderate

- **Mechanism:** Alignment does not add targets — it changes the conversion quality of targets already earned. Slot alignment faces lighter nickel coverage and shorter throws, raising catch rate while lowering aDOT.
- **Key numbers:** Slot targets worth ~11.5% more fantasy production per target than perimeter targets (Razzball/PFF WR utilization); individual variance is large (one WR ranked 63rd on perimeter and 12th in slot on a per-target basis). Not independently re-verified this pass — treat the 11.5% as single-source.
- **Data:** PFF/FTN alignment charting
- **Notes:** RECLASSIFIED per flagged correction: moved from Opportunity/Volume to Efficiency/Talent. Its own stated mechanism is a per-target conversion effect, and leaving it in the volume category invited the engine to treat it as an additive source of targets. Half-PPR caveat: the +11.5% per-target slot premium is partly a catch-rate premium, which is worth less in half-PPR than in the full-PPR framing the figure was likely computed under — apply it discounted.

<a id="wr-wopr-composite-1-5-tgtshare-0-7-airydsshare"></a>
#### WOPR composite (1.5×TgtShare + 0.7×AirYdsShare)

**Weekly 1.5% · Season 1.3%** · Opportunity/Volume · stability: high · evidence: strong

- **Mechanism:** Single-number blend of volume and downfield role; best-known combined opportunity index for fantasy points.
- **Key numbers:** Created by Josh Hermsmeyer (FiveThirtyEight/nflfastR); >0.70 YoY, cited across industry as the cleanest one-number opportunity index (Sharp Football Analysis, Fantasy Classroom, PlayerProfiler), elite threshold ~70.0
- **Data:** nflverse (derived from targets + air yards)
- **Notes:** REDUNDANCY-CAPPED. WOPR is a fixed linear combination of two factors already weighted above it — its raw evidence (>0.70 YoY) would justify a top-3 weight, and the low weight here is purely the redundancy exemption to the monotone-with-evidence rule. The engine must use EITHER WOPR OR (target share + air-yards share), never sum all three. Its residual value is the specific 1.5/0.7 weighting, which is empirically tuned and better than the model would find unaided.

<a id="wr-xfp-composite-expected-fantasy-points-from-opportunity"></a>
#### xFP composite (expected fantasy points from opportunity)

**Weekly 1.5% · Season 1.3%** · Opportunity/Volume · stability: high · evidence: moderate

- **Mechanism:** Converts volume + depth + scoring-context inputs into a single points-space number, stripping out TD/efficiency luck.
- **Key numbers:** Standard PFF/4for4 xFP methodology; factors.md lists expected fantasy points alongside target share/WOPR as a Tier-1 opportunity metric. No independent r beyond its inputs.
- **Data:** nflverse (derived)
- **Notes:** REDUNDANCY-CAPPED for the same reason as WOPR — it is a function of target share, aDOT and field position, all weighted separately. Its distinct contribution is the half-PPR points-space conversion itself (the layer where the 0.5/reception discount is actually applied), which is why it is retained rather than dropped.

<a id="wr-yprr-yards-per-route-run"></a>
#### YPRR (yards per route run)

**Weekly 1.4% · Season 2.8%** · Efficiency/Talent · stability: medium · evidence: moderate

- **Mechanism:** PFF's headline receiver efficiency stat, blending target rate and per-target production into a rate independent of raw playing time.
- **Key numbers:** Industry-standard PFF metric; SumerSports 'Revisiting Yards Per Route Run' flags that YPRR is more volume-influenced than a separable skill measure. Fantasy Points Data ranks it LESS year-to-year consistent than TPRR. Treated as moderately sticky, not a clean talent isolate.
- **Data:** PFF premium charting (paid) / approximable from nflverse routes + receiving yards
- **Notes:** Heavily overlapping with TPRR (shared denominator) and target share. Weighted higher at season than weekly because at draft time it is one of the few available talent-and-role composites, whereas in-week the trailing usage inputs it decomposes into are directly observable.

<a id="wr-offensive-scheme-profile-personnel-groupings-play-action-rate-pre-snap-motion-passing-concept-identity"></a>
#### Offensive scheme profile (personnel groupings, play-action rate, pre-snap motion, passing-concept identity)

**Weekly 1.4% · Season 2%** · Coaching/Scheme · stability: medium · evidence: moderate

- **Mechanism:** Heavier personnel (12/13) concentrates targets on WR1/TE and shrinks the WR3/flex pool; play-action and pre-snap motion create structural advantages that raise offensive efficiency and pass-catcher separation; timing/quick-game system identity raises completion rate and YAC opportunity across the receiver room.
- **Key numbers:** 11-personnel usage drifted 63%→58% league-wide 2023-25, concentrating targets (factors.md). Motion: team EPA/play −0.042 without motion vs +0.002 with motion (PFF, 2025 season); Buffalo 80% motion rate, Miami 83.5%. Concept-identity effect qualitatively established but unquantified for fantasy points.
- **Data:** nflverse personnel/FTN charting; NGS motion classification; hand-maintained scheme tags
- **Notes:** MERGED three items: 'Personnel groupings & play-action rate', 'Pre-snap motion usage rate', and 'Offensive passing-concept scheme identity'. These are near-collinear expressions of one team's offensive identity (PFF itself groups them for 2026 fantasy analysis), and the concept-identity item's own author flagged high double-count risk with the other two. Note the motion EPA figure is team-level; the player-level fantasy attribution is not published.

<a id="wr-target-concentration-volatility-boom-bust-role-profile"></a>
#### Target-concentration volatility / boom-bust role profile

**Weekly 1.4% · Season 0.5%** · Variance Driver · stability: low · evidence: estimated

- **Mechanism:** Beyond the level of target concentration, deep-aDOT and TD-dependent roles carry inherently higher week-to-week variance than possession WR1 roles, which matters for floor/ceiling projection even at equal mean expected points.
- **Key numbers:** No published variance-decomposition figure located. Directionally well-established in industry floor/ceiling WR-archetype writing (4for4/RotoViz). ESTIMATED — an uncertainty-widening input, not a point-estimate shifter.
- **Data:** nflverse (derived: target share × aDOT dispersion)
- **Notes:** This factor's weight does NOT move the point projection — it belongs to the quantile/interval models in PLAN.md Milestone 5. Scoring it against a mean-squared-error backtest will make it look worthless; it must be evaluated on interval calibration instead.

<a id="wr-pass-funnel-effect-opponent-run-defense-strength-inducing-pass-heavier-game-plans"></a>
#### Pass-funnel effect (opponent run-defense strength inducing pass-heavier game plans)

**Weekly 1.2% · Season 0.3%** · Matchup/Opponent · stability: medium · evidence: weak

- **Mechanism:** A defense that stops the run but is exploitable through the air induces the opposing offense to game-plan pass-heavier in neutral script, raising the target pool for every pass-catcher — a play-calling/volume effect distinct from opponent pass-defense efficiency.
- **Key numbers:** PFF's recurring 'Pass/Run Funnel Report' operationalizes this as run-D EPA/play vs pass-D EPA/play. No consolidated fantasy-points effect size located. Tension with factors.md, which lists 'funnel defense season rankings' as DEBUNKED (defensive positional-points-allowed YoY 0.16-0.27).
- **Data:** nflverse PBP EPA splits by defense (computable, free)
- **Notes:** DOWNGRADED from 2.5 weekly and from 'moderate' to 'weak'. The submitted entry did not reconcile with factors.md's explicit debunk of funnel-defense rankings. The defensible residual is the CURRENT-SEASON, within-year run-D-vs-pass-D EPA split; the cross-season funnel label is not supportable. Must be shrunk hard and never used at draft time.

<a id="wr-opponent-defensive-injuries-secondary-starters-out"></a>
#### Opponent defensive injuries (secondary starters out)

**Weekly 1.2% · Season 0%** · Matchup/Opponent · stability: n/a · evidence: estimated

- **Mechanism:** A missing starting CB/S materially softens a pass defense mid-week — the mirror of the offensive-injury effect on the other side of the ball.
- **Key numbers:** No WR-specific published effect size located. Mechanism well-established (backup CB downgrade) and it is the same logical structure as the shadow-coverage finding in reverse. ESTIMATED.
- **Data:** nflverse injury reports + depth charts
- **Notes:** Highest-value estimated matchup factor: it is cheap (data already ingested for the offensive injury layer) and it is the specific case where regressed team-level pass-defense EPA is most stale — the unit being projected is not the unit that will play.

<a id="wr-separation-route-winning-skill-incl-press-release-win-rate"></a>
#### Separation / route-winning skill (incl. press-release win rate)

**Weekly 1% · Season 1.2%** · Efficiency/Talent · stability: medium · evidence: estimated

- **Mechanism:** Route-running, burst, and the ability to beat a physical jam within five yards create throwing windows; a talent signal less contaminated by scheme and QB than raw production.
- **Key numbers:** ESPN Receiver Tracking Metrics 'Open Score' and PFF 'Press Percentage' (2024 rollout, per-player press vs non-press grade splits) both exist as tracked metrics, but NEITHER publishes a YoY stability figure or an r to fantasy points. ESTIMATED, moderate persistence assumed as an athletic/technical skill.
- **Data:** ESPN Receiver Tracking (unofficial) / PFF Press Percentage (paid) — no free nflverse equivalent
- **Notes:** MERGED: absorbed 'Press-coverage release win rate', which is a sub-skill of the same separation construct measured in the first five yards. Both were estimated with no published fantasy coefficient, so splitting them created the appearance of two independent talent signals where there is one unmeasured one.

<a id="wr-pass-protection-ol-quality-in-season-ol-availability"></a>
#### Pass protection: OL quality + in-season OL availability

**Weekly 1% · Season 0.9%** · Team Environment · stability: medium · evidence: weak

- **Mechanism:** Better protection sustains more dropbacks and gives downfield routes time to develop. The effect on WRs is indirect (via sack rate, time-to-throw, and play volume), not direct as OL run-blocking is for RB. A starting OT/interior injury forcing a backup is the discrete in-season version of the same construct.
- **Key numbers:** OL quality explains only ~14% of QB fantasy variance and effectively zero of RB receiving (factors.md) — the WR effect is smaller still. In-season event: no published WR-fantasy effect size; corroborated only directionally (pressure rate spiking above 45% after multiple OL losses; sportsbooks lowering team totals on a starting-tackle absence).
- **Data:** nflverse snap counts + depth charts (backup-vs-starter OL snaps) + PFF pass-block grades
- **Notes:** MERGED 'OL pass-protection quality' (static tier) with 'In-season OL injury / backup OL starts' (event). Both measure protection quality at different timescales — same construct, and the audit's request for in-season OL availability is satisfied by making the backup-start event the dynamic input to this single factor rather than a second additive one. The combined weight stays low because the published OL→pass-game effect is genuinely small.

<a id="wr-oc-play-caller-change-incl-scheme-stickiness-prior"></a>
#### OC / play-caller change (incl. scheme-stickiness prior)

**Weekly 0.8% · Season 2%** · Coaching/Scheme · stability: low · evidence: weak

- **Mechanism:** A new play-caller can shift pass/run mix, target distribution philosophy, and scheme fit for existing personnel — but the direction is not predictable in advance.
- **Key numbers:** No rigorous quantitative study exists — an explicit industry gap named in factors.md. 21/32 teams changed OC entering 2026. Scheme 'stickiness' across coaching trees is weak (McDaniels: top-8 with Belichick, 22nd-place average elsewhere).
- **Data:** hand-maintained coach/play-caller table
- **Notes:** Per factors.md, this must widen projection intervals rather than shift the point estimate. Season weight is meaningfully higher than weekly because at draft time a new OC is one of the few known facts about how a role will change, whereas by midseason the observed usage supersedes the prior entirely.

<a id="wr-red-zone-play-calling-tendency-pass-heavy-vs-run-heavy"></a>
#### Red-zone play-calling tendency (pass-heavy vs run-heavy)

**Weekly 0.8% · Season 1%** · Coaching/Scheme · stability: medium · evidence: estimated

- **Mechanism:** Some coaches lean pass-heavy inside the 20 (favoring WR/TE TD share), others lean on the run near the goal line (favoring RB), shifting WR TD equity at constant team RZ volume.
- **Key numbers:** Downstream of team-level RZ trip-rate stickiness (r≈0.65); the pass/run mix inside the RZ is coach-specific and hand-tracked, with no published r for the split itself. ESTIMATED.
- **Data:** nflverse PBP (red-zone play type) + hand-maintained coach table

<a id="wr-in-season-trade-offseason-team-change-new-system-adjustment"></a>
#### In-season trade / offseason team change (new-system adjustment)

**Weekly 0.8% · Season 0.9%** · Team Environment · stability: low · evidence: weak

- **Mechanism:** A WR moving to a new offense faces an unfamiliarity tax — new route tree, new QB timing, no shared offseason reps — that can suppress role and efficiency for several weeks independent of the depth-chart projection for the new team.
- **Key numbers:** PFF midseason-trade study: 10 traded players averaged 62.31 cumulative points pre-trade vs 73.61 post-trade — net positive on average but n=10 and strongly bimodal (Kenyan Drake's role rose sharply; Golden Tate collapsed 16.8→7.8 PPG). No stable average effect; direction genuinely uncertain per player.
- **Data:** hand-maintained trade/signing event log + nflverse roster-transaction tables
- **Notes:** DOWNGRADED from 2.0 weekly. n=10 with a bimodal, sign-ambiguous result cannot support a 2% variance share. Like the OC-change and backup-QB items, this is an uncertainty widener, not a point adjustment — and note the study's mean is POSITIVE, so any engine applying a reflexive 'new team = downgrade' penalty is coded against the evidence.

<a id="wr-yac-over-expected-yacoe-incl-broken-tackle-rate"></a>
#### YAC over expected (YACOE, incl. broken-tackle rate)

**Weekly 0.8% · Season 0.7%** · Efficiency/Talent · stability: low · evidence: weak

- **Mechanism:** Isolates after-catch playmaking from the opportunity (target depth, defender leverage) that produces raw YAC.
- **Key numbers:** Raw WR YAC takes ~31 games / ~163 targets to stabilize (Intentional Rounding); YACOE is flagged as one of the less reliable 'over-expected' metrics relative to CPOE (nfelo). Very slow-stabilizing, low-signal.
- **Data:** NGS/ESPN receiver tracking
- **Notes:** ~163 targets to stabilize means a full season of WR1 volume barely produces one reliable observation — this cannot function as a weekly input in any meaningful sense and is close to a season-long tiebreaker only.

<a id="wr-dome-vs-outdoor"></a>
#### Dome vs outdoor

**Weekly 0.8% · Season 0.3%** · Weather/Venue · stability: high · evidence: strong

- **Mechanism:** Controlled conditions raise passing efficiency and scoring across the board.
- **Key numbers:** +9% combined scoring indoors (46.2 vs 42.4 pts/gm); completion 61.1% vs 58.8% (factors.md Tier 2)
- **Data:** nflverse schedules (roof type)
- **Notes:** Small season weight retained because a WR's home venue is known at draft time and applies to half his games.

<a id="wr-cold-temperature-incl-dome-team-on-the-road-interaction"></a>
#### Cold temperature (incl. dome-team-on-the-road interaction)

**Weekly 0.8% · Season 0%** · Weather/Venue · stability: medium · evidence: strong

- **Mechanism:** Cold degrades ball handling and route precision, and the effect is acclimation-driven: dome-based teams traveling to cold road games suffer most.
- **Key numbers:** Dome teams 0-8 on the road at ≤20°F, 3-23 at ≤30°F (factors.md Tier 2). Directionally stable but from a dated study; the mechanism is acclimation, not pure physics — factors.md separately DEBUNKS the 'cold-weather teams are tougher' framing (road YPC identical, 3.89-3.99, across climate origins).
- **Data:** Open-Meteo forecast at stadium
- **Notes:** Only apply the penalty as the dome-team × cold-road interaction. A flat cold penalty on all teams is the version the source data does not support.

<a id="wr-opponent-slot-nickel-defender-quality"></a>
#### Opponent slot / nickel-defender quality

**Weekly 0.6% · Season 0%** · Matchup/Opponent · stability: medium · evidence: moderate

- **Mechanism:** A team's dedicated slot corner is often a different and weaker player than its boundary CB1, so a slot-heavy WR's matchup quality depends on nickel grade, not on team pass-defense EPA or the CB1 shadow assignment.
- **Key numbers:** PFF's WR vs CB Matchup Chart explicitly separates 'Primary Slot Receiver vs Primary Slot Corner' from boundary L/R lanes, tracking targets-per-route and fantasy-points-per-route per lane — confirming this is a distinct, professionally used signal. No public r/R²; paywalled tool.
- **Data:** PFF matchup chart (paid), or hand-derived from PBP alignment + FTN coverage charting
- **Notes:** Added per flagged correction — it fills the real gap that shadow coverage covers only the boundary lane. Conditional on the WR's own slot rate: near-zero value for boundary-only receivers.

<a id="wr-team-red-zone-trip-rate"></a>
#### Team red-zone trip rate

**Weekly 0.5% · Season 0.6%** · Opportunity/Volume · stability: high · evidence: strong

- **Mechanism:** How often an offense reaches the red zone at all is a separate volume driver from a given player's share of targets once inside it — points = trips × share × conversion.
- **Key numbers:** Trip rate is sticky, r≈0.65 with overall offense quality; conversion/efficiency is noise (YoY ~0.01-0.24) — factors.md Tier 2, already vetted in this project.
- **Data:** nflverse PBP (drive-level red-zone entry rate)
- **Notes:** CALIBRATOR RULING on the flagged redundancy: kept as a separate item but weighted near the floor weekly. Weekly it is almost fully collinear with the Vegas implied team total (a high implied total IS a forecast of red-zone trips) and the market number is better. Season-long it retains modest independent value as a team-quality prior that survives when Vegas lines are unavailable. Its r≈0.65 evidence is strong, and the low weight is a redundancy exemption, not an evidence judgment.

<a id="wr-money-down-third-down-target-share"></a>
#### Money-down / third-down target share

**Weekly 0.5% · Season 0.3%** · Opportunity/Volume · stability: medium · evidence: estimated

- **Mechanism:** Targets on 3rd/4th-and-medium-to-long proxy 'trusted target' status — QBs and coordinators funnel looks to the receiver they trust to move the chains, and the role tends to be sticky and partly independent of overall target volume.
- **Key numbers:** Referenced qualitatively as a situational-usage sticky stat (Fantasy Classroom); no published r/R² to WR fantasy points located. ESTIMATED.
- **Data:** nflverse PBP (down/distance target splits)
- **Notes:** Kept separate from target share only provisionally — it must be tested for incremental lift over target share + route participation before earning a place in the scored model.

<a id="wr-backup-qb-start-discrete-in-season-event"></a>
#### Backup-QB start (discrete in-season event)

**Weekly 0.5% · Season 0.1%** · Team Environment · stability: low · evidence: weak

- **Mechanism:** When the starting QB is out, pass-catcher production shifts in an unpredictable direction. This must widen the projection interval, not apply a fixed penalty.
- **Key numbers:** PFF 'How do backup QBs affect skill-player production?' — qualitative finding of an inconsistent, non-uniform effect that contradicts the naive 'backup QB = downgrade' assumption (Chris Olave finished 2025 as WR6 with backup Tyler Shough starting several of his best games). No clean aggregate effect size published.
- **Data:** nflverse starter/backup snap data + depth charts
- **Notes:** Kept separate from the merged QB-quality factor per flagged correction: QB quality is a continuous season-long tier, this is a discrete event with an ambiguous sign. The engine must not encode a fixed-direction downgrade here — that is the specific error the PFF work identifies.

<a id="wr-bye-week-week-18-rest-risk"></a>
#### Bye week & Week 18 rest risk

**Weekly 0.5% · Season 0%** · Situational/Schedule · stability: n/a · evidence: strong

- **Mechanism:** A bye zeroes weekly production outright; Week 18 carries real risk of a playoff-clinched team resting starters.
- **Key numbers:** Week 18 rest risk is real every year with certain direction but unpredictable magnitude — handled via manual/news tracking rather than modeling (factors.md Tier 3)
- **Data:** nflverse schedules + hand-tracked news
- **Notes:** Byes are deterministic, not predicted — this weight represents the Week 18 rest component plus correct bye handling, which is a data-hygiene requirement more than a factor.

<a id="wr-garbage-time-production-inflation-prior-season-audit-lens"></a>
#### Garbage-time production inflation (prior-season audit lens)

**Weekly 0.4% · Season 1%** · Other · stability: n/a · evidence: moderate

- **Mechanism:** Trailing-script garbage-time snaps inflate counting stats — for pass-catchers far more than for RBs — in a way that misrepresents a player's role in competitive situations, and must be adjusted out before prior-year box scores feed a projection.
- **Key numbers:** Inflates WR/pass-catcher stats far more than RB; standard practice is to audit prior-year box scores for garbage-time share before projecting forward (factors.md Tier 2). No published magnitude.
- **Data:** nflverse PBP (win-probability-gated splits)
- **Notes:** Not a predictor — a data-cleaning step applied to the inputs of the target-share and air-yards-share factors. Its weight is the value of not being fooled by an inflated baseline, which is why it is materially larger at the season horizon where a single inflated prior year drives the whole projection.

<a id="wr-coach-4th-down-aggressiveness"></a>
#### Coach 4th-down aggressiveness

**Weekly 0.4% · Season 0.5%** · Coaching/Scheme · stability: medium · evidence: moderate

- **Mechanism:** Proxies a generally aggressive, pass-leaning offensive philosophy that correlates with higher offensive efficiency and, indirectly, pass volume.
- **Key numbers:** r=0.30 to offensive EPA/play; sticky coach-level trait YoY (factors.md Tier 2)
- **Data:** nflverse PBP (4th-down decisions)

<a id="wr-non-injury-absence-risk-suspension-holdout-legal"></a>
#### Non-injury absence risk (suspension / holdout / legal)

**Weekly 0.4% · Season 0.5%** · Health/Injury · stability: low · evidence: estimated

- **Mechanism:** PED, conduct and legal suspensions and contract holdouts zero out weeks independent of injury, with a real annual base rate across the league.
- **Key numbers:** No formal aggregate study quantifying league-wide base rate or fantasy-point impact located; case examples confirm recurrence most seasons (Rashee Rice 6-game 2025, Jordan Addison 3-game). ESTIMATED.
- **Data:** hand-maintained news / NFLPA discipline tracking (not in nflverse)
- **Notes:** Season weight slightly exceeds weekly because a known suspension is a draft-time certainty (games missed are subtractable) whereas mid-season it is mostly already reflected in the OUT designation.

<a id="wr-qb-scramble-drill-off-script-mobility"></a>
#### QB scramble-drill / off-script mobility

**Weekly 0.4% · Season 0.4%** · Team Environment · stability: medium · evidence: weak

- **Mechanism:** Improvisational QBs extend plays outside the pocket, creating broken-play targets and extra YAC opportunity for receivers who uncover during a scramble — distinct from pocket arm talent and not captured by pace or PROE.
- **Key numbers:** No consolidated fantasy-specific study located. Qualitative industry commentary only; no r/R² found. ESTIMATED.
- **Data:** nflverse PBP (scramble plays, time-to-throw > ~2.5s) — computable but not an off-the-shelf table
- **Notes:** DOWNGRADED from 1.0 weekly. A weak-evidence, unquantified factor cannot outweigh published-effect-size factors like shadow coverage or wind under the monotone-with-evidence rule.

<a id="wr-heat-humidity-extreme-heat-outdoor-games"></a>
#### Heat / humidity (extreme-heat outdoor games)

**Weekly 0.4% · Season 0%** · Weather/Venue · stability: medium · evidence: weak

- **Mechanism:** Above roughly 85-90°F, offensive output degrades via fatigue-driven playbook shortening and player rotation, disproportionately affecting visitors from cooler climates — the hot-weather mirror of the cold and wind items.
- **Key numbers:** Games above 85°F show an ~8% decrease in total points scored; offenses most consistent in a 76-84°F heat-index band. SOURCE IS A BETTING CONTENT SITE (nxtbets.com), not an analytics publisher — not corroborated by PFF/4for4/FTN in this pass. No WR-specific figure.
- **Data:** Open-Meteo (already in the PLAN.md data plan — needs a heat-index flag alongside the existing wind/cold flags)
- **Notes:** DOWNGRADED from 1.0 weekly and from 'moderate'/'high stability' to 'weak'/'medium'. An ~8% scoring effect from an uncorroborated betting blog cannot be weighted at parity with wind, whose completion-percentage numbers trace to analytics sources. Cheap to add since the feed is already planned, but it must be validated on the project's own data before it earns weight.

<a id="wr-rain-snow"></a>
#### Rain / snow

**Weekly 0.4% · Season 0%** · Weather/Venue · stability: medium · evidence: moderate

- **Mechanism:** Precipitation reduces grip and footing and can shift pass volume toward the run game.
- **Key numbers:** Rain is overrated: <5% effect on most metrics, moderate rain −4.7% pass rate. Snow is large but rare (−7 to −12 pts FG%, ~25% scoring drop) (factors.md Tier 2)
- **Data:** Open-Meteo forecast at stadium

<a id="wr-short-week-travel-circadian-effects-international-neutral-site-games"></a>
#### Short week, travel/circadian effects & international neutral-site games

**Weekly 0.4% · Season 0%** · Situational/Schedule · stability: low · evidence: moderate

- **Mechanism:** Thursday short-week prep, cross-country travel, timezone misalignment, and the extreme case of London/Germany/Mexico City games with 9:30am ET body-clock kickoffs are commonly cited situational drags.
- **Key numbers:** Post-bye edge mostly died with the 2011 CBA (2024 study: no significant effect); Thursday short-week effects small and possibly eroding. The one validated finding: West Coast teams beat the spread in 66% of NIGHT games vs East Coast opponents (5.26 pts ATS, 1970-2011, published in SLEEP) — the popular '1pm ET early kickoff penalty' is NOT similarly validated. No effect size exists for international games specifically.
- **Data:** nflverse schedules (kickoff time, timezone, international flag)
- **Notes:** MERGED: absorbed 'International / neutral-site game travel-circadian bundle' as its own author suggested. It is the same circadian/travel mechanism at a longer distance, with no independent published evidence, so a separate line item would have implied evidence that does not exist. Only the night-game direction is validated — do not apply an early-kickoff penalty.

<a id="wr-wr-designed-rush-attempts-jet-sweep-end-around-reverse"></a>
#### WR designed rush attempts (jet sweep / end-around / reverse)

**Weekly 0.3% · Season 0.2%** · Opportunity/Volume · stability: medium · evidence: estimated

- **Mechanism:** Manufactured carries add rush yards and TDs on top of receiving output — a fully separate half-PPR scoring channel, and one that is undiscounted (no reception involved, so the 0.5/catch haircut does not apply).
- **Key numbers:** No formal published r/R². Observable as a direct box-score rate stat (e.g., Deebo Samuel 17 carries / 75 yds / 1 TD with Washington; Puka Nacua designed carries worth ~105 rush yds + 1 TD in a season). ESTIMATED — no aggregate study quantifies league-wide fantasy contribution.
- **Data:** nflverse PBP rushing attempts filtered to WR position
- **Notes:** Small league-wide volume concentrated in a handful of players and schemes (especially the Shanahan tree) — a per-player role flag, not a league-wide regression input. Slightly more valuable in half-PPR than full PPR since rushing points are format-invariant while receptions are halved.

<a id="wr-opponent-dc-defensive-scheme-change-uncertainty-widener"></a>
#### Opponent DC / defensive-scheme change (uncertainty widener)

**Weekly 0.2% · Season 0.3%** · Matchup/Opponent · stability: n/a · evidence: weak

- **Mechanism:** A new defensive coordinator on an upcoming opponent shifts coverage-shell tendency, blitz rate and man/zone mix away from what prior-year tape shows, widening matchup-projection uncertainty.
- **Key numbers:** No rigorous quantitative study exists — factors.md states this explicitly for the offensive analog ('no rigorous quantitative study exists' for coordinator changes generally). Treated symmetrically as an uncertainty widener only. ESTIMATED.
- **Data:** hand-maintained coach/coordinator table (the same one already planned for the offensive OC-change factor)

<a id="wr-vegas-line-movement-open-to-close-shift-steam"></a>
#### Vegas line movement (open-to-close shift / steam)

**Weekly 0.2% · Season 0%** · Market/Consensus · stability: low · evidence: weak

- **Mechanism:** The magnitude and direction of a team total or spread's move from open to close carries incremental money-weighted information (injury news, weather, lineup changes) beyond the closing number alone.
- **Key numbers:** Sports-betting literature establishes closing-line value as the market's most efficient number and documents steam moves as a real, trackable phenomenon; no WR-fantasy-specific effect size located. ESTIMATED — plausibly a small increment over the closing total.
- **Data:** Odds API / sportsbook line-history feeds (open vs close) — not currently in the PLAN.md data plan
- **Notes:** By construction the closing line already contains everything the movement revealed, so the residual signal is mostly a proxy for 'news the model has not ingested yet' — cheaper to fix by ingesting the news.

<a id="wr-turf-vs-grass"></a>
#### Turf vs grass

**Weekly 0.1% · Season 0.3%** · Weather/Venue · stability: low · evidence: weak

- **Mechanism:** Surface type is linked to non-contact soft-tissue injury risk — a marginal draft-season risk adjustment, not a weekly performance factor.
- **Key numbers:** Injury-rate gap real in 2021-22 (OR 1.60 for season-ending surgery) but contested since, with near-parity in 2023 data (factors.md Tier 3)
- **Data:** nflverse schedules (surface type)

<a id="wr-altitude-denver-5-280-ft-mexico-city-7-350-ft"></a>
#### Altitude (Denver ~5,280 ft / Mexico City ~7,350 ft)

**Weekly 0.1% · Season 0%** · Weather/Venue · stability: medium · evidence: weak

- **Mechanism:** Thin air affects ball flight and plausibly visiting-player fatigue at extreme elevation.
- **Key numbers:** Denver ≈ +5 yds kicking range (physics, stable); Mexico City fatigue plausible but under-studied (factors.md Tier 3). No WR-specific passing-efficiency figure exists.
- **Data:** stadium lat/long/altitude static table (already in the PLAN.md data plan)
- **Notes:** RESTORED per flagged correction — it was dropped in translating factors.md into the WR list. Kept at the floor because the only stable altitude effect in the source is a KICKING effect, which does not touch WR scoring; the WR-relevant part (Mexico City fatigue) is explicitly unquantified.

<a id="wr-age-curve"></a>
#### Age curve

**Weekly 0% · Season 5.2%** · Age/Career Arc · stability: high · evidence: strong

- **Mechanism:** WR performance follows a predictable arc — building through the mid-20s, peaking, then declining — setting the draft-time prior independent of any single-year stats.
- **Key numbers:** VERIFIED and SOFTENED: peak age 26-27 confirmed across multiple sources (PFF Age of Decline, Razzball WR age analysis, 4for4 Production Curves). But the 'cliff at 32' framing is overstated — WRs aged 30-34 still produce ~92% of the PPG of their late-20s peers, WR1-caliber seasons become unlikely after 29, and true falloff is a gradual slope beginning ~30 rather than a cliff.
- **Data:** nflverse rosters + historical production
- **Notes:** CORRECTED: reduced from 5.5 to 5.2 and the raw signal restated. The prior entry's 'cliff at 32' would have the engine apply a step-function penalty the data does not support; it is a shallow decline in the mean plus a sharp drop in the RIGHT TAIL (WR1 probability). Model it as a ceiling suppressor after 29, not a mean penalty at 32.

<a id="wr-vegas-season-win-total-draft-time-team-quality-prior"></a>
#### Vegas season win total (draft-time team-quality prior)

**Weekly 0% · Season 5%** · Game Script/Vegas · stability: high · evidence: strong

- **Mechanism:** Preseason market pricing of team quality is the strongest available proxy for expected offensive plays and points before any real usage data exists.
- **Key numbers:** Applied at the passing-offense level. The published replication is positional, not WR-specific: QBs on high-win-total teams 18.4-18.5 pts/gm vs 14.2 on low; RBs 26.6 vs 20.6 — replicated across two independent seasons (PFF/Barrett, factors.md Tier 1).
- **Data:** nflverse schedules (preseason win totals)
- **Notes:** Evidence held at strong, with the caveat that the replicated splits are for QB and RB — the WR analog is an extrapolation of the same team-environment mechanism, not a directly published WR number.

<a id="wr-offseason-target-pool-change-vacated-departures-net-of-incoming-competition"></a>
#### Offseason target-pool change (vacated departures net of incoming competition)

**Weekly 0% · Season 4.6%** · Opportunity/Volume · stability: n/a · evidence: weak

- **Mechanism:** When a team's WR1/WR2 leaves, their target share becomes available for redistribution; symmetrically, a free-agent signing, trade acquisition or early-round rookie subtracts from returning WRs' baselines. The net change to the target pool is the draft-season role prior before any snaps exist.
- **Key numbers:** NO published predictive coefficient located despite direct search. 'Vacated targets' is standard 4for4/PFF/FTN/ESPN offseason methodology and is widely used, but no source quantifies how well vacated share predicts realized share. Sources emphasize it is 'not an exact science' and that the alpha receiver absorbs disproportionately rather than the split being even. ESTIMATED effect size.
- **Data:** nflverse (prior-year targets minus returning roster) + hand-tracked FA/trade/draft transactions
- **Notes:** MERGED: absorbed 'Offseason target-competition addition (inverse of vacated target share)'. These are the two signs of one net quantity computed from the same transaction table; modeling only subtraction (as the original list did) systematically over-projects returning WRs on teams that added competition. EVIDENCE DOWNGRADED from 'moderate' to 'weak' — the weight rests entirely on mechanism and industry practice, with zero published validation. High weight with weak evidence is deliberate and flagged: nothing else fills this slot at draft time, but it is the largest unvalidated bet in the season column and should be the first thing the backtest checks.

<a id="wr-injury-type-recurrence-incl-age-injury-interaction"></a>
#### Injury-type recurrence (incl. age × injury interaction)

**Weekly 0% · Season 4.2%** · Health/Injury · stability: high · evidence: strong

- **Mechanism:** Specific injury types — not general 'injury-proneness' — carry elevated same-body-part re-injury risk that should discount season-long projections, with older players recovering more slowly and less completely.
- **Key numbers:** Hamstring: 38.4% recurrence (11.9% same-season); ACL: 25% re-injury vs 9% in controls, with large multi-season production deficits for skill players (factors.md, sports-medicine literature). Generalized 'injury-prone' labeling is explicitly NOT supported.
- **Data:** nflverse injury history + sports-medicine literature
- **Notes:** The strongest-evidenced season-only factor after age. Must be implemented as body-part-specific — applying a generic durability discount is the version the literature refutes.

<a id="wr-draft-capital-years-1-3"></a>
#### Draft capital (years 1-3)

**Weekly 0% · Season 4%** · Age/Career Arc · stability: high · evidence: strong

- **Mechanism:** Higher draft investment predicts more immediate opportunity — playing time and target share — independent of any in-season production data, and the prior decays as real usage accumulates.
- **Key numbers:** VERIFIED: since 2015, just 9 receivers drafted in Round 4 or later have posted a top-30 season — a 4.4% hit rate (Footballguys 'Draft Capital Matters: Rookie Wide Receivers', 2026). Draft capital r≈0.29 to NFL production for prospects (factors.md).
- **Data:** nflverse draft data
- **Notes:** The decay is the important part: by Year 3, observed target share should almost entirely displace draft capital. An engine that keeps weighting draft position after two seasons of usage data is double-counting the same information the usage already revealed.

<a id="wr-adp-average-draft-position"></a>
#### ADP (average draft position)

**Weekly 0% · Season 3.4%** · Market/Consensus · stability: high · evidence: strong

- **Mechanism:** Aggregates the drafting market's collective information — including camp and beat-reporter intel not otherwise in the model — into a single crowd-sourced season-long prior.
- **Key numbers:** VERIFIED: preseason ADP correlates 0.599 with late-season performance vs 0.585 for early-season (first 4 weeks) performance — i.e., ADP predicts about as well as a month of real games (Footballguys/Harstad, 'Fantasy, in Theory: Revisiting Preseason Expectations')
- **Data:** Fantasy Football Calculator API
- **Notes:** The 0.599-vs-0.585 finding cuts two ways: it justifies weighting ADP heavily at draft time AND it means the model gains almost nothing over ADP until roughly Week 5. Its correct in-season behavior is fast decay, not persistence.

<a id="wr-nfl-experience-year-curve-year-1-discount-year-2-3-breakout-window"></a>
#### NFL experience-year curve (Year-1 discount, Year 2-3 breakout window)

**Weekly 0% · Season 3.3%** · Age/Career Arc · stability: medium · evidence: moderate

- **Mechanism:** WR is the position with the clearest 'no instant impact' prior among skill positions — route-running, separation and playbook mastery take time — and breakouts then concentrate in specific experience years rather than spreading evenly across the post-rookie career.
- **Key numbers:** VERIFIED with an update: 52% of first-time WR1 seasons occur in Year 2 or Year 3, and 68% by Year 3 (FantasyLife/PFF 2026 breakout analysis). IMPORTANT REVISION from the same source: Year 4 now rivals Year 2 as the second-most-common breakout season after a 2025 class with three fourth-year breakouts, so the window is widening. Roughly 4.6 first-time WR1s per season since 2012.
- **Data:** nflverse rosters (years of NFL experience)
- **Notes:** MERGED: 'Rookie WR learning curve (Year-1 discount)' and 'WR Year 2/3 breakout-window prior' were two readings of one distribution — the share of first-time WR1 seasons by experience year. The Year-1 discount and the Year-2/3 peak are the same curve's left tail and mode; separate line items would have double-counted the age/experience prior alongside the age curve itself. Note this is an EXPERIENCE-year effect, distinct from and partly collinear with the chronological age curve — do not stack both at full strength on a 22-year-old rookie.

<a id="wr-breakout-age-age-at-first-collegiate-target-dominance"></a>
#### Breakout age (age at first collegiate target dominance)

**Weekly 0% · Season 0.8%** · Age/Career Arc · stability: n/a · evidence: weak

- **Mechanism:** Younger age at first collegiate production dominance is a modestly predictive prospect signal for NFL WR outcomes.
- **Key numbers:** r≈0.43 to NFL production (factors.md Tier 2), the highest of the prospect metrics — but factors.md explicitly flags it at LOWER confidence than draft capital (r≈0.29), which is a strong hint the 0.43 is selection-biased or from a small/curated sample.
- **Data:** college production databases (hand-compiled)
- **Notes:** SPLIT per flagged correction: this was previously fused with College Dominator despite being a different metric with a different effect size. Its weight is deliberately far below what r≈0.43 would imply — the monotone-with-evidence rule is overridden here by the source's own explicit low-confidence caveat plus the fact that it applies to a shrinking population (rookies and second-year players only) and is largely subsumed by draft capital, which teams set using the same college tape.

<a id="wr-college-dominator-rating-college-target-yardage-market-share"></a>
#### College Dominator rating (college target/yardage market share)

**Weekly 0% · Season 0.6%** · Age/Career Arc · stability: n/a · evidence: weak

- **Mechanism:** A prospect's share of his college team's receiving production, as a continuous market-share measure of collegiate role — the input from which breakout age is derived.
- **Key numbers:** r≈0.22 to NFL production (factors.md Tier 2). For contrast, combine athleticism is useless for WR fantasy (r=0.014 RAS).
- **Data:** college production databases (hand-compiled)
- **Notes:** SPLIT OUT per flagged correction — it is a distinct published metric (continuous market share, r≈0.22) from Breakout Age (derived age threshold, r≈0.43), and merging them averaged away two different effect sizes. Applies to Years 1-2 only and decays to zero once NFL usage exists.

<a id="wr-combine-athleticism-ras"></a>
#### Combine athleticism / RAS

**Weekly 0% · Season 0%** · Efficiency/Talent · stability: n/a · evidence: strong

- **Mechanism:** Commonly believed that testing numbers (40 time, agility, explosion composites) predict NFL WR fantasy production.
- **Key numbers:** Combine athleticism is ~useless for WR fantasy: r=0.014 for RAS to NFL production (factors.md Tier 2)
- **Data:** n/a — debunked, excluded by design
- **Notes:** ADDED by the calibrator. r=0.014 is the single most decisive null in the WR prospect literature and was missing from the list even though the source document carries it. Worth cataloging precisely because athleticism scores are heavily marketed in draft-season content.

<a id="wr-contested-catch-rate-drop-rate"></a>
#### Contested-catch rate & drop rate

**Weekly 0% · Season 0%** · Efficiency/Talent · stability: low · evidence: strong

- **Mechanism:** Hands and catch-radius skill in 50-50 situations and on difficult but catchable targets.
- **Key numbers:** No YoY correlation and no predictive power for future fantasy points (4for4, 'Most Predictable WR Stats'); league-average contested-catch rate ~47.7% (PFF, 2025 season)
- **Data:** PFF charting
- **Notes:** ZEROED (was 0.5/0.4). Evidence quality is STRONG for the finding that these stats carry no predictive power, so under the project's own convention this belongs with the debunked set, not at a token positive weight. Its only legitimate use — flagging a player whose prior year was inflated or deflated by contested-catch variance — is already performed by the TD/efficiency regression-flag factor and by the garbage-time audit, so a separate weight would double-count that correction.

<a id="wr-contract-year"></a>
#### Contract year

**Weekly 0% · Season 0%** · Age/Career Arc · stability: n/a · evidence: strong

- **Mechanism:** Commonly believed effort/production boost in a player's walk year.
- **Key numbers:** No statistically significant effect (Football Outsiders 12-year regression study, multiple replications)
- **Data:** n/a — debunked, excluded by design

<a id="wr-divisional-game-familiarity-second-meetings"></a>
#### Divisional-game familiarity (second meetings)

**Weekly 0% · Season 0%** · Situational/Schedule · stability: low · evidence: weak

- **Mechanism:** Theory that facing a division rival twice a year suppresses production in the second meeting due to scouting familiarity.
- **Key numbers:** Weak and weakening effect; factors.md recommends skip or near-zero weight
- **Data:** n/a — weak effect, excluded

<a id="wr-home-away"></a>
#### Home / away

**Weekly 0% · Season 0%** · Situational/Schedule · stability: low · evidence: strong

- **Mechanism:** Commonly assumed home-field production boost.
- **Key numbers:** Position-specific and essentially null for WR: DST +1.3 pts (~21%), QB +7%, K +0.2-0.5, WR ≈ 0 (factors.md Tier 2, 'tiebreaker only')
- **Data:** n/a — measured at ~zero for WR, excluded by design
- **Notes:** ADDED by the calibrator. It was absent from the merged list despite factors.md carrying a WR-specific null result, and cataloging measured nulls is the point of the zero-weight convention. Note the venue effects that DO matter for WR (dome, cold-road, wind) are captured under Weather/Venue, not here.

<a id="wr-hot-hand-efficiency-streaks"></a>
#### Hot hand / efficiency streaks

**Weekly 0% · Season 0%** · Other · stability: n/a · evidence: strong

- **Mechanism:** Commonly believed that a player 'gets hot' and sustains elevated efficiency in the near term.
- **Key numbers:** Streaks concentrate in TD and efficiency stats, the most mean-reverting stats in the sport; the real signal underlying apparent streaks is a usage increase, which the opportunity factors already capture
- **Data:** n/a — debunked, excluded by design

<a id="wr-naive-strength-of-schedule-season-points-allowed-to-wr-rankings"></a>
#### Naive strength of schedule (season points-allowed-to-WR rankings)

**Weekly 0% · Season 0%** · Matchup/Opponent · stability: low · evidence: strong

- **Mechanism:** Commonly used draft-season practice of ranking upcoming schedules by how many fantasy points each defense allowed to the position last year.
- **Key numbers:** Defensive positional fantasy-points-allowed YoY correlation just 0.16-0.27; top-5 units repeat only 20-30% of the time (factors.md, DEBUNKED table)
- **Data:** n/a — debunked, excluded by design
- **Notes:** ADDED by the calibrator to complete the debunk catalog. Explicitly distinct from the heavily-regressed current-season opponent-EPA factor above, which retains a small weight — the debunked version is the prior-year RANKING, which is what most schedule-strength content actually uses.

<a id="wr-preseason-box-score-production"></a>
#### Preseason box-score production

**Weekly 0% · Season 0%** · Other · stability: n/a · evidence: strong

- **Mechanism:** Commonly believed that strong preseason stat lines predict regular-season performance.
- **Key numbers:** Meaningless; preseason ADP predicts regular-season outcomes as well as the first 4 real games do (r 0.599 vs 0.585). The informative part of preseason is first-team SNAP ALLOCATION, not box-score production — and that is already captured by the route-participation and depth-chart factors.
- **Data:** n/a — debunked, excluded by design

<a id="wr-primetime-split"></a>
#### Primetime split

**Weekly 0% · Season 0%** · Situational/Schedule · stability: low · evidence: weak

- **Mechanism:** Commonly claimed performance boost or drag in nationally televised games.
- **Key numbers:** Single-source, confounded, low confidence (factors.md Tier 3)
- **Data:** n/a — low-confidence, excluded

<a id="wr-revenge-games"></a>
#### Revenge games

**Weekly 0% · Season 0%** · Situational/Schedule · stability: n/a · evidence: strong

- **Mechanism:** Commonly believed motivational boost when facing a former team.
- **Key numbers:** 49.5% of 384 skill players beat their season average — a coin flip; QBs beat their average only 35% of the time, worse than baseline
- **Data:** n/a — debunked, excluded by design

<a id="wr-trap-letdown-games"></a>
#### Trap / letdown games

**Weekly 0% · Season 0%** · Situational/Schedule · stability: n/a · evidence: strong

- **Mechanism:** Commonly believed dip in focus before or after a marquee game.
- **Key numbers:** Good teams actually won MORE of these games (80.5% / 82.2% vs 79.5% baseline), not statistically significant (Harvard, 2002-2011)
- **Data:** n/a — debunked, excluded by design


### TE — detail

<a id="te-trailing-target-share"></a>
#### Trailing target share

**Weekly 15% · Season 13.5%** · Opportunity/Volume · stability: high · evidence: strong

- **Mechanism:** Sets the TE's weekly target volume, which drives receptions, yardage, and (via red-zone share) TD opportunity — the single largest determinant of half-PPR output at the position.
- **Key numbers:** TE target share YoY r = 0.695 — the stickiest measured TE stat (SumerSports, "Sticky Football Stats"; TE-isolated figure corroborated via FantasyLife/SharpFootball synthesis). SumerSports' own article text confirms pass-catcher target share "around 0.70" as the stickiest metric since 2021.
- **Data:** nflverse load_pbp / load_snap_counts derived
- **Notes:** Base of the opportunity model. VERIFIED: the 0.695 TE-specific figure is reported consistently across two independent secondary sources; the SumerSports page itself only states ~0.70 for pass-catchers as a group, so treat 0.695 as ±0.02. Absorbs the WOPR composite's target-share term (WOPR is listed separately at 0/0 to avoid double-counting).

<a id="te-route-participation-snap-share"></a>
#### Route participation & snap share

**Weekly 10.5% · Season 10%** · Opportunity/Volume · stability: high · evidence: strong

- **Mechanism:** Caps how many routes (and therefore targets) a TE can accumulate; the hard gate separating true receiving TEs from blocking-first Y-TEs.
- **Key numbers:** TE route share YoY r = 0.583 (FantasyLife 2026 / SharpFootball); of 113 TEs at 75%+ route share 2015-2024, 58 of the 85 who played 8+ games repeated 75%+ the next year = 68% retention.
- **Data:** nflverse load_snap_counts + FTN route charting (2022-)
- **Notes:** Second-stickiest TE metric. Partially redundant with target share (routes are the denominator of TPRR and a precondition for targets) — weighted below it for that reason, not because the evidence is weaker.

<a id="te-red-zone-end-zone-goal-line-target-share"></a>
#### Red zone / end zone / goal-line target share

**Weekly 6.4% · Season 2.5%** · Opportunity/Volume · stability: medium · evidence: strong

- **Mechanism:** TE per-target yardage is thin, so a disproportionate share of TE half-PPR points is concentrated in end-zone conversion; RZ/EZ role converts directly into the position's highest-value plays.
- **Key numbers:** CORRECTED: TE end-zone-target-to-TD conversion ≈41.8-43.2% (Sharp Football NFL Red-Zone Stats vs. Expectation: Tight Ends), vs ~37% for all receivers and ~19-24.5% per general red-zone target (PFF, "The increased fantasy value of red-zone/end-zone targets"). Player-level RZ/non-RZ share gaps are large (Ferguson 23.5% RZ vs 15.5% non-RZ; Goedert 27.8% vs 15.3%, PFF 2025).
- **Data:** nflverse pbp red-zone/end-zone target extraction
- **Notes:** Prior list's "≈44%" was slightly high and mis-attributed; the TE-specific number is 41.8-43.2%, though the TE-vs-all-receiver EDGE (42% vs 37%) is the more important fact and it survives. High weekly weight (drives boom weeks in half-PPR where a TD = ~12 receptions); much lower season weight because team RZ trip volume regresses and per-target conversion is noise.

<a id="te-injury-designation-practice-participation-trajectory"></a>
#### Injury designation / practice-participation trajectory

**Weekly 5.9% · Season 1%** · Health/Injury · stability: high · evidence: strong

- **Mechanism:** Whether the TE plays at all is the largest single binary in a weekly projection; the DNP→limited→full practice trend across the week is a stronger play-probability signal than the Friday designation alone.
- **Key numbers:** Questionable plays ~71% of the time, Doubtful ~6% (factors.md, aggregate league rates). Practice-participation trajectory named as a missing factor by the prior audit — no published incremental-lift figure over the final designation alone.
- **Data:** nflverse load_injuries (daily practice reports)
- **Notes:** Base designation rates are strong evidence; the incremental value of the trajectory over the tag is estimated. Season weight is small and reflects only late-August camp designations.

<a id="te-team-implied-total-scoring-environment"></a>
#### Team implied total / scoring environment

**Weekly 5% · Season 1.5%** · Game Script/Vegas · stability: high · evidence: strong

- **Mechanism:** Higher-scoring offenses generate more red-zone trips and total TDs to distribute — this matters more at TE than at WR because TE value is TD-concentrated.
- **Key numbers:** Vegas implied team totals are "the most information-dense single pregame number for scoring volume" (factors.md); dome/indoor games +9% combined scoring (46.2 vs 42.4 pts/gm).
- **Data:** nflverse load_schedules (closing lines)
- **Notes:** Recategorized from Team Environment to Game Script/Vegas — it is a market-derived weekly input, not a team trait. Season weight low because Vegas win totals cover the same ground at draft time.

<a id="te-yards-per-route-run-yprr"></a>
#### Yards per route run (YPRR)

**Weekly 4% · Season 3.3%** · Efficiency/Talent · stability: medium · evidence: strong

- **Mechanism:** Best per-route receiving-efficiency metric; converts a fixed route allocation into more yards and, indirectly, more targets as the QB learns to trust the player.
- **Key numbers:** UPGRADED: among TEs holding 75%+ route participation, YPRR ranks second in predictive power at r = 0.65 with next-season fantasy points (FantasyLife 2026); SumerSports separately puts pass-catcher YPRR YoY at >0.60 since 2021 — well above the r≈0.0-0.3 "efficiency is noise" band.
- **Data:** FTN charting (routes) + nflverse receiving yards
- **Notes:** Materially raised from the merged list (was 3/3, "moderate"). Not weighted above route share despite the nominally higher r because the two numbers are different statistics (0.65 = correlation to next-season points, measured only within an already-high-route population; 0.583 = YoY stickiness of the metric itself), and YPRR's predictive power is substantially mediated by the role variables already weighted above it.

<a id="te-spread-game-script-shift"></a>
#### Spread / game-script shift

**Weekly 3.5% · Season 0%** · Game Script/Vegas · stability: high · evidence: moderate

- **Mechanism:** Game script shifts the pass/run mix; TEs gain from trailing scripts (more dropbacks) but also hold value leading (possession/RZ/play-action routes), which mutes the RB-style script sensitivity in both directions.
- **Key numbers:** League pass rate 50% leading / 56% tied / 66% trailing (factors.md). No TE-specific script split published — the muting relative to RB is a mechanism argument, not a measured one.
- **Data:** nflverse load_schedules spread + pbp pass rate
- **Notes:** Downgraded from 5.0 weekly: the underlying pass-rate splits are solid but the TE-specific translation is unmeasured, and TE is the least script-elastic skill position.

<a id="te-qb-quality-accuracy-incl-backup-qb-downgrade"></a>
#### QB quality / accuracy, incl. backup-QB downgrade

**Weekly 3.2% · Season 2%** · Team Environment · stability: low · evidence: moderate

- **Mechanism:** An accurate QB raises catchable-target rate on the intermediate throws TEs live on; a QB change (especially to a backup) shortens the offense and re-rates the whole target tree, sometimes upward for the TE via checkdowns.
- **Key numbers:** Catchable-target rate explains large pass-catcher over/under-performance (Higgins 78% CTR with Burrow vs 58% without, factors.md) but CTR itself is unstable YoY (~0.28-0.29). Backup-QB downgrade named as a gap by the prior audit; no TE-isolated coefficient published.
- **Data:** nflverse pbp CPOE/CTR + depth-chart QB1 status
- **Notes:** Use as a re-rate TRIGGER on QB change, not a static per-QB score — CTR's own instability means the level carries little signal, the delta carries most of it.

<a id="te-in-season-vacated-target-reallocation"></a>
#### In-season vacated-target reallocation

**Weekly 3% · Season 0%** · Opportunity/Volume · stability: n/a · evidence: estimated

- **Mechanism:** A teammate's in-season injury or trade immediately redistributes targets; TEs commonly absorb a slice of a WR's vacated volume through possession and checkdown roles.
- **Key numbers:** No TE-isolated published coefficient; named as a missing structural factor by the prior audit. Mechanically certain (target pool is zero-sum) but the TE's share of the redistribution is unmeasured.
- **Data:** hand-maintained event detection (injury/trade + snap-count deltas) over nflverse loaders
- **Notes:** Weight held at 3.0 despite "estimated" because the mechanism is arithmetic, not behavioral — the pool must go somewhere. Weekly-only by construction.

<a id="te-td-dependence-boom-bust-variance"></a>
#### TD dependence / boom-bust variance

**Weekly 2.8% · Season 1%** · Variance Driver · stability: low · evidence: strong

- **Mechanism:** TE scoring is unusually TD-concentrated relative to yardage volume, so week-to-week variance is disproportionately TD-driven; this feeds the floor/ceiling spread, not the point estimate.
- **Key numbers:** TE receiving TDs carry 0.74 correlation with SAME-season PPG but only 0.33 with NEXT-season PPG, and just 0.28 YoY stability (FantasyLife 2026) — the cleanest TE-specific statement of the problem. 2025: TEs caught 231 TDs (most since 2013) on a record 23.8% target share, 28.4% of all league receiving TDs (Sharp Football).
- **Data:** nflverse pbp TD distribution
- **Notes:** Evidence upgraded — the merged list's qualitative "most production comes in the red zone" claim is now backed by TE-specific numbers. Note the honest caveat: at ~9 half-PPR pts/game a TE's TD share of total points is roughly 25-30%, only modestly above WR — the boom-bust framing is about variance-to-mean ratio, not mean composition.

<a id="te-tprr-targets-per-route-run"></a>
#### TPRR (targets per route run)

**Weekly 2.6% · Season 2%** · Opportunity/Volume · stability: medium · evidence: moderate

- **Mechanism:** Isolates per-opportunity QB trust from raw playing time; the mechanism by which a TE grows target share without first growing route share.
- **Key numbers:** UPGRADED: TPRR is the third-most important variable (behind ADP and receptions/game) in 4for4's 2026 "Most Predictable Tight End Stats" model for predicting future TE fantasy points, with a stated target threshold above 15%. No published YoY r or R² — 4for4 gives ordinal importance only.
- **Data:** FTN/PFF derived (targets ÷ routes)
- **Notes:** Raised from 1/1 "estimated". Deliberately weighted well below target share despite its model rank because 4for4's model conditions on ADP first, and TPRR × route share reconstructs target share — heavy redundancy with the two factors above.

<a id="te-team-pace-offensive-plays-per-game"></a>
#### Team pace (offensive plays per game)

**Weekly 2.3% · Season 1.8%** · Team Environment · stability: medium · evidence: strong

- **Mechanism:** More total offensive plays per game mechanically produces more routes and targets, independent of the pass/run split — PROE sets the ratio, pace sets the base.
- **Key numbers:** CORRECTED ATTRIBUTION: pace YoY r = 0.43-0.47 when QB or HC is retained (dropping to ~0.31-0.39 when one changes); adjusted-pace early-season R² to full season = 0.47 (factors.md, nflverse-derived).
- **Data:** nflverse pbp (plays/game, neutral-script pace)
- **Notes:** Added per the flagged correction, which was VALID. The merged list's version of this entry wrongly attached the "~24-pt neutral-script pass-probability spread" figure to pace — that is a PROE dispersion statistic and has been moved to the PROE entry.

<a id="te-team-pass-rate-proe"></a>
#### Team pass rate / PROE

**Weekly 2% · Season 1.8%** · Team Environment · stability: medium · evidence: strong

- **Mechanism:** Sets the RATE at which a team's plays become dropbacks (not the total volume — pace supplies that); a pass-leaning script raises the TE's expected routes per play.
- **Key numbers:** CORRECTED ATTRIBUTION: PROE early-season R² to full season = 0.32; ~24-point spread in neutral-script pass probability between the most and least pass-happy teams (factors.md). 4for4's 2026 TE model lists PROE among its predictive variables (target: above +7%, described as rarely found).
- **Data:** nflverse pbp xpass model
- **Notes:** Mechanism text rewritten per the flagged correction, which was VALID — the previous "more team dropbacks" phrasing conflated a rate with a volume and double-counted what pace supplies.

<a id="te-two-te-committee-volatility"></a>
#### Two-TE committee volatility

**Weekly 2% · Season 1.2%** · Variance Driver · stability: low · evidence: estimated

- **Mechanism:** Teams splitting snaps and targets across two TEs (rather than running a clear TE1) create week-to-week role swings that season-long average shares systematically understate.
- **Key numbers:** No isolated published coefficient. Inferred from personnel-grouping and zero-sum target-tree mechanics; the 2025 leaguewide shift toward heavier personnel (11-personnel 63%→58%, factors.md) increases the number of teams in this state.
- **Data:** nflverse weekly snap-share variance by team
- **Notes:** Feeds projection interval width, not the point estimate.

<a id="te-slot-big-slot-alignment-rate"></a>
#### Slot / big-slot alignment rate

**Weekly 1.8% · Season 1%** · Opportunity/Volume · stability: medium · evidence: moderate

- **Mechanism:** Big-slot / F-TE alignment predicts route volume, easier releases, and favorable coverage assignments independent of the in-line blocking-snap count.
- **Key numbers:** UPGRADED: slot rate is the fourth-most important variable in 4for4's 2026 TE prediction model. Illustrative case: Dalton Kincaid ran 44% of team routes as a big-slot F-TE with top-3% route efficiency (FFDataRoma). No published r/R².
- **Data:** FTN charting (alignment/personnel)
- **Notes:** Raised from 1/1 on the strength of the 4for4 model ranking; capped low because it is heavily collinear with route share and in-line blocking rate.

<a id="te-opponent-coverage-matchup-lb-s-coverage-quality-man-zone-rate-points-allowed-to-te"></a>
#### Opponent coverage matchup (LB/S coverage quality, man/zone rate, points allowed to TE)

**Weekly 1.8% · Season 0.4%** · Matchup/Opponent · stability: low · evidence: strong

- **Mechanism:** TEs are covered by linebackers and safeties rather than top corners, so LB/S coverage quality and zone tendency carry a real if small edge distinct from generic points-allowed rank. Dedicated TE shadow coverage is rare enough to ignore.
- **Key numbers:** CORRECTED AND DOWNGRADED: fantasy points allowed to TE has a year-to-year correlation of just 0.16 — the LOWEST of any position (4for4 2026, "Do Defenses Repeat Fantasy Football Performances?", 2015-2025; QB 0.27, RB 0.22, WR low). Top-5 TE defenses repeat only 21% of the time, bottom-5 just 16%.
- **Data:** nflverse pbp defense-vs-position splits + FTN coverage charting
- **Notes:** Cut from 4.0 weekly. The merged list cited the cross-position range "0.16-0.27" without noting that 0.16 IS the TE value — TE matchup is the noisiest of all four positions, so this must be shrunk harder here than anywhere else in the engine. Evidence is now 'strong' for the null-ish finding itself.

<a id="te-in-line-blocking-snap-rate-route-suppressor"></a>
#### In-line blocking-snap rate (route suppressor)

**Weekly 1.6% · Season 2.2%** · Opportunity/Volume · stability: high · evidence: moderate

- **Mechanism:** Every in-line blocking snap is a snap not spent running a route; a high blocking rate imposes a hard ceiling on route share and therefore target share regardless of receiving talent.
- **Key numbers:** No published regression coefficient. PFF/FTN utilization work establishes that blocking-snap % mechanically caps route participation; the relationship is definitional rather than estimated.
- **Data:** FTN charting (blocking snaps, 2022-)
- **Notes:** Overlaps with route share by construction (blocking snaps are the complement of route snaps). Kept separate and weighted mainly on the SEASON side, where it predicts CHANGE in route share for players whose measured route share is not yet stable.

<a id="te-td-rate-red-zone-conversion-regression-flag"></a>
#### TD rate / red-zone conversion regression flag

**Weekly 1.6% · Season 1.8%** · Efficiency/Talent · stability: low · evidence: strong

- **Mechanism:** A TE's TD-per-target rate regresses hard toward the positional base rate; flagging extremes is the single most reliable correction to a naive trailing-points projection.
- **Key numbers:** TE receiving TDs: 0.28 YoY stability and only 0.33 correlation with next-season PPG despite 0.74 with same-season PPG (FantasyLife 2026); cross-position receiving-TD YoY R² = 0.03-0.08 (factors.md). Regression target: the ~42% TE end-zone-target base rate. Historical regression flags hit 90.7% (137/151) across positions.
- **Data:** nflverse pbp TD/target extraction
- **Notes:** The stability rating describes the RAW stat; the regression itself is one of the most reliable operations in the whole engine. Distinct from the TD-dependence variance driver: this moves the mean, that one widens the interval.

<a id="te-target-tree-competition-wr-corps-pass-catching-rb"></a>
#### Target-tree competition (WR corps + pass-catching RB)

**Weekly 1.5% · Season 1.6%** · Team Environment · stability: medium · evidence: estimated

- **Mechanism:** A dominant alpha WR, a crowded WR room, or a checkdown-priority pass-catching RB all draw from the same zero-sum target pool, capping the TE's attainable share.
- **Key numbers:** No published cross-league coefficient for either component. WR crowding is inferred from zero-sum target accounting; PFF ("Fantasy football significance of the relationship between RB and TE targets") documents anti-correlation between elite pass-catching-RB usage and TE target ceiling (Kelce-era Chiefs).
- **Data:** nflverse team target-share table (WR + RB target share, route participation)
- **Notes:** MERGED from two separate entries ("Target-tree competition (WR1/WR2 crowding)" and "RB/checkdown target competition"). They are the same zero-sum mechanism with different competitors and were double-counting; one combined competition-index feature is the right implementation.

<a id="te-td-receiving-yardage-prop-market-signal"></a>
#### TD / receiving-yardage prop market signal

**Weekly 1.4% · Season 0.3%** · Market/Consensus · stability: low · evidence: estimated

- **Mechanism:** Anytime-TD and receiving-yardage prop prices compress injury, game-script, and red-zone-role information into a player-specific number that updates faster and at finer grain than ECR — unusually valuable at a TD-dependent position.
- **Key numbers:** No published backtest correlation located. RotoWire's "Break the Plane" model and ESPN Betting's anytime-TD projections describe folding matchup, game total, spread, weather, and RZ usage into the price, but publish no TE-specific accuracy figure.
- **Data:** The Odds API (player-props tier) or ESPN unofficial betting endpoint — NOT in PLAN.md §3, would need adding
- **Notes:** Genuine gap in the Market/Consensus bucket, which otherwise covers only ADP and ECR. Partly redundant with Vegas implied total and RZ target share — the props are largely a repackaging of those, so weight is capped.

<a id="te-qb-specific-portable-te-target-tendency"></a>
#### QB-specific portable TE-target tendency

**Weekly 1.3% · Season 2.2%** · Team Environment · stability: high · evidence: weak

- **Mechanism:** A QB's personal willingness to work the TE in his progression is a sticky individual trait that travels across coordinators and teams, shifting TE target share independent of scheme or personnel.
- **Key numbers:** Aaron Rodgers targeted TEs below 18% of pass attempts in 6 of 7 studied seasons (2018 the lone exception at 19.4%), replicated across Packers → Jets → Steelers under different OCs and different TE rooms (Steelers Depot, 2025). Single-QB case study; no large-n cross-QB regression exists.
- **Data:** hand-maintained (career TE-target-share-by-QB splits derived from nflverse pbp)
- **Notes:** Evidence downgraded from moderate to weak — one QB, however clean the pattern, is an anecdote. The stability rating reflects the CLAIM (a portable trait), not the strength of the evidence for it. Genuinely distinct from the play-caller fingerprint factor; the two can point opposite directions on the same team.

<a id="te-weekly-target-floor-volatility-low-share-tes"></a>
#### Weekly target-floor volatility (low-share TEs)

**Weekly 1.3% · Season 0.8%** · Variance Driver · stability: low · evidence: estimated

- **Mechanism:** TEs outside the top tier operate on 2-4 target weekly floors, producing variance-to-mean ratios far worse than comparably ranked WRs or RBs — the projection interval must widen as target share falls.
- **Key numbers:** No isolated published coefficient. Structural consequence of the TE1-vs-streamer gap (~8.5 pts/game, ~127.5 season points) documented in the positional-tier literature.
- **Data:** nflverse weekly target-count variance by player
- **Notes:** Interval-width input, not a point-estimate input. Mechanically a function of target share, so it must be implemented as a variance model conditioned on share, never as an additive points term.

<a id="te-croe-catch-rate-over-expectation"></a>
#### CROE (catch rate over expectation)

**Weekly 1.2% · Season 0.7%** · Efficiency/Talent · stability: low · evidence: moderate

- **Mechanism:** Air-yards-adjusted catch performance isolates hands and contested-catch ability from route depth and target quality — the reception-conversion term that raw catch rate conflates.
- **Key numbers:** REFORMULATED: 4for4's 2026 TE model ranks CROE sixth in variable importance, with roughly +5 points over expectation cited as the meaningful threshold. Raw catch rate itself carries little signal and regresses toward the league mean.
- **Data:** nflverse pbp air yards + NGS expected completion; PFF/FTN as paid alternatives
- **Notes:** REPLACES the merged list's "Catch rate / contested-catch rate" entry. The flagged correction was VALID — raw catch rate conflates route depth with hands, and 4for4's own study uses CROE. Evidence upgraded from estimated to moderate as a result.

<a id="te-yac-over-expected-yacoe-yac-per-reception"></a>
#### YAC over expected (YACOE) / YAC per reception

**Weekly 1.1% · Season 0.5%** · Efficiency/Talent · stability: low · evidence: moderate

- **Mechanism:** After-catch ability adds yardage beyond the throw, which matters more in half-PPR than full PPR because the reception itself is worth only 0.5.
- **Key numbers:** YAC per reception is the seventh-most important variable in 4for4's 2026 TE model, with above ~6 yards cited as the desirable level. NGS YACOE is used across positions as a moderate-stability efficiency metric; no TE-isolated r published.
- **Data:** NGS YACOE public leaderboard + nflverse YAC
- **Notes:** Evidence nudged up from estimated on the 4for4 ranking. Half-PPR specifically favors this factor relative to full-PPR-derived studies.

<a id="te-play-through-penalty-by-injury-type"></a>
#### Play-through penalty by injury type

**Weekly 1.1% · Season 0.3%** · Health/Injury · stability: high · evidence: strong

- **Mechanism:** A TE who suits up carrying a designation underperforms his healthy baseline by a measurable amount, so play-probability weighting alone overstates the projection.
- **Key numbers:** TE playing-through penalty ≈ -8.5% (factors.md cross-position injury study; RB -8.7%, WR -9.9%, QB ≈ no effect).
- **Data:** nflverse load_injuries + game-log regression
- **Notes:** One of the few TE-isolated published effect sizes in this entire list. Must be applied multiplicatively AFTER the play-probability weighting, not instead of it.

<a id="te-adp-preseason-ecr"></a>
#### ADP / preseason ECR

**Weekly 1% · Season 8.5%** · Market/Consensus · stability: high · evidence: strong

- **Mechanism:** Market consensus aggregates beat-reporter, camp, and scheme information that never reaches box-score data — the dominant cold-start prior before in-season usage accumulates.
- **Key numbers:** UPGRADED: ADP / weekly positional rank is "by far the most important variable" in 4for4's 2026 TE prediction model — every other variable in that model is measured as incremental lift OVER ADP. Preseason ADP predicts as well as the first four real games (r 0.599 vs 0.585, factors.md).
- **Data:** nflverse load_ff_rankings / FFC ADP API
- **Notes:** Season weight raised from 7 to 8.5. Caveat the engine must respect: ADP is a COMPOSITE of most other factors here, so its weight is a measure of how much the market knows that our features do not — it must decay fast as real usage data lands, or the engine will simply reproduce consensus and fail PLAN.md §5's edge thesis.

<a id="te-air-yards-share-adot"></a>
#### Air yards share / aDOT

**Weekly 1% · Season 0.9%** · Opportunity/Volume · stability: medium · evidence: estimated

- **Mechanism:** Route-depth profile separates seam/vertical TEs from shallow checkdown TEs, driving yards-per-target and (weakly) TD-per-target.
- **Key numbers:** No TE-isolated YoY r published. Cross-position air-yards share YoY >0.70 (RotoViz) used as a proxy; the TE population's aDOT distribution is far narrower than WR's, which mechanically compresses how much variance this can explain at TE.
- **Data:** nflverse pbp air_yards
- **Notes:** Weighted low deliberately: the borrowed WR-based stickiness figure overstates its usefulness at a position where nearly everyone runs shallow. Also the second input to the WOPR composite.

<a id="te-in-season-ol-starter-injury-replacement-pressure-rate-shock"></a>
#### In-season OL starter injury / replacement (pressure-rate shock)

**Weekly 1% · Season 0.3%** · Team Environment · stability: n/a · evidence: estimated

- **Mechanism:** A starting lineman's in-season injury spikes opponent pressure rate immediately, shortening the QB's clock and shifting volume toward TE hot routes and checkdowns while suppressing overall offensive efficiency — two effects of opposite sign.
- **Key numbers:** No TE-specific published effect size. Directionally supported by OL-continuity research (PFF / Football Outsiders) linking O-line injuries to pressure-rate spikes and QB efficiency drops.
- **Data:** nflverse load_injuries + depth charts + pbp pressure rate
- **Notes:** Named as a gap by the prior audit. Note the sign ambiguity — this should widen the interval as much as it moves the mean.

<a id="te-pre-snap-motion-rate-te-in-motion-usage"></a>
#### Pre-snap motion rate / TE-in-motion usage

**Weekly 0.9% · Season 0.7%** · Coaching/Scheme · stability: medium · evidence: moderate

- **Mechanism:** Motion diagnoses man vs zone before the snap and manufactures leverage, raising completion rate and EPA on those plays — which lifts catchable-target rate and YPRR for the TEs run in jet/orbit motion.
- **Key numbers:** League-wide completion 59.7% without motion vs 64.9% with motion in 2025, plus higher EPA/play, higher TD rate, lower turnover rate (PFF, "Pre-snap motion usage reaches new highs across the NFL," 2025). No TE-isolated study.
- **Data:** nflverse/FTN charting (motion flag), NGS
- **Notes:** League-wide effect is well documented; the TE-specific magnitude is an extension, not a measurement. Also partly a team-quality proxy rather than a causal lever.

<a id="te-adverse-weather-wind-cold-precipitation"></a>
#### Adverse weather (wind / cold / precipitation)

**Weekly 0.9% · Season 0.1%** · Weather/Venue · stability: high · evidence: strong

- **Mechanism:** Wind degrades passing accuracy generally, but hits deep throws hardest — TEs run shallower than WRs, so the penalty applies at reduced magnitude. Snow effects are large but rare; rain is largely overrated.
- **Key numbers:** Completion % 60.3 → 54.7 above 20 mph wind; deep-pass rate -6% relative; ~15 mph onset threshold; snow ~25% scoring drop but rare; moderate rain only -4.7% pass rate (factors.md).
- **Data:** Open-Meteo hourly forecast at kickoff + nflverse load_schedules weather
- **Notes:** Underlying figures are strong and physics-backed; the TE-specific DISCOUNT (shallower routes → less wind-sensitive) is a mechanism argument with no published TE split behind it.

<a id="te-designed-rush-attempt-gadget-touch-usage"></a>
#### Designed rush-attempt / gadget-touch usage

**Weekly 0.8% · Season 0.5%** · Opportunity/Volume · stability: medium · evidence: moderate

- **Mechanism:** Direct rushing touches score under half-PPR rules, but the larger value is as a leading indicator of coaching trust and offensive versatility that precedes broader role growth.
- **Key numbers:** TE rushing attempts rank sixth in variable importance in 4for4's 2026 TE model — explicitly framed as an indicator of offensive talent and coaching trust rather than a direct scoring source; even ~0.1 attempts/game measurably improves their projection.
- **Data:** nflverse pbp rushing attempts by position
- **Notes:** Raised from 0.3/0.5. Entirely absent from the pre-audit list, which covered only the passing side of TE usage. Direct points contribution is trace; the weight is almost entirely the trust-signal channel.

<a id="te-play-action-rate"></a>
#### Play-action rate

**Weekly 0.8% · Season 0.4%** · Team Environment · stability: medium · evidence: estimated

- **Mechanism:** Play-action schemes TEs open on seams and crossers off run-fake looks; play-callers vary substantially in how much they use it.
- **Key numbers:** No TE-isolated published r. Play-action is correlated with explosive-pass rate at the team level; the TE-specific benefit is a scheme argument.
- **Data:** nflverse pbp play_action flag

<a id="te-dome-vs-outdoor-altitude"></a>
#### Dome vs outdoor / altitude

**Weekly 0.8% · Season 0.2%** · Weather/Venue · stability: high · evidence: strong

- **Mechanism:** Controlled indoor conditions raise passing efficiency across all route depths, including the short and intermediate zones TEs work; a fixed home-stadium characteristic known a full season in advance.
- **Key numbers:** +9% combined scoring indoors (46.2 vs 42.4 pts/gm); completion 61.1% vs 58.8% (factors.md). Denver ≈ +5 yds kicking range (physics).
- **Data:** nflverse load_schedules roof/surface field
- **Notes:** Partly redundant with the Vegas implied total, which already prices the venue in — apply as a residual only, or it double-counts.

<a id="te-empty-backfield-no-rb-rate"></a>
#### Empty-backfield (no-RB) rate

**Weekly 0.7% · Season 0.3%** · Opportunity/Volume · stability: medium · evidence: estimated

- **Mechanism:** Empty sets remove the RB as a checkdown option and force a fifth receiver into the pattern, mechanically raising TE route participation and target share on those snaps while simplifying the coverage.
- **Key numbers:** Scheme case-study and coaching-literature evidence only (empty formations spread and simplify defensive coverage). No published TE-specific R² or points-per-game delta located.
- **Data:** nflverse pbp offense_formation / personnel field, or FTN charting
- **Notes:** Distinct axis from 12-personnel rate: that counts TEs on the field, this counts RB absence.

<a id="te-post-return-ramp-up"></a>
#### Post-return ramp-up

**Weekly 0.6% · Season 0.5%** · Health/Injury · stability: medium · evidence: estimated

- **Mechanism:** TEs returning from missed time typically need 1-3 games to recover full route and snap share, so the pre-injury usage baseline overstates the first weeks back.
- **Key numbers:** No TE-isolated published r; post-IR ramp-up patterns discussed qualitatively across positions.
- **Data:** nflverse snap-share trend around return-from-injury dates

<a id="te-ol-pass-protection-quality-pressure-rate-static"></a>
#### OL pass-protection quality / pressure rate (static)

**Weekly 0.6% · Season 0.4%** · Team Environment · stability: medium · evidence: weak

- **Mechanism:** A leaky line shortens dropbacks and raises checkdown/hot-route volume to the TE, while a clean pocket supports fuller-developing concepts — again two effects of opposite sign for TE specifically.
- **Key numbers:** Clean-pocket dropbacks yield materially more points per play for pass-catchers than pressured dropbacks (industry synthesis; the frequently cited ~60% figure is not traceable to a single primary source and should be treated as indicative only). factors.md notes OL quality explains only ~14% of QB fantasy variance and ~zero of RB receiving.
- **Data:** nflverse pbp pressure/sack data (PFF pressure rate is the paid alternative)
- **Notes:** DOWNGRADED from moderate: the "~60% more points/play" figure in the merged list traces to a search synthesis, not a citable study, and the sign of the TE-specific effect is genuinely ambiguous.

<a id="te-situational-role-rate-3rd-down-2-minute-usage"></a>
#### Situational role rate (3rd-down + 2-minute usage)

**Weekly 0.6% · Season 0.4%** · Opportunity/Volume · stability: medium · evidence: estimated

- **Mechanism:** Money-down and 2-minute snaps are high-target-probability situations that add targets beyond what base-personnel snap share implies.
- **Key numbers:** No published TE-specific effect size found; a minor incremental opportunity signal.
- **Data:** nflverse pbp down/situation filters
- **Notes:** Largely absorbed by target share and TPRR once those are measured over a full sample; its real value is for players with small samples.

<a id="te-opponent-defensive-injuries"></a>
#### Opponent defensive injuries

**Weekly 0.6% · Season 0%** · Matchup/Opponent · stability: n/a · evidence: estimated

- **Mechanism:** The TE's primary coverage defenders are linebackers and safeties, so an opposing starting LB or S being out is a more direct matchup upgrade for the TE than for any other position.
- **Key numbers:** Named as a missing factor by the prior audit; no published TE-isolated effect size. Ceiling is bounded by the finding that TE defensive matchup overall carries only r=0.16 YoY signal.
- **Data:** nflverse load_injuries (opponent side) + depth charts
- **Notes:** More defensible than generic points-allowed matchup because the causal path is specific and short — but still bounded small by the position's overall matchup noise.

<a id="te-red-zone-te-featuring-play-calling-tendency"></a>
#### Red-zone / TE-featuring play-calling tendency

**Weekly 0.5% · Season 1.4%** · Coaching/Scheme · stability: medium · evidence: weak

- **Mechanism:** Some play-callers systematically funnel end-zone looks to the TE via seam, scramble-drill, and back-shoulder concepts — a coordinator-level trait distinct from the player's own RZ share.
- **Key numbers:** No published aggregate coefficient. Team-level RZ target-share gaps are large and persistent (Goedert 27.8% RZ vs 15.3% non-RZ; Ferguson 23.5% vs 15.5%), which is consistent with real coordinator-level variance but does not separate scheme from player.
- **Data:** hand-maintained coach/OC table + nflverse RZ target splits
- **Notes:** DOWNGRADED from moderate: the cited examples cannot distinguish a TE-featuring coordinator from a good TE, which is exactly the confound this factor claims to resolve.

<a id="te-red-zone-run-pass-mix-team-level-gate"></a>
#### Red-zone run/pass mix (team-level gate)

**Weekly 0.5% · Season 0.7%** · Team Environment · stability: medium · evidence: estimated

- **Mechanism:** Sits upstream of the TE's RZ target share: a team that pounds the ball in from close range generates fewer red-zone pass attempts to be shared at all.
- **Key numbers:** No TE-specific published effect size found. Goal-line and short-yardage run/pass rates vary substantially by team and scheme, but no regression tying that variation to TE fantasy output was located.
- **Data:** nflverse pbp (red-zone play-type rate by team)
- **Notes:** Correlated with but not redundant to team implied total (trip volume) and RZ target share (share of the passes) — this is the pass-attempt gate between them.

<a id="te-personnel-grouping-usage-12-personnel-2-te-rate"></a>
#### Personnel-grouping usage (12-personnel / 2-TE rate)

**Weekly 0.5% · Season 0.4%** · Team Environment · stability: medium · evidence: moderate

- **Mechanism:** Heavier groupings put more TEs on the field at once, which concentrates targets on a clear TE1 or dilutes them across a committee depending on the room's structure.
- **Key numbers:** League 11-personnel rate fell 63% → 58% from 2023-25 (factors.md); heavy sets concentrate WR1/TE targets and shrink the flex pool.
- **Data:** nflverse personnel/formation tagging
- **Notes:** Sign is player-specific (concentrating for a TE1, diluting for a TE2) — implement as an interaction with depth-chart rank, never as a main effect.

<a id="te-play-caller-te-usage-portable-fingerprint"></a>
#### Play-caller TE-usage portable fingerprint

**Weekly 0.4% · Season 1.8%** · Coaching/Scheme · stability: medium · evidence: weak

- **Mechanism:** An OC's designed TE-target rate is a personal trait that travels across jobs, supplying a directional prior for a TE's volume when the play-caller changes.
- **Key numbers:** Case study only: Eric Petzing's TE usage in Arizona moved Trey McBride TE7 (2023) → TE2 (2024) → TE1 (2025), 422 targets over three years, 60 more than the next-closest TE (FantasyLife 2026). No cross-coach regression exists, and factors.md notes coaching-tree scheme stickiness is inconsistent in general (McDaniels counterexample).
- **Data:** hand-maintained play-caller table extended with each coordinator's historical TE target share by stop
- **Notes:** Stability downgraded from high to medium — the one supporting case is a coordinator who kept the same TE, so player and scheme are perfectly confounded. Complements rather than duplicates the OC-change uncertainty widener and the RZ-tendency factor.

<a id="te-two-high-safety-shell-rate-opponent"></a>
#### Two-high safety shell rate (opponent)

**Weekly 0.4% · Season 0.3%** · Matchup/Opponent · stability: medium · evidence: weak

- **Mechanism:** Pre-snap safety structure governs how much help sits over the middle regardless of the man/zone call behind it, affecting the intermediate and seam windows TEs work. DIRECTION IS CONTESTED — see notes.
- **Key numbers:** UNVERIFIED: the cited Fantasy In Frames (2026) piece claiming two-high shells suppress TE and slot production is entirely paywalled and could not be checked. Publicly available coverage argues the OPPOSITE — two-high zone shells are described as vulnerable to easy receptions over the middle, which would HELP TEs. No published r/R² exists in either direction.
- **Data:** PFF/FTN charting (2-high vs 1-high shell rate); not in base nflverse tables
- **Notes:** MAJOR DOWNGRADE from moderate/1.0. The gap-hunt entry asserted a suppression mechanism whose sole source cannot be read and whose sign is contradicted by free sources. Keep at token weight until someone measures TE points/route against 2-high vs 1-high directly; do not ship a signed adjustment on this.

<a id="te-opponent-pass-rush-pressure-rate"></a>
#### Opponent pass-rush / pressure rate

**Weekly 0.4% · Season 0.2%** · Matchup/Opponent · stability: medium · evidence: estimated

- **Mechanism:** A heavy opposing rush shortens the QB's clock and modestly raises checkdown and hot-route volume to the TE — the defensive mirror of the OL-quality mechanism.
- **Key numbers:** No TE-isolated published figure; inferred from the same pressure/checkdown mechanism, which itself is weakly sourced.
- **Data:** nflverse pbp pressure rate (defense side)

<a id="te-run-blocking-grade-snap-retention-mechanism"></a>
#### Run-blocking grade (snap-retention mechanism)

**Weekly 0.3% · Season 1.2%** · Efficiency/Talent · stability: high · evidence: weak

- **Mechanism:** Blocking competency is what wins and keeps early-down snaps for in-line TEs; poor run-blockers get packaged off the field on run downs regardless of receiving ability, capping total snaps before route share is even in play.
- **Key numbers:** BrainyBallers PFF-grade study: top-5 fantasy TEs carried a higher average college run-block grade than TE31-50 finishers in 100% of study seasons, with ~69.6+ cited as a threshold; a companion receiving-grade study found Pearson r ≈ 0.266 between top PFF receiving-grade seasons and fantasy points.
- **Data:** PFF grades (paid) or FTN run-block participation as a free proxy
- **Notes:** DOWNGRADED from moderate: "higher average in 100% of seasons" over a small sample with no reported significance test is a weak design, and the modern move-TE archetype largely bypasses the mechanism. Distinct from in-line blocking-snap rate (that is routes lost to blocking already assigned; this is whether blocking competency wins the snap at all).

<a id="te-home-away-split"></a>
#### Home/away split

**Weekly 0.3% · Season 0.3%** · Situational/Schedule · stability: low · evidence: moderate

- **Mechanism:** Small general home-field scoring edge; close to nil for pass-catchers specifically.
- **Key numbers:** WR ≈ 0% home/away effect, DST +1.3 pts, QB +7%, K +0.2-0.5 (factors.md). TE assumed WR-like by analogy — no TE split published.
- **Data:** nflverse load_schedules
- **Notes:** Tiebreaker only. Largely priced into the Vegas spread already.

<a id="te-in-season-ecr-dfs-salary-momentum"></a>
#### In-season ECR / DFS-salary momentum

**Weekly 0.3% · Season 0.2%** · Market/Consensus · stability: low · evidence: estimated

- **Mechanism:** Weekly movement in expert rankings and DFS pricing encodes fast-moving beat and practice-report information not yet present in any structured dataset.
- **Key numbers:** No isolated published coefficient; used as a small blending signal by analogy to the ADP cold-start finding.
- **Data:** nflverse load_ff_rankings weekly snapshots + DFS site salaries
- **Notes:** Beware circularity — PLAN.md §5 benchmarks the engine AGAINST ECR, so weighting ECR as an input contaminates the eval. Use the DELTA (rank movement) only, never the level.

<a id="te-week-18-rest-risk"></a>
#### Week 18 rest risk

**Weekly 0.3% · Season 0%** · Situational/Schedule · stability: low · evidence: weak

- **Mechanism:** Teams with locked or eliminated playoff position rest starters in Week 18 — directionally certain, magnitude unpredictable game to game.
- **Key numbers:** "Real every year, direction certain, magnitude unpredictable; handle via manual/news tracking" (factors.md). No modelable rate published.
- **Data:** hand-maintained playoff-seeding tracker + news feed
- **Notes:** Affects one week of 18 — the low weight reflects frequency, not the size of the effect in that week, where it can be total.

<a id="te-injury-type-recurrence-specific-body-part"></a>
#### Injury-type recurrence (specific body part)

**Weekly 0.2% · Season 2.8%** · Health/Injury · stability: high · evidence: strong

- **Mechanism:** Same-body-part injuries recur at sharply elevated rates and predict multi-week and multi-season production deficits — a real, specific durability signal, unlike generalized fragility labels.
- **Key numbers:** ACL 25% re-injury vs 9% in controls, with large multi-season production deficits; hamstring 38.4% overall recurrence, 11.9% same-season (factors.md, peer-reviewed sports-medicine literature).
- **Data:** hand-maintained injury-history log + sports-medicine literature
- **Notes:** One of the best-evidenced factors in the whole catalog, but the effect operates over a season (games-missed distribution), which is why the weight is almost entirely on the season side. Deliberately contrasted with the debunked generalized injury-prone label below.

<a id="te-oc-scheme-change-uncertainty-widener"></a>
#### OC / scheme change (uncertainty widener)

**Weekly 0.2% · Season 1.7%** · Coaching/Scheme · stability: low · evidence: weak

- **Mechanism:** A new play-caller re-shuffles personnel usage and target distribution, and TE usage is the most scheme-elastic of the four positions — some systems feature TEs heavily, others barely target them.
- **Key numbers:** "No rigorous quantitative study exists" (factors.md, explicit industry gap); 21 of 32 teams changed OC entering 2026.
- **Data:** hand-maintained coach/OC table
- **Notes:** Widens the projection interval; must NOT be applied as a signed point adjustment, since no study establishes a direction.

<a id="te-new-te-roster-investment-depth-chart-competition-threat"></a>
#### New TE roster investment / depth-chart competition threat

**Weekly 0.2% · Season 1.5%** · Team Environment · stability: n/a · evidence: estimated

- **Mechanism:** A team spending notable draft capital, a trade, or real free-agent money on a competing TE threatens the incumbent's snap and target share regardless of the incumbent's own play — the offseason event that manufactures a committee.
- **Key numbers:** No published r. Directionally supported in reverse by the draft-capital ramp-up finding already in this list (early-round TEs get fast route/snap-share ramp-up, which must come from somewhere).
- **Data:** hand-maintained roster-transaction / draft-capital table
- **Notes:** Complements the two-TE committee variance driver: that measures ongoing volatility in an existing committee, this is the discrete event that creates one. Draft-time factor almost entirely.

<a id="te-man-coverage-yprr-role-retention-leading-indicator"></a>
#### Man-coverage YPRR (role-retention leading indicator)

**Weekly 0.2% · Season 1.2%** · Efficiency/Talent · stability: medium · evidence: weak

- **Mechanism:** TEs who win specifically against man coverage are likelier to hold or expand route share the following season — a forward-looking role signal distinct from aggregate season efficiency.
- **Key numbers:** DOWNGRADED: man-coverage YPRR showed the largest gap (35%) between TEs who retained high route participation and those who did not, but the source explicitly notes the split "isn't strongly predictive" and ranks ZONE YPRR first in usefulness — since NFL defenses play zone at roughly three times the man rate and TE aDOT sits shallow.
- **Data:** FTN/NGS coverage-split charting
- **Notes:** Evidence downgraded from moderate. The merged list quoted the 35% gap without the source's own caveat against it. Implementation note: zone YPRR is the better feature, and it is nearly collinear with overall YPRR.

<a id="te-drop-rate"></a>
#### Drop rate

**Weekly 0.2% · Season 0.2%** · Efficiency/Talent · stability: low · evidence: estimated

- **Mechanism:** Drops convert would-be catches into incompletions — a small, direct, immediately-scoring cost.
- **Key numbers:** No TE-specific published figure. Drop rate is low-stability across all positions and regresses hard toward positional mean.
- **Data:** PFF drop charting (paid) / nflverse approximation
- **Notes:** Largely subsumed by CROE, which is the better-formulated version of the same underlying skill.

<a id="te-bye-week"></a>
#### Bye week

**Weekly 0.2% · Season 0%** · Situational/Schedule · stability: high · evidence: strong

- **Mechanism:** Zero points, fully known in advance from the schedule — a hard exclusion gate rather than a continuous predictor.
- **Key numbers:** Deterministic from the schedule; not a modeled probability.
- **Data:** nflverse load_schedules
- **Notes:** Nominal weight is bookkeeping only — implement as a filter, not a scored input, or it will dominate any raw weekly variance decomposition.

<a id="te-short-week-thursday-travel-circadian"></a>
#### Short week / Thursday / travel-circadian

**Weekly 0.2% · Season 0%** · Situational/Schedule · stability: low · evidence: weak

- **Mechanism:** Short rest and cross-country travel modestly affect preparation and in-game energy; the West-coast-at-night effect is the one rigorously documented piece.
- **Key numbers:** West Coast teams beat the spread in 66% of night games vs East Coast opponents, 5.26 pts ATS (SLEEP journal, 1970-2011). Post-bye edge largely died with the 2011 CBA (2024 study: no significant effect); Thursday short-week effects small and eroding (factors.md).
- **Data:** nflverse load_schedules (rest days, travel distance)
- **Notes:** The one solid finding is a 1970-2011 team-level ATS result, not a player-level fantasy result, and the popular "West Coast team at 1pm ET" variant is NOT validated. Evidence downgraded from moderate.

<a id="te-rookie-te-learning-curve-year-1-depressed-year-2-3-breakout"></a>
#### Rookie TE learning curve (Year 1 depressed → Year 2-3 breakout)

**Weekly 0.1% · Season 1.7%** · Age/Career Arc · stability: medium · evidence: moderate

- **Mechanism:** TE has the steepest rookie learning curve of the skill positions (playbook complexity plus blocking assignments), so Year-1 production is a weak signal even for eventual elites, with Year 2-3 the common breakout window.
- **Key numbers:** "The learning curve at the position is steep... don't expect top-10 numbers in Year 1" (FantasyLife 2026); Mark Andrews 6.7 PPG as a rookie → 13.9 in Year 2 with Day-1 draft capital as the tell. Case examples, not a hit-rate table.
- **Data:** hand-maintained rookie-TE outcome tracking
- **Notes:** Widely replicated industry consensus but the cited support is anecdotal; a proper base-rate table (Year-1 PPG percentile → Year-2/3 outcome distribution) is buildable from nflverse and would upgrade this to strong.

<a id="te-veteran-te-trade-free-agency-assimilation-lag"></a>
#### Veteran TE trade / free-agency assimilation lag

**Weekly 0.1% · Season 0.6%** · Age/Career Arc · stability: low · evidence: estimated

- **Mechanism:** A veteran TE joining a new team faces playbook-fluency and QB-rapport ramp-up — a different cause from the rookie learning curve (draft-to-NFL jump) and from OC-change uncertainty (the play-caller's identity, not the player's assimilation).
- **Key numbers:** NO published bust-rate or ramp-up study exists despite targeted search — only anecdotes (2026 Likely, Goedert examples), none quantifying a lag. Estimated by analogy to QB-in-new-offense adjustment literature and to the rookie-TE curve.
- **Data:** hand-maintained transaction tracking (no structured dataset)
- **Notes:** Flagged as a genuine research gap. A direct study — year-1-with-new-team vs year-2 target-share trajectory for veteran TEs — would be cheap to run on nflverse data and is worth commissioning before this factor gets any real weight.

<a id="te-turf-vs-grass-injury-risk"></a>
#### Turf vs. grass injury risk

**Weekly 0.1% · Season 0.5%** · Weather/Venue · stability: high · evidence: weak

- **Mechanism:** Synthetic surfaces are associated with elevated lower-extremity soft-tissue injury rates, a fixed per-stadium characteristic that marginally raises weekly and season missed-time risk.
- **Key numbers:** OR 1.60 for season-ending injury on turf vs grass in 2021-22 data, but contested since — 2023 data shows near-parity (factors.md Tier 3).
- **Data:** nflverse load_schedules (surface field) + NFLPA injury data
- **Notes:** Included because it was in the project's own factors.md and absent from the TE list, but the contested replication keeps evidence at weak.

<a id="te-coach-4th-down-aggressiveness"></a>
#### Coach 4th-down aggressiveness

**Weekly 0.1% · Season 0.3%** · Coaching/Scheme · stability: medium · evidence: moderate

- **Mechanism:** Aggressive fourth-down coaches sustain more drives and run more plays, marginally raising total offensive volume including TE targets.
- **Key numbers:** r = 0.30 to offensive EPA/play; a sticky coach trait year over year (factors.md).
- **Data:** nflverse 4th-down decision data
- **Notes:** The r=0.30 is to team EPA/play, not to TE points — the path to a single TE's output is long and mostly already captured by pace and implied total.

<a id="te-primetime-divisional-familiarity"></a>
#### Primetime / divisional familiarity

**Weekly 0.1% · Season 0%** · Situational/Schedule · stability: low · evidence: weak

- **Mechanism:** Popular narratives that the primetime stage or repeated divisional exposure systematically change production.
- **Key numbers:** Primetime splits are single-source and confounded (low confidence); divisional familiarity effects "weak and weakening" (factors.md).
- **Data:** nflverse schedule flags
- **Notes:** Near-debunked; retained at token weight rather than zeroed because the evidence is thin rather than conclusively null.

<a id="te-age-curve"></a>
#### Age curve

**Weekly 0% · Season 4.2%** · Age/Career Arc · stability: high · evidence: strong

- **Mechanism:** TEs peak later and decline later than WR or RB, so the same age implies a very different remaining runway at this position than the cross-position default.
- **Key numbers:** TE peaks later than WR/RB and holds production to roughly age 34, versus RB peak 25.5 with a steep post-28 decline and WR peak 26-28 with a cliff at 32 (factors.md age-curve study).
- **Data:** nflverse historical age/production tables
- **Notes:** Pure draft-time prior — zero weekly weight since age does not move week to week. The TE-specific shape is what matters: applying a WR curve here would systematically fade 30-32 year-old TEs who are still in their prime.

<a id="te-offseason-vacated-target-share"></a>
#### Offseason vacated-target share

**Weekly 0% · Season 4%** · Opportunity/Volume · stability: medium · evidence: estimated

- **Mechanism:** Departed pass-catchers free target-tree share, and TEs are frequent beneficiaries when a WR1 leaves — the highest-leverage draft-time opportunity signal that trailing usage cannot see.
- **Key numbers:** Named as a structural gap by the prior audit; no TE-isolated redistribution coefficient published. Grounded in zero-sum target accounting.
- **Data:** hand-computed year-over-year roster/target tables from nflverse
- **Notes:** Weighted highly for an 'estimated' factor because the arithmetic is forced — the targets must be re-absorbed by someone — even though the TE's exact share of the absorption is unmeasured. This is the main correction to a pure trailing-usage draft projection.

<a id="te-vegas-season-win-totals"></a>
#### Vegas season win totals

**Weekly 0% · Season 3.4%** · Game Script/Vegas · stability: high · evidence: moderate

- **Mechanism:** Preseason win totals proxy season-long team quality and scoring environment, setting the ceiling on the offense a TE is attached to.
- **Key numbers:** QBs on high-win-total teams average 18.4-18.5 ppg vs 14.2 on low-total teams; RBs 26.6 vs 20.6 — replicated across two independent seasons (PFF/Barrett via factors.md). No TE-specific split published.
- **Data:** hand-maintained (sportsbook win totals)
- **Notes:** Evidence held at moderate rather than strong: the published splits are QB and RB, and the TE translation is an extrapolation. Season-only — weekly implied totals supersede it once games are on the board.

<a id="te-draft-capital-rookie-year-1-3-prior"></a>
#### Draft capital (rookie / Year 1-3 prior)

**Weekly 0% · Season 3%** · Age/Career Arc · stability: high · evidence: moderate

- **Mechanism:** Early-round TEs receive faster route and snap-share ramp-up and more coaching investment; the standard rookie prior, which decays as real usage accumulates.
- **Key numbers:** Draft capital r ≈ 0.29 to NFL production across positions (factors.md); College Dominator r ≈ 0.22, Breakout Age r ≈ 0.43. No TE-isolated hit-rate table located — the RB (R1-2 ≈55% vs R4 ≈6%) and WR (R4+ 4.4% top-30) figures are position-specific and do NOT transfer.
- **Data:** nflverse draft/roster tables
- **Notes:** Should decay to near-zero by roughly Week 6 of Year 1, once route share is measurable — draft capital is a proxy for expected role, and measured role dominates it.

<a id="te-prospect-athleticism-ras-sporq"></a>
#### Prospect athleticism (RAS / SPORQ)

**Weekly 0% · Season 1.3%** · Age/Career Arc · stability: medium · evidence: moderate

- **Mechanism:** Unlike WR, where combine testing is nearly uncorrelated with fantasy output, functional athleticism at TE size is scarce enough that testing separates hits from misses — big, fast TEs create the coverage mismatches the position's value rests on.
- **Key numbers:** MIXED, PARTIALLY CORRECTED: FantasyPoints' SPORQ score retains meaningfully positive correlation to TE fantasy production even after controlling for draft capital — the strongest form of this claim. BrainyBallers reports an 8.8-9.9 RAS optimal band and that of 20 TEs with a TE1 season only 3 tested poorly in any key category. Contrast with WR RAS r = 0.014 (factors.md).
- **Data:** hand-maintained combine/RAS database (RAS is free; SPORQ is FantasyPoints)
- **Notes:** Weight cut from 1.5 and the claim softened. The BrainyBallers stat is survivorship reasoning with no control group (it never reports how many well-testing TEs busted), and broader coverage describes the RAS-to-success correlation as modest with enormous variance, with Mark Andrews the standing counterexample. The SPORQ-after-draft-capital result is what actually carries this factor. The 'ignore combine testing' WR rule genuinely does not transfer to TE — but the effect is modest, not large.

<a id="te-prospect-archetype-in-line-y-te-vs-move-big-slot-te"></a>
#### Prospect archetype: in-line Y-TE vs. move/big-slot TE

**Weekly 0% · Season 0.5%** · Age/Career Arc · stability: n/a · evidence: estimated

- **Mechanism:** Independent of testing, a prospect's projected NFL role archetype predicts how fast he clears the blocking-snap gate into real route volume — move/big-slot TEs ramp faster than traditional Y-TEs at equal athleticism.
- **Key numbers:** No isolated published effect size. Directional support from TE draft-evaluation practice (PFF, Cover 1 profiles routinely separate blocking-required Y-TEs from move TEs when projecting rookie-year role).
- **Data:** hand-scouted archetype tag at draft time (no free structured dataset)
- **Notes:** Adds incremental value over RAS and the rookie curve by explaining ramp-up SPEED rather than eventual ceiling. Rookie-only; irrelevant once route share is observed.

<a id="te-contract-year-status"></a>
#### Contract-year status

**Weekly 0% · Season 0%** · Other · stability: n/a · evidence: strong

- **Mechanism:** Popular theory that pending free agency boosts effort and production.
- **Key numbers:** No statistically significant contract-year effect (Football Outsiders 12-year regression, replicated multiple times) (factors.md).
- **Data:** n/a
- **Notes:** DEBUNKED — zero weight, retained for completeness.

<a id="te-garbage-time-inflation-of-trailing-box-scores"></a>
#### Garbage-time inflation of trailing box scores

**Weekly 0% · Season 0%** · Other · stability: n/a · evidence: moderate

- **Mechanism:** Historical TE receiving stats accumulated in large-margin garbage time inflate the trailing usage inputs; a data-cleaning step applied before box scores feed the projection.
- **Key numbers:** "Inflates WR/pass-catcher stats far more than RB; audit prior-year box scores for garbage-time share before projecting forward" (factors.md Tier 2).
- **Data:** nflverse pbp (score differential + game state)
- **Notes:** 0/0 as an audit lens, same pattern as the two entries above. It matters a lot in practice — it changes the VALUE of the highest-weighted factor in this list — but it is a preprocessing step, not a factor.

<a id="te-generalized-injury-prone-label"></a>
#### Generalized 'injury-prone' label

**Weekly 0% · Season 0%** · Other · stability: n/a · evidence: strong

- **Mechanism:** Treating an accumulation of unrelated past injuries as predictive of future missed time.
- **Key numbers:** Only same-body-part recurrence is predictive; the generalized fragility label is NOT supported (factors.md, sports-medicine literature).
- **Data:** n/a
- **Notes:** DEBUNKED — deliberately paired with the injury-TYPE recurrence factor (2.8 season), which IS real. The distinction between the two is the entire point and must survive into the UI's risk badges.

<a id="te-half-ppr-scoring-format-translation"></a>
#### Half-PPR scoring-format translation

**Weekly 0% · Season 0%** · Other · stability: n/a · evidence: strong

- **Mechanism:** Half-PPR sits between standard and full PPR: it rewards possession volume less than full PPR and TDs/yardage relatively more — a points-conversion rule, not a predictive factor.
- **Key numbers:** Arithmetic from the stated rules (0.5/rec, 1 pt/10 yds, 6/rec TD), not an empirical effect size.
- **Data:** rules-derived
- **Notes:** 0/0 by construction, but it is the lens applied across every OTHER weight in this list — see calibration_notes for how the half-PPR adjustment was actually applied.

<a id="te-hot-hand-efficiency-streaks"></a>
#### Hot hand / efficiency streaks

**Weekly 0% · Season 0%** · Other · stability: n/a · evidence: strong

- **Mechanism:** Belief that a TE 'getting hot' over recent weeks predicts continued outperformance.
- **Key numbers:** Streaks are TD and efficiency outliers — the most mean-reverting stats there are; USAGE increases are the real signal (factors.md). Corroborated at TE specifically: receiving TDs correlate 0.74 with same-season PPG but only 0.33 with next-season PPG (FantasyLife 2026).
- **Data:** n/a
- **Notes:** DEBUNKED — and the single most dangerous myth at TE specifically, because the position's TD-driven boom weeks are exactly what generate the illusion. The route/target-share trend is the legitimate version of this instinct.

<a id="te-positional-replacement-level-flatness-te-tier-structure"></a>
#### Positional replacement-level flatness (TE tier structure)

**Weekly 0% · Season 0%** · Other · stability: high · evidence: moderate

- **Mechanism:** Beyond the top few TEs, half-PPR TE scoring is famously flat — TE12 through TE24 cluster tightly relative to the steeper RB and WR curves. This shapes draft VALUE, not any individual's point total.
- **Key numbers:** The TE1 tier produces roughly 8.5 pts/game more than a streaming option (~127.5 season points); the top TE's edge over TE12 can exceed WR1's edge over WR24 (positional-tier synthesis).
- **Data:** nflverse historical positional scoring distributions
- **Notes:** Deliberately 0/0. This is a VOR-layer input (PLAN.md §4.2) governing cross-player draft value, not a predictor of any single player's variance. Including it in the factor weighting would be a category error.

<a id="te-preseason-box-score-production"></a>
#### Preseason box-score production

**Weekly 0% · Season 0%** · Other · stability: n/a · evidence: strong

- **Mechanism:** Belief that strong preseason stat lines predict regular-season role or production.
- **Key numbers:** Preseason box scores are meaningless — preseason ADP predicts as well as the first four real games (r 0.599 vs 0.585). Preseason USAGE (first-team snaps) is informative; production is not (factors.md).
- **Data:** n/a
- **Notes:** DEBUNKED for production. Note the live carve-out: preseason first-team snap/route participation is a legitimate early read on the route-share factor, especially for rookie and new-team TEs.

<a id="te-revenge-games-trap-letdown-games"></a>
#### Revenge games / trap-letdown games

**Weekly 0% · Season 0%** · Other · stability: n/a · evidence: strong

- **Mechanism:** Narratives that revenge motivation or lookahead letdowns systematically swing production.
- **Key numbers:** Revenge: 49.5% of 384 skill players beat their average (coin flip), QBs 35% — worse than baseline. Trap/letdown: good teams won MORE (80.5%/82.2% vs a 79.5% baseline), not significant (Harvard, 2002-2011) (factors.md).
- **Data:** n/a
- **Notes:** DEBUNKED — zero weight, retained for completeness.

<a id="te-simple-sos-funnel-defense-season-rankings"></a>
#### Simple SOS / funnel-defense season rankings

**Weekly 0% · Season 0%** · Other · stability: n/a · evidence: strong

- **Mechanism:** Ranking opponents by season-long fantasy points allowed to TE and treating that rank as a stable matchup predictor.
- **Key numbers:** Points allowed to TE has YoY correlation of just 0.16, the lowest of any position; top-5 TE defenses repeat 21% of the time and bottom-5 only 16% (4for4 2026, 2015-2025). Illustrative: Denver allowed 15.7 TE ppg in 2023 and 11.9 in 2024, breaking every schedule projection built on the prior year.
- **Data:** n/a
- **Notes:** DEBUNKED — and this is now the best-documented null in the TE catalog. It is precisely why the opponent-coverage-matchup factor above was cut from 4.0 to 1.8 weekly and must use LB/S personnel quality rather than points-allowed rank.

<a id="te-wopr-composite-1-5-tgtshare-0-7-airydsshare"></a>
#### WOPR composite (1.5×TgtShare + 0.7×AirYdsShare)

**Weekly 0% · Season 0%** · Opportunity/Volume · stability: high · evidence: moderate

- **Mechanism:** A fixed linear combination of target share and air-yards share — the standard packaged form of the opportunity signal.
- **Key numbers:** WOPR documented at >0.70 YoY for pass-catchers generally (RotoViz); no TE-isolated figure published. Both of its inputs are separately weighted in this list.
- **Data:** nflverse computed
- **Notes:** ZEROED, per the flagged correction, which was VALID. WOPR carries no information beyond its two inputs — it is a linear combination of them, so weighting it independently double-counts target share (which already holds the largest weight in both columns) and air-yards share. Keep WOPR as the IMPLEMENTATION form of the composite opportunity feature if it backtests better than the two inputs entered separately, but it is not an independent factor and must never be scored alongside them.

