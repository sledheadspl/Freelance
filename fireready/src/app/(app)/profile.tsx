import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';

import { Button, Card, Field } from '@/components/ui';
import { geocodeAddress } from '@/lib/location';
import { colors, spacing } from '@/lib/theme';
import { useAuthStore } from '@/stores/authStore';

/**
 * Basic profile: display name + saved home address. The address is geocoded
 * on save; its coordinates drive the alerts filter and the default
 * evacuation route destination.
 */
export default function ProfileScreen() {
  const { profile, updateProfile, signOut } = useAuthStore();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [address, setAddress] = useState(profile?.home_address ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      let coords = null;
      if (address.trim()) {
        coords = await geocodeAddress(address.trim());
        if (!coords) {
          Alert.alert(
            'Address not found',
            'Saved anyway, but we could not turn that address into map coordinates. Alerts and default routes need coordinates — try a more complete address.',
          );
        }
      }
      await updateProfile({
        display_name: name.trim(),
        home_address: address.trim() || null,
        home_lat: coords?.latitude ?? null,
        home_lng: coords?.longitude ?? null,
      });
      Alert.alert('Saved', 'Your profile has been updated.');
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Field label="Display name" value={name} onChangeText={setName} placeholder="Alex Rivera" />
        <Field
          label="Home address"
          value={address}
          onChangeText={setAddress}
          placeholder="123 Canyon Rd, Los Angeles, CA"
          autoComplete="street-address"
        />
        <Text style={styles.hint}>
          Your home address is used to show nearby alerts and as the default evacuation route
          destination. It is only visible to your family.
        </Text>
        <Button title="Save" onPress={save} loading={saving} />
      </Card>

      <Button title="Sign Out" variant="danger" onPress={signOut} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md },
  hint: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
});
