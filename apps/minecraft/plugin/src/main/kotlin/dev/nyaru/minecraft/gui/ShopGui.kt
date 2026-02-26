package dev.nyaru.minecraft.gui

import dev.nyaru.minecraft.NyaruPlugin
import dev.nyaru.minecraft.listeners.HARVEST_TIME_KEY
import dev.nyaru.minecraft.listeners.PURITY_KEY
import dev.nyaru.minecraft.model.MarketItem
import kotlinx.coroutines.launch
import org.bukkit.Bukkit
import org.bukkit.Material
import org.bukkit.entity.Player
import org.bukkit.event.EventHandler
import org.bukkit.event.HandlerList
import org.bukkit.event.Listener
import org.bukkit.event.inventory.InventoryClickEvent
import org.bukkit.event.inventory.InventoryCloseEvent
import org.bukkit.inventory.Inventory
import org.bukkit.inventory.ItemStack
import org.bukkit.persistence.PersistentDataType

class ShopGui(private val plugin: NyaruPlugin, private val player: Player) : Listener {

    private lateinit var inventory: Inventory
    private var marketItems: List<MarketItem> = emptyList()

    fun open() {
        plugin.pluginScope.launch {
            marketItems = plugin.apiClient.getMarket()
            Bukkit.getScheduler().runTask(plugin, Runnable {
                inventory = Bukkit.createInventory(null, 54, "§6Nyaru 마켓")
                populateInventory()
                player.openInventory(inventory)
                Bukkit.getPluginManager().registerEvents(this@ShopGui, plugin)
            })
        }
    }

    private fun populateInventory() {
        inventory.clear()
        for ((i, item) in marketItems.withIndex()) {
            if (i >= 45) break
            val mat = runCatching { Material.valueOf(item.mcMaterial) }.getOrNull() ?: continue
            val stack = ItemStack(mat)
            stack.editMeta { meta ->
                meta.setDisplayName("§e${item.displayName}")
                meta.lore = listOf(
                    "§7현재가: §a${item.currentPrice}P",
                    "§7기준가: §f${item.basePrice}P",
                    "§7종류: §f${if (item.category == "crop") "작물" else "광물"}",
                    "§8클릭하여 판매"
                )
            }
            inventory.setItem(i, stack)
        }
    }

    @EventHandler
    fun onInventoryClick(event: InventoryClickEvent) {
        if (event.inventory != inventory) return
        if (event.whoClicked != player) return
        event.isCancelled = true

        val slot = event.rawSlot
        if (slot < 0 || slot >= marketItems.size) return

        val marketItem = marketItems[slot]
        val cursor = player.inventory.itemInMainHand

        // Check if the player is holding the item they want to sell
        val mat = runCatching { Material.valueOf(marketItem.mcMaterial) }.getOrNull() ?: return
        if (cursor.type != mat || cursor.amount <= 0) {
            player.sendMessage("§c손에 §e${marketItem.displayName}§c을/를 들고 클릭하세요.")
            return
        }

        val qty = cursor.amount
        val uuid = player.uniqueId.toString()

        // Extract PDC data
        val harvTime = cursor.itemMeta?.persistentDataContainer?.get(HARVEST_TIME_KEY, PersistentDataType.LONG)
        val purity = cursor.itemMeta?.persistentDataContainer?.get(PURITY_KEY, PersistentDataType.INTEGER)

        val freshnessPct: Double? = if (harvTime != null) {
            val minutesOld = (System.currentTimeMillis() - harvTime) / 60000.0
            when {
                minutesOld <= 10 -> 100.0
                minutesOld >= 30 -> 60.0
                else -> 100.0 - ((minutesOld - 10) / 20.0) * 40.0
            }
        } else null

        player.inventory.setItemInMainHand(ItemStack(Material.AIR))
        player.sendMessage("§a판매 중...")

        plugin.pluginScope.launch {
            val result = plugin.apiClient.sellItem(uuid, marketItem.symbol, qty, freshnessPct, purity?.toDouble())
            Bukkit.getScheduler().runTask(plugin, Runnable {
                if (result != null) {
                    player.sendMessage("§a${marketItem.displayName} §f${qty}개 판매 완료! §6+${result.netPoints}P")
                    if (freshnessPct != null) {
                        player.sendMessage("§7신선도: §e${String.format("%.0f", freshnessPct)}%")
                    }
                    if (purity != null) {
                        player.sendMessage("§7순정도: §e${purity}%")
                    }
                } else {
                    player.sendMessage("§c판매 실패. 나중에 다시 시도하세요.")
                    player.inventory.addItem(ItemStack(mat, qty))
                }
            })
        }
    }

    @EventHandler
    fun onInventoryClose(event: InventoryCloseEvent) {
        if (event.inventory == inventory) {
            HandlerList.unregisterAll(this)
        }
    }
}
