package dev.nyaru.minecraft.gui

import dev.nyaru.minecraft.NyaruPlugin
import dev.nyaru.minecraft.listeners.HARVEST_TIME_KEY
import dev.nyaru.minecraft.listeners.PURITY_KEY
import dev.nyaru.minecraft.model.MarketItem
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
import org.bukkit.persistence.PersistentDataType
import java.util.concurrent.ConcurrentHashMap

class ShopGui(private val plugin: NyaruPlugin, private val player: Player) {

    companion object {
        val activeInventories = ConcurrentHashMap<Inventory, ShopGui>()
    }

    enum class Page { MAIN, MINERAL, CROP, SEED }

    data class SeedItem(val symbol: String, val displayName: String, val material: Material, val price: Int)

    val SEED_ITEMS = listOf(
        SeedItem("wheat_seeds",    "밀 씨앗",       Material.WHEAT_SEEDS,    5),
        SeedItem("potato",         "감자",           Material.POTATO,          7),
        SeedItem("carrot",         "당근",           Material.CARROT,          8),
        SeedItem("sugar_cane",     "사탕수수",       Material.SUGAR_CANE,      6),
        SeedItem("beetroot_seeds", "비트루트 씨앗",  Material.BEETROOT_SEEDS,  10),
        SeedItem("melon_seeds",    "수박 씨앗",      Material.MELON_SEEDS,     12),
        SeedItem("pumpkin_seeds",  "호박 씨앗",      Material.PUMPKIN_SEEDS,   12),
        SeedItem("cocoa_beans",    "코코아 씨앗",    Material.COCOA_BEANS,     15),
    )

    private val legacy = LegacyComponentSerializer.legacySection()
    private var currentPage = Page.MAIN
    private lateinit var inventory: Inventory
    private var marketItems: List<MarketItem> = emptyList()
    private var filteredItems: List<MarketItem> = emptyList()

    fun open() {
        plugin.pluginScope.launch {
            marketItems = plugin.apiClient.getMarket()
            Bukkit.getScheduler().runTask(plugin, Runnable {
                showMain()
            })
        }
    }

