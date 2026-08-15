/**
 * One error type for everything the kernel refuses.
 *
 * The kernel is reached from two directions — an expression string that came out
 * of a catalogue, and a graph a student wired — and both are reported the same
 * way: what was refused, and where. `where` is a node id, a `node.port`, or the
 * expression source, so a message can be attached to the thing on the canvas
 * that caused it rather than floating free in a console.
 */
export class KernelError extends Error {
  override readonly name = 'KernelError';

  constructor(
    message: string,
    /** The node, port or expression at fault. */
    readonly where?: string,
  ) {
    super(where === undefined || where.length === 0 ? message : `${where}: ${message}`);
  }
}
