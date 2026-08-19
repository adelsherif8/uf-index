// UF Index — root. Fonts, stores, and the guided-flow navigator.
import React, { useEffect, useRef, useState } from 'react';
import { View, Animated, Easing, BackHandler } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { TabBar, TABBED } from './src/components/TabBar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Fraunces_500Medium, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import {
  InstrumentSans_400Regular, InstrumentSans_500Medium, InstrumentSans_600SemiBold,
} from '@expo-google-fonts/instrument-sans';
import { C } from './src/lib/theme';
import { NavCtx, Screen } from './src/lib/nav';
import { StoreProvider, useStore, skipsProfile, ageOn } from './src/lib/store';
import { DraftProvider } from './src/lib/draft';
import { initFx } from './src/lib/fx';
import { syncNow } from './src/lib/sync';
import { isSignedIn } from './src/lib/api';
import * as Notifications from 'expo-notifications';
import * as NativeSplash from 'expo-splash-screen';
import { SplashScreen, WelcomeScreen, AuthScreen, ConsentScreen } from './src/screens/onboarding';
import { ProfileScreen, MeasureScreen, EnergyScreen, FeelScreen, SleepScreen } from './src/screens/assessment';
import { MachineScreen, TicketScreen, BreakdownScreen } from './src/screens/machine';
import {
  DashboardScreen, DeltaScreen, HistoryScreen, BadgesScreen, InsightsScreen, CoachScreen,
} from './src/screens/dashboard';
import { SettingsScreen } from './src/screens/settings';
import { ConsoleScreen } from './src/screens/console';
import { PrivacyScreen } from './src/screens/privacy';
import { FontAwesome } from '@expo/vector-icons';
import {
  PlusProvider, PlusIntroScreen, Who5Screen, PssScreen, PsqiTimesScreen, PsqiTroublesScreen, PlusResultScreen,
} from './src/screens/plus';

NativeSplash.preventAutoHideAsync().catch(() => {});

const SCREENS: Record<Screen, React.ComponentType> = {
  splash: SplashScreen, welcome: WelcomeScreen, auth: AuthScreen, consent: ConsentScreen,
  profile: ProfileScreen, measure: MeasureScreen, energy: EnergyScreen, feel: FeelScreen, sleep: SleepScreen,
  machine: MachineScreen, ticket: TicketScreen, breakdown: BreakdownScreen, delta: DeltaScreen,
  dashboard: DashboardScreen, insights: InsightsScreen, history: HistoryScreen,
  badges: BadgesScreen, coach: CoachScreen,
  plus: PlusIntroScreen, who5: Who5Screen, pss: PssScreen,
  psqiTimes: PsqiTimesScreen, psqiTroubles: PsqiTroublesScreen, plusResult: PlusResultScreen,
  settings: SettingsScreen, console: ConsoleScreen, privacy: PrivacyScreen,
};

/** Flow order — used to slide forward vs backward correctly. */
const ORDER: Partial<Record<Screen, number>> = {
  splash: 0, welcome: 1, auth: 2, consent: 3,
  profile: 4, measure: 5, energy: 6, feel: 7, sleep: 8,
  machine: 9, ticket: 10, breakdown: 11, delta: 12,
  dashboard: 13, insights: 14, plus: 15, who5: 16, pss: 17,
  psqiTimes: 18, psqiTroubles: 19, plusResult: 20,
  coach: 21, history: 22, badges: 23, settings: 24, console: 3.5, privacy: 25,
};


/** Android hardware back — mirrors each screen's back arrow. */
const BACK: Partial<Record<Screen, Screen>> = {
  welcome: 'splash', auth: 'welcome', consent: 'auth',
  profile: 'consent', measure: 'profile', energy: 'measure', feel: 'energy', sleep: 'feel',
  machine: 'sleep', ticket: 'dashboard', breakdown: 'ticket', delta: 'dashboard',
  insights: 'dashboard', history: 'dashboard', badges: 'dashboard', coach: 'dashboard',
  plus: 'dashboard', who5: 'plus', pss: 'who5', psqiTimes: 'pss', psqiTroubles: 'psqiTimes',
  plusResult: 'dashboard', settings: 'dashboard', privacy: 'settings',
};

