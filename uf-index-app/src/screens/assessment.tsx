// The five assessment steps — profile, tapes, energy, feeling, sleep.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { C, FONT } from '../lib/theme';
import { useNav } from '../lib/nav';
import { useStore } from '../lib/store';
import { useDraft } from '../lib/draft';
import { ScreenShell, Btn, H2, Sub, Field, ScaleRow, Seg } from '../components/ui';
import { Tape, Silhouette } from '../components/Tape';
import { vib } from '../lib/fx';

const IN = 2.54;

export function ProfileScreen() {
  const nav = useNav();
  const { state, patch } = useStore();
  const { draft, set } = useDraft();
  const [p, setP] = useState(state.profile);
  const [err, setErr] = useState<{ name?: string; age?: string }>({});
  const ageRef = useRef<TextInput>(null);
  const orgRef = useRef<TextInput>(null);
  // returning users: prefill the draft from their last check-in
  useEffect(() => {
    const last = state.records[state.records.length - 1];
    if (last) set({ ...last.input, note: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const next = () => {
    const e: { name?: string; age?: string } = {};
    if (!p.name.trim()) e.name = 'We need a name for your ticket.';
    const age = parseInt(p.age, 10);
    if (!p.age.trim()) e.age = 'Age is required.';
    else if (isNaN(age) || age < 16 || age > 100) e.age = 'Enter 16-100.';
    setErr(e);
    if (Object.keys(e).length) { vib.heavy(); return; }
    patch({ profile: { ...p, gender: draft.gender } });
    nav.go('measure');
  };
  return (
    <ScreenShell
      stepLabel="Step 1 of 5" chargePct={20} onBack={() => nav.go('consent')}
      cta={<Btn label="Continue" onPress={next} />}
    >
      <H2>Tell us about you</H2>
      <Sub>This shapes how your body composition is calculated.  <Text style={as.reqNote}>* required</Text></Sub>
      <Field required label="Full name" value={p.name} error={err.name}
        onChange={v => { setP({ ...p, name: v }); if (err.name) setErr({ ...err, name: undefined }); }}
        placeholder="Your name" returnKeyType="next" onSubmitEditing={() => ageRef.current?.focus()} />
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <Field half required ref={ageRef} label="Age" value={p.age} error={err.age}
          onChange={v => { setP({ ...p, age: v }); if (err.age) setErr({ ...err, age: undefined }); }}
          keyboard="number-pad" placeholder="28" returnKeyType="next" onSubmitEditing={() => orgRef.current?.focus()} />
        <Field half ref={orgRef} label="Organization" value={p.organization}
          onChange={v => setP({ ...p, organization: v })} placeholder="UFAS" returnKeyType="done" />
      </View>
      <Text style={as.segLabel}>GENDER</Text>
      <Seg
        options={[['male', 'Male'], ['female', 'Female']]}
        value={draft.gender}
        onChange={v => set({ gender: v as 'male' | 'female' })}
      />
    </ScreenShell>
  );
}

export function MeasureScreen() {
  const nav = useNav();
  const { state, patch } = useStore();
  const { draft, set } = useDraft();
  const [active, setActive] = useState<'neck' | 'waist' | 'hip' | null>(null);
  const [err, setErr] = useState<{ weight?: string; height?: string; tape?: string }>({});
  const imp = state.unitSystem === 'imperial';
  const disp = (cm: number) => (imp ? +(cm / IN).toFixed(2) : cm);          // draft stays metric, always
  const toCm = (v: number) => (imp ? v * IN : v);
  const wDisp = (kg: number) => (imp ? +(kg * 2.20462).toFixed(1) : kg);
  const wToKg = (v: number) => (imp ? v / 2.20462 : v);
  const next = () => {
    const e: { weight?: string; height?: string; tape?: string } = {};
    if (!draft.weightKg) e.weight = 'Required.';
    else if (draft.weightKg < 25 || draft.weightKg > 300) e.weight = imp ? 'Expected 55-660 lb.' : 'Expected 25-300 kg.';
    if (!draft.heightCm) e.height = 'Required.';
    else if (draft.heightCm < 100 || draft.heightCm > 250) e.height = imp ? 'Expected 39-98 in.' : 'Expected 100-250 cm.';
    if (draft.waistCm <= draft.neckCm) e.tape = 'Waist must be larger than neck — check those two tapes.';
    setErr(e);
    if (Object.keys(e).length) { vib.heavy(); return; }
    nav.go('energy');
  };
  return (
    <ScreenShell
      stepLabel="Step 2 of 5" chargePct={40} onBack={() => nav.go('profile')}
      cta={<Btn label="Continue" onPress={next} />}
    >
      <H2>Body measurements</H2>
      <Sub>Drag each tape — the figure follows your measurements.</Sub>
      <Seg options={[['metric', 'Metric · kg · cm'], ['imperial', 'Imperial · lb · in']]}
        value={state.unitSystem}
        onChange={v => patch({ unitSystem: v as 'metric' | 'imperial' })} />
      <View style={{ height: 12 }} />
      <Silhouette neck={draft.neckCm} waist={draft.waistCm} hip={draft.hipCm} active={active} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Field half required label={imp ? 'Weight (lb)' : 'Weight (kg)'} error={err.weight}
          value={draft.weightKg ? String(wDisp(draft.weightKg)) : ''} keyboard="decimal-pad"
          onChange={v => { set({ weightKg: wToKg(parseFloat(v) || 0) }); if (err.weight) setErr({ ...err, weight: undefined }); }} />
        <Field half required label={imp ? 'Height (in)' : 'Height (cm)'} error={err.height}
          value={draft.heightCm ? String(disp(draft.heightCm)) : ''} keyboard="decimal-pad"
          onChange={v => { set({ heightCm: toCm(parseFloat(v) || 0) }); if (err.height) setErr({ ...err, height: undefined }); }} />
      </View>
      <Tape label="Neck" unit={imp ? 'in' : 'cm'} pxPerUnit={imp ? 22 : 9} step={imp ? 0.25 : 0.5} numEvery={imp ? 2 : 5}
        value={disp(draft.neckCm)} min={disp(20)} max={disp(60)}
        onChange={v => set({ neckCm: toCm(v) })} onActive={a => setActive(a ? 'neck' : null)} />
      <Tape label="Waist" unit={imp ? 'in' : 'cm'} pxPerUnit={imp ? 22 : 9} step={imp ? 0.25 : 0.5} numEvery={imp ? 2 : 5}
        value={disp(draft.waistCm)} min={disp(40)} max={disp(180)}
        onChange={v => set({ waistCm: toCm(v) })} onActive={a => setActive(a ? 'waist' : null)} />
      <Tape label="Hip" unit={imp ? 'in' : 'cm'} pxPerUnit={imp ? 22 : 9} step={imp ? 0.25 : 0.5} numEvery={imp ? 2 : 5}
        value={disp(draft.hipCm)} min={disp(50)} max={disp(200)}
        onChange={v => set({ hipCm: toCm(v) })} onActive={a => setActive(a ? 'hip' : null)} />
      {err.tape ? <Text style={as.err}>{err.tape}</Text> : null}
    </ScreenShell>
  );
}

export function EnergyScreen() {
  const nav = useNav();
  const { draft, set } = useDraft();
  return (
    <ScreenShell
      stepLabel="Step 3 of 5" chargePct={60} onBack={() => nav.go('measure')}
      cta={<Btn label="Continue" onPress={() => nav.go('feel')} />}
    >
      <H2>How's your energy?</H2>
      <Sub>Rate your perceived energy on a typical day this week.</Sub>
      <ScaleRow
        title="In the morning" hint="Right after you're up and moving — before coffee counts."
        value={draft.rpeMorning} onChange={v => set({ rpeMorning: v })}
        endLow="Drained" endHigh="Fully charged"
      />
      <ScaleRow
        title="In the late afternoon" hint="Around 4–6 pm, when energy usually dips."
        value={draft.rpeAfternoon} onChange={v => set({ rpeAfternoon: v })}
        endLow="Drained" endHigh="Fully charged"
      />
    </ScreenShell>
  );
}

export function FeelScreen() {
  const nav = useNav();
  const { draft, set } = useDraft();
  return (
    <ScreenShell
      stepLabel="Step 4 of 5" chargePct={80} onBack={() => nav.go('energy')}
      cta={<Btn label="Continue" onPress={() => nav.go('sleep')} />}
    >
      <H2>How you feel about your body</H2>
      <Sub>No judgment — this is about how you feel, not a target.</Sub>
      <ScaleRow
        title="How satisfied are you with your body?" hint="Your honest feeling when you look in the mirror."
        value={draft.bodyFeeling} onChange={v => set({ bodyFeeling: v })}
        endLow="Not at all" endHigh="Very satisfied"
      />
    </ScreenShell>
  );
}

export function SleepScreen() {
  const nav = useNav();
  const { draft, set } = useDraft();
  const [err, setErr] = useState('');
  const drop = () => {
    if (!draft.sleepHours) { setErr('Required — how many hours do you sleep?'); vib.heavy(); return; }
    if (draft.sleepHours <= 0 || draft.sleepHours > 16) { setErr('Enter between 0.5 and 16 hours.'); vib.heavy(); return; }
    setErr('');
    nav.go('machine');
  };
  return (
    <ScreenShell
      stepLabel="Step 5 of 5" chargePct={96} onBack={() => nav.go('feel')}
      cta={<Btn label="◎  Drop your UF token" variant="blood" onPress={drop} />}
    >
      <H2>Last one — your sleep</H2>
      <Sub>Sleep drives more of your energy than anything else. The machine is waiting.</Sub>
      <ScaleRow
        title="How rested do you wake up?" hint="Quality of sleep over the past week."
        value={draft.sleepQuality} onChange={v => set({ sleepQuality: v })}
        endLow="Exhausted" endHigh="Fully rested"
      />
      <Field required label="Hours of continuous sleep" error={err || undefined}
        value={draft.sleepHours ? String(draft.sleepHours) : ''} keyboard="decimal-pad" placeholder="7"
        onChange={v => { set({ sleepHours: parseFloat(v) || 0 }); if (err) setErr(''); }} />
      <Field label="A note for future you (optional)" value={draft.note ?? ''} placeholder="exam week, slept 5h…"
        onChange={v => set({ note: v || undefined })} returnKeyType="done" />
    </ScreenShell>
  );
}

const as = StyleSheet.create({
  reqNote: { color: 'rgba(210,145,51,0.9)', fontSize: 12 },
  segLabel: {
    fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: C.whiteA6,
    marginBottom: 6, fontFamily: FONT.uiSemiBold,
  },
  err: {
    marginTop: 4, color: C.white, backgroundColor: C.auburn, borderRadius: 12,
    padding: 12, fontSize: 13, lineHeight: 19, overflow: 'hidden',
  },
});
