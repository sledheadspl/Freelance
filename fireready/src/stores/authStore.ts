import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { registerForPushNotifications } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  /** True until the persisted session has been loaded — root layout waits on it. */
  initializing: boolean;
  initialize: () => void;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  initializing: true,

  // Called once from the root layout. Restores any persisted session and
  // keeps the store in sync with future auth changes (token refresh, sign-out).
  initialize: () => {
    supabase.auth.getSession().then(({ data }) => {
      set({ session: data.session, initializing: false });
      if (data.session) {
        get().refreshProfile();
        registerForPushNotifications(data.session.user.id);
      }
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session });
      if (session) {
        get().refreshProfile();
      } else {
        set({ profile: null });
      }
    });
  },

  signUp: async (email, password, displayName) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      // Lands in raw_user_meta_data, which the handle_new_user trigger copies
      // into profiles.display_name.
      options: { data: { display_name: displayName } },
    });
    if (error) throw error;
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const userId = get().session?.user.id;
    if (userId) registerForPushNotifications(userId);
  },

  signOut: async () => {
    await supabase.auth.signOut();
  },

  refreshProfile: async () => {
    const userId = get().session?.user.id;
    if (!userId) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) set({ profile: data as Profile });
  },

  updateProfile: async (patch) => {
    const userId = get().session?.user.id;
    if (!userId) return;
    const { error } = await supabase
      .from('profiles')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) throw error;
    await get().refreshProfile();
  },
}));