function Root() {
  const { state, ready, patch } = useStore();
  const [screen, setScreen] = useState<Screen>('splash');
  const [booted, setBooted] = useState(false);
  const anim = useRef(new Animated.Value(1)).current;
  const dir = useRef(1);
  const prev = useRef<Screen>('splash');

  const go = (next: Screen) => {
    dir.current = (ORDER[next] ?? 99) >= (ORDER[prev.current] ?? 99) ? 1 : -1;
    prev.current = next;
    setScreen(next);
  };

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(resp => {
      const target = resp.notification.request.content.data?.go;
      if (target === 'profile') go(skipsProfile(state) ? 'measure' : 'profile');
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      let target = BACK[prev.current];
      // returning users never see the profile step, so back from measurements
      // belongs on the dashboard, not on a screen they skipped
      if (target === 'profile' && skipsProfile(state)) target = 'dashboard';
      if (target) { go(target); return true; }
      return false;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
  }, [screen, anim]);

  // Sync on launch. Safe when there's no backend, no session or no network:
  // it returns immediately and the app stays fully offline.
  useEffect(() => {
    if (!ready) return;
    (async () => {
      const signedIn = await isSignedIn();
      await syncNow(state.records, next => patch({ records: next }), ageOn(state.profile.dob));
      // Reinstalled on a new phone: there is no local history yet, so the boot
      // check below sends them to the first-run pitch. Once their history has
      // come down from the server, put them where they belong. Only from the
      // opening screens — never yank someone out of a flow they've started.
      if (signedIn && !state.consoleMode
          && (prev.current === 'splash' || prev.current === 'welcome')) {
        prev.current = 'dashboard';
        setScreen('dashboard');
      }
    })().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (ready && !booted) {
      setBooted(true);
      // kiosk installs boot straight into the attract loop
      if (state.consoleMode) { prev.current = 'console'; setScreen('console'); }
      // returning users land on their dashboard, not the pitch
      else if (state.records.length > 0) { prev.current = 'dashboard'; setScreen('dashboard'); }
    }
  }, [ready, booted, state.records.length]);

  const Current = SCREENS[screen];
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [34 * dir.current, 0] });
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] });
  const showTabs = TABBED.includes(screen);
  return (
    <NavCtx.Provider value={{ screen, go }}>
      <View style={{ flex: 1, backgroundColor: C.black }}>
        <Animated.View style={{ flex: 1, opacity: anim, transform: [{ translateX }, { scale }] }}>
          <Current />
        </Animated.View>
        {showTabs && <TabBar screen={screen} go={go} />}
      </View>
    </NavCtx.Provider>
  );
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() { return { err: true }; }
  render() {
    if (this.state.err) {
      return (
        <View style={{ flex: 1, backgroundColor: C.black, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <FontAwesome name="bolt" size={40} color="#D29133" style={{ marginBottom: 12 }} />
          <Animated.Text style={{ color: '#FFFFFF', fontSize: 18, textAlign: 'center', marginBottom: 8 }}>
            The machine hiccuped.
          </Animated.Text>
          <Animated.Text
            onPress={() => this.setState({ err: false })}
            style={{ color: '#D29133', fontSize: 15, padding: 12, textDecorationLine: 'underline' }}>
            Tap to restart
          </Animated.Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Fraunces_500Medium, Fraunces_600SemiBold,
    InstrumentSans_400Regular, InstrumentSans_500Medium, InstrumentSans_600SemiBold,
  });
  useEffect(() => { initFx(); }, []);
  useEffect(() => {
    if (fontsLoaded) NativeSplash.hideAsync().catch(() => {});
  }, [fontsLoaded]);
  if (!fontsLoaded) return null;   // native splash stays up — no flash of empty screen
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <StoreProvider>
        <DraftProvider>
          <PlusProvider>
            <ErrorBoundary>
              <Root />
            </ErrorBoundary>
          </PlusProvider>
        </DraftProvider>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
