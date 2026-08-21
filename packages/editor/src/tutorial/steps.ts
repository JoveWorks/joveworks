/**
 * The tour's script — a fixed sequence, not a general authoring format.
 * Grounded in the pad-pressure sample (`model/samples.ts`, `padPressure`),
 * which is what a first-time student actually sees on the canvas.
 */

export interface TutorialStep {
  /** CSS selector for the element to spotlight. Omitted centers the caption
   * with no spotlight — used for the welcome and closing steps, and as the
   * fallback when a targeted step's element isn't on the page. */
  readonly target?: string;
  /** Node ids to expand for the duration of this step —
   * a targeted node's detail, and the fields inside it, only render while
   * the node is open, so a step that points inside one must expand it rather
   * than hope the student happens to have it open already. */
  readonly expandIds?: readonly string[];
  readonly title: string;
  readonly body: string;
  readonly placement: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    title: 'Welcome',
    body: "This is the pad pressure sweep: a 12 kN load on a 40 mm pad. A few nodes stand in for a hand calculation you'd otherwise do with a calculator and a table — wired together instead of typed line by line.",
    placement: 'center',
  },
  {
    title: 'What a wire means',
    body: 'Each line on the canvas carries one quantity from an output pin to an input pin. Follow the load F and the length L into the multiply node, then its result into the divide node — that is the whole calculation, laid out left to right.',
    placement: 'center',
  },
  {
    target: '[data-tour="input-w"]',
    expandIds: ['w'],
    title: 'An input turned into a range',
    body: 'The pad width, w, is not one number here — it sweeps from 10 to 60 mm. Everything wired downstream of it is recomputed at every point in the sweep.',
    placement: 'right',
  },
  {
    target: '[data-tour="value-kind-select"]',
    expandIds: ['w'],
    title: 'Turning an input into a range',
    body: "This dropdown is how w became a sweep. Pick linear, logarithmic, a slider or a list here to turn any plain input into a range, the same way — F and L could sweep too if there were a reason to.",
    placement: 'right',
  },
  {
    target: '[data-tour="notebook"]',
    title: 'Where the notebook comes from',
    body: "This panel is generated from the graph, not written by hand — every output node becomes an entry, grouped under the section frame it belongs to. Rename a node or rewire the graph, and the notebook follows.",
    placement: 'left',
  },
  {
    title: 'That covers the first five minutes',
    body: 'Take the tour again anytime from Help → Take the tour.',
    placement: 'center',
  },
];

interface ExampleTutorialCopy {
  readonly title: string;
  readonly opening: string;
  readonly inputTarget: string;
  readonly inputTitle: string;
  readonly inputBody: string;
  readonly studyTitle: string;
  readonly studyBody: string;
  readonly resultBody: string;
}

