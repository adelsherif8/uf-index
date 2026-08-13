// Settings — profile, sound, reminder, and the DPDP promise: delete everything.
import React, { useState } from 'react';
import { Text, Switch, Alert, View, StyleSheet, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, FONT } from '../lib/theme';
import { useNav } from '../lib/nav';
import { useStore } from '../lib/store';
import { ScreenShell, Btn, H2, Sub, Field, Card, Seg } from '../components/ui';
import { setSound, getSound, vib } from '../lib/fx';
import { scheduleWeeklyReminder, cancelReminders } from '../lib/notify';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { exportMyData, deleteMyAccount, isConfigured } from '../lib/api';
import { resetSyncState, unsyncedCount } from '../lib/sync';

export function SettingsScreen() {
  const nav = useNav();
  const { state, patch } = useStore();
  const [name, setName] = useState(state.profile.name);
  const [email, setEmail] = useState(state.profile.email);
  const [sound, setSoundState] = useState(getSound());

  const deleteAll = () => {
    Alert.alert(
      'Delete everything?',
      'All your check-ins, scores, streaks, and profile are removed from this phone. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete my data', style: 'destructive',
          onPress: async () => {
            // Server first. If it fails we stop — the promise is that the data
            // is really gone, and wiping only the phone would be a lie.
            const serverOk = await deleteMyAccount();
            if (!serverOk) {
              Alert.alert(
                'Could not delete',
                'We could not reach the server to delete your data, so nothing was removed. Check your connection and try again.',
              );
              return;
            }
            await AsyncStorage.clear().catch(() => {});
            await resetSyncState();
            await cancelReminders();
            patch({
              profile: { name: '', email: '', age: '', organization: '', gender: 'male' },
              consents: { clause: false, coach: false, social: false },
              records: [], plus: null, onboarded: false,
            });
            vib.heavy();
            nav.go('splash');
          },
        },
      ],
    );
  };

  return (
    <ScreenShell onBack={() => nav.go('dashboard')} stepLabel="Settings"
      cta={<Btn label="Save" onPress={() => { patch({ profile: { ...state.profile, name, email } }); nav.go('dashboard'); }} />}>
      <H2>Settings</H2>
      <Sub>Everything lives on this phone in v1 — nothing leaves it.</Sub>
      <Field label="Full name" value={name} onChange={setName} />
      <Field label="Email" value={email} onChange={setEmail} keyboard="email-address" />
      <Card>
        <View style={st.row}>
          <Text style={st.rowTxt}>Sounds</Text>
          <Switch value={sound}
            onValueChange={v => { setSoundState(v); setSound(v); vib.tick(); }}
            trackColor={{ false: C.auburn24, true: C.gold35 }} thumbColor={sound ? C.gold : C.white73} />
        </View>
        <View style={st.row}>
          <Text style={st.rowTxt}>Weekly reminder · Sun 6:00 pm</Text>
          <Switch value={state.reminderOn}
            onValueChange={async v => {
              vib.tick(); patch({ reminderOn: v });
              if (v) await scheduleWeeklyReminder(); else await cancelReminders();
            }}
            trackColor={{ false: C.auburn24, true: C.gold35 }} thumbColor={state.reminderOn ? C.gold : C.white73} />
        </View>
      </Card>
      <Card>
        <Text style={[st.rowTxt, { marginBottom: 8 }]}>Language</Text>
        <Seg options={[['en', 'English'], ['hi', 'हिंदी']]} value={state.lang}
          onChange={v => patch({ lang: v as 'en' | 'hi' })} />
        <Text style={[st.rowTxt, { marginVertical: 8 }]}>Units</Text>
        <Seg options={[['metric', 'kg · cm'], ['imperial', 'lb · in']]} value={state.unitSystem}
          onChange={v => patch({ unitSystem: v as 'metric' | 'imperial' })} />
      </Card>
      <Card>
        <Text style={st.about}>UF Index · Phase 1 · formula proto-1{'\n'}Your data is never sold, never shared without consent, and deletable in one tap — built for India's DPDP Act.{'\n\n'}Disclaimer: UF Index is a wellness self-assessment, not a medical device or medical advice. Scores describe energy and lifestyle patterns — consult a qualified professional for health concerns.</Text>
        <Pressable onPress={() => nav.go('privacy')}>
          <Text style={{ color: C.gold, fontSize: 12.5, marginTop: 10, fontFamily: FONT.uiSemiBold }}>Read the full privacy policy →</Text>
        </Pressable>
      </Card>
      <Btn label="Console mode · kiosk" variant="ghost" style={{ marginTop: 16 }} onPress={() => {
        Alert.alert(
          'Enter console mode?',
          'The app becomes the walk-up kiosk: attract screen, assessment, ticket, QR handoff, auto-reset. Results are NOT saved to your history. Exit: tap the top-left corner 5 times.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Enter', onPress: () => { patch({ consoleMode: true }); nav.go('console'); } },
          ],
        );
      }} />
      <Btn label="Export my data (JSON)" variant="ghost" style={{ marginTop: 10 }} onPress={async () => {
        try {
          const server = await exportMyData().catch(() => null);
          const payload = { exportedAt: new Date().toISOString(), onThisPhone: state, onTheServer: server };
          const path = `${FileSystem.cacheDirectory}uf-index-export.json`;
          await FileSystem.writeAsStringAsync(path, JSON.stringify(payload, null, 2));
          if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path, { mimeType: 'application/json' });
        } catch {}
      }} />
      <Btn label="Delete all my data" variant="ghost" onPress={deleteAll} style={{ marginTop: 10 }} />
      <Text style={st.syncNote}>
        {!isConfigured()
          ? `Stored on this phone only \u2014 ${state.records.length} check-in${state.records.length === 1 ? '' : 's'}.`
          : unsyncedCount(state.records) === 0
            ? 'All check-ins backed up.'
            : `${unsyncedCount(state.records)} check-in${unsyncedCount(state.records) === 1 ? '' : 's'} waiting to back up.`}
      </Text>
    </ScreenShell>
  );
}

const st = StyleSheet.create({
  syncNote: {
    fontFamily: FONT.ui, fontSize: 12, color: C.white73,
    marginTop: 14, textAlign: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  rowTxt: { color: C.white, fontSize: 14, fontFamily: FONT.ui },
  about: { color: C.whiteA6, fontSize: 12.5, lineHeight: 19 },
});
