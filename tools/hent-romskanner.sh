#!/usr/bin/env bash
# Venter på at GitHub har bygget Romskanner for en commit, og laster ned appen
# til C:\Users\Emil\Romskanner. Feiler byggingen, skrives feilmeldingene ut.
#   bash tools/hent-romskanner.sh [commit]
set -u
cd "$(dirname "$0")/.."
SHA=${1:-$(git rev-parse HEAD)}
REPO=Yzeyr/Malerguiden
UT=/c/Users/Emil/Romskanner
TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill 2>/dev/null | sed -n 's/^password=//p')
api() { curl -s -H "Authorization: Bearer $TOKEN" "https://api.github.com/repos/$REPO/$1"; }
# Python på Windows skriver \r\n; uten dette blir id-ene ødelagt i adressene.
py() { python -c "$1" | tr -d '\r'; }

RID=""; STATUS=""
for i in $(seq 1 60); do
  SVAR=$(api "actions/runs?per_page=10&head_sha=$SHA" | py "
import json,sys; d=json.load(sys.stdin); r=[x for x in d.get('workflow_runs',[]) if 'Romskanner' in x['name']]
print((r[0]['status']+':'+str(r[0]['conclusion'])+' '+str(r[0]['id'])) if r else 'venter 0')")
  STATUS=${SVAR% *}; RID=${SVAR#* }
  echo "$i $STATUS"
  case "$STATUS" in completed:*) break;; esac
  sleep 20
done

if [ "$STATUS" != "completed:success" ]; then
  echo "BYGGINGEN FEILET ($STATUS)"
  JOB=$(api "actions/runs/$RID/jobs" | py "import json,sys; print(json.load(sys.stdin)['jobs'][0]['id'])")
  curl -sL -H "Authorization: Bearer $TOKEN" "https://api.github.com/repos/$REPO/actions/jobs/$JOB/logs" \
    | grep -E "error:|\.swift:[0-9]+:[0-9]+: (error|warning: unre)" | sed 's/^.*Romskanner\/Romskanner\///' | sort -u | head -40
  exit 1
fi

ID=""
for j in $(seq 1 12); do
  ID=$(api "actions/runs/$RID/artifacts" | py "
import json,sys
try:
  a=json.load(sys.stdin)['artifacts']; print(a[0]['id'] if a else '')
except Exception: print('')")
  [ -n "$ID" ] && break
  sleep 10
done
curl -sL -H "Authorization: Bearer $TOKEN" -o "$UT/ny.zip" "https://api.github.com/repos/$REPO/actions/artifacts/$ID/zip"
cd "$UT" && unzip -o -q ny.zip && rm ny.zip
py "
import zipfile,plistlib; z=zipfile.ZipFile('Romskanner.ipa'); p=plistlib.loads(z.read('Payload/Romskanner.app/Info.plist')); print('Lastet ned Romskanner', p['CFBundleShortVersionString'])"
