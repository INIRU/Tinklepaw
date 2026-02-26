package dev.nyaru.minecraft

import dev.nyaru.minecraft.api.ApiClient
import dev.nyaru.minecraft.commands.BalanceCommand
import dev.nyaru.minecraft.commands.JobCommand
import dev.nyaru.minecraft.commands.LinkCommand
import dev.nyaru.minecraft.commands.MarketCommand
import dev.nyaru.minecraft.commands.QuestCommand
import dev.nyaru.minecraft.commands.ShopCommand
import dev.nyaru.minecraft.commands.TradeCommand
import dev.nyaru.minecraft.listeners.ActionBarManager
import dev.nyaru.minecraft.listeners.BlockBreakListener
import dev.nyaru.minecraft.listeners.BlockDropListener
import dev.nyaru.minecraft.listeners.PlayerJoinListener
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

        apiClient = ApiClient(apiUrl, apiKey)

        val actionBarManager = ActionBarManager(this)
        server.pluginManager.registerEvents(actionBarManager, this)
        server.pluginManager.registerEvents(BlockBreakListener(this), this)
        server.pluginManager.registerEvents(BlockDropListener(this), this)
        server.pluginManager.registerEvents(PlayerJoinListener(this, actionBarManager), this)

        getCommand("연동")?.setExecutor(LinkCommand(this))
        getCommand("잔고")?.setExecutor(BalanceCommand(this))
        val jobCmd = JobCommand(this)
        getCommand("직업")?.setExecutor(jobCmd)
        getCommand("직업")?.tabCompleter = jobCmd
        getCommand("상점")?.setExecutor(ShopCommand(this))
        getCommand("시세")?.setExecutor(MarketCommand(this))
        getCommand("퀘스트")?.setExecutor(QuestCommand(this))
        getCommand("거래소")?.setExecutor(TradeCommand(this))

        logger.info("NyaruPlugin enabled!")
    }

    override fun onDisable() {
        pluginScope.cancel()
        logger.info("NyaruPlugin disabled.")
    }
}
