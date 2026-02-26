package dev.nyaru.minecraft.commands

import dev.nyaru.minecraft.NyaruPlugin
import dev.nyaru.minecraft.gui.P2PGui
import dev.nyaru.minecraft.gui.QuestGui
import dev.nyaru.minecraft.gui.ShopGui
import kotlinx.coroutines.launch
import org.bukkit.command.Command
import org.bukkit.command.CommandExecutor
import org.bukkit.command.CommandSender
import org.bukkit.command.TabCompleter
import org.bukkit.entity.Player

class NyaruCommand(private val plugin: NyaruPlugin) : CommandExecutor, TabCompleter {

    override fun onCommand(sender: CommandSender, command: Command, label: String, args: Array<out String>): Boolean {
        if (sender !is Player) {
            sender.sendMessage("§c플레이어만 사용 가능합니다.")
            return true
        }

        val player = sender
        val uuid = player.uniqueId.toString()

        when (args.getOrNull(0)?.lowercase()) {
            "연동" -> {
                val discordId = args.getOrNull(1)
                if (discordId.isNullOrBlank()) {
                    player.sendMessage("§c사용법: /nyaru 연동 <Discord ID>")
                    return true
                }
                plugin.pluginScope.launch {
                    val result = plugin.apiClient.requestLink(discordId, uuid, player.name)
                    org.bukkit.Bukkit.getScheduler().runTask(plugin, Runnable {
                        if (result != null) {
                            player.sendMessage("§a연동 코드: §e§l${result.otp}")
                            player.sendMessage("§75분 내에 Discord에서 §f/연동확인 ${result.otp} §7을 입력하세요.")
                        } else {
                            player.sendMessage("§c연동 요청 실패. Discord ID를 확인해 주세요.")
                        }
                    })
                }
            }

            "잔고" -> {
                plugin.pluginScope.launch {
                    val info = plugin.apiClient.getPlayer(uuid)
                    org.bukkit.Bukkit.getScheduler().runTask(plugin, Runnable {
                        if (info?.linked == true) {
                            player.sendMessage("§6\uD83D\uDCB0 포인트 잔고: §e${info.balance}P")
                        } else {
                            player.sendMessage("§c연동이 필요합니다. /nyaru 연동 <Discord ID>")
                        }
                    })
                }
            }

            "직업" -> {
                if (args.getOrNull(1)?.lowercase() == "변경") {
                    val jobName = args.getOrNull(2)?.lowercase()
                    val jobKey = when (jobName) {
                        "광부" -> "miner"
                        "농부" -> "farmer"
                        else -> {
                            player.sendMessage("§c사용법: /nyaru 직업 변경 <광부|농부>")
                            return@onCommand true
                        }
                    }
                    plugin.pluginScope.launch {
                        val success = plugin.apiClient.changeJob(uuid, jobKey)
                        org.bukkit.Bukkit.getScheduler().runTask(plugin, Runnable {
                            if (success) {
                                player.sendMessage("§a직업이 §e${jobName}§a으로 변경되었습니다.")
                            } else {
                                player.sendMessage("§c직업 변경 실패. 포인트가 부족하거나 이미 해당 직업입니다.")
                            }
                        })
                    }
                } else {
                    plugin.pluginScope.launch {
                        val info = plugin.apiClient.getPlayer(uuid)
                        org.bukkit.Bukkit.getScheduler().runTask(plugin, Runnable {
                            if (info?.linked == true) {
                                val jobKr = if (info.job == "miner") "광부" else "농부"
                                val xpNeeded = (100 * Math.pow(info.level.toDouble(), 1.6)).toInt()
                                val bar = buildXpBar(info.xp, xpNeeded)
                                player.sendMessage("§6직업: §e$jobKr §7(Lv.${info.level})")
                                player.sendMessage("§7XP: §f${info.xp}/$xpNeeded $bar")
                            } else {
                                player.sendMessage("§c연동이 필요합니다.")
                            }
                        })
                    }
                }
            }

            "상점" -> ShopGui(plugin, player).open()

            "시세" -> {
                plugin.pluginScope.launch {
                    val items = plugin.apiClient.getMarket()
                    org.bukkit.Bukkit.getScheduler().runTask(plugin, Runnable {
                        player.sendMessage("§6=== 현재 시세 ===")
                        for (item in items.take(10)) {
                            val sign = if (item.currentPrice >= item.basePrice) "§a▲" else "§c▼"
                            player.sendMessage("$sign §e${item.displayName}: §f${item.currentPrice}P")
                        }
                    })
                }
            }

            "퀘스트" -> QuestGui(plugin, player).open()

            "거래소" -> P2PGui(plugin, player).open()

            "랭킹" -> {
                player.sendMessage("§c랭킹 기능은 준비 중입니다.")
            }

            else -> {
                player.sendMessage("§6=== Nyaru 명령어 ===")
                player.sendMessage("§f/nyaru 연동 <Discord ID> §7- 계정 연동")
                player.sendMessage("§f/nyaru 잔고 §7- 포인트 잔고")
                player.sendMessage("§f/nyaru 직업 §7- 직업 정보")
                player.sendMessage("§f/nyaru 직업 변경 <광부|농부> §7- 직업 변경")
                player.sendMessage("§f/nyaru 상점 §7- 마켓 GUI")
                player.sendMessage("§f/nyaru 시세 §7- 현재 시세")
                player.sendMessage("§f/nyaru 퀘스트 §7- 퀘스트 GUI")
                player.sendMessage("§f/nyaru 거래소 §7- P2P 거래소 GUI")
            }
        }

        return true
    }

    override fun onTabComplete(
        sender: CommandSender, command: Command, alias: String, args: Array<out String>
    ): List<String> {
        if (args.size == 1) {
            return listOf("연동", "잔고", "직업", "상점", "시세", "퀘스트", "거래소", "랭킹")
                .filter { it.startsWith(args[0]) }
        }
        if (args.size == 2 && args[0] == "직업") return listOf("변경")
        if (args.size == 3 && args[0] == "직업" && args[1] == "변경") {
            return listOf("광부", "농부").filter { it.startsWith(args[2]) }
        }
        return emptyList()
    }

    private fun buildXpBar(current: Int, max: Int): String {
        val filled = if (max > 0) (current * 20 / max).coerceIn(0, 20) else 0
        return "§a" + "█".repeat(filled) + "§7" + "█".repeat(20 - filled)
    }
}
