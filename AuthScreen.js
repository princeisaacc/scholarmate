import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  SafeAreaView, StatusBar, ActivityIndicator, KeyboardAvoidingView,
  Platform, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { signUpWithEmail, signInWithEmail, resetPassword, createUserProfile, getUserProfile, signInWithGoogle } from './firebase';

const OWL_IMAGE = require('./assets/owl.png');

// Configure Google Sign-In once at module level
GoogleSignin.configure({
  webClientId: '426165904591-buihe37nqlakik7ig03rbvlg7t01e3la.apps.googleusercontent.com',
  offlineAccess: false,
});

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('welcome'); // welcome, login, signup, forgot
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // ─── GOOGLE SIGN IN ───────────────────────────────────────────────────────
  async function handleGoogleSignIn() {
    setLoading(true); setError('');
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      await GoogleSignin.signOut(); // clear any previous session for clean flow
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo?.data?.idToken || userInfo?.idToken;
      if (!idToken) {
        setError('Google sign-in failed: no token received. Please try again.');
        setLoading(false);
        return;
      }
      const user = await signInWithGoogle(idToken);
      const existing = await getUserProfile(user.uid);
      if (!existing) {
        await createUserProfile(user.uid, {
          name: user.displayName || 'Student',
          email: user.email,
          level: '',
          profilePic: user.photoURL || null,
          authProvider: 'google',
        });
        onAuth(user, true); // new user — needs onboarding
      } else {
        onAuth(user, false); // existing user — go to app
      }
    } catch (e) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED) {
        // user cancelled — no error message needed
      } else if (e.code === statusCodes.IN_PROGRESS) {
        setError('Sign-in already in progress. Please wait.');
      } else if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setError('Google Play Services not available on this device.');
      } else {
        setError('Google sign-in failed. Please try again.');
        console.warn('Google sign-in error:', e.message);
      }
    }
    setLoading(false);
  }

  async function handleLogin() {
    if (!email.trim() || !password.trim()) { setError('Please enter your email and password.'); return; }
    setLoading(true); setError('');
    try {
      const user = await signInWithEmail(email.trim(), password);
      const profile = await getUserProfile(user.uid);
      if (profile?.banned) { setError('Your account has been suspended. Contact support.'); setLoading(false); return; }
      onAuth(user, false);
    } catch (e) {
      const msg = e.code || e.message || '';
      if (msg.includes('user-not-found') || msg.includes('wrong-password') || msg.includes('invalid-credential')) {
        setError('Incorrect email or password.');
      } else if (msg.includes('invalid-email')) {
        setError('Please enter a valid email address.');
      } else if (msg.includes('too-many-requests')) {
        setError('Too many attempts. Please try again later.');
      } else if (msg.includes('network-request-failed')) {
        setError('No internet connection. Please check your network.');
      } else {
        setError('Login failed. Please check your connection.');
      }
    }
    setLoading(false);
  }

  function isValidEmail(email) {
    return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email.trim());
  }

  async function handleSignUp() {
    if (!isValidEmail(email)) { setError('Please enter a valid email address (e.g. name@gmail.com).'); return; }
    if (!name.trim()) { setError('Please enter your name.'); return; }
    if (!email.trim()) { setError('Please enter your email.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setLoading(true); setError('');
    try {
      const user = await signUpWithEmail(email.trim(), password);
      await createUserProfile(user.uid, {
        name: name.trim(),
        email: email.trim(),
        level: '',
        profilePic: null,
        authProvider: 'email',
      });
      onAuth(user, true); // needs onboarding
    } catch (e) {
      const msg = e.code;
      if (msg === 'auth/email-already-in-use') {
        setError('An account with this email already exists. Please login.');
      } else if (msg === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else if (msg === 'auth/weak-password') {
        setError('Password is too weak. Use at least 6 characters.');
      } else {
        setError('Sign up failed. Please check your connection.');
      }
    }
    setLoading(false);
  }

  async function handleForgotPassword() {
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      await resetPassword(email.trim());
      setSuccess('Password reset email sent! Check your inbox.');
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        setError('No account found with this email.');
      } else {
        setError('Failed to send reset email. Try again.');
      }
    }
    setLoading(false);
  }

  // ─── GOOGLE BUTTON ────────────────────────────────────────────────────────
  const GoogleButton = ({ label }) => (
    <TouchableOpacity
      style={{ width: '100%', backgroundColor: '#fff', borderRadius: 16, paddingVertical: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 14, elevation: 2 }}
      onPress={handleGoogleSignIn}
      disabled={loading}
    >
      {/* Google G icon */}
      <View style={{ width: 20, height: 20 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: '#4285F4' }}>G</Text>
      </View>
      <Text style={{ fontSize: 15, fontWeight: '700', color: '#1F2937' }}>{label}</Text>
    </TouchableOpacity>
  );

  // ─── WELCOME SCREEN ───────────────────────────────────────────────────────
  if (mode === 'welcome') {
    return (
      <View style={{ flex: 1, backgroundColor: '#1E1B4B' }}>
        <StatusBar barStyle="light-content" backgroundColor="#1E1B4B" />
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          {/* Logo */}
          <View style={{ width: 110, height: 110, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 24, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' }}>
            <Image source={OWL_IMAGE} style={{ width: 80, height: 80 }} resizeMode="contain" />
          </View>
          <Text style={{ fontSize: 36, fontWeight: '800', color: '#fff', letterSpacing: 0.5, marginBottom: 8 }}>ScholarMate</Text>
          <Text style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 24, marginBottom: 8 }}>
            Your AI-powered study companion
          </Text>
          <View style={{ backgroundColor: 'rgba(79,70,229,0.3)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 48, borderWidth: 1, borderColor: 'rgba(79,70,229,0.5)' }}>
            <Text style={{ fontSize: 12, color: '#A5B4FC', fontWeight: '600' }}>Built by a student, for students 🎓</Text>
          </View>

          {/* Google Sign In */}
          <GoogleButton label="Continue with Google" />

          {/* Email Login */}
          <TouchableOpacity
            style={{ width: '100%', backgroundColor: '#4F46E5', borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 14, elevation: 4 }}
            onPress={() => setMode('login')}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Login with Email</Text>
          </TouchableOpacity>

          {/* Sign Up */}
          <TouchableOpacity
            style={{ width: '100%', borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)' }}
            onPress={() => setMode('signup')}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Create Account</Text>
          </TouchableOpacity>

          {loading && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', borderRadius: 20 }}>
              <ActivityIndicator color="#fff" size="large" />
            </View>
          )}
        </SafeAreaView>
      </View>
    );
  }

  // ─── SHARED FORM UI ───────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#1E1B4B' }}>
      <StatusBar barStyle="light-content" backgroundColor="#1E1B4B" />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24 }} keyboardShouldPersistTaps="handled">

            {/* Back button */}
            <TouchableOpacity onPress={() => { setMode('welcome'); setError(''); setSuccess(''); }} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>

            {/* Header */}
            <Text style={{ fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 6 }}>
              {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create account' : 'Reset password'}
            </Text>
            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 36, lineHeight: 22 }}>
              {mode === 'login' ? 'Login to continue your studies' : mode === 'signup' ? 'Join thousands of UNILAG students' : 'Enter your email to reset your password'}
            </Text>

            {/* Error / Success */}
            {!!error && (
              <View style={{ backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
                <Text style={{ fontSize: 13, color: '#EF4444', flex: 1 }}>{error}</Text>
              </View>
            )}
            {!!success && (
              <View style={{ backgroundColor: 'rgba(34,197,94,0.15)', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="checkmark-circle-outline" size={16} color="#22C55E" />
                <Text style={{ fontSize: 13, color: '#22C55E', flex: 1 }}>{success}</Text>
              </View>
            )}

            {/* Google button on login/signup screens too */}
            {mode !== 'forgot' && (
              <>
                <GoogleButton label={mode === 'login' ? 'Continue with Google' : 'Sign up with Google'} />
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.15)' }} />
                  <Text style={{ color: 'rgba(255,255,255,0.4)', marginHorizontal: 12, fontSize: 12 }}>or</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.15)' }} />
                </View>
              </>
            )}

            {/* Name field (signup only) */}
            {mode === 'signup' && (
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>Full Name</Text>
                <View style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
                  <Ionicons name="person-outline" size={18} color="rgba(255,255,255,0.4)" />
                  <TextInput
                    style={{ flex: 1, paddingVertical: 16, paddingHorizontal: 12, fontSize: 15, color: '#fff' }}
                    placeholder="Your full name"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                  />
                </View>
              </View>
            )}

            {/* Email field */}
            <View style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>Email Address</Text>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
                <Ionicons name="mail-outline" size={18} color="rgba(255,255,255,0.4)" />
                <TextInput
                  style={{ flex: 1, paddingVertical: 16, paddingHorizontal: 12, fontSize: 15, color: '#fff' }}
                  placeholder="your@email.com"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>
            </View>

            {/* Password field */}
            {mode !== 'forgot' && (
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>Password</Text>
                <View style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
                  <Ionicons name="lock-closed-outline" size={18} color="rgba(255,255,255,0.4)" />
                  <TextInput
                    style={{ flex: 1, paddingVertical: 16, paddingHorizontal: 12, fontSize: 15, color: '#fff' }}
                    placeholder="Min. 6 characters"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="rgba(255,255,255,0.4)" />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Confirm password (signup only) */}
            {mode === 'signup' && (
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>Confirm Password</Text>
                <View style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, borderWidth: 1, borderColor: confirmPassword && confirmPassword !== password ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.15)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
                  <Ionicons name="lock-closed-outline" size={18} color="rgba(255,255,255,0.4)" />
                  <TextInput
                    style={{ flex: 1, paddingVertical: 16, paddingHorizontal: 12, fontSize: 15, color: '#fff' }}
                    placeholder="Repeat your password"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                  />
                </View>
              </View>
            )}

            {/* Forgot password link */}
            {mode === 'login' && (
              <TouchableOpacity onPress={() => { setMode('forgot'); setError(''); }} style={{ alignSelf: 'flex-end', marginBottom: 24 }}>
                <Text style={{ fontSize: 13, color: '#A5B4FC', fontWeight: '600' }}>Forgot password?</Text>
              </TouchableOpacity>
            )}

            {/* Submit button */}
            <TouchableOpacity
              style={{ backgroundColor: loading ? 'rgba(79,70,229,0.5)' : '#4F46E5', borderRadius: 16, paddingVertical: 18, alignItems: 'center', marginTop: mode === 'login' ? 0 : 10, elevation: 4, shadowColor: '#4F46E5', shadowOpacity: 0.4, shadowOffset: { width: 0, height: 6 }, shadowRadius: 14 }}
              onPress={mode === 'login' ? handleLogin : mode === 'signup' ? handleSignUp : handleForgotPassword}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>
                    {mode === 'login' ? 'Login' : mode === 'signup' ? 'Create Account' : 'Send Reset Email'}
                  </Text>
              }
            </TouchableOpacity>

            {/* Switch mode */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 }}>
              <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
                {mode === 'login' ? "Don't have an account? " : mode === 'signup' ? 'Already have an account? ' : 'Remember your password? '}
              </Text>
              <TouchableOpacity onPress={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccess(''); }}>
                <Text style={{ fontSize: 14, color: '#A5B4FC', fontWeight: '700' }}>
                  {mode === 'login' ? 'Sign Up' : 'Login'}
                </Text>
              </TouchableOpacity>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}