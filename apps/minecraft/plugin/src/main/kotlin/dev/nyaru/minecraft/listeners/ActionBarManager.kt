package dev.nyaru.minecraft.listeners

import dev.nyaru.minecraft.NyaruPlugin
import dev.nyaru.minecraft.cache.PlayerCache
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

    // Local display cache — always valid for immediate action bar rendering
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
                    plugin.sidebarManager.update(player, info)
                })
            }
        }
    }

    @EventHandler
    fun onQuit(event: PlayerQuitEvent) {
        val uuid = event.player.uniqueId
        cache.remove(uuid)
        PlayerCache.invalidate(uuid.toString())
    }

    fun refresh(uuid: UUID) {
        plugin.pluginScope.launch {
            PlayerCache.invalidate(uuid.toString())
            val info = plugin.apiClient.getPlayer(uuid.toString())
            val player = Bukkit.getPlayer(uuid)
            if (info?.linked == true) {
                cache[uuid] = info
                if (player != null) {
                    Bukkit.getScheduler().runTask(plugin, Runnable {
                        chatTabListener?.updateTabName(player, if (info.linked) info else null)
                        if (info.linked) plugin.sidebarManager.update(player, info)
                    })
                }
            } else {
                cache.remove(uuid)
                if (player != null) {
                    Bukkit.getScheduler().runTask(plugin, Runnable {
                        chatTabListener?.updateTabName(player, null)
                    })
                }
            }
        }
    }

    /** Update balance locally without API call */
    fun updateBalance(uuid: UUID, newBalance: Int) {
        val info = cache[uuid] ?: return
        cache[uuid] = info.copy(balance = newBalance)
    }

    /** Update XP/level locally without API call */
    fun updateXp(uuid: UUID, level: Int, xp: Int) {
        val info = cache[uuid] ?: return
        cache[uuid] = info.copy(level = level, xp = xp)
    }

    /** Update job locally without API call */
    fun updateJob(uuid: UUID, job: String) {
        val info = cache[uuid] ?: return
        cache[uuid] = info.copy(job = job, level = 1, xp = 0)
    }

    private fun buildActionBarText(info: PlayerInfo, uuid: UUID): net.kyori.adventure.text.Component {
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
        }, 20L, 60L)
    }

    private fun startRefreshLoop() {
        plugin.pluginScope.launch {
            while (isActive) {
                delay(300_000)
                for (player in Bukkit.getOnlinePlayers()) {
                    val info = plugin.apiClient.getPlayer(player.uniqueId.toString())
                    if (info?.linked == true) {
                        cache[player.uniqueId] = info
                        Bukkit.getScheduler().runTask(plugin, Runnable {
                            chatTabListener?.updateTabName(player, info)
                            plugin.sidebarManager.update(player, info)
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
