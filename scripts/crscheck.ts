/** proj4js と PROJ の一致度を実測して表示する。 */
import { toPlaneXY, ZONE_DEFINITIONS, ZONE_NUMBERS, zoneLabel } from '../src/geo/crs';
import type { ZoneNumber } from '../src/geo/crs';
import fixtures from '../src/geo/__fixtures__/crs.json';

console.log(`独立実装: ${fixtures.generatedBy}\n`);

let worstOrigin = 0;
for (const zone of ZONE_NUMBERS) {
  const d = ZONE_DEFINITIONS[zone];
  const xy = toPlaneXY({ lon: d.originLon, lat: d.originLat }, zone);
  worstOrigin = Math.max(worstOrigin, Math.hypot(xy.x, xy.y));
}
console.log(`19系の原点 → (0,0) の最大ずれ: ${worstOrigin.toExponential(3)} m\n`);

console.log('地点                              系      X[m]           Y[m]         PROJとの差[mm]');
let worst = 0;
for (const p of fixtures.points) {
  const xy = toPlaneXY({ lon: p.lon, lat: p.lat }, p.zone as ZoneNumber);
  const dmm = Math.hypot(xy.x - p.x, xy.y - p.y) * 1000;
  worst = Math.max(worst, dmm);
  console.log(
    `${p.name.padEnd(30, '　').slice(0, 30)} ${String(p.zone).padStart(2)}  ${xy.x.toFixed(3).padStart(13)} ${xy.y.toFixed(3).padStart(13)}   ${dmm.toExponential(2)}`,
  );
}
console.log(`\n最大の差: ${worst.toExponential(3)} mm`);
console.log(`\n参考: 系を9→8に取り違えた場合のずれ`);
const k = { lon: 139.522232, lat: 36.065834 };
const a = toPlaneXY(k, 9), b = toPlaneXY(k, 8);
console.log(`  ${zoneLabel(9)} → X=${a.x.toFixed(1)} Y=${a.y.toFixed(1)}`);
console.log(`  ${zoneLabel(8)} → X=${b.x.toFixed(1)} Y=${b.y.toFixed(1)}`);
console.log(`  差 ${(Math.hypot(a.x-b.x, a.y-b.y)/1000).toFixed(1)} km`);
