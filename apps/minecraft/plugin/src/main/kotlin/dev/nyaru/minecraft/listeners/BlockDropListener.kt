package dev.nyaru.minecraft.listeners

import dev.nyaru.minecraft.NyaruPlugin
import dev.nyaru.minecraft.skills.SkillManager
import dev.nyaru.minecraft.util.triggerLevelUp
import kotlinx.coroutines.launch
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer
import org.bukkit.Material
import org.bukkit.Sound
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

class BlockDropListener(private val plugin: NyaruPlugin, private val skillManager: SkillManager) : Listener {

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
                // 순정도 lore 추가
                val legacy = net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer.legacySection()
                val purityColor = when {
                    purity >= 90 -> "§d"
                    purity >= 75 -> "§b"
                    purity >= 60 -> "§a"
                    else -> "§7"
                }
                meta.lore(listOf(
                    legacy.deserialize("${purityColor}✦ 순정도: §f${purity}%"),
                    legacy.deserialize("§7상점에서 높은 가격을 받습니다."),
                    legacy.deserialize("§7Y좌표가 낮을수록 순정도가 높아집니다.")
                ))
            }
        }

        // Lucky Strike: chance to double drops
        val luckyLv = skillManager.getSkills(event.player.uniqueId).luckyStrikeLv
        if (luckyLv > 0) {
            val chance = luckyLv * 0.15
            if (Math.random() < chance) {
                val extraItems = event.items.map { it.itemStack.clone() }
                for (extra in extraItems) {
                    event.block.world.dropItemNaturally(event.block.location, extra)
                }
                event.player.playSound(event.player.location, Sound.ENTITY_EXPERIENCE_ORB_PICKUP, 1.0f, 1.5f)
                event.player.sendActionBar(
                    LegacyComponentSerializer.legacySection()
                        .deserialize("\u00A76\u2726 \u00A7e\uD589\uC6B4 \uCC44\uAD74! \u00A77\uC544\uC774\uD15C\uC774 2\uBC30\uC785\uB2C8\uB2E4.")
                )
            }
        }

        // Grant XP for mining
        val player = event.player
        val uuid = player.uniqueId.toString()
        plugin.pluginScope.launch {
            val result = plugin.apiClient.grantXp(uuid, 5)
            if (result?.leveledUp == true) {
                plugin.server.scheduler.runTask(plugin, Runnable {
                    triggerLevelUp(plugin, player, result.level, result.newSkillPoints)
                })
            }
        }
    }
}
