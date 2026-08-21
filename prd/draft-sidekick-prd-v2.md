# PRD: Draft Sidekick

*Status:* Draft v2
*Author:* Suraj Sinha
*Date:* August 20, 2026

---

## 1. Summary

Draft Sidekick is a live draft agent that recommends your next pick by predicting everyone else's.

It connects to a draft in progress, maintains a model of all N rosters, and answers one question before every pick: given who will pick between now and my next turn, what they need, and how each of them actually behaves, which player maximizes my roster's expected value?

Every draft tool on the market ranks players. Draft Sidekick models managers. That is the product.

## 2. Problem

A snake draft is a sequential game with perfect information about the past and predictable structure in the future. Every roster is visible. Every roster implies unfilled needs. Every manager has tendencies that reveal themselves within a dozen picks. None of this is used.

Instead, the category ships static ranking lists. A ranking answers "who is the best player available." That is almost never the decision in front of the manager. The decision is:

*Which of these two players will still be here at my next pick?* A player projected at 143 points who is a coin flip to survive 26 picks is worth less than a player projected at 137 who is certain to survive, if the second pick can capture the first.

*Which position empties before I pick again, and which one doesn't?* This depends entirely on the composition of the intervening picks. Ten teams that all need a tight end with four tight ends left is a different world from ten teams that all have one.

*What is this specific room going to do next?* Not the market. This room, these fourteen or thirty-two people, several of whom reach forty picks past ADP for a quarterback and one of whom has never drafted a tight end before round nine in his life.

The manager is left to derive all of this manually, under a clock, while the board turns over. Most do not. The ones who do are doing it badly, because the arithmetic is unforgiving and the information decays hourly during draft season.

## 3. Core insight: two models, and the gap between them

The engine maintains two independent predictions for every upcoming pick.

*The normative model: what should this team do?* Given their roster, the league's roster requirements, the remaining board, and their own future pick positions, what is their value-maximizing selection? This is the same optimization we run for our own manager, applied to theirs.

*The behavioral model: what will this manager do?* Given everything we have observed about this specific person, in this draft and prior ones, what are they actually going to select?

*The gap between those two predictions is the alpha.*

When a manager is about to make a suboptimal pick, we know a good player is falling to us and we can wait. When a manager is about to reach for a position we also need, we know to move early. When an entire room is systematically mispricing a position, we know to be on the other side of it.

A tool that only models optimal play assumes the room is efficient. It is not. A tool that only models observed tendencies has nothing to compare against. Running both is what converts opponent modeling from a novelty into a recommendation.

## 4. Customer

*Primary:* the manager who already researches, already has a spreadsheet, and is losing to information asymmetry rather than effort. They are in a league with real stakes and at least one setting that deviates from default.

*Secondary:* the manager in a large, unusual, or high-stakes league who wants a defensible pick without three hours of prep.

The product should be useful to a first-time drafter and indispensable to an expert. The expert is who we design for.

## 5. Goals and non-goals

*Goals*
- One recommendation, with reasoning, in under five seconds
- Correct about player status today, not three weeks ago
- Model the draft as a sequential game against specific opponents
- Work in any format without reconfiguration by the user beyond connecting the league

*Non-goals*
- In-season lineup management (v2)
- Trade analysis (v2)
- Auction and salary cap drafts (v2, materially different game)
- Replacing judgment. The agent recommends and explains. The manager decides.

## 6. The engine

### 6.1 Snake window computation

Before every recommendation, compute the exact set of picks between the manager's current pick and their next, and which team owns each one.

This is arithmetic and it is the foundation. Get it wrong and every downstream output is invalid. It is also the highest-leverage single input in the system, because it converts "who is best" into "who will not be here later."

The windows are asymmetric and that asymmetry is exploitable. In a snake, a manager near the turn faces a short wait then a long one. The composition of who owns those intervening picks changes completely between rounds. Teams that pick twice before your next turn matter twice as much.

### 6.2 Opponent need vector

For every team, maintain a live vector of unfilled starting slots: league roster requirements minus current roster, weighted by how many picks remain to fill them.

This produces position-level prediction with high confidence. A team holding one running back and no receivers in a three-receiver league is taking a receiver. That is close to deterministic.

### 6.3 Manager fingerprint

The behavioral model. Learn, per manager, within the current draft and across prior drafts where available:

| Feature | Signal | Why it matters |
|---|---|---|
| Reach magnitude | Average picks past ADP | Predicts whether targets survive |
| Positional bias | Deviation from format-normal position share | Identifies the QB-early or TE-punt manager |
| Need vs BPA | Correlation between roster holes and selections | Determines whether the need vector predicts them at all |
| Risk tolerance | Rate of drafting flagged or injured players | Predicts who takes the falling star |
| Run behavior | Do they initiate, follow, or fade positional runs | Predicts cascade dynamics |
| Ranking source alignment | Which published list best fits their picks | Powerful: many managers draft a list |
| Team bias | Over-selection of one NFL roster | Small but real, and cheap to detect |
| Engagement | Pick timing, autodraft, queue depth | Autodrafters are perfectly predictable |

*Cold start matters.* Most drafts are the first observation of most managers. The system must produce useful behavioral predictions from twelve to twenty observed picks. Design for that case first and treat cross-draft history as an enhancement rather than a requirement.

Position-level prediction converges fast. Player-level prediction does not. Report confidence accordingly.

### 6.4 Availability projection

Combine the window, the need vectors, and the fingerprints into a per-player probability of surviving to the manager's next pick. Surface as three bands: likely gone, coin flip, likely available.

This single output is what turns a ranking into a decision.

### 6.5 Multi-pick optimization

The recommendation is not the highest projection available. It is the selection that maximizes expected value across the manager's current pick and the next one or two, given availability projections at each.

