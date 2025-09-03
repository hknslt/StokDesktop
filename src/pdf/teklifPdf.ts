import jsPDF from "jspdf";
import autoTable, { RowInput } from "jspdf-autotable";

/* ——— Aynı font yükleme yardımcıları (NotoSans varsa onu, yoksa helvetica) ——— */
async function loadTtf(
  doc: jsPDF,
  url: string,
  vfsName: string,
  family: string,
  style: "normal" | "bold"
) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font fetch failed: ${url}`);
  const buf = await res.arrayBuffer();

  // ArrayBuffer -> base64 (büyük dosyalar için parça parça)
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunk) as unknown as number[]
    );
  }
  const b64 = btoa(binary);

  doc.addFileToVFS(vfsName, b64);
  doc.addFont(vfsName, family, style);
}

async function ensureFontFamily(doc: jsPDF): Promise<string> {
  try {
    await loadTtf(doc, "/fonts/NotoSans-Regular.ttf", "NotoSans-Regular.ttf", "NotoSans", "normal");
    await loadTtf(doc, "/fonts/NotoSans-Bold.ttf", "NotoSans-Bold.ttf", "NotoSans", "bold");
    doc.setFont("NotoSans", "normal");
    return "NotoSans";
  } catch {
    doc.setFont("helvetica", "normal");
    return "helvetica";
  }
}

/* ——— küçük yardımcılar ——— */
const TL = (n: number) => Number(n || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUM = (n: any) => Number(n || 0);
function toDateStr(ts: any | undefined) {
  try {
    const d = ts?.toDate?.() ?? (ts instanceof Date ? ts : null);
    return d ? d.toLocaleDateString("tr-TR") : "";
  } catch { return ""; }
}

/* ——— ANA: Teklif PDF ——— */
export async function teklifPdfYazdirWeb(siparis: any) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const fontFamily = await ensureFontFamily(doc);

  // tarih (öncelik: islemeTarihi > tarih > bugün)
  const teklifTarihi =
    toDateStr(siparis?.islemeTarihi) ||
    toDateStr(siparis?.tarih) ||
    new Date().toLocaleDateString("tr-TR");

  /* ----- Başlık ----- */
  doc.setFont(fontFamily, "bold");
  doc.setFontSize(16);
  doc.setTextColor(0);
  doc.text("TEKLİF", 20, 18);

  doc.setFont(fontFamily, "normal");
  doc.setFontSize(11);
  const teklifNo = siparis?.docId || siparis?.id || "";
  doc.text(`Tarih: ${teklifTarihi}`, 200, 14, { align: "right" });
  if (teklifNo) doc.text(`Teklif No: ${String(teklifNo)}`, 200, 20, { align: "right" });

  /* ----- Müşteri Bilgileri ----- */
  autoTable(doc, {
    startY: 26,
    theme: "grid",
    styles: { font: fontFamily, fontStyle: "normal", fontSize: 10, cellPadding: 2, textColor: 20 },
    headStyles: { fillColor: [230, 230, 230] },
    body: [
      [`Müşteri: ${siparis?.musteri?.firmaAdi ?? siparis?.musteri?.yetkili ?? ""}`, `Yetkili: ${siparis?.musteri?.yetkili ?? ""}`],
      [`Telefon: ${siparis?.musteri?.telefon ?? ""}`, `Adres: ${siparis?.musteri?.adres ?? ""}`],
      [`Açıklama: ${siparis?.aciklama ?? ""}`, ``],
    ],
    columnStyles: { 0: { cellWidth: 95 }, 1: { cellWidth: 95 } },
  });

  /* ----- Ürünler ----- */
  const urunler: any[] = Array.isArray(siparis?.urunler) ? siparis.urunler : [];
  const rows: RowInput[] = urunler.map((u: any, i: number) => {
    const adet = NUM(u?.adet);
    const birim = NUM(u?.birimFiyat);
    const tutar = adet * birim;
    return [
      String(i + 1),
      String(u?.urunAdi ?? ""),
      String(u?.renk ?? ""),
      String(adet),
      TL(birim),
      TL(tutar),
    ];
  });

  const startY = ((doc as any).lastAutoTable?.finalY ?? 40) + 6;
  autoTable(doc, {
    startY,
    theme: "grid",
    styles: { font: fontFamily, fontStyle: "normal", fontSize: 10, cellPadding: 2, textColor: 20 },
    headStyles: { fillColor: [230, 230, 230], textColor: 0, font: fontFamily, fontStyle: "bold" },
    head: [["NO", "ÜRÜN/MODEL", "RENK", "ADET", "BİRİM FİYAT (₺)", "TUTAR (₺)"]],
    body: rows,
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: 72 },
      2: { cellWidth: 34 },
      3: { cellWidth: 18, halign: "right" },
      4: { cellWidth: 32, halign: "right" },
      5: { cellWidth: 32, halign: "right" },
    },
  });

  /* ----- Toplamlar ----- */
  const araToplamSatirlardan = urunler.reduce((t, u) => t + NUM(u?.adet) * NUM(u?.birimFiyat), 0);

  const netTutar  = NUM(siparis?.netTutar)  || araToplamSatirlardan;
  const brütTutar = NUM(siparis?.brutTutar);
  const kdvTutarGelen = NUM(siparis?.kdvTutar);

  // kdv oranı tahmini / tercihi
  let kdvOrani = typeof siparis?.kdvOrani === "number" ? Number(siparis.kdvOrani) : undefined;
  if (kdvOrani == null && netTutar > 0 && kdvTutarGelen > 0) {
    kdvOrani = Math.round((kdvTutarGelen / netTutar) * 100);
  }

  // kdv tutarı & brüt
  const kdvTutar = kdvTutarGelen || (kdvOrani != null ? (netTutar * kdvOrani) / 100 : Math.max(0, brütTutar - netTutar));
  const brut = brütTutar || (netTutar + kdvTutar);

  // Toplamlar tablosu (sağa)
  const pageCount = doc.getNumberOfPages();
  doc.setPage(pageCount);
  let y = ((doc as any).lastAutoTable?.finalY ?? 260) + 4;
  if (y > 260) { doc.addPage(); y = 20; }

  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { font: fontFamily, fontStyle: "normal", fontSize: 10, cellPadding: 2 },
    body: [
      ["Ara Toplam", "", "", "", "", TL(netTutar)],
      [`KDV ${kdvOrani != null ? `(%${kdvOrani})` : ""}`, "", "", "", "", TL(kdvTutar)],
      ["Genel Toplam", "", "", "", "", TL(brut)],
    ],
    columnStyles: {
      0: { cellWidth: 60, fontStyle: "bold" },
      1: { cellWidth: 60 },
      2: { cellWidth: 40 },
      3: { cellWidth: 20 },
      4: { cellWidth: 20 },
      5: { cellWidth: 40, halign: "right", fontStyle: "bold" },
    },
  });

  const y2 = ((doc as any).lastAutoTable?.finalY ?? y) + 8;
  doc.setFont(fontFamily, "normal");
  doc.setFontSize(9.5);
  doc.text("Not: Bu teklif 7 gün geçerlidir. Fiyatlara belirtilen KDV oranı uygulanır.", 20, y2);

  /* ----- Sayfa numarası ----- */
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont(fontFamily, "normal");
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Sayfa ${i}/${total}`, 200, 287, { align: "right" });
  }

  /* ----- Önizleme / Kaydet ----- */
  const ad = siparis?.musteri?.firmaAdi ? `Teklif_${siparis.musteri.firmaAdi}.pdf` : "Teklif.pdf";
  try {
    doc.output("dataurlnewwindow");
  } catch {
    doc.save(ad);
  }
}
