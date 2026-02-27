package dev.nyaru.hud

import net.minecraft.network.RegistryByteBuf
import net.minecraft.network.codec.PacketCodec
import net.minecraft.network.packet.CustomPayload
import net.minecraft.util.Identifier

data class HudPayload(val json: String) : CustomPayload {
    companion object {
        val ID = CustomPayload.Id<HudPayload>(Identifier.of("dev.nyaru", "hud"))
        val CODEC: PacketCodec<RegistryByteBuf, HudPayload> = PacketCodec.ofStatic(
            { buf, value -> buf.writeBytes(value.json.toByteArray(Charsets.UTF_8)) },
            { buf ->
                val bytes = ByteArray(buf.readableBytes())
                buf.readBytes(bytes)
                HudPayload(String(bytes, Charsets.UTF_8))
            }
        )
    }

    override fun getId(): CustomPayload.Id<*> = ID
}
