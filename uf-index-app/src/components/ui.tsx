// Shared UI kit — mirrors the web prototype's design system exactly.
import React from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, ViewStyle, KeyboardTypeOptions,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, FONT } from '../lib/theme';
import { play, vib } from '../lib/fx';

export function ScreenShell(props: {
  children: React.ReactNode;
  cta?: React.ReactNode;
  onBack?: () => void;
  stepLabel?: string;
  chargePct?: number;      // 0–100 charge meter under the header
  scroll?: boolean;        // default true
}) {
  const { children, cta, onBack, stepLabel, chargePct, scroll = true } = props;
  const Body = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={s.shell} edges={['top', 'bottom']}>
      {(onBack || stepLabel) && (
        <View style={s.header}>
          {onBack ? (
            <Pressable onPress={() => { vib.tick(); onBack(); }} hitSlop={14}
              style={({ pressed }) => [s.back, pressed && { backgroundColor: C.auburn, transform: [{ scale: 0.94 }] }]}>
              <Text style={s.backTxt}>←</Text>
            </Pressable>
          ) : <View style={{ width: 36 }} />}
          {stepLabel ? <Text style={s.stepLabel}>{stepLabel}</Text> : null}
        </View>
      )}
      {chargePct != null && (
        <View style={s.chargeRow}>
          <View style={s.chargeTrack}><View style={[s.chargeFill, { width: `${chargePct}%` }]} /></View>
          <Text style={s.chargePct}>⌁ {chargePct}%</Text>
        </View>
      )}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Body
          style={{ flex: 1 }}
          contentContainerStyle={scroll ? s.scrollPad : undefined}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          alwaysBounceVertical>
          {children}
        </Body>
        {cta ? <View style={s.ctaBar}>{cta}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Btn(props: {
  label: string; onPress: () => void;
  variant?: 'gold' | 'ghost' | 'blood';
  style?: ViewStyle; disabled?: boolean;
}) {
  const { label, onPress, variant = 'gold', style, disabled } = props;
  return (
    <Pressable
      disabled={disabled}
      onPress={() => { vib.light(); onPress(); }}
      style={({ pressed }) => [
        s.btn,
        variant === 'gold' && s.btnGold,
        variant === 'ghost' && s.btnGhost,
        variant === 'blood' && s.btnBlood,
        pressed && { transform: [{ scale: 0.97 }], opacity: 0.92 },
        disabled && { opacity: 0.45 },
        style,
      ]}
    >
      <Text style={[s.btnTxt, variant === 'gold' ? s.btnTxtGold : variant === 'blood' ? s.btnTxtBlood : s.btnTxtGhost]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return <Text style={s.h2}>{children}</Text>;
}
export function Sub({ children }: { children: React.ReactNode }) {
  return <Text style={s.sub}>{children}</Text>;
}

export const Field = React.forwardRef<TextInput, {
  label: string; value: string; onChange: (v: string) => void;
  keyboard?: KeyboardTypeOptions; placeholder?: string; secure?: boolean; half?: boolean;
  required?: boolean; error?: string;
  returnKeyType?: 'next' | 'done'; onSubmitEditing?: () => void;
}>(function Field(props, ref) {
  const bad = !!props.error;
  return (
    <View style={[s.field, props.half && { flex: 1 }]}>
      <Text style={s.fieldLabel}>
        {props.label}{props.required ? <Text style={s.req}> *</Text> : null}
      </Text>
      <TextInput
        ref={ref}
        style={[s.input, bad && s.inputBad]}
        value={props.value}
        onChangeText={props.onChange}
        keyboardType={props.keyboard}
        placeholder={props.placeholder}
        placeholderTextColor={C.white73}
        secureTextEntry={props.secure}
        returnKeyType={props.returnKeyType}
        onSubmitEditing={props.onSubmitEditing}
        blurOnSubmit={props.returnKeyType !== 'next'}
        selectionColor={C.gold}
      />
      {bad ? <Text style={s.errTxt}>{props.error}</Text> : null}
    </View>
  );
});

/** 1–5 (or 0–N) tappable scale, gold-lit like the prototype. */
export function ScaleRow(props: {
  title?: string; hint?: string;
  value: number; onChange: (v: number) => void;
  min?: number; max?: number;
  endLow?: string; endHigh?: string;
}) {
  const { min = 1, max = 5 } = props;
  const vals: number[] = [];
  for (let v = min; v <= max; v++) vals.push(v);
  return (
    <View style={s.scaleBlock}>
      {props.title ? <Text style={s.scaleTitle}>{props.title}</Text> : null}
      {props.hint ? <Text style={s.scaleHint}>{props.hint}</Text> : null}
      <View style={s.scaleRow}>
        {vals.map(v => {
          const on = v === props.value;
          return (
            <Pressable
              key={v}
              onPress={() => { vib.tick(); play('tick'); props.onChange(v); }}
              hitSlop={4}
              style={({ pressed }) => [s.scaleBtn, on && s.scaleBtnOn, pressed && !on && { backgroundColor: C.auburn24, borderColor: C.gold35 }]}
            >
              <Text style={[s.scaleBtnTxt, on && s.scaleBtnTxtOn]}>{v}</Text>
            </Pressable>
          );
        })}
      </View>
      {(props.endLow || props.endHigh) && (
        <View style={s.scaleEnds}>
          <Text style={s.scaleEnd}>{props.endLow}</Text>
          <Text style={s.scaleEnd}>{props.endHigh}</Text>
        </View>
      )}
    </View>
  );
}

export function Seg(props: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={s.seg}>
      {props.options.map(([val, label]) => {
        const on = val === props.value;
        return (
          <Pressable key={val} onPress={() => { vib.tick(); props.onChange(val); }}
            style={({ pressed }) => [s.segBtn, on && s.segBtnOn, pressed && !on && { backgroundColor: C.auburn24 }]}>
            <Text style={[s.segTxt, on && s.segTxtOn]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function CheckRow(props: { checked: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <Pressable onPress={() => { vib.tick(); props.onToggle(); }} hitSlop={6}
      style={({ pressed }) => [s.checkRow, pressed && { opacity: 0.75 }]}>
      <View style={[s.checkBox, props.checked && s.checkBoxOn]}>
        {props.checked ? <Text style={s.checkMark}>✓</Text> : null}
      </View>
      <Text style={s.checkTxt}>{props.children}</Text>
    </Pressable>
  );
}

export const s = StyleSheet.create({
  shell: { flex: 1, backgroundColor: C.black },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8 },
  back: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: C.auburn,
    alignItems: 'center', justifyContent: 'center', backgroundColor: C.auburn24,
  },
  backTxt: { color: C.white, fontSize: 16 },
  stepLabel: {
    marginLeft: 'auto', fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase',
    color: C.whiteA6, fontFamily: FONT.ui,
  },
  chargeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginTop: 12 },
  chargeTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: C.auburn24, overflow: 'hidden' },
  chargeFill: { height: '100%', borderRadius: 3, backgroundColor: C.gold },
  chargePct: { fontFamily: FONT.display, color: C.gold, fontSize: 13, minWidth: 56, textAlign: 'right' },
  scrollPad: { paddingHorizontal: 22, paddingTop: 6, paddingBottom: 24 },
  ctaBar: { paddingHorizontal: 22, paddingBottom: 10, paddingTop: 8, gap: 10 },
  btn: { padding: 16, borderRadius: 16, alignItems: 'center' },
  btnGold: { backgroundColor: C.gold },
  btnGhost: { borderWidth: 1.5, borderColor: C.auburn },
  btnBlood: { backgroundColor: C.auburn },
  btnTxt: { fontSize: 16, fontFamily: FONT.uiSemiBold },
  btnTxtGold: { color: C.black },
  btnTxtGhost: { color: C.gold },
  btnTxtBlood: { color: C.white },
  h2: { fontFamily: FONT.display, fontSize: 26, color: C.white, marginTop: 16, marginBottom: 6, lineHeight: 32 },
  sub: { color: C.whiteA6, fontSize: 14, lineHeight: 21, marginBottom: 16 },
  field: { marginBottom: 14 },
  fieldLabel: {
    fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: C.whiteA6,
    marginBottom: 6, fontFamily: FONT.uiSemiBold,
  },
  input: {
    borderWidth: 1.5, borderColor: C.auburn, backgroundColor: C.auburn24, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, color: C.white, fontFamily: FONT.ui,
  },
  inputBad: { borderColor: C.gold, backgroundColor: 'rgba(210,145,51,0.10)' },
  req: { color: C.gold },
  errTxt: { color: C.gold, fontSize: 12, marginTop: 5, fontFamily: FONT.ui },
  scaleBlock: {
    backgroundColor: C.auburn24, borderWidth: 1, borderColor: C.auburn40, borderRadius: 18,
    padding: 16, marginBottom: 14,
  },
  scaleTitle: { fontSize: 15, color: C.white, fontFamily: FONT.uiSemiBold, marginBottom: 2 },
  scaleHint: { fontSize: 12.5, color: C.whiteA6, marginBottom: 12, lineHeight: 18 },
  scaleRow: { flexDirection: 'row', gap: 8 },
  scaleBtn: {
    flex: 1, aspectRatio: 1, maxHeight: 54, borderRadius: 12, borderWidth: 1.5, borderColor: C.auburn,
    backgroundColor: C.black, alignItems: 'center', justifyContent: 'center',
  },
  scaleBtnOn: { backgroundColor: C.gold, borderColor: C.gold },
  scaleBtnTxt: { fontFamily: FONT.display, fontSize: 18, color: C.white73 },
  scaleBtnTxtOn: { color: C.black },
  scaleEnds: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 },
  scaleEnd: { fontSize: 11, color: C.white73 },
  seg: { flexDirection: 'row', backgroundColor: C.auburn24, borderRadius: 14, padding: 4, gap: 4 },
  segBtn: { flex: 1, paddingVertical: 12, borderRadius: 11, alignItems: 'center' },
  segBtnOn: { backgroundColor: C.auburn },
  segTxt: { fontSize: 14, color: C.whiteA6, fontFamily: FONT.uiSemiBold },
  segTxtOn: { color: C.white },
  card: {
    backgroundColor: C.auburn24, borderWidth: 1, borderColor: C.auburn40, borderRadius: 18,
    padding: 16, marginTop: 12,
  },
  checkRow: { flexDirection: 'row', gap: 12, paddingVertical: 8, alignItems: 'flex-start' },
  checkBox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.auburn,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  checkBoxOn: { backgroundColor: C.gold, borderColor: C.gold },
  checkMark: { color: C.black, fontSize: 14, fontWeight: '700' },
  checkTxt: { flex: 1, color: C.white, fontSize: 13.5, lineHeight: 20 },
});
