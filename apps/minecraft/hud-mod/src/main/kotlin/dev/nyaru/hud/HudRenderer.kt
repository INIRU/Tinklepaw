package dev.nyaru.hud

import net.minecraft.client.MinecraftClient
import net.minecraft.client.gui.DrawContext
import net.minecraft.client.render.RenderTickCounter
import net.minecraft.text.Text
import net.minecraft.util.Formatting
import kotlin.math.roundToInt

object HudRenderer {

    private const val PANEL_X = 4
    private const val LINE_H = 10
    private const val PADDING = 4

    fun render(context: DrawContext, tickCounter: RenderTickCounter) {
        val client = MinecraftClient.getInstance()
        if (client.debugHud.shouldShowDebugHud()) return  // hide in F3 mode
        val tr = client.textRenderer

        val scaledHeight = client.window.scaledHeight

        // Lines
        val line1 = Text.literal("P ").formatted(Formatting.GOLD)
            .append(Text.literal("%,d".format(HudState.balance)).formatted(Formatting.YELLOW))
        val line2 = Text.literal("Lv.${HudState.level} ").formatted(Formatting.GREEN)
            .append(Text.literal(HudState.jobDisplay).formatted(Formatting.AQUA))
        val xpPct = if (HudState.xpToNext > 0) HudState.xp.toFloat() / HudState.xpToNext else 0f
        val line3 = buildXpText(xpPct)

        val maxWidth = maxOf(tr.getWidth(line1), tr.getWidth(line2), tr.getWidth(line3))
        val panelW = maxWidth + PADDING * 2
        val panelH = LINE_H * 3 + PADDING * 2
        val panelY = scaledHeight - panelH - 30  // 30px above hotbar area

        // Background: semi-transparent dark
        context.fill(
            PANEL_X - 1, panelY - 1,
            PANEL_X + panelW + 1, panelY + panelH + 1,
            0x55000000
        )

        // Text lines
        context.drawText(tr, line1, PANEL_X + PADDING, panelY + PADDING, 0xFFFFFF, true)
        context.drawText(tr, line2, PANEL_X + PADDING, panelY + PADDING + LINE_H, 0xFFFFFF, true)
        context.drawText(tr, line3, PANEL_X + PADDING, panelY + PADDING + LINE_H * 2, 0xFFFFFF, true)
    }

    private fun buildXpText(pct: Float): Text {
        val barLen = 10
        val filled = (pct * barLen).roundToInt().coerceIn(0, barLen)
        val empty = barLen - filled
        return Text.literal("█".repeat(filled)).formatted(Formatting.GREEN)
            .append(Text.literal("█".repeat(empty)).formatted(Formatting.DARK_GRAY))
            .append(Text.literal(" ${HudState.xp}/${HudState.xpToNext}").formatted(Formatting.GRAY))
    }
}
