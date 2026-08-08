// Local weekly reminder — no server, scheduled on the device.
import * as Notifications from 'expo-notifications';

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
    return true;
  } catch { return false; }
}

export async function cancelReminders(): Promise<void> {
  try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch {}
}
