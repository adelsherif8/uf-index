// Privacy policy & disclaimer — lives inside the app, works offline, no browser.
// Same text as the public page (required by the stores) so the two can't drift.
import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { C, FONT } from '../lib/theme';
import { useNav } from '../lib/nav';
import { ScreenShell, Btn, H2, Card } from '../components/ui';

export const POLICY_VERSION = 'privacy-v1.0';

const SECTIONS: { h: string; p?: string; bullets?: string[] }[] = [
  {
    h: '1 · What we collect',
    bullets: [
      'Profile: name, email, phone, age, gender, organization.',
      'Body measurements: weight, height, neck, waist, hip — used to estimate body composition.',
      'Wellness answers: perceived energy, body feeling, sleep quality and hours; and for UF Index Plus, your WHO-5, PSS-10 and PSQI answers.',
      'Your results: UF Index scores, bands, and history.',
    ],
    p: 'Nothing is collected from other apps or services. In this version, all of it is stored on your own device only.',
  },
  {
    h: '2 · How it is used',
    bullets: [
      'To calculate your UF Index and Plus scores.',
      'To show your history, streaks, and personalized insights.',
      'To share results with a UFAS coach — only if you granted coach visibility and requested coaching.',
      'To feature your transformation on UFAS social media — only if you granted that separate, optional consent.',
    ],
    p: 'Never sold. Never used for third-party advertising. Never shared without a consent you can point to.',
  },
  {
    h: '3 · Consent, recorded properly',
    p: 'Every consent you give — clause approval, coach visibility, social media — is recorded with its policy version and timestamp, as required by India’s Digital Personal Data Protection Act (DPDP). Optional consents can be withdrawn any time without losing access to the app.',
  },
  {
    h: '4 · Your rights',
    bullets: [
      'Access & portability: export your complete data as a file from Settings.',
      'Correction: delete any individual check-in and redo it.',
      'Erasure: “Delete all my data” removes everything, immediately and permanently.',
    ],
  },
  {
    h: '5 · Storage & security',
    p: 'This version stores all data locally on your device — nothing is sent to UFAS servers. When cloud sync launches, data will be encrypted in transit and at rest with access controls, and this policy will be updated with a new version number before anything changes.',
  },
  {
    h: '7 · Children',
    p: 'UF Index is intended for users aged 16 and above. Programs for younger participants run only with guardian or institutional consent under a separate agreement.',
  },
  {
    h: '8 · Contact',
    p: 'Questions, requests, or complaints about your data: privacy@ufaslive.com · UFAS · ufaslive.com',
  },
];

export function PrivacyScreen() {
  const nav = useNav();
  return (
    <ScreenShell
      onBack={() => nav.go('settings')}
      stepLabel="Privacy"
      cta={<Btn label="Back" variant="ghost" onPress={() => nav.go('settings')} />}
    >
      <H2>Privacy Policy &amp; Disclaimer</H2>
      <Text style={pv.meta}>{POLICY_VERSION} · Effective August 2026 · UF Index app and web assessment</Text>

      <Card style={{ marginTop: 4 }}>
        <Text style={pv.leadTitle}>The short version</Text>
        <Text style={pv.body}>
          Your health data exists to calculate your UF Index and nothing else. It is never sold, never used for
          advertising, and never shared without your explicit consent. You can see it, export it, and delete it —
          permanently — at any time.
        </Text>
      </Card>

      {SECTIONS.map(s => (
        <View key={s.h} style={{ marginTop: 22 }}>
          <Text style={pv.h}>{s.h}</Text>
          {s.bullets?.map(b => (
            <View key={b} style={pv.bulletRow}>
              <Text style={pv.dot}>·</Text>
              <Text style={[pv.body, { flex: 1 }]}>{b}</Text>
            </View>
          ))}
          {s.p ? <Text style={[pv.body, s.bullets ? { marginTop: 8 } : null]}>{s.p}</Text> : null}
        </View>
      ))}

      <Text style={[pv.h, { marginTop: 22 }]}>6 · Disclaimer — not medical advice</Text>
      <Card style={{ marginTop: 6, borderColor: C.gold }}>
        <Text style={pv.body}>
          UF Index is a wellness self-assessment tool, not a medical device. Scores, bands, and insights describe
          energy and lifestyle patterns based on your own answers and standard wellness questionnaires (WHO-5,
          PSS-10, PSQI). They are not a diagnosis, treatment, or medical advice, and are not a substitute for
          consultation with a qualified healthcare professional. If you have concerns about your health, sleep, or
          mental wellbeing, please consult a doctor.
        </Text>
      </Card>

      <Text style={pv.foot}>UFAS · UF Index · {POLICY_VERSION}</Text>
    </ScreenShell>
  );
}

const pv = StyleSheet.create({
  meta: { color: C.white73, fontSize: 12, marginBottom: 10 },
  leadTitle: { color: C.gold, fontSize: 14, fontFamily: FONT.uiSemiBold, marginBottom: 6 },
  h: { color: C.gold, fontFamily: FONT.display, fontSize: 17, marginBottom: 6 },
  body: { color: C.whiteA6, fontSize: 13.5, lineHeight: 21 },
  bulletRow: { flexDirection: 'row', gap: 8, marginTop: 5 },
  dot: { color: C.gold, fontSize: 15, lineHeight: 21 },
  foot: { color: C.white73, fontSize: 11.5, marginTop: 28, textAlign: 'center' },
});
