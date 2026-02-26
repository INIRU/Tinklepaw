package dev.nyaru.minecraft.gui

import dev.nyaru.minecraft.NyaruPlugin
import dev.nyaru.minecraft.model.QuestInfo
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

class QuestGui(private val plugin: NyaruPlugin, private val player: Player) : Listener {

    private lateinit var inventory: Inventory
    private var quests: List<QuestInfo> = emptyList()

    fun open() {
        plugin.pluginScope.launch {
            quests = plugin.apiClient.getQuests(player.uniqueId.toString())
            Bukkit.getScheduler().runTask(plugin, Runnable {
                inventory = Bukkit.createInventory(null, 27, "§6오늘의 퀘스트")
                populateInventory()
                player.openInventory(inventory)
                Bukkit.getPluginManager().registerEvents(this@QuestGui, plugin)
            })
        }
    }

    private fun populateInventory() {
        inventory.clear()
        for ((i, quest) in quests.withIndex()) {
            val slot = i * 3 + 3
            if (slot >= 27) break
            val mat = when {
                quest.claimed -> Material.LIME_STAINED_GLASS_PANE
                quest.completed -> Material.GOLD_INGOT
                else -> Material.BOOK
            }
            val stack = ItemStack(mat)
            stack.editMeta { meta ->
                meta.setDisplayName(if (quest.claimed) "§7[완료] ${quest.description}" else "§e${quest.description}")
                val progress = "${quest.progress}/${quest.targetQty}"
                meta.lore = listOf(
                    "§7진행도: §f$progress",
                    "§7보상: §6${quest.rewardPoints}P",
                    if (quest.completed && !quest.claimed) "§a클릭하여 보상 수령!" else ""
                ).filter { it.isNotEmpty() }
            }
            inventory.setItem(slot, stack)
        }
    }

    @EventHandler
    fun onInventoryClick(event: InventoryClickEvent) {
        if (event.inventory != inventory) return
        if (event.whoClicked != player) return
        event.isCancelled = true

        val slot = event.rawSlot
        val questIndex = (slot - 3) / 3
        if (questIndex < 0 || questIndex >= quests.size) return

        val quest = quests[questIndex]
        if (!quest.completed || quest.claimed) return

        plugin.pluginScope.launch {
            val reward = plugin.apiClient.claimQuest(player.uniqueId.toString(), quest.questId)
            Bukkit.getScheduler().runTask(plugin, Runnable {
                if (reward != null) {
                    player.sendMessage("§a퀘스트 보상 수령: §6+${reward}P")
                    // Refresh
                    plugin.pluginScope.launch {
                        quests = plugin.apiClient.getQuests(player.uniqueId.toString())
                        Bukkit.getScheduler().runTask(plugin, Runnable { populateInventory() })
                    }
                } else {
                    player.sendMessage("§c보상 수령 실패.")
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
