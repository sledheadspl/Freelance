import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';

import { Button, Field } from '@/components/ui';
import { colors, spacing } from '@/lib/theme';
import { useAuthStore } from '@/stores/authStore';

const schema = z.object({
  displayName: z.string().min(1, 'Enter your name').max(60),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});
type FormValues = z.infer<typeof schema>;

export default function SignUpScreen() {
  const signUp = useAuthStore((s) => s.signUp);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await signUp(values.email.trim(), values.password, values.displayName.trim());
      // With "Confirm email" ON in Supabase, no session exists until the link
      // is clicked. With it OFF, the auth listener signs the user straight in.
      Alert.alert(
        'Account created',
        'If email confirmation is enabled, check your inbox for a confirmation link, then sign in.',
      );
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Could not create account.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <View style={styles.header}>
          <Text style={styles.logo}>🔥 FireReady</Text>
          <Text style={styles.subtitle}>Create your account</Text>
        </View>

        <View style={styles.form}>
          <Controller
            control={control}
            name="displayName"
            render={({ field: { onChange, value } }) => (
              <Field
                label="Your name"
                value={value}
                onChangeText={onChange}
                error={errors.displayName?.message}
                placeholder="Alex Rivera"
                autoComplete="name"
              />
            )}
          />
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, value } }) => (
              <Field
                label="Email"
                value={value}
                onChangeText={onChange}
                error={errors.email?.message}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="you@example.com"
              />
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, value } }) => (
              <Field
                label="Password"
                value={value}
                onChangeText={onChange}
                error={errors.password?.message}
                secureTextEntry
                autoComplete="new-password"
                placeholder="At least 8 characters"
              />
            )}
          />

          {serverError ? <Text style={styles.serverError}>{serverError}</Text> : null}

          <Button title="Create Account" onPress={handleSubmit(onSubmit)} loading={isSubmitting} />

          <Text style={styles.switchText}>
            Already have an account?{' '}
            <Link href="/(auth)/sign-in" style={styles.link}>
              Sign in
            </Link>
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.lg, justifyContent: 'center', gap: spacing.xl },
  header: { alignItems: 'center', gap: spacing.sm },
  logo: { fontSize: 32, fontWeight: '700', color: colors.primary },
  subtitle: { fontSize: 15, color: colors.textSecondary },
  form: { gap: spacing.md },
  serverError: { color: colors.danger, textAlign: 'center' },
  switchText: { textAlign: 'center', color: colors.textSecondary, fontSize: 14 },
  link: { color: colors.primary, fontWeight: '600' },
});