    private fun showMain() {
        currentPage = Page.MAIN
        inventory = Bukkit.createInventory(null, 54, legacy.deserialize("\u00A76\u00A7l\uD83D\uDED2 \uBC29\uC6B8\uB0E5 \uB9C8\uCF13"))
        val grayGlass = makeGlass(Material.GRAY_STAINED_GLASS_PANE)
        for (i in 0 until 54) inventory.setItem(i, grayGlass)

        // Header decoration
        val headerGlass = makeGlass(Material.ORANGE_STAINED_GLASS_PANE)
        for (i in 0..8) inventory.setItem(i, headerGlass)
        for (i in 45..53) inventory.setItem(i, headerGlass)

        // Slot 20: Mineral shop
        val mineralItem = ItemStack(Material.DIAMOND)
        mineralItem.editMeta { meta ->
            meta.displayName(legacy.deserialize("\u00A7b\u00A7l\u26CF \uAD11\uBB3C \uC0C1\uC810"))
            meta.lore(listOf(
                Component.empty(),
                legacy.deserialize("\u00A77\uAD11\uBB3C\uC744 \uD310\uB9E4\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."),
                legacy.deserialize("\u00A77\uC21C\uC815\uB3C4\uAC00 \uB192\uC744\uC218\uB85D \uBE44\uC2FC \uAC00\uACA9!"),
                Component.empty(),
                legacy.deserialize("\u00A7a\u25B6 \uD074\uB9AD\uD558\uC5EC \uC774\uB3D9")
            ))
        }
        inventory.setItem(20, mineralItem)

        // Slot 24: Crop shop
        val cropItem = ItemStack(Material.WHEAT)
        cropItem.editMeta { meta ->
            meta.displayName(legacy.deserialize("\u00A7a\u00A7l\uD83C\uDF3E \uC791\uBB3C \uC0C1\uC810"))
            meta.lore(listOf(
                Component.empty(),
                legacy.deserialize("\u00A77\uC791\uBB3C\uC744 \uD310\uB9E4\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."),
                legacy.deserialize("\u00A77\uC2E0\uC120\uD560\uC218\uB85D \uBE44\uC2FC \uAC00\uACA9!"),
                Component.empty(),
                legacy.deserialize("\u00A7a\u25B6 \uD074\uB9AD\uD558\uC5EC \uC774\uB3D9")
            ))
        }
        inventory.setItem(24, cropItem)

        // Slot 22: Seed shop
        val seedItem = ItemStack(Material.WHEAT_SEEDS)
        seedItem.editMeta { meta ->
            meta.displayName(legacy.deserialize("\u00A7e\u00A7l\uD83C\uDF31 \uC528\uC558 \uC0C1\uC810"))
            meta.lore(listOf(
                Component.empty(),
                legacy.deserialize("\u00A77\uC528\uC558\uC744 \uAD6C\uB9E4\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."),
                legacy.deserialize("\u00A77\uD3EC\uC778\uD2B8\uB85C \uAD6C\uB9E4\uD569\uB2C8\uB2E4."),
                Component.empty(),
                legacy.deserialize("\u00A7a\u25B6 \uD074\uB9AD\uD558\uC5EC \uC774\uB3D9")
            ))
        }
        inventory.setItem(22, seedItem)

        // Slot 49: Info book
        val book = ItemStack(Material.BOOK)
        book.editMeta { meta ->
            meta.displayName(legacy.deserialize("\u00A7e\u00A7l\uC0C1\uC810 \uC548\uB0B4"))
            meta.lore(listOf(
                legacy.deserialize("\u00A77\uC190\uC5D0 \uC544\uC774\uD15C\uC744 \uB4E4\uACE0 \uD074\uB9AD\uD558\uBA74 \uD310\uB9E4\uB429\uB2C8\uB2E4."),
                legacy.deserialize("\u00A77\uAD11\uBB3C: \uC21C\uC815\uB3C4 \uBCF4\uB108\uC2A4"),
                legacy.deserialize("\u00A77\uC791\uBB3C: \uC2E0\uC120\uB3C4 \uBCF4\uB108\uC2A4")
            ))
        }
        inventory.setItem(49, book)

        activeInventories[inventory] = this
        player.openInventory(inventory)
        player.playSound(player.location, Sound.BLOCK_CHEST_OPEN, 0.8f, 1.2f)
    }

