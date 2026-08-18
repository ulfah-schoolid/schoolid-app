// api/create-guru-account.js
// Serverless function Vercel — hanya Kepala Sekolah yang boleh pakai ini
// untuk membuat akun login Guru baru. Pakai SUPABASE_SERVICE_ROLE_KEY
// yang PUNYA AKSES PENUH, makanya HARUS jalan di server, tidak boleh
// pernah ditaruh di kode index.html.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || 'https://qjtyndbcaxdczphnxivv.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY belum diatur di Environment Variables Vercel.' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const callerToken = authHeader.replace('Bearer ', '');
  if (!callerToken) {
    res.status(401).json({ error: 'Tidak ada sesi login. Silakan login ulang.' });
    return;
  }

  const { nama, email, password, kelasId } = req.body || {};
  if (!nama || !email || !password || password.length < 6) {
    res.status(400).json({ error: 'Nama, email, dan password (min 6 karakter) wajib diisi.' });
    return;
  }

  try {
    // 1. Cek identitas pemanggil (harus user yang sedang login)
    const callerRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${callerToken}`, apikey: serviceKey }
    });
    if (!callerRes.ok) {
      const errText = await callerRes.text();
      res.status(401).json({ error: 'Sesi login tidak valid. Detail: ' + errText });
      return;
    }
    const callerUser = await callerRes.json();
    if (!callerUser || !callerUser.id) {
      res.status(401).json({ error: 'Gagal membaca identitas pengguna. Coba login ulang.' });
      return;
    }

    // 2. Cek peran pemanggil di tabel profiles — HARUS 'kepala'
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${callerUser.id}&select=role,nama`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`
        }
      }
    );

    if (!profileRes.ok) {
      const errText = await profileRes.text();
      res.status(500).json({ error: 'Gagal cek profil (status ' + profileRes.status + '): ' + errText });
      return;
    }

    const profileData = await profileRes.json();

    if (!Array.isArray(profileData) || profileData.length === 0) {
      res.status(403).json({
        error: 'Profil pengguna tidak ditemukan di tabel profiles. User ID: ' + callerUser.id
      });
      return;
    }

    if (profileData[0].role !== 'kepala') {
      res.status(403).json({
        error: 'Hanya Kepala Sekolah yang boleh membuat akun Guru. Peran terdeteksi: "' + profileData[0].role + '"'
      });
      return;
    }

    // 3. Buat akun Auth baru untuk Guru (pakai Admin API, otomatis terverifikasi)
    const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { role: 'guru', nama }
      })
    });
    const createData = await createRes.json();
    if (!createRes.ok) {
      res.status(400).json({ error: createData?.msg || createData?.error_description || createData?.error || 'Gagal membuat akun. Mungkin email sudah dipakai.' });
      return;
    }

    // 4. Simpan/perbarui data profil (role, nama, kelas)
    const profileInsertRes = await fetch(`${supabaseUrl}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ id: createData.id, role: 'guru', nama, kelas_id: kelasId || null })
    });

    if (!profileInsertRes.ok) {
      const errText = await profileInsertRes.text();
      // Akun auth sudah terlanjur dibuat, tapi profilnya gagal disimpan — tetap kasih tahu
      res.status(200).json({
        success: true,
        userId: createData.id,
        warning: 'Akun berhasil dibuat, tapi gagal simpan data profil: ' + errText
      });
      return;
    }

    res.status(200).json({ success: true, userId: createData.id });
  } catch (e) {
    res.status(500).json({ error: 'Terjadi kesalahan server: ' + e.message });
  }
}
