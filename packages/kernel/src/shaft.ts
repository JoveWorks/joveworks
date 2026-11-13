/**
 * The closed forms behind a `shaft` record (`FormulaShaft` in the schema):
 * a shaft on two simple supports, loaded in one transverse plane at a time.
 *
 * Everything is canonical (mm, N, N·mm) and evaluated at one point `z` — the
 * evaluator calls this once per grid cell, so accuracy never depends on how
 * densely `z` is swept.
 *
 * Signs: a force or a rate is positive up, a couple positive clockwise with
 * z to the right, and the bending moment positive when it sags. A load at or
 * before `z` counts, the same "at or before" rule the v1 diagrams used.
 */

/** A point load's share of one plane: its force, and the couple entering this plane's moment. */
export interface PlanePoint {
  readonly at: number;
  readonly force: number;
  readonly couple: number;
}

/** A distributed load's share of one plane. */
export interface PlaneSpan {
  readonly from: number;
  readonly to: number;
  readonly rate: number;
}

export interface PlaneLoads {
  readonly points: readonly PlanePoint[];
  readonly spans: readonly PlaneSpan[];
}

/** A support and the reaction solved at it. */
interface Reaction {
  readonly at: number;
  readonly force: number;
}

/**
 * The two reactions, from statics: the shear and the moment both close to
 * zero past every load and support. Writing M(z) for z beyond everything,
 * `Σ F·(z − p) + Σ C + R_A·(z − a) + R_B·(z − b) = 0` for every such z, so
 * `R_A + R_B = −Σ F` and `R_A·a + R_B·b = Σ C − Σ F·p`, with each span
 * standing in as its total at its centroid.
 */
export function reactions(loads: PlaneLoads, a: number, b: number): readonly [number, number] {
  let total = 0;
  let moment = 0;
  for (const point of loads.points) {
    total += point.force;
    moment += point.couple - point.force * point.at;
  }
  for (const span of loads.spans) {
    const force = span.rate * (span.to - span.from);
    total += force;
    moment -= force * (span.from + span.to) / 2;
  }
  const rB = (moment + a * total) / (b - a);
  return [-total - rB, rB];
}

function withReactions(loads: PlaneLoads, a: number, b: number): readonly Reaction[] {
  const [rA, rB] = reactions(loads, a, b);
  return [{ at: a, force: rA }, { at: b, force: rB }];
}

/** How far z has advanced into a span: 0 before it starts, its whole length once past it. */
function into(span: PlaneSpan, z: number): number {
  return Math.min(Math.max(z - span.from, 0), span.to - span.from);
}

export function shear(loads: PlaneLoads, a: number, b: number, z: number): number {
  let total = 0;
  for (const point of loads.points) if (point.at <= z) total += point.force;
  for (const span of loads.spans) total += span.rate * into(span, z);
  for (const reaction of withReactions(loads, a, b)) if (reaction.at <= z) total += reaction.force;
  return total;
}

export function moment(loads: PlaneLoads, a: number, b: number, z: number): number {
  let total = 0;
  for (const point of loads.points) {
    if (point.at <= z) total += point.force * (z - point.at) + point.couple;
  }
  for (const span of loads.spans) {
    // The rectangle swept so far, about z: its force times the arm to its
    // own centroid.
    const length = into(span, z);
    total += span.rate * length * (z - span.from - length / 2);
  }
  for (const reaction of withReactions(loads, a, b)) {
    if (reaction.at <= z) total += reaction.force * (z - reaction.at);
  }
  return total;
}

/**
 * E·I·y(z), zero at both supports. The moment integrated twice: each force
 * contributes `F·(w − p)³/6` and each couple `C·(w − p)²/2`, up to the two
 * constants of integration `y = 0` at each support pins down. A distributed
 * load is the caller's to refuse — its term is not implemented.
 */
export function stiffnessDeflection(loads: PlaneLoads, a: number, b: number, z: number): number {
  const supports = withReactions(loads, a, b);
  const integral = (w: number): number => {
    let total = 0;
    for (const point of loads.points) {
      if (point.at > w) continue;
      total += (point.force * (w - point.at) ** 3) / 6 + (point.couple * (w - point.at) ** 2) / 2;
    }
    for (const reaction of supports) {
      if (reaction.at <= w) total += (reaction.force * (w - reaction.at) ** 3) / 6;
    }
    return total;
  };
  const atA = integral(a);
  const atB = integral(b);
  const c1 = (atA - atB) / (b - a);
  const c2 = -(atA + c1 * a);
  return integral(z) + c1 * z + c2;
}

/** The running total of applied torque at or before z. */
export function torque(points: readonly { readonly at: number; readonly torque: number }[], z: number): number {
  let total = 0;
  for (const point of points) if (point.at <= z) total += point.torque;
  return total;
}
