# Reliability studies

A Monte Carlo study asks how often a design fails when its inputs scatter. In
JoveWorks, random generators introduce one shared, paired **trial axis**. Every
downstream formula evaluates once per trial, a Check turns each result into a
pass/fail verdict, and the Reliability output turns those verdicts into a
failure probability with an uncertainty interval.

## Opening example: will the tolerance stack fit?

Suppose a shaft is nominally 20.00 mm with standard deviation 0.01 mm and its
hub bore is nominally 20.03 mm with standard deviation 0.012 mm.

1. Add two normal Monte Carlo generators, using the stated means and standard
   deviations in mm. Give both the same sample count.
2. Subtract shaft diameter from bore diameter to obtain clearance.
3. Add a Check that clearance is at least 0 mm.
4. Add a Reliability output and select that Check.

The answer is the probability of interference, not merely a cloud of clearance
samples. Add a Distribution output on clearance to see where the overlap sits,
and switch between histogram and CDF to read it in two complementary ways.

All generators share the same trial axis: shaft sample 42 pairs with bore
sample 42. They never create a cross-product. This is also why wiring any
generator's `value` into a Statistic node's `along` port identifies the trial
axis.

## Choosing a distribution

- Use **uniform** when every value in known bounds is equally plausible.
- Use **normal** for symmetric measured scatter around a nominal value.
- Use **triangular** when only a minimum, most-likely value, and maximum are
  defensible.
- Use **lognormal** for positive, right-skewed quantities such as load or
  material-strength measurements. JoveWorks takes the mean and standard
  deviation of the variable itself, not of its logarithm.
- Use **discrete** for alternatives or resampling measured values. Wire a
  spectrum of values and optionally a spectrum of weights; absent weights are
  equal.

Correlation groups are not supported. Two generators share trial indices but
draw independently; modelling dependent quantities requires a future joint
sampling mechanism.

## Histogram or CDF?

A histogram emphasizes shape, modes, tails, and overlap. Its automatic bin
count is stable across screen and print sizes. An empirical CDF answers direct
questions such as “what fraction lies below this clearance?” and reaches
exactly 1 at the largest sample. Percentile rules on either figure use the same
interpolation as a wireable Percentile Statistic node.

For load against strength, make both inputs lognormal, subtract load from
strength to form a margin, and check that the margin is non-negative. The
histogram explains the overlapping tails; the Reliability card states what
that overlap means.

## Reading Pf, its interval, and β

Failure probability **Pf** is observed failures divided by trials. Reliability
index **β = Φ⁻¹(1 − Pf)** expresses the same estimate on a standard-normal
scale: larger positive β means lower failure probability.

Pf without an interval overstates what the run learned. JoveWorks reports a
two-sided Wilson interval, which remains non-zero even when no failure was
observed. With n trials, the smallest observable non-zero probability is 1/n.
Therefore zero observed failures is shown honestly as `Pf < 1/n` and
`β > Φ⁻¹(1 − 1/n)`, never as Pf = 0 or β = infinity. Raise the sample count if
that floor is too coarse for the decision.

## A percentile as a design value

Some studies need a quantile rather than Pf. Bearing life is commonly quoted as
an L10 value: the 10th percentile. Add a Percentile Statistic, set it to 10,
wire the trial generator into `along`, and wire its `result` into the next
calculation or a Check. This is why percentiles are graph nodes rather than text
inside a report card.

## How many samples are enough?

Turn on `running` for a Mean or Probability Statistic and plot its result
against the trial generator. A trace that still drifts or jumps has not settled.
The Reliability card's interval is the numerical counterpart: as trials grow,
it should narrow around a stable Pf. Increase the count until both the trace and
the interval support the precision the decision needs.

## Crossing trials with a design sweep

A diameter range combined with random trials produces a diameter × trial grid.
To compute Pf **per diameter**, wire the trial generator into the Probability
Statistic's `along` port. Leaving `along` unwired pools diameter and trial into
one meaningless number; JoveWorks warns and names both axes. A Distribution
output can instead put each diameter in its own facet.

## Common failure mode: nothing is random

If referenced Checks do not vary along the trial axis, Pf can only be zero or
one by construction and estimates nothing. The Reliability card reports
“nothing in this study is random” instead of treating that deterministic result
as a reliability estimate.
