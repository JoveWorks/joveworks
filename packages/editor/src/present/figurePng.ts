/**
 * A figure, as it stands in the NodeBook, as a PNG.
 *
 * A figure here is not one SVG. Observable Plot draws the chart, but the
 * series legend and the contour colorbar beside it are HTML, and an axis label
 * carrying notation is KaTeX inside a `foreignObject` (`typesetChartLabels`).
 * Serialising the chart's own `<svg>` would lose all three. So the figure's
 * DOM is cloned whole into a `foreignObject` of a fresh SVG, together with the
 * page's stylesheet rules, and the browser rasterises that as an image.
 *
 * Three things follow from an SVG image being a sealed document:
 *
 * - **Styles come from rules, not from the page.** The clone keeps its
 *   ancestors as bare shells so selectors such as `.notebook .series-legend`
 *   still match, with each shell's own layout reset — only its class is
 *   wanted, not the panel's width, padding or scrolling.
 * - **It is always the light theme**, the same decision print makes: the
 *   theme tokens hang off `:root[data-theme]`, the image's root says `light`,
 *   and a figure exported from a dark editor still lands on a white page.
 * - **Nothing external loads**, web fonts included. KaTeX's are fetched and
 *   inlined as data URLs — only the faces the page has actually used — or a
 *   typeset label would fall back to a system serif at the wrong metrics.
 *
 * The image is drawn onto a transparent canvas and trimmed to what was
 * actually painted, rather than measured in the DOM first: a chart is centred
 * in a panel far wider than itself, and what was painted is the only account
 * of its extent that holds for every figure layout.
 */

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** Device pixels per CSS pixel — a figure pasted into a report is usually enlarged. */
const PNG_SCALE = 2;

/** White space kept around the trimmed figure, in CSS pixels. */
const PNG_PADDING = 12;

/** What the export changes about the page's own rules — the same omissions print makes. */
const EXPORT_RULES = [
  '[data-export-shell]::before,[data-export-shell]::after{content:none!important}',
  // A chart wider than its panel scrolls on screen; the image has no scrollbar.
  '.figure{overflow:visible!important}',
  '.plot-auto-reason{display:none!important}',
].join('');

const SHELL_STYLE = 'all:initial!important;display:block!important';

function faceKey(family: string, style: string, weight: string): string {
  const name = family.replace(/["']/gu, '').trim().toLowerCase();
  const numeric = weight === 'bold' ? '700' : weight === '' || weight === 'normal' ? '400' : weight;
  return `${name}|${style === '' ? 'normal' : style}|${numeric}`;
}

/** The faces this page has loaded — browsers fetch a web font only once something is set in it. */
function loadedFaces(): ReadonlySet<string> {
  const loaded = new Set<string>();
  // Absent in a test DOM, which has no font loading at all.
  (document.fonts as FontFaceSet | undefined)?.forEach((face) => {
    if (face.status === 'loaded') loaded.add(faceKey(face.family, face.style, face.weight));
  });
  return loaded;
}

function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('could not read a font'));
    reader.readAsDataURL(blob);
  });
}

