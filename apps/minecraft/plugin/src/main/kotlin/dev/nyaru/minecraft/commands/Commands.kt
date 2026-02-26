package dev.nyaru.minecraft.commands

import dev.nyaru.minecraft.NyaruPlugin
import dev.nyaru.minecraft.gui.JobSelectGui
import dev.nyaru.minecraft.gui.P2PGui
import dev.nyaru.minecraft.gui.QuestGui
import dev.nyaru.minecraft.gui.ShopGui
import dev.nyaru.minecraft.gui.SkillGui
import dev.nyaru.minecraft.skills.SkillManager
import kotlinx.coroutines.launch
import net.kyori.adventure.text.Component
import net.kyori.adventure.text.event.ClickEvent
import net.kyori.adventure.text.event.HoverEvent
import net.kyori.adventure.text.format.NamedTextColor
import net.kyori.adventure.text.format.TextDecoration
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer
import org.bukkit.Bukkit
import org.bukkit.command.Command
import org.bukkit.command.CommandExecutor
import org.bukkit.command.CommandSender
import org.bukkit.command.TabCompleter
import org.bukkit.entity.Player
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class LinkCommand(private val plugin: NyaruPlugin) : CommandExecutor {
    override fun onCommand(sender: CommandSender, command: Command, label: String, args: Array<out String>): Boolean {
        if (sender !is Player) { sender.sendMessage("§c플레이어만 사용 가능합니다."); return true }
        val player = sender
        val uuid = player.uniqueId.toString()
        plugin.pluginScope.launch {
            val info = plugin.apiClient.getPlayer(uuid)
            if (info?.linked == true) {
                Bukkit.getScheduler().runTask(plugin, Runnable {
                    player.sendMessage("§a이미 Discord 계정이 연동되어 있습니다.")
                })
                return@launch
            }
            val result = plugin.apiClient.requestLink(uuid, player.name)
            Bukkit.getScheduler().runTask(plugin, Runnable {
                if (result != null) {
                    val otp = result.otp
                    val otpComponent = Component.text(otp)
                        .color(NamedTextColor.YELLOW)
                        .decoration(TextDecoration.BOLD, true)
                        .clickEvent(ClickEvent.copyToClipboard(otp))
                        .hoverEvent(HoverEvent.showText(Component.text("클릭하여 복사", NamedTextColor.GRAY)))
                    player.sendMessage(LegacyComponentSerializer.legacySection().deserialize("§8§m                                        "))
                    player.sendMessage(Component.empty())
                    player.sendMessage(LegacyComponentSerializer.legacySection().deserialize("§d§l연동 코드"))
                    player.sendMessage(Component.empty())
                    player.sendMessage(
                        Component.text()
                            .append(LegacyComponentSerializer.legacySection().deserialize("§f코드: "))
                            .append(otpComponent)
                            .append(LegacyComponentSerializer.legacySection().deserialize(" §7(클릭하여 복사)"))
                            .build()
                    )
                    player.sendMessage(Component.empty())
                    player.sendMessage(LegacyComponentSerializer.legacySection().deserialize("§fDiscord에서 §a/연동확인 $otp §f입력"))
                    player.sendMessage(LegacyComponentSerializer.legacySection().deserialize("§75분 내 유효합니다."))
                    player.sendMessage(Component.empty())
                    player.sendMessage(LegacyComponentSerializer.legacySection().deserialize("§8§m                                        "))
                } else {
                    player.sendMessage("§c연동 코드 발급 실패. 잠시 후 다시 시도하세요.")
                }
            })
        }
        return true
    }
}

class UnlinkCommand(
    private val plugin: NyaruPlugin,
    private val actionBarManager: dev.nyaru.minecraft.listeners.ActionBarManager,
    private val playerJoinListener: dev.nyaru.minecraft.listeners.PlayerJoinListener
) : CommandExecutor {
    private val pendingConfirm = ConcurrentHashMap<UUID, Long>()

    override fun onCommand(sender: CommandSender, command: Command, label: String, args: Array<out String>): Boolean {
        if (sender !is Player) { sender.sendMessage("§c플레이어만 사용 가능합니다."); return true }
        val player = sender

        if (args.getOrNull(0)?.lowercase() == "확인") {
            val timestamp = pendingConfirm[player.uniqueId]
            if (timestamp == null || System.currentTimeMillis() - timestamp > 30_000) {
                player.sendMessage("§c먼저 §f/연동해제§c를 입력하세요.")
                pendingConfirm.remove(player.uniqueId)
                return true
            }
            pendingConfirm.remove(player.uniqueId)
            plugin.pluginScope.launch {
                val success = plugin.apiClient.unlinkPlayer(player.uniqueId.toString())
                Bukkit.getScheduler().runTask(plugin, Runnable {
                    if (success) {
                        playerJoinListener.refreezeAndRequestLink(player)
                        player.sendMessage("§a연동이 해제되었습니다. 재연동 코드가 발급되었습니다.")
                    } else {
                        player.sendMessage("§c연동 해제 실패. 연동된 계정이 없거나 오류가 발생했습니다.")
                    }
                })
                if (success) {
                    actionBarManager.refresh(player.uniqueId)
                }
            }
        } else {
            pendingConfirm[player.uniqueId] = System.currentTimeMillis()
            val confirmBtn = Component.text("[확인]")
                .color(NamedTextColor.RED)
                .decoration(TextDecoration.BOLD, true)
                .clickEvent(ClickEvent.runCommand("/연동해제 확인"))
                .hoverEvent(HoverEvent.showText(Component.text("클릭하여 연동 해제 확인", NamedTextColor.GRAY)))
            player.sendMessage(
                Component.text()
                    .append(LegacyComponentSerializer.legacySection().deserialize("§c Discord 연동을 해제하시겠습니까? "))
                    .append(confirmBtn)
                    .append(LegacyComponentSerializer.legacySection().deserialize(" §7(30초 내)"))
                    .build()
            )
        }
        return true
    }
}

