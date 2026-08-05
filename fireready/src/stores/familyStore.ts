import { create } from 'zustand';

import { supabase } from '@/lib/supabase';
import type { CheckinStatus, Family, MemberWithStatus, Profile } from '@/types';

interface FamilyState {
  family: Family | null;
  members: MemberWithStatus[];
  loading: boolean;
  /** Loads the user's family (if any) plus members and their latest check-ins. */
  refresh: () => Promise<void>;
  createFamily: (name: string) => Promise<void>;
  joinFamily: (inviteCode: string) => Promise<void>;
  leaveFamily: () => Promise<void>;
  /** Live map updates: re-fetches members whenever anyone in the family checks in. */
  subscribeToCheckins: () => () => void;
}

export const useFamilyStore = create<FamilyState>((set, get) => ({
  family: null,
  members: [],
  loading: false,

  refresh: async () => {
    set({ loading: true });
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        set({ family: null, members: [] });
        return;
      }

      // Phase 1: one family per user (enforced by a unique constraint).
      const { data: membership } = await supabase
        .from('family_members')
        .select('family_id')
        .eq('user_id', auth.user.id)
        .maybeSingle();

      if (!membership) {
        set({ family: null, members: [] });
        return;
      }

      const [{ data: family }, { data: rows }, { data: checkins }] = await Promise.all([
        supabase.from('families').select('*').eq('id', membership.family_id).single(),
        supabase
          .from('family_members')
          .select('user_id, role, profiles(*)')
          .eq('family_id', membership.family_id),
        supabase.from('checkin_status').select('*').eq('family_id', membership.family_id),
      ]);

      const checkinByUser = new Map(
        ((checkins ?? []) as CheckinStatus[]).map((c) => [c.user_id, c]),
      );
      const members: MemberWithStatus[] = (rows ?? []).map((row) => ({
        user_id: row.user_id,
        role: row.role,
        profile: row.profiles as unknown as Profile,
        checkin: checkinByUser.get(row.user_id) ?? null,
      }));

      set({ family: (family as Family) ?? null, members });
    } finally {
      set({ loading: false });
    }
  },

  createFamily: async (name) => {
    const { error } = await supabase.rpc('create_family', { family_name: name });
    if (error) throw error;
    await get().refresh();
  },

  joinFamily: async (inviteCode) => {
    const { error } = await supabase.rpc('join_family_with_code', { code: inviteCode });
    if (error) throw error;
    await get().refresh();
  },

  leaveFamily: async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { error } = await supabase.from('family_members').delete().eq('user_id', auth.user.id);
    if (error) throw error;
    set({ family: null, members: [] });
  },

  subscribeToCheckins: () => {
    const familyId = get().family?.id;
    if (!familyId) return () => {};

    const channel = supabase
      .channel(`checkins:${familyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'checkin_status', filter: `family_id=eq.${familyId}` },
        () => get().refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
}));
