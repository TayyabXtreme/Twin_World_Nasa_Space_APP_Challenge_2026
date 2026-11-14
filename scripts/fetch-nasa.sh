#!/usr/bin/env bash
# Download the Space Apps 2026 challenge datasets ("Permanent Moon Base Locations and Mars") into assets-raw/nasa.
# Resumable: re-run any time; finished files are skipped, partial ones continue (this network resets long transfers).
# Usage: bash scripts/fetch-nasa.sh            (everything)
#        bash scripts/fetch-nasa.sh moon mars  (only some groups)
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)/assets-raw/nasa"
LOG="$ROOT/download.log"
mkdir -p "$ROOT"

PDS=https://pds-geosciences.wustl.edu
DIV=$PDS/lro/urn-nasa-pds-lro_diviner_derived1
LOLA=$PDS/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img
MRF=$PDS/lro/lro-l-mrflro-5-global-mosaic-v1/lromrf_1001/data/32ppd
GRS=$PDS/ody/ody-m-grs-5-elements-v1/odgm_xxxx/data/smoothed
GRSX=$PDS/ody/urn-nasa-pds-odyssey_grs_special/data

# group | folder | url
FILES=$(cat <<EOF
moon|moon/diviner/polar-resource|$DIV/data_derived_prp/dlre_prp_south.lbl
moon|moon/diviner/polar-resource|$DIV/data_derived_prp/dlre_prp_south.xml
moon|moon/diviner/polar-resource|$DIV/data_derived_prp/dlre_prp_south.tab
moon|moon/diviner/global-maps|$DIV/data_derived_gdr_l3/cylindrical/img/dgdr_ra_avg_cyl_032_img.lbl
moon|moon/diviner/global-maps|$DIV/data_derived_gdr_l3/cylindrical/img/dgdr_ra_avg_cyl_032_img.xml
moon|moon/diviner/global-maps|$DIV/data_derived_gdr_l3/cylindrical/img/dgdr_ra_avg_cyl_032_img.img
moon|moon/diviner/global-maps|$DIV/data_derived_gdr_l3/cylindrical/img/dgdr_st_avg_cyl_032_img.lbl
moon|moon/diviner/global-maps|$DIV/data_derived_gdr_l3/cylindrical/img/dgdr_st_avg_cyl_032_img.xml
moon|moon/diviner/global-maps|$DIV/data_derived_gdr_l3/cylindrical/img/dgdr_st_avg_cyl_032_img.img
moon|moon/lola-south-pole|$LOLA/ldem_75s_240m.lbl
moon|moon/lola-south-pole|$LOLA/ldem_75s_240m.img
moon|moon/lola-south-pole|$LOLA/ldsm_75s_240m.lbl
moon|moon/lola-south-pole|$LOLA/ldsm_75s_240m.img
moon|moon/minirf|$MRF/global_cpr_32ppd_simp_0c.lbl
moon|moon/minirf|$MRF/global_cpr_32ppd_simp_0c.xml
moon|moon/minirf|$MRF/global_cpr_32ppd_simp_0c.img
mars|mars/odyssey-grs|$GRS/h2o_sr_5x5.lbl
mars|mars/odyssey-grs|$GRS/h2o_sr_5x5.tab
mars|mars/odyssey-grs|$GRS/fe_sr_5x5.lbl
mars|mars/odyssey-grs|$GRS/fe_sr_5x5.tab
mars|mars/odyssey-grs|$GRS/cl_sr_5x5.lbl
mars|mars/odyssey-grs|$GRS/cl_sr_5x5.tab
mars|mars/odyssey-grs|$GRS/si_sr_5x5.lbl
mars|mars/odyssey-grs|$GRS/si_sr_5x5.tab
mars|mars/odyssey-grs|$GRS/k_sr_5x5.lbl
mars|mars/odyssey-grs|$GRS/k_sr_5x5.tab
mars|mars/odyssey-grs|$GRS/th_sr_5x5.lbl
mars|mars/odyssey-grs|$GRS/th_sr_5x5.tab
mars|mars/odyssey-grs|$GRSX/ns_epithermal_020917.lbl
mars|mars/odyssey-grs|$GRSX/ns_epithermal_020917.tab
mars|mars/odyssey-grs|$GRSX/grs_h_peaks_020917.lbl
mars|mars/odyssey-grs|$GRSX/grs_h_peaks_020917.tab
mars|mars/mgs-tes|$PDS/mgs/mgs-m-tes-5-timap-v1/mgst_9001.zip
EOF
)

GROUPS_WANTED=("$@")

fetch() {
  local dir="$ROOT/$1" url="$2" name out size have tries=0
  name="$(basename "$url")"
  out="$dir/$name"
  mkdir -p "$dir"
  size=$(curl -sIL -m 60 "$url" | tr -d '\r' | awk 'tolower($1)=="content-length:"{v=$2} END{print v+0}')
  have=$( [ -f "$out" ] && stat -c %s "$out" || echo 0 )
  if [ "$size" -gt 0 ] && [ "$have" -eq "$size" ]; then echo "ok   $1/$name ($size bytes)" | tee -a "$LOG"; return 0; fi
  # Bigger than the server's copy means overlapping writes corrupted it: start that file again.
  if [ "$size" -gt 0 ] && [ "$have" -gt "$size" ]; then echo "reset $1/$name ($have > $size bytes)" | tee -a "$LOG"; rm -f "$out"; fi
  # No curl --retry: curl 8.x starts the file over on a retry; this loop resumes with -C - instead.
  while [ $tries -lt 40 ]; do
    tries=$((tries + 1))
    curl -sSL -C - --speed-time 60 --speed-limit 1024 -o "$out" "$url" 2>>"$LOG"
    have=$(stat -c %s "$out" 2>/dev/null || echo 0)
    if [ "$size" -eq 0 ] || [ "$have" -eq "$size" ]; then echo "done $1/$name ($have bytes)" | tee -a "$LOG"; return 0; fi
    if [ "$have" -gt "$size" ]; then echo "reset $1/$name ($have > $size bytes)" >>"$LOG"; rm -f "$out"; fi
    echo "resume $1/$name at $have/$size (try $tries)" >>"$LOG"
    sleep 2
  done
  echo "FAIL $1/$name ($have/$size)" | tee -a "$LOG"
  return 1
}

echo "=== $(date -u +%FT%TZ) start" >>"$LOG"
while IFS='|' read -r group dir url; do
  [ -z "$group" ] && continue
  # Optional ONLY=<pattern> limits the run to matching URLs (lets two runs work in parallel on different files).
  if [ -n "${ONLY:-}" ] && ! printf '%s' "$url" | grep -q "$ONLY"; then continue; fi
  if [ ${#GROUPS_WANTED[@]} -eq 0 ] || printf '%s\n' "${GROUPS_WANTED[@]}" | grep -qx "$group"; then fetch "$dir" "$url"; fi
done <<<"$FILES"
echo "=== $(date -u +%FT%TZ) end" >>"$LOG"
