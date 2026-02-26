package dev.nyaru.minecraft.listeners

import dev.nyaru.minecraft.NyaruPlugin
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.bukkit.Bukkit
import org.bukkit.Location
import org.bukkit.event.EventHandler
import org.bukkit.event.EventPriority
import org.bukkit.event.Listener
import org.bukkit.event.player.PlayerJoinEvent
import org.bukkit.event.player.PlayerMoveEvent
import org.bukkit.event.player.PlayerQuitEvent
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class PlayerJoinListener(private val plugin: NyaruPlugin, private val actionBarManager: ActionBarManager) : Listener {

    private val frozenPlayers = ConcurrentHashMap.newKeySet<UUID>()
    private val discordInvite = plugin.config.getString("discord.invite_url") ?: "discord.gg/tinklepaw"

    init {
        startLinkCheckLoop()
    }

    @EventHandler(priority = EventPriority.MONITOR)
    fun onPlayerJoin(event: PlayerJoinEvent) {
        val player = event.player
        val uuid = player.uniqueId.toString()

        plugin.pluginScope.launch {
            val info = plugin.apiClient.getPlayer(uuid)
            if (info?.linked == true) return@launch

            // Auto-generate OTP for the player
            val result = plugin.apiClient.requestLink(uuid, player.name)

            Bukkit.getScheduler().runTask(plugin, Runnable {
                frozenPlayers.add(player.uniqueId)
                sendWelcomeMessage(player, result?.otp)
            })
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    fun onPlayerMove(event: PlayerMoveEvent) {
        if (event.player.uniqueId !in frozenPlayers) return
        val from = event.from
        val to = event.to
        // Allow head rotation (yaw/pitch changes), block XYZ movement
        if (from.x != to.x || from.y != to.y || from.z != to.z) {
            event.to = Location(from.world, from.x, from.y, from.z, to.yaw, to.pitch)
        }
    }

    @EventHandler
    fun onPlayerQuit(event: PlayerQuitEvent) {
        frozenPlayers.remove(event.player.uniqueId)
    }

    private fun sendWelcomeMessage(player: org.bukkit.entity.Player, otp: String?) {
        player.sendMessage("§8§m                                        ")
        player.sendMessage("§r")
        player.sendMessage("§d§l[ 방울냥 Minecraft ]")
        player.sendMessage("§r")
        player.sendMessage("§f이 서버는 Discord 계정 연동이 필요합니다.")
        player.sendMessage("§r")
        if (otp != null) {
            player.sendMessage("§e연동 코드: §f§l$otp")
            player.sendMessage("§r")
            player.sendMessage("§71. §fDiscord 서버에 참여하세요")
            player.sendMessage("§7   §b$discordInvite")
            player.sendMessage("§72. §fDiscord에서 아래 명령어를 입력하세요:")
            player.sendMessage("§7   §a/연동확인 $otp")
        } else {
            player.sendMessage("§71. §fDiscord 서버에 참여하세요")
            player.sendMessage("§7   §b$discordInvite")
            player.sendMessage("§72. §fMinecraft에서 §a/연동§f 을 입력해 코드를 받으세요")
            player.sendMessage("§73. §fDiscord에서 §a/연동확인 <코드>§f 입력")
        }
        player.sendMessage("§r")
        player.sendMessage("§c연동 전까지 이동이 제한됩니다.")
        player.sendMessage("§r")
        player.sendMessage("§8§m                                        ")
    }

    private fun startLinkCheckLoop() {
        plugin.pluginScope.launch {
            while (isActive) {
                delay(10_000)
                val frozen = frozenPlayers.toSet()
                for (uuid in frozen) {
                    val player = Bukkit.getPlayer(uuid)
                    if (player == null) {
                        frozenPlayers.remove(uuid)
                        continue
                    }
                    val info = plugin.apiClient.getPlayer(uuid.toString())
                    if (info?.linked == true) {
                        Bukkit.getScheduler().runTask(plugin, Runnable {
                            frozenPlayers.remove(uuid)
                            player.sendMessage("§a§l✓ Discord 연동 완료! 이동이 허용됩니다.")
                        })
                        actionBarManager.refresh(uuid)
                    }
                }
            }
        }
    }
}
