/** 地理院の住所検索APIと系番号推定を実地で確認する。 */
import { searchAddress } from '../src/data/gsi';
import { estimateZone } from '../src/geo/zone';
import { toPlaneXY, zoneLabel } from '../src/geo/crs';

const queries = ['埼玉県鴻巣市', '鴻巣市本町', '北海道浦河町', '沖縄県石垣市', 'そんな地名はない'];

for (const q of queries) {
  const hits = await searchAddress(q);
  if (hits.length === 0) {
    console.log(`「${q}」→ 該当なし\n`);
    continue;
  }
  const h = hits[0];
  const e = estimateZone(h.title, h.position);
  const xy = toPlaneXY(h.position, e.zone);
  console.log(`「${q}」→ ${h.title}  (${h.position.lat.toFixed(6)}, ${h.position.lon.toFixed(6)})  候補${hits.length}件`);
  console.log(`   ${zoneLabel(e.zone)}  [${e.confidence}] ${e.reason}`);
  console.log(`   X=${xy.x.toFixed(3)}m  Y=${xy.y.toFixed(3)}m\n`);
}
