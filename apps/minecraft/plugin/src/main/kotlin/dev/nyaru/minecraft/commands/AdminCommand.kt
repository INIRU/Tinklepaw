package dev.nyaru.minecraft.commands

import dev.nyaru.minecraft.NyaruPlugin
import dev.nyaru.minecraft.npc.NpcType
import org.bukkit.Location
import org.bukkit.command.Command
import org.bukkit.command.CommandExecutor
import org.bukkit.command.CommandSender
import org.bukkit.command.TabCompleter
import org.bukkit.entity.Player

class AdminCommand(
    private val plugin: NyaruPlugin,
    private val createNpc: ((Location, NpcType) -> Unit)?
) : CommandExecutor, TabCompleter {

    override fun onCommand(sender: CommandSender, command: Command, label: String, args: Array<out String>): Boolean {
        if (!sender.hasPermission("nyaru.admin")) {
            sender.sendMessage("§c권한이 없습니다.")
            return true
        }
        if (sender !is Player) {
            sender.sendMessage("§c플레이어만 사용 가능합니다.")
            return true
        }
        if (args.getOrNull(0)?.lowercase() != "npc") {
            sender.sendMessage("§f/방울냥관리 npc <상점|직업>")
            return true
        }
        if (createNpc == null) {
            sender.sendMessage("§cFancyNpcs 플러그인이 설치되지 않았습니다.")
            return true
        }
        val type = when (args.getOrNull(1)) {
            "상점" -> NpcType.SHOP
            "직업" -> NpcType.JOB
            else -> { sender.sendMessage("§c사용법: /방울냥관리 npc <상점|직업>"); return true }
        }
        createNpc(sender.location, type)
        sender.sendMessage("§aNPC가 현재 위치에 생성되었습니다.")
        return true
    }

    override fun onTabComplete(sender: CommandSender, command: Command, alias: String, args: Array<out String>): List<String> {
        if (args.size == 1) return listOf("npc").filter { it.startsWith(args[0]) }
        if (args.size == 2 && args[0] == "npc") return listOf("상점", "직업").filter { it.startsWith(args[1]) }
        return emptyList()
    }
}
