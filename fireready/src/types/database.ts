// Row types mirroring supabase/schema.sql. Keep these in sync with the SQL —
// if you change a table, change its type here too.

export type CheckinStatusValue = 'safe' | 'evacuating' | 'needs_help';

export type FamilyRole = 'owner' | 'member';

export interface Profile {
  id: string; // matches auth.users.id
  display_name: string;
  home_address: string | null;
  home_lat: number | null;
  home_lng: number | null;
  expo_push_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface Family {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  created_at: string;
}

export interface FamilyMember {
  family_id: string;
  user_id: string;
  role: FamilyRole;
  joined_at: string;
}

export interface ChecklistItem {
  id: string;
  family_id: string;
  title: string;
  notes: string | null;
  assigned_to: string | null; // null = whole-family item
  is_done: boolean;
  completed_by: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
}

export interface CheckinStatus {
  user_id: string;
  family_id: string;
  status: CheckinStatusValue;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  message: string | null;
  updated_at: string;
}

export interface CheckinHistoryEntry {
  id: string;
  user_id: string;
  family_id: string;
  status: CheckinStatusValue;
  lat: number | null;
  lng: number | null;
  message: string | null;
  created_at: string;
}

/** A family member joined with their profile and latest check-in, as shown on the map and member list. */
export interface MemberWithStatus {
  user_id: string;
  role: FamilyRole;
  profile: Profile;
  checkin: CheckinStatus | null;
}
