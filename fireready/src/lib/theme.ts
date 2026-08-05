import type { AlertSeverity, CheckinStatusValue } from '@/types';

export const colors = {
  primary: '#B3261E', // FireReady red
  primaryDark: '#8C1D18',
  background: '#FFFFFF',
  surface: '#F4F4F5',
  border: '#E4E4E7',
  text: '#18181B',
  textSecondary: '#71717A',
  white: '#FFFFFF',
  danger: '#DC2626',
  safe: '#16A34A',
  evacuating: '#D97706',
  needsHelp: '#DC2626',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16 } as const;

export const statusMeta: Record<
  CheckinStatusValue,
  { label: string; color: string; icon: 'shield-checkmark' | 'walk' | 'warning' }
> = {
  safe: { label: 'Safe', color: colors.safe, icon: 'shield-checkmark' },
  evacuating: { label: 'Evacuating', color: colors.evacuating, icon: 'walk' },
  needs_help: { label: 'Needs Help', color: colors.needsHelp, icon: 'warning' },
};

export const severityMeta: Record<AlertSeverity, { label: string; color: string }> = {
  advisory: { label: 'Advisory', color: '#2563EB' },
  watch: { label: 'Watch', color: colors.evacuating },
  warning: { label: 'Warning', color: colors.danger },
};
