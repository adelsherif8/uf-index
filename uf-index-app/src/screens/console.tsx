// Console mode — the Phase 4 kiosk software, running on any phone or tablet.
// Attract loop → walk-up assessment → ticket → QR handoff → auto-reset.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { setStatusBarHidden } from 'expo-status-bar';
import { C, FONT } from '../lib/theme';
import { useNav } from '../lib/nav';
import { useStore } from '../lib/store';
import { useDraft } from '../lib/draft';
import { play, vib } from '../lib/fx';

const TAGLINES = [
  'TAP TO TEST YOUR ENERGY',
  '3 MINUTES · 1 SCORE',
  'THE WORLD’S FIRST ENERGY INDEX',
  '#ITSURJATIME',
];

export function ConsoleScreen() {
  const nav = useNav();
  const { patch } = useStore();
  const { reset } = useDraft();
  useKeepAwake();
  const pulse = useRef(new Animated.Value(1)).current;
  const [tag, setTag] = useState(0);
  const exitTaps = useRef<number[]>([]);

  useEffect(() => {
    setStatusBarHidden(true, 'fade');
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.12, duration: 1100, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
    ]));
    loop.start();
    const iv = setInterval(() => setTag(x => (x + 1) % TAGLINES.length), 3200);
    return () => { loop.stop(); clearInterval(iv); setStatusBarHidden(false, 'fade'); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const begin = () => {
    reset();               // every walk-up starts clean
    play('coin'); vib.medium();
    nav.go('profile');
  };

  /** Hidden exit: 5 taps on the top-left corner within 3 seconds. */
  const exitTap = () => {
    const now = Date.now();
    exitTaps.current = [...exitTaps.current.filter(t => now - t < 3000), now];
    if (exitTaps.current.length >= 5) {
      exitTaps.current = [];
      patch({ consoleMode: false });
      nav.go('settings');
    }
  };

  return (
    <Pressable style={cs.wrap} onPress={begin}>
      <Pressable onPress={exitTap} style={cs.exitZone} />
      <Animated.View style={[cs.bolt, { transform: [{ scale: pulse }] }]}>
        <Text style={cs.boltTxt}>⚡</Text>
      </Animated.View>
      <Text style={cs.title}>UF INDEX</Text>
      <Text style={cs.tagline}>{TAGLINES[tag]}</Text>
      <View style={cs.hintWrap}>
        <Text style={cs.hint}>Tap anywhere to begin</Text>
      </View>
    </Pressable>
  );
}

/** Rendered on the ticket screen when console mode is on: QR handoff + auto-reset. */
export function ConsoleHandoff({ onReset }: { onReset: () => void }) {
  const [left, setLeft] = useState(30);
  const QR = require('react-native-qrcode-svg').default;
  useEffect(() => {
    const iv = setInterval(() => setLeft(l => {
      if (l <= 1) { clearInterval(iv); onReset(); return 0; }
      return l - 1;
    }), 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={cs.handoff}>
      <View style={cs.qrBox}>
        <QR value="https://uf-index-prototype.vercel.app" size={120} color={C.auburn} backgroundColor={C.white} />
      </View>
      <Text style={cs.handoffTitle}>SCAN — TAKE YOUR INDEX HOME</Text>
      <Text style={cs.handoffSub}>Get the app, keep your score, start your streak.</Text>
      <Pressable onPress={onReset} style={cs.resetBtn}>
        <Text style={cs.resetTxt}>New test · resets in {left}s</Text>
      </Pressable>
    </View>
  );
}

const cs = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.black, alignItems: 'center', justifyContent: 'center' },
  exitZone: { position: 'absolute', top: 0, left: 0, width: 90, height: 90, zIndex: 5 },
  bolt: {
    width: 130, height: 130, borderRadius: 40, borderWidth: 2, borderColor: C.gold35,
    backgroundColor: C.gold13, alignItems: 'center', justifyContent: 'center',
  },
  boltTxt: { fontSize: 60, color: C.gold },
  title: { fontFamily: FONT.display, fontSize: 44, color: C.white, letterSpacing: 4, marginTop: 26 },
  tagline: { color: C.gold, fontSize: 14, letterSpacing: 3, marginTop: 10, fontFamily: FONT.uiSemiBold },
  hintWrap: { position: 'absolute', bottom: 60 },
  hint: { color: C.white73, fontSize: 13 },
  handoff: { alignItems: 'center', paddingVertical: 12, width: '100%' },
  qrBox: { backgroundColor: C.white, padding: 10, borderRadius: 12 },
  handoffTitle: { color: C.gold, fontSize: 13, letterSpacing: 2, fontFamily: FONT.uiSemiBold, marginTop: 12 },
  handoffSub: { color: C.whiteA6, fontSize: 12, marginTop: 4 },
  resetBtn: {
    marginTop: 14, borderWidth: 1.5, borderColor: C.auburn, borderRadius: 999,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  resetTxt: { color: C.gold, fontSize: 13, fontFamily: FONT.uiSemiBold },
});
