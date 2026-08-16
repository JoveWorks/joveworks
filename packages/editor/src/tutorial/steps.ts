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
    title: 'An input turned into a range',
    body: 'The pad width, w, is not one number here — it sweeps from 10 to 60 mm. Everything wired downstream of it is recomputed at every point in the sweep.',
    placement: 'right',
  },
  {
    target: '[data-tour="value-kind-select"]',
    title: 'Turning an input into a range',
    body: "This dropdown is how w became a sweep. Pick linear, logarithmic, a slider or a list here to turn any plain input into a range, the same way — F and L could sweep too if there were a reason to.",
    placement: 'right',
  },
  {
    target: '.right',
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
