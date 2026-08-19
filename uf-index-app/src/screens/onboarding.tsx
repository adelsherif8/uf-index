// Splash → welcome carousel → sign-up → consent. Mirrors the prototype copy.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, ScrollView, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, FONT } from '../lib/theme';
import { useNav } from '../lib/nav';
import { useStore } from '../lib/store';
import { OFFERED_LANGS } from '../lib/i18n';
import { isConfigured, signUp, signIn, recordConsents } from '../lib/api';
import { ScreenShell, Btn, H2, Sub, Field, CheckRow, Card } from '../components/ui';
import { STRINGS } from '../lib/i18n';

export function SplashScreen() {
  const nav = useNav();
  const { state } = useStore();
  const t = STRINGS[state.lang];
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.08, duration: 900, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    const auto = setTimeout(() => nav.go('welcome'), 2400);
    return () => { loop.stop(); clearTimeout(auto); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Pressable style={os.splash} onPress={() => nav.go('welcome')}>
      <SafeAreaView style={os.splashInner}>
        <Animated.View style={[os.brandmark, { transform: [{ scale: pulse }] }]}><Text style={os.brandmarkTxt}>UF</Text></Animated.View>
        <Text style={os.splashTitle}>UF Index</Text>
        <Text style={os.splashTag}>{t.tagline}</Text>
        <Text style={os.splashHint}>{t.tap}</Text>
      </SafeAreaView>
    </Pressable>
  );
}

export function WelcomeScreen() {
  const nav = useNav();
  const { state, patch } = useStore();
  const t = STRINGS[state.lang];
  const SLIDES = t.slides;
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;
  const scroller = useRef<ScrollView>(null);
  const { width } = useWindowDimensions();
  const pageW = width - 44; // ScreenShell horizontal padding
  const goSlide = (n: number) => {
    scroller.current?.scrollTo({ x: n * pageW, animated: true });
    setI(n);
  };
  return (
    <ScreenShell
      cta={
        <>
          <Btn label={last ? t.start : t.cont} onPress={() => (last ? nav.go('auth') : goSlide(i + 1))} />
          <Btn label={t.skip} variant="ghost" onPress={() => nav.go('auth')} />
        </>
      }
    >
      {OFFERED_LANGS.length > 1 && (
      <View style={os.langPill}>
        {OFFERED_LANGS.map(l => (
          <Pressable key={l} onPress={() => patch({ lang: l })}
            style={[os.langBtn, state.lang === l && os.langBtnOn]}>
            <Text style={[os.langTxt, state.lang === l && os.langTxtOn]}>{l === 'en' ? 'EN' : 'हिं'}</Text>
          </Pressable>
        ))}
      </View>
      )}
      <View style={{ flex: 1, justifyContent: 'center', minHeight: 420 }}>
        <ScrollView
          ref={scroller} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={e => setI(Math.round(e.nativeEvent.contentOffset.x / pageW))}
          style={{ flexGrow: 0 }}
        >
          {SLIDES.map((sl, di) => (
            <View key={di} style={{ width: pageW, alignItems: 'center' }}>
              <View style={os.glyph}><Text style={os.glyphTxt}>{['⚡', '◎', '↗'][di]}</Text></View>
              <Text style={os.slideTitle}>{sl.title}</Text>
              <Text style={os.slideBody}>{sl.body}</Text>
            </View>
          ))}
        </ScrollView>
        <View style={os.dots}>
          {SLIDES.map((_s, di) => <View key={di} style={[os.dot, di === i && os.dotOn]} />)}
        </View>
      </View>
    </ScreenShell>
  );
}

