import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
  type Auth
} from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
  serverTimestamp,
  type Firestore
} from "firebase/firestore";
import type { SavedDecisionRecord } from "../types/decision";

// Firebase web configuration
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBK_KzCjbeWX4rP3xD33QYjvWINS49U_XQ",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "promptwars-db2f0.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "promptwars-db2f0",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "promptwars-db2f0.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "236786444201",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:236786444201:web:0a313b32061ec79eef86b8",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-8536JD419F"
};

// Singleton App initialization
export const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * Sign in with Google using popup
 */
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

function getErrorCode(err: unknown): string | undefined {
  if (typeof err === "object" && err !== null && "code" in err) {
    return String((err as { code: unknown }).code);
  }
  return undefined;
}

/**
 * Attempt Anonymous Sign-In so user gets an authenticated Firebase UID automatically
 */
export async function initAnonymousAuth(): Promise<User | null> {
  if (auth.currentUser) return auth.currentUser;
  try {
    const cred = await signInAnonymously(auth);
    console.log("[Firebase] Anonymous session active, UID:", cred.user.uid);
    return cred.user;
  } catch {
    // Expected if Anonymous provider is not toggled in console yet
    console.info("[Firebase] Anonymous sign-in not enabled in console, using Google Sign-in or session ID.");
    return null;
  }
}

/**
 * Sign out current user
 */
export async function signOut(): Promise<void> {
  await fbSignOut(auth);
}

/**
 * Subscribe to auth state changes
 */
export function onAuthChange(callback: (user: User | null) => void) {
  // Try anonymous auth on launch if not authenticated
  initAnonymousAuth().then((anonUser) => {
    if (anonUser) callback(anonUser);
  });
  return onAuthStateChanged(auth, callback);
}

// LocalStorage key for backup resilience
const LOCAL_STORAGE_KEY = "blindspot_decisions_local_v1";

function getLocalRecords(): SavedDecisionRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalRecords(records: SavedDecisionRecord[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(records));
  } catch (e) {
    console.error("Failed to write to localStorage:", e);
  }
}

export interface PersistenceResult {
  record: SavedDecisionRecord;
  storageType: "firestore" | "local";
  message: string;
  error?: string;
}

/**
 * Test connectivity and read permissions on Cloud Firestore
 */
export async function testFirestoreConnection(): Promise<{
  connected: boolean;
  message: string;
  count: number;
}> {
  try {
    const snap = await getDocs(collection(db, "decisions"));
    return {
      connected: true,
      message: "Cloud Firestore is actively connected and reachable!",
      count: snap.size
    };
  } catch (err: unknown) {
    const errCode = getErrorCode(err);
    const errMsg = getErrorMessage(err);
    console.warn("[Firebase] Test connection failed:", errCode, errMsg);
    let advice = "Permission denied. Check Firestore security rules in Firebase Console.";
    if (errCode === "permission-denied") {
      advice = "Firestore security rules require publishing. In Firebase Console > Firestore > Rules, set allow read, write: if true; or sign in with Google.";
    }
    return {
      connected: false,
      message: `${errMsg} (${advice})`,
      count: 0
    };
  }
}

/**
 * Deeply clean an object to remove `undefined` values which Firestore strictly forbids
 */
function cleanForFirestore<T>(obj: T): unknown {
  if (obj === undefined) {
    return null;
  }
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanForFirestore);
  }
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = cleanForFirestore(value);
    }
  }
  return cleaned;
}

function cleanRecordForFirestore(obj: Record<string, unknown>): Record<string, unknown> {
  return (cleanForFirestore(obj) || {}) as Record<string, unknown>;
}

/**
 * Save decision record directly to Cloud Firestore as primary database
 */