const EXAMPLE_COPY = {
  'platform-footprint': {
    title: 'Choose a safe platform size',
    opening: 'A short, plain-language example: compare platform widths and see which ones keep a fixed equipment load within an agreed floor limit.',
    inputTarget: '[data-tour="input-width"]',
    inputTitle: 'One decision, many options',
    inputBody: 'Platform width is the choice being compared. The graph tests 26 options automatically, from a narrow platform to a wider one.',
    studyTitle: 'The impact is visible, not hidden in a spreadsheet',
    studyBody: 'The fixed load and platform dimensions feed one live calculation. Every width produces a corresponding floor-pressure result.',
    resultBody: 'The threshold turns the chart into a decision: widths after the crossing meet the agreed limit. The value, pass/fail check and chart all come from the same graph.',
  },
  'pad-pressure': {
    title: 'Pad pressure sweep',
    opening: 'This example sizes a rectangular pad by sweeping its width under a fixed load and bearing-pressure limit.',
    inputTarget: '[data-tour="input-w"]',
    inputTitle: 'Width is the design choice',
    inputBody: 'Pad width is a linear sweep from 10 to 60 mm. One graph evaluates every candidate width; there is no loop to write.',
    studyTitle: 'The graph is the calculation',
    studyBody: 'Load divided by pad area produces pressure. The same result feeds a printed value, a limit check and a plot.',
    resultBody: 'Use the threshold on the pressure plot to see where the design first clears 2 N/mm², rather than treating the sweep as a list of unrelated answers.',
  },
  'monte-carlo-clearance': {
    title: 'Clearance-fit stack-up',
    opening: 'A Monte Carlo example: an independently toleranced hole and shaft combine into a clearance that varies sample to sample, instead of one worst-case subtraction.',
    inputTarget: '[data-tour="monteCarloGenerator-hole"]',
    inputTitle: 'A generator is a range, drawn rather than swept',
    inputBody: 'Hole and shaft each draw from their own normal distribution instead of stepping between a start and a stop — the same axis role a range input plays, but each sample is random rather than evenly spaced. Combined generators draw one trial each, paired sample by sample.',
    studyTitle: 'Watch the aggregate converge',
    studyBody: 'The receiver plays the clearance back sample by sample and accumulates a running mean and histogram — press play and watch it settle rather than reading one final number.',
    resultBody: 'The printed clearance and the interference check both read the same wired difference the receiver is watching — nothing about the calculation itself depends on playback.',
  },
  'belt-lab': {
    title: 'Belt lab',
    opening: 'This worked example turns the belt-drive assignment into a forward calculation from the given motor, pulley and belt data.',
    inputTarget: '[data-tour="input-P"]',
    inputTitle: 'Assignment data starts on the left',
    inputBody: 'The input nodes hold the stated design values and units. Follow their wires into the formula nodes to see exactly which result each value influences.',
    studyTitle: 'A calculation chain, not a form',
    studyBody: 'Formula nodes calculate design power, ratio, belt length, shaft distance, belt count, speed and bending frequency from left to right.',
    resultBody: 'The output nodes collect the quantities worth reporting. They do not recalculate anything: each is a presentation boundary fed by the graph.',
  },
  'pressfit-lab': {
    title: 'Cylindrical press-fit lab',
    opening: 'This worked example turns the PressFit1 assignment into a typed calculation of interference and fit tolerance.',
    inputTarget: '[data-tour="input-D_F"]',
    inputTitle: 'Fit geometry starts the calculation',
    inputBody: 'The input nodes state the fit diameter, wall geometry, loads, material data and surface roughness. Each unit stays visible at its boundary.',
    studyTitle: 'Required and permissible interference meet',
    studyBody: 'The graph derives contact pressure and compliance, then compares the minimum required fit against the maximum the hub permits.',
    resultBody: 'The notebook gathers the design force, contact pressure, interference limits and tolerance split into the values needed to select a fit.',
  },
  'cantilever-hollow-sections': {
    title: 'Cantilever — hollow sections',
    opening: 'This example compares five standard hollow-section diameters for the deflection of a loaded steel cantilever.',
    inputTarget: '[data-tour="input-d_o"]',
    inputTitle: 'Sweep sizes you can select',
    inputBody: 'Outer diameter is an explicit list of standard sizes. The inner diameter is derived from it and the wall thickness, so the geometry stays consistent.',
    studyTitle: 'One sweep, several views',
    studyBody: 'The varying diameter propagates through section inertia and beam deflection. Table, plot and check nodes all read that same evaluated sweep.',
    resultBody: 'The plot shows sensitivity and the limit crossing; the table preserves the exact candidates. Together they show why only the largest listed section passes.',
  },
  'milling-power-envelope': {
    title: 'Pocket milling — power envelope',
    opening: 'This example studies productivity against a milling machine’s power and torque limits over a two-dimensional parameter grid.',
    inputTarget: '[data-tour="input-f_z"]',
    inputTitle: 'The first study axis',
    inputBody: 'Chip load is an explicit list of candidate values. Radial engagement is a second list, so downstream values broadcast over every pair.',
    studyTitle: 'Two sweeps form a design grid',
    studyBody: 'Feed, removal rate, power, torque and cutting time are evaluated for the full chip-load × engagement grid without duplicating the graph.',
    resultBody: 'Read the power and torque contours together: their thresholds carve out the feasible region, while the productivity plot shows what is gained inside it.',
  },
} as const satisfies Readonly<Record<string, ExampleTutorialCopy>>;

export type TutorialExampleId = keyof typeof EXAMPLE_COPY;

/** A longer walkthrough for a loaded example. Its shared notebook steps make
 * the canvas/report relationship explicit, while the study steps explain what
 * is distinctive about each graph. */
export function exampleTutorialSteps(id: TutorialExampleId): readonly TutorialStep[] {
  const copy = EXAMPLE_COPY[id];
  return [
    { title: copy.title, body: copy.opening, placement: 'center' },
    {
      title: 'Start with the question',
      body: 'Read the graph from left to right: known inputs become calculated quantities, and the outputs on the right state what the study is meant to communicate.',
      placement: 'center',
    },
    {
      target: copy.inputTarget,
      title: copy.inputTitle,
      body: copy.inputBody,
      placement: 'right',
    },
    { title: copy.studyTitle, body: copy.studyBody, placement: 'center' },
    {
      title: 'Outputs answer the design question',
      body: copy.resultBody,
      placement: 'center',
    },
    {
      target: '[data-tour="notebook"]',
      title: 'The notebook is generated from the graph',
      body: 'The notebook is a live report view. Section frames provide its headings and notes; output nodes inside each frame become its values, checks, plots and tables. Edit the graph and the report updates with it.',
      placement: 'left',
    },
    {
      target: '[data-tour="notebook"]',
      title: 'Read sections in notebook order',
      body: 'The notebook follows the section order rather than the visual path of every wire. Use the canvas to understand and edit the calculation; use this panel to read the result as a document.',
      placement: 'left',
    },
    {
      title: 'Make the example your own',
      body: 'Close the tutorial, change an input or sweep, and watch both the downstream nodes and notebook respond. You can reopen the original example from Help at any time.',
      placement: 'center',
    },
  ];
}
