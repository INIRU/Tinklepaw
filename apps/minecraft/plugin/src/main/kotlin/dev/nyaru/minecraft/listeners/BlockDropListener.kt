package dev.nyaru.minecraft.listeners

import dev.nyaru.minecraft.NyaruPlugin
import kotlinx.coroutines.launch
import org.bukkit.Material
import org.bukkit.NamespacedKey
import org.bukkit.event.EventHandler
import org.bukkit.event.EventPriority
import org.bukkit.event.Listener
import org.bukkit.event.block.BlockDropItemEvent
import org.bukkit.persistence.PersistentDataType
import kotlin.math.max

val PURITY_KEY = NamespacedKey("nyaru", "purity")

private val ORE_MATERIALS = setOf(
    Material.COAL_ORE, Material.DEEPSLATE_COAL_ORE,
    Material.IRON_ORE, Material.DEEPSLATE_IRON_ORE,
    Material.GOLD_ORE, Material.DEEPSLATE_GOLD_ORE,
    Material.COPPER_ORE, Material.DEEPSLATE_COPPER_ORE,
    Material.LAPIS_ORE, Material.DEEPSLATE_LAPIS_ORE,
    Material.REDSTONE_ORE, Material.DEEPSLATE_REDSTONE_ORE,
    Material.DIAMOND_ORE, Material.DEEPSLATE_DIAMOND_ORE,
    Material.EMERALD_ORE, Material.DEEPSLATE_EMERALD_ORE,
    Material.ANCIENT_DEBRIS
)

class BlockDropListener(private val plugin: NyaruPlugin) : Listener {

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    fun onBlockDrop(event: BlockDropItemEvent) {
        if (event.block.type !in ORE_MATERIALS) return

        val y = event.block.y
        // purity = clamp(random(60,100) + max(0, (-y / 6)), 50, 100)
        val baseRandom = 60 + (Math.random() * 40).toInt()
        val yBonus = max(0, (-y / 6))
        val purity = (baseRandom + yBonus).coerceIn(50, 100)

        for (item in event.items) {
            item.itemStack.editMeta { meta ->
                meta.persistentDataContainer.set(
                    PURITY_KEY,
                    PersistentDataType.INTEGER,
                    purity
                )
            }
        }

        // Grant XP for mining
        val uuid = event.player.uniqueId.toString()
        plugin.pluginScope.launch {
            plugin.apiClient.grantXp(uuid, 5)
        }
    }
}
