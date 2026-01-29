import { createClient } from '@supabase/supabase-js';
import { Database } from '../supabase.types.js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase URL and Key must be defined in environment variables');
}

export const supabase = createClient<Database, 'nyang'>(supabaseUrl, supabaseKey, {
  db: { schema: 'nyang' }
});