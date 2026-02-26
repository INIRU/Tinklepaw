package dev.nyaru.minecraft

import dev.nyaru.minecraft.api.ApiClient
import dev.nyaru.minecraft.commands.NyaruCommand
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

        server.pluginManager.registerEvents(BlockBreakListener(this), this)
        server.pluginManager.registerEvents(BlockDropListener(this), this)
        server.pluginManager.registerEvents(PlayerJoinListener(this), this)

        getCommand("nyaru")?.setExecutor(NyaruCommand(this))
        getCommand("nyaru")?.tabCompleter = NyaruCommand(this)

        logger.info("NyaruPlugin enabled!")
    }

    override fun onDisable() {
        pluginScope.cancel()
        logger.info("NyaruPlugin disabled.")
    }
}
