import { initializeApp, getApps, getApp } from 'firebase/app';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  initializeAuth, getAuth, getReactNativePersistence,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail, onAuthStateChanged as _onAuthStateChanged,
  signOut as _signOut, GoogleAuthProvider, signInWithCredential,
  sendEmailVerification,
} from 'firebase/auth';
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, collection,
  query, orderBy, getDocs, serverTimestamp, increment, addDoc, arrayUnion, where, deleteDoc, limit,
} from 'firebase/firestore';

// Load from environment variables
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();


// ─── AUTH INITIALIZATION ──────────────────────────────────────────────────────
let _auth = null;
export function getAuthInstance() {
  if (!_auth) {
    try {
      if (Platform.OS === 'web') {
        _auth = initializeAuth(app);
      } else {
        _auth = initializeAuth(app, {
          persistence: getReactNativePersistence(AsyncStorage)
        });
      }
    } catch (e) {
      console.error('AUTH ERROR:', e.message, e.code, e.name);
      _auth = getAuth(app);
    }
  }
  return _auth;
}

const db = getFirestore(app);

// ─── API KEYS ─────────────────────────────────────────────────────────────────
const _KEYS_STORAGE_KEY = '@sm_api_keys_cache';
let _apiKeysCache = null;
let _apiKeysFetchedAt = null;
const API_KEYS_TTL = 5 * 60 * 60 * 1000;

export async function fetchApiKeys() {
  if (_apiKeysCache && _apiKeysFetchedAt && (Date.now() - _apiKeysFetchedAt < API_KEYS_TTL)) return _apiKeysCache;
  // Load from AsyncStorage first (works offline / after reboot)
  if (!_apiKeysCache) {
    try {
      const stored = await AsyncStorage.getItem(_KEYS_STORAGE_KEY);
      if (stored) _apiKeysCache = JSON.parse(stored);
    } catch (_) {}
  }
  try {
    const snap = await getDoc(doc(db, 'config', 'apikeys'));
    if (snap.exists()) {
      _apiKeysCache = snap.data();
      _apiKeysFetchedAt = Date.now();
      AsyncStorage.setItem(_KEYS_STORAGE_KEY, JSON.stringify(_apiKeysCache)).catch(() => {});
      return _apiKeysCache;
    }
  } catch (e) { console.warn('fetchApiKeys error:', e.message, '— using cache'); }
  return _apiKeysCache || {};
}

export function getCachedApiKeys() { return _apiKeysCache || {}; }

// ─── EMAILJS CONFIG — read from Firestore apiKeys at runtime ─────────────────
function getEmailJSConfig() {
  const k = getCachedApiKeys();
  return {
    serviceId: k.emailjsServiceId || '',
    templateId: k.emailjsTemplateId || '',
    publicKey: k.emailjsPublicKey || '',
  };
}

async function sendEmailViaEmailJS(toEmail, toName, subject, message) {
  try {
    let keys = getCachedApiKeys();
    if (!keys.emailjsServiceId || !keys.emailjsTemplateId || !keys.emailjsPublicKey) {
      keys = await fetchApiKeys();
    }
    if (!keys.emailjsServiceId || !keys.emailjsTemplateId || !keys.emailjsPublicKey) {
      console.warn('❌ EmailJS keys missing from Firestore config/apikeys');
      return false;
    }
    const payload = {
      service_id: keys.emailjsServiceId,
      template_id: keys.emailjsTemplateId,
      user_id: keys.emailjsPublicKey,
      template_params: {
        to_email: toEmail,
        to_name: toName || 'Scholar',
        subject,
        message,
        from_name: 'ScholarMate',
        reply_to: 'princeconsult411@gmail.com',
      },
    };
    if (keys.emailjsPrivateKey) payload.accessToken = keys.emailjsPrivateKey;
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const txt = await response.text();
    if (response.status === 200) { console.log('✅ EmailJS sent to:', toEmail); return true; }
    console.warn('❌ EmailJS failed:', response.status, txt);
    return false;
  } catch (e) {
    console.warn('❌ EmailJS error:', e.message);
    return false;
  }
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────

export async function signUpWithEmail(email, password) {
const result = await createUserWithEmailAndPassword(getAuthInstance(), email, password);
return result.user;
}

export async function signInWithEmail(email, password) {
const result = await signInWithEmailAndPassword(getAuthInstance(), email, password);
return result.user;
}

export async function signOut() {
await _signOut(getAuthInstance());
}

export async function resetPassword(email) {
await sendPasswordResetEmail(getAuthInstance(), email);
}

export async function resendVerificationEmail(user) {
// Email verification removed — only format validation is enforced
}

export function getCurrentUser() {
return getAuthInstance().currentUser;
}

export function onAuthStateChanged(callback) {
return _onAuthStateChanged(getAuthInstance(), callback);
}

export async function signInWithGoogle(idToken) {
const credential = GoogleAuthProvider.credential(idToken);
const result = await signInWithCredential(getAuthInstance(), credential);
return result.user;
}

// ─── FIRESTORE USER PROFILE ───────────────────────────────────────────────────

export async function createUserProfile(uid, data) {
// Generate referralCode immediately at signup — this is the KEY fix.
// Without this, the referralCode field never exists in Firestore
// and anyone entering this user's code will always get "not found".
const referralCode = 'REF-' + uid.substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, 'X') + uid.substring(4, 8).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
await setDoc(doc(db, 'users', uid), {
    ...data,
    referralCode,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastActiveAt: serverTimestamp(),
    isAdmin: false,
    isPro: false,
    isviewer: false,
    banned: false,
    streak: 0,
    totalQuizzes: 0,
    totalFlashcards: 0,
    totalChats: 0,
    totalLibraryUploads: 0,
    appVersion: '4.0',
    platform: 'android',
    courses: data.courses || [],
    level: data.level || '',
    onboardingComplete: false,
    points: 0,
    pointsHistory: [],
});
}

