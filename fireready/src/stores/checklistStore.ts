import { create } from 'zustand';

import { supabase } from '@/lib/supabase';
import type { ChecklistItem } from '@/types';

interface ChecklistState {
  items: ChecklistItem[];
  loading: boolean;
  fetch: (familyId: string) => Promise<void>;
  addItem: (familyId: string, title: string, notes?: string) => Promise<void>;
  toggleItem: (item: ChecklistItem) => Promise<void>;
  deleteItem: (itemId: string) => Promise<void>;
}

export const useChecklistStore = create<ChecklistState>((set, get) => ({
  items: [],
  loading: false,

  fetch: async (familyId) => {
    set({ loading: true });
    try {
      const { data } = await supabase
        .from('checklist_items')
        .select('*')
        .eq('family_id', familyId)
        .order('is_done', { ascending: true })
        .order('created_at', { ascending: false });
      set({ items: (data ?? []) as ChecklistItem[] });
    } finally {
      set({ loading: false });
    }
  },

  addItem: async (familyId, title, notes) => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { error } = await supabase.from('checklist_items').insert({
      family_id: familyId,
      title,
      notes: notes || null,
      created_by: auth.user.id,
    });
    if (error) throw error;
    await get().fetch(familyId);
  },

  toggleItem: async (item) => {
    const { data: auth } = await supabase.auth.getUser();
    const done = !item.is_done;

    // Optimistic update so the checkbox responds instantly.
    set({
      items: get().items.map((i) => (i.id === item.id ? { ...i, is_done: done } : i)),
    });

    const { error } = await supabase
      .from('checklist_items')
      .update({
        is_done: done,
        completed_by: done ? auth.user?.id : null,
        completed_at: done ? new Date().toISOString() : null,
      })
      .eq('id', item.id);
    if (error) await get().fetch(item.family_id); // roll back to server truth
  },

  deleteItem: async (itemId) => {
    const prev = get().items;
    set({ items: prev.filter((i) => i.id !== itemId) });
    const { error } = await supabase.from('checklist_items').delete().eq('id', itemId);
    if (error) set({ items: prev });
  },
}));
