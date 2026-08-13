// Weekly reminder. Scheduled on the device, and — once signed in — the push
// token is registered server-side so the backend can nudge people whose phone
// has been closed all week, which a local schedule can never do.
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { registerDevice } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false, shouldSetBadge: false,
    shouldShowBanner: true, shouldShowList: true,
  }),
});

export async function scheduleWeeklyReminder(): Promise<boolean> {
  try {
    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return false;
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Time to recharge',
        body: 'Your weekly check-in is ready. Two minutes keeps your streak alive.',
        data: { go: 'profile' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: 1, // Sunday
        hour: 18, minute: 0,
      },
    });
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Streak on the line',
        body: 'Your charge streak ends at midnight. Drop a token before bed.',
        data: { go: 'profile' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: 1, hour: 21, minute: 30,
      },
    });
    await registerPush();
    return true;
  } catch { return false; }
}

/**
 * Hand the backend an Expo push token. Silent no-op for guests, for builds with
 * no backend, and in Expo Go — which cannot issue push tokens at all, so this
 * only ever does something in a real APK / TestFlight build.
 */
export async function registerPush(): Promise<void> {
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return;
    await registerDevice(token, Platform.OS === 'ios' ? 'ios' : 'android',
      Constants.expoConfig?.version);
  } catch {
    // Expo Go, no permission, or offline — the local schedule still works.
  }
}

export async function cancelReminders(): Promise<void> {
  try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch {}
}
