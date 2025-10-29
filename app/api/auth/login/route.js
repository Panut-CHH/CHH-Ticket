// This endpoint is no longer used when Supabase auth is enabled.
// Keeping a minimal handler to avoid breaking existing calls.
export async function POST(request) {
  try {
    const body = await request.json();
    const { email, password } = body || {};
    if (!email || !password) {
      return Response.json({ message: "ข้อมูลไม่ครบถ้วน" }, { status: 400 });
    }
    return Response.json({ message: "Authentication is handled by Supabase." }, { status: 501 });
  } catch (e) {
    return Response.json({ message: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 });
  }
}