class BalanceCommand(private val plugin: NyaruPlugin, private val actionBarManager: dev.nyaru.minecraft.listeners.ActionBarManager) : CommandExecutor {
    override fun onCommand(sender: CommandSender, command: Command, label: String, args: Array<out String>): Boolean {
        if (sender !is Player) { sender.sendMessage("§c플레이어만 사용 가능합니다."); return true }
        val player = sender
        val cached = actionBarManager.getInfo(player.uniqueId)
        if (cached?.linked == true) {
            val points = java.text.NumberFormat.getNumberInstance(java.util.Locale.US).format(cached.balance)
            player.sendMessage("§6\uD83D\uDCB0 포인트 잔고: §e${points}P")
            plugin.pluginScope.launch { actionBarManager.refresh(player.uniqueId) }
        } else {
            plugin.pluginScope.launch {
                val info = plugin.apiClient.getPlayer(player.uniqueId.toString())
                Bukkit.getScheduler().runTask(plugin, Runnable {
                    if (info?.linked == true) {
                        val points = java.text.NumberFormat.getNumberInstance(java.util.Locale.US).format(info.balance)
                        player.sendMessage("§6\uD83D\uDCB0 포인트 잔고: §e${points}P")
                    } else {
                        player.sendMessage("§c연동이 필요합니다. §f/연동§c을 입력하세요.")
                    }
                })
            }
        }
        return true
    }
}

class JobCommand(private val plugin: NyaruPlugin, private val actionBarManager: dev.nyaru.minecraft.listeners.ActionBarManager) : CommandExecutor {
    override fun onCommand(sender: CommandSender, command: Command, label: String, args: Array<out String>): Boolean {
        if (sender !is Player) { sender.sendMessage("§c플레이어만 사용 가능합니다."); return true }
        val player = sender
        val uuid = player.uniqueId.toString()
        val cached = actionBarManager.getInfo(player.uniqueId)
        if (cached?.linked == true) {
            val jobKr = when (cached.job) { "miner" -> "광부"; "farmer" -> "농부"; else -> "없음" }
            val xpNeeded = (100 * Math.pow(cached.level.toDouble(), 1.6)).toInt()
            val filled = if (xpNeeded > 0) (cached.xp * 20 / xpNeeded).coerceIn(0, 20) else 0
            val bar = "§a" + "█".repeat(filled) + "§7" + "█".repeat(20 - filled)
            player.sendMessage("§6직업: §e$jobKr §7(Lv.${cached.level})")
            player.sendMessage("§7XP: §f${cached.xp}/$xpNeeded $bar")
            plugin.pluginScope.launch { actionBarManager.refresh(player.uniqueId) }
        } else {
            plugin.pluginScope.launch {
                val info = plugin.apiClient.getPlayer(uuid)
                Bukkit.getScheduler().runTask(plugin, Runnable {
                    if (info?.linked == true) {
                        val jobKr = when (info.job) { "miner" -> "광부"; "farmer" -> "농부"; else -> "없음" }
                        val xpNeeded = (100 * Math.pow(info.level.toDouble(), 1.6)).toInt()
                        val filled = if (xpNeeded > 0) (info.xp * 20 / xpNeeded).coerceIn(0, 20) else 0
                        val bar = "§a" + "█".repeat(filled) + "§7" + "█".repeat(20 - filled)
                        player.sendMessage("§6직업: §e$jobKr §7(Lv.${info.level})")
                        player.sendMessage("§7XP: §f${info.xp}/$xpNeeded $bar")
                    } else {
                        player.sendMessage("§c연동이 필요합니다. §f/연동§c을 입력하세요.")
                    }
                })
            }
        }
        return true
    }
}

class MarketCommand(private val plugin: NyaruPlugin) : CommandExecutor {
    override fun onCommand(sender: CommandSender, command: Command, label: String, args: Array<out String>): Boolean {
        if (sender !is Player) { sender.sendMessage("§c플레이어만 사용 가능합니다."); return true }
        val player = sender
        plugin.pluginScope.launch {
            val items = plugin.apiClient.getMarket()
            Bukkit.getScheduler().runTask(plugin, Runnable {
                player.sendMessage("§6=== 현재 시세 ===")
                for (item in items.take(10)) {
                    val sign = if (item.currentPrice >= item.basePrice) "§a▲" else "§c▼"
                    player.sendMessage("$sign §e${item.displayName}: §f${item.currentPrice}P")
                }
            })
        }
        return true
    }
}

class QuestCommand(private val plugin: NyaruPlugin) : CommandExecutor {
    override fun onCommand(sender: CommandSender, command: Command, label: String, args: Array<out String>): Boolean {
        if (sender !is Player) { sender.sendMessage("§c플레이어만 사용 가능합니다."); return true }
        QuestGui(plugin, sender).open()
        return true
    }
}

class TradeCommand(private val plugin: NyaruPlugin) : CommandExecutor {
    override fun onCommand(sender: CommandSender, command: Command, label: String, args: Array<out String>): Boolean {
        if (sender !is Player) { sender.sendMessage("§c플레이어만 사용 가능합니다."); return true }
        P2PGui(plugin, sender).open()
        return true
    }
}

class SkillCommand(private val plugin: NyaruPlugin, private val skillManager: SkillManager) : CommandExecutor {
    override fun onCommand(sender: CommandSender, command: Command, label: String, args: Array<out String>): Boolean {
        if (sender !is Player) { sender.sendMessage("§c플레이어만 사용 가능합니다."); return true }
        SkillGui(plugin, sender, skillManager).open()
        return true
    }
}
