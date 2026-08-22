# 2026 Half-PPR: Compiled ADP Board vs FantasyPros ECR

**Data pulled Aug 21, 2026.** Full board: [half-ppr-2026-board.csv](half-ppr-2026-board.csv) (186 players, sorted by consensus ADP).
Source inventory: [adp-sources-2026.md](adp-sources-2026.md).

---

## 1. What went into the board

| Source | Feed | Rows | Freshness |
|---|---|---|---|
| **Fantasy Football Calculator** half-PPR | `api/v1/adp/half-ppr?teams=12&year=2026` | 225 | 2,741 mocks, 8/16–8/21 |
| **Yahoo** (native 0.5 PPR) | Fantasy Life `/api/datatables/adps` | 185 | 8/21 19:27Z |
| **Sleeper** (native 0.5 PPR) | same | 186 | 8/21 19:31Z |
| **RTSports** (0.5 PPR) | same | 180 | 8/21 19:45Z |
| **Underdog** best ball (0.5 PPR) | same — *carried as a column, excluded from consensus* | 176 | 8/21 19:46Z |
| **Draft Sharks** half-PPR consensus | DOM scrape, `/adp/half-ppr/consensus-sleeper-yahoo/12` | 160 matched | live |
| **FantasyPros half-PPR ECR** | `ecrData` blob on `rankings/half-point-ppr-cheatsheets.php` | 865 | 8/21, **103 experts** |

**Consensus ADP** = mean of FFC, Yahoo, Sleeper, RTSports (see the Yahoo correction below). Underdog is best-ball shape (18 rounds, no K/DST, WR-heavy) so it sits in its own column rather than in the average. Draft Sharks' consensus is itself a Sleeper+Yahoo blend, so it's a cross-check column, not an input.

### Sources that could NOT be pulled
- **FantasyPros ADP composite** — the ADP table is now account-gated; only 5 rows render logged-out. (Its *ECR* is still open, which is what the comparison uses.)
- **RotoWire** half-PPR ADP — premium ("Projections are a RotoWire premium feature").
- **Fantasy Points** — $60/yr paywall.
- **FantasyCalc** `ppr=0.5` — trade *values*, not ADP; not comparable.

---

## 2. Two artifacts you have to correct for before reading any outlier

### Yahoo's ADP floor
Yahoo ADP **hard-caps at 133.3**. Distribution of its 185 values: 49 inside picks 0–50, 46 in 50–100, 23 in 100–118, then **48 players jammed into 126–136 and zero beyond**. Past ~pick 118, Yahoo reads ~30 picks earlier than the other half-PPR sources (n=67, mean +31, median +30).

Left uncorrected this manufactures fake "reaches" for every deep player — Tyreek Hill at Yahoo 131.5 against Sleeper 213 / RTSports 260 / Underdog 216 is a reporting floor, not a market signal. **The board drops Yahoo from the consensus for any player whose Yahoo ADP is ≥118.**

### FantasyPros over-ranks QBs
Median (ADP rank − ECR rank) by position:

| Pos | n | median Δ |
|---|---|---|
| QB | 28 | **+16.0** |
| TE | 28 | +1.0 |
| WR | 66 | −1.0 |
| RB | 58 | −2.0 |

Overall ECR is not submitted — experts submit *positional* lists and FantasyPros' Rank Converter maps them to an overall order. That converter systematically places QBs ~16 picks ahead of where 1QB leagues actually draft them. So "the experts love Bo Nix / Purdy / Mahomes / Lawrence more than the market" is a methodology artifact repeated 28 times, not 28 findings.

---

## 3. The massive outliers

Δ = ADP rank (skill players only) − ECR rank. **Positive = falls past where experts rank him. Negative = drafted ahead of where experts rank him.**

### Market drafts him far earlier than ECR

| Player | Pos | ADP | ECR | Δ | ECR sd | FFC / Yah / Sle / RT / UD |
|---|---|---|---|---|---|---|
| Tyreek Hill | WR (FA) | 236.6 | 317 | **−137** | 45.6 | – / 131.5 / 213.4 / 259.8 / 215.6 |
| Greg Dulcich | TE MIA | 204.8 | 269 | **−98** | 43.1 | 177.0 / 132.1 / 230.4 / 207.0 / 187.4 |
| David Njoku | TE LAC | 200.9 | 238 | **−69** | 26.2 | – / 124.7 / 207.5 / 194.4 / 212.3 |
| Cooper Kupp | WR SEA | 218.0 | 234 | −58 | 28.7 | 154.8 / 120.6 / 225.1 / 274.0 / 212.5 |
| Jaydon Blue | RB DAL | 187.7 | 220 | −54 | 46.0 | 167.0 / 127.9 / 232.5 / 163.7 / 172.8 |
| Isaac TeSlaa | WR DET | 202.1 | 219 | −49 | 24.6 | 180.7 / 126.0 / 212.4 / 213.2 / 190.1 |
| Fernando Mendoza | QB LV | 229.8 | 228 | −49 | 59.9 | – / 120.8 / 178.3 / 281.3 / 185.8 |
| **Jordyn Tyson** | **WR NO** | **93.8** | **127** | **−37** | 27.5 | 114.6 / 92.4 / 78.6 / 89.6 / 87.8 |
| James Conner | RB ARI | 210.9 | 212 | −37 | 35.7 | – / 126.1 / 216.3 / 205.5 / 215.5 |
| Aaron Rodgers | QB PIT | 207.6 | 208 | −35 | 48.8 | – / 116.3 / 227.9 / 278.7 / 183.0 |
| Pat Freiermuth | TE PIT | 255.4 | 215 | −33 | 26.4 | – / 124.5 / 239.9 / 270.9 / 196.9 |
| **Deebo Samuel Sr.** | **WR SF** | **123.4** | **149** | **−25** | 33.0 | 108.5 / 127.7 / 137.6 / 124.2 / 127.5 |
| **Rashid Shaheed** | **WR SEA** | **137.2** | **154** | **−24** | 19.1 | 119.6 / 128.3 / 158.2 / 133.9 / 133.5 |
| **Romeo Doubs** | **WR NE** | **120.7** | **135** | **−15** | 18.3 | 107.1 / 131.9 / 131.3 / 123.7 / 118.7 |