    private fun showCategory(page: Page) {
        currentPage = page
        val category = if (page == Page.MINERAL) "mineral" else "crop"
        val title = if (page == Page.MINERAL)
            "\u00A7b\u00A7l\u26CF \uAD11\uBB3C \uC0C1\uC810"
        else
            "\u00A7a\u00A7l\uD83C\uDF3E \uC791\uBB3C \uC0C1\uC810"

        filteredItems = marketItems.filter { it.category == category }

        // Close old, open new
        activeInventories.remove(inventory)
        inventory = Bukkit.createInventory(null, 54, legacy.deserialize(title))

        val grayGlass = makeGlass(Material.GRAY_STAINED_GLASS_PANE)
        val borderGlass = if (page == Page.MINERAL)
            makeGlass(Material.CYAN_STAINED_GLASS_PANE)
        else
            makeGlass(Material.LIME_STAINED_GLASS_PANE)

        for (i in 0 until 54) inventory.setItem(i, grayGlass)
        // Top and bottom border with category color
        for (i in 0..8) inventory.setItem(i, borderGlass)
        for (i in 45..53) inventory.setItem(i, borderGlass)

        // Items in slots 10-16, 19-25, 28-34, 37-43
        val itemSlots = listOf(
            10, 11, 12, 13, 14, 15, 16,
            19, 20, 21, 22, 23, 24, 25,
            28, 29, 30, 31, 32, 33, 34,
            37, 38, 39, 40, 41, 42, 43
        )

        for ((idx, item) in filteredItems.withIndex()) {
            if (idx >= itemSlots.size) break
            val slot = itemSlots[idx]
            val mat = runCatching { Material.valueOf(item.mcMaterial) }.getOrNull() ?: continue
            val stack = ItemStack(mat)
            stack.editMeta { meta ->
                val priceDiff = item.currentPrice - item.basePrice
                val pctChange = if (item.basePrice > 0) (priceDiff * 100.0 / item.basePrice) else 0.0
                val trendColor = if (priceDiff >= 0) "\u00A7a" else "\u00A7c"
                val trendSign = if (priceDiff >= 0) "\u25B2 +${String.format("%.1f", pctChange)}%" else "\u25BC ${String.format("%.1f", pctChange)}%"

                meta.displayName(legacy.deserialize("${trendColor}\u00A7l${item.displayName}"))
                val lore = mutableListOf<Component>()
                lore.add(legacy.deserialize("\u00A77\uD604\uC7AC\uAC00: \u00A7e${item.currentPrice}P \u00A77(\uAE30\uC900\uAC00 ${item.basePrice}P)"))
                lore.add(legacy.deserialize("${trendColor}${trendSign}"))
                lore.add(legacy.deserialize("\u00A78\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"))
                if (category == "mineral") {
                    lore.add(legacy.deserialize("\u00A77\uC21C\uC815\uB3C4\uAC00 \uB192\uC744\uC218\uB85D \uCD94\uAC00 \uBCF4\uB108\uC2A4"))
                } else {
                    lore.add(legacy.deserialize("\u00A77\uC2E0\uC120\uD560\uC218\uB85D \uCD94\uAC00 \uBCF4\uB108\uC2A4"))
                }
                lore.add(Component.empty())
                lore.add(legacy.deserialize("\u00A7f\uC88C\uD074\uB9AD: \u00A771\uAC1C \uD310\uB9E4  \u00A7f\uC6B0\uD074\uB9AD: \u00A77\uC2A4\uD0DD \uC804\uCCB4 \uD310\uB9E4"))
                meta.lore(lore)
            }
            inventory.setItem(slot, stack)
        }

        // Slot 45: Back button
        val back = ItemStack(Material.ARROW)
        back.editMeta { meta ->
            meta.displayName(legacy.deserialize("\u00A7f\u2190 \uB4A4\uB85C"))
        }
        inventory.setItem(45, back)

        // Slot 53: Refresh button
        val refresh = ItemStack(Material.COMPASS)
        refresh.editMeta { meta ->
            meta.displayName(legacy.deserialize("\u00A77\uC0C8\uB85C\uACE0\uCE68"))
        }
        inventory.setItem(53, refresh)

        activeInventories[inventory] = this
        player.openInventory(inventory)
        player.playSound(player.location, Sound.ITEM_BOOK_PAGE_TURN, 0.8f, 1.0f)
    }

    fun handleClick(slot: Int, isRightClick: Boolean = false) {
        when (currentPage) {
            Page.MAIN -> {
                when (slot) {
                    20 -> showCategory(Page.MINERAL)
                    24 -> showCategory(Page.CROP)
                    22 -> showSeed()
                }
            }
            Page.SEED -> {
                when (slot) {
                    45 -> showMain()
                    else -> handleBuy(slot, isRightClick)
                }
            }
            Page.MINERAL, Page.CROP -> {
                when (slot) {
                    45 -> {
                        player.playSound(player.location, Sound.UI_BUTTON_CLICK, 0.6f, 1.0f)
                        showMain()
                    }
                    53 -> {
                        player.playSound(player.location, Sound.UI_BUTTON_CLICK, 0.6f, 1.2f)
                        // Refresh market data
                        plugin.pluginScope.launch {
                            marketItems = plugin.apiClient.getMarket()
                            Bukkit.getScheduler().runTask(plugin, Runnable {
                                showCategory(currentPage)
                            })
                        }
                    }
                    else -> handleSell(slot, isRightClick)
                }
            }
        }
    }

