import { Ionicons } from '@expo/vector-icons';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, EmptyState, StatusBadge } from '@/components/ui';
import { colors, radius, spacing, statusMeta } from '@/lib/theme';
import { useCheckinStore } from '@/stores/checkinStore';
import { useFamilyStore } from '@/stores/familyStore';
import type { CheckinStatusValue } from '@/types';

const STATUSES: CheckinStatusValue[] = ['safe', 'evacuating', 'needs_help'];

export default function CheckInScreen() {
  const family = useFamilyStore((s) => s.family);
  const { myStatus, submitting, fetchMyStatus, checkIn } = useCheckinStore();
  const [selected, setSelected] = useState<CheckinStatusValue | null>(null);
  const [message, setMessage] = useState('');

  useFocusEffect(
    useCallback(() => {
      fetchMyStatus();
    }, [fetchMyStatus]),
  );

  const submit = async () => {
    if (!selected) return;
    try {
      const { hadLocation } = await checkIn(selected, message.trim());
      setSelected(null);
      setMessage('');
      Alert.alert(
        'Checked in',
        hadLocation
          ? 'Your family has been notified and can see your location on the map.'
          : 'Your family has been notified. Location was unavailable, so the map will show your last known position.',
      );
    } catch (e) {
      Alert.alert('Check-in failed', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  if (!family) {
    return (
      <View style={styles.centered}>
        <EmptyState
          icon="people-outline"
          title="No family group yet"
          body="Check-ins are shared with your family group. Create one or join with an invite code first."
        />
        <Link href="/(app)/family" asChild>
          <Button title="Set Up Family" onPress={() => {}} />
        </Link>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {myStatus && (
        <Card>
          <Text style={styles.cardLabel}>Your current status</Text>
          <View style={styles.currentRow}>
            <StatusBadge status={myStatus.status} />
            <Text style={styles.timestamp}>
              {new Date(myStatus.updated_at).toLocaleString()}
            </Text>
          </View>
          {myStatus.message ? <Text style={styles.message}>“{myStatus.message}”</Text> : null}
        </Card>
      )}

      <Text style={styles.prompt}>How are you doing?</Text>

      <View style={styles.statusButtons}>
        {STATUSES.map((status) => {
          const meta = statusMeta[status];
          const active = selected === status;
          return (
            <Pressable
              key={status}
              onPress={() => setSelected(status)}
              style={[
                styles.statusButton,
                { borderColor: meta.color },
                active && { backgroundColor: meta.color },
              ]}
            >
              <Ionicons name={meta.icon} size={28} color={active ? colors.white : meta.color} />
              <Text style={[styles.statusLabel, { color: active ? colors.white : meta.color }]}>
                {meta.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextInput
        style={styles.messageInput}
        placeholder="Optional message (e.g. “Heading to Grandma's”)"
        placeholderTextColor={colors.textSecondary}
        value={message}
        onChangeText={setMessage}
        multiline
      />

      <Button
        title="Check In"
        onPress={submit}
        loading={submitting}
        disabled={!selected}
      />
      <Text style={styles.hint}>
        Your location is captured once when you check in and shared only with your family.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md },
  centered: { flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  cardLabel: { fontSize: 13, color: colors.textSecondary },
  currentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  timestamp: { fontSize: 13, color: colors.textSecondary },
  message: { fontSize: 15, color: colors.text, fontStyle: 'italic' },
  prompt: { fontSize: 20, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  statusButtons: { flexDirection: 'row', gap: spacing.sm },
  statusButton: {
    flex: 1,
    borderWidth: 2,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusLabel: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  messageInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    minHeight: 70,
    fontSize: 15,
    color: colors.text,
    textAlignVertical: 'top',
  },
  hint: { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
});
