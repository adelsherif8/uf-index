// Index Plus — official WHO-5, PSS-10, and PSQI (times + troubles), clinically scored.
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Polygon, Line, Circle, Text as SvgText } from 'react-native-svg';
import { C, FONT } from '../lib/theme';
import { useNav } from '../lib/nav';
import { useStore } from '../lib/store';
import { postPlusSession } from '../lib/api';
import { ScreenShell, Btn, H2, Sub, Field, Card } from '../components/ui';
import { play, vib } from '../lib/fx';

// ---------- questionnaire definitions (official instruments) ----------
const WHO5 = [
  'I have felt cheerful and in good spirits',
  'I have felt calm and relaxed',
  'I have felt active and vigorous',
  'I woke up feeling fresh and rested',
  'My daily life has been filled with things that interest me',
];
const PSS10: { t: string; rev?: boolean }[] = [
  { t: '…been upset because of something that happened unexpectedly?' },
  { t: '…felt that you were unable to control the important things in your life?' },
  { t: '…felt nervous and “stressed”?' },
  { t: '…felt confident about your ability to handle your personal problems?', rev: true },
  { t: '…felt that things were going your way?', rev: true },
  { t: '…found that you could not cope with all the things that you had to do?' },
  { t: '…been able to control irritations in your life?', rev: true },
  { t: '…felt that you were on top of things?', rev: true },
  { t: '…been angered because of things that were outside of your control?' },
  { t: '…felt difficulties were piling up so high that you could not overcome them?' },
];
const PSQI_FREQ = [
  'Cannot get to sleep within 30 minutes',
  'Wake up in the middle of the night or early morning',
  'Have to get up to use the bathroom',
  'Cannot breathe comfortably',
  'Cough or snore loudly',
  'Feel too cold',
  'Feel too hot',
  'Have bad dreams',
  'Have pain',
  'Other reasons that disturb your sleep',
];
const PSQI_X: { t: string; hint: string }[] = [
  { t: 'How would you rate your sleep quality overall?', hint: '0 · Very good — 3 · Very bad' },
  { t: 'How often have you taken medicine to help you sleep?', hint: '0 · Not in the past month — 3 · Three+ times a week' },
  { t: 'How often have you had trouble staying awake while driving, eating, or socialising?', hint: '0 · Not in the past month — 3 · Three+ times a week' },
  { t: 'How much of a problem has it been to keep up enough enthusiasm to get things done?', hint: '0 · No problem — 3 · A very big problem' },
];

// ---------- Plus draft state ----------
interface PlusDraft {
  who5: number[]; pss: number[]; psqiFreq: number[]; psqiX: number[];
  bed: string; wake: string; latMin: string; hrs: string;
  done: { who5: boolean; pss: boolean; psqi: boolean };
}
const DEFAULT_PLUS: PlusDraft = {
  who5: Array(5).fill(3), pss: Array(10).fill(2), psqiFreq: Array(10).fill(1), psqiX: [1, 0, 1, 1],
  bed: '23:00', wake: '06:30', latMin: '20', hrs: '7',
  done: { who5: false, pss: false, psqi: false },
};
const PlusCtx = createContext<{ d: PlusDraft; set: (p: Partial<PlusDraft>) => void }>({ d: DEFAULT_PLUS, set: () => {} });
const PLUS_KEY = 'uf-plus-draft-v1';
export function PlusProvider({ children }: { children: React.ReactNode }) {
  const [d, setD] = useState(DEFAULT_PLUS);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(PLUS_KEY)
      .then(raw => { if (raw) setD({ ...DEFAULT_PLUS, ...JSON.parse(raw) }); })
      .catch(() => {});
  }, []);
  const set = (p: Partial<PlusDraft>) => setD(x => {
    const next = { ...x, ...p };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => AsyncStorage.setItem(PLUS_KEY, JSON.stringify(next)).catch(() => {}), 300);
    return next;
  });
  return <PlusCtx.Provider value={{ d, set }}>{children}</PlusCtx.Provider>;
}
const usePlus = () => useContext(PlusCtx);

