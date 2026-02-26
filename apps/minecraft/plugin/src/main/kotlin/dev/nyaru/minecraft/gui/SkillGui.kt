package dev.nyaru.minecraft.gui

import dev.nyaru.minecraft.NyaruPlugin
import dev.nyaru.minecraft.model.SkillData
import dev.nyaru.minecraft.skills.SkillManager
import kotlinx.coroutines.launch
import net.kyori.adventure.text.Component
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer
import org.bukkit.Bukkit
import org.bukkit.Material
import org.bukkit.Sound
import org.bukkit.entity.Player
import org.bukkit.event.EventHandler
import org.bukkit.event.Listener
import org.bukkit.event.inventory.InventoryClickEvent
import org.bukkit.event.inventory.InventoryCloseEvent
import org.bukkit.inventory.Inventory
import org.bukkit.inventory.ItemStack
import java.util.concurrent.ConcurrentHashMap

class SkillGui(
    private val plugin: NyaruPlugin,
    private val player: Player,
    private val skillManager: SkillManager
) {

    companion object {
        val activeInventories = ConcurrentHashMap<Inventory, SkillGui>()
    }

    private lateinit var inventory: Inventory
    private var skills: SkillData = skillManager.getSkills(player.uniqueId)
    private var job: String? = null
    private var playerLevel: Int = 1

    private val legacy = LegacyComponentSerializer.legacySection()

    fun open() {
        plugin.pluginScope.launch {
            val playerInfo = plugin.apiClient.getPlayer(player.uniqueId.toString())
            if (playerInfo?.linked != true) {
                Bukkit.getScheduler().runTask(plugin, Runnable {
                    player.sendMessage("§c연동이 필요합니다. §f/연동§c을 입력하세요.")
                })
                return@launch
            }
            val job = playerInfo.job
            if (job == null) {
                Bukkit.getScheduler().runTask(plugin, Runnable {
                    player.sendMessage("§c직업을 먼저 선택해주세요. NPC에서 직업을 선택할 수 있습니다.")
                })
                return@launch
            }
            this@SkillGui.job = job
            this@SkillGui.playerLevel = playerInfo.level
            skills = plugin.apiClient.getSkills(player.uniqueId.toString())
            skillManager.updateCache(player.uniqueId, skills)
            Bukkit.getScheduler().runTask(plugin, Runnable {
                val title = if (job == "miner") "§b§l⛏ 광부 스킬" else "§a§l🌾 농부 스킬"
                inventory = Bukkit.createInventory(null, 54, legacy.deserialize(title))
                populate(job)
                player.openInventory(inventory)
                activeInventories[inventory] = this@SkillGui
                player.playSound(player.location, Sound.BLOCK_ENCHANTMENT_TABLE_USE, 0.8f, 1.0f)
            })
        }
    }

    private fun populate(currentJob: String?) {
        inventory.clear()

        if (currentJob == "miner") {
            val bgGlass = makeGlass(Material.BLUE_STAINED_GLASS_PANE)
            val accentGlass = makeGlass(Material.CYAN_STAINED_GLASS_PANE)
            for (i in 0 until 54) inventory.setItem(i, bgGlass)

            // Skill point display - slot 4
            inventory.setItem(4, buildSkillPointItem())

            // Cyan accent corners/borders
            for (slot in listOf(0, 8, 45, 53)) inventory.setItem(slot, accentGlass)

            // slot 20: Mining Speed
            inventory.setItem(20, buildSkillItem(
                Material.DIAMOND_PICKAXE,
                "§b⛏ 채굴 속도",
                skills.miningSpeedLv, 3,
                listOf(
                    "§7채굴 속도(Haste)를 부여합니다.",
                    "§7Lv1: Haste I / Lv2: Haste II / Lv3: Haste III"
                ),
                "§8광부 스킬",
                listOf(1, 5, 10)
            ))

            // slot 22: Lucky Strike
            inventory.setItem(22, buildSkillItem(
                Material.NETHER_STAR,
                "§b✨ 행운 채굴",
                skills.luckyStrikeLv, 3,
                listOf(
                    "§7광물 채굴 시 드롭이 2배가 될 수 있습니다.",
                    "§7Lv1: 15% / Lv2: 30% / Lv3: 45%"
                ),
                "§8광부 스킬",
                listOf(3, 8, 15)
            ))

            // slot 24: Stone Skin
            inventory.setItem(24, buildSkillItem(
                Material.IRON_CHESTPLATE,
                "§b🛡 철갑 피부",
                skills.stoneSkinLv, 3,
                listOf(
                    "§7영구 저항(Resistance)을 부여합니다.",
                    "§7Lv1: Resistance I / Lv2: Resistance II / Lv3: Resistance III"
                ),
                "§8광부 스킬",
                listOf(7, 12, 20)
            ))
        } else {
            val bgGlass = makeGlass(Material.GREEN_STAINED_GLASS_PANE)
            val accentGlass = makeGlass(Material.LIME_STAINED_GLASS_PANE)
            for (i in 0 until 54) inventory.setItem(i, bgGlass)

            // Skill point display - slot 4
            inventory.setItem(4, buildSkillPointItem())

            // Lime accent corners/borders
            for (slot in listOf(0, 8, 45, 53)) inventory.setItem(slot, accentGlass)

            // slot 19: Wide Harvest
            inventory.setItem(19, buildSkillItem(
                Material.GOLDEN_HOE,
                "§a🌾 넓은 수확",
                skills.wideHarvestLv, 1,
                listOf(
                    "§7작물 수확 시 3x3 범위로 확장됩니다.",
                    "§7Lv1: 3x3 범위 수확"
                ),
                "§8농부 스킬",
                listOf(3)
            ))

            // slot 21: Wide Plant
            inventory.setItem(21, buildSkillItem(
                Material.WHEAT_SEEDS,
                "§a🌱 넓은 파종",
                skills.widePlantLv, 1,
                listOf(
                    "§7씨앗 심기 시 3x3 범위로 확장됩니다.",
                    "§7Lv1: 3x3 범위 파종 (씨앗 소모)"
                ),
                "§8농부 스킬",
                listOf(5)
            ))

            // slot 23: Freshness Master
            inventory.setItem(23, buildSkillItem(
                Material.CLOCK,
                "§a⏱ 신선도 마스터",
                skills.freshnessLv, 3,
                listOf(
                    "§7작물 신선도 감소를 느리게 합니다.",
                    "§7Lv1: -15% 감소 / Lv2: -30% 감소 / Lv3: -45% 감소"
                ),
                "§8농부 스킬",
                listOf(1, 7, 15)
            ))

            // slot 25: Harvest Fortune
            inventory.setItem(25, buildSkillItem(
                Material.WHEAT,
                "§a🍀 풍작",
                skills.harvestFortuneLv, 3,
                listOf(
                    "§7작물 수확 시 추가 아이템을 드롭합니다.",
                    "§7Lv1: +1 / Lv2: +2 / Lv3: +3 추가 드롭"
                ),
                "§8농부 스킬",
                listOf(5, 10, 20)
            ))
        }
    }

    private fun buildSkillPointItem(): ItemStack {
        val emerald = ItemStack(Material.EMERALD)
        emerald.editMeta { meta ->
            meta.displayName(legacy.deserialize("§a스킬 포인트: §f${skills.skillPoints}P"))
            meta.lore(listOf(
                legacy.deserialize("§7레벨업 시 스킬 포인트를 획득합니다."),
                legacy.deserialize("§7스킬 업그레이드에 1포인트가 필요합니다.")
            ))
        }
        return emerald
    }

    private fun buildSkillItem(
        material: Material,
        name: String,
        currentLv: Int,
        maxLv: Int,
        description: List<String>,
        category: String,
        levelReqs: List<Int> = emptyList()
    ): ItemStack {
        val item = ItemStack(material)
        item.editMeta { meta ->
            meta.displayName(legacy.deserialize("$name §7[Lv.$currentLv/$maxLv]"))

            val lore = mutableListOf<Component>()
            lore.add(legacy.deserialize(category))
            lore.add(Component.empty())
            for (desc in description) {
                lore.add(legacy.deserialize(desc))
            }
            lore.add(Component.empty())

            val stars = buildString {
                append("§6레벨: ")
                for (i in 1..maxLv) {
                    if (i <= currentLv) append("§e★") else append("§7☆")
                }
            }
            lore.add(legacy.deserialize(stars))
            lore.add(Component.empty())

            val nextLevelReq = levelReqs.getOrNull(currentLv) ?: 1
            val levelLocked = currentLv < maxLv && playerLevel < nextLevelReq

            if (currentLv >= maxLv) {
                lore.add(legacy.deserialize("§a§l최고 레벨!"))
            } else if (levelLocked) {
                lore.add(legacy.deserialize("§c\uD83D\uDD12 레벨 §f${nextLevelReq} §c이상 필요"))
                lore.add(legacy.deserialize("§7현재 직업 레벨: §f${playerLevel}"))
            } else if (skills.skillPoints > 0) {
                lore.add(legacy.deserialize("§a▶ 클릭하여 업그레이드 (1 포인트)"))
            } else {
                lore.add(legacy.deserialize("§c스킬 포인트가 부족합니다."))
                lore.add(legacy.deserialize("§e업그레이드: §f1 스킬 포인트"))
            }

            meta.lore(lore)
        }
        return item
    }

    private fun makeGlass(material: Material): ItemStack {
        val glass = ItemStack(material)
        glass.editMeta { meta -> meta.displayName(Component.text(" ")) }
        return glass
    }

    fun handleClick(slot: Int) {
        val skillKey = if (job == "miner") {
            when (slot) {
                20 -> "mining_speed"
                22 -> "lucky_strike"
                24 -> "stone_skin"
                else -> return
            }
        } else {
            when (slot) {
                19 -> "wide_harvest"
                21 -> "wide_plant"
                23 -> "freshness"
                25 -> "harvest_fortune"
                else -> return
            }
        }

        val maxLv = when (skillKey) {
            "wide_harvest", "wide_plant" -> 1
            else -> 3
        }

        val currentLv = when (skillKey) {
            "mining_speed" -> skills.miningSpeedLv
            "lucky_strike" -> skills.luckyStrikeLv
            "stone_skin" -> skills.stoneSkinLv
            "wide_harvest" -> skills.wideHarvestLv
            "wide_plant" -> skills.widePlantLv
            "freshness" -> skills.freshnessLv
            "harvest_fortune" -> skills.harvestFortuneLv
            else -> 0
        }

        if (currentLv >= maxLv) {
            player.playSound(player.location, Sound.BLOCK_NOTE_BLOCK_BASS, 0.8f, 0.8f)
            player.sendMessage("§c이미 최고 레벨입니다.")
            return
        }

        val levelReqs = when (skillKey) {
            "mining_speed" -> listOf(1, 5, 10)
            "lucky_strike" -> listOf(3, 8, 15)
            "stone_skin" -> listOf(7, 12, 20)
            "wide_harvest" -> listOf(3)
            "wide_plant" -> listOf(5)
            "freshness" -> listOf(1, 7, 15)
            "harvest_fortune" -> listOf(5, 10, 20)
            else -> emptyList()
        }
        val nextLevelReq = levelReqs.getOrNull(currentLv) ?: 1
        if (playerLevel < nextLevelReq) {
            player.playSound(player.location, Sound.BLOCK_NOTE_BLOCK_BASS, 0.8f, 0.8f)
            player.sendMessage("§c직업 레벨 §f${nextLevelReq} §c이상이 필요합니다. (현재: §f${playerLevel}§c)")
            return
        }

        if (skills.skillPoints <= 0) {
            player.playSound(player.location, Sound.ENTITY_VILLAGER_NO, 0.8f, 1.0f)
            player.sendMessage("§c스킬 포인트가 부족합니다.")
            return
        }

        plugin.pluginScope.launch {
            val result = plugin.apiClient.upgradeSkill(player.uniqueId.toString(), skillKey)
            Bukkit.getScheduler().runTask(plugin, Runnable {
                if (result != null && result.first) {
                    player.playSound(player.location, Sound.ENTITY_PLAYER_LEVELUP, 1.0f, 1.5f)
                    skills = when (skillKey) {
                        "mining_speed" -> skills.copy(miningSpeedLv = result.second, skillPoints = result.third)
                        "lucky_strike" -> skills.copy(luckyStrikeLv = result.second, skillPoints = result.third)
                        "stone_skin" -> skills.copy(stoneSkinLv = result.second, skillPoints = result.third)
                        "wide_harvest" -> skills.copy(wideHarvestLv = result.second, skillPoints = result.third)
                        "wide_plant" -> skills.copy(widePlantLv = result.second, skillPoints = result.third)
                        "freshness" -> skills.copy(freshnessLv = result.second, skillPoints = result.third)
                        "harvest_fortune" -> skills.copy(harvestFortuneLv = result.second, skillPoints = result.third)
                        else -> skills
                    }
                    skillManager.updateCache(player.uniqueId, skills)
                    skillManager.applyPassiveEffects(player.uniqueId)
                    populate(job)
                    player.sendMessage("§a§l✓ 스킬 업그레이드 완료! §7(Lv.${result.second})")
                } else {
                    player.playSound(player.location, Sound.ENTITY_VILLAGER_NO, 0.8f, 0.8f)
                    player.sendMessage("§c업그레이드 실패. 잠시 후 다시 시도하세요.")
                }
            })
        }
    }

    class SkillGuiListener(private val plugin: NyaruPlugin) : Listener {

        @EventHandler
        fun onInventoryClick(event: InventoryClickEvent) {
            val gui = activeInventories[event.inventory] ?: return
            if (event.whoClicked != gui.player) return
            event.isCancelled = true
            gui.handleClick(event.rawSlot)
        }

        @EventHandler
        fun onInventoryClose(event: InventoryCloseEvent) {
            activeInventories.remove(event.inventory)
        }
    }
}
