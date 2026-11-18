import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const authorization = req.headers.get('Authorization');
    if (!supabaseUrl || !serviceRoleKey || !anonKey || !authorization) {
      return new Response(JSON.stringify({ error: 'غير مصرح' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'غير مصرح' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: caller } = await adminClient.from('profiles').select('role, is_active').eq('id', userData.user.id).maybeSingle();
    if (!caller || caller.role !== 'admin' || !caller.is_active) {
      return new Response(JSON.stringify({ error: 'غير مصرح' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json() as {
      username?: string;
      email?: string;
      password?: string;
      display_name?: string;
      role?: string;
      action?: string;
      target_id?: string;
      new_password?: string;
      is_active?: boolean;
    };

    const action = body.action || 'create';

    // ── Action: change_password ──
    if (action === 'change_password') {
      const targetId = body.target_id;
      const newPassword = body.new_password;
      if (!targetId || !newPassword || newPassword.length < 6) {
        return new Response(JSON.stringify({ error: 'كلمة المرور قصيرة جدًا (٦ أحرف على الأقل)' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { error: pwdError } = await adminClient.auth.admin.updateUserById(targetId, { password: newPassword });
      if (pwdError) {
        return new Response(JSON.stringify({ error: 'تعذر تغيير كلمة المرور' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Action: create ──
    const role = body.role || 'teacher';
    if (role !== 'teacher' && role !== 'supervisor') {
      return new Response(JSON.stringify({ error: 'الدور غير صالح' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const displayName = body.display_name?.trim();
    const username = body.username?.trim();
    const password = body.password;

    if (!displayName || !password || password.length < 6) {
      return new Response(JSON.stringify({ error: 'تحقق من الاسم وكلمة المرور (٦ أحرف على الأقل)' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // If username provided, check uniqueness
    if (username) {
      const { data: existing } = await adminClient
        .from('profiles')
        .select('id')
        .ilike('username', username)
        .maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ error: 'اسم المستخدم مستخدم بالفعل' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Generate a synthetic email if no email provided (username-based login)
    const email = body.email?.trim().toLowerCase() || `${username || displayName.replace(/\s+/g, '_').toLowerCase()}_${Date.now().toString(36)}@sard.local`;

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError || !created.user) {
      const msg = createError?.message?.includes('already') ? 'الحساب موجود بالفعل' : 'تعذر إنشاء الحساب';
      return new Response(JSON.stringify({ error: msg }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { error: profileError } = await adminClient.from('profiles').insert({
      id: created.user.id,
      email,
      display_name: displayName,
      role,
      username: username || null,
    });
    if (profileError) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      return new Response(JSON.stringify({ error: 'تعذر إكمال إنشاء الحساب' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (role === 'supervisor') {
      await adminClient.from('supervisor_permissions').insert({ profile_id: created.user.id });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ error: 'تعذر تنفيذ العملية' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
