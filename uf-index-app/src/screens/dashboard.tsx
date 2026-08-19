// Dashboard, delta moment, history, badges, insights, coach — with real persistence.
import React from 'react';
import { View, Text, Pressable, Switch, StyleSheet, Alert, Modal } from 'react-native';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { C, FONT } from '../lib/theme';
import { useNav } from '../lib/nav';
import { useStore, streakWeeks, AssessmentRecord } from '../lib/store';
import { leanThresholds } from '../lib/scoring';
import { requestCall, deleteAssessment } from '../lib/api';
import { ScreenShell, Btn, H2, Sub, Card } from '../components/ui';
import { play, vib } from '../lib/fx';
import { bandLabel } from '../lib/i18n';
import { FontAwesome } from '@expo/vector-icons';

const latest = (recs: AssessmentRecord[]) => recs[recs.length - 1];

/**
 * Lean mass over time, with the score bands drawn behind it.
 *
 * The 1–5 score is a category, so it only moves when someone crosses a
 * boundary — plotting it draws a staircase that sits flat for weeks while the
 * person is genuinely improving. Lean mass moves every check-in, and it rises
 * as you improve, so the line goes the direction people expect.
 *
 * The bands behind it are the thing the number alone can't show: how close the
 * next category is.
 */
const TrendChart = React.memo(function TrendChart({ records }: { records: AssessmentRecord[] }) {
  const W = 300, H = 96, padX = 10, padY = 12, labelW = 20;
  const recent = records.slice(-8);
  const gender = recent[recent.length - 1]?.input.gender ?? 'female';
  const data = recent.map(r => 100 - r.result.bodyFatPct);
  if (data.length === 1) data.unshift(data[0]);

  const edges = leanThresholds(gender);
  const lo0 = Math.min(...data), hi0 = Math.max(...data);
  // widen the window so at least one boundary is visible above and below
  const below = [...edges].reverse().find(e => e.lean <= lo0)?.lean ?? lo0 - 3;
  const above = edges.find(e => e.lean >= hi0)?.lean ?? hi0 + 3;
  const lo = Math.min(lo0 - 2, below - 1), hi = Math.max(hi0 + 2, above + 1);

  const x = (i: number) => labelW + padX + (i * (W - labelW - 2 * padX)) / (data.length - 1);
  const y = (v: number) => H - padY - ((v - lo) / (hi - lo)) * (H - 2 * padY);
  const pts = data.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const areaPts = `${x(0)},${H - padY} ${pts} ${x(data.length - 1)},${H - padY}`;

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      {/* one faint band per score category that falls inside the window */}
      {edges.filter(e => e.lean > lo && e.lean < hi).map(e => (
        <React.Fragment key={e.score}>
          <Line x1={labelW} x2={W - padX} y1={y(e.lean)} y2={y(e.lean)}
            stroke={C.gold35} strokeWidth={1} strokeDasharray="3 3" />
          <SvgText x={2} y={y(e.lean) + 3.5} fill={C.white73} fontSize={9}>{e.score}</SvgText>
        </React.Fragment>
      ))}
      <Polyline points={areaPts} fill={C.gold13} stroke="none" />
      <Polyline points={pts} fill="none" stroke={C.gold} strokeWidth={2.5}
        strokeLinecap="round" strokeLinejoin="round" />
      {data.map((v, i) => (
        <Circle key={i} cx={x(i)} cy={y(v)} r={i === data.length - 1 ? 4.5 : 3}
          fill={i === data.length - 1 ? C.white : C.auburn} stroke={C.gold} strokeWidth={1.2} />
      ))}
    </Svg>
  );
});

/** "2.4% of lean mass from a 4" — the sentence the chart is really answering. */
function nextBandLine(records: AssessmentRecord[]): string | null {
  const last = records[records.length - 1];
  if (!last) return null;
  const lean = 100 - last.result.bodyFatPct;
  const next = leanThresholds(last.input.gender).find(e => e.lean > lean);
  if (!next) return `Lean mass ${lean.toFixed(1)}% — the top band.`;
  return `Lean mass ${lean.toFixed(1)}% · ${(next.lean - lean).toFixed(1)}% more to reach ${next.score}`;
}

