/**
 * 対象2件について、縮尺と用紙ごとに「周辺を何メートル描けるか」を実測する。
 * 依頼者の目的は周辺を含む計画平面図なので、ここが判断の要になる。
 */
import { PAPER_SIZES, PAPER_ORDER, frameExtentMeters } from '../src/paper/layout';
import { tsuboToM2, squareSideM, formatTsuboWithM2 } from '../src/draw/tsubo';
import { isLayoutPlanScaleRecommended } from '../src/draw/standards';

const SITES = [90, 143];
const SCALES = [250, 300, 500];

for (const tsubo of SITES) {
  const m2 = tsuboToM2(tsubo);
  const side = squareSideM(m2);
  console.log(`\n■ ${formatTsuboWithM2(tsubo)}　正方形とみなすと一辺 ${side.toFixed(1)}m`);
  console.log('  縮尺   要領  用紙  図郭の実寸        敷地の外に描ける周辺（左右／上下）');
  console.log('  ' + '-'.repeat(76));
  for (const scale of SCALES) {
    for (const name of PAPER_ORDER.slice(0, 2)) {   // A4 と A3
      const e = frameExtentMeters(PAPER_SIZES[name], scale);
      const hor = (e.widthM - side) / 2;
      const ver = (e.heightM - side) / 2;
      const fits = hor > 0 && ver > 0;
      const rec = isLayoutPlanScaleRecommended(scale) ? '○' : '×';
      console.log(
        `  1/${String(scale).padEnd(4)} ${rec}     ${name}   ` +
        `${e.widthM.toFixed(1)}×${e.heightM.toFixed(1)}m`.padEnd(18) +
        (fits ? `各 ${hor.toFixed(1)}m ／ ${ver.toFixed(1)}m` : '敷地が入らない'),
      );
    }
  }
}

console.log('\n\n■ 参考図面の敷地（比較）');
const refM2 = 1337;
console.log(`  ${refM2}㎡ ＝ 約${Math.round(refM2 / (400 / 121))}坪。一辺 ${squareSideM(refM2).toFixed(1)}m`);
console.log(`  依頼者の143坪の ${(refM2 / tsuboToM2(143)).toFixed(1)} 倍の広さ`);
