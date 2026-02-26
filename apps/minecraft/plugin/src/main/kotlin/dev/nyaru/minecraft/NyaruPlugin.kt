package dev.nyaru.minecraft

import dev.nyaru.minecraft.api.ApiClient
import dev.nyaru.minecraft.api.DirectClient
import dev.nyaru.minecraft.commands.AdminCommand
import dev.nyaru.minecraft.commands.BalanceCommand
import dev.nyaru.minecraft.commands.HelpCommand
import dev.nyaru.minecraft.commands.JobCommand
import dev.nyaru.minecraft.commands.LinkCommand
import dev.nyaru.minecraft.commands.LogCommand
import dev.nyaru.minecraft.commands.MarketCommand
import dev.nyaru.minecraft.commands.ProtectCommand
import dev.nyaru.minecraft.commands.QuestCommand
import dev.nyaru.minecraft.commands.SkillCommand
import dev.nyaru.minecraft.commands.TeamCommand
import dev.nyaru.minecraft.commands.TradeCommand
import dev.nyaru.minecraft.commands.UnlinkCommand
import dev.nyaru.minecraft.gui.HelpGui
import dev.nyaru.minecraft.listeners.BlockLogListener
import dev.nyaru.minecraft.logging.BlockLogger
import dev.nyaru.minecraft.protection.ProtectionManager
import dev.nyaru.minecraft.gui.JobSelectGui
import dev.nyaru.minecraft.gui.ShopGui
import dev.nyaru.minecraft.gui.SkillGui
import dev.nyaru.minecraft.listeners.ActionBarManager
import dev.nyaru.minecraft.listeners.BlockBreakListener
import dev.nyaru.minecraft.listeners.BlockDropListener
import dev.nyaru.minecraft.listeners.BlockPlaceListener
import dev.nyaru.minecraft.listeners.ChatTabListener
import dev.nyaru.minecraft.listeners.PlayerJoinListener
import dev.nyaru.minecraft.listeners.ProtectionListener
import dev.nyaru.minecraft.listeners.WorldEventListener
import dev.nyaru.minecraft.npc.NpcType
import dev.nyaru.minecraft.skills.SkillManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.bukkit.plugin.java.JavaPlugin

class NyaruPlugin : JavaPlugin() {

    lateinit var apiClient: ApiClient
        private set

    lateinit var playerJoinListener: PlayerJoinListener
        private set

    lateinit var actionBarManager: ActionBarManager
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

        protectionManager = ProtectionManager(dataFolder)
        server.pluginManager.registerEvents(ProtectionListener(this, protectionManager), this)

        blockLogger = BlockLogger(dataFolder)
        server.pluginManager.registerEvents(BlockLogListener(blockLogger), this)
        server.pluginManager.registerEvents(HelpGui.HelpGuiListener(), this)

        val skillManager = SkillManager(this)
        actionBarManager = ActionBarManager(this, protectionManager)
        val chatTabListener = ChatTabListener(actionBarManager)
        actionBarManager.chatTabListener = chatTabListener

        server.pluginManager.registerEvents(actionBarManager, this)
        server.pluginManager.registerEvents(chatTabListener, this)
        server.pluginManager.registerEvents(skillManager, this)
        server.pluginManager.registerEvents(JobSelectGui.JobSelectListener(this), this)
        server.pluginManager.registerEvents(ShopGui.ShopGuiListener(this), this)
        server.pluginManager.registerEvents(SkillGui.SkillGuiListener(this), this)
        server.pluginManager.registerEvents(BlockBreakListener(this, skillManager), this)
        server.pluginManager.registerEvents(BlockDropListener(this, skillManager), this)
        server.pluginManager.registerEvents(BlockPlaceListener(this, skillManager), this)
        playerJoinListener = PlayerJoinListener(this, actionBarManager)
        server.pluginManager.registerEvents(playerJoinListener, this)

        val worldEventListener = WorldEventListener(this)
        server.pluginManager.registerEvents(worldEventListener, this)
        worldEventListener.onEnable()

        // FancyNpcs integration — checked 1 tick later to avoid load-order issues
        server.scheduler.runTask(this, Runnable {
            npcCreateFn = if (server.pluginManager.isPluginEnabled("FancyNpcs")) {
                val service = dev.nyaru.minecraft.npc.FancyNpcsService(this)
                server.pluginManager.registerEvents(service, this)
                logger.info("FancyNpcs detected — NPC support enabled")
                { loc, type -> service.createNpc(loc, type) }
            } else {
                logger.info("FancyNpcs not found — NPC commands disabled")
                null
            }
        })

        getCommand("연동")?.setExecutor(LinkCommand(this))
        getCommand("연동해제")?.setExecutor(UnlinkCommand(this, actionBarManager, playerJoinListener))
        getCommand("잔고")?.setExecutor(BalanceCommand(this, actionBarManager))
        val jobCmd = JobCommand(this, actionBarManager)
        getCommand("직업")?.setExecutor(jobCmd)
        getCommand("시세")?.setExecutor(MarketCommand(this))
        getCommand("퀘스트")?.setExecutor(QuestCommand(this))
        getCommand("거래소")?.setExecutor(TradeCommand(this))
        getCommand("스킬")?.setExecutor(SkillCommand(this, skillManager))
        val adminCmd = AdminCommand(this)
        getCommand("나루관리")?.setExecutor(adminCmd)
        getCommand("나루관리")?.tabCompleter = adminCmd
        val teamCmd = TeamCommand(protectionManager)
        getCommand("팀")?.setExecutor(teamCmd)
        getCommand("팀")?.tabCompleter = teamCmd
        getCommand("도움말")?.setExecutor(HelpCommand())
        val logCmd = LogCommand(blockLogger, pluginScope)
        getCommand("로그")?.setExecutor(logCmd)
        server.pluginManager.registerEvents(logCmd, this)
        getCommand("보호")?.setExecutor(ProtectCommand(protectionManager))

        logger.info("NyaruPlugin enabled!")
    }

    var npcCreateFn: ((org.bukkit.Location, NpcType) -> Unit)? = null

    lateinit var protectionManager: ProtectionManager
        private set

    lateinit var blockLogger: BlockLogger
        private set

    override fun onDisable() {
        pluginScope.cancel()
        if (::protectionManager.isInitialized) protectionManager.save()
        if (::blockLogger.isInitialized) blockLogger.shutdown()
        logger.info("NyaruPlugin disabled.")
    }
}
