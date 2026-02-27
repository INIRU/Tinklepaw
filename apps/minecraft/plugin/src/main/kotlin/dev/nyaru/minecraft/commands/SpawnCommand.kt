package dev.nyaru.minecraft.commands

import dev.nyaru.minecraft.NyaruPlugin
import dev.nyaru.minecraft.cache.PlayerCache
import kotlinx.coroutines.launch
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer
import org.bukkit.Bukkit
import org.bukkit.Location
import org.bukkit.Sound
import org.bukkit.command.Command
import org.bukkit.command.CommandExecutor
import org.bukkit.command.CommandSender
import org.bukkit.entity.Player
import org.bukkit.scheduler.BukkitRunnable
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class SpawnCommand(private val plugin: NyaruPlugin) : CommandExecutor {

    companion object {
        private const val COST = 1000
        private const val COUNTDOWN_TICKS = 60L // 3 seconds
        private val legacy = LegacyComponentSerializer.legacySection()
    }

    // uuid → starting location (null entry means cancellation in progress)
    private val pending = ConcurrentHashMap<UUID, Location>()

    override fun onCommand(sender: CommandSender, command: Command, label: String, args: Array<out String>): Boolean {
        if (sender !is Player) { sender.sendMessage("§c플레이어만 사용 가능합니다."); return true }
        val player = sender
        val uuid = player.uniqueId

        if (pending.containsKey(uuid)) {
            player.sendMessage("§c이미 귀환 중입니다.")
            return true
        }

        val balance = PlayerCache.getBalance(uuid.toString())
        if (balance == null) {
            player.sendMessage("§7포인트 정보를 불러오는 중...")
            plugin.pluginScope.launch {
                val info = plugin.apiClient.getPlayer(uuid.toString())
                Bukkit.getScheduler().runTask(plugin, Runnable {
                    if (!player.isOnline) return@Runnable
                    if (info == null || !info.linked) {
                        player.sendMessage("§cDiscord 계정이 연동되지 않았습니다. §7(/연동 으로 연동하세요)")
                        return@Runnable
                    }
                    if (info.balance < COST) {
                        player.sendMessage("§c포인트가 부족합니다. §7(현재 §e${info.balance}P§7, 필요 §e${COST}P§7)")
                        return@Runnable
                    }
                    startCountdown(player)
                })
            }
            return true
        }
        if (balance < COST) {
            player.sendMessage("§c포인트가 부족합니다. §7(현재 §e${balance}P§7, 필요 §e${COST}P§7)")
            return true
        }

        startCountdown(player)
        return true
    }

    private fun startCountdown(player: Player) {
        val uuid = player.uniqueId
        val startLoc = player.location.clone()
        pending[uuid] = startLoc
        player.sendMessage("§a§l✦ §f스폰 귀환 §7— §e3초 동안 움직이지 마세요! §7(비용: §e${COST}P§7)")
        player.playSound(player.location, Sound.BLOCK_NOTE_BLOCK_PLING, 0.8f, 1.2f)

        var ticksLeft = COUNTDOWN_TICKS.toInt()

        object : BukkitRunnable() {
            override fun run() {
                if (!player.isOnline || !pending.containsKey(uuid)) { cancel(); return }

                // Movement check
                if (player.location.distanceSquared(startLoc) > 0.09) { // ~0.3 block
                    pending.remove(uuid)
                    player.sendActionBar(legacy.deserialize("§c귀환 취소 — 이동 감지"))
                    player.sendMessage("§c이동이 감지되어 귀환이 취소되었습니다.")
                    player.playSound(player.location, Sound.ENTITY_VILLAGER_NO, 0.8f, 1.0f)
                    cancel()
                    return
                }

                ticksLeft -= 2
                val secsLeft = (ticksLeft / 20.0).let { Math.ceil(it).toInt() }.coerceAtLeast(0)

                if (ticksLeft <= 0) {
                    pending.remove(uuid)

                    // Optimistic deduct
                    PlayerCache.updateBalance(uuid.toString(), -COST)
                    plugin.actionBarManager.refresh(uuid)

                    // Teleport
                    val spawn = player.world.spawnLocation
                    player.teleport(spawn)
                    player.playSound(spawn, Sound.ENTITY_ENDERMAN_TELEPORT, 0.8f, 1.0f)
                    player.sendMessage("§a§l✦ §f스폰으로 귀환했습니다! §7(§e-${COST}P§7)")

                    // Background API deduct
                    plugin.pluginScope.launch {
                        val ok = plugin.apiClient.spendPoints(uuid.toString(), COST, "스폰 귀환")
                        if (!ok) {
                            // Rollback
                            PlayerCache.updateBalance(uuid.toString(), COST)
                            plugin.actionBarManager.refresh(uuid)
                            Bukkit.getScheduler().runTask(plugin, Runnable {
                                player.sendMessage("§c포인트 차감 실패. 환불 처리되었습니다.")
                            })
                        }
                    }
                    cancel()
                    return
                }

                // Countdown action bar
                val bar = "§6§l" + "█".repeat(secsLeft) + "§8" + "█".repeat(3 - secsLeft)
                player.sendActionBar(legacy.deserialize("§f스폰 귀환 $bar §e${secsLeft}초 §7(${COST}P)"))
            }
        }.runTaskTimer(plugin, 0L, 2L)
    }
}
