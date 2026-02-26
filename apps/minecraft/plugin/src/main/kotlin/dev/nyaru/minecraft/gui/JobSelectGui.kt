package dev.nyaru.minecraft.gui

import dev.nyaru.minecraft.NyaruPlugin
import kotlinx.coroutines.launch
import net.kyori.adventure.text.Component
import net.kyori.adventure.text.format.NamedTextColor
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

class JobSelectGui(private val plugin: NyaruPlugin, private val player: Player) {

    companion object {
        // uuid -> inventory reference for click handling
        val activeInventories = ConcurrentHashMap<org.bukkit.inventory.Inventory, Player>()
    }

    fun open() {
        val legacy = LegacyComponentSerializer.legacySection()
        val currentJob = plugin.actionBarManager.getInfo(player.uniqueId)?.job
        val isChange = currentJob != null

        val inv = Bukkit.createInventory(null, 27, legacy.deserialize("§6§l⚒ 직업 선택"))

        // Miner - slot 11
        val miner = ItemStack(Material.IRON_PICKAXE)
        val minerMeta = miner.itemMeta
        minerMeta.displayName(legacy.deserialize("§b§l광부 (Miner)"))
        val minerLore = mutableListOf(
            legacy.deserialize("§7광물 채굴로 포인트를 획득합니다."),
            Component.empty(),
            legacy.deserialize("§e[ 보너스 ]"),
            legacy.deserialize("§8▸ §f심층부(Y -40↓): 순정도 보너스"),
            legacy.deserialize("§8▸ §f다이아/에메랄드: 희귀 광물 보너스"),
            legacy.deserialize("§8▸ §f채굴 XP로 레벨업 → 포인트 배율 증가"),
            Component.empty()
        )
        if (isChange) minerLore.add(legacy.deserialize("§c⚠ 직업 변경 시 레벨/경험치 초기화!"))
        minerLore.add(legacy.deserialize("§a▶ 클릭하여 광부 선택"))
        minerMeta.lore(minerLore)
        miner.itemMeta = minerMeta

        // Farmer - slot 15
        val farmer = ItemStack(Material.GOLDEN_HOE)
        val farmerMeta = farmer.itemMeta
        farmerMeta.displayName(legacy.deserialize("§a§l농부 (Farmer)"))
        val farmerLore = mutableListOf(
            legacy.deserialize("§7작물 재배로 포인트를 획득합니다."),
            Component.empty(),
            legacy.deserialize("§e[ 보너스 ]"),
            legacy.deserialize("§8▸ §f수확 직후 신선도 100% → 최고가"),
            legacy.deserialize("§8▸ §f신선한 작물: 최대 +40% 포인트"),
            legacy.deserialize("§8▸ §f수확 XP로 레벨업 → 포인트 배율 증가"),
            Component.empty()
        )
        if (isChange) farmerLore.add(legacy.deserialize("§c⚠ 직업 변경 시 레벨/경험치 초기화!"))
        farmerLore.add(legacy.deserialize("§a▶ 클릭하여 농부 선택"))
        farmerMeta.lore(farmerLore)
        farmer.itemMeta = farmerMeta

        // Filler glass
        val glass = ItemStack(Material.GRAY_STAINED_GLASS_PANE)
        val glassMeta = glass.itemMeta
        glassMeta.displayName(Component.text(" "))
        glass.itemMeta = glassMeta

        for (i in 0 until 27) inv.setItem(i, glass)
        inv.setItem(11, miner)
        inv.setItem(15, farmer)

        activeInventories[inv] = player
        player.openInventory(inv)
        player.playSound(player.location, Sound.BLOCK_CHEST_OPEN, 0.8f, 1.0f)
    }

    class JobSelectListener(private val plugin: NyaruPlugin) : Listener {

        @EventHandler
        fun onInventoryClick(event: InventoryClickEvent) {
            val player = activeInventories[event.inventory] ?: return
            if (event.whoClicked != player) return
            event.isCancelled = true

            val slot = event.rawSlot
            val jobKey = when (slot) {
                11 -> "miner"
                15 -> "farmer"
                else -> return
            }
            val jobKr = if (jobKey == "miner") "광부" else "농부"

            player.closeInventory()
            plugin.pluginScope.launch {
                val success = plugin.apiClient.changeJob(player.uniqueId.toString(), jobKey)
                Bukkit.getScheduler().runTask(plugin, Runnable {
                    if (success) {
                        player.playSound(player.location, Sound.ENTITY_PLAYER_LEVELUP, 1.0f, 1.0f)
                        player.sendMessage("§a§l✓ 직업이 §e$jobKr§a§l(으)로 설정되었습니다!")
                        plugin.actionBarManager.refresh(player.uniqueId)
                    } else {
                        player.sendMessage("§c직업 설정 실패. 잠시 후 다시 시도하세요.")
                    }
                })
            }
        }

        @EventHandler
        fun onInventoryClose(event: InventoryCloseEvent) {
            activeInventories.remove(event.inventory)
        }
    }
}
