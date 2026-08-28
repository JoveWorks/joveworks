export type AppRoute =
  | { readonly kind: 'home' }
  | { readonly kind: 'publication'; readonly id: string; readonly edit: boolean }
  | { readonly kind: 'share'; readonly id: string; readonly edit: boolean };

export function parseRoute(url: URL): AppRoute {
  const match = /^\/(p|s)\/([^/]+)(\/edit)?\/?$/.exec(url.pathname);
  if (match === null) return { kind: 'home' };
  const route = { id: decodeURIComponent(match[2]!), edit: match[3] !== undefined };
  return match[1] === 'p' ? { kind: 'publication', ...route } : { kind: 'share', ...route };
}

export function hubOrigin(url: URL): string {
  const configured = url.searchParams.get('hub');
  return (configured === null ? url.origin : configured).replace(/\/$/, '');
}

export function routeHref(route: Exclude<AppRoute, { readonly kind: 'home' }>, hub?: string): string {
  const path = `/${route.kind === 'publication' ? 'p' : 's'}/${encodeURIComponent(route.id)}${route.edit ? '/edit' : ''}`;
  return hub === undefined ? path : `${path}?hub=${encodeURIComponent(hub)}`;
}

export function navigate(href: string): void {
  window.history.pushState({}, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
