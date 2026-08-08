// Bottom tab bar — Home · Insights · Plus · Coach, gold-lit like the prototype.
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { C, FONT } from '../lib/theme';
import { Screen } from '../lib/nav';
import { vib } from '../lib/fx';

const stroke = (on: boolean) => (on ? C.gold : C.white73);

const ICONS: Record<string, (on: boolean) => React.ReactElement> = {
  dashboard: on => (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
      <Path d="M4 11l8-7 8 7v8.5a1.5 1.5 0 0 1-1.5 1.5H14v-6h-4v6H5.5A1.5 1.5 0 0 1 4 19.5V11z"
        stroke={stroke(on)} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
  insights: on => (
    <Svg width={21} height={21} viewBox="0 0 24 24">
      <Path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2L12 2z" fill={stroke(on)} />
    </Svg>
  ),
  plus: on => (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={stroke(on)} strokeWidth={2} />
      <Path d="M12 8v8M8 12h8" stroke={stroke(on)} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  ),
  coach: on => (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
      <Path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-5 4V5.5z"
        stroke={stroke(on)} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ),
};

const TABS: { key: Screen; label: string }[] = [
  { key: 'dashboard', label: 'Home' },
  { key: 'insights', label: 'Insights' },
  { key: 'plus', label: 'Plus' },
  { key: 'coach', label: 'Coach' },
];

/** Screens on which the tab bar is visible (plus their sub-screens keep it too). */
export const TABBED: Screen[] = ['dashboard', 'insights', 'plus', 'coach', 'history', 'badges', 'plusResult'];

export function TabBar({ screen, go }: { screen: Screen; go: (s: Screen) => void }) {
  const insets = useSafeAreaInsets();
  const activeKey: Screen =
    screen === 'history' || screen === 'badges' ? 'dashboard'
    : screen === 'plusResult' ? 'plus'
    : screen;
  return (
    <View style={[tb.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {TABS.map(t => {
        const on = t.key === activeKey;
        return (
          <Pressable key={t.key} hitSlop={6}
            style={({ pressed }) => [tb.tab, pressed && { opacity: 0.6, transform: [{ scale: 0.94 }] }]}
            onPress={() => { if (!on) { vib.tick(); go(t.key); } }}>
            {ICONS[t.key](on)}
            <Text style={[tb.label, on && { color: C.gold }]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const tb = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: C.auburn40,
    backgroundColor: C.black,
    paddingTop: 10,
    paddingHorizontal: 8,
  },
  tab: { flex: 1, alignItems: 'center', gap: 4 },
  label: { fontSize: 10.5, color: C.white73, fontFamily: FONT.uiSemiBold, letterSpacing: 0.3 },
});
