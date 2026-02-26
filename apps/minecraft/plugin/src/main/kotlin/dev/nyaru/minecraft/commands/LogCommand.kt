package dev.nyaru.minecraft.commands

import dev.nyaru.minecraft.logging.BlockLogger
import org.bukkit.command.Command
import org.bukkit.command.CommandExecutor
import org.bukkit.command.CommandSender
import org.bukkit.command.TabCompleter

private const val PAGE_SIZE = 10

class LogCommand(private val blockLogger: BlockLogger) : CommandExecutor, TabCompleter {

    override fun onCommand(sender: CommandSender, command: Command, label: String, args: Array<String>): Boolean {
        if (!sender.hasPermission("nyaru.admin")) {
            sender.sendMessage("§c권한이 없습니다."); return true
        }

        // /로그 [page]  or  /로그 <playerName> [page]
        var playerFilter: String? = null
        var page = 1

        when (args.size) {
            0 -> { /* defaults */ }
            1 -> {
                val num = args[0].toIntOrNull()
                if (num != null) page = num.coerceAtLeast(1)
                else playerFilter = args[0]
            }
            else -> {
                playerFilter = args[0]
                page = (args[1].toIntOrNull() ?: 1).coerceAtLeast(1)
            }
        }

        val entries = blockLogger.readRecent(limit = 500, playerName = playerFilter)
        if (entries.isEmpty()) {
            sender.sendMessage("§7로그가 없습니다."); return true
        }

        val totalPages = (entries.size + PAGE_SIZE - 1) / PAGE_SIZE
        page = page.coerceAtMost(totalPages)
        val from = (page - 1) * PAGE_SIZE
        val slice = entries.drop(from).take(PAGE_SIZE)

        val header = if (playerFilter != null) "§e블럭 로그 §7[§f$playerFilter§7]" else "§e블럭 로그"
        sender.sendMessage("$header §8(${page}/${totalPages}페이지, 총 ${entries.size}건)")
        sender.sendMessage("§8─────────────────────────────")

        slice.forEach { e ->
            val color = if (e.action.name == "PLACE") "§a" else "§c"
            val symbol = if (e.action.name == "PLACE") "+" else "-"
            val time = e.timestamp.toString().substring(5, 16).replace('T', ' ')
            sender.sendMessage("${color}[$symbol] §f${e.playerName} §7${e.material.lowercase()} §8@ §7${e.world} §8(§7${e.x},${e.y},${e.z}§8) §8$time")
        }

        if (totalPages > 1) {
            sender.sendMessage("§8다음 페이지: §7/로그${if (playerFilter != null) " $playerFilter" else ""} ${page + 1}")
        }
        return true
    }

    override fun onTabComplete(sender: CommandSender, command: Command, label: String, args: Array<String>): List<String> {
        if (!sender.hasPermission("nyaru.admin")) return emptyList()
        if (args.size == 1) return sender.server.onlinePlayers.map { it.name }.filter { it.startsWith(args[0]) }
        return emptyList()
    }
}
