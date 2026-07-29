/** 縮尺ごとに用紙へ収まるかを実測する。農地法関係事務処理要領の推奨範囲と対照する。 */
import { checkFit } from '../src/pdf/plan';
import { referenceScene } from '../src/scenes/reference';
import { PAPER_SIZES, PAPER_ORDER } from '../src/paper/layout';
import { NOUCHI_DRAWINGS, isLayoutPlanScaleRecommended } from '../src/draw/standards';

const scene = referenceScene();
const lp = NOUCHI_DRAWINGS.layoutPlan;
console.log(`要領の推奨縮尺: 1/${lp.scaleMin} 〜 1/${lp.scaleMax}\n`);
console.log('縮尺     推奨  A4図郭の実寸        図面 85.9×67.7m は収まるか');
console.log('-'.repeat(70));
for (const s of [250, 300, 500, 600, 1000, 2000]) {
  const a4 = checkFit(scene, PAPER_SIZES.A4, s);
  const rec = isLayoutPlanScaleRecommended(s) ? '○' : '×';
  const smallest = PAPER_ORDER.find((n) => checkFit(scene, PAPER_SIZES[n], s).fits) ?? 'なし';
  console.log(
    `1/${String(s).padEnd(5)} ${rec}    ${a4.frameWidthM.toFixed(1)}×${a4.frameHeightM.toFixed(1)}m`.padEnd(38) +
    `${a4.fits ? '収まる' : '収まらない'}（最小用紙: ${smallest}）`,
  );
}