Taking WR now and RB next produces a different total than RB now and WR next. Compute both. Recommend the higher. When the difference is inside the noise, say so and fall back to secondary criteria rather than manufacturing a distinction.

### 6.6 League-calibrated scarcity

Compute the draftable pool per position for the actual league, not a generic one. Draftable is a function of league size: the last useful quarterback in a ten-team league and a thirty-two-team league are entirely different players.

Surface deficit as share of remaining pool, not absolute count. A position short by eleven bodies out of twenty-one is a crisis. Short by two out of thirty-two is noise.

### 6.7 Run and deferral detection

Track the rate each position comes off the board against its baseline for the format. Flag deviations within three picks.

Detect deferral as carefully as runs. A long stretch of picks from teams that all need a position, with nobody taking it, is either a sustained inefficiency to exploit or an imminent violent correction. The agent should say which, and why, rather than reporting the count.

## 7. Format as configuration

Format is a parameter the engine consumes, not a product variant. It sets the objective function and the scarcity denominators. Everything else in the engine is unchanged.

| Format | Objective | What it changes |
|---|---|---|
| Head to head redraft | Weekly win probability | Balanced floor and ceiling |
| Points league / total points | Season aggregate | Ceiling weighted, consistency discounted |
| Best ball | Season ceiling with weekly optimization | Spike weeks valuable, floor nearly irrelevant |
| Survival / elimination | Avoid bottom N each week | Floor dominant, value horizon truncated to expected weeks alive |
| Dynasty and keeper | Multi-year surplus | Age and draft capital weighted, current-year injuries discounted |
| Superflex / 2QB | Same as base, different scarcity | Quarterback denominator doubles |
| IDP, TE premium, PPR variants | Same as base, different scoring | Positional values recomputed from scoring rules |

The system should read league settings from the platform and infer the objective without asking the user to select a mode. Where the objective is genuinely ambiguous, ask once.

## 8. Data architecture

| Layer | Source | Refresh |
|---|---|---|
| Draft state | Platform API (Sleeper first, ESPN and Yahoo next) | Real time |
| League settings | Platform API | Once at init |
| Projections | Multi-source consensus with variance retained | Daily |
| ADP | Platform-specific where available, composite fallback | Daily |
| News, injury, practice reports | Beat writers, wire services, participation reports | Hourly in preseason |
| Usage history | Snap share, target share, targets per route run, touches, red zone | Weekly in season |
| Manager history | Prior drafts in the same league or platform where accessible | Per draft |

*Two data principles worth stating explicitly.*

Projections are inputs, not answers. A projection assumes a full season at a rate the player may never have sustained. Surface the assumption alongside the number.

Player status must be verified at recommendation time, not at ingestion time. Draft season peaks in the final three weeks of August, which is exactly when camp injuries, depth chart resolutions, and holdouts land. A ranking published on the first of the month is materially wrong by the twentieth. The agent should never recommend a player without checking today's report, and should distinguish "out for the season" from "misses two weeks" from "unresolved timeline." Unresolved is the worst of the three, because it cannot be priced.

## 9. Recommendation output

Every recommendation returns four things:

1. One name
2. One line of reasoning
3. The runner-up, and the condition that flips it
4. The plan for the next two picks

Not a ranked list of fifteen. The manager is on a clock and a list pushes the decision back to them, which is the thing they came here to avoid.

Where the agent's recommendation depends on a behavioral prediction, say so: "Team 7 needs a tight end and has reached past ADP twice, so I expect the position to go before your next pick." Transparency about the model is how trust gets built, and it is also how the manager catches our errors.

## 10. Success metrics

*Primary:* win rate and points-scored percentile of assisted teams against league baseline, measured across a cohort over a full season.

*Secondary*
- Recommendation acceptance rate. Below 60% means the agent is not trusted or not right
- Availability projection calibration. Of players marked likely available, what share actually were? Target 85%
- Position-level opponent prediction accuracy. Target 70% by round three
- Time to recommendation. Under five seconds
- Stale status incidents. Recommendations for players whose availability had already changed. Target zero

## 11. Risks

*Opponent modeling assumes managers are legible.* Some are not. A manager who reaches fifty picks past ADP three times in a row is noise, not signal. Mitigation: position-level prediction is robust where player-level is not. Report confidence honestly and degrade gracefully to need-vector prediction when the fingerprint is unstable.

*Projection quality is a dependency, not a moat.* Excellent game theory applied to bad projections produces bad picks. Mitigation: weight role certainty and usage data, which are more stable than point projections, and retain variance across sources rather than collapsing to a mean.

*News latency during the three weeks that matter.* A four-hour lag on an injury report is the difference between a good pick and a wasted one.

*Cold start.* Most drafts are the first observation of most managers. If the behavioral model needs a season of history, it is useless to a new user in August. Design the within-draft learner as the primary system.

*Overconfidence.* A confident agent that is wrong is worse than no agent. Every recommendation carries its own uncertainty, and the agent says plainly when two options are within noise.

## 12. Open questions

1. *Copilot or autodrafter?* Explanation builds trust but costs clock time. Hypothesis: copilot for the first three rounds, optional autopilot for the back half where the decisions are lower stakes.
2. *How much does platform-specific ADP beat composite ADP* at predicting a specific room? Hypothesis: substantially, and it is cheap to acquire.
3. *Does cross-draft manager history add enough over within-draft learning* to justify the acquisition cost and the privacy surface?
4. *What is the right form factor?* A companion app forces screen-switching under a clock. A browser extension overlaying the draft board is better and platform-fragile. Mobile is where most drafts happen and where overlays are hardest.
5. *Can we detect which published ranking list a manager is drafting from,* and how much predictive power does that single feature carry? Early intuition says it may be the strongest feature in the fingerprint.
