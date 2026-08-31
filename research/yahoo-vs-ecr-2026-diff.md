# Yahoo Top-300 vs FantasyPros ECR — 2026 half-PPR discrepancies

- **Yahoo:** consensus of 6 analysts, fetched 2026-08-28 ([source](https://sports.yahoo.com/fantasy/article/fantasy-football-rankings-consensus-top-300-drafts-160643679.html), captured in [yahoo-consensus-top300-2026.md](yahoo-consensus-top300-2026.md)).
- **ECR:** FantasyPros half-PPR overall ECR (the same snapshot source Draft Sidekick attaches with), fetched 2026-08-28.
- **Method:** matched by abbreviated name + team + position (FP `player_short_name` uses Yahoo's exact format); Δ = ECR rank − Yahoo rank, so **positive Δ = Yahoo is higher (earlier) on the player than the expert consensus**, negative = Yahoo is lower. Tables limited to players inside either top-150 — deep-tail deltas are mostly noise.
- **Coverage:** 300 of 300 Yahoo rows matched to ECR; 0 unmatched (listed at bottom).

## Yahoo higher than ECR (Yahoo loves them — ECR would let you wait)

| Player | Pos | Team | Yahoo | ECR | Δ (ECR−Yahoo) |
|---|---|---|---:|---:|---:|
| De'Zhaun Stribling | WR | SF | 93 | 144 | +51 |
| Mike Washington Jr. | RB | LV | 128 | 166 | +38 |
| KC Concepcion | WR | CLE | 99 | 132 | +33 |
| Keenan Allen | WR | IND | 150 | 181 | +31 |
| MarShawn Lloyd | RB | GB | 121 | 151 | +30 |
| Matthew Golden | WR | GB | 102 | 126 | +24 |
| Ray Davis | RB | BUF | 149 | 167 | +18 |
| Jeremiyah Love | RB | ARI | 28 | 42 | +14 |
| Jalen Coker | WR | CAR | 113 | 125 | +12 |
| Keaton Mitchell | RB | LAC | 127 | 139 | +12 |
| Stefon Diggs | WR | WAS | 90 | 101 | +11 |
| Sam LaPorta | TE | DET | 71 | 81 | +10 |
| Chris Rodriguez Jr. | RB | JAC | 111 | 121 | +10 |
| Denzel Boston | WR | CLE | 148 | 158 | +10 |
| DJ Moore | WR | BUF | 48 | 57 | +9 |
| Parker Washington | WR | JAC | 56 | 65 | +9 |
| Jordan Addison | WR | MIN | 95 | 104 | +9 |
| Jayden Reed | WR | GB | 96 | 105 | +9 |
| Kenneth Walker III | RB | KC | 12 | 20 | +8 |
| Rome Odunze | WR | CHI | 51 | 59 | +8 |

## ECR higher than Yahoo (Yahoo fades them — values by ECR in Yahoo rooms)

| Player | Pos | Team | Yahoo | ECR | Δ (ECR−Yahoo) |
|---|---|---|---:|---:|---:|
| Dylan Sampson | RB | CLE | 181 | 146 | -35 |
| Isiah Pacheco | RB | DET | 176 | 149 | -27 |
| C.J. Stroud | QB | HOU | 167 | 147 | -20 |
| Drake Maye | QB | NE | 62 | 44 | -18 |
| Michael Pittman Jr. | WR | PIT | 105 | 88 | -17 |
| Patrick Mahomes II | QB | KC | 119 | 102 | -17 |
| Baker Mayfield | QB | TB | 135 | 118 | -17 |
| Hunter Henry | TE | NE | 160 | 143 | -17 |
| Lamar Jackson | QB | BAL | 50 | 35 | -15 |
| Courtland Sutton | WR | DEN | 100 | 85 | -15 |
| Jakobi Meyers | WR | JAC | 126 | 111 | -15 |
| Joe Burrow | QB | CIN | 63 | 49 | -14 |
| Travis Kelce | TE | KC | 120 | 107 | -13 |
| Wan'Dale Robinson | WR | TEN | 110 | 98 | -12 |
| Jake Ferguson | TE | DAL | 142 | 130 | -12 |
| Tyler Shough | QB | NO | 138 | 127 | -11 |
| Aaron Jones Sr. | RB | MIN | 125 | 115 | -10 |
| Mark Andrews | TE | BAL | 134 | 124 | -10 |
| Deebo Samuel Sr. | WR | SF | 145 | 135 | -10 |
| A.J. Brown | WR | NE | 23 | 14 | -9 |

## Why this matters for Sidekick

Yahoo default rooms draft against Yahoo's board, the way Sleeper rooms draft against Sleeper's. A player Yahoo ranks far above ECR will be gone earlier than ECR-based survival expects (and vice versa) — the same behavioral-source divergence measured across four mock rehearsals (see OQ-3 in the PRD: the survival model is moving to platform ADP for exactly this reason). For drafting: the second table is the shopping list in Yahoo leagues; the first table is who to take early or not at all.

