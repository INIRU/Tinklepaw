import { EmbedBuilder, Message, type Interaction, TextChannel } from 'discord.js';
import { getBotContext } from './context.js';
import { getAppConfig } from './services/config.js';
import { randomUUID } from 'crypto';

export async function handleError(
  error: unknown, 
  context: Interaction | Message, 
  commandName?: string
) {
  const ctx = getBotContext();
  const config = await getAppConfig().catch(() => ({ 
    error_log_channel_id: null, 
    show_traceback_to_user: true 
  }));

  const errorMessage = error instanceof Error ? error.message : String(error);
  const stackTrace = error instanceof Error ? error.stack : 'No stack trace';
  const userId = context instanceof Message ? context.author.id : context.user.id;

  let errorId: string = randomUUID();
  try {
    type ErrorLogInsert = {
      discord_user_id: string;
      command_name: string;
      error_message: string;
      stack_trace: string;
      metadata: { channel_id: string | null; guild_id: string | null };
    };
    
    const insertData: ErrorLogInsert = {
      discord_user_id: userId,
      command_name: commandName || (context instanceof Message ? 'message' : 'interaction'),
      error_message: errorMessage,
      stack_trace: stackTrace || '',
      metadata: {
        channel_id: context.channelId ?? null,
        guild_id: context.guildId ?? null,
      }
    };
    
    const result = await ctx.supabase
      .from('error_logs' as never)
      .insert(insertData as never)
      .select('error_id')
      .single() as { data?: { error_id?: string } | null; error?: unknown } | null;
    
    if (result?.data?.error_id) errorId = result.data.error_id;
  } catch (e) {
    console.error('[ErrorHandler] Failed to log to DB:', e);
  }

  console.error('[ErrorHandler]', {
    errorId,
    command: commandName || (context instanceof Message ? 'Message' : 'Interaction'),
    userId,
    channelId: context.channelId ?? null,
    guildId: context.guildId ?? null,
    errorMessage,
    stackTrace
  });

  if (config.error_log_channel_id) {
    try {
      const channel = await context.client.channels.fetch(config.error_log_channel_id);
      if (channel instanceof TextChannel) {
        const adminEmbed = new EmbedBuilder()
          .setTitle('🚨 봇 에러 발생')
          .setColor(0xFF0000)
          .addFields(
            { name: '에러 ID', value: `\`${errorId}\``, inline: true },
            { name: '사용자', value: `<@${userId}>`, inline: true },
            { name: '명령어/이벤트', value: `\`${commandName || (context instanceof Message ? 'Message' : 'Interaction')}\``, inline: true },
            { name: '메시지', value: `\`\`\`${errorMessage.substring(0, 1000)}\`\`\`` },
            { name: 'Stack Trace', value: `\`\`\`${(stackTrace || '').substring(0, 1000)}\`\`\`` }
          )
          .setTimestamp();
        
        await channel.send({ embeds: [adminEmbed] });
      }
    } catch (e) {
      console.error('[ErrorHandler] Failed to notify admin channel:', e);
    }
  }

  const userEmbed = new EmbedBuilder()
    .setTitle('❌ 에러가 발생했습니다')
    .setDescription('처리 중 문제가 발생했습니다. 관리자에게 문의해 주세요.')
    .setColor(0xFF4500)
    .addFields({ name: '에러 고유 ID', value: `\`${errorId}\`` })
    .setTimestamp();

  if (config.show_traceback_to_user) {
    userEmbed.addFields({ name: '로그', value: `\`\`\`${errorMessage.substring(0, 200)}\`\`\`` });
  }

  try {
    if (context instanceof Message) {
      await context.reply({ embeds: [userEmbed] });
    } else if (context.isRepliable()) {
      if (context.replied || context.deferred) {
        await context.editReply({ content: null, embeds: [userEmbed], components: [], files: [] });
      } else {
        await context.reply({ embeds: [userEmbed] });
      }
    }
  } catch (e) {
    console.error('[ErrorHandler] Failed to reply to user:', e);
  }
}
