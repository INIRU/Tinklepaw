package dev.nyaru.minecraft.listeners

import dev.nyaru.minecraft.NyaruPlugin
import dev.nyaru.minecraft.model.PlayerInfo
import dev.nyaru.minecraft.protection.ProtectionManager
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
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

class ActionBarManager(private val plugin: NyaruPlugin, private val pm: ProtectionManager? = null) : Listener {

    private val cache = ConcurrentHashMap<UUID, PlayerInfo>()
    var chatTabListener: ChatTabListener? = null

    fun getInfo(uuid: UUID): PlayerInfo? = cache[uuid]

    init {
        startRefreshLoop()
        startDisplayLoop()
    }

    @EventHandler
    fun onJoin(event: PlayerJoinEvent) {
        val player = event.player
        plugin.pluginScope.launch {
            delay(3000)
            val info = plugin.apiClient.getPlayer(player.uniqueId.toString())
            if (info?.linked == true) {
                cache[player.uniqueId] = info
                Bukkit.getScheduler().runTask(plugin, Runnable {
                    chatTabListener?.updateTabName(player, info)
                })
            }
        }
    }

    @EventHandler
    fun onQuit(event: PlayerQuitEvent) {
        cache.remove(event.player.uniqueId)
    }

    fun refresh(uuid: UUID) {
        plugin.pluginScope.launch {
            val info = plugin.apiClient.getPlayer(uuid.toString())
            if (info?.linked == true) {
                cache[uuid] = info
                val player = Bukkit.getPlayer(uuid)
                if (player != null) {
                    Bukkit.getScheduler().runTask(plugin, Runnable {
                        chatTabListener?.updateTabName(player, info)
                    })
                }
            } else {
                cache.remove(uuid)
                val player = Bukkit.getPlayer(uuid)
                if (player != null) {
                    Bukkit.getScheduler().runTask(plugin, Runnable {
                        chatTabListener?.updateTabName(player, null)
                    })
                }
            }
        }
    }

    private fun buildActionBarText(info: PlayerInfo, uuid: java.util.UUID): net.kyori.adventure.text.Component {
        val jobKr = when (info.job) {
            "miner" -> "§9광부"
            "farmer" -> "§a농부"
            else -> "§7없음"
        }
        val points = NumberFormat.getNumberInstance(Locale.US).format(info.balance)
        val xpNeeded = (100 * Math.pow(info.level.toDouble(), 1.6)).toInt().coerceAtLeast(1)
        val filledBars = (info.xp.toDouble() / xpNeeded * 8).toInt().coerceIn(0, 8)
        val xpBar = "§a" + "▌".repeat(filledBars) + "§8" + "▌".repeat(8 - filledBars)
        val protectIcon = if (pm?.isProtectionEnabled(uuid.toString()) == true) "§a🔒" else "§7🔓"
        val text = "$jobKr §7Lv.${info.level} $xpBar §8| §e${points}P §8| $protectIcon"
        return LegacyComponentSerializer.legacySection().deserialize(text)
    }

    private fun startDisplayLoop() {
        Bukkit.getScheduler().runTaskTimerAsynchronously(plugin, Runnable {
            for (player in Bukkit.getOnlinePlayers()) {
                val info = cache[player.uniqueId] ?: continue
                player.sendActionBar(buildActionBarText(info, player.uniqueId))
            }
        }, 20L, 30L)
    }

    private fun startRefreshLoop() {
        plugin.pluginScope.launch {
            while (isActive) {
                delay(30_000)
                for (player in Bukkit.getOnlinePlayers()) {
                    val info = plugin.apiClient.getPlayer(player.uniqueId.toString())
                    if (info?.linked == true) {
                        cache[player.uniqueId] = info
                        Bukkit.getScheduler().runTask(plugin, Runnable {
                            chatTabListener?.updateTabName(player, info)
                        })
                    } else {
                        cache.remove(player.uniqueId)
                        Bukkit.getScheduler().runTask(plugin, Runnable {
                            chatTabListener?.updateTabName(player, null)
                        })
                    }
                }
            }
        }
    }
}
