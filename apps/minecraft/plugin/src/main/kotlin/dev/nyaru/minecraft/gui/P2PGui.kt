package dev.nyaru.minecraft.gui

import dev.nyaru.minecraft.NyaruPlugin
import dev.nyaru.minecraft.model.P2PListing
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

class P2PGui(private val plugin: NyaruPlugin, private val player: Player) : Listener {

    private lateinit var inventory: Inventory
    private var listings: List<P2PListing> = emptyList()

    fun open() {
        plugin.pluginScope.launch {
            listings = plugin.apiClient.getP2PListings()
            Bukkit.getScheduler().runTask(plugin, Runnable {
                inventory = Bukkit.createInventory(null, 54, "§6P2P 거래소")
                populateInventory()
                player.openInventory(inventory)
                Bukkit.getPluginManager().registerEvents(this@P2PGui, plugin)
            })
        }
    }

    private fun populateInventory() {
        inventory.clear()
        for ((i, listing) in listings.withIndex()) {
            if (i >= 45) break
            val mat = runCatching { Material.valueOf(listing.symbol.uppercase()) }.getOrNull() ?: Material.PAPER
            val stack = ItemStack(mat)
            stack.editMeta { meta ->
                meta.setDisplayName("§e${listing.symbol}")
                meta.lore = listOf(
                    "§7수량: §f${listing.qty}",
                    "§7단가: §a${listing.pricePerUnit}P",
                    "§7총액: §6${listing.qty * listing.pricePerUnit}P",
                    "§7판매자: §f${listing.sellerName}",
                    "§8클릭하여 구매"
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
        if (slot < 0 || slot >= listings.size) return

        val listing = listings[slot]
        if (listing.sellerUuid == player.uniqueId.toString()) {
            player.sendMessage("§c자신의 매물은 구매할 수 없습니다.")
            return
        }

        plugin.pluginScope.launch {
            val success = plugin.apiClient.buyP2P(player.uniqueId.toString(), listing.id)
            Bukkit.getScheduler().runTask(plugin, Runnable {
                if (success) {
                    player.sendMessage("§a구매 완료! §e${listing.symbol} §f${listing.qty}개 §7(-${listing.qty * listing.pricePerUnit}P)")
                    plugin.pluginScope.launch {
                        listings = plugin.apiClient.getP2PListings()
                        Bukkit.getScheduler().runTask(plugin, Runnable { populateInventory() })
                    }
                } else {
                    player.sendMessage("§c구매 실패. 포인트가 부족하거나 매물이 소진되었습니다.")
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