export async function saveDecisionRecord(
  recordData: Omit<SavedDecisionRecord, "id" | "createdAt" | "updatedAt">,
  currentUser: User | null
): Promise<PersistenceResult> {
  const now = new Date().toISOString();
  const activeUserId = currentUser?.uid || auth.currentUser?.uid || "guest_user";
  const userEmail = currentUser?.email || auth.currentUser?.email || null;

  // 1. PRIMARY: Write directly to Cloud Firestore
  try {
    console.log("[Firebase] Writing decision to Cloud Firestore 'decisions' collection...");
    
    // Sanitize payload to strip all undefined fields for Firestore
    const sanitizedData = cleanRecordForFirestore({
      ...recordData,
      userId: activeUserId,
      userEmail: userEmail,
      createdAtIso: now
    });

    const docRef = await addDoc(collection(db, "decisions"), {
      ...sanitizedData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    console.log("[Firebase] Successfully stored in Cloud Firestore! Doc ID:", docRef.id);

    const fullRecord: SavedDecisionRecord = {
      ...recordData,
      id: docRef.id,
      userId: activeUserId,
      createdAt: now,
      updatedAt: now
    };

    // Also update local cache for instant offline view
    const currentRecords = getLocalRecords();
    saveLocalRecords([fullRecord, ...currentRecords.filter(r => r.id !== docRef.id)]);

    return {
      record: fullRecord,
      storageType: "firestore",
      message: `Successfully stored in Cloud Firestore (Doc ID: ${docRef.id})!`
    };
  } catch (firestoreErr: unknown) {
    const errCode = getErrorCode(firestoreErr);
    const errMsg = getErrorMessage(firestoreErr);
    console.warn("[Firebase] Direct Firestore write failed:", errCode, errMsg);

    // 2. FALLBACK: Local device storage if Firestore permissions or offline
    const localId = "local_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
    const fullRecord: SavedDecisionRecord = {
      ...recordData,
      id: localId,
      userId: activeUserId,
      createdAt: now,
      updatedAt: now
    };

    const currentRecords = getLocalRecords();
    saveLocalRecords([fullRecord, ...currentRecords]);

    const errorDetails = errCode === "permission-denied"
      ? "Firestore rules blocked the write. In Firebase Console > Firestore > Rules, allow read/write or sign in with Google."
      : errMsg || "Network or permission issue";

    return {
      record: fullRecord,
      storageType: "local",
      message: `Saved locally. Cloud Firestore issue: ${errorDetails}`,
      error: errorDetails
    };
  }
}

/**
 * Load user decision records from Cloud Firestore
 */
export async function loadDecisionRecords(currentUser: User | null): Promise<{
  records: SavedDecisionRecord[];
  source: "firestore" | "local";
}> {
  const activeUid = currentUser?.uid || auth.currentUser?.uid;

  // Strategy 1: User-specific records from Cloud Firestore
  if (activeUid && activeUid !== "guest_user") {
    try {
      console.log("[Firebase] Loading decisions from Cloud Firestore for user:", activeUid);
      // Query without composite orderBy to prevent any index requirement error
      const q = query(
        collection(db, "decisions"),
        where("userId", "==", activeUid)
      );
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const records: SavedDecisionRecord[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            userId: d.userId,
            input: d.input,
            analysis: d.analysis,
            challengeResult: d.challengeResult,
            premortemResult: d.premortemResult,
            reflection: d.reflection,
            createdAt: d.createdAtIso || (d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : new Date().toISOString()),
            updatedAt: d.updatedAtIso || (d.updatedAt?.toDate ? d.updatedAt.toDate().toISOString() : new Date().toISOString())
          };
        });

        // In-memory sort by date descending
        records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        console.log(`[Firebase] Loaded ${records.length} records from Cloud Firestore.`);
        return { records, source: "firestore" };
      }
    } catch (err: unknown) {
      console.warn("[Firebase] Could not fetch user records from Firestore:", getErrorMessage(err));
    }
  }

  // Strategy 2: Fetch all decisions from Firestore if public/evaluator access
  try {
    const snap = await getDocs(collection(db, "decisions"));
    if (!snap.empty) {
      const records: SavedDecisionRecord[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          userId: d.userId,
          input: d.input,
          analysis: d.analysis,
          challengeResult: d.challengeResult,
          premortemResult: d.premortemResult,
          reflection: d.reflection,
          createdAt: d.createdAtIso || (d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : new Date().toISOString()),
          updatedAt: d.updatedAtIso || (d.updatedAt?.toDate ? d.updatedAt.toDate().toISOString() : new Date().toISOString())
        };
      });

      records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return { records, source: "firestore" };
    }
  } catch (err: unknown) {
    console.warn("[Firebase] General Firestore query blocked or empty:", getErrorMessage(err));
  }

  const localRecords = getLocalRecords();
  return { records: localRecords, source: "local" };
}

/**
 * Delete a decision record
 */
export async function deleteDecisionRecord(recordId: string, _currentUser?: User | null): Promise<void> {
  if (!recordId.startsWith("local_")) {
    try {
      await deleteDoc(doc(db, "decisions", recordId));
      console.log("[Firebase] Deleted record from Cloud Firestore:", recordId);
    } catch (err: unknown) {
      console.error("[Firebase] Firestore delete error:", getErrorMessage(err));
    }
  }

  // Also remove from local storage
  const records = getLocalRecords().filter(r => r.id !== recordId);
  saveLocalRecords(records);
}
