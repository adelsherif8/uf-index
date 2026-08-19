set -e
K=sb_publishable_dOpVrCDygwSa2HdA2PjQEg_avWyFOdR
B=https://aneshngmljfhkjblsvqd.supabase.co
EMAIL="demo@ufaslive.com"
PASS="${UF_DEMO_PASSWORD:?set UF_DEMO_PASSWORD before running}"

# fresh start: if it exists, sign in and wipe, else sign up
curl -s -X POST -H "apikey: $K" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" "$B/auth/v1/token?grant_type=password" > /tmp/d.json
T=$(python3 -c "import json;d=json.load(open('/tmp/d.json'));print(d.get('access_token') or '')")
if [ -n "$T" ]; then
  echo "existing demo account found — resetting it"
  curl -s -o /dev/null -X POST -H "apikey: $K" -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d '{}' "$B/rest/v1/rpc/delete_my_account"
fi
curl -s -X POST -H "apikey: $K" -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" "$B/auth/v1/signup" > /tmp/d.json
T=$(python3 -c "import json;print(json.load(open('/tmp/d.json'))['access_token'])")
U=$(python3 -c "import json;print(json.load(open('/tmp/d.json'))['user']['id'])")
echo "demo user: $U"
A=(-H "apikey: $K" -H "Authorization: Bearer $T" -H "Content-Type: application/json")

curl -s -o /dev/null -X POST "${A[@]}" -H "Prefer: resolution=merge-duplicates" \
 -d "{\"id\":\"$U\",\"full_name\":\"Demo Client\",\"gender\":\"female\",\"organization\":\"UFAS Demo\",\"locale\":\"en\",\"unit_system\":\"metric\"}" "$B/rest/v1/profiles"
curl -s -o /dev/null -X POST "${A[@]}" \
 -d "[{\"user_id\":\"$U\",\"consent_type\":\"health_data_processing\",\"granted\":true,\"policy_version\":\"privacy-v1.1\"},{\"user_id\":\"$U\",\"consent_type\":\"coach_visibility\",\"granted\":true,\"policy_version\":\"privacy-v1.1\"},{\"user_id\":\"$U\",\"consent_type\":\"marketing\",\"granted\":false,\"policy_version\":\"privacy-v1.1\"}]" "$B/rest/v1/user_consents"

# ten weekly check-ins, someone genuinely improving
i=0
python3 - > /tmp/rows.txt <<'PY'
import datetime, json
base = datetime.datetime(2026,8,19,7,30)
rows = [
 # weeksAgo, weight, waist, hip, neck, am, pm, feel, sq, hrs, note
 (10, 72.0, 88, 104, 33, 2, 2, 2, 2, 5.5, "Starting out. Shoulders always tight."),
 ( 9, 71.6, 87, 104, 33, 2, 2, 2, 3, 6.0, ""),
 ( 8, 71.1, 86, 103, 33, 3, 2, 3, 3, 6.5, "Walked every morning this week."),
 ( 7, 70.8, 85, 103, 33, 3, 3, 3, 3, 6.5, ""),
 ( 6, 70.2, 84, 102, 33, 3, 3, 3, 4, 7.0, "Lights out by 11 is actually working."),
 ( 5, 69.9, 83, 102, 33, 4, 3, 4, 4, 7.0, ""),
 ( 4, 69.4, 82, 101, 33, 4, 3, 4, 4, 7.5, "Travel week, held it together."),
 ( 3, 69.0, 81, 101, 33, 4, 4, 4, 4, 7.5, ""),
 ( 2, 68.6, 80, 100, 33, 4, 4, 4, 5, 8.0, "Best I've felt in a year."),
 ( 0, 68.2, 79, 100, 33, 5, 4, 5, 5, 8.0, "Kept the streak. Sleeping through now."),
]
for (w, wt, ws, hp, nk, am, pm, bf, sq, hrs, note) in rows:
    at = (base - datetime.timedelta(weeks=w)).isoformat() + "Z"
    print(json.dumps({"client_id": f"demo-{w:02d}", "taken_at": at, "age_at_time": 34,
        "gender":"female","weightKg":wt,"heightCm":166,"neckCm":nk,"waistCm":ws,"hipCm":hp,
        "rpeMorning":am,"rpeAfternoon":pm,"bodyFeeling":bf,"sleepQuality":sq,"sleepHours":hrs,
        "note": note or None}))
PY
while read -r row; do
  s=$(curl -s -X POST "${A[@]}" -d "$row" "$B/functions/v1/assessments" | python3 -c "import json,sys;d=json.load(sys.stdin);print(f\"{d.get('score')} {d.get('band')}\")" 2>/dev/null)
  i=$((i+1)); echo "  check-in $i -> $s"
done < /tmp/rows.txt

# two Plus sittings, the later one better
curl -s -o /dev/null -X POST "${A[@]}" -d '{"code":"WHO5","client_id":"demo-plus1-who5","answers":[2,2,3,2,2]}' "$B/functions/v1/plus-sessions"
curl -s -o /dev/null -X POST "${A[@]}" -d '{"code":"PSS10","client_id":"demo-plus1-pss","answers":[3,3,2,1,1,3,2,1,3,3]}' "$B/functions/v1/plus-sessions"
curl -s -o /dev/null -X POST "${A[@]}" -d '{"code":"PSQI","client_id":"demo-plus1-psqi","answers":{"bedTime":"00:30","wakeTime":"06:00","latencyMin":45,"sleepHours":5,"freq":[2,2,2,1,1,2,1,2,1,1],"extra":[2,1,2,2]}}' "$B/functions/v1/plus-sessions"
curl -s -o /dev/null -X POST "${A[@]}" -d '{"code":"WHO5","client_id":"demo-plus2-who5","answers":[4,4,4,4,3]}' "$B/functions/v1/plus-sessions"
curl -s -o /dev/null -X POST "${A[@]}" -d '{"code":"PSS10","client_id":"demo-plus2-pss","answers":[1,1,3,3,3,1,3,3,1,1]}' "$B/functions/v1/plus-sessions"
curl -s -X POST "${A[@]}" -d '{"code":"PSQI","client_id":"demo-plus2-psqi","answers":{"bedTime":"23:00","wakeTime":"07:00","latencyMin":15,"sleepHours":8,"freq":[0,1,1,0,0,0,0,1,0,0],"extra":[0,0,1,1]}}' "$B/functions/v1/plus-sessions" | python3 -c "import json,sys;d=json.load(sys.stdin);print('  plus (latest PSQI):',d.get('scaled'),d.get('band'))"

curl -s -o /dev/null -X POST "${A[@]}" -d '{"trial_days":14}' "$B/rest/v1/rpc/start_plus_trial"
curl -s -o /dev/null -X POST "${A[@]}" -d "{\"user_id\":\"$U\",\"status\":\"requested\"}" "$B/rest/v1/call_requests"

echo
echo "--- what the demo account now holds ---"
curl -s "${A[@]}" "$B/rest/v1/assessments_with_scores?select=taken_at,uf_score,band&order=taken_at.asc" \
 | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(f'  {len(d)} check-ins')
for r in d: print('   ',r['taken_at'][:10],'->',r['uf_score'],r['band'])"
