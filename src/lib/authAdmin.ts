// Spark planda çalışır: Admin, başka bir kullanıcının e-posta/şifresiyle
// hesabı oluşturur. Mevcut oturumu değiştirmez.
export async function adminCreateEmailUser(email: string, password: string) {
  const key = import.meta.env.VITE_FIREBASE_API_KEY;
  if (!key) throw new Error("API key yok (.env VITE_FIREBASE_API_KEY).");

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // returnSecureToken:false => idToken vermesin; bize sadece uid (localId) lazım
      body: JSON.stringify({ email, password, returnSecureToken: false }),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || "signUp failed";
    // Örn. EMAIL_EXISTS
    throw new Error(msg);
  }
  return { uid: data.localId as string };
}
