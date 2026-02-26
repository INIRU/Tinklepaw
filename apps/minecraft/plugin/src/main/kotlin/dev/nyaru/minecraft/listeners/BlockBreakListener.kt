package dev.nyaru.minecraft.listeners

import dev.nyaru.minecraft.NyaruPlugin
import dev.nyaru.minecraft.skills.SkillManager
import dev.nyaru.minecraft.util.triggerLevelUp
import kotlinx.coroutines.launch
import org.bukkit.Material
import org.bukkit.Sound
import org.bukkit.NamespacedKey
import org.bukkit.block.data.Ageable
import org.bukkit.event.EventHandler
import org.bukkit.event.EventPriority
import org.bukkit.event.Listener
import org.bukkit.event.block.BlockBreakEvent
import org.bukkit.inventory.ItemStack
import org.bukkit.persistence.PersistentDataType
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

val HARVEST_TIME_KEY = NamespacedKey("nyaru", "harvest_time")

private val CROP_MATERIALS = setOf(
    Material.WHEAT, Material.POTATOES, Material.CARROTS,
    Material.SUGAR_CANE, Material.PUMPKIN, Material.MELON,
    Material.BEETROOTS, Material.COCOA
)

private val AGEABLE_CROPS = setOf(
    Material.WHEAT, Material.POTATOES, Material.CARROTS, Material.BEETROOTS, Material.COCOA
)

private val CROP_DROP_ITEM = mapOf(
    Material.WHEAT to Material.WHEAT,
    Material.POTATOES to Material.POTATO,
    Material.CARROTS to Material.CARROT,
    Material.SUGAR_CANE to Material.SUGAR_CANE,
    Material.PUMPKIN to Material.PUMPKIN,
    Material.MELON to Material.MELON_SLICE,
    Material.BEETROOTS to Material.BEETROOT,
    Material.COCOA to Material.COCOA_BEANS
)

private val SEED_MATERIALS = setOf(
    Material.WHEAT_SEEDS, Material.BEETROOT_SEEDS,
    Material.MELON_SEEDS, Material.PUMPKIN_SEEDS,
    Material.TORCHFLOWER_SEEDS, Material.PITCHER_POD
)

class BlockBreakListener(private val plugin: NyaruPlugin, private val skillManager: SkillManager) : Listener {

    // Prevent recursive wide harvest
    private val wideHarvestActive = ConcurrentHashMap.newKeySet<UUID>()

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    fun onBlockBreak(event: BlockBreakEvent) {
        if (event.block.type !in CROP_MATERIALS) return

        val player = event.player
        val uuid = player.uniqueId

        // Tag dropped items with harvest time and add lore; remove seeds
        plugin.server.scheduler.runTaskLater(plugin, Runnable {
            val items = event.block.location.world?.getNearbyEntities(
                event.block.location.add(0.5, 0.5, 0.5), 2.0, 2.0, 2.0
            )?.filterIsInstance<org.bukkit.entity.Item>() ?: return@Runnable

            for (item in items) {
                // 씨앗 타입이면 제거
                if (item.itemStack.type in SEED_MATERIALS) {
                    item.remove()
                    continue
                }
                item.itemStack.editMeta { meta ->
                    val windowMs = 5 * 60 * 1000L  // 5분 단위로 반올림 → 같은 시간대 수확 작물 스택 가능
                    val roundedTime = (System.currentTimeMillis() / windowMs) * windowMs
                    meta.persistentDataContainer.set(
                        HARVEST_TIME_KEY,
                        PersistentDataType.LONG,
                        roundedTime
                    )
                    // 신선도 lore 추가
                    val legacy = net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer.legacySection()
                    meta.lore(listOf(
                        legacy.deserialize("§b✦ 신선한 농작물"),
                        legacy.deserialize("§7상점에서 높은 가격을 받습니다."),
                        legacy.deserialize("§7시간이 지날수록 신선도가 감소합니다.")
                    ))
                }
            }
        }, 1L)

        val skills = skillManager.getSkills(uuid)

        // Wide Harvest: 3x3 crop break
        if (skills.wideHarvestLv >= 1 && event.block.type in AGEABLE_CROPS && !wideHarvestActive.contains(uuid)) {
            wideHarvestActive.add(uuid)
            val center = event.block.location
            val world = center.world ?: return
            val tool = player.inventory.itemInMainHand
            player.playSound(player.location, Sound.ITEM_CROP_PLANT, 0.7f, 1.2f)
            plugin.server.scheduler.runTask(plugin, Runnable {
                try {
                    for (dx in -1..1) {
                        for (dz in -1..1) {
                            if (dx == 0 && dz == 0) continue
                            val neighbor = world.getBlockAt(
                                center.blockX + dx, center.blockY, center.blockZ + dz
                            )
                            if (neighbor.type in AGEABLE_CROPS) {
                                val data = neighbor.blockData
                                if (data is Ageable && data.age >= data.maximumAge) {
                                    val neighborLoc = neighbor.location.clone()
                                    neighbor.breakNaturally(tool)
                                    plugin.server.scheduler.runTaskLater(plugin, Runnable {
                                        neighborLoc.world?.getNearbyEntities(
                                            neighborLoc.add(0.5, 0.5, 0.5), 1.5, 1.5, 1.5
                                        )?.filterIsInstance<org.bukkit.entity.Item>()
                                            ?.filter { it.itemStack.type in SEED_MATERIALS }
                                            ?.forEach { it.remove() }
                                    }, 2L)
                                }
                            }
                        }
                    }
                } finally {
                    wideHarvestActive.remove(uuid)
                }
            })
        }

        // Harvest Fortune: extra drops
        val harvestFortune = skills.harvestFortuneLv
        if (harvestFortune > 0 && event.block.type in CROP_MATERIALS) {
            val dropMaterial = CROP_DROP_ITEM[event.block.type]
            if (dropMaterial != null) {
                player.playSound(player.location, Sound.ENTITY_ITEM_PICKUP, 0.6f, 1.4f)
                plugin.server.scheduler.runTaskLater(plugin, Runnable {
                    event.block.location.world?.dropItemNaturally(
                        event.block.location.add(0.5, 0.5, 0.5),
                        ItemStack(dropMaterial, harvestFortune)
                    )
                }, 2L)
            }
        }

        // Grant XP for crop harvest
        plugin.pluginScope.launch {
            val result = plugin.apiClient.grantXp(uuid.toString(), 2)
            if (result?.leveledUp == true) {
                plugin.server.scheduler.runTask(plugin, Runnable {
                    triggerLevelUp(plugin, player, result.level, result.newSkillPoints)
                })
            }
        }
    }
}