export function AuthScreen() {
  const nav = useNav();
  const { state, patch } = useStore();
  const [email, setEmail] = useState(state.profile.email);
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'up' | 'in'>('up');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const live = isConfigured();   // false until a Supabase project is wired up

  /** Guest: nothing leaves the phone. Always available, even when live. */
  const asGuest = () => { patch({ profile: { ...state.profile, email } }); nav.go('consent'); };

  const submit = async () => {
    if (!live) return asGuest();          // no backend yet — behave as before
    setErr('');
    if (!email.trim()) return setErr('Email is required.');
    if (password.length < 8) return setErr('Password must be at least 8 characters.');

    setBusy(true);
    try {
      const { error } = mode === 'up'
        ? await signUp(email.trim(), password)
        : await signIn(email.trim(), password);
      if (error) { setErr(error.message); return; }
      patch({ profile: { ...state.profile, email: email.trim() } });
      nav.go('consent');
    } catch {
      setErr('Could not reach the server. Check your connection, or continue as a guest.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenShell
      stepLabel="Welcome"
      cta={
        <>
          <Btn
            label={busy ? 'One moment…' : !live ? 'Sign up' : mode === 'up' ? 'Create account' : 'Sign in'}
            disabled={busy}
            onPress={submit}
          />
          {live && (
            <Btn
              label={mode === 'up' ? 'I already have an account' : 'Create one instead'}
              variant="ghost" disabled={busy}
              onPress={() => { setErr(''); setMode(mode === 'up' ? 'in' : 'up'); }}
            />
          )}
          <Btn label="Continue as guest →" variant="ghost" disabled={busy} onPress={asGuest} />
        </>
      }
    >
      <H2>{!live || mode === 'up' ? 'Create your account' : 'Welcome back'}</H2>
      <Sub>
        {live
          ? 'An account backs up your check-ins and lets a coach see them — only if you allow it on the next screen. Guest mode keeps everything on this phone.'
          : 'Accounts arrive with the backend — for now everything lives on this phone either way. Guest mode is the honest default.'}
      </Sub>
      <Field
        label="Email" value={email} onChange={t => { setEmail(t); setErr(''); }}
        keyboard="email-address" placeholder="you@example.com"
        required={live} error={err && !password ? err : undefined}
      />
      <Field
        label="Password" value={live ? password : '••••••••••'}
        onChange={t => { if (live) { setPassword(t); setErr(''); } }}
        secure placeholder={live ? 'At least 8 characters' : undefined}
        required={live} error={err && password ? err : undefined}
      />
    </ScreenShell>
  );
}

export function ConsentScreen() {
  const nav = useNav();
  const { state, patch } = useStore();
  const [c, setC] = useState(state.consents);
  return (
    <ScreenShell
      stepLabel="Privacy"
      onBack={() => nav.go('auth')}
      cta={<Btn label={c.clause ? 'Agree & start charging' : 'Approve the clause to continue'}
        variant={c.clause ? 'gold' : 'ghost'}
        onPress={() => {
          if (!c.clause) return;
          patch({ consents: c });
          // Recorded against the signed-in user with a policy version and a
          // timestamp — that's what DPDP asks for. No-ops for guests.
          recordConsents(c).catch(() => {});
          nav.go('profile');
        }} />}
    >
      <H2>Your data, your call</H2>
      <Sub>UF Index uses health-related information. Here's exactly what happens with it.</Sub>
      <Card style={{ marginTop: 0 }}>
        <Text style={os.cardH}>What we collect</Text>
        <Text style={os.cardP}>Body measurements, energy and sleep ratings, and your assessment answers — nothing else.</Text>
      </Card>
      <Card>
        <Text style={os.cardH}>Our privacy promise</Text>
        <Text style={os.cardP}>Never sold. Never shared without your consent. Stored on your device in this version. Delete everything any time.</Text>
      </Card>
      <View style={{ height: 10 }} />
      <CheckRow checked={c.clause} onToggle={() => setC({ ...c, clause: !c.clause })}>
        Clause approval — I agree to the UFAS terms and to my health data being used to calculate my UF Index.
      </CheckRow>
      <CheckRow checked={c.coach} onToggle={() => setC({ ...c, coach: !c.coach })}>
        A UFAS coach may view my score history if I request coaching. (optional)
      </CheckRow>
      <CheckRow checked={c.social} onToggle={() => setC({ ...c, social: !c.social })}>
        UFAS may feature my transformation on social media. (optional)
      </CheckRow>
      <Pressable onPress={() => nav.go('privacy')}>
        <Text style={{ color: C.gold, fontSize: 12.5, marginTop: 8, fontFamily: FONT.uiSemiBold }}>Read the full privacy policy →</Text>
      </Pressable>
    </ScreenShell>
  );
}

const os = StyleSheet.create({
  splash: { flex: 1, backgroundColor: C.black },
  splashInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  brandmark: {
    width: 92, height: 92, borderRadius: 30, borderWidth: 1.5, borderColor: C.gold35,
    alignItems: 'center', justifyContent: 'center', backgroundColor: C.gold13,
  },
  brandmarkTxt: { fontFamily: FONT.display, fontSize: 34, color: C.gold },
  splashTitle: { fontFamily: FONT.display, fontSize: 42, color: C.white, marginTop: 24 },
  splashTag: { fontSize: 12, letterSpacing: 4, color: C.gold, marginTop: 8, fontFamily: FONT.uiSemiBold },
  splashHint: { position: 'absolute', bottom: 56, fontSize: 12.5, color: C.white73 },
  glyph: {
    width: 110, height: 110, borderRadius: 55, backgroundColor: C.auburn24, borderWidth: 1,
    borderColor: C.auburn40, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 26,
  },
  glyphTxt: { fontSize: 40, color: C.gold },
  slideTitle: { fontFamily: FONT.display, fontSize: 27, color: C.white, textAlign: 'center', marginBottom: 10 },
  slideBody: { color: C.whiteA6, fontSize: 14.5, lineHeight: 22, textAlign: 'center', maxWidth: 300, alignSelf: 'center' },
  dots: { flexDirection: 'row', gap: 7, justifyContent: 'center', marginTop: 26 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.auburn },
  dotOn: { backgroundColor: C.gold, width: 20 },
  cardH: { color: C.gold, fontSize: 15, fontFamily: FONT.uiSemiBold, marginBottom: 4 },
  langPill: { flexDirection: 'row', alignSelf: 'flex-end', gap: 4, backgroundColor: C.auburn24, borderRadius: 999, padding: 4, marginTop: 8 },
  langBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
  langBtnOn: { backgroundColor: C.gold },
  langTxt: { color: C.whiteA6, fontSize: 12, fontFamily: FONT.uiSemiBold },
  langTxtOn: { color: C.black },
  cardP: { color: C.whiteA6, fontSize: 13, lineHeight: 20 },
});