    private fun handleSell(slot: Int, isRightClick: Boolean) {
        val itemSlots = listOf(
            10, 11, 12, 13, 14, 15, 16,
            19, 20, 21, 22, 23, 24, 25,
            28, 29, 30, 31, 32, 33, 34,
            37, 38, 39, 40, 41, 42, 43
        )
        val idx = itemSlots.indexOf(slot)
        if (idx < 0 || idx >= filteredItems.size) return

        val marketItem = filteredItems[idx]
        val mat = runCatching { Material.valueOf(marketItem.mcMaterial) }.getOrNull() ?: return

        // 인벤토리에서 해당 material 스택 찾기 (PDC 데이터 있는 것 우선)
        val inv = player.inventory
        val matchingStacks = (0 until inv.size)
            .mapNotNull { i -> inv.getItem(i)?.takeIf { it.type == mat && it.amount > 0 }?.let { i to it } }

        if (matchingStacks.isEmpty()) {
            player.playSound(player.location, Sound.ENTITY_VILLAGER_NO, 0.8f, 1.0f)
            player.sendMessage("\u00A7c\uC778\uBCA4\uD1A0\uB9AC\uC5D0 \u00A7e${marketItem.displayName}\u00A7c\uC774/\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.")
            return
        }

        // PDC 있는 스택 우선, 없으면 첫 번째
        val (invSlot, stack) = matchingStacks.maxByOrNull { (_, s) ->
            if (s.itemMeta?.persistentDataContainer?.has(HARVEST_TIME_KEY, PersistentDataType.LONG) == true ||
                s.itemMeta?.persistentDataContainer?.has(PURITY_KEY, PersistentDataType.INTEGER) == true) 1 else 0
        } ?: matchingStacks.first()

        // 판매 수량 결정
        val qty = if (isRightClick) stack.amount else 1

        // PDC 추출
        val meta = stack.itemMeta
        val harvTime = meta?.persistentDataContainer?.get(HARVEST_TIME_KEY, PersistentDataType.LONG)
        val purity = meta?.persistentDataContainer?.get(PURITY_KEY, PersistentDataType.INTEGER)

        val freshnessPct: Double? = if (harvTime != null) {
            val minutesOld = (System.currentTimeMillis() - harvTime) / 60000.0
            when {
                minutesOld <= 10 -> 100.0
                minutesOld >= 30 -> 60.0
                else -> 100.0 - ((minutesOld - 10) / 20.0) * 40.0
            }
        } else null

        // 인벤토리에서 수량 차감
        if (qty >= stack.amount) {
            inv.setItem(invSlot, null)
        } else {
            stack.amount -= qty
        }

        val uuid = player.uniqueId.toString()
        player.sendMessage("\u00A7a\uD310\uB9E4 \uC911...")

        plugin.pluginScope.launch {
            val result = plugin.apiClient.sellItem(uuid, marketItem.symbol, qty, freshnessPct, purity?.toDouble())
            Bukkit.getScheduler().runTask(plugin, Runnable {
                if (result != null) {
                    player.playSound(player.location, Sound.ENTITY_EXPERIENCE_ORB_PICKUP, 1.0f, 1.2f)
                    player.sendMessage("\u00A7a${marketItem.displayName} \u00A7f${qty}\uAC1C \uD310\uB9E4 \uC644\uB8CC! \u00A76+${result.netPoints}P")
                    if (freshnessPct != null) {
                        player.sendMessage("\u00A77\uC2E0\uC120\uB3C4: \u00A7e${String.format("%.0f", freshnessPct)}%")
                    }
                    if (purity != null) {
                        player.sendMessage("\u00A77\uC21C\uC815\uB3C4: \u00A7e${purity}%")
                    }
                } else {
                    player.playSound(player.location, Sound.ENTITY_VILLAGER_NO, 0.8f, 0.8f)
                    // 실패 시 아이템 반환
                    if (qty >= stack.amount + qty) {
                        inv.addItem(ItemStack(mat, qty))
                    } else {
                        stack.amount += qty
                    }
                    player.sendMessage("\u00A7c\uD310\uB9E4 \uC2E4\uD328. \uB098\uC911\uC5D0 \uB2E4\uC2DC \uC2DC\uB3C4\uD558\uC138\uC694.")
                }
            })
        }
    }

