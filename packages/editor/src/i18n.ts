import { localize, type LocalizedText } from '@joveworks/schema';

export const APP_LOCALES = ['en', 'nl'] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

export function browserLocale(): AppLocale {
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('nl') ? 'nl' : 'en';
}

export function text(value: LocalizedText, locale: AppLocale): string {
  return localize(value, locale);
}

/** Small, typed vocabulary for copy shared by locale-aware editor surfaces. */
export const UI = {
  en: { language: 'Language', english: 'English', dutch: 'Nederlands', nodeBookSettings: 'NodeBook settings', notebookLanguage: 'Notebook language', appLanguage: 'App language', exportPdf: 'Export PDF…', close: 'Close', settings: 'Settings', restoredAutosave: 'Restored unsaved work from the last session.', keepNodeOpen: 'Keep open', unpinNode: 'Allow auto-collapse', deleteNode: 'Delete this node', nodeHelp: 'Help for this node', scalar: 'value', slider: 'slider', linear: 'linear range', logarithmic: 'log range', renard: 'Renard series', searchPalette: 'equation number, symbol, or what it computes', favourites: 'Favourites', input: 'Input', value: 'value', singleNumber: 'a single number', range: 'range', rangeSummary: 'start to stop, swept', computedRange: 'computed range', computedRangeSummary: 'start, stop and count, wired in', list: 'list', listSummary: 'hand-typed values', general: 'General', file: 'file', fileSummary: 'read from file', compare: 'compare', compareSummary: 'a pass/fail verdict', equation: 'custom expression', equationSummary: 'type your own', waypoint: 'waypoint', waypointSummary: 'route wires through a stop', pack: 'pack', packSummary: 'bundle wires into one', unpack: 'unpack', unpackSummary: 'split a bundle into wires', analysis: 'Analysis', stochasticAnalysis: 'Stochastic analysis', monteCarloGenerator: 'Monte Carlo generator', monteCarloGeneratorSummary: 'draw from a distribution, sample by sample', monteCarloReceiver: 'Monte Carlo receiver', monteCarloReceiverSummary: 'watch samples accumulate and an aggregate converge', feasibility: 'feasibility', feasibilitySummary: 'shade where every referenced check passes at once', sensitivity: 'sensitivity', sensitivitySummary: 'a tornado — which input moves the output most', bestDesign: 'best design', bestDesignSummary: 'the feasible point that wins, and the check that governs it', pareto: 'pareto', paretoSummary: 'the candidates no other candidate beats on both objectives', crossing: 'threshold crossing', crossingSummary: 'where a value meets its bound', firstPassing: 'first passing size', firstPassingSummary: 'the first standard size that passes', argMin: 'smallest at', argMinSummary: 'where a value is least', argMax: 'largest at', argMaxSummary: 'where a value is greatest', output: 'Output', print: 'print', printSummary: 'a value, as text', plot: 'plot', plotSummary: 'a value over a range', table: 'table', tableSummary: 'series as rows', check: 'check', checkSummary: 'pass/fail vs. a threshold', thousandsDecimal: 'thousands / decimal', notation: 'notation', numberFormatNote: 'Applies to every value shown or typed in the app. A per-print-node “figures” count still overrides how many significant figures a result shows.', showMinimap: 'show the canvas minimap', typesetMath: 'typeset mathematical notation in titles and notebook text', contourPalette: 'contour colour palette', showAdvancedNodes: 'show advanced nodes in the palette', advancedNodesNote: 'Statistics and Monte Carlo, pareto, sensitivity, assumption stress, best design, and the smallest-at/largest-at/first-passing selection nodes, plus the file reader, pack and unpack. A NodeBook that already uses one of these keeps working with this off — it only changes what the palette offers.' },
  nl: { language: 'Taal', english: 'English', dutch: 'Nederlands', nodeBookSettings: 'NodeBook-instellingen', notebookLanguage: 'NodeBook-taal', appLanguage: 'App-taal', exportPdf: 'Exporteer pdf…', close: 'Sluiten', settings: 'Instellingen', restoredAutosave: 'Niet-opgeslagen werk uit de vorige sessie hersteld.', keepNodeOpen: 'Open houden', unpinNode: 'Automatisch samenvouwen toestaan', deleteNode: 'Verwijder dit knooppunt', nodeHelp: 'Hulp voor dit knooppunt', scalar: 'waarde', slider: 'schuifregelaar', linear: 'lineair bereik', logarithmic: 'logaritmisch bereik', renard: 'Renard-reeks', searchPalette: 'vergelijkingsnummer, symbool, of wat het berekent', favourites: 'Favorieten', input: 'Invoer', value: 'waarde', singleNumber: 'één getal', range: 'bereik', rangeSummary: 'begin tot eind, gesweept', computedRange: 'berekend bereik', computedRangeSummary: 'begin, eind en aantal, gekoppeld', list: 'lijst', listSummary: 'handmatig ingevoerde waarden', general: 'Algemeen', file: 'bestand', fileSummary: 'lees uit een bestand', compare: 'vergelijk', compareSummary: 'een geslaagd/mislukt-oordeel', equation: 'aangepaste expressie', equationSummary: 'typ er zelf een', waypoint: 'tussenpunt', waypointSummary: 'leid draden via één stop', pack: 'bundel', packSummary: 'bundel draden tot één', unpack: 'ontbundel', unpackSummary: 'splits een bundel op in draden', analysis: 'Analyse', stochasticAnalysis: 'Stochastische analyse', monteCarloGenerator: 'Monte Carlo-generator', monteCarloGeneratorSummary: 'trek uit een verdeling, steekproef voor steekproef', monteCarloReceiver: 'Monte Carlo-ontvanger', monteCarloReceiverSummary: 'zie steekproeven zich opstapelen en een aggregaat convergeren', feasibility: 'haalbaarheid', feasibilitySummary: 'arceer waar elke gekoppelde controle tegelijk slaagt', sensitivity: 'gevoeligheid', sensitivitySummary: 'een tornado — welke invoer beïnvloedt de uitvoer het meest', bestDesign: 'beste ontwerp', bestDesignSummary: 'het haalbare punt dat wint, en de controle die het bepaalt', pareto: 'pareto', paretoSummary: 'de kandidaten die door geen enkele andere op beide doelen worden verslagen', crossing: 'drempeloverschrijding', crossingSummary: 'waar een waarde zijn grens raakt', firstPassing: 'eerste geslaagde maat', firstPassingSummary: 'de eerste standaardmaat die slaagt', argMin: 'kleinst bij', argMinSummary: 'waar een waarde het kleinst is', argMax: 'grootst bij', argMaxSummary: 'waar een waarde het grootst is', output: 'Uitvoer', print: 'afdrukken', printSummary: 'een waarde als tekst', plot: 'grafiek', plotSummary: 'een waarde over een bereik', table: 'tabel', tableSummary: 'reeksen als rijen', check: 'controle', checkSummary: 'geslaagd/mislukt t.o.v. een drempel', thousandsDecimal: 'duizendtallen / decimaalteken', notation: 'notatie', numberFormatNote: 'Geldt voor elke waarde die in de app wordt getoond of ingevoerd. Het aantal “cijfers” per uitvoerknooppunt blijft bepalen hoeveel significante cijfers een resultaat toont.', showMinimap: 'minikaart van het canvas tonen', typesetMath: 'wiskundige notatie zetten in titels en notitieboektekst', contourPalette: 'kleurenpalet voor contouren', showAdvancedNodes: 'geavanceerde knooppunten tonen in het palet', advancedNodesNote: 'Statistiek en Monte Carlo, pareto, gevoeligheid, aanname-stresstest, beste ontwerp, en de knooppunten kleinst-bij/grootst-bij/eerste-geslaagd, plus de bestandslezer, bundel en ontbundel. Een NodeBook die er al één gebruikt, blijft werken met dit uit — het verandert alleen wat het palet aanbiedt.' },
} as const;

