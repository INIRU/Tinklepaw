package dev.nyaru.minecraft.listeners

import dev.nyaru.minecraft.NyaruPlugin
import dev.nyaru.minecraft.model.PlayerInfo
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import net.kyori.adventure.text.Component
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer
import org.bukkit.Bukkit
import org.bukkit.event.EventHandler
import org.bukkit.event.Listener
import org.bukkit.event.player.PlayerJoinEvent
import org.bukkit.event.player.PlayerQuitEvent
import java.text.NumberFormat
import java.util.Locale
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class ActionBarManager(private val plugin: NyaruPlugin) : Listener {

    // Cache of player info (UUID -> PlayerInfo), refreshed every 30s
    private val cache = ConcurrentHashMap<UUID, PlayerInfo>()

    init {
        startRefreshLoop()
        startDisplayLoop()
    }

    @EventHandler
    fun onJoin(event: PlayerJoinEvent) {
        val player = event.player
        plugin.pluginScope.launch {
            delay(3000) // wait for join event processing
            val info = plugin.apiClient.getPlayer(player.uniqueId.toString())
            if (info?.linked == true) cache[player.uniqueId] = info
        }
    }

    @EventHandler
    fun onQuit(event: PlayerQuitEvent) {
        cache.remove(event.player.uniqueId)
    }

    fun refresh(uuid: UUID) {
        plugin.pluginScope.launch {
            val info = plugin.apiClient.getPlayer(uuid.toString())
            if (info?.linked == true) cache[uuid] = info
            else cache.remove(uuid)
        }
    }

    private fun buildActionBar(info: PlayerInfo): Component {
        val jobKr = if (info.job == "miner") "§9광부" else "§a농부"
        val points = NumberFormat.getNumberInstance(Locale.US).format(info.balance)
        val xpNeeded = (100 * Math.pow(info.level.toDouble(), 1.6)).toInt().coerceAtLeast(1)
        val filledBars = (info.xp.toDouble() / xpNeeded * 8).toInt().coerceIn(0, 8)
        val xpBar = "§a" + "▌".repeat(filledBars) + "§8" + "▌".repeat(8 - filledBars)

        val text = buildString {
            if (info.title != null) append("§d§l[${info.title}] §r ")
            append("$jobKr §7Lv.${info.level} $xpBar §8| §e${points}P")
        }
        return LegacyComponentSerializer.legacySection().deserialize(text)
    }

    // Send action bar every 1.5s to keep it visible (fades after ~3s)
    private fun startDisplayLoop() {
        Bukkit.getScheduler().runTaskTimerAsynchronously(plugin, Runnable {
            for (player in Bukkit.getOnlinePlayers()) {
                val info = cache[player.uniqueId] ?: continue
                player.sendActionBar(buildActionBar(info))
            }
        }, 20L, 30L) // start after 1s, repeat every 1.5s
    }

    // Refresh cache every 30s
    private fun startRefreshLoop() {
        plugin.pluginScope.launch {
            while (isActive) {
                delay(30_000)
                for (player in Bukkit.getOnlinePlayers()) {
                    val info = plugin.apiClient.getPlayer(player.uniqueId.toString())
                    if (info?.linked == true) cache[player.uniqueId] = info
                    else cache.remove(player.uniqueId)
                }
            }
        }
    }
}
