package dev.nyaru.minecraft

import dev.nyaru.minecraft.api.ApiClient
import dev.nyaru.minecraft.api.DirectClient
import dev.nyaru.minecraft.commands.AdminCommand
import dev.nyaru.minecraft.commands.BalanceCommand
import dev.nyaru.minecraft.commands.JobCommand
import dev.nyaru.minecraft.commands.LinkCommand
import dev.nyaru.minecraft.commands.MarketCommand
import dev.nyaru.minecraft.commands.QuestCommand
import dev.nyaru.minecraft.commands.ShopCommand
import dev.nyaru.minecraft.commands.TradeCommand
import dev.nyaru.minecraft.commands.UnlinkCommand
import dev.nyaru.minecraft.gui.JobSelectGui
import dev.nyaru.minecraft.listeners.ActionBarManager
import dev.nyaru.minecraft.listeners.BlockBreakListener
import dev.nyaru.minecraft.listeners.BlockDropListener
import dev.nyaru.minecraft.listeners.ChatTabListener
import dev.nyaru.minecraft.listeners.PlayerJoinListener
import dev.nyaru.minecraft.listeners.WorldEventListener
import dev.nyaru.minecraft.npc.NpcType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.bukkit.plugin.java.JavaPlugin

class NyaruPlugin : JavaPlugin() {

    lateinit var apiClient: ApiClient
        private set

    val pluginScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onEnable() {
        saveDefaultConfig()

        val apiUrl = System.getenv("MINECRAFT_API_URL")
            ?: config.getString("api.url")
            ?: error("MINECRAFT_API_URL env var or api.url in config.yml required")
        val apiKey = System.getenv("MINECRAFT_API_KEY")
            ?: config.getString("api.key")
            ?: error("MINECRAFT_API_KEY env var or api.key in config.yml required")

        val supabaseUrl = System.getenv("SUPABASE_URL")
            ?: config.getString("supabase.url")?.takeIf { it.isNotEmpty() }
        val supabaseKey = System.getenv("SUPABASE_SERVICE_ROLE_KEY")
            ?: config.getString("supabase.key")?.takeIf { it.isNotEmpty() }
        val discordToken = System.getenv("DISCORD_BOT_TOKEN")
            ?: config.getString("discord.token")?.takeIf { it.isNotEmpty() }
        val discordGuildId = System.getenv("NYARU_GUILD_ID")
            ?: config.getString("discord.guild_id")?.takeIf { it.isNotEmpty() }

        val directClient = if (supabaseUrl != null && supabaseKey != null) {
            logger.info("Direct Supabase connection enabled")
            DirectClient(supabaseUrl, supabaseKey, discordToken, discordGuildId)
        } else {
            logger.info("Direct Supabase not configured, using Vercel API")
            null
        }

        apiClient = ApiClient(apiUrl, apiKey, directClient)

        val actionBarManager = ActionBarManager(this)
        val chatTabListener = ChatTabListener(actionBarManager)
        actionBarManager.chatTabListener = chatTabListener

        server.pluginManager.registerEvents(actionBarManager, this)
        server.pluginManager.registerEvents(chatTabListener, this)
        server.pluginManager.registerEvents(JobSelectGui.JobSelectListener(this), this)
        server.pluginManager.registerEvents(BlockBreakListener(this), this)
        server.pluginManager.registerEvents(BlockDropListener(this), this)
        server.pluginManager.registerEvents(PlayerJoinListener(this, actionBarManager), this)

        val worldEventListener = WorldEventListener(this)
        server.pluginManager.registerEvents(worldEventListener, this)
        worldEventListener.onEnable()

        // FancyNpcs integration (soft-depend — only loaded if plugin is present)
        val createNpc: ((org.bukkit.Location, NpcType) -> Unit)? =
            if (server.pluginManager.isPluginEnabled("FancyNpcs")) {
                val service = dev.nyaru.minecraft.npc.FancyNpcsService(this)
                server.pluginManager.registerEvents(service, this)
                logger.info("FancyNpcs detected — NPC support enabled")
                val fn: (org.bukkit.Location, NpcType) -> Unit = { loc, type -> service.createNpc(loc, type) }
                fn
            } else {
                logger.info("FancyNpcs not found — NPC commands disabled")
                null
            }

        getCommand("연동")?.setExecutor(LinkCommand(this))
        getCommand("연동해제")?.setExecutor(UnlinkCommand(this, actionBarManager))
        getCommand("잔고")?.setExecutor(BalanceCommand(this, actionBarManager))
        val jobCmd = JobCommand(this, actionBarManager)
        getCommand("직업")?.setExecutor(jobCmd)
        getCommand("직업")?.tabCompleter = jobCmd
        getCommand("상점")?.setExecutor(ShopCommand(this))
        getCommand("시세")?.setExecutor(MarketCommand(this))
        getCommand("퀘스트")?.setExecutor(QuestCommand(this))
        getCommand("거래소")?.setExecutor(TradeCommand(this))
        val adminCmd = AdminCommand(this, createNpc)
        getCommand("나루관리")?.setExecutor(adminCmd)
        getCommand("나루관리")?.tabCompleter = adminCmd

        logger.info("NyaruPlugin enabled!")
    }

    override fun onDisable() {
        pluginScope.cancel()
        logger.info("NyaruPlugin disabled.")
    }
}
