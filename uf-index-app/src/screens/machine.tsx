// The power-test machine → printed ticket → breakdown. The soul of the app.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing, PanResponder, StyleSheet, InteractionManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, FONT } from '../lib/theme';
import { useNav } from '../lib/nav';
import { useStore } from '../lib/store';
import { useDraft } from '../lib/draft';
import { computeScore, ScoreResult } from '../lib/scoring';
import { ScreenShell, Btn, H2, Sub } from '../components/ui';
import { play, vib } from '../lib/fx';
import { useKeepAwake } from 'expo-keep-awake';
import { setStatusBarHidden } from 'expo-status-bar';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { bandLabel } from '../lib/i18n';
import { ConsoleHandoff } from './console';

const SEGMENTS = 16;
const MSGS = ['Loading your inputs…', 'Measuring lean body mass…', 'Testing energy output…', 'Reading recovery & sleep…'];

/** Latest computed result is kept module-level so ticket/breakdown/dashboard agree. */
let lastResult: ScoreResult | null = null;
export const getLastResult = () => lastResult;

export function MachineScreen() {
  const nav = useNav();
  const { draft } = useDraft();
  useKeepAwake();
  useEffect(() => { setStatusBarHidden(true, 'fade'); return () => setStatusBarHidden(false, 'fade'); }, []);
  const [lit, setLit] = useState(0);
  const [msg, setMsg] = useState('Token accepted');
  const [read, setRead] = useState('--');
  const coinY = useRef(new Animated.Value(-90)).current;
  const coinRot = useRef(new Animated.Value(0)).current;
  const coinOpacity = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const result = computeScore(draft);
    lastResult = result;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const t = (ms: number, fn: () => void) => timers.push(setTimeout(() => { if (alive.current) fn(); }, ms));
    const task = InteractionManager.runAfterInteractions(() => { if (!alive.current) return; start(); });
    function start() {
    // coin drop
    coinOpacity.setValue(1);
    Animated.parallel([
      Animated.timing(coinY, { toValue: 8, duration: 720, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(coinRot, { toValue: 1, duration: 720, easing: Easing.linear, useNativeDriver: true }),
    ]).start();
    t(650, () => { play('coin'); vib.medium(); });
    t(900, () => Animated.timing(coinOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start());
    MSGS.forEach((m, i) => t(1000 + i * 850, () => setMsg(m)));

    // sweep then climb, driven by a frame loop
    const target = Math.max(2, Math.round(((result.score - 1) / 4) * SEGMENTS));
    let phase: 'sweep' | 'climb' = 'sweep';
    let phaseStart = Date.now() + 1000;
    let lastLit = -1;
    const iv = setInterval(() => {
      if (!alive.current) return;
      const now = Date.now();
      if (now < phaseStart) return;
      const el = now - phaseStart;
      let level = 0;
      if (phase === 'sweep') {
        const tt = el / 2100;
        if (tt >= 1) { phase = 'climb'; phaseStart = now; return; }
        level = Math.round((0.5 - 0.5 * Math.cos(tt * Math.PI * 5)) * SEGMENTS);
        setRead((1 + Math.random() * 4).toFixed(1));
      } else {
        const tt = Math.min(el / 1500, 1);
        const held = (tt > 0.58 && tt < 0.68) || (tt > 0.82 && tt < 0.9);
        if (!held) {
          level = Math.round(target * (1 - Math.pow(1 - tt, 2)));
          setRead(tt > 0.9 ? '· · ·' : (1 + Math.random() * 4).toFixed(1));
        } else level = lastLit;
        if (tt >= 1) {
          clearInterval(iv);
          setRead('UF');
          setMsg('Printing your result…');
          let blinks = 0;
          const blink = setInterval(() => {
            if (!alive.current) { clearInterval(blink); return; }
            setLit(l => (l === target ? target - 1 : target));
            play('tick');
            if (++blinks >= 6) {
              clearInterval(blink);
              setLit(target);
              vib.heavy();
              Animated.sequence([
                Animated.timing(flash, { toValue: 1, duration: 120, useNativeDriver: true }),
                Animated.timing(flash, { toValue: 0.25, duration: 90, useNativeDriver: true }),
                Animated.timing(flash, { toValue: 1, duration: 90, useNativeDriver: true }),
                Animated.timing(flash, { toValue: 0, duration: 340, useNativeDriver: true }),
              ]).start(() => { if (alive.current) nav.go('ticket'); });
            }
          }, 130);
          return;
        }
      }
      if (level !== lastLit) {
        lastLit = level;
        setLit(level);
        play('tick'); vib.tick();
      }
    }, 40);
    timers.push(iv as unknown as ReturnType<typeof setTimeout>);
    }

    return () => { alive.current = false; task.cancel(); timers.forEach(x => { clearTimeout(x); clearInterval(x as unknown as ReturnType<typeof setInterval>); }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const segs = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const on = i < lit;
    const tier = i < 6 ? C.auburn : C.gold;
    segs.push(
      <View key={i} style={[ms.seg, on && { backgroundColor: tier, shadowColor: tier, shadowOpacity: 0.8, shadowRadius: 6 }]} />,
    );
  }

  return (
    <SafeAreaView style={ms.wrap}>
      <Text style={ms.label}>UF INDEX · POWER TEST</Text>
      <View style={ms.readout}><Text style={ms.readTxt}>{read}</Text></View>
      <View style={ms.tower}>{segs.reverse()}</View>
      <View style={ms.slotZone}>
        <Animated.View style={[ms.coin, { opacity: coinOpacity, transform: [{ translateY: coinY }, { rotate: coinRot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '150deg'] }) }] }]}>
          <Text style={ms.coinTxt}>UF</Text>
        </Animated.View>
        <View style={ms.slot} />
      </View>
      <Text style={ms.msg}>{msg}</Text>
      <Animated.View pointerEvents="none" style={[ms.flash, { opacity: flash }]} />
    </SafeAreaView>
  );
}

const BAND_TEXT: Record<string, string> = {
  Depleted: 'Your energy reserves are running low. Small, consistent recovery habits will move this fast.',
  Strained: "Your body is keeping up, but it's costing you. One pillar is pulling your energy down.",
  Balanced: 'Your mind and body are broadly in sync. Targeted tweaks can unlock the next level.',
  Energized: 'Strong mind–body connection. Protect the habits that got you here.',
  Peak: "Exceptional energy balance. You're operating near your potential.",
};

function EmberBurst({ trigger, count = 14 }: { trigger: number; count?: number }) {
  const prog = useRef(new Animated.Value(0)).current;
  const parts = useRef(Array.from({ length: count }, (_v, i) => ({
    a: (i / count) * Math.PI * 2 + (i % 3) * 0.21,
    d: 62 + ((i * 37) % 52),
    r: 3 + ((i * 13) % 4),
  }))).current;
  useEffect(() => {
    if (!trigger) return;
    prog.setValue(0);
    Animated.timing(prog, { toValue: 1, duration: 750, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [trigger, prog]);
  if (!trigger) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 250, left: 0, right: 0, alignItems: 'center' }}>
      {parts.map((pp, i) => (
        <Animated.View key={i} style={{
          position: 'absolute', width: pp.r, height: pp.r, borderRadius: pp.r / 2, backgroundColor: C.gold,
          opacity: prog.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.9, 0] }),
          transform: [
            { translateX: prog.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(pp.a) * pp.d] }) },
            { translateY: prog.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(pp.a) * pp.d - 24] }) },
          ],
        }} />
      ))}
    </View>
  );
}

