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
  en: { language: 'Language', english: 'English', dutch: 'Nederlands', nodeBookSettings: 'NodeBook settings', notebookLanguage: 'Notebook language', appLanguage: 'App language', exportPdf: 'Export PDF…', close: 'Close', settings: 'Settings', restoredAutosave: 'Restored unsaved work from the last session.', keepNodeOpen: 'Keep this node open', unpinNode: 'Unpin this node', deleteNode: 'Delete this node', nodeHelp: 'Help for this node', scalar: 'value', slider: 'slider', linear: 'linear range', logarithmic: 'log range', renard: 'Renard series', searchPalette: 'equation number, symbol, or what it computes', favourites: 'Favourites', input: 'Input', value: 'value', singleNumber: 'a single number', range: 'range', rangeSummary: 'swept from a start to a stop', list: 'list', listSummary: 'swept over hand-typed values', general: 'General', compare: 'compare', compareSummary: 'a wireable pass/fail verdict', equation: 'equation', equationSummary: 'type one — its ports follow from what it uses', waypoint: 'waypoint', waypointSummary: 'route independent wires through one stop', pack: 'pack', packSummary: 'bundle several wires into one', unpack: 'unpack', unpackSummary: 'split a bundle back into its wires', output: 'Output', print: 'print', printSummary: 'a value, as text', plot: 'plot', plotSummary: 'a value over a swept range', table: 'table', tableSummary: 'several series as rows, one per column', check: 'check', checkSummary: 'pass or fail against a threshold' },
  nl: { language: 'Taal', english: 'English', dutch: 'Nederlands', nodeBookSettings: 'NodeBook-instellingen', notebookLanguage: 'NodeBook-taal', appLanguage: 'App-taal', exportPdf: 'Exporteer pdf…', close: 'Sluiten', settings: 'Instellingen', restoredAutosave: 'Niet-opgeslagen werk uit de vorige sessie hersteld.', keepNodeOpen: 'Houd dit knooppunt open', unpinNode: 'Maak dit knooppunt los', deleteNode: 'Verwijder dit knooppunt', nodeHelp: 'Hulp voor dit knooppunt', scalar: 'waarde', slider: 'schuifregelaar', linear: 'lineair bereik', logarithmic: 'logaritmisch bereik', renard: 'Renard-reeks', searchPalette: 'vergelijkingsnummer, symbool, of wat het berekent', favourites: 'Favorieten', input: 'Invoer', value: 'waarde', singleNumber: 'één getal', range: 'bereik', rangeSummary: 'gesweept van een begin- tot een eindwaarde', list: 'lijst', listSummary: 'gesweept over handmatig ingevoerde waarden', general: 'Algemeen', compare: 'vergelijk', compareSummary: 'een bedraadbaar geslaagd/mislukt-oordeel', equation: 'vergelijking', equationSummary: 'typ er één — de poorten volgen uit wat ze gebruikt', waypoint: 'tussenpunt', waypointSummary: 'leid onafhankelijke draden via één stop', pack: 'bundel', packSummary: 'bundel meerdere draden tot één', unpack: 'ontbundel', unpackSummary: 'splits een bundel terug op in draden', output: 'Uitvoer', print: 'afdrukken', printSummary: 'een waarde als tekst', plot: 'grafiek', plotSummary: 'een waarde over een gesweept bereik', table: 'tabel', tableSummary: 'meerdere reeksen als rijen, één per kolom', check: 'controle', checkSummary: 'geslaagd of mislukt ten opzichte van een drempel' },
} as const;

export function ui(locale: AppLocale): typeof UI.en {
  return UI[locale] as typeof UI.en;
}

/** Transitional shared copy for editor surfaces that do not need interpolation. */
const DUTCH_PHRASES: Readonly<Record<string, string>> = {
  'New': 'Nieuw', 'Open…': 'Openen…', 'Save': 'Opslaan', 'Recent': 'Recent',
  'No recent documents': 'Geen recente documenten', 'Load catalogue…': 'Catalogus laden…',
  'User equations': 'Gebruikersvergelijkingen', 'Import equations…': 'Vergelijkingen importeren…',
  'Export equations': 'Vergelijkingen exporteren', 'Group into new section': 'Groepeer in nieuwe sectie',
  'Auto-arrange': 'Automatisch schikken', 'Undo': 'Ongedaan maken', 'Redo': 'Opnieuw uitvoeren',
  'Theme': 'Thema', 'Light': 'Licht', 'Dark': 'Donker', 'System': 'Systeem',
  'Documentation': 'Documentatie', 'Take the tour': 'Volg de rondleiding', 'Examples': 'Voorbeelden',
  'Choose a safe platform size': 'Kies een veilige platformgrootte', 'Pad pressure sweep': 'Pad druk vegen',
  'Belt lab': 'Riemlaboratorium', 'Cantilever — hollow sections': 'Uitkraging — holle profielen',
  'Pocket milling — power envelope': 'Pockets frezen — vermogensbereik',
  'Hide canvas controls': 'Canvasknoppen verbergen', 'Show canvas controls': 'Canvasknoppen tonen',
  'Move up': 'Omhoog verplaatsen', 'Move down': 'Omlaag verplaatsen', 'Delete section': 'Sectie verwijderen',
  'Not in a section': 'Niet in een sectie', 'Worth a look': 'Even nakijken',
  'Click to edit the raw text': 'Klik om de onbewerkte tekst te bewerken',
  'what this section establishes': 'wat deze sectie vastlegt',
  'Add new': 'Nieuw toevoegen', 'On this canvas': 'Op dit canvas',
  'add a node, or find one already on the canvas…': 'voeg een knooppunt toe, of zoek er een op het canvas…',
};

export function phrase(locale: AppLocale, english: string): string {
  return locale === 'nl' ? DUTCH_PHRASES[english] ?? english : english;
}
