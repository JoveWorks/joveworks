/**
 * A shaft view (`ShaftViewResult`): one view per transverse plane — the
 * outline with its steps and bore, the supports, and that plane's forces,
 * couples and distributed loads — over one z scale. Torques sit in a strip
 * above both views, since they belong to neither plane.
 *
 * z runs along the shaft, y up and x horizontal. The vertical (y–z) view is
 * the shaft seen from the side, y up; the horizontal (x–z) view is the shaft
 * seen from above, x up. In both the third axis points at the viewer (⊙),
 * which keeps x, y, z right-handed.
 *
 * Conventions match the diagrams: a force is drawn up when it is positive in
 * its plane, a couple clockwise when positive, a torque ⟳ when positive. The
 * labels give sizes only; the arrow says which way. Lengths along z are to scale;
 * diameters are to the same scale until the shaft would grow too tall, and
 * then shrink together, so the steps keep their proportions.
 */

import type { ReactElement } from 'react';

import type { ShaftViewMark, ShaftViewPlane, ShaftViewResult } from '@joveworks/kernel';
import type { Unit } from '@joveworks/units';

import { display } from '../model/quantity';
import { useDisplay } from './display';

const WIDTH = 640;
const LEFT = 64;
const RIGHT = 24;
const PLOT = WIDTH - LEFT - RIGHT;
const TORQUE_ROW = 30;
const PLANE_HEIGHT = 170;
const AXIS_HEIGHT = 26;
/** The largest half-diameter drawn, in px — a taller shaft scales down as a whole. */
const MAX_RADIUS = 30;
const ARROW = 34;

interface Props {
  readonly result: ShaftViewResult;
  /** A smaller, label-free drawing for the canvas node. */
  readonly compact?: boolean;
}

