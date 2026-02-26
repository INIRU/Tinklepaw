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

    const { data: request } = await ctx.supabase
      .schema('nyang')
      .from('minecraft_link_requests')
      .select('otp, expires_at, minecraft_uuid, minecraft_name')
      .eq('discord_user_id', discordUserId)
      .maybeSingle();

    if (!request) {
      await interaction.editReply('❌ 연동 요청을 찾을 수 없습니다. Minecraft에서 `/nyaru 연동 <Discord ID>`를 먼저 실행하세요.');
      return;
    }

    if (new Date(request.expires_at) < new Date()) {
      await interaction.editReply('❌ 연동 코드가 만료되었습니다. Minecraft에서 다시 시도하세요.');
      return;
    }

    if (request.otp !== otp) {
      await interaction.editReply('❌ 잘못된 연동 코드입니다.');
      return;
    }

    if (!request.minecraft_uuid || !request.minecraft_name) {
      await interaction.editReply('❌ 연동 정보가 손상되었습니다. Minecraft에서 다시 시도하세요.');
      return;
    }

    // Check if already linked
    const { data: existing } = await ctx.supabase
      .schema('nyang')
      .from('minecraft_players')
      .select('minecraft_uuid')
      .eq('discord_user_id', discordUserId)
      .maybeSingle();

    if (existing) {
      await interaction.editReply(`ℹ️ 이미 Minecraft 계정이 연동되어 있습니다. (UUID: \`${existing.minecraft_uuid}\`)`);
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
      .eq('discord_user_id', discordUserId);

    await interaction.editReply(
      `✅ **${request.minecraft_name}** 계정 연동 완료!\nMinecraft에서 \`/nyaru 잔고\`로 포인트를 확인하세요.`
    );
  }
};