export function ui(locale: AppLocale): typeof UI.en {
  return UI[locale] as typeof UI.en;
}

/** Transitional shared copy for editor surfaces that do not need interpolation. */
const DUTCH_PHRASES: Readonly<Record<string, string>> = {
  'New': 'Nieuw', 'Open…': 'Openen…', 'Save': 'Opslaan', 'Recent': 'Recent',
  'No recent documents': 'Geen recente documenten', 'Load catalogue…': 'Catalogus laden…',
  'Catalogues': 'Catalogi', 'User equations': 'Gebruikersvergelijkingen', 'Import equations…': 'Vergelijkingen importeren…',
  'Export equations': 'Vergelijkingen exporteren', 'Application': 'Applicatie', 'Add new section': 'Nieuwe sectie toevoegen', 'Group into new section': 'Groepeer in nieuwe sectie',
  'Add new group': 'Nieuwe groep toevoegen', 'Group into new group': 'Groepeer in nieuwe groep',
  'Auto-arrange': 'Automatisch schikken', 'Undo': 'Ongedaan maken', 'Redo': 'Opnieuw uitvoeren',
  'Theme': 'Thema', 'Light': 'Licht', 'Dark': 'Donker', 'System': 'Systeem',
  'Close palette': 'Palet sluiten', 'Close palette — reopen it from the View menu': 'Palet sluiten — opnieuw openen via het menu View',
  'Close notebook': 'NodeBook sluiten', 'Close notebook — reopen it from the View menu': 'NodeBook sluiten — opnieuw openen via het menu View',
  'Documentation': 'Documentatie', 'Take the tour': 'Volg de rondleiding', 'Examples': 'Voorbeelden',
  'Choose a safe platform size': 'Kies een veilige platformgrootte', 'Pad pressure sweep': 'Pad druk vegen',
  'Load against strength': 'Belasting tegenover sterkte',
  'Clearance-fit stack-up': 'Speling-stapeling', 'Belt lab': 'Riemlaboratorium', 'Cantilever — hollow sections': 'Uitkraging — holle profielen',
  'Pocket milling — power envelope': 'Pockets frezen — vermogensbereik',
  'Hide canvas controls': 'Canvasknoppen verbergen', 'Show canvas controls': 'Canvasknoppen tonen',
  'Move up': 'Omhoog verplaatsen', 'Move down': 'Omlaag verplaatsen', 'Delete section': 'Sectie verwijderen', 'Delete group': 'Groep verwijderen', 'Collapse group': 'Groep samenvouwen', 'Expand group': 'Groep uitvouwen',
  'Not in a section': 'Niet in een sectie', 'Worth a look': 'Even nakijken',
  'Click to edit the raw text': 'Klik om de onbewerkte tekst te bewerken',
  'what this section establishes': 'wat deze sectie vastlegt',
  'Add new': 'Nieuw toevoegen', 'On this canvas': 'Op dit canvas',
  'add a node, or find one already on the canvas…': 'voeg een knooppunt toe, of zoek er een op het canvas…',
  'saved equation': 'opgeslagen vergelijking', 'quarantined': 'in quarantaine',
  'restricted': 'beperkt', 'Nothing matches': 'Geen overeenkomst voor', 'node': 'knooppunt', 'nodes': 'knooppunten', 'catalogue': 'catalogus', 'catalogues': 'catalogi', 'loaded': 'geladen',
  'Quarantined:': 'In quarantaine:', 'Restricted content — never exported.': 'Beperkte inhoud — nooit geëxporteerd.',
  'Connect course…': 'Cursus verbinden…', 'Hub address': 'Hub-adres', 'Course slug': 'Cursuscode', 'Course': 'Cursus',
  'Find courses': 'Cursussen zoeken', 'Finding courses…': 'Cursussen zoeken…', 'No courses are available from this Hub.': 'Er zijn geen cursussen beschikbaar op deze Hub.',
  'Course access token': 'Toegangstoken voor cursus', 'optional': 'optioneel',
  'Only for restricted course material': 'Alleen voor beperkte cursusinhoud',
  'The address and course are remembered on this device. The access token is kept only for this visit.': 'Het adres en de cursus worden op dit apparaat onthouden. Het toegangstoken blijft alleen deze sessie bewaard.',
  'Could not connect to that course.': 'Kon geen verbinding maken met die cursus.',
  'Connecting…': 'Verbinden…', 'Connect': 'Verbinden', 'No course connected': 'Geen cursus verbonden',
  'Refresh course material': 'Cursusmateriaal vernieuwen', 'Load course catalogues': 'Cursuscatalogi laden', 'No published material': 'Geen gepubliceerd materiaal',
  'Insert': 'Invoegen', 'Help': 'Help', 'Remove from palette': 'Uit palet verwijderen',
  'Add to favourites': 'Aan favorieten toevoegen', 'Remove from favourites': 'Uit favorieten verwijderen',
  'input': 'invoer', 'file': 'bestand', 'equation': 'vergelijking', 'waypoint': 'tussenpunt', 'pack': 'bundel', 'unpack': 'ontbundel', 'compare': 'vergelijk',
  'print output': 'afdrukuitvoer', 'check output': 'controle-uitvoer', 'plot output': 'grafiekuitvoer', 'table output': 'tabeluitvoer',
  'sensitivity output': 'gevoeligheidsuitvoer', 'best design output': 'beste-ontwerpuitvoer',
  'assumption stress output': 'aanname-stressuitvoer',
  'assumption stress': 'aanname-stresstest',
  'how a marked design loses margin as one assumption changes': 'hoe een gemarkeerd ontwerp marge verliest wanneer één aanname verandert',
  'distribution output': 'verdelingsuitvoer', 'statistic over sweep': 'statistiek over sweep',
  'distribution': 'verdeling', 'histogram or CDF over a trial axis': 'histogram of CDF over een proefas',
  'reliability': 'betrouwbaarheid', 'failure probability, interval, and reliability index': 'faalkans, interval en betrouwbaarheidsindex',
  'statistic over a swept axis': 'statistiek over een gesweepte as',
  'mean': 'gemiddelde', 'median': 'mediaan', 'stddev': 'standaardafwijking', 'min': 'minimum', 'max': 'maximum',
  'percentile': 'percentiel', 'probability': 'waarschijnlijkheid', 'count': 'aantal',
  'threshold crossing': 'drempeloverschrijding', 'first passing size': 'eerste geslaagde maat',
  'smallest at': 'kleinst bij', 'largest at': 'grootst bij',
  'Monte Carlo generator': 'Monte Carlo-generator', 'Monte Carlo receiver': 'Monte Carlo-ontvanger',
  'Selection': 'Selectie', 'Auto-arrange selection': 'Selectie automatisch schikken',
  'Space evenly horizontally': 'Horizontaal gelijkmatig verdelen', 'Space evenly vertically': 'Verticaal gelijkmatig verdelen',
  'Canvas': 'Canvas', 'Snap nodes to grid': 'Knooppunten aan raster vastklikken', 'Pin palette to bottom': 'Palet onderaan vastzetten', 'Node': 'Knooppunt',
  'Allow auto-collapse': 'Automatisch samenvouwen toestaan', 'Keep open': 'Open houden', 'Canvas controls': 'Canvasknoppen',
  'drag to select': 'slepen om te selecteren', 'click to add to selection': 'klikken om aan selectie toe te voegen',
  'select all': 'alles selecteren', 'undo/redo': 'ongedaan maken/opnieuw uitvoeren', 'copy/paste': 'kopiëren/plakken', 'duplicate': 'dupliceren',
  'Duplicate': 'Dupliceren', 'Save equation to palette': 'Vergelijking opslaan in palet', 'Delete': 'Verwijderen',
  'Delete wire': 'Draad verwijderen', 'Add input': 'Invoer toevoegen',
  'Add print output': 'Afdrukuitvoer toevoegen', 'Add check output': 'Controle-uitvoer toevoegen',
  'Add plot output': 'Grafiekuitvoer toevoegen',
  'formula not loaded': 'formule niet geladen', 'applies when': 'geldt wanneer', 'same relation as': 'zelfde relatie als',
  'verified': 'geverifieerd', 'No golden value exercises this yet.': 'Nog geen gouden waarde test dit.',
  'A student-written equation — its ports are whatever names it mentions.': 'Een door een student geschreven vergelijking — de poorten zijn de namen die erin voorkomen.',
  'Click to edit the raw title': 'Klik om de onbewerkte titel te bewerken',
  'caption — what this result says': 'bijschrift — wat dit resultaat zegt', 'Expand section': 'Sectie uitvouwen', 'Collapse section': 'Sectie samenvouwen',
  'result': 'resultaat', 'results': 'resultaten', 'not yet computed': 'nog niet berekend',
  'threshold at': 'drempel bij', '— where the curve crosses it is the size that works': '— waar de kromme deze kruist, werkt die maat',
  'Skip': 'Overslaan', 'Back': 'Terug', 'Next': 'Volgende', 'Done': 'Klaar', 'Tutorial': 'Rondleiding',
  'not connected': 'niet verbonden', 'waiting on an earlier node': 'wacht op een eerder knooppunt', 'refused': 'geweigerd',
  'Needs a range input somewhere in the graph to plot against': 'Heeft ergens in de grafiek een bereik-invoer nodig om tegen te plotten.',
  'replaces': 'vervangt',
  'Cancel': 'Annuleren', 'Discard': 'Verwerpen', 'Confirm': 'Bevestigen',
  'Point count is the control, not step size.': 'Het aantal punten is de instelling, niet de stapgrootte.',
  'The low end of the slider\'s travel.': 'De ondergrens van het bereik van de schuifregelaar.', 'The high end of the slider\'s travel.': 'De bovengrens van het bereik van de schuifregelaar.',
  'How many digits after the decimal point a drag rounds to — 0 gives whole numbers. Typing a value directly is never rounded.': 'Het aantal cijfers na de komma waarop slepen afrondt — 0 geeft gehele getallen. Rechtstreeks getypte waarden worden nooit afgerond.',
  'The value. The unit is the field beside it, and does not need retyping.': 'De waarde. De eenheid staat in het veld ernaast en hoeft niet opnieuw getypt te worden.',
  'Blank is dimensionless — that is a value, not a gap to fill in.': 'Leeg is dimensieloos — dat is een waarde, geen veld dat nog ingevuld moet worden.',
  'Drag for a feel of the effect — type the field for an exact value.': 'Sleep om het effect te voelen — typ in het veld voor een exacte waarde.',
  'Expose in NodeBook': 'Tonen in NodeBook', 'Reset inputs': 'Invoer herstellen',
  'The low end. Type a unit here too (10 mm ... 1 m) to re-express both bounds in it.': 'De ondergrens. Typ hier ook een eenheid (10 mm ... 1 m) om beide grenzen daarin uit te drukken.',
  'The high end.': 'De bovengrens.', 'Preferred numbers (ISO 3) — the standard sizes a part actually comes in.': 'Voorkeursgetallen (ISO 3) — de standaardmaten waarin een onderdeel werkelijk verkrijgbaar is.',
  'Standard sizes — the range that answers which part to buy.': 'Standaardmaten — het bereik dat antwoord geeft op welk onderdeel te kopen.',
  'Typed here — unless a wire supplies it.': 'Hier getypt — tenzij een draad de waarde levert.',
  'nightly': 'nightly', 'stable': 'stabiel',
};

export function phrase(locale: AppLocale, english: string): string {
  return locale === 'nl' ? DUTCH_PHRASES[english] ?? english : english;
}
