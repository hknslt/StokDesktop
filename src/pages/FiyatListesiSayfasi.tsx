import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  getDocs,
  deleteDoc,
} from "firebase/firestore";
import { veritabani } from "../firebase";

type FiyatListesi = {
  id: string;
  ad: string;
  kdv: number;
  createdAt?: any;
};

type Urun = {
  id: number;
  urunAdi: string;
  urunKodu: string;
  adet: number;
  renk?: string;
};

type UrunSatir = Urun & {
  netFiyat?: number;
  draft: string;
};

type SortKey = "ad" | "kod" | "renk" | "fiyat";
type SortDir = "asc" | "desc";

function toNumberOrUndefined(v: string | undefined): number | undefined {
  if (!v?.trim()) return undefined;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

export default function FiyatListesiSayfasi() {
  // --- listeler ---
  const [listeler, setListeler] = useState<FiyatListesi[]>([]);
  const [seciliListeId, setSeciliListeId] = useState<string>("");

  // seçili liste
  const seciliListe = useMemo(
    () => listeler.find((l) => l.id === seciliListeId) || null,
    [listeler, seciliListeId]
  );

  // KDV / Ad taslakları
  const [listeKdvDraft, setListeKdvDraft] = useState<string>("");
  const [adEditMode, setAdEditMode] = useState(false);
  const [listeAdDraft, setListeAdDraft] = useState<string>("");

  // ==========================================
  // --- ÖZEL MODAL (ALERT/CONFIRM) YAPISI ---
  // ==========================================
  const [modal, setModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    isConfirm: boolean;
    onConfirm?: () => void;
    onClose?: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    isConfirm: false,
  });

  const showAlert = (message: string, title = "Bilgi", onClose?: () => void) => {
    setModal({ isOpen: true, title, message, isConfirm: false, onClose });
  };

  const showConfirm = (message: string, onConfirm: () => void, title = "Onay Gerekli") => {
    setModal({ isOpen: true, title, message, isConfirm: true, onConfirm });
  };

  const closeModal = () => {
    setModal(prev => ({ ...prev, isOpen: false }));
  };
  // ==========================================

  useEffect(() => {
    setListeKdvDraft(seciliListe ? String(seciliListe.kdv).replace(".", ",") : "");
    setListeAdDraft(seciliListe?.ad ?? "");
    setAdEditMode(false);
  }, [seciliListe]);

  // yeni liste formu
  const [yeniAd, setYeniAd] = useState("");
  const [yeniKdv, setYeniKdv] = useState<number>(10);
  const [yeniYuk, setYeniYuk] = useState(false);

  // --- ürünler + fiyatlar ---
  const [urunler, setUrunler] = useState<Urun[]>([]);
  const [fiyatHaritasi, setFiyatHaritasi] = useState<Record<number, number | undefined>>({});
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  const [ara, setAra] = useState("");

  // sıralama
  const [sortKey, setSortKey] = useState<SortKey>("ad");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // işlemler
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [saveTotal, setSaveTotal] = useState(0);
  const [saveDone, setSaveDone] = useState(0);

  const [silYapiyor, setSilYapiyor] = useState(false);
  const [silTotal, setSilTotal] = useState(0);
  const [silDone, setSilDone] = useState(0);


  // listeleri dinle
  useEffect(() => {
    const qy = query(collection(veritabani, "fiyatListeleri"), orderBy("createdAt", "desc"));
    return onSnapshot(qy, (snap) => {
      const arr: FiyatListesi[] = snap.docs.map(d => {
        const x = d.data() as any;
        return { id: d.id, ad: String(x.ad ?? d.id), kdv: Number(x.kdv ?? 0), createdAt: x.createdAt };
      });
      setListeler(arr);
      if (!seciliListeId && arr.length) setSeciliListeId(arr[0].id);
      if (seciliListeId && !arr.find(l => l.id === seciliListeId) && arr.length) {
        setSeciliListeId(arr[0].id);
      }
    });
  }, []);

  // ürünleri dinle
  useEffect(() => {
    const qy = query(collection(veritabani, "urunler"), orderBy("id", "asc"));
    return onSnapshot(qy, (snap) => {
      const arr: Urun[] = snap.docs.map(d => {
        const x = d.data() as any;
        return {
          id: Number(x.id ?? Number(d.id)),
          urunAdi: String(x.urunAdi ?? ""),
          urunKodu: String(x.urunKodu ?? ""),
          adet: Number(x.adet ?? 0),
          renk: x.renk || undefined,
        };
      });
      setUrunler(arr);
    });
  }, []);

  // seçili listenin fiyatlarını dinle
  useEffect(() => {
    if (!seciliListeId) { setFiyatHaritasi({}); return; }
    setDrafts({});

    const col = collection(veritabani, "fiyatListeleri", seciliListeId, "urunFiyatlari");
    return onSnapshot(col, (snap) => {
      const map: Record<number, number> = {};
      snap.forEach(d => {
        const x = d.data() as any;
        const uid = Number(x.urunId ?? Number(d.id));
        const nf = Number(x.netFiyat ?? 0);
        if (!Number.isNaN(uid)) map[uid] = nf;
      });
      setFiyatHaritasi(map);
    });
  }, [seciliListeId]);

  // filtre + sıralama + veri birleştirme
  const gorunen = useMemo(() => {
    let rows: UrunSatir[] = urunler.map(u => {
      const dbFiyat = fiyatHaritasi[u.id];
      const userDraft = drafts[u.id];
      const displayValue = userDraft !== undefined
        ? userDraft
        : (dbFiyat !== undefined ? String(dbFiyat) : "");

      return {
        ...u,
        netFiyat: dbFiyat,
        draft: displayValue
      };
    });

    const q = ara.trim().toLowerCase();
    if (q) {
      rows = rows.filter(s =>
        [s.urunAdi, s.urunKodu, s.renk]
          .filter(Boolean)
          .map(String)
          .map(v => v.toLowerCase())
          .some(v => v.includes(q))
      );
    }

    const fiyatDegeri = (r: UrunSatir): number | undefined =>
      toNumberOrUndefined(r.draft) ?? (Number.isFinite(r.netFiyat as number) ? r.netFiyat : undefined);

    const dir = sortDir === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      let av: string | number | undefined;
      let bv: string | number | undefined;

      switch (sortKey) {
        case "ad": av = a.urunAdi; bv = b.urunAdi; break;
        case "kod": av = a.urunKodu; bv = b.urunKodu; break;
        case "renk": av = a.renk ?? ""; bv = b.renk ?? ""; break;
        case "fiyat":
          av = fiyatDegeri(a);
          bv = fiyatDegeri(b);
          break;
      }

      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;

      if (typeof av === "number" && typeof bv === "number") {
        return av === bv ? 0 : (av < bv ? -1 : 1) * dir;
      }
      const as = String(av).toLocaleLowerCase();
      const bs = String(bv).toLocaleLowerCase();
      return as === bs ? 0 : (as < bs ? -1 : 1) * dir;
    });
  }, [urunler, fiyatHaritasi, drafts, ara, sortKey, sortDir]);

  async function yeniListeOlustur() {
    if (!yeniAd.trim()) {
      showAlert("Liste adı gerekli.", "Uyarı");
      return;
    }
    try {
      setYeniYuk(true);
      const ref = await addDoc(collection(veritabani, "fiyatListeleri"), {
        ad: yeniAd.trim(),
        kdv: Number(yeniKdv) || 0,
        createdAt: serverTimestamp(),
      });
      setYeniAd(""); setYeniKdv(10);
      setSeciliListeId(ref.id);
      showAlert("Fiyat listesi oluşturuldu.", "Başarılı");
    } catch (e: any) {
      showAlert(e?.message || "Liste oluşturulamadı.", "Hata");
    } finally {
      setYeniYuk(false);
    }
  }

  function setDraft(urunId: number, v: string) {
    setDrafts(prev => ({ ...prev, [urunId]: v }));
  }

  const listeKdvNumber = toNumberOrUndefined(listeKdvDraft);
  const listeDegisti =
    seciliListe != null && listeKdvNumber != null
      ? Number(seciliListe.kdv) !== Number(listeKdvNumber)
      : false;

  const listeAdiDegisti =
    seciliListe != null && listeAdDraft.trim() !== "" && seciliListe.ad !== listeAdDraft.trim();

  const degisiklikVarMi = useMemo(() => {
    const fiyatDegisti = gorunen.some(r => {
      const girilen = toNumberOrUndefined(r.draft);
      const mevcut = r.netFiyat;
      if (girilen == null && (mevcut == null || Number.isNaN(mevcut))) return false;
      return girilen !== mevcut;
    });
    return fiyatDegisti || listeDegisti;
  }, [gorunen, listeDegisti]);

  async function kaydet() {
    if (!seciliListeId) {
      showAlert("Önce bir liste seçin.", "Uyarı");
      return;
    }

    const changed = gorunen
      .map(r => ({ r, draftN: toNumberOrUndefined(r.draft) }))
      .filter(x => x.draftN !== x.r.netFiyat);

    try {
      setKaydediliyor(true);
      setSaveTotal(changed.length + (listeDegisti ? 1 : 0));
      setSaveDone(0);

      if (listeDegisti && listeKdvNumber != null) {
        await updateDoc(doc(veritabani, "fiyatListeleri", seciliListeId), {
          kdv: Number(listeKdvNumber),
          updatedAt: serverTimestamp(),
        });
        setSaveDone(d => d + 1);
      }

      await Promise.all(
        changed.map(async ({ r, draftN }) => {
          const docRef = doc(
            veritabani,
            "fiyatListeleri", seciliListeId,
            "urunFiyatlari", String(r.id)
          );
          await setDoc(docRef, {
            urunId: r.id,
            netFiyat: draftN ?? null,
            updatedAt: serverTimestamp(),
          }, { merge: true });
          setSaveDone(d => d + 1);
        })
      );

      setDrafts({});
      showAlert("Değişiklikler başarıyla kaydedildi.", "Başarılı");
    } catch (e: any) {
      showAlert(e?.message || "Kaydetme işlemi başarısız.", "Hata");
    } finally {
      setKaydediliyor(false);
      setSaveTotal(0);
      setSaveDone(0);
    }
  }

  async function listeAdiniKaydet() {
    if (!seciliListeId) return;
    const yeniAd = listeAdDraft.trim();
    if (!yeniAd) {
      showAlert("Liste adı boş olamaz.", "Uyarı");
      return;
    }
    if (!listeAdiDegisti) { setAdEditMode(false); return; }

    try {
      await updateDoc(doc(veritabani, "fiyatListeleri", seciliListeId), {
        ad: yeniAd,
        updatedAt: serverTimestamp(),
      });
      setAdEditMode(false);
      showAlert("Liste adı güncellendi.", "Başarılı");
    } catch (e: any) {
      showAlert(e?.message || "Liste adı güncellenemedi.", "Hata");
    }
  }

  function listeyiSilIste() {
    if (!seciliListeId || !seciliListe) return;
    showConfirm(
      `"${seciliListe.ad}" listesini silmek üzeresiniz.\n\nBu işlem bu listenin altındaki tüm ürün fiyatlarını da silecektir. Onaylıyor musunuz?`,
      listeyiSilGercek,
      "Listeyi Sil"
    );
  }

  async function listeyiSilGercek() {
    if (!seciliListeId || !seciliListe) return;

    try {
      setSilYapiyor(true);
      setSilTotal(0);
      setSilDone(0);

      const altCol = collection(veritabani, "fiyatListeleri", seciliListeId, "urunFiyatlari");
      const altSnap = await getDocs(altCol);
      setSilTotal(altSnap.size + 1);
      let done = 0;

      for (const d of altSnap.docs) {
        await deleteDoc(doc(veritabani, "fiyatListeleri", seciliListeId, "urunFiyatlari", d.id));
        done += 1; setSilDone(done);
      }
      await deleteDoc(doc(veritabani, "fiyatListeleri", seciliListeId));
      done += 1; setSilDone(done);

      setSeciliListeId("");
      showAlert("Liste başarıyla silindi.", "Başarılı");
    } catch (e: any) {
      showAlert(e?.message || "Liste silinemedi.", "Hata");
    } finally {
      setSilYapiyor(false);
      setSilTotal(0);
      setSilDone(0);
    }
  }

  const progressPct = saveTotal > 0 ? Math.round((saveDone / saveTotal) * 100) : 0;
  const delPct = silTotal > 0 ? Math.round((silDone / silTotal) * 100) : 0;

  const globalDisabled = kaydediliyor || silYapiyor;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Üst: Liste seç / Ad Düzenle & Sil / KDV / Arama + Sıralama */}
      <div className="card" style={{ display: "grid", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Fiyat Listeleri</h3>

        <div style={{
          display: "grid",
          gridTemplateColumns: "minmax(260px,1fr) 160px 1fr",
          gap: 8,
          alignItems: "center"
        }}>
          {/* Liste seçimi + Ad düzenle + Sil */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 13, color: "var(--muted)" }}>Seçili liste</label>
            <select
              className="input"
              value={seciliListeId}
              onChange={(e) => setSeciliListeId(e.target.value)}
              style={{ minWidth: 220 }}
              disabled={globalDisabled}
            >
              {listeler.map(l => (
                <option key={l.id} value={l.id}>{l.ad} (KDV %{l.kdv})</option>
              ))}
              {!listeler.length && <option value="">— Liste yok —</option>}
            </select>

            {seciliListe && (
              <>
                {adEditMode ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      className="input"
                      value={listeAdDraft}
                      onChange={(e) => setListeAdDraft(e.target.value)}
                      disabled={globalDisabled}
                      style={{ minWidth: 200 }}
                    />
                    <button
                      className="theme-btn"
                      type="button"
                      onClick={listeAdiniKaydet}
                      disabled={globalDisabled || !listeAdDraft.trim() || !listeAdiDegisti}
                      title="Adı Kaydet"
                    >
                      Kaydet
                    </button>
                    <button
                      className="theme-btn"
                      type="button"
                      onClick={() => { setAdEditMode(false); setListeAdDraft(seciliListe.ad); }}
                      disabled={globalDisabled}
                      title="Vazgeç"
                    >
                      İptal
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      className="theme-btn"
                      type="button"
                      onClick={() => setAdEditMode(true)}
                      disabled={globalDisabled || !seciliListeId}
                      title="Liste adını düzenle"
                    >
                      ✏️ Adı Düzenle
                    </button>
                    <button
                      className="theme-btn"
                      style={{ borderColor: "var(--kirmizi)", color: "var(--kirmizi)" }}
                      type="button"
                      onClick={listeyiSilIste}
                      disabled={globalDisabled || !seciliListeId}
                      title="Seçili listeyi sil"
                    >
                      🗑 Sil
                    </button>
                  </>
                )}
              </>
            )}
          </div>

          {/* KDV düzenle */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>KDV %</span>
            <input
              className="input"
              type="number"
              step="0.1"
              value={listeKdvDraft}
              onChange={(e) => setListeKdvDraft(e.target.value)}
              disabled={globalDisabled}
            />
          </div>

          {/* Arama + Sıralama */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <input
              className="input"
              placeholder="Ara (ad, kod, renk...)"
              value={ara}
              onChange={(e) => setAra(e.target.value)}
              style={{ maxWidth: 240 }}
              disabled={globalDisabled}
            />
            <select
              className="input"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              title="Sıralama Kriteri"
              disabled={globalDisabled}
            >
              <option value="ad">Ürün Adı</option>
              <option value="kod">Kod</option>
              <option value="renk">Renk</option>
              <option value="fiyat">Net Fiyat</option>
            </select>
            <button
              className="theme-btn"
              type="button"
              onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
              title="Sıralama Yönü"
              disabled={globalDisabled}
            >
              {sortDir === "asc" ? "↑ Artan" : "↓ Azalan"}
            </button>
            <button className="theme-btn" type="button" onClick={() => { setSortKey("ad"); setSortDir("asc"); }} title="Sıralamayı sıfırla" disabled={globalDisabled}>
              Sıfırla
            </button>
          </div>
        </div>

        {/* Yeni liste + Kaydet */}
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr auto auto", alignItems: "center" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 8 }}>
            <input
              className="input"
              placeholder="Yeni liste adı (örn. 2025)"
              value={yeniAd}
              onChange={(e) => setYeniAd(e.target.value)}
              disabled={globalDisabled}
            />
            <input
              className="input"
              type="number"
              step="0.1"
              placeholder="KDV %"
              value={String(yeniKdv)}
              onChange={(e) => setYeniKdv(Number(e.target.value))}
              disabled={globalDisabled}
            />
          </div>
          <button className="theme-btn" onClick={yeniListeOlustur} disabled={globalDisabled || yeniYuk || !yeniAd.trim()}>
            {yeniYuk ? "Oluşturuluyor…" : "Yeni Liste Oluştur"}
          </button>
          <button onClick={kaydet} disabled={globalDisabled || !degisiklikVarMi}>
            {kaydediliyor ? "Kaydediliyor…" : "Değişiklikleri Kaydet"}
          </button>
        </div>

        {/* Kaydetme ilerlemesi */}
        {kaydediliyor && saveTotal > 0 && (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 12, opacity: .85 }}>Yazılıyor: {saveDone}/{saveTotal}</div>
            <div style={{ height: 8, borderRadius: 999, border: "1px solid var(--panel-bdr)", overflow: "hidden", background: "var(--panel)" }}>
              <div style={{
                width: `${progressPct}%`,
                height: "100%",
                transition: "width .2s ease",
                background: "linear-gradient(90deg, var(--ana), var(--ana-2))"
              }} />
            </div>
          </div>
        )}

        {/* Silme ilerlemesi */}
        {silYapiyor && silTotal > 0 && (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 12, opacity: .85, color: "var(--kirmizi)" }}>
              Siliniyor: {silDone}/{silTotal}
            </div>
            <div style={{ height: 8, borderRadius: 999, border: "1px solid var(--panel-bdr)", overflow: "hidden", background: "var(--panel)" }}>
              <div style={{
                width: `${delPct}%`,
                height: "100%",
                transition: "width .2s ease",
                background: "linear-gradient(90deg, var(--kirmizi), #ff9aa9)"
              }} />
            </div>
          </div>
        )}
      </div>

      {/* Tablo */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Ürün Fiyatları</h3>

        <div style={{
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr 1fr 140px",
          gap: 8,
          fontSize: 13,
          color: "var(--muted)",
          marginBottom: 8
        }}>
          <div>Ürün Adı</div>
          <div>Kod</div>
          <div>Renk</div>
          <div>Net Fiyat</div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {gorunen.map((r) => (
            <div
              key={r.id}
              className="row"
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 1fr 1fr 140px",
                gap: 8,
                alignItems: "center",
                border: "1px solid var(--panel-bdr)",
                borderRadius: 10,
                padding: "8px 10px",
                opacity: globalDisabled ? 0.9 : 1
              }}
              title={r.urunAdi}
            >
              <div><b>{r.urunAdi}</b></div>
              <div>{r.urunKodu}</div>
              <div>{r.renk ?? "—"}</div>

              <input
                className="input"
                placeholder={r.netFiyat != null ? String(r.netFiyat) : "—"}
                value={r.draft}
                onChange={(e) => setDraft(r.id, e.target.value)}
                inputMode="decimal"
                disabled={globalDisabled}
                style={{ textAlign: "right" }}
              />
            </div>
          ))}

          {!gorunen.length && <div>Liste boş.</div>}
        </div>
      </div>

      {/* ========================================== */}
      {/* ÖZEL MODAL UI KISMI                        */}
      {/* ========================================== */}
      {modal.isOpen && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          display: "flex", justifyContent: "center", alignItems: "center",
          zIndex: 99999
        }}>
          <div className="card" style={{
            backgroundColor: "white",
            color: "#333",
            width: "90%", maxWidth: 400,
            padding: "24px", borderRadius: "12px",
            boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
            display: "flex", flexDirection: "column", gap: "16px",
            position: "relative"
          }}>
            <h3 style={{ margin: 0, color: "black", fontSize: "18px" }}>{modal.title}</h3>

            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, fontSize: "14px" }}>
              {modal.message}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 10 }}>
              {modal.isConfirm && (
                <button
                  className="theme-btn"
                  onClick={closeModal}
                  style={{ background: "#6c757d", color: "white", padding: "8px 16px", border: "none", borderRadius: "6px", cursor: "pointer" }}
                >
                  İptal
                </button>
              )}
              <button
                className="theme-btn"
                onClick={() => {
                  if (modal.isConfirm && modal.onConfirm) {
                    modal.onConfirm();
                  } else if (!modal.isConfirm && modal.onClose) {
                    modal.onClose();
                  }
                  closeModal();
                }}
                style={{
                  background: modal.isConfirm ? "#dc3545" : "#28a745",
                  color: "white",
                  padding: "8px 16px",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontWeight: "bold"
                }}
              >
                {modal.isConfirm ? "Onayla" : "Tamam"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}