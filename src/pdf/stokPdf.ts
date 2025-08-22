// src/pdf/stokPdf.ts
import jsPDF from "jspdf";
import autoTable, { RowInput } from "jspdf-autotable";

// ── siparisPdf.ts ile AYNI font yükleme yardımcıları ──────────────
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

  // ArrayBuffer -> base64 (parça parça, büyük dosya güvenli)
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

/** Noto Sans yüklemeyi dener; başarıysa "NotoSans", değilse "helvetica" döner */
async function ensureFontFamily(doc: jsPDF): Promise<string> {
  try {
    // istersen cache kırmak için ?v=1 ekleyebilirsin
    await loadTtf(doc, "/fonts/NotoSans-Regular.ttf", "NotoSans-Regular.ttf", "NotoSans", "normal");
    await loadTtf(doc, "/fonts/NotoSans-Bold.ttf", "NotoSans-Bold.ttf", "NotoSans", "bold");
    doc.setFont("NotoSans", "normal");
    return "NotoSans";
  } catch {
    doc.setFont("helvetica", "normal");
    return "helvetica";
  }
}

// ──────────────────────────────────────────────────────────────────

export type StokSatir = {
  urunAdi: string;
  urunKodu: string;
  renk?: string | null;
  adet: number;
};

export async function stokPdfIndir(rows: StokSatir[], opts?: { baslik?: string }) {
  // siparisPdf ile aynı: mm + a4 + compress
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const family = await ensureFontFamily(doc);

  const baslik = opts?.baslik ?? "STOK LİSTESİ";
  const now = new Date();
  const tarih = now.toLocaleDateString();

  // Başlık
  doc.setFont(family, "bold");
  doc.setFontSize(16);
  doc.setTextColor(0);
  doc.text(baslik, 20, 18);

  doc.setFont(family, "normal");
  doc.setFontSize(11);
  doc.text(`Tarih: ${tarih}`, 200, 18, { align: "right" });

  // Tablo verisi
  const body: RowInput[] = rows.map((r) => ([
    r.urunAdi || "",
    r.urunKodu || "",
    r.renk || "",
    String(Number(r.adet || 0)),
    "" // boş sütun
  ]));

  // Ürünler tablosu
  autoTable(doc, {
    startY: 24,
    theme: "grid",
    styles: {
      font: family,
      fontStyle: "normal",
      fontSize: 10,
      cellPadding: 2,
      textColor: 20,
      valign: "middle",
    },
    headStyles: {
      fillColor: [230, 230, 230],
      textColor: 0,      // başlık siyah
      font: family,
      fontStyle: "bold",
    },
    head: [["ÜRÜN ADI", "KOD", "RENK", "STOK", ""]],
    body,
    // genişlikler mm cinsinden (A4: 210mm)
    columnStyles: {
      0: { cellWidth: 90 },        // Ürün Adı
      1: { cellWidth: 40 },        // Kod
      2: { cellWidth: 40 },        // Renk
      3: { cellWidth: 18, halign: "right" }, // Stok
      4: { cellWidth: 20 },        // boş
    },
  });

  // Alt bilgi: sayfa numaraları (siparisPdf ile aynı stil)
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont(family, "normal");
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Sayfa ${i}/${total}`, 200, 287, { align: "right" });
  }

  // Önizleme (önce yeni pencerede; engellenirse kaydet)
  try {
    doc.output("dataurlnewwindow");
  } catch {
    const pad = (n: number) => String(n).padStart(2, "0");
    doc.save(`stok-listesi-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.pdf`);
  }
}
