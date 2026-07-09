// api/generate-narasi.js
// Serverless function Vercel — perantara aman antara SchoolID dan API AI.
// API key AI disimpan sebagai Environment Variable di dashboard Vercel,
// TIDAK PERNAH ditaruh di kode/browser, supaya tidak bisa dicuri lewat "View Source".

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: 'ANTHROPIC_API_KEY belum diatur di Environment Variables Vercel.'
    });
    return;
  }

  const { nama, jk, kelompok, ringkasan } = req.body || {};
  if (!nama || !ringkasan) {
    res.status(400).json({ error: 'Data murid atau ringkasan ceklis tidak lengkap.' });
    return;
  }

  const prompt = `Kamu adalah guru TK/KB Islami yang berpengalaman menulis narasi rapor perkembangan anak usia dini.

Data murid:
- Nama: ${nama}
- Jenis kelamin: ${jk}
- Kelompok: ${kelompok}

Ringkasan hasil ceklis kegiatan (BB=Belum Berkembang, MB=Mulai Berkembang, BSH=Berkembang Sesuai Harapan, BSB=Berkembang Sangat Baik):
${ringkasan}

Tulis narasi rapor untuk 5 bagian berikut. Gunakan bahasa Indonesia yang hangat, positif, personal (sebut nama depan anak), sesuai kaidah rapor PAUD/TK Kurikulum Merdeka, masing-masing 2-4 kalimat:

1. "agama" — Capaian Nilai Agama dan Budi Pekerti (rujuk hasil kegiatan Diniyyah jika ada)
2. "jatidiri" — Capaian Jati Diri (kemandirian, sosial-emosional, fisik-motorik; rujuk Kesehatan/Ekstrakurikuler jika relevan)
3. "literasi" — Capaian Dasar Literasi, Matematika, Sains, Teknologi, Rekayasa, dan Seni (rujuk Seni Batik/Bahasa Arab jika relevan)
4. "pancasila" — Proyek Penguatan Profil Pelajar Pancasila (kolaborasi, gotong royong, kreativitas)
5. "pesan" — Pesan dan harapan guru untuk anak ke depannya

PENTING: Balas HANYA dengan JSON valid, tanpa markdown, tanpa penjelasan tambahan, format persis seperti ini:
{"agama":"...","jatidiri":"...","literasi":"...","pancasila":"...","pesan":"..."}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: 'AI provider error: ' + errText });
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || '';
    const cleaned = rawText.replace(/```json|```/g, '').trim();

    let narasi;
    try {
      narasi = JSON.parse(cleaned);
    } catch (parseErr) {
      return res.status(502).json({ error: 'Gagal membaca hasil dari AI.' });
    }

    return res.status(200).json(narasi);
  } catch (e) {
    return res.status(500).json({ error: 'Terjadi kesalahan server: ' + e.message });
  }
}
