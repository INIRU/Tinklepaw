package dev.nyaru.minecraft.gui

import dev.nyaru.minecraft.NyaruPlugin
import kotlinx.coroutines.launch
import net.kyori.adventure.text.Component
import net.kyori.adventure.text.format.NamedTextColor
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer
import org.bukkit.Bukkit
import org.bukkit.Material
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
        val inv = Bukkit.createInventory(null, 27,
            LegacyComponentSerializer.legacySection().deserialize("§6§l⚒ 직업 선택"))

        // Miner - slot 11
        val miner = ItemStack(Material.IRON_PICKAXE)
        val minerMeta = miner.itemMeta
        minerMeta.displayName(LegacyComponentSerializer.legacySection().deserialize("§b§l광부 (Miner)"))
        minerMeta.lore(listOf(
            LegacyComponentSerializer.legacySection().deserialize("§7광물 채굴로 포인트를 획득합니다."),
            Component.empty(),
            LegacyComponentSerializer.legacySection().deserialize("§e[ 보너스 ]"),
            LegacyComponentSerializer.legacySection().deserialize("§8▸ §f심층부(Y -40↓): 순정도 보너스"),
            LegacyComponentSerializer.legacySection().deserialize("§8▸ §f다이아/에메랄드: 희귀 광물 보너스"),
            LegacyComponentSerializer.legacySection().deserialize("§8▸ §f채굴 XP로 레벨업 → 포인트 배율 증가"),
            Component.empty(),
            LegacyComponentSerializer.legacySection().deserialize("§a▶ 클릭하여 광부 선택")
        ))
        miner.itemMeta = minerMeta

        // Farmer - slot 15
        val farmer = ItemStack(Material.GOLDEN_HOE)
        val farmerMeta = farmer.itemMeta
        farmerMeta.displayName(LegacyComponentSerializer.legacySection().deserialize("§a§l농부 (Farmer)"))
        farmerMeta.lore(listOf(
            LegacyComponentSerializer.legacySection().deserialize("§7작물 재배로 포인트를 획득합니다."),
            Component.empty(),
            LegacyComponentSerializer.legacySection().deserialize("§e[ 보너스 ]"),
            LegacyComponentSerializer.legacySection().deserialize("§8▸ §f수확 직후 신선도 100% → 최고가"),
            LegacyComponentSerializer.legacySection().deserialize("§8▸ §f신선한 작물: 최대 +40% 포인트"),
            LegacyComponentSerializer.legacySection().deserialize("§8▸ §f수확 XP로 레벨업 → 포인트 배율 증가"),
            Component.empty(),
            LegacyComponentSerializer.legacySection().deserialize("§a▶ 클릭하여 농부 선택")
        ))
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
                        player.sendMessage("§a§l✓ 직업이 §e$jobKr§a§l(으)로 설정되었습니다!")
                        player.sendMessage("§7/직업 변경 <광부|농부> 으로 변경 가능합니다.")
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
