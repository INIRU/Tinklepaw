package dev.nyaru.minecraft

import dev.nyaru.minecraft.cache.PlayerCache
import org.bukkit.entity.Player
import org.bukkit.scheduler.BukkitRunnable
import kotlin.math.floor
import kotlin.math.pow

class HudService(private val plugin: NyaruPlugin) {

    init {
        plugin.server.messenger.registerOutgoingPluginChannel(plugin, "dev.nyaru:hud")

        // Periodic refresh every 5s for all online players
        object : BukkitRunnable() {
            override fun run() {
                plugin.server.onlinePlayers.forEach { sendUpdate(it) }
            }
        }.runTaskTimer(plugin, 100L, 100L)
    }

    fun sendUpdate(player: Player) {
        val info = PlayerCache.get(player.uniqueId.toString())?.info ?: return
        val level = info.level
        val xpToNext = floor(100.0 * level.toDouble().pow(1.6)).toInt().coerceAtLeast(1)
        val json = buildString {
            append("{")
            append("\"balance\":${info.balance},")
            append("\"job\":\"${info.job ?: ""}\",")
            append("\"level\":$level,")
            append("\"xp\":${info.xp},")
            append("\"xpToNext\":$xpToNext")
            append("}")
        }
        runCatching {
            player.sendPluginMessage(plugin, "dev.nyaru:hud", json.toByteArray(Charsets.UTF_8))
        }
    }

    fun unregister() {
        plugin.server.messenger.unregisterOutgoingPluginChannel(plugin, "dev.nyaru:hud")
    }
}
