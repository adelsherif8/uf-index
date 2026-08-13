// ============================================================================
// POST /functions/v1/plus-sessions
//
// One call per questionnaire sitting. The client sends raw answers; the server
// scores them with the published rules and stores both the session and every
// individual answer, so a re-score is always possible.
//
// Body:
//   { code: 'WHO5' | 'PSS10' | 'PSQI', client_id: string, answers: {...} }
//
//   WHO5   answers: number[5]   each 0..5
//   PSS10  answers: number[10]  each 0..4   (items 4,5,7,8 reverse scored here)
//   PSQI   answers: { bedTime, wakeTime, latencyMin, sleepHours,
//                     freq: number[10], extra: number[4] }
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { scoreWho5, scorePss10, scorePsqi, type PsqiInput } from '../_shared/scoring.ts';
import { json, preflight } from '../_shared/http.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth.user) return json({ error: 'Not signed in' }, 401);
  const userId = auth.user.id;

  let body: { code?: string; client_id?: string; answers?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON' }, 400);
  }

  const code = body.code;
  if (!code || !['WHO5', 'PSS10', 'PSQI'].includes(code)) {
    return json({ error: "code must be 'WHO5', 'PSS10' or 'PSQI'" }, 422);
  }
  if (!body.client_id) return json({ error: 'client_id is required' }, 422);

  // ---- score with the published rules --------------------------------------
  let raw: number, scaled: number, band: string;
  const answersArray = Array.isArray(body.answers) ? body.answers as number[] : null;

  try {
    if (code === 'WHO5') {
      if (!answersArray || answersArray.length !== 5) {
        return json({ error: 'WHO5 needs 5 answers, each 0..5' }, 422);
      }
      if (answersArray.some(v => v < 0 || v > 5)) {
        return json({ error: 'WHO5 answers must be 0..5' }, 422);
      }
      ({ raw, scaled, band } = scoreWho5(answersArray));

    } else if (code === 'PSS10') {
      if (!answersArray || answersArray.length !== 10) {
        return json({ error: 'PSS10 needs 10 answers, each 0..4' }, 422);
      }
      if (answersArray.some(v => v < 0 || v > 4)) {
        return json({ error: 'PSS10 answers must be 0..4' }, 422);
      }
      ({ raw, scaled, band } = scorePss10(answersArray));

    } else {
      const p = body.answers as PsqiInput;
      if (!p || !Array.isArray(p.freq) || p.freq.length !== 10
            || !Array.isArray(p.extra) || p.extra.length !== 4) {
        return json({ error: 'PSQI needs freq[10], extra[4] and the sleep times' }, 422);
      }
      ({ raw, scaled, band } = scorePsqi(p));
    }
  } catch (e) {
    return json({ error: 'Could not score those answers', detail: String(e) }, 422);
  }

  // ---- find the current version of this instrument -------------------------
  const { data: q, error: qErr } = await supabase
    .from('questionnaires')
    .select('id')
    .eq('code', code)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (qErr || !q) return json({ error: `Questionnaire ${code} is not seeded` }, 500);

  // ---- store the sitting (idempotent) --------------------------------------
  const { data: session, error: sErr } = await supabase
    .from('plus_sessions')
    .upsert({
      user_id: userId,
      questionnaire_id: q.id,
      client_id: body.client_id,
      completed_at: new Date().toISOString(),
      raw_total: raw,
      scaled_score: scaled,
      interpretation: band,
    }, { onConflict: 'user_id,client_id' })
    .select('id')
    .single();

  if (sErr) return json({ error: 'Could not save the session', detail: sErr.message }, 400);

  // ---- store each answer, so a re-score is always possible ------------------
  if (answersArray) {
    const { data: items } = await supabase
      .from('questionnaire_items')
      .select('id, item_no')
      .eq('questionnaire_id', q.id)
      .order('item_no');

    if (items?.length) {
      const rows = answersArray
        .map((value, idx) => {
          const item = items.find(i => i.item_no === idx + 1);
          return item ? { session_id: session.id, item_id: item.id, value } : null;
        })
        .filter(Boolean);
      if (rows.length) {
        await supabase.from('plus_answers').upsert(rows as never[], { onConflict: 'session_id,item_id' });
      }
    }
  }

  return json({ id: session.id, code, raw, scaled, band }, 200);
});