export function TicketScreen() {
  const nav = useNav();
  const { state, addRecord, patch } = useStore();
  useKeepAwake();
  useEffect(() => { setStatusBarHidden(true, 'fade'); return () => setStatusBarHidden(false, 'fade'); }, []);
  const { draft, reset: resetDraft } = useDraft();
  const result = getLastResult() ?? computeScore(draft);
  const [score, setScore] = useState('0.0');
  const [stage, setStage] = useState<'printing' | 'stamped' | 'tearable' | 'torn'>('printing');
  const printY = useRef(new Animated.Value(-620)).current;
  const stampScale = useRef(new Animated.Value(0)).current;
  const tearY = useRef(new Animated.Value(0)).current;
  const tearRot = useRef(new Animated.Value(0)).current;
  const saved = useRef(false);
  const alive = useRef(true);
  const shotRef = useRef<View>(null);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    alive.current = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    // dot-matrix print: stepped descent
    let step = 0;
    const totalSteps = 16;
    const printIv = setInterval(() => {
      if (!alive.current) { clearInterval(printIv); return; }
      step++;
      printY.setValue(-620 + (620 * step) / totalSteps);
      play('print');
      if (step >= totalSteps) {
        clearInterval(printIv);
        // count-up
        const t0 = Date.now();
        const cnt = setInterval(() => {
          if (!alive.current) { clearInterval(cnt); return; }
          const tt = Math.min((Date.now() - t0) / 1300, 1);
          setScore((result.score * (1 - Math.pow(1 - tt, 3))).toFixed(1));
          if (tt >= 1) {
            clearInterval(cnt);
            setStage('stamped');
            play('stamp'); vib.heavy();
            setBurst(b => b + 1);
            Animated.spring(stampScale, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
            Animated.sequence([
              Animated.timing(tearY, { toValue: 6, duration: 60, useNativeDriver: true }),
              Animated.spring(tearY, { toValue: 0, friction: 4, useNativeDriver: true }),
            ]).start();
            timers.push(setTimeout(() => { if (alive.current) setStage('tearable'); }, 650));
            if (!saved.current && !state.consoleMode) { saved.current = true; addRecord(draft, result); }
          }
        }, 40);
      }
    }, 106);
    return () => { alive.current = false; clearInterval(printIv); timers.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stageRef = useRef(stage);
  stageRef.current = stage;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => stageRef.current === 'tearable' && g.dy > 6,
      onPanResponderMove: (_e, g) => {
        const dy = Math.max(0, g.dy);
        tearY.setValue(dy * 0.9);
        tearRot.setValue(Math.min(dy * 0.0006, 0.07));
        if (dy > 80 && stageRef.current === 'tearable') {
          setStage('torn');
          play('rip'); vib.success();
          Animated.parallel([
            Animated.spring(tearY, { toValue: 16, friction: 5, useNativeDriver: true }),
            Animated.timing(tearRot, { toValue: 0.02, duration: 220, useNativeDriver: true }),
          ]).start();
        }
      },
      onPanResponderRelease: () => {
        if (stageRef.current === 'tearable') {
          Animated.spring(tearY, { toValue: 0, useNativeDriver: true }).start();
          tearRot.setValue(0);
        }
      },
    }),
  ).current;

  const name = (state.profile.name || '').split(' ')[0];
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const rotate = tearRot.interpolate({ inputRange: [0, 1], outputRange: ['0rad', '1rad'] });
  const isPeak = result.score >= 4.5;
  const storyRef = useRef<View>(null);

  return (
    <SafeAreaView style={tk.wrap}>
      <Text style={tk.printLabel}>UF INDEX · OFFICIAL RESULT</Text>
      <View style={tk.printSlot} />
      <View style={tk.ticketWindow}>
        <Animated.View
          {...pan.panHandlers}
          style={[tk.ticket, { transform: [{ translateY: Animated.add(printY, tearY) }, { rotate }] }]}
        >
        <View ref={shotRef} collapsable={false} style={[
          { backgroundColor: C.white, margin: -16, padding: 16, borderRadius: 6 },
          isPeak && { borderWidth: 4, borderColor: C.gold, backgroundColor: '#FFFFFF' },
        ]}>
          {isPeak && stage !== 'printing' && (
            <View style={tk.peakSeal}><Text style={tk.peakSealTxt}>★ PEAK</Text></View>
          )}
          <View style={tk.tkHead}>
            <View style={tk.tkMark}><Text style={tk.tkMarkTxt}>UF</Text></View>
            <View>
              <Text style={tk.tkTitle}>UF INDEX</Text>
              <Text style={tk.tkSubtitle}>ENERGY ASSESSMENT</Text>
            </View>
            <Text style={tk.tkNo}>Nº {String(state.records.length + 1).padStart(4, '0')}</Text>
          </View>
          <View style={tk.dash} />
          <Text style={tk.tkScore}>{score}</Text>
          <Text style={tk.tkOutOf}>OUT OF 5</Text>
          {stage !== 'printing' && (
            <Animated.View style={[tk.stamp, isPeak && { borderColor: C.gold, backgroundColor: 'rgba(210,145,51,0.12)' }, { transform: [{ scale: stampScale }, { rotate: '-4deg' }] }]}>
              <Text style={[tk.stampTxt, isPeak && { color: C.gold }]}>{bandLabel(state.lang, result.band).toUpperCase()}</Text>
            </Animated.View>
          )}
          <Text style={tk.tkNote}>{BAND_TEXT[result.band]}</Text>
          <View style={{ marginTop: 10 }}>
            {result.pillars.map(p => (
              <View key={p.name} style={tk.pillarRow}>
                <Text style={tk.pillarName}>{p.name.toUpperCase()}</Text>
                <View style={tk.pillarTrack}>
                  <View style={[tk.pillarFill, { width: `${((p.value - 1) / 4) * 100}%` }]} />
                </View>
                <Text style={tk.pillarVal}>{p.value.toFixed(1)}</Text>
              </View>
            ))}
          </View>
          <View style={tk.dash} />
          <Text style={tk.tkMeta}>{(name ? `${name} · ` : '') + date.toUpperCase()}</Text>
          <View style={tk.barcode}>
            {Array.from({ length: 36 }, (_v, i) => (
              <View key={i} style={{ width: (i * 7) % 3 + 1.5, marginRight: (i * 13) % 5 + 2, backgroundColor: C.black, height: 24 }} />
            ))}
          </View>
          <Text style={tk.tkTag}># I T S U R J A T I M E</Text>
        </View>
        </Animated.View>
      </View>
      {stage === 'tearable' && <Text style={tk.hint}>Swipe the ticket down to tear it off</Text>}
      {stage === 'torn' && state.consoleMode && (
        <ConsoleHandoff onReset={() => { resetDraft(); nav.go('console'); }} />
      )}
      {stage === 'torn' && !state.consoleMode && (
        <View style={tk.ctaBar}>
          <Btn label="What's behind my score" onPress={() => nav.go('breakdown')} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn style={{ flex: 1 }} label="Share" variant="ghost" onPress={async () => {
              try {
                const uri = await captureRef(shotRef, { format: 'png', quality: 1 });
                if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png' });
              } catch {}
            }} />
            <Btn style={{ flex: 1 }} label="Story 9:16" variant="ghost" onPress={async () => {
              try {
                const uri = await captureRef(storyRef, { format: 'png', quality: 1, width: 1080, height: 1920 });
                if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png' });
              } catch {}
            }} />
            <Btn style={{ flex: 1 }} label="Dashboard" variant="ghost" onPress={() => nav.go(state.records.length > 1 ? 'delta' : 'dashboard')} />
          </View>
        </View>
      )}
      <EmberBurst trigger={burst} count={isPeak ? 26 : 14} />
      {/* offscreen 9:16 story card, captured on demand */}
      <View ref={storyRef} collapsable={false} style={tk.story} pointerEvents="none">
        <Text style={tk.storyEyebrow}>MY UF INDEX</Text>
        <View style={[tk.storyCard, isPeak && { borderColor: C.gold, borderWidth: 3 }]}>
          <Text style={tk.storyScore}>{result.score.toFixed(1)}</Text>
          <Text style={tk.storyOutOf}>OUT OF 5</Text>
          <View style={[tk.stamp, { alignSelf: 'center', transform: [{ rotate: '-4deg' }] }, isPeak && { borderColor: C.gold }]}>
            <Text style={[tk.stampTxt, isPeak && { color: C.gold }]}>{bandLabel(state.lang, result.band).toUpperCase()}</Text>
          </View>
          <Text style={tk.tkMeta}>{(name ? `${name} · ` : '') + date.toUpperCase()}</Text>
        </View>
        <Text style={tk.storyTag}># I T S U R J A T I M E</Text>
      </View>
    </SafeAreaView>
  );
}

