package dev.nyaru.minecraft.commands

import dev.nyaru.minecraft.NyaruPlugin
import dev.nyaru.minecraft.gui.P2PGui
import dev.nyaru.minecraft.gui.QuestGui
import dev.nyaru.minecraft.gui.ShopGui
import kotlinx.coroutines.launch
import org.bukkit.Bukkit
import org.bukkit.command.Command
import org.bukkit.command.CommandExecutor
import org.bukkit.command.CommandSender
import org.bukkit.command.TabCompleter
import org.bukkit.entity.Player

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
                    player.sendMessage("§8§m                                        ")
                    player.sendMessage("§r")
                    player.sendMessage("§d§l연동 코드")
                    player.sendMessage("§r")
                    player.sendMessage("§e§l${result.otp}")
                    player.sendMessage("§r")
                    player.sendMessage("§fDiscord에서 §a/연동확인 ${result.otp} §f입력")
                    player.sendMessage("§75분 내 유효합니다.")
                    player.sendMessage("§r")
                    player.sendMessage("§8§m                                        ")
                } else {
                    player.sendMessage("§c연동 코드 발급 실패. 잠시 후 다시 시도하세요.")
                }
            })
        }
        return true
    }
}

class BalanceCommand(private val plugin: NyaruPlugin) : CommandExecutor {
    override fun onCommand(sender: CommandSender, command: Command, label: String, args: Array<out String>): Boolean {
        if (sender !is Player) { sender.sendMessage("§c플레이어만 사용 가능합니다."); return true }
        val player = sender
        plugin.pluginScope.launch {
            val info = plugin.apiClient.getPlayer(player.uniqueId.toString())
            Bukkit.getScheduler().runTask(plugin, Runnable {
                if (info?.linked == true) {
                    player.sendMessage("§6\uD83D\uDCB0 포인트 잔고: §e${info.balance}P")
                } else {
                    player.sendMessage("§c연동이 필요합니다. §f/연동§c을 입력하세요.")
                }
            })
        }
        return true
    }
}

class JobCommand(private val plugin: NyaruPlugin) : CommandExecutor, TabCompleter {
    override fun onCommand(sender: CommandSender, command: Command, label: String, args: Array<out String>): Boolean {
        if (sender !is Player) { sender.sendMessage("§c플레이어만 사용 가능합니다."); return true }
        val player = sender
        val uuid = player.uniqueId.toString()
        if (args.getOrNull(0)?.lowercase() == "변경") {
            val jobName = args.getOrNull(1)
            val jobKey = when (jobName) {
                "광부" -> "miner"
                "농부" -> "farmer"
                else -> { player.sendMessage("§c사용법: /직업 변경 <광부|농부>"); return true }
            }
            plugin.pluginScope.launch {
                val success = plugin.apiClient.changeJob(uuid, jobKey)
                Bukkit.getScheduler().runTask(plugin, Runnable {
                    if (success) player.sendMessage("§a직업이 §e${jobName}§a으로 변경되었습니다.")
                    else player.sendMessage("§c직업 변경 실패. 포인트가 부족하거나 이미 해당 직업입니다.")
                })
            }
        } else {
            plugin.pluginScope.launch {
                val info = plugin.apiClient.getPlayer(uuid)
                Bukkit.getScheduler().runTask(plugin, Runnable {
                    if (info?.linked == true) {
                        val jobKr = if (info.job == "miner") "광부" else "농부"
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

    override fun onTabComplete(sender: CommandSender, command: Command, alias: String, args: Array<out String>): List<String> {
        if (args.size == 1) return listOf("변경").filter { it.startsWith(args[0]) }
        if (args.size == 2 && args[0] == "변경") return listOf("광부", "농부").filter { it.startsWith(args[1]) }
        return emptyList()
    }
}

class ShopCommand(private val plugin: NyaruPlugin) : CommandExecutor {
    override fun onCommand(sender: CommandSender, command: Command, label: String, args: Array<out String>): Boolean {
        if (sender !is Player) { sender.sendMessage("§c플레이어만 사용 가능합니다."); return true }
        ShopGui(plugin, sender).open()
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
