package dev.nyaru.minecraft.listeners

import dev.nyaru.minecraft.model.PlayerInfo
import io.papermc.paper.event.player.AsyncChatEvent
import net.kyori.adventure.text.Component
import net.kyori.adventure.text.format.NamedTextColor
import net.kyori.adventure.text.format.TextColor
import org.bukkit.entity.Player
import org.bukkit.event.EventHandler
import org.bukkit.event.Listener

class ChatTabListener(private val actionBarManager: ActionBarManager) : Listener {

    @EventHandler(ignoreCancelled = true)
    fun onChat(event: AsyncChatEvent) {
        val info = actionBarManager.getInfo(event.player.uniqueId) ?: return
        val title = info.title ?: return
        val color = titleColor(info)
        event.renderer { _, sourceDisplayName, message, _ ->
            Component.text()
                .append(Component.text("[$title]", color).decoration(net.kyori.adventure.text.format.TextDecoration.BOLD, true))
                .append(Component.text(" ", NamedTextColor.WHITE))
                .append(sourceDisplayName)
                .append(Component.text(": ", NamedTextColor.WHITE))
                .append(message)
                .build()
        }
    }

    fun updateTabName(player: Player, info: PlayerInfo?) {
        if (info?.linked == true && info.title != null) {
            val color = titleColor(info)
            player.playerListName(
                Component.text()
                    .append(Component.text("[${info.title}]", color).decoration(net.kyori.adventure.text.format.TextDecoration.BOLD, true))
                    .append(Component.text(" ${player.name}", NamedTextColor.WHITE))
                    .build()
            )
        } else {
            player.playerListName(null)
        }
    }

    private fun titleColor(info: PlayerInfo): TextColor =
        info.titleColor?.let { TextColor.fromHexString(it) } ?: NamedTextColor.LIGHT_PURPLE
}
