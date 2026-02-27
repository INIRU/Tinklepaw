package dev.nyaru.minecraft.npc

import de.oliver.fancynpcs.api.FancyNpcsPlugin
import de.oliver.fancynpcs.api.NpcData
import de.oliver.fancynpcs.api.utils.NpcEquipmentSlot
import de.oliver.fancynpcs.api.events.NpcInteractEvent
import dev.nyaru.minecraft.NyaruPlugin
import dev.nyaru.minecraft.gui.JobSelectGui
import dev.nyaru.minecraft.gui.ShopGui
import org.bukkit.Location
import org.bukkit.Material
import org.bukkit.entity.Player
import org.bukkit.event.EventHandler
import org.bukkit.event.Listener
import org.bukkit.inventory.ItemStack
import org.bukkit.scheduler.BukkitRunnable
import java.lang.reflect.Constructor
import java.lang.reflect.Method
import java.util.UUID

class FancyNpcsService(private val plugin: NyaruPlugin) : Listener {

    private val waveTaskIds = mutableMapOf<String, Int>()

    // Lazily resolved via reflection so we don't need NMS on the compile classpath.
    // ClientboundAnimatePacket(int entityId, int animationId)  —  animationId 0 = swing main hand
    private val animPacketCons: Constructor<*>? by lazy {
        runCatching {
            val cls = Class.forName("net.minecraft.network.protocol.game.ClientboundAnimatePacket")
            cls.declaredConstructors
                .firstOrNull { it.parameterCount == 2 && it.parameterTypes[0] == Int::class.javaPrimitiveType }
                ?.also { it.isAccessible = true }
        }.getOrNull()
    }

    // CraftPlayer.getHandle() → ServerPlayer, then ServerPlayer.connection.send(Packet)
    private val craftPlayerClass: Class<*>? by lazy {
        runCatching { Class.forName("org.bukkit.craftbukkit.entity.CraftPlayer") }.getOrNull()
    }
    private val getHandleMethod: Method? by lazy {
        runCatching { craftPlayerClass?.getMethod("getHandle") }.getOrNull()
    }
    private val connectionField by lazy {
        runCatching {
            getHandleMethod?.returnType?.fields?.firstOrNull { it.name == "connection" }
                ?: getHandleMethod?.returnType?.declaredFields?.firstOrNull { it.name == "connection" }
                    ?.also { it.isAccessible = true }
        }.getOrNull()
    }
    private val sendMethod: Method? by lazy {
        runCatching {
            connectionField?.type?.methods?.firstOrNull { it.name == "send" && it.parameterCount == 1 }
        }.getOrNull()
    }

    fun createNpc(location: Location, type: NpcType) {
        val id = "nyaru_${type.name.lowercase()}_${System.currentTimeMillis()}"
        val displayName = when (type) {
            NpcType.SHOP -> "<gold><bold>[상점]</bold></gold>"
            NpcType.JOB -> "<green><bold>[직업 변경]</bold></green>"
        }
        val data = NpcData(id, UUID.randomUUID(), location)
        data.setDisplayName(displayName)
        data.setTurnToPlayer(true)
        data.setTurnToPlayerDistance(8)

        val heldItem = when (type) {
            NpcType.SHOP -> ItemStack(Material.EMERALD)
            NpcType.JOB -> ItemStack(Material.BOOK)
        }
        data.addEquipment(NpcEquipmentSlot.MAINHAND, heldItem)

        val npc = FancyNpcsPlugin.get().npcAdapter.apply(data)
        FancyNpcsPlugin.get().npcManager.registerNpc(npc)
        npc.create()
        npc.spawnForAll()

        startWaveTask(id, location)
    }

    /** Get NMS ServerPlayer connection object for a Bukkit player */
    private fun getConnection(viewer: Player): Any? {
        val craftCls = Class.forName("org.bukkit.craftbukkit.entity.CraftPlayer")
        val handle = craftCls.getMethod("getHandle").invoke(viewer) ?: return null
        var connection: Any? = null
        var cls: Class<*>? = handle.javaClass
        while (cls != null && connection == null) {
            try {
                val f = cls.getDeclaredField("connection")
                f.isAccessible = true
                connection = f.get(handle)
            } catch (_: NoSuchFieldException) { cls = cls.superclass }
        }
        return connection
    }

