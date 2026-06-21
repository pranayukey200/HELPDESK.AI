-- Create revoked tokens table for session revocation
CREATE TABLE IF NOT EXISTS revoked_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL,
    revoked_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at TIMESTAMPTZ
);

-- Add index on token for fast lookups
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_token ON revoked_tokens(token);

-- Add index on user_id for quick revocation of all user tokens
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_user_id ON revoked_tokens(user_id);

-- Enable RLS on revoked_tokens table
ALTER TABLE revoked_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only service role can insert and query revoked tokens
CREATE POLICY "Service role full access to revoked tokens" ON revoked_tokens
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
