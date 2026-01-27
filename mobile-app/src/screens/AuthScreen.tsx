import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  Keyboard,
  TouchableWithoutFeedback,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth } from '../contexts/AuthContext';

// App icon
const AppIcon = require('../../assets/icon.png');

type AuthMode = 'signIn' | 'signUp';

interface AuthScreenProps {
  onAuthSuccess?: () => void;
}

export default function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  const { signIn, signUp, signInWithGoogle, signInWithApple, loading } = useAuth();

  const [mode, setMode] = useState<AuthMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);

  // Check Apple auth availability
  React.useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setIsAppleAvailable);
  }, []);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleEmailAuth = async () => {
    setError(null);
    Keyboard.dismiss();

    // Validation
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }
    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }
    if (!password) {
      setError('Please enter your password');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (mode === 'signUp' && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      if (mode === 'signUp') {
        const { error } = await signUp(email, password);
        if (error) {
          setError(error.message);
        } else {
          Alert.alert(
            'Check Your Email',
            'We sent you a confirmation link. Please check your email to verify your account.',
            [{ text: 'OK' }]
          );
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) {
          setError(error.message);
        } else {
          onAuthSuccess?.();
        }
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    }
  };

  const handleGoogleAuth = async () => {
    setError(null);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        if (error.message !== 'Sign in cancelled') {
          setError(error.message);
        }
      } else {
        onAuthSuccess?.();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google');
    }
  };

  const handleAppleAuth = async () => {
    setError(null);
    try {
      const { error } = await signInWithApple();
      if (error) {
        if (error.message !== 'Sign in cancelled') {
          setError(error.message);
        }
      } else {
        onAuthSuccess?.();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Apple');
    }
  };

  const switchMode = () => {
    setMode(mode === 'signIn' ? 'signUp' : 'signIn');
    setError(null);
    setConfirmPassword('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Logo Section */}
            <View style={styles.logoSection}>
              <Image source={AppIcon} style={styles.logoImage} />
              <Text style={styles.logoTitle}>Stack Tracker Gold</Text>
              <Text style={styles.logoSubtitle}>Make Stacking Great Again</Text>
            </View>

            {/* Tab Selector */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tab, mode === 'signIn' && styles.tabActive]}
                onPress={() => { setMode('signIn'); setError(null); }}
              >
                <Text style={[styles.tabText, mode === 'signIn' && styles.tabTextActive]}>
                  Sign In
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, mode === 'signUp' && styles.tabActive]}
                onPress={() => { setMode('signUp'); setError(null); }}
              >
                <Text style={[styles.tabText, mode === 'signUp' && styles.tabTextActive]}>
                  Sign Up
                </Text>
              </TouchableOpacity>
            </View>

            {/* Error Message */}
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Email Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="your@email.com"
                placeholderTextColor="#52525b"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                editable={!loading}
              />
            </View>

            {/* Password Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#52525b"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
                autoComplete={mode === 'signUp' ? 'password-new' : 'password'}
                editable={!loading}
              />
            </View>

            {/* Confirm Password (Sign Up only) */}
            {mode === 'signUp' && (
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Confirm Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor="#52525b"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  textContentType="newPassword"
                  editable={!loading}
                />
              </View>
            )}

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleEmailAuth}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#18181b" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {mode === 'signIn' ? 'Sign In' : 'Create Account'}
                </Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Social Auth Buttons */}
            <View style={styles.socialButtons}>
              {/* Google Button */}
              <TouchableOpacity
                style={styles.socialButton}
                onPress={handleGoogleAuth}
                disabled={loading}
              >
                <View style={styles.googleIconContainer}>
                  <Text style={styles.googleG}>G</Text>
                </View>
                <Text style={styles.socialButtonText}>Continue with Google</Text>
              </TouchableOpacity>

              {/* Apple Button (iOS only) - Native Apple Sign In Button */}
              {Platform.OS === 'ios' && isAppleAvailable && (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                  cornerRadius={12}
                  style={styles.appleNativeButton}
                  onPress={handleAppleAuth}
                />
              )}
            </View>

            {/* Switch Mode Link */}
            <View style={styles.switchContainer}>
              <Text style={styles.switchText}>
                {mode === 'signIn' ? "Don't have an account? " : 'Already have an account? '}
              </Text>
              <TouchableOpacity onPress={switchMode} disabled={loading}>
                <Text style={styles.switchLink}>
                  {mode === 'signIn' ? 'Sign Up' : 'Sign In'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Privacy Note */}
            <View style={styles.privacyNote}>
              <Text style={styles.privacyText}>
                Your portfolio data stays on your device.{'\n'}
                Account sync is optional and encrypted.
              </Text>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoImage: {
    width: 80,
    height: 80,
    borderRadius: 16,
    marginBottom: 16,
  },
  logoTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#e4e4e7',
    marginBottom: 4,
  },
  logoSubtitle: {
    fontSize: 14,
    color: '#71717a',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#18181b',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: '#fbbf24',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#71717a',
  },
  tabTextActive: {
    color: '#18181b',
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    color: '#a1a1aa',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#e4e4e7',
    fontSize: 16,
  },
  primaryButton: {
    backgroundColor: '#fbbf24',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#18181b',
    fontSize: 16,
    fontWeight: '700',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  dividerText: {
    color: '#71717a',
    fontSize: 13,
    marginHorizontal: 16,
  },
  socialButtons: {
    gap: 12,
    marginBottom: 24,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 12,
  },
  googleIconContainer: {
    width: 20,
    height: 20,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleG: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4285F4',
  },
  socialButtonText: {
    color: '#e4e4e7',
    fontSize: 15,
    fontWeight: '600',
  },
  appleNativeButton: {
    width: '100%',
    height: 50,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
  },
  switchText: {
    color: '#71717a',
    fontSize: 14,
  },
  switchLink: {
    color: '#fbbf24',
    fontSize: 14,
    fontWeight: '600',
  },
  privacyNote: {
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  privacyText: {
    color: '#52525b',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