export function BreakdownScreen() {
  const nav = useNav();
  const { state } = useStore();
  const result = getLastResult();
  if (!result) { nav.go('dashboard'); return null; }
  return (
    <ScreenShell
      stepLabel="Breakdown" onBack={() => nav.go('ticket')}
      cta={<Btn label="Continue to dashboard" onPress={() => nav.go(state.records.length > 1 ? 'delta' : 'dashboard')} />}
    >
      <H2>What's behind your score</H2>
      <Sub>Four pillars, weighted into your {result.score.toFixed(1)} / 5.</Sub>
      {result.pillars.map(p => (
        <View key={p.name} style={bd.pillar}>
          <View style={bd.row}>
            <Text style={bd.name}>{p.name} · {p.weight}</Text>
            <Text style={bd.val}>{p.value.toFixed(1)}</Text>
          </View>
          <View style={bd.track}><View style={[bd.fill, { width: `${((p.value - 1) / 4) * 100}%` }]} /></View>
          <Text style={bd.note}>{p.note}</Text>
        </View>
      ))}
    </ScreenShell>
  );
}

const ms = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.black, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, letterSpacing: 4, color: C.gold, fontFamily: FONT.uiSemiBold, marginBottom: 14 },
  readout: {
    width: 150, paddingVertical: 9, borderRadius: 12, backgroundColor: C.auburn24,
    borderWidth: 1, borderColor: C.auburn, alignItems: 'center', marginBottom: 16,
  },
  readTxt: { fontFamily: FONT.display, fontSize: 26, color: C.gold },
  tower: { gap: 5, marginBottom: 18 },
  seg: { width: 76, height: 11, borderRadius: 6, backgroundColor: C.auburn24 },
  slotZone: { height: 70, alignItems: 'center', justifyContent: 'flex-end' },
  coin: {
    position: 'absolute', top: 0, width: 42, height: 42, borderRadius: 21, backgroundColor: C.gold,
    alignItems: 'center', justifyContent: 'center', zIndex: 2,
  },
  coinTxt: { fontFamily: FONT.display, fontSize: 15, color: C.black },
  slot: { width: 64, height: 10, borderRadius: 5, backgroundColor: C.black, borderWidth: 1.5, borderColor: C.gold },
  msg: { color: C.whiteA6, fontSize: 14, marginTop: 22 },
  flash: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.gold },
});

