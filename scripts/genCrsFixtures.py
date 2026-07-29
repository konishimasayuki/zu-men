#!/usr/bin/env python3
"""proj4js の検証用固定値を PROJ(pyproj) から生成する。

    pip install pyproj && python3 scripts/genCrsFixtures.py

手で書いた期待値では「自分の実装を自分の記憶で検証する」ことになり意味がない。
PROJ は EPSG の公式パラメータを持つ独立実装なので、これと突き合わせる。
出力は src/geo/__fixtures__/crs.json。
"""
import json
import os

import pyproj
from pyproj import CRS, Transformer

# 系番号 -> JGD2011 平面直角座標系のEPSGコード
EPSG = {i: 6668 + i for i in range(1, 20)}

# 変換の突合に使う地点。ここでの系番号は「その地点が属する系」であり、
# 系の割り当てそのものは zone.ts 側のテストで別途確認する。
SAMPLES = {
    9: [
        ("埼玉県鴻巣市", 36.065834, 139.522232),
        ("東京都千代田区", 35.689500, 139.691700),
        ("茨城県つくば市（国土地理院）", 36.104611, 140.084556),
    ],
    6: [("大阪市中央区", 34.686300, 135.519700)],
    7: [("名古屋市中区", 35.181500, 136.906600)],
    2: [("福岡市中央区", 33.590400, 130.401700)],
    11: [("札幌市中央区", 43.062100, 141.354400)],
    10: [("仙台市青葉区", 38.268200, 140.869400)],
    15: [("那覇市", 26.212400, 127.680900)],
}


def main() -> None:
    out = {
        "generatedBy": f"PROJ {pyproj.proj_version_str} / pyproj {pyproj.__version__}",
        "note": "X=北, Y=東。proj4js の実装と突き合わせるための独立実装の出力。",
        "origins": [],
        "points": [],
    }

    for zone, epsg in EPSG.items():
        crs = CRS.from_epsg(epsg)
        params = dict(
            p.split("=") for p in crs.to_proj4().replace("+", "").split() if "=" in p
        )
        out["origins"].append(
            {
                "zone": zone,
                "epsg": epsg,
                "lat": float(params["lat_0"]),
                "lon": float(params["lon_0"]),
                "k": float(params["k"]),
            }
        )

    for zone, items in SAMPLES.items():
        # EPSG:6669.. の軸順は (X=北, Y=東)。always_xy=False なので入出力も (lat, lon) / (X, Y)。
        t = Transformer.from_crs("EPSG:4326", f"EPSG:{EPSG[zone]}", always_xy=False)
        for name, lat, lon in items:
            x, y = t.transform(lat, lon)
            out["points"].append(
                {
                    "zone": zone,
                    "name": name,
                    "lat": lat,
                    "lon": lon,
                    "x": round(x, 6),
                    "y": round(y, 6),
                }
            )

    path = os.path.join(os.path.dirname(__file__), "..", "src", "geo", "__fixtures__", "crs.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"{len(out['origins'])} origins / {len(out['points'])} points -> {os.path.normpath(path)}")


if __name__ == "__main__":
    main()