    /** Get NMS Entity by integer entity ID via ServerLevel.getEntity(int) */
    private fun getNmsEntity(world: org.bukkit.World, entityId: Int): Any? {
        return try {
            val craftWorldCls = Class.forName("org.bukkit.craftbukkit.CraftWorld")
            val serverLevel = craftWorldCls.getMethod("getHandle").invoke(craftWorldCls.cast(world))
            var cls: Class<*>? = serverLevel.javaClass
            while (cls != null) {
                try {
                    val m = cls.getDeclaredMethod("getEntity", Int::class.javaPrimitiveType)
                    m.isAccessible = true
                    return m.invoke(serverLevel, entityId)
                } catch (_: NoSuchMethodException) { cls = cls.superclass }
            }
            null
        } catch (e: Exception) {
            plugin.logger.warning("[NPC Wave] getNmsEntity: ${e.message}")
            null
        }
    }

    /** Send a single ClientboundAnimatePacket (action=0: swing main hand) to a viewer via reflection */
    private fun sendSwingPacket(viewer: Player, entityId: Int) {
        try {
            val connection = getConnection(viewer) ?: return
            val packetCls = Class.forName("net.minecraft.network.protocol.game.ClientboundAnimatePacket")

            // Try (int, int) private constructor first (≤1.20.4), else use (Entity, int) (1.20.6+)
            val intIntCons = packetCls.declaredConstructors.firstOrNull { c ->
                c.parameterCount == 2 && c.parameterTypes[0] == Int::class.javaPrimitiveType
            }
            val packet = if (intIntCons != null) {
                intIntCons.isAccessible = true
                intIntCons.newInstance(entityId, 0)
            } else {
                val nmsEntity = getNmsEntity(viewer.world, entityId) ?: return
                val entityCons = packetCls.declaredConstructors.firstOrNull { c ->
                    c.parameterCount == 2 && c.parameterTypes[1] == Int::class.javaPrimitiveType
                } ?: return
                entityCons.isAccessible = true
                entityCons.newInstance(nmsEntity, 0)
            }

            var connCls: Class<*>? = connection.javaClass
            while (connCls != null) {
                val m = connCls.declaredMethods.firstOrNull { it.name == "send" && it.parameterCount == 1 }
                if (m != null) { m.isAccessible = true; m.invoke(connection, packet); return }
                connCls = connCls.superclass
            }
        } catch (e: Exception) {
            plugin.logger.warning("[NPC Wave] ${e::class.simpleName}: ${e.message}")
        }
    }

    /** Trigger 3 rapid arm swings (안녕 wave) for a viewer */
    private fun triggerWave(viewer: Player, entityId: Int) {
        sendSwingPacket(viewer, entityId)
        plugin.server.scheduler.runTaskLater(plugin, Runnable { sendSwingPacket(viewer, entityId) }, 6L)
        plugin.server.scheduler.runTaskLater(plugin, Runnable { sendSwingPacket(viewer, entityId) }, 12L)
    }

    private fun startWaveTask(npcId: String, location: Location) {
        val task = object : BukkitRunnable() {
            override fun run() {
                val npc = FancyNpcsPlugin.get().npcManager.getNpc(npcId) ?: return
                val entityId = npc.getEntityId()
                val world = location.world ?: return
                world.players
                    .filter { it.location.distanceSquared(location) < 10.0 * 10.0 }
                    .forEach { player -> triggerWave(player, entityId) }
            }
        }
        waveTaskIds[npcId] = task.runTaskTimer(plugin, 20L, 80L).taskId
    }

    fun cancelAllWaveTasks() {
        waveTaskIds.values.forEach { plugin.server.scheduler.cancelTask(it) }
        waveTaskIds.clear()
    }

    @EventHandler
    fun onNpcInteract(event: NpcInteractEvent) {
        val name = event.npc.data.name
        val player = event.player
        when {
            name.startsWith("nyaru_shop") -> plugin.server.scheduler.runTask(plugin, Runnable {
                ShopGui(plugin, player).open()
            })
            name.startsWith("nyaru_job") -> plugin.server.scheduler.runTask(plugin, Runnable {
                JobSelectGui(plugin, player).open()
            })
        }
    }
}
