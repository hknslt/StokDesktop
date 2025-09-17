// functions/src/index.ts
// *** KRİTİK ***: v1 import edin (böylece .region(...) kullanılabilir)
import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

const REGION = "europe-west1"; // istemcide getFunctions(app, "europe-west1") ile aynı olmalı

type Rol = "admin" | "pazarlamaci" | "uretim" | "sevkiyat";

async function assertIsAdmin(callerUid?: string, token?: any) {
  if (!callerUid) {
    throw new functions.https.HttpsError("unauthenticated", "Oturum yok.");
  }
  // 1) custom claim
  if (token?.role === "admin" || token?.admin === true) return;

  // 2) Firestore fallback
  const doc = await db.doc(`users/${callerUid}`).get();
  const role = doc.exists ? doc.get("role") : null;
  if (role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Yetersiz yetki (admin gerekli).");
  }
}

// --- Kullanıcı oluştur (Auth + claims + Firestore) ---
export const adminCreateUser = functions
  .region(REGION)
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    const callerUid = context.auth?.uid;
    await assertIsAdmin(callerUid, context.auth?.token);

    const email = String(data?.email || "").trim().toLowerCase();
    const password = String(data?.password || "");
    const firstName = String(data?.firstName || "").trim();
    const lastName = String(data?.lastName || "").trim();
    const role: Rol = (data?.role as Rol) || "pazarlamaci";

    if (!email || !password) {
      throw new functions.https.HttpsError("invalid-argument", "email ve password zorunludur.");
    }
    if (password.length < 6) {
      throw new functions.https.HttpsError("invalid-argument", "Şifre en az 6 karakter olmalı.");
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new functions.https.HttpsError("invalid-argument", "Geçerli bir e-posta giriniz.");
    }

    // Auth
    const user = await admin.auth().createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`.trim() || undefined,
      emailVerified: false,
      disabled: false,
    });

    // Claims
    await admin.auth().setCustomUserClaims(user.uid, { role, admin: role === "admin" });

    // Firestore
    await db.doc(`users/${user.uid}`).set(
      {
        email,
        firstName,
        lastName,
        role,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log(`User created by ${callerUid}: ${user.uid}`);
    return { uid: user.uid };
  });

// --- Auth hesabını sil (client Firestore'u silecek) ---
export const adminDeleteUser = functions
  .region(REGION)
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    const callerUid = context.auth?.uid;
    await assertIsAdmin(callerUid, context.auth?.token);

    const targetUid = String(data?.uid || "").trim();
    if (!targetUid) {
      throw new functions.https.HttpsError("invalid-argument", "uid zorunlu.");
    }

    try {
      await admin.auth().deleteUser(targetUid);
      console.log(`Auth deleted by ${callerUid}: ${targetUid}`);
      return { ok: true };
    } catch (err: any) {
      if (err?.code === "auth/user-not-found") {
        console.warn(`User not found in Auth, continue: ${targetUid}`);
        return { ok: true, note: "user-not-found" };
      }
      console.error("Delete user failed", err);
      throw new functions.https.HttpsError("internal", err?.message || "Silme hatası.");
    }
  });

// --- (opsiyonel) bir kullanıcıya admin claim atama ---
export const setAdminRole = functions
  .region(REGION)
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    const callerUid = context.auth?.uid;
    await assertIsAdmin(callerUid, context.auth?.token);

    const targetUid = String(data?.uid || "").trim();
    if (!targetUid) {
      throw new functions.https.HttpsError("invalid-argument", "uid zorunlu.");
    }

    await admin.auth().setCustomUserClaims(targetUid, { role: "admin", admin: true });
    console.log(`Admin claim set by ${callerUid} -> ${targetUid}`);
    return { ok: true };
  });
