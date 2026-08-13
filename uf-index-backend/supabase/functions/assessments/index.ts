// ============================================================================
// POST /functions/v1/assessments
//
// Takes raw check-in answers, stores them, computes the score server-side, and
// returns it. The client never sends a score — it can't be trusted to.
//
// Idempotent: upserts on (user_id, client_id), so a retried sync after a
// dropped connection updates the row instead of creating a duplicate.
// ============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { computeScore, FORMULA_VERSION, type AssessmentInput } from '../_shared/scoring.ts';
import { corsHeaders, json, preflight } from '../_shared/http.ts';

interface Body extends AssessmentInput {
  client_id: string;
  taken_at?: string;
  age_at_time?: number;
  note?: string;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  // The caller's JWT is forwarded, so RLS applies to everything below.
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

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON' }, 400);
  }

  // ---- validate before touching the database -------------------------------
  const problems: string[] = [];
  if (!body.client_id) problems.push('client_id is required');
  if (!['male', 'female'].includes(body.gender)) problems.push('gender must be male or female');

  const range = (v: number, lo: number, hi: number, name: string) => {
    if (typeof v !== 'number' || Number.isNaN(v)) problems.push(`${name} is required`);
    else if (v < lo || v > hi) problems.push(`${name} must be between ${lo} and ${hi}`);
  };
  range(body.weightKg, 25, 300, 'weightKg');
  range(body.heightCm, 100, 250, 'heightCm');
  range(body.neckCm, 20, 60, 'neckCm');
  range(body.waistCm, 40, 180, 'waistCm');
  range(body.rpeMorning, 1, 5, 'rpeMorning');
  range(body.rpeAfternoon, 1, 5, 'rpeAfternoon');
  range(body.bodyFeeling, 1, 5, 'bodyFeeling');
  range(body.sleepQuality, 1, 5, 'sleepQuality');
  range(body.sleepHours, 0.5, 16, 'sleepHours');
  if (body.gender === 'female') range(body.hipCm, 50, 200, 'hipCm');
  if (body.waistCm <= body.neckCm) problems.push('waistCm must be greater than neckCm');

  if (problems.length) return json({ error: 'Validation failed', problems }, 422);

  // ---- store the raw answers (idempotent) ----------------------------------
  const { data: assessment, error: insErr } = await supabase
    .from('assessments')
    .upsert({
      user_id: userId,
      client_id: body.client_id,
      taken_at: body.taken_at ?? new Date().toISOString(),
      age_at_time: body.age_at_time ?? null,
      weight_kg: body.weightKg,
      height_cm: body.heightCm,
      neck_cm: body.neckCm,
      waist_cm: body.waistCm,
      hip_cm: body.hipCm ?? null,
      rpe_morning: body.rpeMorning,
      rpe_afternoon: body.rpeAfternoon,
      body_feeling: body.bodyFeeling,
      sleep_quality: body.sleepQuality,
      sleep_hours: body.sleepHours,
      note: body.note ?? null,
    }, { onConflict: 'user_id,client_id' })
    .select('id')
    .single();

  if (insErr) return json({ error: 'Could not save the check-in', detail: insErr.message }, 400);

  // ---- score it ------------------------------------------------------------
  const result = computeScore(body);

  // Scores are written with the service role: assessment_scores has no client
  // INSERT policy, so a user can never invent their own score.
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const pill = (n: string) => result.pillars.find(p => p.name === n)!.value;

  const { error: scoreErr } = await admin
    .from('assessment_scores')
    .upsert({
      assessment_id: assessment.id,
      formula_version: FORMULA_VERSION,
      body_fat_pct: result.bodyFatPct,
      pillar_body: pill('Body composition'),
      pillar_energy: pill('Perceived energy'),
      pillar_sleep: pill('Sleep'),
      pillar_feeling: pill('Body feeling'),
      uf_score: result.score,
      band: result.band.toLowerCase(),
    }, { onConflict: 'assessment_id' });

  if (scoreErr) return json({ error: 'Saved, but scoring failed', detail: scoreErr.message }, 500);

  // keep the cached streak marker fresh
  await admin.from('user_settings')
    .update({ last_checkin_at: new Date().toISOString() })
    .eq('user_id', userId);

  return json({
    id: assessment.id,
    client_id: body.client_id,
    score: result.score,
    band: result.band,
    bodyFatPct: result.bodyFatPct,
    pillars: result.pillars,
    formulaVersion: result.formulaVersion,
  }, 200);
});
