import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { EmptyState } from '@/components/ui';
import { colors, radius, spacing } from '@/lib/theme';
import { useChecklistStore } from '@/stores/checklistStore';
import { useFamilyStore } from '@/stores/familyStore';
import type { ChecklistItem } from '@/types';

export default function ChecklistScreen() {
  const family = useFamilyStore((s) => s.family);
  const { items, fetch, addItem, toggleItem, deleteItem } = useChecklistStore();
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (family) fetch(family.id);
    }, [family, fetch]),
  );

  const add = async () => {
    if (!family || !newTitle.trim()) return;
    setAdding(true);
    try {
      await addItem(family.id, newTitle.trim());
      setNewTitle('');
    } catch (e) {
      Alert.alert('Could not add item', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setAdding(false);
    }
  };

  const confirmDelete = (item: ChecklistItem) => {
    Alert.alert('Delete item?', `“${item.title}” will be removed for the whole family.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteItem(item.id) },
    ]);
  };

  if (!family) {
    return (
      <View style={styles.centered}>
        <EmptyState
          icon="checkbox-outline"
          title="No family group yet"
          body="The preparedness checklist is shared with your family. Set up your family group first from the Family tab."
        />
      </View>
    );
  }

  const doneCount = items.filter((i) => i.is_done).length;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {items.length > 0 && (
        <Text style={styles.progress}>
          {doneCount} of {items.length} done
        </Text>
      )}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon="list-outline"
            title="Checklist is empty"
            body="Add preparedness tasks below — go-bags, documents, medications, pet carriers, evacuation plan."
          />
        }
        renderItem={({ item }) => (
          <View style={styles.itemRow}>
            <Pressable style={styles.itemMain} onPress={() => toggleItem(item)} hitSlop={4}>
              <Ionicons
                name={item.is_done ? 'checkbox' : 'square-outline'}
                size={24}
                color={item.is_done ? colors.safe : colors.textSecondary}
              />
              <Text style={[styles.itemTitle, item.is_done && styles.itemTitleDone]}>
                {item.title}
              </Text>
            </Pressable>
            <Pressable onPress={() => confirmDelete(item)} hitSlop={8}>
              <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
        )}
      />

      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          placeholder="Add an item (e.g. Pack go-bag)"
          placeholderTextColor={colors.textSecondary}
          value={newTitle}
          onChangeText={setNewTitle}
          onSubmitEditing={add}
          returnKeyType="done"
        />
        <Pressable
          style={[styles.addButton, (!newTitle.trim() || adding) && { opacity: 0.5 }]}
          onPress={add}
          disabled={!newTitle.trim() || adding}
        >
          <Ionicons name="add" size={26} color={colors.white} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  progress: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    color: colors.textSecondary,
    fontSize: 13,
  },
  list: { padding: spacing.md, gap: spacing.xs, flexGrow: 1 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: spacing.sm,
  },
  itemMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemTitle: { fontSize: 16, color: colors.text, flex: 1 },
  itemTitleDone: { textDecorationLine: 'line-through', color: colors.textSecondary },
  addRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  addInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