// ---------- scoring (official) ----------
export function scorePlus(d: PlusDraft) {
  const who5 = d.who5.reduce((a, b) => a + b, 0) * 4; // 0–100
  const pss = d.pss.reduce((a, v, i) => a + (PSS10[i].rev ? 4 - v : v), 0); // 0–40
  const latMin = parseFloat(d.latMin) || 0;
  const hrs = parseFloat(d.hrs) || 0;
  const tmin = (s: string) => { const [h, m] = s.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  let inBed = ((tmin(d.wake) - tmin(d.bed)) + 1440) % 1440 / 60;
  if (!inBed) inBed = hrs || 1;
  const c1 = d.psqiX[0];
  const latPts = latMin <= 15 ? 0 : latMin <= 30 ? 1 : latMin <= 60 ? 2 : 3;
  const c2 = Math.ceil((latPts + d.psqiFreq[0]) / 2);
  const c3 = hrs > 7 ? 0 : hrs >= 6 ? 1 : hrs >= 5 ? 2 : 3;
  const eff = inBed > 0 ? (hrs / inBed) * 100 : 0;
  const c4 = eff >= 85 ? 0 : eff >= 75 ? 1 : eff >= 65 ? 2 : 3;
  const dist = d.psqiFreq.slice(1).reduce((a, b) => a + b, 0);
  const c5 = dist === 0 ? 0 : dist <= 9 ? 1 : dist <= 18 ? 2 : 3;
  const c6 = d.psqiX[1];
  const day = d.psqiX[2] + d.psqiX[3];
  const c7 = day === 0 ? 0 : day <= 2 ? 1 : day <= 4 ? 2 : 3;
  const psqi = c1 + c2 + c3 + c4 + c5 + c6 + c7; // 0–21
  return {
    who5, pss, psqi,
    who5Band: who5 >= 76 ? 'Excellent' : who5 >= 51 ? 'Good' : who5 >= 29 ? 'Low' : 'Very low',
    pssBand: pss <= 13 ? 'Low stress' : pss <= 26 ? 'Moderate' : 'High stress',
    psqiBand: psqi <= 5 ? 'Good sleeper' : psqi <= 10 ? 'Fair' : 'Poor',
    good: [who5 / 100, 1 - pss / 40, 1 - psqi / 21] as [number, number, number],
  };
}

// ---------- shared option row ----------
function OptRow(props: {
  q: string; hint?: string; max: number; value: number; onChange: (v: number) => void;
}) {
  const vals: number[] = [];
  for (let v = 0; v <= props.max; v++) vals.push(v);
  return (
    <View style={ps.qrow}>
      <Text style={ps.qtxt}>{props.q}</Text>
      {props.hint ? <Text style={ps.qhint}>{props.hint}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {vals.map(v => {
          const on = v === props.value;
          return (
            <Pressable key={v} onPress={() => { vib.tick(); play('tick'); props.onChange(v); }}
              style={[ps.opt, on && ps.optOn]}>
              <Text style={[ps.optTxt, on && ps.optTxtOn]}>{v}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Prog({ step }: { step: number }) {
  return (
    <View style={ps.prog}>
      {[1, 2].map(i => <View key={i} style={[ps.progSeg, i <= step && ps.progSegOn]} />)}
    </View>
  );
}

// ---------- screens ----------
function QCard(props: {
  code: string; title: string; blurb: string; scale: string;
  done: boolean; last?: string; onPress: () => void;
}) {
  return (
    <Pressable onPress={() => { vib.light(); props.onPress(); }}
      style={({ pressed }) => [ps.qcard, props.done && ps.qcardDone, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={[ps.qbadge, props.done && ps.qbadgeDone]}>
          <Text style={[ps.qbadgeTxt, props.done && { color: C.black }]}>{props.done ? '✓' : props.code[0]}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={ps.qtitle}>{props.title}</Text>
          <Text style={ps.qscale}>{props.scale}</Text>
        </View>
        <Text style={ps.qchev}>›</Text>
      </View>
      <Text style={ps.qblurb}>{props.blurb}</Text>
      {props.last ? <Text style={ps.qlast}>{props.last}</Text> : null}
    </Pressable>
  );
}

export function PlusIntroScreen() {
  const nav = useNav();
  const { state, patch } = useStore();
  const start = () => {
    if (!state.plusTrialStartedAt) patch({ plusTrialStartedAt: new Date().toISOString() }); // trial row, like the schema
    nav.go('who5');
  };
  const trialDay = state.plusTrialStartedAt
    ? Math.min(7, Math.floor((Date.now() - new Date(state.plusTrialStartedAt).getTime()) / 864e5) + 1)
    : null;
  const { d, set } = usePlus();
  const p = state.plus;
  const open = (target: 'who5' | 'pss' | 'psqiTimes') => {
    if (!state.plusTrialStartedAt) patch({ plusTrialStartedAt: new Date().toISOString() });
    nav.go(target);
  };
  const allDone = d.done.who5 && d.done.pss && d.done.psqi;
  return (
    <ScreenShell onBack={() => nav.go('dashboard')} stepLabel={trialDay ? `Trial · day ${trialDay} of 7` : 'Premium'}
      cta={allDone
        ? <Btn label="✦  Build my Plus profile" variant="blood" onPress={() => nav.go('plusResult')} />
        : <Btn label="See my Plus profile" variant="ghost" onPress={() => nav.go(p ? 'plusResult' : 'plus')} disabled={!p} />}>
      <H2>UF Index Plus</H2>
      <Sub>Three validated assessments. Take them in any order — pick whichever you want now.</Sub>

      <QCard code="W" title="WHO-5 · Wellbeing" scale="5 questions · scored 0–100"
        blurb="How cheerful, calm, active and rested you've felt over two weeks."
        done={d.done.who5}
        last={p ? `Last: ${p.who5}/100 · ${p.who5Band}` : undefined}
        onPress={() => open('who5')} />

      <QCard code="P" title="PSS-10 · Perceived stress" scale="10 questions · scored 0–40"
        blurb="Cohen's full scale — how unpredictable and overloaded life feels."
        done={d.done.pss}
        last={p ? `Last: ${p.pss}/40 · ${p.pssBand}` : undefined}
        onPress={() => open('pss')} />

      <QCard code="S" title="PSQI · Sleep quality" scale="19 questions · 7 components · 0–21"
        blurb="The Pittsburgh index — your sleep times, then your sleep troubles."
        done={d.done.psqi}
        last={p ? `Last: ${p.psqi}/21 · ${p.psqiBand}` : undefined}
        onPress={() => open('psqiTimes')} />

      {state.plusHistory.length > 0 && (
        <Card>
          <Text style={ps.histH}>PLUS HISTORY · {state.plusHistory.length} PROFILE{state.plusHistory.length > 1 ? 'S' : ''}</Text>
          {[...state.plusHistory].reverse().slice(0, 5).map((h, i) => (
            <View key={h.takenAt} style={ps.histRow}>
              <Text style={ps.histDate}>
                {i === 0 ? 'Latest' : new Date(h.takenAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
              <Text style={ps.histVals}>W {h.who5} · P {h.pss} · S {h.psqi}</Text>
            </View>
          ))}
          <Pressable onPress={() => nav.go('history')}>
            <Text style={ps.histLink}>All history →</Text>
          </Pressable>
        </Card>
      )}

      <Text style={ps.price}>₹399/month · 7-day free trial{'\n'}Included free with every UFAS coaching program.</Text>
    </ScreenShell>
  );
}

export function Who5Screen() {
  const nav = useNav();
  const { d, set } = usePlus();
  return (
    <ScreenShell onBack={() => nav.go('plus')} stepLabel="Wellbeing"
      cta={<Btn label="Continue" onPress={() => { set({ done: { ...d.done, who5: true } }); nav.go('plus'); }} />}>
      <H2>Wellbeing · WHO-5</H2>
      <Sub>Over the last two weeks… 0 · At no time — 5 · All of the time</Sub>
      {WHO5.map((q, i) => (
        <OptRow key={i} q={q} max={5} value={d.who5[i]}
          onChange={v => { const a = [...d.who5]; a[i] = v; set({ who5: a }); }} />
      ))}
    </ScreenShell>
  );
}

export function PssScreen() {
  const nav = useNav();
  const { d, set } = usePlus();
  return (
    <ScreenShell onBack={() => nav.go('plus')} stepLabel="Stress"
      cta={<Btn label="Continue" onPress={() => { set({ done: { ...d.done, pss: true } }); nav.go('plus'); }} />}>
      <H2>Stress · PSS-10</H2>
      <Sub>In the last month, how often have you… 0 · Never — 4 · Very often</Sub>
      {PSS10.map((q, i) => (
        <OptRow key={i} q={q.t} max={4} value={d.pss[i]}
          onChange={v => { const a = [...d.pss]; a[i] = v; set({ pss: a }); }} />
      ))}
    </ScreenShell>
  );
}

export function PsqiTimesScreen() {
  const nav = useNav();
  const { d, set } = usePlus();
  return (
    <ScreenShell onBack={() => nav.go('plus')} stepLabel="Sleep · 1 of 2"
      cta={<Btn label="Continue" onPress={() => nav.go('psqiTroubles')} />}>
      <Prog step={1} />
      <H2>Sleep · your times</H2>
      <Sub>The Pittsburgh Sleep Quality Index — first, your usual month: when and how long. These four numbers set your sleep-efficiency score.</Sub>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Field half label="Usual bedtime" value={d.bed} onChange={v => set({ bed: v })} placeholder="23:00" />
        <Field half label="Usual wake time" value={d.wake} onChange={v => set({ wake: v })} placeholder="06:30" />
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Field half label="Minutes to fall asleep" value={d.latMin} onChange={v => set({ latMin: v })} keyboard="number-pad" />
        <Field half label="Actual sleep hours" value={d.hrs} onChange={v => set({ hrs: v })} keyboard="decimal-pad" />
      </View>
    </ScreenShell>
  );
}

export function PsqiTroublesScreen() {
  const nav = useNav();
  const { state, patch } = useStore();
  const { d, set } = usePlus();
  const finish = () => {
    const r = scorePlus(d);
    const entry = {
      takenAt: new Date().toISOString(),
      who5: r.who5, who5Band: r.who5Band,
      pss: r.pss, pssBand: r.pssBand,
      psqi: r.psqi, psqiBand: r.psqiBand,
      good: r.good,
    };
    patch({ plus: entry, plusHistory: [...state.plusHistory, entry] });
    set({ done: { ...d.done, psqi: true } });

    // Send all three instruments up. The server re-scores from the raw answers
    // with the published rules, so a Plus profile is reproducible later.
    // Fire-and-forget: a guest or a dead network changes nothing on screen.
    const stamp = entry.takenAt;
    postPlusSession('WHO5', `${stamp}-who5`, d.who5).catch(() => {});
    postPlusSession('PSS10', `${stamp}-pss`, d.pss).catch(() => {});
    postPlusSession('PSQI', `${stamp}-psqi`, {
      bedTime: d.bed, wakeTime: d.wake,
      latencyMin: Number(d.latMin) || 0, sleepHours: Number(d.hrs) || 0,
      freq: d.psqiFreq, extra: d.psqiX,
    }).catch(() => {});
    play('stamp'); vib.success();
    nav.go('plusResult');
  };
  return (
    <ScreenShell onBack={() => nav.go('psqiTimes')} stepLabel="Sleep · 2 of 2"
      cta={<Btn label="✦  Build my Plus profile" variant="blood" onPress={finish} />}>
      <Prog step={2} />
      <H2>Sleep · your troubles</H2>
      <Sub>How often have you had trouble sleeping because you… 0 · Not in the past month — 3 · Three+ times a week</Sub>
      {PSQI_FREQ.map((q, i) => (
        <OptRow key={i} q={q} max={3} value={d.psqiFreq[i]}
          onChange={v => { const a = [...d.psqiFreq]; a[i] = v; set({ psqiFreq: a }); }} />
      ))}
      <Sub>And finally…</Sub>
      {PSQI_X.map((q, i) => (
        <OptRow key={i} q={q.t} hint={q.hint} max={3} value={d.psqiX[i]}
          onChange={v => { const a = [...d.psqiX]; a[i] = v; set({ psqiX: a }); }} />
      ))}
    </ScreenShell>
  );
}

function Radar({ good }: { good: [number, number, number] }) {
  const cx = 130, cy = 112, R = 78;
  const pt = (i: number, r: number): [number, number] => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  const poly = (f: number) => [0, 1, 2].map(i => pt(i, R * f).map(n => n.toFixed(1)).join(',')).join(' ');
  const data = [0, 1, 2].map(i => pt(i, R * Math.max(good[i], 0.06)).map(n => n.toFixed(1)).join(',')).join(' ');
  const labels: [string, number, number, string][] = [
    ['Wellbeing', cx, 22, 'middle'], ['Calm', cx + R * 0.95, cy + R * 0.6, 'start'], ['Sleep', cx - R * 0.95, cy + R * 0.6, 'end'],
  ];
  return (
    <Svg width="100%" height={210} viewBox="0 0 260 216">
      {[0.33, 0.66, 1].map(f => <Polygon key={f} points={poly(f)} fill="none" stroke={C.gold35} strokeWidth={1} />)}
      {[0, 1, 2].map(i => {
        const [x, y] = pt(i, R);
        return <Line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={C.gold35} strokeWidth={1} />;
      })}
      <Polygon points={data} fill="rgba(210,145,51,.24)" stroke={C.gold} strokeWidth={2} />
      {[0, 1, 2].map(i => {
        const [x, y] = pt(i, R * Math.max(good[i], 0.06));
        return <Circle key={i} cx={x} cy={y} r={3.5} fill={C.white} stroke={C.gold} />;
      })}
      {labels.map(([t, x, y, anchor]) => (
        <SvgText key={t} x={x} y={y} fontSize={10} fill={C.whiteA6} textAnchor={anchor as 'middle' | 'start' | 'end'}>{t}</SvgText>
      ))}
    </Svg>
  );
}

export function PlusResultScreen() {
  const nav = useNav();
  const { state } = useStore();
  const p = state.plus;
  if (!p) { return <PlusIntroScreen />; }
  const minis = [
    { v: String(p.who5), l: 'WHO-5 · /100', b: p.who5Band },
    { v: String(p.pss), l: 'PSS-10 · /40', b: p.pssBand },
    { v: String(p.psqi), l: 'PSQI · /21', b: p.psqiBand },
  ];
  return (
    <ScreenShell onBack={() => nav.go('dashboard')} stepLabel="Index Plus">
      <H2>Your Plus profile</H2>
      <Sub>Three validated lenses on the same energy story.</Sub>
      <Card style={{ marginTop: 0 }}><Radar good={p.good} /></Card>
      <Text style={ps.takenAt}>Taken {new Date(p.takenAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
        {minis.map(m => (
          <View key={m.l} style={ps.mini}>
            <Text style={ps.miniV}>{m.v}</Text>
            <Text style={ps.miniL}>{m.l}</Text>
            <Text style={ps.miniB}>{m.b}</Text>
          </View>
        ))}
      </View>
      {state.plusHistory.length > 1 && (
        <Card>
          <Text style={ps.histH}>YOUR PLUS HISTORY</Text>
          {[...state.plusHistory].reverse().map((h, i) => (
            <View key={h.takenAt} style={ps.histRow}>
              <Text style={ps.histDate}>
                {i === 0 ? 'Latest' : new Date(h.takenAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Text>
              <Text style={ps.histVals}>W {h.who5} · P {h.pss} · S {h.psqi}</Text>
            </View>
          ))}
        </Card>
      )}
      <Pressable onPress={() => nav.go('plus')}>
        <Text style={ps.histLink}>Retake a questionnaire →</Text>
      </Pressable>
    </ScreenShell>
  );
}

const ps = StyleSheet.create({
  qcard: {
    backgroundColor: C.auburn24, borderWidth: 1, borderColor: C.auburn, borderRadius: 18,
    padding: 16, marginBottom: 12,
  },
  qcardDone: { borderColor: C.gold35, backgroundColor: C.gold13 },
  qbadge: {
    width: 38, height: 38, borderRadius: 12, borderWidth: 1.5, borderColor: C.auburn,
    alignItems: 'center', justifyContent: 'center', backgroundColor: C.black,
  },
  qbadgeDone: { backgroundColor: C.gold, borderColor: C.gold },
  qbadgeTxt: { fontFamily: FONT.display, fontSize: 17, color: C.gold },
  qtitle: { color: C.white, fontSize: 15, fontFamily: FONT.uiSemiBold },
  qscale: { color: C.white73, fontSize: 11.5, marginTop: 1 },
  qchev: { color: C.gold, fontSize: 22, marginTop: -3 },
  qblurb: { color: C.whiteA6, fontSize: 12.5, lineHeight: 18, marginTop: 10 },
  qlast: { color: C.gold, fontSize: 12, marginTop: 7, fontFamily: FONT.uiSemiBold },
  histH: { fontSize: 10.5, letterSpacing: 1.3, color: C.whiteA6, fontFamily: FONT.uiSemiBold, marginBottom: 8 },
  histRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: C.auburn24,
  },
  histDate: { color: C.whiteA6, fontSize: 12.5 },
  histVals: { color: C.gold, fontSize: 12.5, fontFamily: FONT.display },
  histLink: { color: C.gold, fontSize: 12.5, fontFamily: FONT.uiSemiBold, paddingTop: 10 },
  takenAt: { color: C.white73, fontSize: 12, marginTop: 8, textAlign: 'center' },
  qrow: {
    backgroundColor: C.auburn24, borderWidth: 1, borderColor: C.auburn40, borderRadius: 14,
    padding: 13, marginBottom: 10,
  },
  qtxt: { color: C.white, fontSize: 13.5, lineHeight: 19, marginBottom: 9, fontFamily: FONT.ui },
  qhint: { color: C.white73, fontSize: 10.5, marginTop: -5, marginBottom: 9 },
  opt: {
    flex: 1, paddingVertical: 9, borderRadius: 9, borderWidth: 1.5, borderColor: C.auburn,
    backgroundColor: C.black, alignItems: 'center',
  },
  optOn: { backgroundColor: C.gold, borderColor: C.gold },
  optTxt: { fontFamily: FONT.display, fontSize: 14, color: C.white73 },
  optTxtOn: { color: C.black },
  prog: { flexDirection: 'row', gap: 6, marginTop: 12 },
  progSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.auburn24 },
  progSegOn: { backgroundColor: C.gold },
  tick: { color: C.whiteA6, fontSize: 13, lineHeight: 24 },
  price: { textAlign: 'center', color: C.whiteA6, fontSize: 12.5, lineHeight: 20, marginTop: 16 },
  mini: {
    flexGrow: 1, minWidth: '30%', backgroundColor: C.auburn24, borderWidth: 1,
    borderColor: C.auburn40, borderRadius: 14, padding: 12,
  },
  miniV: { fontFamily: FONT.display, fontSize: 23, color: C.gold },
  miniL: { fontSize: 10, letterSpacing: 1, color: C.whiteA6, marginTop: 2, textTransform: 'uppercase' },
  miniB: { fontSize: 12, color: C.gold, marginTop: 4, fontFamily: FONT.uiSemiBold },
});
