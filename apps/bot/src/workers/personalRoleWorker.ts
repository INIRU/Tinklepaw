import type { Client } from 'discord.js';

import { getBotContext } from '../context.js';

const CHECK_INTERVAL_MS = 5 * 60_000; // 5 minutes

/**
 * Periodically checks that users with personal roles are still boosting
 * (or admin-granted). If a member stopped boosting and is not in the
 * granted whitelist, deletes their Discord role and removes the DB mapping.
 */
export function startPersonalRoleWorker(client: Client) {
  let isRunning = false;

  const tick = async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      const ctx = getBotContext();
      const guild = await client.guilds.fetch(ctx.env.NYARU_GUILD_ID);

      const [{ data: rows, error }, { data: cfgRow }] = await Promise.all([
        ctx.supabase
          .from('personal_roles')
          .select('discord_user_id, discord_role_id'),
        ctx.supabase
          .from('app_config')
          .select('personal_role_granted_user_ids')
          .eq('id', 1)
          .maybeSingle(),
      ]);

      if (error || !rows || rows.length === 0) return;

      const grantedSet = new Set<string>(
        (cfgRow as Record<string, unknown> | null)?.personal_role_granted_user_ids as string[] ?? [],
      );

      for (const row of rows) {
        try {
          // Skip admin-granted users — they keep their role regardless of boost
          if (grantedSet.has(row.discord_user_id)) continue;

          const member = await guild.members.fetch(row.discord_user_id).catch(() => null);

          // Member left the guild or is no longer boosting → clean up
          const shouldRemove = !member || !member.premiumSinceTimestamp;
          if (!shouldRemove) continue;

          // Delete the Discord role
          const role = guild.roles.cache.get(row.discord_role_id)
            ?? await guild.roles.fetch(row.discord_role_id).catch(() => null);

          if (role) {
            await role.delete('Personal role cleanup: user stopped boosting').catch(() => null);
          }

          // Remove DB mapping
          await ctx.supabase
            .from('personal_roles')
            .delete()
            .eq('discord_user_id', row.discord_user_id);

          console.log(
            `[PersonalRoleWorker] Removed personal role for ${row.discord_user_id} (role ${row.discord_role_id})`,
          );
        } catch (err) {
          console.error(`[PersonalRoleWorker] Error processing ${row.discord_user_id}:`, err);
        }
      }
    } catch (err) {
      console.error('[PersonalRoleWorker] tick failed:', err);
    } finally {
      isRunning = false;
      setTimeout(() => {
        void tick();
      }, CHECK_INTERVAL_MS);
    }
  };

  void tick();
}
