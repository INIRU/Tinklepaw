import NextAuth from 'next-auth';
import Discord from 'next-auth/providers/discord';

const discordClientId = process.env.DISCORD_CLIENT_ID;
const discordClientSecret = process.env.DISCORD_CLIENT_SECRET;
const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

if (!discordClientId || !discordClientSecret || !authSecret) {
  const missing: string[] = [];
  if (!discordClientId) missing.push('DISCORD_CLIENT_ID');
  if (!discordClientSecret) missing.push('DISCORD_CLIENT_SECRET');
  if (!authSecret) missing.push('AUTH_SECRET (or NEXTAUTH_SECRET)');
  // Don't crash at build-time; surface the misconfig at runtime via NextAuth's error page/logs.
  // eslint-disable-next-line no-console
  console.warn(`[auth] Missing env: ${missing.join(', ')}`);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: authSecret,
  // Fixes "UntrustedHost" during local dev or proxy setups.
  trustHost: process.env.AUTH_TRUST_HOST === 'true' || process.env.NODE_ENV !== 'production',
  providers: [
    Discord({
      clientId: discordClientId ?? '',
      clientSecret: discordClientSecret ?? '',
      authorization: {
        params: {
          scope: 'identify'
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, account, trigger }) {
      if (account?.provider === 'discord') {
        token.discordAccessToken = account.access_token;
        // Discord user id (snowflake)
        token.discordUserId = account.providerAccountId;
        // Force admin check on first login
        token.adminCheckedAt = undefined;
      }

      // Refresh admin status every 5 minutes
      const now = Date.now();
      const lastCheck = (token.adminCheckedAt as number | undefined) ?? 0;
      const FIVE_MINUTES = 5 * 60 * 1000;

      if (trigger === 'update' || now - lastCheck > FIVE_MINUTES) {
        const userId = token.discordUserId as string | undefined;
        if (userId) {
          try {
            const { fetchGuildMember, isAdmin } = await import('./src/lib/server/discord');
            const member = await fetchGuildMember({ userId });
            if (member) {
              token.isAdmin = await isAdmin({ userId, member });
              token.adminCheckedAt = now;
            } else {
              token.isAdmin = false;
              token.adminCheckedAt = now;
            }
          } catch (e) {
            // If Discord API fails, keep previous isAdmin value (don't reset to false)
            console.error('[auth] Failed to check admin status:', e instanceof Error ? e.message : e);
            // Don't update adminCheckedAt so it will retry on next session access
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      const discordUserId = token.discordUserId as string | undefined;
      if (discordUserId) session.user.id = discordUserId;
      session.discordAccessToken = token.discordAccessToken as string | undefined;
      session.isAdmin = token.isAdmin as boolean | undefined;
      return session;
    }
  }
});
