package dev.nyaru.minecraft.npc

import de.oliver.fancynpcs.api.FancyNpcsPlugin
import de.oliver.fancynpcs.api.NpcData
import de.oliver.fancynpcs.api.utils.NpcEquipmentSlot
import de.oliver.fancynpcs.api.events.NpcInteractEvent
import dev.nyaru.minecraft.NyaruPlugin
import dev.nyaru.minecraft.gui.JobSelectGui
import dev.nyaru.minecraft.gui.ShopGui
import org.bukkit.Location
import org.bukkit.Material
import org.bukkit.event.EventHandler
import org.bukkit.event.Listener
import org.bukkit.inventory.ItemStack
import org.bukkit.scheduler.BukkitRunnable
import java.util.UUID

class FancyNpcsService(private val plugin: NyaruPlugin) : Listener {

    private val waveTaskIds = mutableMapOf<String, Int>()

    fun createNpc(location: Location, type: NpcType) {
        val id = "nyaru_${type.name.lowercase()}_${System.currentTimeMillis()}"
        val displayName = when (type) {
            NpcType.SHOP -> "<gold><bold>[상점]</bold></gold>"
            NpcType.JOB -> "<green><bold>[직업 변경]</bold></green>"
        }
        val data = NpcData(id, UUID.randomUUID(), location)
        data.setDisplayName(displayName)

        // 플레이어 쪽으로 고개 돌리기
        data.setTurnToPlayer(true)
        data.setTurnToPlayerDistance(8)

        // 손에 아이템 장착
        val heldItem = when (type) {
            NpcType.SHOP -> ItemStack(Material.EMERALD)
            NpcType.JOB -> ItemStack(Material.BOOK)
        }
        data.addEquipment(NpcEquipmentSlot.MAINHAND, heldItem)

        val npc = FancyNpcsPlugin.get().npcAdapter.apply(data)
        FancyNpcsPlugin.get().npcManager.registerNpc(npc)
        npc.create()
        npc.spawnForAll()

        startWaveTask(id, location)
    }

    private fun startWaveTask(npcId: String, location: Location) {
        val task = object : BukkitRunnable() {
            override fun run() {
                val npc = FancyNpcsPlugin.get().npcManager.getNpc(npcId) ?: return
                val world = location.world ?: return
                world.players
                    .filter { it.location.distanceSquared(location) < 10.0 * 10.0 }
                    .forEach { player -> npc.update(player, true) }
            }
        }
        waveTaskIds[npcId] = task.runTaskTimer(plugin, 20L, 80L).taskId // 4초마다
    }

    fun cancelAllWaveTasks() {
        waveTaskIds.values.forEach { plugin.server.scheduler.cancelTask(it) }
        waveTaskIds.clear()
    }

    @EventHandler
    fun onNpcInteract(event: NpcInteractEvent) {
        val name = event.npc.data.name
        val player = event.player
        when {
            name.startsWith("nyaru_shop") -> plugin.server.scheduler.runTask(plugin, Runnable {
                ShopGui(plugin, player).open()
            })
            name.startsWith("nyaru_job") -> plugin.server.scheduler.runTask(plugin, Runnable {
                JobSelectGui(plugin, player).open()
            })
        }
    }
}
