import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

type CreateUserData = {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  role?: "admin" | "pazarlamaci";
};

export const adminCreateUser = functions.https.onCall(
  async (request) => {
    // 1) Oturum kontrolü
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Oturum yok."
      );
    }

    // 2) Çağıran admin mi?
    const callerDoc = await db.doc(`users/${callerUid}`).get();
    const callerRole = callerDoc.exists ? callerDoc.get("role") : null;
    if (callerRole !== "admin") {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Sadece admin kullanıcı oluşturabilir."
      );
    }

    // 3) Parametreler
    const data = (request.data || {}) as CreateUserData;
    const email = String(data.email || "").trim();
    const password = String(data.password || "");
    const firstName = String(data.firstName || "").trim();
    const lastName = String(data.lastName || "").trim();
    const role =
      (data.role as "admin" | "pazarlamaci") || "pazarlamaci";

    if (!email || !password) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "email ve password zorunludur."
      );
    }

    // 4) Auth'ta kullanıcı oluştur
    const user = await admin.auth().createUser({
      email: email,
      password: password,
      displayName:
        (`${firstName} ${lastName}`).trim() || undefined,
      emailVerified: false,
      disabled: false,
    });

    // (opsiyonel) custom claims
    await admin.auth().setCustomUserClaims(
      user.uid,
      {role: role}
    );

    // 5) Firestore users/{uid}
    await db.doc(`users/${user.uid}`).set(
      {
        email: email,
        firstName: firstName,
        lastName: lastName,
        role: role,
        createdAt:
          admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true}
    );

    return {uid: user.uid};
  }
);