export function ShaftFigure({ result, compact = false }: Props): ReactElement {
  const { format } = useDisplay();
  const span = result.to - result.from || 1;
  const xOf = (z: number): number => LEFT + ((z - result.from) / span) * PLOT;
  const maxD = Math.max(0, ...result.sections.map((section) => section.d ?? 0));
  const radial = maxD === 0 ? 1 : Math.min(PLOT / span, (2 * MAX_RADIUS) / maxD);
  const outerRadius = maxD === 0 ? 7 : (maxD / 2) * radial;
  const shown = (value: number, unit: Unit): string => display(value, unit, 3, format);
  const length = (value: number): string => shown(value, result.lengthUnit);
  /** A load's size: the arrow or arc already says which way it acts. */
  const size = (value: number, unit: Unit): string => shown(Math.abs(value), unit);
  /** Keeps a label at either end of the shaft inside the figure. */
  const anchor = (x: number): 'start' | 'middle' | 'end' =>
    x < LEFT + 50 ? 'start' : x > LEFT + PLOT - 50 ? 'end' : 'middle';

  const torqueTop = 0;
  const hasTorque = result.torques.length > 0;
  const planesTop = hasTorque ? TORQUE_ROW : 0;
  const axisTop = planesTop + 2 * PLANE_HEIGHT;
  const height = axisTop + AXIS_HEIGHT;

  const outline = (centre: number): ReactElement => (
    <g className="shaft-outline">
      <line className="centreline" x1={LEFT - 8} x2={LEFT + PLOT + 8} y1={centre} y2={centre} />
      {result.sections.map((section, i) => {
        const x = xOf(section.start);
        const w = xOf(section.end) - x;
        const r = section.d === undefined ? 7 : (section.d / 2) * radial;
        const bore = section.d_i === undefined ? 0 : (section.d_i / 2) * radial;
        return (
          <g key={i}>
            <rect className="body" x={x} y={centre - r} width={w} height={2 * r} />
            {bore > 0 ? <rect className="bore" x={x} y={centre - bore} width={w} height={2 * bore} /> : null}
          </g>
        );
      })}
    </g>
  );

  const supports = (centre: number): ReactElement => (
    <g className="shaft-supports">
      {result.supports.map((support, i) => {
        const x = xOf(support.at);
        const base = centre + outerRadius;
        if (support.support === 'fixed') {
          const side = support.at - result.from < result.to - support.at ? -1 : 1;
          const top = centre - outerRadius - 10;
          const bottom = centre + outerRadius + 10;
          const hatches = Array.from({ length: Math.round((bottom - top) / 7) }, (_, k) => top + 4 + k * 7);
          return (
            <g key={i} className="support fixed">
              <line x1={x} x2={x} y1={top} y2={bottom} />
              {hatches.map((y) => <line key={y} className="hatch" x1={x} x2={x + side * 7} y1={y} y2={y + 5} />)}
              {compact ? null : <text x={x} y={bottom + 13} textAnchor={anchor(x)}>{support.label}</text>}
            </g>
          );
        }
        const filled = support.support === 'locating';
        return (
          <g key={i} className={`support ${support.support}`}>
            <path className={filled ? 'filled' : undefined} d={`M ${x} ${base} l -8 13 h 16 z`} />
            {support.support === 'floating' ? (
              <>
                <circle cx={x - 5} cy={base + 17} r={3} />
                <circle cx={x + 5} cy={base + 17} r={3} />
              </>
            ) : (
              <line className="ground" x1={x - 11} x2={x + 11} y1={base + 15} y2={base + 15} />
            )}
            {compact ? null : <text x={x} y={base + 33} textAnchor={anchor(x)}>{support.label}</text>}
          </g>
        );
      })}
    </g>
  );

  /** A force arrow: drawn up when positive, its tail or head on the shaft's surface. */
  const force = (mark: ShaftViewMark, centre: number, key: number): ReactElement => {
    const x = xOf(mark.at);
    const surface = centre - outerRadius - 2;
    const up = mark.value > 0;
    const [y1, y2] = up ? [surface, surface - ARROW] : [surface - ARROW, surface];
    return (
      <g key={`f${key}`} className="load force">
        <line x1={x} x2={x} y1={y1} y2={y2} markerEnd="url(#shaft-arrow)" />
        {compact ? null : (
          <text x={x} y={surface - ARROW - 6} textAnchor={anchor(x)}>
            {mark.label} {size(mark.value, mark.unit)}
          </text>
        )}
      </g>
    );
  };

  /** A couple: an arc round its position, clockwise when positive. */
  const couple = (mark: ShaftViewMark, centre: number, key: number): ReactElement => {
    const x = xOf(mark.at);
    const r = outerRadius + 9;
    const clockwise = mark.value > 0;
    const start = { x: x - r * Math.cos(Math.PI / 4), y: centre - r * Math.sin(Math.PI / 4) };
    const end = { x: x + r * Math.cos(Math.PI / 4), y: centre - r * Math.sin(Math.PI / 4) };
    const [from, to] = clockwise ? [start, end] : [end, start];
    return (
      <g key={`c${key}`} className="load couple">
        <path d={`M ${from.x} ${from.y} A ${r} ${r} 0 0 ${clockwise ? 1 : 0} ${to.x} ${to.y}`} markerEnd="url(#shaft-arrow)" />
        {compact ? null : (
          <text x={x} y={centre - r - 6} textAnchor={anchor(x)}>
            {mark.label} {size(mark.value, mark.unit)}
          </text>
        )}
      </g>
    );
  };

  /** A small axis marker in the left margin: `up` drawn up, z to the right, the third axis towards the viewer. */
  const triad = (up: 'x' | 'y', centre: number): ReactElement => {
    const x0 = 14;
    const y0 = centre + 16;
    return (
      <g className="axis-triad">
        <line x1={x0} x2={x0} y1={y0} y2={y0 - 24} markerEnd="url(#shaft-arrow)" />
        <line x1={x0} x2={x0 + 24} y1={y0} y2={y0} markerEnd="url(#shaft-arrow)" />
        <circle cx={x0} cy={y0} r={3.5} />
        <circle className="dot" cx={x0} cy={y0} r={1} />
        <text x={x0 + 5} y={y0 - 20}>{up}</text>
        <text x={x0 + 26} y={y0 + 4}>z</text>
        <text x={x0 - 4} y={y0 + 14} textAnchor="middle">{up === 'y' ? 'x' : 'y'}</text>
      </g>
    );
  };

  const plane = (name: 'x' | 'y', loads: ShaftViewPlane, top: number): ReactElement => {
    const centre = top + PLANE_HEIGHT / 2 + 14;
    const surface = centre - outerRadius - 2;
    return (
      <g key={name}>
        <text className="plane-title" x={8} y={top + 14}>
          {name === 'y' ? 'vertical (y–z)' : 'horizontal (x–z), seen from above'}
        </text>
        {compact ? null : triad(name, centre)}
        {loads.spans.map((load, i) => {
          const x1 = xOf(load.from);
          const x2 = xOf(load.to);
          const count = Math.max(2, Math.round((x2 - x1) / 18) + 1);
          const up = load.rate > 0;
          const tail = surface - 20;
          return (
            <g key={`s${i}`} className="load span">
              <line x1={x1} x2={x2} y1={up ? surface : tail} y2={up ? surface : tail} className="span-line" />
              {Array.from({ length: count }, (_, k) => {
                const x = x1 + ((x2 - x1) * k) / (count - 1);
                return <line key={k} x1={x} x2={x} y1={up ? surface : tail} y2={up ? tail : surface} markerEnd="url(#shaft-arrow)" />;
              })}
              {compact ? null : (
                <text x={(x1 + x2) / 2} y={tail - 5} textAnchor={anchor((x1 + x2) / 2)}>
                  {load.label} {size(load.rate, load.unit)}
                </text>
              )}
            </g>
          );
        })}
        {outline(centre)}
        {supports(centre)}
        {loads.forces.map((mark, i) => force(mark, centre, i))}
        {loads.couples.map((mark, i) => couple(mark, centre, i))}
      </g>
    );
  };

  const ticks = [...new Set([result.from, result.to, ...result.supports.map((support) => support.at)])].sort((a, b) => a - b);

  return (
    <svg
      className={`shaft-figure${compact ? ' compact' : ''}`}
      viewBox={`0 0 ${WIDTH} ${height}`}
      role="img"
      aria-label="The shaft, its supports and its loads, seen from the side and from above"
    >
      <defs>
        <marker id="shaft-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 8 4 L 0 8 z" className="arrowhead" />
        </marker>
      </defs>

      {hasTorque ? (
        <g className="torque-row">
          <text className="plane-title" x={8} y={torqueTop + 18}>torque</text>
          {result.torques.map((mark, i) => (
            <text key={i} x={xOf(mark.at)} y={torqueTop + 18} textAnchor={anchor(xOf(mark.at))}>
              {mark.value > 0 ? '⟳' : '⟲'} {compact ? '' : `${mark.label} ${size(mark.value, mark.unit)}`}
            </text>
          ))}
        </g>
      ) : null}

      {plane('y', result.planes.y, planesTop)}
      {plane('x', result.planes.x, planesTop + PLANE_HEIGHT)}

      <g className="z-axis">
        <line x1={LEFT} x2={LEFT + PLOT} y1={axisTop + 4} y2={axisTop + 4} />
        {ticks.map((z) => (
          <g key={z}>
            <line x1={xOf(z)} x2={xOf(z)} y1={axisTop} y2={axisTop + 8} />
            {compact ? null : <text x={xOf(z)} y={axisTop + 20} textAnchor={anchor(xOf(z))}>{length(z)}</text>}
          </g>
        ))}
        {compact ? null : <text x={8} y={axisTop + 20}>z</text>}
      </g>

    </svg>
  );
}
