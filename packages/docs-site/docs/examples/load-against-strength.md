# Load against strength

> How likely is a scattered applied stress to exceed scattered material
> strength, and did we run enough trials to trust the estimate?

## Starting inputs

| Input | Distribution | Parameters |
|---|---|---|
| Applied stress | Lognormal | measured mean and standard deviation |
| Material strength | Lognormal | measured mean and standard deviation |

The lognormal parameters are the mean and standard deviation of each physical
quantity—not of its logarithm. Use the same stress unit for both.

Subtract applied stress from strength to obtain margin, then add a Check for
`margin ≥ 0`. A Reliability output referencing that Check reports observed
failures, Pf, its Wilson interval, and β. The interval is part of the answer: a
narrower interval after increasing the sample count is evidence the estimate
has become useful, while zero observed failures only establishes the displayed
`1/n` resolution bound.

Add a Distribution output on margin. The histogram shows the main body and the
failure tail left of zero; the CDF makes the fraction below zero directly
readable. Add 5th, 50th, and 95th percentile rules to describe the spread.

Finally, wire the Check verdict into a Probability Statistic with `match = fail`,
turn on `running`, wire the trial generator into `along`, and plot the result.
The running Pf should settle rather than continue jumping. Read that convergence
plot beside the Reliability interval: the first shows the history of the
estimate, and the second shows the uncertainty still attached to its final
value.
