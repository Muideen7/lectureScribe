#!/usr/bin/env bash
# Fetch variable webfonts from Google Fonts and self-host the latin subset.
set -e
cd "$(dirname "$0")"
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

fetch_family () {
  local name="$1" query="$2" out="$3"
  echo "== $name"
  curl -s -H "User-Agent: $UA" "https://fonts.googleapis.com/css2?family=${query}&display=swap" > "raw-${name}.css"
  # keep only the latin subset block (last /* latin */ block per style)
  python3 - "$name" <<'PY'
import re, sys, subprocess, pathlib
name = sys.argv[1]
css = pathlib.Path(f"raw-{name}.css").read_text()
# split into blocks with their preceding comment
blocks = re.findall(r"/\*\s*(\S+)\s*\*/\s*@font-face\s*\{(.*?)\}", css, re.S)
out = []
for subset, body in blocks:
    if subset != "latin":
        continue
    url = re.search(r"url\((https://[^)]+)\)", body).group(1)
    fname = f"{name}-{len(out)}.woff2"
    subprocess.run(["curl", "-s", url, "-o", fname], check=True)
    body = re.sub(r"url\(https://[^)]+\)", f"url(fonts/{fname})", body)
    body = re.sub(r"font-display: swap;", "font-display: block;", body)
    out.append("@font-face {" + body + "}")
pathlib.Path(f"fonts-{name}.css").write_text("\n".join(out))
print(f"  {len(out)} latin face(s) -> fonts-{name}.css")
PY
}

fetch_family bricolage "Bricolage+Grotesque:ital,opsz,wdth,wght@0,12..96,75..100,200..800;1,12..96,75..100,200..800" bricolage
fetch_family newsreader "Newsreader:ital,opsz,wght@0,6..72,200..700;1,6..72,200..700" newsreader
fetch_family unbounded "Unbounded:wght@200..900" unbounded
fetch_family hanken "Hanken+Grotesk:ital,wght@0,100..900;1,100..900" hanken

echo "---"; ls -la fonts/ 2>/dev/null; ls -la *.woff2 | head
