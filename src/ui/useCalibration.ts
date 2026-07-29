/**
 * 印刷補正の設定を保持する。
 *
 * 依頼者は「いま印刷できない」ため、補正はあとから設定される。
 * ブラウザに保存し、次に開いたときも効いているようにする。
 */

import { useEffect, useState } from 'react';
import { calibrationFactor, PrinterCalibration } from '../paper/calibration';

const STORAGE_KEY = 'zu-men.printerCalibration.v1';

/** 検証シートの基準線のうち、最も長く測りやすいもの。 */
export const DEFAULT_NOMINAL_MM = 200;

export interface CalibrationState {
  enabled: boolean;
  nominalMm: number;
  /** 未入力を許すため文字列で保持する。 */
  measuredMmText: string;
}

const INITIAL: CalibrationState = {
  enabled: false,
  nominalMm: DEFAULT_NOMINAL_MM,
  measuredMmText: '',
};

function load(): CalibrationState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL;
    const parsed = JSON.parse(raw) as Partial<CalibrationState>;
    return {
      enabled: parsed.enabled === true,
      nominalMm: typeof parsed.nominalMm === 'number' ? parsed.nominalMm : DEFAULT_NOMINAL_MM,
      measuredMmText: typeof parsed.measuredMmText === 'string' ? parsed.measuredMmText : '',
    };
  } catch {
    return INITIAL;
  }
}

export interface CalibrationResult {
  state: CalibrationState;
  setState: (patch: Partial<CalibrationState>) => void;
  /** PDF生成に渡す値。補正が無効か入力が不正なら undefined。 */
  calibration: PrinterCalibration | undefined;
  /** 有効なときの倍率。無効なら null。 */
  factor: number | null;
  /** 入力が不正なときの理由。 */
  error: string | null;
}

export function useCalibration(): CalibrationResult {
  const [state, setRaw] = useState<CalibrationState>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 保存できなくても動作は続ける
    }
  }, [state]);

  function setState(patch: Partial<CalibrationState>) {
    setRaw((prev) => ({ ...prev, ...patch }));
  }

  let calibration: PrinterCalibration | undefined;
  let factor: number | null = null;
  let error: string | null = null;

  if (state.enabled) {
    const measured = Number(state.measuredMmText);
    if (state.measuredMmText.trim() === '') {
      error = '実測値を入力してください。';
    } else if (!Number.isFinite(measured) || measured <= 0) {
      error = '実測値は正の数で入力してください。';
    } else {
      const candidate = { nominalMm: state.nominalMm, measuredMm: measured };
      try {
        factor = calibrationFactor(candidate);
        calibration = candidate;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    }
  }

  return { state, setState, calibration, factor, error };
}
