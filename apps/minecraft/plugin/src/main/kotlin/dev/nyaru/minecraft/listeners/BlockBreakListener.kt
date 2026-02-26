package dev.nyaru.minecraft.listeners

import dev.nyaru.minecraft.NyaruPlugin
import kotlinx.coroutines.launch
import org.bukkit.Material
import org.bukkit.NamespacedKey
import org.bukkit.event.EventHandler
import org.bukkit.event.EventPriority
import org.bukkit.event.Listener
import org.bukkit.event.block.BlockBreakEvent
import org.bukkit.persistence.PersistentDataType

val HARVEST_TIME_KEY = NamespacedKey("nyaru", "harvest_time")

private val CROP_MATERIALS = setOf(
    Material.WHEAT, Material.POTATOES, Material.CARROTS,
    Material.SUGAR_CANE, Material.PUMPKIN, Material.MELON,
    Material.BEETROOTS, Material.COCOA
)

class BlockBreakListener(private val plugin: NyaruPlugin) : Listener {

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    fun onBlockBreak(event: BlockBreakEvent) {
        if (event.block.type !in CROP_MATERIALS) return

        val player = event.player
        val uuid = player.uniqueId.toString()

        // Tag dropped items with harvest time
        plugin.server.scheduler.runTaskLater(plugin, Runnable {
            val items = event.block.location.world?.getNearbyEntities(
                event.block.location.add(0.5, 0.5, 0.5), 2.0, 2.0, 2.0
            )?.filterIsInstance<org.bukkit.entity.Item>() ?: return@Runnable

            for (item in items) {
                item.itemStack.editMeta { meta ->
                    meta.persistentDataContainer.set(
                        HARVEST_TIME_KEY,
                        PersistentDataType.LONG,
                        System.currentTimeMillis()
                    )
                }
            }
        }, 1L)

        // Grant XP for crop harvest
        plugin.pluginScope.launch {
            plugin.apiClient.grantXp(uuid, 2)
        }
    }
}
