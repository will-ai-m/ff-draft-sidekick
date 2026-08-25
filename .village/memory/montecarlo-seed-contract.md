# `deriveSeed` is a wire format — the golden pin is the only guard

`packages/server/src/simulation/montecarlo.ts`

## The contract

Survival percentages are deterministic by board: the Monte Carlo seed is derived by FNV-hashing the
board (universe players, window picks, config) with `\0` separators, so an unchanged board reproduces
identical percentages. That is what makes the PRD's SC-2 stability guardrail hold structurally rather
than on average, and what made QA's `kill -9` cold-reattach snapshot come back **byte-identical**.

Because the separator is *inside the hashed string*, changing its spelling changes every seed and
therefore every survival percentage and plan score. Measured directly: switching the five `\0`
separators to spaces moved one fixed board's seed from `1136439564` to `3675795148`.

## The only thing that would notice

`packages/server/src/simulation/montecarlo.test.ts:791` —
`expect(deriveSeed(universe, picks, config())).toBe(3486165602)`.

Every other assertion in that file is relative, so this golden pin is the **sole** guard. If you
change anything that feeds the seed, re-derive the value and say in the same commit why the stream
had to move (the maintenance contract is stated in the comment above the test).

## History worth knowing

The separators were originally five **literal `0x00` bytes** in the source. Effects: `file` reported
the module as binary `data`, and `grep` could not see it at all — `grep -rn "deriveSeed"` and
`grep -c export` both returned nothing, hiding a 26KB core module from every search. Caught at
code_review as a blocking issue and replaced with `\0` escapes, which are the same U+0000 in a TS
template literal, so the seed provably did not move (verified by reconstructing the pre-repair file
byte-for-byte).

**Lesson:** never put a raw control byte in source text. Use the escape; the compiled value is
identical and the file stays greppable.