const tk = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.black, alignItems: 'center' },
  printLabel: { fontSize: 11, letterSpacing: 4, color: C.gold, fontFamily: FONT.uiSemiBold, marginTop: 18 },
  printSlot: {
    width: 270, height: 12, borderRadius: 6, backgroundColor: C.black, borderWidth: 1,
    borderColor: C.gold, marginTop: 12,
  },
  ticketWindow: { width: 258, flex: 1, overflow: 'hidden', marginTop: 2 },
  ticket: { backgroundColor: C.white, borderRadius: 6, padding: 16 },
  tkHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  tkMark: {
    width: 32, height: 32, borderRadius: 9, borderWidth: 1.5, borderColor: C.auburn,
    alignItems: 'center', justifyContent: 'center',
  },
  tkMarkTxt: { fontFamily: FONT.display, fontSize: 12, color: C.auburn },
  tkTitle: { fontFamily: FONT.display, fontSize: 14, color: C.auburn },
  tkSubtitle: { fontSize: 8, letterSpacing: 2.4, color: 'rgba(13,13,13,.55)' },
  tkNo: { marginLeft: 'auto', fontSize: 10, color: 'rgba(13,13,13,.55)' },
  dash: { borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(13,13,13,.25)', marginVertical: 11, marginHorizontal: -16 },
  tkScore: { fontFamily: FONT.display, fontSize: 52, color: C.auburn, textAlign: 'center', lineHeight: 56 },
  tkOutOf: { fontSize: 9, letterSpacing: 3, color: 'rgba(13,13,13,.55)', textAlign: 'center', marginTop: 2 },
  stamp: {
    alignSelf: 'center', marginTop: 9, paddingHorizontal: 13, paddingVertical: 4,
    borderWidth: 2, borderColor: C.auburn, borderRadius: 6,
  },
  stampTxt: { fontFamily: FONT.display, fontSize: 14, letterSpacing: 1, color: C.auburn },
  tkNote: { fontSize: 11, lineHeight: 16, color: 'rgba(13,13,13,.72)', textAlign: 'center', marginTop: 10 },
  pillarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  pillarName: { width: 92, fontSize: 8.5, letterSpacing: 0.8, color: 'rgba(13,13,13,.6)', fontFamily: FONT.uiSemiBold },
  pillarTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: 'rgba(13,13,13,.12)', overflow: 'hidden' },
  pillarFill: { height: '100%', backgroundColor: C.auburn, borderRadius: 3 },
  pillarVal: { width: 24, textAlign: 'right', fontFamily: FONT.display, fontSize: 11, color: C.auburn },
  tkMeta: { fontSize: 9, letterSpacing: 1.4, color: 'rgba(13,13,13,.55)', textAlign: 'center' },
  barcode: { flexDirection: 'row', justifyContent: 'center', marginVertical: 9, overflow: 'hidden' },
  tkTag: { fontSize: 9, letterSpacing: 2, color: C.auburn, textAlign: 'center', fontFamily: FONT.uiSemiBold },
  hint: { color: C.white73, fontSize: 12.5, marginVertical: 14 },
  ctaBar: { width: '100%', paddingHorizontal: 22, paddingVertical: 12, gap: 10 },
  peakSeal: {
    position: 'absolute', top: 10, right: 10, borderWidth: 2, borderColor: C.gold,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: 'rgba(210,145,51,0.12)', zIndex: 3,
  },
  peakSealTxt: { color: C.gold, fontFamily: FONT.display, fontSize: 11, letterSpacing: 1 },
  story: {
    position: 'absolute', left: -1200, top: 0, width: 360, height: 640, backgroundColor: C.black,
    alignItems: 'center', justifyContent: 'center',
  },
  storyEyebrow: { color: C.gold, fontFamily: FONT.uiSemiBold, fontSize: 15, letterSpacing: 5, marginBottom: 22 },
  storyCard: {
    width: 250, backgroundColor: C.white, borderRadius: 8, paddingVertical: 26, paddingHorizontal: 18,
    alignItems: 'center', gap: 6,
  },
  storyScore: { fontFamily: FONT.display, fontSize: 76, color: C.auburn, lineHeight: 80 },
  storyOutOf: { fontSize: 10, letterSpacing: 4, color: 'rgba(13,13,13,.55)', marginBottom: 8 },
  storyTag: { color: C.gold, fontFamily: FONT.uiSemiBold, fontSize: 12, letterSpacing: 3, marginTop: 24 },
});

const bd = StyleSheet.create({
  pillar: {
    backgroundColor: C.auburn24, borderWidth: 1, borderColor: C.auburn40, borderRadius: 16,
    padding: 15, marginBottom: 10,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  name: { color: C.white, fontSize: 14.5, fontFamily: FONT.uiSemiBold },
  val: { fontFamily: FONT.display, fontSize: 16, color: C.gold },
  track: { height: 6, borderRadius: 3, backgroundColor: C.black, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: C.gold },
  note: { color: C.whiteA6, fontSize: 12, lineHeight: 18, marginTop: 7 },
});
