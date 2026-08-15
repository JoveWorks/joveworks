/**
 * React Flow handle ids for a port that may render more than one slot.
 *
 * React Flow indexes handles by `(nodeId, handleId)` — two `<Handle>`
 * elements on one node sharing an id collide, and only one is actually
 * connectable, which is what a spectrum port's several same-named slots
 * (S71) would do if rendered with the bare port name. Every slot instead
 * gets a unique id, `port::index` or `port::open` for the trailing one; the
 * schema never sees it; `basePortName` is the one place that strips it back
 * off before an edge is built.
 *
 * An ordinary, single-occupancy port is suffixed too (`port::0`, always),
 * so the projection in `Canvas.tsx` never has to know a port's kind to
 * decide whether to suffix it.
 */

export function slotHandleId(portName: string, slot: number | 'open'): string {
  return `${portName}::${slot}`;
}

export function basePortName(handleId: string): string {
  const cut = handleId.indexOf('::');
  return cut === -1 ? handleId : handleId.slice(0, cut);
}
