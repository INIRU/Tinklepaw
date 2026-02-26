package dev.nyaru.minecraft.listeners

import dev.nyaru.minecraft.NyaruPlugin
import dev.nyaru.minecraft.model.PlayerInfo
import dev.nyaru.minecraft.protection.ProtectionManager
import io.papermc.paper.scoreboard.numbers.NumberFormat as PaperNumberFormat
import net.kyori.adventure.text.Component
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer
import org.bukkit.Bukkit
import org.bukkit.entity.Player
import org.bukkit.event.EventHandler
import org.bukkit.event.Listener
import org.bukkit.event.player.PlayerQuitEvent
import org.bukkit.scoreboard.Criteria
import org.bukkit.scoreboard.DisplaySlot
import java.text.NumberFormat
import java.util.Locale
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class SidebarManager(private val plugin: NyaruPlugin, private val pm: ProtectionManager?) : Listener {

    private val boards = ConcurrentHashMap<UUID, org.bukkit.scoreboard.Scoreboard>()
    private val legacy = LegacyComponentSerializer.legacySection()

    @EventHandler
    fun onQuit(e: PlayerQuitEvent) {
        boards.remove(e.player.uniqueId)
        e.player.scoreboard = Bukkit.getScoreboardManager().mainScoreboard
    }

    // Must be called from the main thread
    fun update(player: Player, info: PlayerInfo) {
        val sm = Bukkit.getScoreboardManager()
        val board = boards.getOrPut(player.uniqueId) { sm.newScoreboard }
        if (player.scoreboard !== board) player.scoreboard = board

        val objId = "nyaru"
        board.getObjective(objId)?.unregister()
        val obj = board.registerNewObjective(
            objId,
            Criteria.DUMMY,
            legacy.deserialize("§6§l🔔 §f§l방울냥")
        )
        obj.displaySlot = DisplaySlot.SIDEBAR
        obj.numberFormat(PaperNumberFormat.blank())

        val jobKr = when (info.job) {
            "miner" -> "§9⛏ 광부"
            "farmer" -> "§a🌾 농부"
            else -> "§7무직"
        }
        val xpNeeded = (100 * Math.pow(info.level.toDouble(), 1.6)).toInt().coerceAtLeast(1)
        val filled = (info.xp.toDouble() / xpNeeded * 7).toInt().coerceIn(0, 7)
        val xpBar = "§a" + "█".repeat(filled) + "§8" + "█".repeat(7 - filled)
        val xpPct = if (xpNeeded > 0) (info.xp * 100 / xpNeeded) else 0
        val balFmt = NumberFormat.getNumberInstance(Locale.US).format(info.balance)
        val protOn = pm?.isProtectionEnabled(player.uniqueId.toString()) == true
        val protLine = if (protOn) "§a🔒 §7보호 활성" else "§c🔓 §7보호 해제"

        // §8§m + spaces + §r = clean gray horizontal line (classic Minecraft sidebar trick)
        val sep = "§8§m                 §r"

        val lines = listOf(
            sep,
            " $jobKr  §7Lv.§e${info.level}",
            " $xpBar §7${xpPct}%",
            sep,
            " §7잔고",
            " §e${balFmt}§6P",
            sep,
            " $protLine",
            sep,
        )

        // Classic trick: use color codes §0-§8 as unique invisible entries
        // Team prefix holds the actual visible text
        lines.forEachIndexed { i, line ->
            val entry = "§${i.toString(16)}"
            val teamName = "nyaru_$i"
            val team = board.getTeam(teamName) ?: board.registerNewTeam(teamName)
            if (!team.hasEntry(entry)) team.addEntry(entry)
            team.prefix(legacy.deserialize(line))
            team.suffix(Component.empty())
            obj.getScore(entry).score = lines.size - i
        }
    }
}
