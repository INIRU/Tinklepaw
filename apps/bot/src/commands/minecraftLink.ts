import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

import { getBotContext } from '../context.js';
import type { SlashCommand } from './types.js';

export const minecraftLinkCommand: SlashCommand = {
  name: '연동확인',
  json: new SlashCommandBuilder()
    .setName('연동확인')
    .setDescription('Minecraft 계정 연동 OTP를 확인합니다')
    .addStringOption((opt) =>
      opt
        .setName('코드')
        .setDescription('Minecraft에서 받은 6자리 연동 코드')
        .setRequired(true)
        .setMinLength(6)
        .setMaxLength(6)
    )
    .toJSON(),
  async execute(interaction: ChatInputCommandInteraction) {
    const otp = interaction.options.getString('코드', true).toUpperCase().trim();
    const discordUserId = interaction.user.id;

    await interaction.deferReply({ ephemeral: true });

    const ctx = getBotContext();

    // Look up by OTP (generated at join time, before Discord ID was known)
    const { data: request } = await ctx.supabase
      .schema('nyang')
      .from('minecraft_link_requests')
      .select('otp, expires_at, minecraft_uuid, minecraft_name')
      .eq('otp', otp)
      .maybeSingle();

    if (!request) {
      await interaction.editReply('❌ 연동 코드를 찾을 수 없습니다. Minecraft에 다시 접속하거나 `/연동`으로 새 코드를 받으세요.');
      return;
    }

    if (new Date(request.expires_at) < new Date()) {
      await interaction.editReply('❌ 연동 코드가 만료되었습니다. Minecraft에서 `/연동`으로 새 코드를 받으세요.');
      return;
    }

    if (!request.minecraft_uuid || !request.minecraft_name) {
      await interaction.editReply('❌ 연동 정보가 손상되었습니다. Minecraft에서 다시 시도하세요.');
      return;
    }

    // Check if Discord user already linked
    const { data: existingByDiscord } = await ctx.supabase
      .schema('nyang')
      .from('minecraft_players')
      .select('minecraft_uuid')
      .eq('discord_user_id', discordUserId)
      .maybeSingle();

    if (existingByDiscord) {
      await interaction.editReply(`ℹ️ 이미 Minecraft 계정이 연동되어 있습니다. (UUID: \`${existingByDiscord.minecraft_uuid}\`)`);
      return;
    }

    // Check if this Minecraft UUID is already linked to another Discord account
    const { data: existingByUuid } = await ctx.supabase
      .schema('nyang')
      .from('minecraft_players')
      .select('discord_user_id')
      .eq('minecraft_uuid', request.minecraft_uuid)
      .maybeSingle();

    if (existingByUuid) {
      await interaction.editReply('❌ 이미 다른 Discord 계정과 연동된 Minecraft 계정입니다.');
      return;
    }

    // Check that the Discord user exists in the system
    const { data: user } = await ctx.supabase
      .schema('nyang')
      .from('users')
      .select('discord_user_id')
      .eq('discord_user_id', discordUserId)
      .maybeSingle();

    if (!user) {
      await interaction.editReply('❌ Discord 계정이 방울냥 서버에 등록되어 있지 않습니다. 서버에 참여 후 다시 시도하세요.');
      return;
    }

    // Create the link
    const { error: insertError } = await ctx.supabase
      .schema('nyang')
      .from('minecraft_players')
      .insert({
        minecraft_uuid: request.minecraft_uuid,
        discord_user_id: discordUserId,
        minecraft_name: request.minecraft_name,
      });

    if (insertError) {
      console.error('[연동확인] insert error:', insertError);
      await interaction.editReply('❌ 연동 중 오류가 발생했습니다. 잠시 후 다시 시도하세요.');
      return;
    }

    // Init job record
    await ctx.supabase
      .schema('nyang')
      .from('minecraft_jobs')
      .upsert({
        minecraft_uuid: request.minecraft_uuid,
        job: 'miner',
        level: 1,
        xp: 0,
      });

    // Delete the used request
    await ctx.supabase
      .schema('nyang')
      .from('minecraft_link_requests')
      .delete()
      .eq('minecraft_uuid', request.minecraft_uuid);

    await interaction.editReply(
      `✅ **${request.minecraft_name}** 계정 연동 완료!\nMinecraft에서 이동이 허용됩니다.`
    );
  }
};
