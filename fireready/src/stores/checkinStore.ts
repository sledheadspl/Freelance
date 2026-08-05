import { create } from 'zustand';

import { captureCurrentLocation } from '@/lib/location';
import { sendPushToTokens } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { statusMeta } from '@/lib/theme';
import { useFamilyStore } from '@/stores/familyStore';
import type { CheckinStatus, CheckinStatusValue } from '@/types';

interface CheckinState {
  myStatus: CheckinStatus | null;
  submitting: boolean;
  fetchMyStatus: () => Promise<void>;
  /**
   * The core check-in flow: capture GPS position, upsert the status row
   * (the DB trigger appends to checkin_history), then push-notify the family.
   * Returns true if a location was captured with the check-in.
   */
  checkIn: (status: CheckinStatusValue, message?: string) => Promise<{ hadLocation: boolean }>;
}

export const useCheckinStore = create<CheckinState>((set, get) => ({
  myStatus: null,
  submitting: false,

  fetchMyStatus: async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data } = await supabase
      .from('checkin_status')
      .select('*')
      .eq('user_id', auth.user.id)
      .maybeSingle();
    set({ myStatus: (data as CheckinStatus) ?? null });
  },

  checkIn: async (status, message) => {
    const familyStore = useFamilyStore.getState();
    const family = familyStore.family;
    const { data: auth } = await supabase.auth.getUser();
    if (!family || !auth.user) {
      throw new Error('Join or create a family before checking in.');
    }

    set({ submitting: true });
    try {
      const location = await captureCurrentLocation();

      const { data, error } = await supabase
        .from('checkin_status')
        .upsert({
          user_id: auth.user.id,
          family_id: family.id,
          status,
          lat: location?.latitude ?? null,
          lng: location?.longitude ?? null,
          accuracy: location?.accuracy ?? null,
          message: message || null,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      set({ myStatus: data as CheckinStatus });

      // Notify everyone else in the family (best-effort, see lib/notifications).
      const me = familyStore.members.find((m) => m.user_id === auth.user!.id);
      const myName = me?.profile.display_name || 'A family member';
      const tokens = familyStore.members
        .filter((m) => m.user_id !== auth.user!.id)
        .map((m) => m.profile.expo_push_token)
        .filter((t): t is string => !!t);
      await sendPushToTokens(
        tokens,
        `${myName} is ${statusMeta[status].label}`,
        message || `${myName} updated their status in ${family.name}.`,
      );

      return { hadLocation: location !== null };
    } finally {
      set({ submitting: false });
    }
  },
}));
