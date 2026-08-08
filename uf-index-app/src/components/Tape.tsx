// Draggable tape-measure input + live parametric silhouette — ports of the prototype.
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, PanResponder, StyleSheet } from 'react-native';
import Svg, { Circle, Path, Ellipse } from 'react-native-svg';
import { C, FONT } from '../lib/theme';
import { play, vib } from '../lib/fx';

export const Tape = React.memo(function Tape(props: {
  label: string; value: number; min: number; max: number;
  onChange: (v: number) => void;
  onActive?: (active: boolean) => void;
  unit?: string;        // display label, default 'cm'
  pxPerUnit?: number;   // default 9 (cm); use ~22 for inches
  step?: number;        // default 0.5
  numEvery?: number;    // major tick spacing, default 5
}) {
  const { label, value, min, max, onChange, onActive } = props;
  const unit = props.unit ?? 'cm';
  const PX_PER_CM = props.pxPerUnit ?? 9;
  const step = props.step ?? 0.5;
  const numEvery = props.numEvery ?? 5;
  const [width, setWidth] = useState(0);
  const startVal = useRef(value);
  const lastInt = useRef(Math.round(value));
  const valueRef = useRef(value);
  valueRef.current = value;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 4,
      onPanResponderGrant: () => {
        startVal.current = valueRef.current;
        lastInt.current = Math.round(valueRef.current);
        onActive?.(true);
      },
      onPanResponderMove: (_e, g) => {
        let v = startVal.current - g.dx / PX_PER_CM;
        v = Math.min(max, Math.max(min, Math.round(v * 2) / 2));
        if (v !== valueRef.current) {
          onChange(v);
          const iv = Math.round(v);
          if (iv !== lastInt.current) { lastInt.current = iv; vib.tick(); play('tick'); }
        }
      },
      onPanResponderRelease: () => onActive?.(false),
      onPanResponderTerminate: () => onActive?.(false),
    }),
  ).current;

  const ticks = useMemo(() => {
    const arr: { cm: number; major: boolean }[] = [];
    for (let cm = Math.ceil(min); cm <= max; cm++) arr.push({ cm, major: cm % numEvery === 0 });
    return arr;
  }, [min, max, numEvery]);

  const offset = width / 2 - (value - min) * PX_PER_CM;

  return (
    <View style={ts.wrap}>
      <View style={ts.head}>
        <Text style={ts.label}>{label}</Text>
        <Text style={ts.value}>{value.toFixed(2).replace(/\.?0+$/, '')} <Text style={ts.unit}>{unit}</Text></Text>
      </View>
      <View
        style={ts.tape}
        onLayout={e => setWidth(e.nativeEvent.layout.width)}
        {...pan.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`${label}, ${value} ${unit}`}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={e => {
          const delta = e.nativeEvent.actionName === 'increment' ? step : -step;
          onChange(Math.min(max, Math.max(min, valueRef.current + delta)));
        }}
      >
        <View style={[ts.strip, { transform: [{ translateX: offset }] }]}>
          {ticks.map(t => (
            <View key={t.cm} style={[ts.tickWrap, { left: (t.cm - min) * PX_PER_CM }]}>
              <View style={[ts.tick, t.major && ts.tickMajor]} />
              {t.major ? <Text style={ts.tickNum}>{t.cm}</Text> : null}
            </View>
          ))}
        </View>
        <View style={ts.needle} pointerEvents="none" />
      </View>
    </View>
  );
});

/** Live silhouette — neck/waist/hip widths track the tape values. */
export const Silhouette = React.memo(function Silhouette(props: { neck: number; waist: number; hip: number; active: 'neck' | 'waist' | 'hip' | null }) {
  const lerp = (v: number, a: number, b: number, c: number, d: number) =>
    c + (Math.min(b, Math.max(a, v)) - a) / (b - a) * (d - c);
  const nw = lerp(props.neck, 20, 60, 5.5, 15);
  const ww = lerp(props.waist, 40, 180, 8, 27);
  const hw = lerp(props.hip, 50, 200, 10, 30);
  const sw = Math.max(nw + 9, 17);
  const side = (sgn: number) =>
    `M ${50 + sgn * nw} 26 C ${50 + sgn * (nw + 3)} 31 ${50 + sgn * sw} 33 ${50 + sgn * sw} 40 ` +
    `C ${50 + sgn * (sw - 1)} 50 ${50 + sgn * ww} 54 ${50 + sgn * ww} 62 ` +
    `C ${50 + sgn * ww} 70 ${50 + sgn * hw} 74 ${50 + sgn * hw} 82 L ${50 + sgn * (hw - 5)} 140`;
  const zone: Record<string, { cy: number; rx: number }> = {
    neck: { cy: 28, rx: nw + 3 }, waist: { cy: 62, rx: ww + 3 }, hip: { cy: 82, rx: hw + 3 },
  };
  return (
    <View style={{ alignItems: 'center', marginBottom: 6 }}>
      <Svg width={110} height={150} viewBox="0 0 100 150">
        <Circle cx={50} cy={15} r={10} stroke={C.whiteA6} strokeWidth={2.4} fill="none" />
        <Path d={side(-1)} stroke={C.whiteA6} strokeWidth={2.4} fill="none" strokeLinecap="round" />
        <Path d={side(1)} stroke={C.whiteA6} strokeWidth={2.4} fill="none" strokeLinecap="round" />
        <Path d="M 50 86 L 46.5 140 M 50 86 L 53.5 140" stroke={C.whiteA6} strokeWidth={2.4} fill="none" strokeLinecap="round" />
        {props.active && (
          <Ellipse
            cx={50} cy={zone[props.active].cy} rx={zone[props.active].rx} ry={4.5}
            stroke={C.gold} strokeWidth={2} fill="none"
          />
        )}
      </Svg>
    </View>
  );
});

const ts = StyleSheet.create({
  wrap: { marginBottom: 16 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  label: { fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', color: C.white, fontFamily: FONT.uiSemiBold },
  value: { fontFamily: FONT.display, fontSize: 22, color: C.gold },
  unit: { fontSize: 12, color: C.whiteA6, fontFamily: FONT.ui },
  tape: {
    height: 64, borderRadius: 16, borderWidth: 1.5, borderColor: C.auburn,
    backgroundColor: C.auburn24, overflow: 'hidden',
  },
  strip: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 4000 },
  tickWrap: { position: 'absolute', bottom: 8, alignItems: 'center', width: 1 },
  tick: { width: 1.5, height: 13, backgroundColor: C.white73 },
  tickMajor: { height: 22, backgroundColor: C.gold, width: 2 },
  tickNum: {
    position: 'absolute', top: -22, width: 40, textAlign: 'center',
    color: C.whiteA6, fontSize: 11, fontFamily: FONT.display,
  },
  needle: {
    position: 'absolute', top: 4, bottom: 4, left: '50%', width: 3, marginLeft: -1.5,
    backgroundColor: C.gold, borderRadius: 2,
  },
});
