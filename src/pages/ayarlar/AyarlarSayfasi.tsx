import { useEffect, useMemo, useState } from "react";
import {
    addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, where
} from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";
import { veritabani, yetki } from "../../firebase";

type Rol = "admin" | "pazarlamaci" | "uretim" | "sevkiyat";

type UserDoc = {
    email?: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    role?: Rol;
    bildirim?: {
        siparisOnay?: boolean;
        siparisRed?: boolean;
        kritikStok?: boolean;
        eposta?: boolean;
        sms?: boolean;
        push?: boolean;
    };
};

type RenkDoc = { id: string; ad: string; adLower: string; createdAt?: any };

type Sekme = "profil" | "sifre" | "bildirim" | "renkler";

export default function AyarlarSayfasi() {
    const u = yetki.currentUser;
    const [sekme, setSekme] = useState<Sekme>("profil");

    const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
    const [docYuk, setDocYuk] = useState(true);
    const [kaydetYuk, setKaydetYuk] = useState(false);
    const [durum, setDurum] = useState<string | null>(null);

    // Profil form state (⚠️ telefon kaldırıldı)
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [username, setUsername] = useState("");

    // Bildirim form state
    const [noti, setNoti] = useState<UserDoc["bildirim"]>({
        siparisOnay: true,
        siparisRed: true,
        kritikStok: true,
        eposta: true,
        sms: false,
        push: true,
    });

    // Renkler bölümü
    const [renkAd, setRenkAd] = useState("");
    const [renkYuk, setRenkYuk] = useState(false);
    const [renkler, setRenkler] = useState<RenkDoc[]>([]);
    const [renkAra, setRenkAra] = useState("");

    const adSoyad = useMemo(() => {
        const ad = firstName?.trim() ?? "";
        const soy = lastName?.trim() ?? "";
        return [ad, soy].filter(Boolean).join(" ");
    }, [firstName, lastName]);

    // Kullanıcı dokümanını canlı dinle
    useEffect(() => {
        if (!u?.uid) return;
        setDocYuk(true);
        const off = onSnapshot(doc(veritabani, "users", u.uid), (snap) => {
            const d = (snap.exists() ? (snap.data() as UserDoc) : {}) || {};
            setUserDoc(d);
            setFirstName(d.firstName || "");
            setLastName(d.lastName || "");
            setUsername(d.username || "");
            setNoti({
                siparisOnay: d.bildirim?.siparisOnay ?? true,
                siparisRed: d.bildirim?.siparisRed ?? true,
                kritikStok: d.bildirim?.kritikStok ?? true,
                eposta: d.bildirim?.eposta ?? true,
                sms: d.bildirim?.sms ?? false,
                push: d.bildirim?.push ?? true,
            });
            setDocYuk(false);
        });
        return () => off();
    }, [u?.uid]);

    // Renkleri canlı dinle
    useEffect(() => {
        const qy = query(collection(veritabani, "renkler"), orderBy("adLower", "asc"));
        const off = onSnapshot(qy, (snap) => {
            const list: RenkDoc[] = snap.docs.map(d => {
                const x = d.data() as any;
                return { id: d.id, ad: String(x.ad || ""), adLower: String(x.adLower || "").toLocaleLowerCase("tr"), createdAt: x.createdAt };
            }).filter(r => r.ad);
            setRenkler(list);
        });
        return () => off();
    }, []);

    async function profilKaydet() {
        if (!u?.uid) return;
        try {
            setKaydetYuk(true);
            setDurum(null);
            const ref = doc(veritabani, "users", u.uid);
            await setDoc(
                ref,
                {
                    firstName: firstName.trim() || null,
                    lastName: lastName.trim() || null,
                    username: username.trim() || null,
                },
                { merge: true }
            );
            setDurum("Profil bilgileri güncellendi.");
        } catch (e: any) {
            setDurum(e?.message || "Profil güncellenemedi.");
        } finally {
            setKaydetYuk(false);
        }
    }

    async function sifreSifirla() {
        if (!u?.email) { setDurum("Hesapta e-posta bulunamadı."); return; }
        try {
            setKaydetYuk(true);
            setDurum(null);
            await sendPasswordResetEmail(yetki, u.email);
            setDurum(`Şifre sıfırlama bağlantısı ${u.email} adresine gönderildi.`);
        } catch (e: any) {
            setDurum(e?.message || "Şifre sıfırlama e-postası gönderilemedi.");
        } finally {
            setKaydetYuk(false);
        }
    }

    async function bildirimKaydet() {
        if (!u?.uid) return;
        try {
            setKaydetYuk(true);
            setDurum(null);
            const ref = doc(veritabani, "users", u.uid);
            await setDoc(ref, { bildirim: noti }, { merge: true });
            setDurum("Bildirim tercihleri kaydedildi.");
        } catch (e: any) {
            setDurum(e?.message || "Bildirim tercihleri kaydedilemedi.");
        } finally {
            setKaydetYuk(false);
        }
    }

    // ----- Renk ekleme/silme -----
    function _norm(s: string) {
        return s.trim().toLocaleLowerCase("tr");
    }

    async function renkEkle() {
        const ad = renkAd.trim();
        if (!ad) { setDurum("Renk adı boş olamaz."); return; }

        const adLower = _norm(ad);

        try {
            setRenkYuk(true);
            setDurum(null);

            // aynı adLower varsa engelle
            const qy = query(collection(veritabani, "renkler"), where("adLower", "==", adLower));
            const sn = await getDocs(qy);
            if (!sn.empty) {
                setDurum(`'${ad}' zaten kayıtlı.`);
                return;
            }

            await addDoc(collection(veritabani, "renkler"), {
                ad,
                adLower,
                createdAt: serverTimestamp(),
            });

            setRenkAd("");
            setDurum(`'${ad}' eklendi.`);
        } catch (e: any) {
            setDurum(e?.message || "Renk eklenemedi.");
        } finally {
            setRenkYuk(false);
        }
    }

    async function renkSil(id: string, ad: string) {
        try {
            await deleteDoc(doc(veritabani, "renkler", id));
            setDurum(`'${ad}' silindi.`);
        } catch (e: any) {
            setDurum(e?.message || "Renk silinemedi.");
        }
    }

    const filtreliRenkler = useMemo(() => {
        const q = _norm(renkAra);
        if (!q) return renkler;
        return renkler.filter(r => r.adLower.includes(q));
    }, [renkAra, renkler]);

    // ----------------------------------------------------

    if (!u) {
        return <div className="card">Giriş yapılmadı.</div>;
    }

    return (
        <div className="card" style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <h2 style={{ margin: 0 }}>Ayarlar</h2>
            </div>

            {/* Sekmeler */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className="theme-btn" onClick={() => setSekme("profil")}
                    style={{ borderColor: sekme === "profil" ? "var(--ana)" : "var(--panel-bdr)" }}>
                    👤 Profil
                </button>
                <button type="button" className="theme-btn" onClick={() => setSekme("sifre")}
                    style={{ borderColor: sekme === "sifre" ? "var(--ana)" : "var(--panel-bdr)" }}>
                    🔒 Şifre
                </button>
                <button type="button" className="theme-btn" onClick={() => setSekme("bildirim")}
                    style={{ borderColor: sekme === "bildirim" ? "var(--ana)" : "var(--panel-bdr)" }}>
                    🔔 Bildirim
                </button>
                <button type="button" className="theme-btn" onClick={() => setSekme("renkler")}
                    style={{ borderColor: sekme === "renkler" ? "var(--ana)" : "var(--panel-bdr)" }}>
                    🎨 Renkler
                </button>
            </div>

            {docYuk ? (
                <div style={{ padding: 12, color: "var(--muted)" }}>Yükleniyor…</div>
            ) : (
                <>
                    {/* ----------------- PROFIL ----------------- */}
                    {sekme === "profil" && (
                        <div style={{ display: "grid", gap: 12, maxWidth: 680 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
                                <div>
                                    <label style={{ fontSize: 12, opacity: .8 }}>Ad</label>
                                    <input className="input" placeholder="Ad" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, opacity: .8 }}>Soyad</label>
                                    <input className="input" placeholder="Soyad" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                                </div>
                            </div>

                            <div>
                                <label style={{ fontSize: 12, opacity: .8 }}>Kullanıcı Adı</label>
                                <input className="input" placeholder="kullanici_adi" value={username} onChange={(e) => setUsername(e.target.value)} />
                            </div>

                            <div style={{ display: "grid", gap: 6 }}>
                                <div style={{ fontSize: 12, opacity: .8 }}>E-posta</div>
                                <div className="input" style={{ opacity: .8 }}>{u.email || "—"}</div>
                            </div>

                            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                <button className="theme-btn" onClick={() => {
                                    setFirstName(userDoc?.firstName || "");
                                    setLastName(userDoc?.lastName || "");
                                    setUsername(userDoc?.username || "");
                                    setDurum("Değişiklikler geri alındı.");
                                }}>
                                    Geri Al
                                </button>
                                <button onClick={profilKaydet} disabled={kaydetYuk}>
                                    {kaydetYuk ? "Kaydediliyor…" : "Kaydet"}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ----------------- SIFRE ----------------- */}
                    {sekme === "sifre" && (
                        <div style={{ display: "grid", gap: 12, maxWidth: 520 }}>
                            <div className="input" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <div>
                                    <div style={{ fontSize: 12, opacity: .8 }}>Hesap</div>
                                    <div style={{ fontWeight: 700 }}>{adSoyad || "Kullanıcı"}</div>
                                    <div style={{ fontSize: 12, opacity: .8 }}>{u.email || "—"}</div>
                                </div>
                                <div className="tag">Firebase Auth</div>
                            </div>

                            <div style={{ fontSize: 13, opacity: .9 }}>
                                Şifreni sıfırlamak için kayıtlı e-posta adresine bir bağlantı göndereceğiz.
                            </div>

                            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                <button onClick={sifreSifirla} disabled={kaydetYuk || !u.email}>
                                    {kaydetYuk ? "Gönderiliyor…" : "Sıfırlama E-postasını Gönder"}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ----------------- BILDIRIM ----------------- */}
                    {sekme === "bildirim" && (
                        <div style={{ display: "grid", gap: 12, maxWidth: 680 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
                                <EtkinSatir
                                    baslik="Sipariş Onaylandı"
                                    aciklama="Sipariş onay olunca bildirim al."
                                    deger={!!noti?.siparisOnay}
                                    onDegis={(v) => setNoti(s => ({ ...s, siparisOnay: v }))}
                                />
                                <EtkinSatir
                                    baslik="Sipariş Reddedildi"
                                    aciklama="Sipariş reddedilince bildirim al."
                                    deger={!!noti?.siparisRed}
                                    onDegis={(v) => setNoti(s => ({ ...s, siparisRed: v }))}
                                />
                                <EtkinSatir
                                    baslik="Kritik Stok"
                                    aciklama="Stok belirlenen eşik altına düşünce haber ver."
                                    deger={!!noti?.kritikStok}
                                    onDegis={(v) => setNoti(s => ({ ...s, kritikStok: v }))}
                                />
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
                                <EtkinSatir baslik="E-posta" aciklama="E-posta ile bilgilendir."
                                    deger={!!noti?.eposta} onDegis={(v) => setNoti(s => ({ ...s, eposta: v }))} />
                                <EtkinSatir baslik="SMS" aciklama="SMS ile bilgilendir."
                                    deger={!!noti?.sms} onDegis={(v) => setNoti(s => ({ ...s, sms: v }))} />
                                <EtkinSatir baslik="Push" aciklama="Tarayıcı/telefon push bildirimi."
                                    deger={!!noti?.push} onDegis={(v) => setNoti(s => ({ ...s, push: v }))} />
                            </div>

                            <div className="tag" style={{ maxWidth: 680 }}>
                                Not: Push bildirim için FCM web push anahtarını ve servis worker’ı ayrıca ayarlamalıyız.
                            </div>

                            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                <button className="theme-btn" onClick={() => {
                                    setNoti({ siparisOnay: true, siparisRed: true, kritikStok: true, eposta: true, sms: false, push: true });
                                    setDurum("Bildirim tercihleri varsayılanlara alındı.");
                                }}>
                                    Varsayılanlara Dön
                                </button>
                                <button onClick={bildirimKaydet} disabled={kaydetYuk}>
                                    {kaydetYuk ? "Kaydediliyor…" : "Kaydet"}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ----------------- RENKLER ----------------- */}
                    {sekme === "renkler" && (
                        <div style={{ display: "grid", gap: 12, maxWidth: 720 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                                <input
                                    className="input"
                                    placeholder="Renk adı (örn. Kahve)"
                                    value={renkAd}
                                    onChange={(e) => setRenkAd(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") renkEkle(); }}
                                />
                                <button onClick={renkEkle} disabled={renkYuk || !renkAd.trim()}>
                                    {renkYuk ? "Ekleniyor…" : "Ekle"}
                                </button>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                                <input
                                    className="input"
                                    placeholder="Ara (renk)"
                                    value={renkAra}
                                    onChange={(e) => setRenkAra(e.target.value)}
                                />

                                <div style={{ display: "grid", gap: 6 }}>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 80px", gap: 8, fontSize: 13, color: "var(--muted)" }}>
                                        <div>Renk</div>
                                        <div>Oluşturma</div>
                                        <div>Aksiyon</div>
                                    </div>

                                    {filtreliRenkler.map((r) => (
                                        <div key={r.id}
                                            className="hoverable"
                                            style={{
                                                display: "grid", gridTemplateColumns: "1fr 140px 80px", gap: 8, alignItems: "center",
                                                border: "1px solid var(--panel-bdr)", borderRadius: 10, padding: "8px 10px"
                                            }}>
                                            <div style={{ fontWeight: 600 }}>{r.ad}</div>
                                            <div style={{ fontSize: 12, opacity: .8 }}>
                                                {r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString() : "—"}
                                            </div>
                                            <div>
                                                <button className="theme-btn" onClick={() => renkSil(r.id, r.ad)}>Sil</button>
                                            </div>
                                        </div>
                                    ))}

                                    {!filtreliRenkler.length && <div style={{ color: "var(--muted)" }}>Kayıtlı renk yok.</div>}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            {durum && <div style={{ marginTop: 6, opacity: .9 }}>{durum}</div>}
        </div>
    );
}

/* ------------ Küçük yardımcı bileşen ------------ */
function EtkinSatir({
    baslik, aciklama, deger, onDegis,
}: { baslik: string; aciklama?: string; deger: boolean; onDegis: (v: boolean) => void }) {
    return (
        <div style={{
            border: "1px solid var(--panel-bdr)", borderRadius: 12, padding: 12,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            background: "color-mix(in oklab, var(--panel) 85%, transparent)"
        }}>
            <div>
                <div style={{ fontWeight: 700 }}>{baslik}</div>
                {aciklama && <div style={{ fontSize: 12, color: "var(--muted)" }}>{aciklama}</div>}
            </div>
            <label className="cek-kutu" style={{ userSelect: "none", display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={deger} onChange={(e) => onDegis(e.target.checked)} />
                <span>{deger ? "Açık" : "Kapalı"}</span>
            </label>
        </div>
    );
}
