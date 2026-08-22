import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Token tidak ditemukan. Pastikan Anda sudah login.' 
      });
    }
    const token = authHeader.split(' ')[1];

    const supabaseUser = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return res.status(401).json({ 
        error: 'Token tidak valid atau sesi sudah habis. Silakan login ulang.',
        detail: userError?.message 
      });
    }

    const { data: profile, error: profileError } = await supabaseUser
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return res.status(403).json({ 
        error: 'Profil tidak ditemukan.',
        detail: profileError?.message 
      });
    }

    if (profile.role !== 'kepala_sekolah' && profile.role !== 'kepala') {
      return res.status(403).json({ 
        error: `Akses ditolak. Role Anda: "${profile.role}". Hanya Kepala Sekolah yang boleh membuat akun Guru.`
      });
    }

    const { email, password, nama, nip } = req.body;
    if (!email || !password || !nama) {
      return res.status(400).json({ 
        error: 'Data tidak lengkap. Email, password, dan nama wajib diisi.' 
      });
    }
    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'Password minimal 6 karakter.' 
      });
    }

    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nama, role: 'guru' }
    });

    if (createError) {
      let pesanError = createError.message;
      if (pesanError.includes('already registered')) {
        pesanError = `Email "${email}" sudah terdaftar. Gunakan email lain.`;
      }
      return res.status(400).json({ error: pesanError });
    }

    const { error: profileInsertError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: newUser.user.id,
        nama,
        role: 'guru',
      });

    if (profileInsertError) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      return res.status(500).json({ 
        error: 'Gagal menyimpan profil guru.',
        detail: profileInsertError.message 
      });
    }

    await supabaseAdmin
      .from('guru')
      .insert({
        user_id: newUser.user.id,
        nama,
        nip: nip || null,
        email
      });

    return res.status(200).json({ 
      success: true, 
      message: `Akun guru untuk ${nama} (${email}) berhasil dibuat.`,
      userId: newUser.user.id
    });

  } catch (err) {
    return res.status(500).json({ 
      error: 'Terjadi kesalahan server.',
      detail: err.message 
    });
  }
}