export async function getUserProfile(uid) {
const snap = await getDoc(doc(db, 'users', uid));
return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updateUserProfile(uid, data) {
await updateDoc(doc(db, 'users', uid), {
    ...data,
    updatedAt: serverTimestamp(),
});
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────

export async function getAllUsers(limitCount = 500) {
const snap = await getDocs(query(
    collection(db, 'users'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
));
return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function setUserPro(uid, isPro) {
await updateDoc(doc(db, 'users', uid), { isPro, updatedAt: serverTimestamp() });
}

export async function setUserAdmin(uid, isAdmin) {
await updateDoc(doc(db, 'users', uid), { isAdmin, updatedAt: serverTimestamp() });
}

export async function banUser(uid) {
await updateDoc(doc(db, 'users', uid), { banned: true, updatedAt: serverTimestamp() });
}

// ─── APP CONFIG ───────────────────────────────────────────────────────────────

export async function getAppConfig() {
try {
    const snap = await getDoc(doc(db, 'config', 'app'));
    return snap.exists() ? snap.data() : getDefaultConfig();
} catch (e) {
    return getDefaultConfig();
}
}

export async function updateAppConfig(data) {
await setDoc(doc(db, 'config', 'app'), data, { merge: true });
}

function getDefaultConfig() {
return {
    imageUpload: true,
    pdfUpload: true,
    voiceInput: true,
    quizGeneration: true,
    flashcardGeneration: true,
    maintenanceMode: false,
    announcement: '',
};
}

// ─── LOGS & STATS ─────────────────────────────────────────────────────────────

export async function logAdminEventCloud(type, detail, adminUid) {
await addDoc(collection(db, 'adminLogs'), {
    type, detail, adminUid, timestamp: serverTimestamp(),
});
}

export async function incrementUserStat(uid, field) {
await updateDoc(doc(db, 'users', uid), {
    [field]: increment(1),
    updatedAt: serverTimestamp(),
});
}

let _coursesCache = null;
export async function getActiveCourses(forceRefresh = false) {
if (_coursesCache && _coursesCache.length > 0 && !forceRefresh) return _coursesCache;
try {
    const snap = await getDocs(collection(db, 'courses'));
    const result = snap.docs
    .filter(d => d.data().isActive !== false)
    .map(d => ({ id: d.id, ...d.data() }));
    _coursesCache = result.length > 0 ? result : null;
    return result;
    } catch (e) {
    _coursesCache = null;
    return [];
    }
}

// Save user's selected course IDs to their Firestore profile
export async function saveUserCourses(uid, courseIds) {
try {
    await updateDoc(doc(db, 'users', uid), {
    courses: courseIds,
    updatedAt: serverTimestamp(),
    });
} catch (e) { console.warn('saveUserCourses error:', e.message); }
}

export async function awardPoints(uid, amount, reason) {
try {
    await updateDoc(doc(db, 'users', uid), {
    points: increment(amount),
    pointsHistory: arrayUnion({ amount, reason, at: new Date().toISOString() }),
    });
} catch (e) {}
}

export async function updateLastActive(uid) {
try {
    await updateDoc(doc(db, 'users', uid), { lastActiveAt: serverTimestamp() });
} catch (e) {}
}

export async function savePushToken(uid, token) {
try {
    await updateDoc(doc(db, 'users', uid), {
    pushToken: token,
    pushTokenUpdatedAt: serverTimestamp(),
    });
} catch (e) {}
}

export async function sendPushToUser(uid, { title, body, data = {} }) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const token = snap.data()?.pushToken;
    if (!token || !token.startsWith('ExponentPushToken')) return;
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ to: token, title, body, data, sound: 'default', priority: 'high' }),
    });
  } catch (e) { console.warn('sendPushToUser error:', e.message); }
}

