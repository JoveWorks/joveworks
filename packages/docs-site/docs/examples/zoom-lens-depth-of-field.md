# A zoom lens wide open

> How much of the scene stays sharp across a Canon RF 100–500 mm
> f/4.5–7.1 zoom, used wide open?

The answer depends on two values that change together. As the zoom extends,
its widest aperture closes a third of a stop at a time, from f/4.5 at 100 mm
to f/7.1 at 500 mm. The aperture is not a second choice to sweep. It is a
property of the lens at each focal length, so the study reads it from a
table.

It uses the public **Photography** catalogue bundled with JoveWorks. Open
**Help → Photography → Depth of field — a zoom lens wide open** to explore the
finished graph. The numbers on this page are asserted in
`packages/editor/src/model/samples.test.ts`, so they fail a test if the
catalogue changes under them.

## The lens's aperture bands

The widest aperture for each focal-length band, from
[The-Digital-Picture's specification table](https://www.the-digital-picture.com/Reviews/Lens-Specifications.aspx?Lens=1510):

| Focal length | Widest aperture |
|---|---:|
| 100–150 mm | f/4.5 |
| 151–253 mm | f/5 |
| 254–362 mm | f/5.6 |
| 363–471 mm | f/6.3 |
| 472–500 mm | f/7.1 |

Interpolating linearly from f/4.5 to f/7.1 would give apertures this lens
cannot be set to, such as f/5.15. Depth of field is close to proportional to
the aperture here, so each reading would be off by as much as the aperture
is.

## The graph

```text
focal length f (100–500 mm) ──┬──► interpolate x ─┐
lookup table f ───────────────┼──► interpolate xs ├──► widest aperture N ──► hyperfocal N
lookup table N ───────────────┼──► interpolate ys ┘
                              ├──► hyperfocal f
                              └──► depth of field f
sensor diagonal ──► circle of confusion ──► hyperfocal c
hyperfocal H, subject distance s (slider) ──► depth of field
```

1. Add a [lookup table](/guide/node-reference#lookup-table) with two
   columns, `f` in mm and `N` without a unit. Give each band one row, keyed
   by the focal length where it **starts**: 100, 151, 254, 363 and 472 mm.
   Add a last row at 500 mm with f/7.1, so the table ends where the lens
   does and a focal length beyond it is refused.
2. Add an [Interpolate](/guide/node-reference#interpolate) node in
   **next row down** mode. Wire the table's `f` into `xs`, its `N` into
   `ys`, and the focal-length sweep into `x`. At 175 mm it finds the last
   row at or below it, 151 mm, and answers f/5.
3. Wire the interpolated aperture `y` into the hyperfocal formula's `N`, and
   the focal-length sweep into both formulas' `f`.
4. The circle of confusion comes from the sensor diagonal (43.27 mm, full
   frame, giving 28.85 µm). The subject distance is a slider from 1 to 75 m,
   shown in the notebook so a reader can move it.

The aperture is computed from the focal length, so it varies along the
focal-length axis: there is one depth-of-field value per focal length, not a
focal length × aperture grid.

## The result

At a subject distance of 50 m:

| Focal length | Widest aperture | Depth of field |
|---:|---:|---:|
| 100 mm | f/4.5 | 111.25 m |
| 200 mm | f/5 | 18.54 m |
| 300 mm | f/5.6 | 8.99 m |
| 400 mm | f/6.3 | 5.65 m |
| 450 mm | f/6.3 | 4.45 m |
| 475 mm | f/7.1 | 4.50 m |
| 500 mm | f/7.1 | 4.06 m |

Zooming in costs depth of field much faster than the closing aperture wins
it back: the aperture closes by about one and a third stops across the range,
while the focal length grows fivefold. The one exception is visible in the
plot. At 475 mm the lens has just closed to f/7.1, and the depth of field
rises slightly before the longer focal length takes over again.

The slider stops at 75 m because the hyperfocal distance at 100 mm, f/4.5 is
77 m. Focused beyond that, everything to infinity is acceptably sharp and the
far limit no longer has a finite value.

## A lookup table or a zip?

Use a lookup table when one value follows from another, as the aperture
follows from the focal length here. Use a [Zip](/guide/node-reference#zip)
when the lists describe separate items with no rule between them, such as a
bag of prime lenses, each with its own focal length and widest aperture.
