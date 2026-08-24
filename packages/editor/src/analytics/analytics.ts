/**
 * The editor's entire analytics boundary.
 *
 * Event names and properties deliberately form a closed vocabulary: graph
 * content, formula metadata, values, file names, and exception text never
 * cross this boundary. A disabled build creates no script element or request.
 */

export type NodeKind =
  | 'input'
  | 'file'
  | 'formula'
  | 'output'
  | 'compare'
  | 'closure'
  | 'frame'
  | 'waypoint'
  | 'pack'
  | 'unpack'
  | 'monteCarloGenerator'
  | 'monteCarloReceiver';

export type SweepKind =
  | 'slider'
  | 'linear'
  | 'logarithmic'
  | 'list'
  | 'renard'
  | 'tableColumn'
  | 'categoricalList';

export type CourseMaterial = 'platform' | 'pad' | 'cantilever' | 'milling';

export type AnalyticsEvent =
  | { readonly name: 'catalogue_loaded' | 'example_opened' | 'graph_created' | 'nodes_connected' | 'document_saved' | 'notebook_exported' }
  | { readonly name: 'mobile_landing_viewed' }
  | { readonly name: 'course_viewer_opened'; readonly props: { readonly viewport: 'narrow' | 'wide' } }
  | { readonly name: 'course_material_selected'; readonly props: { readonly material: CourseMaterial } }
  | { readonly name: 'node_added'; readonly props: { readonly kind: NodeKind } }
  | { readonly name: 'sweep_configured'; readonly props: { readonly kind: SweepKind } }
  | { readonly name: 'plot_created'; readonly props: { readonly mode: 'line' | 'contour' } }
  | { readonly name: 'table_created' | 'check_created' }
  | { readonly name: 'catalogue_load_failed'; readonly props: { readonly reason: 'invalid_file' } }
  | { readonly name: 'document_load_failed'; readonly props: { readonly reason: 'invalid_file' } }
  | { readonly name: 'catalogue_unlocked' }
  | { readonly name: 'catalogue_unlock_failed'; readonly props: { readonly reason: 'wrong_password' } };

export interface Analytics {
  track(event: AnalyticsEvent): void;
}

export const noOpAnalytics: Analytics = { track: () => undefined };

export interface PlausibleOptions {
  readonly scriptUrl: string;
}

interface PlausibleFunction {
  (event: string, options?: { readonly props?: Readonly<Record<string, string>> }): void;
  q?: unknown[][];
  o?: { readonly endpoint?: string };
  init?: (options?: { readonly endpoint?: string }) => void;
}

declare global {
  interface Window {
    plausible?: PlausibleFunction;
  }
}

/** Install the site-specific Plausible snippet and return its adapter. */
export function plausibleAnalytics(options: PlausibleOptions, target: Window = window): Analytics {
  const queued: PlausibleFunction = (event, eventOptions) => {
    (queued.q ??= []).push([event, eventOptions]);
  };
  target.plausible ??= queued;
  target.plausible.init ??= (initOptions) => {
    queued.o = initOptions ?? {};
  };
  target.plausible.init();

  const script = target.document.createElement('script');
  script.async = true;
  script.src = options.scriptUrl;
  target.document.head.append(script);

  return {
    track(event): void {
      const properties = 'props' in event ? event.props : undefined;
      target.plausible?.(event.name, properties === undefined ? undefined : { props: properties });
    },
  };
}

function configuredAnalytics(): Analytics {
  if (
    import.meta.env.VITE_ANALYTICS !== 'plausible' ||
    !import.meta.env.VITE_PLAUSIBLE_SCRIPT_URL
  ) return noOpAnalytics;

  return plausibleAnalytics({
    scriptUrl: import.meta.env.VITE_PLAUSIBLE_SCRIPT_URL,
  });
}

/** The sole analytics instance application code may use. */
export const analytics = configuredAnalytics();
