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
  en: { language: 'Language', english: 'English', dutch: 'Nederlands', nodeBookSettings: 'NodeBook settings', notebookLanguage: 'Notebook language', appLanguage: 'App language', exportPdf: 'Export PDF…', close: 'Close', settings: 'Settings', restoredAutosave: 'Restored unsaved work from the last session.', keepNodeOpen: 'Keep open', unpinNode: 'Allow auto-collapse', deleteNode: 'Delete this node', nodeHelp: 'Help for this node', scalar: 'value', slider: 'slider', linear: 'linear range', logarithmic: 'log range', renard: 'Renard series', searchPalette: 'equation number, symbol, or what it computes', favourites: 'Favourites', input: 'Input', value: 'value', singleNumber: 'a single number', range: 'range', rangeSummary: 'start to stop, swept', list: 'list', listSummary: 'hand-typed values', general: 'General', file: 'file', fileSummary: 'read from file', compare: 'compare', compareSummary: 'a pass/fail verdict', equation: 'custom expression', equationSummary: 'type your own', waypoint: 'waypoint', waypointSummary: 'route wires through a stop', pack: 'pack', packSummary: 'bundle wires into one', unpack: 'unpack', unpackSummary: 'split a bundle into wires', analysis: 'Analysis', monteCarloGenerator: 'Monte Carlo generator', monteCarloGeneratorSummary: 'draw from a distribution, sample by sample', monteCarloReceiver: 'Monte Carlo receiver', monteCarloReceiverSummary: 'watch samples accumulate and an aggregate converge', feasibility: 'feasibility', feasibilitySummary: 'shade where every referenced check passes at once', sensitivity: 'sensitivity', sensitivitySummary: 'a tornado — which input moves the output most', output: 'Output', print: 'print', printSummary: 'a value, as text', plot: 'plot', plotSummary: 'a value over a range', table: 'table', tableSummary: 'series as rows', check: 'check', checkSummary: 'pass/fail vs. a threshold', thousandsDecimal: 'thousands / decimal', notation: 'notation', numberFormatNote: 'Applies to every value shown or typed in the app. A per-print-node “figures” count still overrides how many significant figures a result shows.', showMinimap: 'show the canvas minimap', typesetMath: 'typeset mathematical notation in titles and notebook text', contourPalette: 'contour colour palette' },
  nl: { language: 'Taal', english: 'English', dutch: 'Nederlands', nodeBookSettings: 'NodeBook-instellingen', notebookLanguage: 'NodeBook-taal', appLanguage: 'App-taal', exportPdf: 'Exporteer pdf…', close: 'Sluiten', settings: 'Instellingen', restoredAutosave: 'Niet-opgeslagen werk uit de vorige sessie hersteld.', keepNodeOpen: 'Open houden', unpinNode: 'Automatisch samenvouwen toestaan', deleteNode: 'Verwijder dit knooppunt', nodeHelp: 'Hulp voor dit knooppunt', scalar: 'waarde', slider: 'schuifregelaar', linear: 'lineair bereik', logarithmic: 'logaritmisch bereik', renard: 'Renard-reeks', searchPalette: 'vergelijkingsnummer, symbool, of wat het berekent', favourites: 'Favorieten', input: 'Invoer', value: 'waarde', singleNumber: 'één getal', range: 'bereik', rangeSummary: 'begin tot eind, gesweept', list: 'lijst', listSummary: 'handmatig ingevoerde waarden', general: 'Algemeen', file: 'bestand', fileSummary: 'lees uit een bestand', compare: 'vergelijk', compareSummary: 'een geslaagd/mislukt-oordeel', equation: 'aangepaste expressie', equationSummary: 'typ er zelf een', waypoint: 'tussenpunt', waypointSummary: 'leid draden via één stop', pack: 'bundel', packSummary: 'bundel draden tot één', unpack: 'ontbundel', unpackSummary: 'splits een bundel op in draden', analysis: 'Analyse', monteCarloGenerator: 'Monte Carlo-generator', monteCarloGeneratorSummary: 'trek uit een verdeling, steekproef voor steekproef', monteCarloReceiver: 'Monte Carlo-ontvanger', monteCarloReceiverSummary: 'zie steekproeven zich opstapelen en een aggregaat convergeren', feasibility: 'haalbaarheid', feasibilitySummary: 'arceer waar elke gekoppelde controle tegelijk slaagt', sensitivity: 'gevoeligheid', sensitivitySummary: 'een tornado — welke invoer beïnvloedt de uitvoer het meest', output: 'Uitvoer', print: 'afdrukken', printSummary: 'een waarde als tekst', plot: 'grafiek', plotSummary: 'een waarde over een bereik', table: 'tabel', tableSummary: 'reeksen als rijen', check: 'controle', checkSummary: 'geslaagd/mislukt t.o.v. een drempel', thousandsDecimal: 'duizendtallen / decimaalteken', notation: 'notatie', numberFormatNote: 'Geldt voor elke waarde die in de app wordt getoond of ingevoerd. Het aantal “cijfers” per uitvoerknooppunt blijft bepalen hoeveel significante cijfers een resultaat toont.', showMinimap: 'minikaart van het canvas tonen', typesetMath: 'wiskundige notatie zetten in titels en notitieboektekst', contourPalette: 'kleurenpalet voor contouren' },
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
  'Auto-arrange': 'Automatisch schikken', 'Undo': 'Ongedaan maken', 'Redo': 'Opnieuw uitvoeren',
  'Theme': 'Thema', 'Light': 'Licht', 'Dark': 'Donker', 'System': 'Systeem',
  'Close palette': 'Palet sluiten', 'Close palette — reopen it from the View menu': 'Palet sluiten — opnieuw openen via het menu View',
  'Close notebook': 'NodeBook sluiten', 'Close notebook — reopen it from the View menu': 'NodeBook sluiten — opnieuw openen via het menu View',
  'Documentation': 'Documentatie', 'Take the tour': 'Volg de rondleiding', 'Examples': 'Voorbeelden',
  'Choose a safe platform size': 'Kies een veilige platformgrootte', 'Pad pressure sweep': 'Pad druk vegen',
  'Clearance-fit stack-up': 'Speling-stapeling', 'Belt lab': 'Riemlaboratorium', 'Cantilever — hollow sections': 'Uitkraging — holle profielen',
  'Pocket milling — power envelope': 'Pockets frezen — vermogensbereik',
  'Hide canvas controls': 'Canvasknoppen verbergen', 'Show canvas controls': 'Canvasknoppen tonen',
  'Move up': 'Omhoog verplaatsen', 'Move down': 'Omlaag verplaatsen', 'Delete section': 'Sectie verwijderen',
  'Not in a section': 'Niet in een sectie', 'Worth a look': 'Even nakijken',
  'Click to edit the raw text': 'Klik om de onbewerkte tekst te bewerken',
  'what this section establishes': 'wat deze sectie vastlegt',
  'Add new': 'Nieuw toevoegen', 'On this canvas': 'Op dit canvas',
  'add a node, or find one already on the canvas…': 'voeg een knooppunt toe, of zoek er een op het canvas…',
  'saved equation': 'opgeslagen vergelijking', 'quarantined': 'in quarantaine',
  'restricted': 'beperkt', 'Nothing matches': 'Geen overeenkomst voor', 'node': 'knooppunt', 'nodes': 'knooppunten', 'catalogue': 'catalogus', 'catalogues': 'catalogi', 'loaded': 'geladen',
  'Quarantined:': 'In quarantaine:', 'Restricted content — never exported.': 'Beperkte inhoud — nooit geëxporteerd.',
  'locked': 'vergrendeld', 'Locked — enter the password to unlock.': 'Vergrendeld — voer het wachtwoord in om te ontgrendelen.',
  'Password': 'Wachtwoord', 'Unlock': 'Ontgrendelen', 'Wrong password.': 'Onjuist wachtwoord.',
  'Unlock catalogue…': 'Catalogus ontgrendelen…',
  'No locked catalogues — every one that shipped with the app is already unlocked.': 'Geen vergrendelde catalogi — alles wat met de app is meegeleverd, is al ontgrendeld.',
  'Insert': 'Invoegen', 'Help': 'Help', 'Remove from palette': 'Uit palet verwijderen',
  'Add to favourites': 'Aan favorieten toevoegen', 'Remove from favourites': 'Uit favorieten verwijderen',
  'input': 'invoer', 'file': 'bestand', 'equation': 'vergelijking', 'waypoint': 'tussenpunt', 'pack': 'bundel', 'unpack': 'ontbundel', 'compare': 'vergelijk',
  'print output': 'afdrukuitvoer', 'check output': 'controle-uitvoer', 'plot output': 'grafiekuitvoer', 'table output': 'tabeluitvoer',
  'sensitivity output': 'gevoeligheidsuitvoer',
  'Monte Carlo generator': 'Monte Carlo-generator', 'Monte Carlo receiver': 'Monte Carlo-ontvanger',
  'Selection': 'Selectie', 'Auto-arrange selection': 'Selectie automatisch schikken',
  'Space evenly horizontally': 'Horizontaal gelijkmatig verdelen', 'Space evenly vertically': 'Verticaal gelijkmatig verdelen',
  'Canvas': 'Canvas', 'Snap nodes to grid': 'Knooppunten aan raster vastklikken', 'Node': 'Knooppunt',
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
  'How many significant figures a drag rounds to — typing a value directly is never rounded.': 'Het aantal significante cijfers waarop slepen afrondt — rechtstreeks getypte waarden worden nooit afgerond.',
  'The value. The unit is the field beside it, and does not need retyping.': 'De waarde. De eenheid staat in het veld ernaast en hoeft niet opnieuw getypt te worden.',
  'Blank is dimensionless — that is a value, not a gap to fill in.': 'Leeg is dimensieloos — dat is een waarde, geen veld dat nog ingevuld moet worden.',
  'Drag for a feel of the effect — type the field for an exact value.': 'Sleep om het effect te voelen — typ in het veld voor een exacte waarde.',
  'The low end. Type a unit here too (10 mm ... 1 m) to re-express both bounds in it.': 'De ondergrens. Typ hier ook een eenheid (10 mm ... 1 m) om beide grenzen daarin uit te drukken.',
  'The high end.': 'De bovengrens.', 'Preferred numbers (ISO 3) — the standard sizes a part actually comes in.': 'Voorkeursgetallen (ISO 3) — de standaardmaten waarin een onderdeel werkelijk verkrijgbaar is.',
  'Standard sizes — the range that answers which part to buy.': 'Standaardmaten — het bereik dat antwoord geeft op welk onderdeel te kopen.',
  'Typed here — unless a wire supplies it.': 'Hier getypt — tenzij een draad de waarde levert.',
};

export function phrase(locale: AppLocale, english: string): string {
  return locale === 'nl' ? DUTCH_PHRASES[english] ?? english : english;
}