export function DashboardScreen() {
  const nav = useNav();
  const { state, patch } = useStore();
  const recs = state.records;

  if (!recs.length) {
    return (
      <ScreenShell cta={<Btn label="Take your first assessment" onPress={() => nav.go('profile')} />}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 420 }}>
          <View style={ds.emptyRing}><Text style={ds.emptyRingTxt}>—</Text></View>
          <Text style={ds.emptyTitle}>No charge yet</Text>
          <Text style={ds.emptySub}>Your UF Index appears here after your first check-in. Three minutes — the machine is waiting.</Text>
        </View>
      </ScreenShell>
    );
  }

  const last = latest(recs);
  const prev = recs.length > 1 ? recs[recs.length - 2] : null;
  const d = prev ? +(last.result.score - prev.result.score).toFixed(1) : null;
  const fatD = prev ? +(last.result.bodyFatPct - prev.result.bodyFatPct).toFixed(1) : null;
  const streak = streakWeeks(recs);
  const name = (state.profile.name || 'there').split(' ')[0];
  const weakest = [...last.result.pillars].sort((a, b) => a.value - b.value)[0];
  const lowBand = last.result.score < 3;
  // streak countdown: checked in this week already?
  const weekOf = (dd: Date) => Math.floor(dd.getTime() / (7 * 864e5));
  const doneThisWeek = weekOf(new Date(last.takenAt)) === weekOf(new Date());
  const daysToSunday = (7 - new Date().getDay()) % 7;
  const dueLine = doneThisWeek
    ? 'This week is charged. Next check-in unlocks Monday.'
    : daysToSunday === 0 ? 'Due today — keep the streak alive.'
    : `Due by Sunday — ${daysToSunday} day${daysToSunday === 1 ? '' : 's'} left.`;
  // monthly recap
  const now = new Date();
  const monthRecs = recs.filter(r => {
    const d = new Date(r.takenAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthDelta = monthRecs.length >= 2
    ? +(monthRecs[monthRecs.length - 1].result.score - monthRecs[0].result.score).toFixed(1) : null;
  const bestPillar = monthRecs.length >= 2
    ? [...monthRecs[monthRecs.length - 1].result.pillars].sort((a, b) => b.value - a.value)[0].name : null;
  const monthName = now.toLocaleDateString('en-US', { month: 'long' });

  return (
    <ScreenShell
      cta={<Btn label="Re-check · drop a token" variant="blood" onPress={() => nav.go('profile')} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={ds.hello}>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {name}</Text>
        <Pressable onPress={() => { vib.tick(); nav.go('settings'); }} hitSlop={14}
          style={({ pressed }) => [{ marginLeft: 'auto', padding: 6 }, pressed && { opacity: 0.6 }]}>
          <FontAwesome name="cog" size={18} color={C.whiteA6} />
        </Pressable>
      </View>
      <View style={[ds.scoreCard, lowBand && { borderColor: C.auburn, backgroundColor: C.auburn50 }]}>
        <View>
          <Text style={[ds.scoreNum, lowBand && { color: C.white }]}>{last.result.score}</Text>
          <Text style={ds.scoreLbl}>UF INDEX</Text>
        </View>
        <View style={{ marginLeft: 'auto', alignItems: 'flex-end' }}>
          <View style={ds.bandChip}><Text style={ds.bandChipTxt}>{bandLabel(state.lang, last.result.band)}</Text></View>
          {d != null && d !== 0 && (
            <Text style={ds.delta}>{d > 0 ? '▲ +' : '▼ '}{Math.abs(d)} vs last check-in</Text>
          )}
          {d === 0 && fatD != null && fatD !== 0 && (
            <Text style={ds.delta}>
              {fatD < 0 ? '▲ ' : '▼ '}{Math.abs(fatD)}% body fat since last time
            </Text>
          )}
        </View>
      </View>

      <Card>
        <Text style={ds.cardH}>YOUR TREND · {recs.length} CHECK-IN{recs.length > 1 ? 'S' : ''}</Text>
        <TrendChart records={recs} />
        {nextBandLine(recs) && <Text style={ds.trendFoot}>{nextBandLine(recs)}</Text>}
        <Pressable onPress={() => { vib.tick(); nav.go('history'); }} hitSlop={8}
          style={({ pressed }) => pressed ? { opacity: 0.6 } : null}>
          <Text style={ds.link}>View full history →</Text></Pressable>
      </Card>

      <Card>
        <Text style={ds.cardH}>NEXT BEST ACTION</Text>
        <Text style={ds.actionT}>{ACTION[weakest.name]?.[0]}</Text>
        <Text style={ds.actionP}>{ACTION[weakest.name]?.[1]}</Text>
      </Card>

      <Card>
        <Text style={ds.cardH}>CHARGE STREAK</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 5, flex: 1 }}>
            {Array.from({ length: 6 }, (_v, i) => (
              <View key={i} style={[ds.streakDot, i >= 6 - Math.min(streak, 6) && ds.streakDotOn]} />
            ))}
          </View>
          <Text style={ds.streakTxt}>{streak} week{streak === 1 ? '' : 's'}</Text>
        </View>
        <Text style={[ds.actionP, { marginTop: 8 }]}>{dueLine}</Text>
        <View style={ds.remindRow}>
          <Text style={ds.remindTxt}>Weekly reminder · Sun 6:00 pm</Text>
          <Switch
            value={state.reminderOn}
            onValueChange={v => { vib.tick(); patch({ reminderOn: v }); }}
            trackColor={{ false: C.auburn24, true: C.gold35 }}
            thumbColor={state.reminderOn ? C.gold : C.white73}
          />
        </View>
        <Pressable onPress={() => { vib.tick(); nav.go('badges'); }} hitSlop={8}
          style={({ pressed }) => pressed ? { opacity: 0.6 } : null}>
          <Text style={ds.link}>View your badge case →</Text></Pressable>
      </Card>

      {monthDelta != null && (
        <Card>
          <Text style={ds.cardH}>{monthName.toUpperCase()} RECAP</Text>
          <Text style={ds.actionP}>
            {monthRecs.length} check-ins · {monthDelta >= 0 ? '▲ +' : '▼ '}{Math.abs(monthDelta)} this month · strongest pillar: {bestPillar}
          </Text>
        </Card>
      )}
      <Pressable onPress={() => { play('ding'); vib.light(); nav.go('coach'); }}
        style={({ pressed }) => pressed ? { opacity: 0.82, transform: [{ scale: 0.99 }] } : null}>
        <Card>
          <Text style={ds.cardH}>TALK TO A UFAS COACH</Text>
          <Text style={ds.actionP}>Share your score and get a personal next step.</Text>
        </Card>
      </Pressable>
      <Pressable onPress={() => { vib.light(); nav.go('insights'); }}
        style={({ pressed }) => pressed ? { opacity: 0.82, transform: [{ scale: 0.99 }] } : null}>
        <Card><Text style={ds.cardH}>THIS WEEK'S FOCUS →</Text></Card>
      </Pressable>
    </ScreenShell>
  );
}

const ACTION: Record<string, [string, string]> = {
  'Sleep': ['Protect your sleep window', 'Your sleep pillar is your biggest lever. Aim for lights-out at the same time for the next 5 nights.'],
  'Perceived energy': ['Front-load your mornings', 'Your energy dips are your biggest lever. Try 10 minutes of daylight and movement before 9 am.'],
  'Body composition': ['Small, steady changes', 'Body composition moves slowly — one better meal and one walk a day beats any crash plan.'],
  'Body feeling': ['Be kinder to the mirror', 'How you feel about your body is weighing on your score. A coach chat can help reframe it.'],
};

export function DeltaScreen() {
  const nav = useNav();
  const { state } = useStore();
  const recs = state.records;
  if (recs.length < 2) { return <DashboardScreen />; }
  const last = recs[recs.length - 1], prev = recs[recs.length - 2];
  const d = +(last.result.score - prev.result.score).toFixed(1);
  const movers = last.result.pillars
    .map((p, i) => ({ name: p.name, d: +(p.value - prev.result.pillars[i].value).toFixed(1) }))
    .filter(m => m.d !== 0)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, 3);
  return (
    <ScreenShell cta={<Btn label="Continue to dashboard" onPress={() => nav.go('dashboard')} />}>
      <View style={{ flex: 1, justifyContent: 'center', minHeight: 400, alignItems: 'center' }}>
        <Text style={[ds.deltaBig, { color: d >= 0 ? C.gold : C.auburn }]}>
          {d === 0 ? '—' : d > 0 ? `▲ +${Math.abs(d)}` : `▼ ${Math.abs(d)}`}
        </Text>
        <Text style={ds.deltaSub}>
          {d !== 0
            ? `Your Index moved from ${prev.result.score} to ${last.result.score}`
            : `Still a ${last.result.score}, but your body fat went ` +
              `${prev.result.bodyFatPct}% → ${last.result.bodyFatPct}%`}
        </Text>
        <View style={{ width: '100%', marginTop: 24 }}>
          {movers.map(m => (
            <View key={m.name} style={ds.moverRow}>
              <Text style={ds.moverName}>{m.name}</Text>
              <Text style={[ds.moverVal, { color: m.d >= 0 ? C.gold : C.auburn }]}>
                {m.d >= 0 ? '▲ +' : '▼ '}{Math.abs(m.d).toFixed(1)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </ScreenShell>
  );
}

export function HistoryScreen() {
  const nav = useNav();
  const { state, patch } = useStore();
  const rows = [...state.records].reverse();
  const [sel, setSel] = React.useState<AssessmentRecord | null>(null);
  const removeRecord = (id: string) => {
    const rec = state.records.find(r => r.id === id);
    Alert.alert(
      'Delete this check-in?',
      `${rec?.result.score.toFixed(1)} · ${rec ? new Date(rec.takenAt).toLocaleDateString() : ''} — this cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => {
          vib.heavy();
          patch({ records: state.records.filter(r => r.id !== id) });
          deleteAssessment(id).catch(() => {});   // otherwise it reappears on the next pull
        } },
      ],
    );
  };
  return (
    <ScreenShell onBack={() => nav.go('dashboard')} stepLabel="History"
      cta={<Btn label="Retake assessment" onPress={() => nav.go('profile')} />}>
      <H2>Your Index over time</H2>
      <Sub>Every check-in, stored on this phone.</Sub>
      {rows.map((r, i) => {
        const m = new Date(r.takenAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const prevM = i > 0 ? new Date(rows[i - 1].takenAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : null;
        return (
          <View key={r.id}>
            {m !== prevM && <Text style={ds.monthHead}>{m.toUpperCase()}</Text>}
            <Pressable onPress={() => { vib.tick(); setSel(r); }} hitSlop={2}
              style={({ pressed }) => [ds.histRow, pressed && { opacity: 0.7 }]}>
              <Text style={ds.histScore}>{r.result.score.toFixed(1)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={ds.histBand}>{bandLabel(state.lang, r.result.band)}</Text>
                <Text style={ds.histDate}>
                  {i === 0 ? 'Latest' : new Date(r.takenAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {r.input.note ? `  ·  “${r.input.note}”` : ''}
                </Text>
              </View>
              <Pressable onPress={() => removeRecord(r.id)} hitSlop={10} style={{ padding: 6 }}>
                <FontAwesome name="times" size={16} color={C.white73} />
              </Pressable>
            </Pressable>
          </View>
        );
      })}
      {state.plusHistory.length > 0 && (
        <>
          <Text style={[ds.monthHead, { marginTop: 24 }]}>INDEX PLUS HISTORY</Text>
          {[...state.plusHistory].reverse().map((pR, pi) => (
            <View key={pR.takenAt} style={ds.histRow}>
              <View style={{ flex: 1 }}>
                <Text style={ds.histBand}>
                  WHO-5 {pR.who5}/100 · PSS {pR.pss}/40 · PSQI {pR.psqi}/21
                </Text>
                <Text style={ds.histDate}>
                  {pi === 0 ? 'Latest' : new Date(pR.takenAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {'  ·  '}{pR.who5Band} · {pR.pssBand} · {pR.psqiBand}
                </Text>
              </View>
            </View>
          ))}
        </>
      )}
      <Modal visible={!!sel} transparent animationType="fade" onRequestClose={() => setSel(null)}>
        <Pressable style={ds.modalBg} onPress={() => setSel(null)}>
          {sel && (
            <Pressable style={ds.modalCard} onPress={() => {}}>
              <Text style={ds.modalScore}>{sel.result.score.toFixed(1)}</Text>
              <Text style={ds.modalBand}>{bandLabel(state.lang, sel.result.band)}</Text>
              <Text style={ds.histDate}>
                {new Date(sel.takenAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </Text>
              {sel.input.note ? <Text style={ds.modalNote}>“{sel.input.note}”</Text> : null}
              <View style={{ marginTop: 14, width: '100%' }}>
                {sel.result.pillars.map(pp => (
                  <View key={pp.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <Text style={[ds.histDate, { width: 108 }]}>{pp.name}</Text>
                    <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: C.auburn24, overflow: 'hidden' }}>
                      <View style={{ width: `${((pp.value - 1) / 4) * 100}%`, height: '100%', backgroundColor: C.gold }} />
                    </View>
                    <Text style={[ds.histDate, { width: 26, textAlign: 'right', color: C.gold }]}>{pp.value.toFixed(1)}</Text>
                  </View>
                ))}
              </View>
              <Btn label="Close" variant="ghost" onPress={() => setSel(null)} style={{ alignSelf: 'stretch', marginTop: 16 }} />
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </ScreenShell>
  );
}

export function BadgesScreen() {
  const nav = useNav();
  const { state } = useStore();
  const streak = streakWeeks(state.records);
  const badges = [
    { t: 'First Charge', d: 'Complete your first assessment', ok: state.records.length > 0 },
    { t: '4-Week Streak', d: 'Recharge four weeks in a row', ok: streak >= 4 },
    { t: 'First Peak', d: 'Hit the Peak band — 4.5 or higher', ok: state.records.some(r => r.result.score >= 4.5) },
    { t: 'Plus Profile', d: 'Complete all three Plus assessments', ok: !!state.plus },
  ];
  return (
    <ScreenShell onBack={() => nav.go('dashboard')} stepLabel="Badges">
      <H2>Your badge case</H2>
      <Sub>Earned by showing up — not by being perfect.</Sub>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {badges.map(b => (
          <View key={b.t} style={[ds.badge, !b.ok && { opacity: 0.38 }]}>
            <View style={ds.medal}><FontAwesome name={b.ok ? 'star' : 'star-o'} size={22} color={C.gold} /></View>
            <Text style={ds.badgeT}>{b.t}</Text>
            <Text style={ds.badgeD}>{b.ok ? 'Unlocked' : `Locked · ${b.d}`}</Text>
          </View>
        ))}
      </View>
    </ScreenShell>
  );
}

export function InsightsScreen() {
  const nav = useNav();
  const { state } = useStore();
  const last = latest(state.records);
  if (!last) { return <DashboardScreen />; }
  const sorted = [...last.result.pillars].sort((a, b) => a.value - b.value).slice(0, 3);
  return (
    <ScreenShell onBack={() => nav.go('dashboard')} stepLabel="Insights">
      <H2>This week's focus</H2>
      <Sub>Personalized from your latest check-in. (Rule-based in v1 — conversational AI arrives in Phase 3.)</Sub>
      {sorted.map((p, i) => (
        <Card key={p.name} style={{ borderLeftWidth: 3, borderLeftColor: C.gold }}>
          <Text style={ds.cardH}>{p.name.toUpperCase()} · {p.value.toFixed(1)}/5</Text>
          <Text style={ds.actionP}>{p.note}{i === 0 ? ' This is your biggest opportunity this week.' : ''}</Text>
        </Card>
      ))}
    </ScreenShell>
  );
}

export function CoachScreen() {
  const nav = useNav();
  const { state, patch } = useStore();
  const sent = !!state.coachRequestedAt;
  return (
    <ScreenShell onBack={() => nav.go('dashboard')} stepLabel="Coach"
      cta={<Btn
        label={sent ? `Request sent · ${new Date(state.coachRequestedAt as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Request my coach call'}
        variant="blood"
        onPress={() => {
          if (sent) return;
          patch({ coachRequestedAt: new Date().toISOString() });
          requestCall().catch(() => {});   // a row a coach can actually pick up
          play('ding'); vib.success();
        }} />}>
      <H2>Ready for a next step?</H2>
      <Sub>A UFAS coach reviews your UF Index and history, then builds a plan with you — no commitment for the first chat.</Sub>
      <Card>
        <Text style={ds.actionT}>1 · Share your score</Text>
        <Text style={ds.actionP}>Your latest UF Index and trend go to your coach — only with your consent.</Text>
      </Card>
      <Card>
        <Text style={ds.actionT}>2 · 15-minute call</Text>
        <Text style={ds.actionP}>Talk through what your score means and where to start.</Text>
      </Card>
      <Card>
        <Text style={ds.actionT}>3 · Your program</Text>
        <Text style={ds.actionP}>Get matched to a UFAS program built around your weakest pillar.</Text>
      </Card>
      <Text style={ds.hashtag}>#ITSURJATIME</Text>
    </ScreenShell>
  );
}

const ds = StyleSheet.create({
  trendFoot: {
    fontFamily: FONT.ui, fontSize: 11.5, color: C.white73,
    marginTop: 6, textAlign: 'center',
  },
  hello: { color: C.whiteA6, fontSize: 13, marginTop: 14 },
  scoreCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.auburn40, borderWidth: 1,
    borderColor: C.gold35, borderRadius: 20, padding: 18, marginTop: 10,
  },
  scoreNum: { fontFamily: FONT.display, fontSize: 44, color: C.gold, lineHeight: 48 },
  scoreLbl: { fontSize: 11, letterSpacing: 1.6, color: C.whiteA6, marginTop: 3 },
  bandChip: {
    borderWidth: 1, borderColor: C.gold35, backgroundColor: C.gold13, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  bandChipTxt: { color: C.gold, fontSize: 12.5, fontFamily: FONT.uiSemiBold },
  delta: { color: C.whiteA6, fontSize: 12, marginTop: 8 },
  cardH: { fontSize: 11.5, letterSpacing: 1.4, color: C.whiteA6, fontFamily: FONT.uiSemiBold, marginBottom: 8 },
  link: { color: C.gold, fontSize: 12.5, fontFamily: FONT.uiSemiBold, paddingTop: 10 },
  actionT: { color: C.white, fontSize: 14.5, fontFamily: FONT.uiSemiBold, marginBottom: 3 },
  actionP: { color: C.whiteA6, fontSize: 13, lineHeight: 19 },
  streakDot: { flex: 1, height: 8, borderRadius: 4, backgroundColor: C.auburn24 },
  streakDotOn: { backgroundColor: C.gold },
  streakTxt: { fontFamily: FONT.display, fontSize: 15, color: C.gold },
  remindRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.auburn40,
  },
  remindTxt: { color: C.whiteA6, fontSize: 12.5 },
  emptyRing: {
    width: 120, height: 120, borderRadius: 60, borderWidth: 2, borderColor: C.auburn,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  emptyRingTxt: { fontFamily: FONT.display, fontSize: 34, color: C.white73 },
  emptyTitle: { fontFamily: FONT.display, fontSize: 24, color: C.white, marginBottom: 8 },
  emptySub: { color: C.whiteA6, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 290 },
  deltaBig: { fontFamily: FONT.display, fontSize: 64 },
  deltaSub: { color: C.whiteA6, fontSize: 14.5, marginTop: 8 },
  moverRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.auburn24,
  },
  moverName: { color: C.white, fontSize: 14 },
  moverVal: { fontFamily: FONT.display, fontSize: 15 },
  histRow: {
    flexDirection: 'row', gap: 14, alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.auburn24,
  },
  histScore: { fontFamily: FONT.display, fontSize: 22, color: C.gold, width: 52 },
  histBand: { color: C.white, fontSize: 13.5, fontFamily: FONT.uiSemiBold },
  histDate: { color: C.whiteA6, fontSize: 12 },
  badge: {
    width: '47%', backgroundColor: C.auburn24, borderWidth: 1, borderColor: C.auburn40,
    borderRadius: 16, padding: 14, alignItems: 'center',
  },
  medal: {
    width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: C.gold35,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8, backgroundColor: C.gold13,
  },
  badgeT: { color: C.white, fontFamily: FONT.uiSemiBold, fontSize: 13.5, marginBottom: 3 },
  badgeD: { color: C.whiteA6, fontSize: 11, textAlign: 'center', lineHeight: 15 },
  hashtag: { textAlign: 'center', color: C.white73, letterSpacing: 2, fontSize: 11, marginTop: 18 },
  monthHead: { color: C.gold, fontSize: 11, letterSpacing: 1.8, fontFamily: FONT.uiSemiBold, marginTop: 16, marginBottom: 2 },
  modalBg: { flex: 1, backgroundColor: 'rgba(13,13,13,0.85)', alignItems: 'center', justifyContent: 'center', padding: 30 },
  modalCard: {
    width: '100%', backgroundColor: C.auburn24, borderWidth: 1, borderColor: C.auburn,
    borderRadius: 20, padding: 22, alignItems: 'center',
  },
  modalScore: { fontFamily: FONT.display, fontSize: 52, color: C.gold, lineHeight: 56 },
  modalBand: { fontFamily: FONT.display, fontSize: 16, color: C.white, marginBottom: 4 },
  modalNote: { color: C.whiteA6, fontSize: 13, fontStyle: 'italic', marginTop: 8, textAlign: 'center' },
});