/** An `@font-face` rule with its file inlined, or nothing if the file cannot be had. */
async function inlinedFontFace(rule: CSSFontFaceRule): Promise<string> {
  const sources = [
    ...rule.style.getPropertyValue('src').matchAll(/url\((["']?)(.*?)\1\)(?:\s*format\((["']?)(.*?)\3\))?/gu),
  ];
  const source = sources.find((match) => match[4] === 'woff2') ?? sources[0];
  const location = source?.[2];
  if (location === undefined) return '';
  try {
    const response = await fetch(new URL(location, rule.parentStyleSheet?.href ?? document.baseURI));
    if (!response.ok) return '';
    const data = await asDataUrl(await response.blob());
    const format = source?.[4] === undefined ? '' : ` format("${source[4]}")`;
    return [
      '@font-face{',
      `font-family:${rule.style.getPropertyValue('font-family')};`,
      `font-style:${rule.style.getPropertyValue('font-style') || 'normal'};`,
      `font-weight:${rule.style.getPropertyValue('font-weight') || 'normal'};`,
      `src:url("${data}")${format}}`,
    ].join('');
  } catch {
    // A label in a fallback font is a worse image, not a failed export.
    return '';
  }
}

/** Every rule the page styles with, as one stylesheet the image can carry. */
async function pageStyles(): Promise<string> {
  const rules: string[] = [];
  const fontFaces: CSSFontFaceRule[] = [];
  const loaded = loadedFaces();
  for (const sheet of document.styleSheets) {
    let sheetRules: CSSRuleList;
    try {
      sheetRules = sheet.cssRules;
    } catch {
      // A cross-origin sheet's rules are unreadable; none of the app's own are.
      continue;
    }
    for (const rule of sheetRules) {
      if (!(rule instanceof CSSFontFaceRule)) {
        rules.push(rule.cssText);
        continue;
      }
      const key = faceKey(
        rule.style.getPropertyValue('font-family'),
        rule.style.getPropertyValue('font-style'),
        rule.style.getPropertyValue('font-weight'),
      );
      if (loaded.has(key)) fontFaces.push(rule);
    }
  }
  const inlined = await Promise.all(fontFaces.map(inlinedFontFace));
  return [...inlined, ...rules, EXPORT_RULES].join('\n');
}

/** The figure cloned inside a bare shell of each ancestor — see the module doc. */
function staged(figure: HTMLElement): Element {
  const clone = figure.cloneNode(true) as HTMLElement;
  // A pinned hover tip is where the pointer last was, not part of the figure.
  for (const tip of clone.querySelectorAll('[aria-label="tip"]')) tip.remove();
  // The shells below reset what the figure would have inherited, so it is
  // handed the two inherited things it draws with: its type, and the ink.
  const computed = getComputedStyle(figure);
  clone.style.fontFamily = computed.fontFamily;
  clone.style.fontSize = computed.fontSize;
  clone.style.lineHeight = computed.lineHeight;
  clone.style.color = 'var(--ink, #1b1f24)';

  let node: Element = clone;
  for (
    let ancestor = figure.parentElement;
    ancestor !== null && ancestor !== document.body && ancestor !== document.documentElement;
    ancestor = ancestor.parentElement
  ) {
    const shell = ancestor.cloneNode(false) as Element;
    shell.setAttribute('style', SHELL_STYLE);
    shell.setAttribute('data-export-shell', '');
    shell.append(node);
    node = shell;
  }
  return node;
}

/** The figure's extent on the page, counting what a scrolling chart keeps out of view. */
function extent(figure: HTMLElement): { readonly width: number; readonly height: number } {
  const bounds = figure.getBoundingClientRect();
  const scrolling = [figure, ...figure.querySelectorAll('.figure')];
  return {
    width: Math.ceil(Math.max(bounds.width, ...scrolling.map((element) => element.scrollWidth))),
    // Slack rather than a measurement: hiding a line or a fallback font moves
    // the layout a little, and whatever is not painted is trimmed anyway.
    height: Math.ceil(Math.max(bounds.height, figure.scrollHeight)) + 32,
  };
}

/** The standalone SVG document that draws `figure` — everything but the rasterising. */
export async function figureSvg(figure: HTMLElement): Promise<{
  readonly xml: string;
  readonly width: number;
  readonly height: number;
}> {
  const { width, height } = extent(figure);
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('width', `${width}`);
  svg.setAttribute('height', `${height}`);
  svg.setAttribute('data-theme', 'light');
  const style = document.createElementNS(SVG_NAMESPACE, 'style');
  style.textContent = await pageStyles();
  const foreign = document.createElementNS(SVG_NAMESPACE, 'foreignObject');
  foreign.setAttribute('width', '100%');
  foreign.setAttribute('height', '100%');
  foreign.append(staged(figure));
  svg.append(style, foreign);
  return { xml: new XMLSerializer().serializeToString(svg), width, height };
}

/** The rectangle of `canvas` that has anything painted in it. */
function paintedBounds(context: CanvasRenderingContext2D, width: number, height: number): {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
} | undefined {
  const { data } = context.getImageData(0, 0, width, height);
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      bottom = y;
    }
  }
  return right < 0 ? undefined : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** Rasterise `figure` — an element already drawn in the page — to a PNG on white. */
export async function figurePng(figure: HTMLElement): Promise<Blob> {
  const { xml, width, height } = await figureSvg(figure);
  // A figure that is not laid out — its panel hidden — has no pixels to take.
  if (width === 0) throw new Error('the figure is not on screen');
  const image = new Image();
  // A data URL, not a blob URL: some engines taint a canvas drawn from a
  // blob-backed SVG that contains a `foreignObject`, which blocks reading it back.
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  await image.decode();

  const drawn = document.createElement('canvas');
  drawn.width = width * PNG_SCALE;
  drawn.height = height * PNG_SCALE;
  const drawing = drawn.getContext('2d');
  if (drawing === null) throw new Error('no 2D canvas to draw the figure on');
  drawing.drawImage(image, 0, 0, drawn.width, drawn.height);
  const painted = paintedBounds(drawing, drawn.width, drawn.height);
  if (painted === undefined) throw new Error('the figure drew nothing');

  const padding = PNG_PADDING * PNG_SCALE;
  const page = document.createElement('canvas');
  page.width = painted.width + 2 * padding;
  page.height = painted.height + 2 * padding;
  const paper = page.getContext('2d');
  if (paper === null) throw new Error('no 2D canvas to draw the figure on');
  paper.fillStyle = '#ffffff';
  paper.fillRect(0, 0, page.width, page.height);
  paper.drawImage(
    drawn,
    painted.left, painted.top, painted.width, painted.height,
    padding, padding, painted.width, painted.height,
  );
  return new Promise((resolve, reject) => {
    page.toBlob(
      (blob) => (blob === null ? reject(new Error('the figure could not be encoded as PNG')) : resolve(blob)),
      'image/png',
    );
  });
}
