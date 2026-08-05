import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Link } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button, Card, Field, StatusBadge } from '@/components/ui';
import { colors, spacing } from '@/lib/theme';
import { useAuthStore } from '@/stores/authStore';
import { useFamilyStore } from '@/stores/familyStore';

export default function FamilyScreen() {
  const { family, members, loading, refresh, createFamily, joinFamily, leaveFamily } =
    useFamilyStore();
  const session = useAuthStore((s) => s.session);
  const [familyName, setFamilyName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>, failureTitle: string) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      Alert.alert(failureTitle, e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    if (!family) return;
    await Clipboard.setStringAsync(family.invite_code);
    Alert.alert('Copied', 'Invite code copied to clipboard.');
  };

  const shareCode = async () => {
    if (!family) return;
    await Share.share({
      message: `Join my family "${family.name}" on FireReady! Open the app, choose "Join a Family", and enter code: ${family.invite_code}`,
    });
  };

  const confirmLeave = () => {
    Alert.alert('Leave family?', 'You will stop sharing check-ins with this group.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => run(leaveFamily, 'Could not leave family'),
      },
    ]);
  };

  // ---- No family yet: create or join ----
  if (!family) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.sectionTitle}>Create a family</Text>
          <Field
            label="Family name"
            value={familyName}
            onChangeText={setFamilyName}
            placeholder="The Riveras"
          />
          <Button
            title="Create Family"
            loading={busy}
            disabled={!familyName.trim()}
            onPress={() =>
              run(() => createFamily(familyName.trim()), 'Could not create family')
            }
          />
        </Card>

        <Text style={styles.orText}>— or —</Text>

        <Card>
          <Text style={styles.sectionTitle}>Join a family</Text>
          <Field
            label="Invite code"
            value={inviteCode}
            onChangeText={setInviteCode}
            placeholder="e.g. 7KQ2XW"
            autoCapitalize="characters"
          />
          <Button
            title="Join Family"
            variant="secondary"
            loading={busy}
            disabled={!inviteCode.trim()}
            onPress={() => run(() => joinFamily(inviteCode.trim()), 'Could not join family')}
          />
        </Card>
      </ScrollView>
    );
  }

  // ---- Has a family: invite code + roster ----
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
    >
      <Card>
        <Text style={styles.familyName}>{family.name}</Text>
        <Text style={styles.cardLabel}>Invite code — share it to add family members</Text>
        <View style={styles.codeRow}>
          <Text style={styles.code}>{family.invite_code}</Text>
          <Pressable onPress={copyCode} hitSlop={8}>
            <Ionicons name="copy-outline" size={22} color={colors.primary} />
          </Pressable>
          <Pressable onPress={shareCode} hitSlop={8}>
            <Ionicons name="share-outline" size={22} color={colors.primary} />
          </Pressable>
        </View>
      </Card>

      <Text style={styles.sectionTitle}>
        Members ({members.length})
      </Text>
      {members.map((m) => (
        <Card key={m.user_id} style={styles.memberCard}>
          <View style={styles.memberRow}>
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>
                {m.profile.display_name || 'Unnamed member'}
                {m.user_id === session?.user.id ? ' (you)' : ''}
              </Text>
              <Text style={styles.memberRole}>{m.role === 'owner' ? 'Owner' : 'Member'}</Text>
            </View>
            {m.checkin ? (
              <View style={styles.memberStatus}>
                <StatusBadge status={m.checkin.status} />
                <Text style={styles.timestamp}>
                  {new Date(m.checkin.updated_at).toLocaleDateString()}
                </Text>
              </View>
            ) : (
              <Text style={styles.timestamp}>No check-in yet</Text>
            )}
          </View>
        </Card>
      ))}

      <Link href="/(app)/profile" asChild>
        <Button title="My Profile & Home Address" variant="secondary" onPress={() => {}} />
      </Link>
      <Button title="Leave Family" variant="danger" onPress={confirmLeave} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  orText: { textAlign: 'center', color: colors.textSecondary },
  familyName: { fontSize: 22, fontWeight: '700', color: colors.text },
  cardLabel: { fontSize: 13, color: colors.textSecondary },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  code: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 4,
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  memberCard: { paddingVertical: spacing.sm },
  memberRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  memberInfo: { gap: 2 },
  memberName: { fontSize: 16, fontWeight: '600', color: colors.text },
  memberRole: { fontSize: 12, color: colors.textSecondary },
  memberStatus: { alignItems: 'flex-end', gap: 2 },
  timestamp: { fontSize: 12, color: colors.textSecondary },
});
