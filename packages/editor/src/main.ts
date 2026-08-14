// Placeholder. The editor lands at milestone 1 step 7 (PLAN.md).
import { parseUnit, formatQuantity } from '@mds/units';

const root = document.getElementById('root');
if (root) {
  const kW = parseUnit('kW');
  root.textContent = `machine-design-studio — 250 kW is ${formatQuantity(
    250 * kW.factor,
    parseUnit('W'),
    4,
  )} in canonical units.`;
}
