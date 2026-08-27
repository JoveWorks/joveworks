# Analysis

Analysis turns a calculation into an engineering answer. Start by making the
requirements into **Checks**. Then choose the question you actually have:

| Question | Use | Short example |
|---|---|---|
| Where does a value meet a limit? | [Select](./node-reference#select) — threshold crossing | Find the diameter where deflection reaches 3 mm. |
| What is the first size I can actually set or buy? | [Select](./node-reference#select) — first passing size | Pick the first Renard shaft size that passes. |
| Where is a result smallest or largest? | [Select](./node-reference#select) — smallest/largest at | Find the speed with the lowest power demand. |
| Where do all requirements pass together? | [Feasibility](./node-reference#feasibility) | Shade the diameter × wall-thickness combinations that work. |
| Which input moves one result most? | [Sensitivity](./node-reference#sensitivity) | Learn whether load, radius, or material strength moves safety factor most. |
| Which feasible candidate should I build? | [Best Design](./node-reference#best-design) | Choose the lightest section that still passes every Check. |
| Which trade-offs are worth discussing? | [Pareto](./node-reference#pareto) | Show the sections that are not both heavier and less stiff. |
| How wrong may one assumption be? | [Assumption Stress](./node-reference#assumption-stress) | Raise a load factor until the marked shaft loses its safety margin. |
| What is a useful summary over a sweep or trials? | [Statistic](./node-reference#statistic) | Feed a 95th percentile clearance into the next Check. |
| What spread do random inputs produce? | [Distribution](./node-reference#distribution) | See the clearance histogram from measured tolerances. |
| How often does a random design fail? | [Reliability](./node-reference#reliability) | Estimate interference probability from tolerance scatter. |

## Four questions that sound similar

**Sensitivity** asks which input has the biggest effect on one result. It
changes each eligible input across its own bracket while holding the others
representative. Use it to decide what is worth measuring or refining.

**Best Design** chooses one of the candidates you already swept, using the
authored assumptions and the Checks you selected. Use it to write down a
nominal decision.

**Assumption Stress** holds a marked candidate fixed and changes one visible
range away from its first, authored value. Use it to say how much load-factor,
temperature, or friction error the design can tolerate before a margin reaches
zero. It is not a probability claim and does not quietly choose a more
favourable design.

**Reliability** uses Monte Carlo distributions when you can justify how an
input scatters. It answers “how often might this fail?”, with a confidence
interval—not “how far can I deliberately push this assumption?”.

## How the tools work together

### Choose, then challenge

1. Build a Check for each requirement.
2. Use Feasibility to see the region that works, then Best Design to choose a
   candidate.
3. Click the chosen candidate so it is marked A, B, or C throughout the
   NodeBook.
4. Turn a concern such as load factor into a directed range, wire it to
   Assumption Stress, and select the same Checks. The first point is the
   authored assumption; the report shows the first failure and shrinking
   margins.

### Compare honest trade-offs

Use the same Checks in a Pareto output, then mark one or two points on the
front. Assumption Stress gives each marked design its own margin report. This
separates “which trade-off do we prefer?” from “how robust is that choice?”.

### Model scatter when it is real

Use Sensitivity first to find inputs worth improving. If their variation is
genuinely random, replace those inputs with Monte Carlo generators. A
Distribution explains the spread, a Statistic supplies a mean/percentile to
another calculation, and Reliability reports failure probability. A Monte Carlo
receiver and a running Statistic help you see whether the estimate has settled.

Ranges and Monte Carlo are different on purpose: a range is a sequence you
choose to explore; Monte Carlo trials are random draws paired by trial number.
