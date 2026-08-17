# Pocket milling — power envelope

This example asks a design-study question rather than calculating one cutting
condition:

> How quickly can a pocket be rough-milled without exceeding the spindle's
> power or torque limit?

Open it from **Help → Examples → Pocket milling — power envelope**. It uses the
public Machining catalogue bundled with NodeBook; no course catalogue is
required.

## Starting point

The study uses a 50 mm cutter with four effective teeth. The target cutting
speed is 180 m/min, giving a spindle speed of about 1146 rpm. The remaining
fixed inputs are:

| Parameter | Value |
|---|---:|
| Axial depth of cut, `a_p` | 4 mm |
| Specific cutting force, `k_c` | 1800 N/mm² |
| Machine efficiency, `eta` | 0.85 |
| Total fed toolpath length, `L` | 800 mm |
| Machine input-power limit | 5.5 kW |
| Cutting-torque limit | 35 Nm |

Specific cutting force is held constant so the example stays focused on the
power envelope. That assumption is useful for an initial study, but it is not
valid for every tool, material, engagement, or chip thickness.

## The two-input sweep

Two inputs use explicit lists:

- Chip load `f_z`: `{0.08, 0.12, 0.16, 0.20, 0.24} mm/tooth`
- Radial engagement `a_e`: `{10, 20, 30, 40} mm`

Together they produce a 5 × 4 grid of cutting conditions. These are deliberate
candidates, not evenly spaced samples of an abstract range: every cell is a
setting that could be selected on the machine.

The graph evaluates forward through the machining catalogue:

```text
cutting speed + diameter
           │
           ▼
     spindle speed ───────────────┐
           │                      │
chip load + teeth                 │
           │                      │
           ▼                      │
       table feed                 │
           │                      │
depth + engagement                │
           │                      │
           ▼                      │
     removal rate                 │
           │                      │
specific cutting force           │
           │                      │
           ▼                      ▼
     cutting power ───────► cutting torque
           │
      efficiency
           │
           ▼
    machine input power
```

The same table feed also combines with the 800 mm path length to estimate time
in cut.

## Reading the result

The removal-rate contour rewards moving toward greater chip load and radial
engagement. The power and torque contours then remove parts of that apparently
attractive region:

- At `f_z = 0.20 mm/tooth` and `a_e = 40 mm`, input power remains below
  5.5 kW, but cutting torque exceeds 35 Nm.
- At `f_z = 0.24 mm/tooth` and `a_e = 40 mm`, both limits are exceeded.
- At `f_z = 0.24 mm/tooth` and `a_e = 30 mm`, both limits are satisfied.

The last of those is the most productive feasible point in this discrete grid:

| Result | Value |
|---|---:|
| Table feed | about 1100 mm/min |
| Material-removal rate | about 132 cm³/min |
| Net cutting power | about 3.96 kW |
| Machine input power | about 4.66 kW |
| Cutting torque | about 33.0 Nm |
| Time in cut | about 0.73 min |

The important result is not merely that one row passes. The contours show the
feasible frontier and how sensitive the choice is to either parameter. A
single calculator result would hide that structure.

## What still needs engineering judgement

The selected point is a candidate operating condition, not a production
recommendation. Before using it, check at least:

- the tool manufacturer's chip-load, engagement, and speed limits;
- tool and workpiece deflection;
- chatter and the machine-tool stability region;
- chip thinning where the engagement makes it relevant;
- insert count actually engaged in the cut;
- workholding, coolant, chip evacuation, and surface-finish requirements.

The power model also treats `k_c` as constant. In practice, specific cutting
force can change with material, chip thickness, rake geometry, wear, and other
conditions. Adjusting or sweeping `k_c` is a natural next study when better
process data are available.

The speed, feed, removal-rate, power, and torque relations follow the standard
metric definitions collected in Sandvik Coromant's public
[Formulas and definitions for milling](https://cdn.sandvik.coromant.com/files/sitecollectiondocuments/services/metal-cutting-e-learning/formulas-and-definitions/formulas-and-deinitions-for-milling-metric-enu.pdf).
