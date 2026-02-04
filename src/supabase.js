
import { createClient } from '@supabase/supabase-js';

// These should be replaced with actual Supabase project details
const supabaseUrl = 'https://uemqmwfaeurgmuzpfcyh.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlbXFtd2ZhZXVyZ211enBmY3loIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNzYzMDEsImV4cCI6MjA4NTc1MjMwMX0.8eAC0z-RiVcJoEjLRQxm9tgA6BlX71veCejx_cBXVtY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
