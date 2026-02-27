package dev.nyaru.hud;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;

import java.nio.charset.StandardCharsets;

public class NyaruHudClient implements ClientModInitializer {
    @Override
    public void onInitializeClient() {
        ClientPlayNetworking.registerGlobalReceiver(HudPayload.ID, (payload, context) ->
            HudState.update(new String(payload.data(), StandardCharsets.UTF_8))
        );
        HudRenderCallback.EVENT.register(HudRenderer::render);
    }
}
