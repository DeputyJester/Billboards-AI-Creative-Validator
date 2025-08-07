import { createClient } from "@supabase/supabase-js";

console.log("✅ Supabase URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);