    private fun showSeed() {
        currentPage = Page.SEED
        activeInventories.remove(inventory)
        inventory = Bukkit.createInventory(null, 54, legacy.deserialize("\u00A7e\u00A7l\uD83C\uDF31 \uC528\uC558 \uC0C1\uC810"))

        val grayGlass = makeGlass(Material.GRAY_STAINED_GLASS_PANE)
        val yellowGlass = makeGlass(Material.YELLOW_STAINED_GLASS_PANE)
        for (i in 0 until 54) inventory.setItem(i, grayGlass)
        for (i in 0..8) inventory.setItem(i, yellowGlass)
        for (i in 45..53) inventory.setItem(i, yellowGlass)

        val itemSlots = listOf(10, 11, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 24, 25)
        SEED_ITEMS.forEachIndexed { idx, seed ->
            if (idx >= itemSlots.size) return@forEachIndexed
            val stack = ItemStack(seed.material)
            stack.editMeta { meta ->
                meta.displayName(legacy.deserialize("\u00A7e\u00A7l${seed.displayName}"))
                meta.lore(listOf(
                    legacy.deserialize("\u00A77\uAC00\uACA9: \u00A7e${seed.price}P \u00A77/ 1\uAC1C"),
                    legacy.deserialize("\u00A77\uAC00\uACA9: \u00A7e${seed.price * 16}P \u00A77/ 16\uAC1C"),
                    Component.empty(),
                    legacy.deserialize("\u00A7f\uC88C\uD074\uB9AD: \u00A771\uAC1C \uAD6C\uB9E4  \u00A7f\uC6B0\uD074\uB9AD: \u00A7716\uAC1C \uAD6C\uB9E4")
                ))
            }
            inventory.setItem(itemSlots[idx], stack)
        }

        val back = ItemStack(Material.ARROW)
        back.editMeta { meta -> meta.displayName(legacy.deserialize("\u00A7f\u2190 \uB4A4\uB85C")) }
        inventory.setItem(45, back)

        activeInventories[inventory] = this
        player.openInventory(inventory)
        player.playSound(player.location, Sound.BLOCK_CHEST_OPEN, 0.8f, 1.3f)
    }

    private fun handleBuy(slot: Int, isRightClick: Boolean) {
        val itemSlots = listOf(10, 11, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 24, 25)
        val idx = itemSlots.indexOf(slot)
        if (idx < 0 || idx >= SEED_ITEMS.size) return

        val seed = SEED_ITEMS[idx]
        val qty = if (isRightClick) 16 else 1
        val uuid = player.uniqueId.toString()

        player.sendMessage("\u00A7a\uAD6C\uB9E4 \uC911...")
        plugin.pluginScope.launch {
            val success = plugin.apiClient.buySeed(uuid, seed.symbol, qty)
            Bukkit.getScheduler().runTask(plugin, Runnable {
                if (success) {
                    player.inventory.addItem(ItemStack(seed.material, qty))
                    player.playSound(player.location, Sound.ENTITY_EXPERIENCE_ORB_PICKUP, 1.0f, 1.2f)
                    player.sendMessage("\u00A7a${seed.displayName} \u00A7f${qty}\uAC1C \uAD6C\uB9E4 \uC644\uB8CC!")
                } else {
                    player.playSound(player.location, Sound.ENTITY_VILLAGER_NO, 0.8f, 1.0f)
                    player.sendMessage("\u00A7c\uAD6C\uB9E4 \uC2E4\uD328. \uD3EC\uC778\uD2B8\uAC00 \uBD80\uC871\uD558\uAC70\uB098 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.")
                }
            })
        }
    }

    private fun makeGlass(material: Material): ItemStack {
        val glass = ItemStack(material)
        glass.editMeta { meta -> meta.displayName(Component.text(" ")) }
        return glass
    }

    class ShopGuiListener(private val plugin: NyaruPlugin) : Listener {

        @EventHandler
        fun onInventoryClick(event: InventoryClickEvent) {
            val gui = activeInventories[event.inventory] ?: return
            if (event.whoClicked != gui.player) return
            event.isCancelled = true
            gui.handleClick(event.rawSlot, event.isRightClick)
        }

        @EventHandler
        fun onInventoryClose(event: InventoryCloseEvent) {
            activeInventories.remove(event.inventory)
        }
    }
}