export async function getNotifications(uid) {
try {
    const snap = await getDocs(query(collection(db, 'notifications'), orderBy('createdAt', 'desc')));
    const seenKey = `@seen_notifications_${uid}`;
    let seen = [];
    try { const raw = await AsyncStorage.getItem(seenKey); seen = raw ? JSON.parse(raw) : []; } catch (_) {}
    const all = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(n => n.target === 'all' || n.target === uid)
    .filter(n => !seen.includes(n.id));
    // Save seen
    const newSeen = [...seen, ...all.map(n => n.id)];
    try { await AsyncStorage.setItem(seenKey, JSON.stringify(newSeen)); } catch (_) {}
    return all;
} catch (e) { return []; }
}

export async function getNotificationBank() {
try {
    const snap = await getDocs(collection(db, 'notificationBank'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
} catch (e) { return []; }
}

// ─── LIMITS ───────────────────────────────────────────────────────────────────

const _LIMITS_STORAGE_KEY = '@sm_limits_cache';
let _limitsMemCache = null;

export async function getLimitsConfig() {
  try {
    const snap = await getDoc(doc(db, 'config', 'limits'));
    if (snap.exists()) {
      const data = snap.data();
      _limitsMemCache = data;
      AsyncStorage.setItem(_LIMITS_STORAGE_KEY, JSON.stringify(data)).catch(() => {});
      return data;
    }
  } catch (e) { console.warn('getLimitsConfig error:', e.message); }
  if (_limitsMemCache) return _limitsMemCache;
  try {
    const stored = await AsyncStorage.getItem(_LIMITS_STORAGE_KEY);
    if (stored) { _limitsMemCache = JSON.parse(stored); return _limitsMemCache; }
  } catch (_) {}
  return getDefaultLimits();
}

export function getDefaultLimits() {
  return {
    free_imageUploads: 8, pro_imageUploads: 24,
    free_libraryUploads: 8, pro_libraryUploads: 24,
    free_aiGenerations: 10, pro_aiGenerations: 30,
    free_flashcards: 10, pro_flashcards: 30,
    free_quizzes: 10, pro_quizzes: 30,
    free_webSearch: 5, pro_webSearch: 15,
    free_imageGen: 5, pro_imageGen: 20,
  };
}

export async function updateLimitsConfig(data) {
await setDoc(doc(db, 'config', 'limits'), data, { merge: true });
}

// ─── MODELS CONFIG ────────────────────────────────────────────────────────────

export function getDefaultModelsConfig() {
return {
    chat:               'openai/gpt-oss-20b',
    chatFallback:       'openai/gpt-oss-120b',
    generation:         'openai/gpt-oss-120b',
    generationFallback: 'openai/gpt-oss-20b',
    vision:             'qwen/qwen3.6-27b',
    visionFallback:     'meta-llama/llama-4-scout-17b-16e-instruct',
};
}

export async function getModelsConfig() {
try {
    const snap = await getDoc(doc(db, 'config', 'models'));
    if (snap.exists()) return { ...getDefaultModelsConfig(), ...snap.data() };
    return getDefaultModelsConfig();
} catch (e) {
    return getDefaultModelsConfig();
}
}

export async function updateModelsConfig(data) {
await setDoc(doc(db, 'config', 'models'), data, { merge: true });
}

// ─── ACCESS KEYS ──────────────────────────────────────────────────────────────

export async function generateAccessKey(durationDays, createdBy) {
try {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const key = `SCH-${seg()}-${seg()}-${seg()}`.toUpperCase();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);
    const ref = await addDoc(collection(db, 'accessKeys'), {
    key,
    durationDays,
    expiresAt: expiresAt.toISOString(),
    used: false,
    usedBy: null,
    usedAt: null,
    createdAt: serverTimestamp(),
    createdBy: createdBy || 'admin',
    });
    return { id: ref.id, key, expiresAt: expiresAt.toISOString() };
} catch (e) {
    throw new Error('Could not generate key: ' + e.message);
}
}

export async function redeemAccessKey(keyString, uid) {
try {
    const normalized = keyString.trim().toUpperCase().replace(/[\s\-]/g, '').replace(/(.{3})(.{4})(.{4})(.{4})/, '$1-$2-$3-$4');
    const exactMatch = keyString.trim().toUpperCase().replace(/\s/g, '');

    console.log('Attempting to redeem key:', exactMatch, '| normalized:', normalized);

    let snap = await getDocs(query(collection(db, 'accessKeys'), where('key', '==', exactMatch)));

    if (snap.empty) {
    snap = await getDocs(query(collection(db, 'accessKeys'), where('key', '==', normalized)));
    }

    if (snap.empty) {
    const allKeys = await getDocs(collection(db, 'accessKeys'));
    const strippedInput = exactMatch.replace(/-/g, '');
    const matchingDoc = allKeys.docs.find(d => {
        const storedKey = (d.data().key || '').replace(/-/g, '').toUpperCase();
        return storedKey === strippedInput;
    });
    if (matchingDoc) snap = { empty: false, docs: [matchingDoc] };
    }

    if (snap.empty) {
    console.warn('Key not found. Searched for:', exactMatch);
    return { success: false, error: 'Invalid key. Double-check and try again.' };
    }

    const docSnap = snap.docs[0];
    const data = docSnap.data();

    console.log('Key found:', data.key, '| used:', data.used, '| expiresAt:', data.expiresAt);

    if (data.used) return { success: false, error: 'This key has already been used.' };
    if (data.suspended) return { success: false, error: 'This key has been suspended. Contact support.' };

    const expiry = new Date(data.expiresAt);
    const now = new Date();
    if (expiry < now) {
    return { success: false, error: `This key expired on ${expiry.toLocaleDateString()}.` };
    }

    await updateDoc(doc(db, 'accessKeys', docSnap.id), {
    used: true,
    usedBy: uid,
    usedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'users', uid), {
    isPro: true,
    proExpiresAt: data.expiresAt,
    proActivatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    });
    return { success: true, expiresAt: data.expiresAt };
} catch (e) {
    console.error('redeemAccessKey error:', e.message, e.code);
    return { success: false, error: `Error: ${e.message}` };
}
}

export async function getAccessKeys() {
try {
    const snap = await getDocs(query(collection(db, 'accessKeys'), orderBy('createdAt', 'desc')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
} catch (e) { return []; }
}

// ─── RECEIPTS ─────────────────────────────────────────────────────────────────

export async function submitPaymentReceipt(uid, userName, userEmail, planName, amount, screenshotBase64) {
const screenshot = screenshotBase64
    ? screenshotBase64.substring(0, 700000)
    : null;

await addDoc(collection(db, 'paymentReceipts'), {
    uid,
    userName,
    userEmail,
    planName,
    amount,
    screenshot,
    status: 'pending',
    submittedAt: serverTimestamp(),
});
}

export async function getPendingReceipts() {
try {
    const snap = await getDocs(query(collection(db, 'paymentReceipts'), orderBy('submittedAt', 'desc')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
} catch (e) { return []; }
}

export async function approveReceipt(receiptId, uid, planName) {
const durationDays = planName.includes('Week') ? 7 : planName.includes('Month') ? 30 : 90;
const expiresAt = new Date();
expiresAt.setDate(expiresAt.getDate() + durationDays);
await updateDoc(doc(db, 'paymentReceipts', receiptId), { status: 'approved', approvedAt: serverTimestamp() });
await updateDoc(doc(db, 'users', uid), {
    isPro: true,
    proExpiresAt: expiresAt.toISOString(),
    proActivatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
});
return expiresAt.toISOString();
}

// ─── EMAILS ───────────────────────────────────────────────────────────────────

export async function sendWelcomeEmail(email, name) {
const message = `Thank you for joining ScholarMate. We are so glad to have you here.

ScholarMate is an AI-powered study companion built specifically for Nigerian university students — by Prince Isaac, a 100-level Accounting student at the University of Lagos (UNILAG). Every feature was designed from firsthand experience of the challenges we face as students.

HERE IS WHAT YOU NOW HAVE ACCESS TO:

ACE AI Tutor (4 Modes): Choose from Tutor (friendly guidance), Exam (strict and rigorous), Coach (Socratic discovery), or Challenge (advanced depth). ACE adapts to how you want to learn.

AI Lecture Notes and Summaries: Generate detailed, structured notes on any topic in seconds — complete with key terms, learning objectives, and exam tips.

Smart Flashcards: Create up to 10 flashcards per topic with a single tap. Study anywhere, anytime.

Adaptive Quizzes: Test yourself with Easy, Medium, Hard, or Mixed difficulty. Track your weak areas and improve with every attempt.

Study Planner: Plan your week around your exam dates. Our AI generates a prioritised daily schedule based on your performance.

CGPA Calculator: Track your academic standing across 4.0, 5.0, and 7.0 grading systems. Plan your semesters strategically.

My Library: Upload PDFs, images, or paste text — ACE will generate notes, flashcards, and quizzes directly from your materials.

GETTING STARTED:
Open the app and tap the ACE owl icon to start your first AI tutoring session. We recommend beginning with Tutor Mode if you are new to a topic.

If you ever have questions or need support, reply to this email — messages are read personally.

Study hard. Stay consistent. ACE your exams.

---
IMPORTANT: Future ScholarMate emails (Pro activation, updates, announcements) may land in your spam or junk folder. Please add princeconsult411@gmail.com to your contacts to ensure you receive them.`;

await sendEmailViaEmailJS(
    email,
    name,
    `Welcome to ScholarMate, ${name}!`,
    message
);
}

export async function sendProActivationEmail(email, name, planName, expiresAt) {
const expDate = new Date(expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

const message = `Your ScholarMate Pro access has been activated successfully.

Plan: ${planName}
Active until: ${expDate}

HERE IS WHAT YOU HAVE UNLOCKED:

- Unlimited chat messages
- 3x more daily usage across all features
- Crown badge on the leaderboard
- 100 bonus points added to your account
- Priority AI processing

Tap to open ScholarMate: scholarmate://HomeScreen
(Not installed yet? Download free: https://scholarmate-landingpage.netlify.app)

Thank you for supporting ScholarMate. Your investment goes directly into making this app better for every Nigerian student.

If you have any questions about your Pro access, reply to this email and it will be read personally.

Study hard. Stay consistent. ACE your exams.

---
Note: If future ScholarMate emails go to spam, please mark them as Not Spam and add princeconsult411@gmail.com to your contacts.`;

await sendEmailViaEmailJS(
    email,
    name,
    `You are now ScholarMate Pro, ${name}!`,
    message
);
}

export async function sendReceiptRejectionEmail(email, name, planName, amount) {
const message = `We reviewed your payment receipt for ${planName} (${amount}) but were unfortunately unable to verify it.

This can happen for the following reasons:

- The screenshot was unclear or cropped — make sure the full transaction details are visible
- The amount sent did not match the plan price
- The payment was sent to the wrong account number
- The receipt had already been used for a previous submission

WHAT TO DO NEXT:
Please make a fresh payment, take a clear screenshot of the full transaction confirmation, and resubmit it inside the app under Upgrade > Submit Receipt.

If you believe this is an error and your payment was valid, reply to this email with your transaction reference number and we will look into it personally.

We are sorry for any inconvenience and we want to get you on Pro as quickly as possible.

Study hard. Stay consistent. ACE your exams.`;

await sendEmailViaEmailJS(
    email,
    name,
    'Update on your ScholarMate Pro payment',
    message
);
}

export async function sendAdminEmail(toEmail, toName, subject, bodyHtml) {
  const plainText = typeof bodyHtml === 'string'
    ? bodyHtml.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s{3,}/g, '\n\n').trim()
    : String(bodyHtml || '');
  return sendEmailViaEmailJS(toEmail, toName || 'Scholar', subject, plainText);
}

// ─── IMAGE GENERATION HISTORY ─────────────────────────────────────────────────
// Images are cache-only — not persisted to Firebase (keeps admin panel clean)

// ─── ACE CHAT CONVERSATIONS ───────────────────────────────────────────────────

export async function saveAceConversations(uid, conversations) {
  if (!uid || !Array.isArray(conversations)) return;
  try {
    // Limit: last 30 conversations, last 30 messages each, no base64 images
    const toSave = conversations.slice(0, 30).map(conv => ({
      ...conv,
      messages: (conv.messages || []).slice(-30).map(m => {
        if (!m.images && !m.imageBase64) return m;
        return { ...m, images: m.images ? m.images.map(() => '[image]') : undefined, imageBase64: undefined };
      }),
    }));
    await setDoc(doc(db, 'users', uid, 'aceData', 'conversations'), {
      conversations: toSave,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('saveAceConversations error:', e.message);
  }
}

export async function loadAceConversations(uid) {
  if (!uid) return [];
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'aceData', 'conversations'));
    if (snap.exists()) return snap.data().conversations || [];
  } catch (e) {
    console.warn('loadAceConversations error:', e.message);
  }
  return [];
}

export async function saveImageGenRecord(uid, record) {
  // No-op: images intentionally not saved to Firestore
}

export async function getImageGenHistory(uid, limitCount = 50) {
  return [];
}

export async function getAllImageGenRecords(limitCount = 200) {
  return [];
}