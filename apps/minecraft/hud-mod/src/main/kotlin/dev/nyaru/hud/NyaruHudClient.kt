package dev.nyaru.hud

import net.fabricmc.api.ClientModInitializer
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry

object NyaruHudClient : ClientModInitializer {
    override fun onInitializeClient() {
        // Register packet type
        PayloadTypeRegistry.playS2C().register(HudPayload.ID, HudPayload.CODEC)

        // Handle incoming HUD updates from server
        ClientPlayNetworking.registerGlobalReceiver(HudPayload.ID) { payload, _ ->
            HudState.update(payload.json)
        }

        // Register HUD renderer
        HudRenderCallback.EVENT.register { drawContext, tickCounter ->
            HudRenderer.render(drawContext, tickCounter)
        }
    }
}