### ECR ranks him far higher than the market drafts him

| Player | Pos | ADP | ECR | Δ | ECR sd | FFC / Yah / Sle / RT / UD |
|---|---|---|---|---|---|---|
| C.J. Stroud | QB HOU | 194.7 | 140 | +27 | 27.6 | 166.0 / 125.8 / 204.9 / 213.2 / 146.6 |
| Cam Ward | QB TEN | 222.5 | 153 | +25 | 43.9 | – / 125.7 / 208.2 / 236.8 / 153.6 |
| Jordan Love | QB GB | 155.9 | 121 | +24 | 18.8 | 154.1 / 124.4 / 146.6 / 167.0 / 116.7 |
| Malik Willis | QB MIA | 172.0 | 136 | +23 | 46.2 | 156.5 / 124.8 / 192.5 / 166.9 / 134.0 |
| Justin Herbert | QB LAC | 91.4 | 69 | +19 | 13.5 | 109.6 / 69.1 / 83.4 / 103.4 / 83.5 |
| Tyler Shough | QB NO | 153.9 | 126 | +18 | 26.1 | 137.5 / 130.0 / 169.4 / 154.9 / 125.9 |
| **Juwan Johnson** | **TE NO** | **164.1** | **134** | **+18** | 20.0 | 163.9 / 129.2 / 187.1 / 141.4 / 144.9 |
| Bryce Young | QB CAR | 241.2 | 164 | +17 | 44.9 | – / 122.8 / 229.7 / 252.7 / 164.5 |
| **Dalton Schultz** | **TE HOU** | **205.1** | **156** | **+16** | 26.6 | – / 129.2 / 193.2 / 217.0 / 163.0 |
| Caleb Williams / Lawrence / Purdy / Nix / Murray / Mayfield / Darnold / D.Jones | QB | — | — | +16 each | 13–36 | see CSV |

**Every entry on this side except Juwan Johnson and Dalton Schultz is a QB — i.e. the +16 positional artifact, not a real disagreement.** Strip the QB median and only the two TEs survive as genuine.

### Genuine, high-confidence disagreements
Filtered to players where the experts internally agree (ECR sd ≤ max(8, 13% of ECR rank)) *and* the ADP sources agree with each other (spread ≤ max(25, 28% of ADP)), then position-adjusted:

| Player | Pos | ADP | ECR | adj Δ | Read |
|---|---|---|---|---|---|
| David Njoku | TE LAC | 200.9 | 238 | −70 | Market still drafts him as a starter; experts have written him off |
| Isaac TeSlaa | WR DET | 202.1 | 219 | −48 | Rookie-hype premium in drafts |
| Pat Freiermuth | TE PIT | 255.4 | 215 | −34 | Experts rank him ~40 picks better than anyone drafts him |
| Brock Bowers | TE LV | 27.2 | 17 | +7 | ECR sd 3.7 — near-unanimous top-20; FFC mocks (43.4) are the lone holdout vs Yahoo/Sleeper/RT/UD ~21 |
| Josh Allen | QB BUF | 26.6 | 26 | −18 | Only QB drafted *ahead* of his QB-inflated ECR |
| A.J. Brown, DeVonta Smith, Zay Flowers, T. McMillan, T. McLaurin | WR | 20–52 | — | +5 to +6 | Consistent small WR fade: experts a half-round higher than the room |

### Two names worth acting on inside the draftable range
Everything above pick 150 is noise-dominated. Inside the top ~130 there are only two large, clean gaps:

- **Jordyn Tyson (WR NO), ADP 93.8 vs ECR 127 (−37).** Every market source has him ~pick 79–115; experts have him at 127 with sd 27.5. The room is paying a full two rounds more than consensus opinion supports.
- **Justin Herbert (QB LAC), ADP 91.4 vs ECR 69 (+19).** Survives the QB adjustment (+19 vs the +16 positional median only marginally), so treat it as mostly artifact — but note FFC mocks (109.6) sit 40 picks behind Yahoo (69.1), the widest QB source disagreement on the board.

---

## 4. Caveats
- ADP is a trailing average; FFC's window is 8/16–8/21, Yahoo/Sleeper/RTSports are same-day snapshots. Mixing them slightly smooths news.
- ECR ranks come from a list that **excludes K/DST**; the board's skill-only rank column (`adp_rank_skill`) is what's compared, so the two are on the same scale.
- **Ricky Pearsall (SF WR)** and **Jayden Higgins (HOU WR)** appear in ADP data but are absent from all 865 rows of the half-PPR ECR — worth checking their status before drafting either.
- Draft Sharks reports ADP as integer ranks, not decimals, so its column is a sanity check on ordering only.
