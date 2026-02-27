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
import java.util.UUID

class FancyNpcsService(private val plugin: NyaruPlugin) : Listener {

    private val waveTaskIds = mutableMapOf<String, Int>()

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

    /**
     * Get the NMS ServerPlayer entity from a FancyNpcs Npc object.
     * Tries multiple strategies since the field/method name varies by FancyNpcs version.
     */
    private fun getNmsEntityFromNpc(npc: Any): Any? {
        // 1. Try getEntity() / getServerPlayer() via full class hierarchy (declared, not just public)
        var searchCls: Class<*>? = npc.javaClass
        while (searchCls != null) {
            for (methodName in listOf("getEntity", "getServerPlayer", "getPlayer", "getNmsEntity")) {
                runCatching {
                    val m = searchCls!!.getDeclaredMethod(methodName)
                    m.isAccessible = true
                    m.invoke(npc)
                }.getOrNull()?.let { return it }
            }
            searchCls = searchCls.superclass
        }

        // 2. Scan ALL non-primitive fields: match by type name OR field name
        val candidates = mutableListOf<Pair<String, Any>>()
        var cls: Class<*>? = npc.javaClass
        while (cls != null) {
            for (field in cls.declaredFields) {
                if (field.type.isPrimitive || field.type == String::class.java) continue
                val typeSimple = field.type.simpleName
                val fieldName = field.name.lowercase()
                val typeMatch = typeSimple == "ServerPlayer" || typeSimple == "EntityPlayer" ||
                    typeSimple.contains("ServerPlayer") || typeSimple == "Player"
                val nameMatch = fieldName == "entity" || fieldName == "serverplayer" ||
                    fieldName == "player" || fieldName.contains("entity") || fieldName.contains("player")
                if (typeMatch || nameMatch) {
                    runCatching {
                        field.isAccessible = true
                        field.get(npc)
                    }.getOrNull()?.let { candidates.add(Pair("${cls.simpleName}.${field.name}:${typeSimple}", it)) }
                }
            }
            cls = cls.superclass
        }
        if (candidates.isNotEmpty()) {
            plugin.logger.info("[NPC Wave] Found entity via field: ${candidates.first().first}")
            return candidates.first().second
        }

        // 3. Debug dump — log all fields so we can fix this precisely next time
        plugin.logger.warning("[NPC Wave] Entity not found. Field dump for ${npc.javaClass.name}:")
        var dumpCls: Class<*>? = npc.javaClass
        while (dumpCls != null && dumpCls != Any::class.java) {
            val fields = dumpCls.declaredFields.joinToString { "${it.type.simpleName} ${it.name}" }
            plugin.logger.warning("[NPC Wave]   ${dumpCls.simpleName}: $fields")
            dumpCls = dumpCls.superclass
        }
        return null
    }

    /** Walk class hierarchy to find the 'connection' field on an NMS ServerPlayer handle */
    private fun getConnection(viewer: Player): Any? {
        return runCatching {
            val craftCls = Class.forName("org.bukkit.craftbukkit.entity.CraftPlayer")
            val handle = craftCls.getMethod("getHandle").invoke(viewer) ?: return null
            var connection: Any? = null
            var cls: Class<*>? = handle.javaClass
            while (cls != null && connection == null) {
                runCatching {
                    val f = cls!!.getDeclaredField("connection")
                    f.isAccessible = true
                    connection = f.get(handle)
                }
                cls = cls.superclass
            }
            connection
        }.getOrNull()
    }

    /** Send ClientboundAnimatePacket(action=0: swing main hand) to viewer for the given NMS entity */
    private fun sendSwingPacket(viewer: Player, nmsEntity: Any, entityId: Int) {
        try {
            val connection = getConnection(viewer)
            if (connection == null) {
                plugin.logger.warning("[NPC Wave] connection null for ${viewer.name}")
                return
            }

            val packetCls = Class.forName("net.minecraft.network.protocol.game.ClientboundAnimatePacket")

            // Paper ≤1.20.4: private (int, int) constructor
            val intIntCons = packetCls.declaredConstructors.firstOrNull { c ->
                c.parameterCount == 2 && c.parameterTypes[0] == Int::class.javaPrimitiveType
            }

            val packet = if (intIntCons != null) {
                intIntCons.isAccessible = true
                intIntCons.newInstance(entityId, 0)
            } else {
                // Paper 1.20.6+: only (Entity, int) constructor
                val entityCons = packetCls.declaredConstructors.firstOrNull { c ->
                    c.parameterCount == 2 && c.parameterTypes[1] == Int::class.javaPrimitiveType
                }
                if (entityCons == null) {
                    plugin.logger.warning("[NPC Wave] No suitable ClientboundAnimatePacket constructor. Constructors: ${packetCls.declaredConstructors.map { it.parameterTypes.map { p -> p.simpleName } }}")
                    return
                }
                entityCons.isAccessible = true
                entityCons.newInstance(nmsEntity, 0)
            }

            // Walk connection class hierarchy to find send(Packet<?>)
            var connCls: Class<*>? = connection.javaClass
            while (connCls != null) {
                val m = connCls.declaredMethods.firstOrNull { it.name == "send" && it.parameterCount == 1 }
                if (m != null) {
                    m.isAccessible = true
                    m.invoke(connection, packet)
                    return
                }
                connCls = connCls.superclass
            }
            plugin.logger.warning("[NPC Wave] send() not found on ${connection.javaClass.name}")
        } catch (e: Exception) {
            plugin.logger.warning("[NPC Wave] ${e::class.simpleName}: ${e.message}")
        }
    }

    /** Trigger 3 rapid arm swings (안녕 wave) */
    private fun triggerWave(viewer: Player, nmsEntity: Any, entityId: Int) {
        sendSwingPacket(viewer, nmsEntity, entityId)
        plugin.server.scheduler.runTaskLater(plugin, Runnable { sendSwingPacket(viewer, nmsEntity, entityId) }, 6L)
        plugin.server.scheduler.runTaskLater(plugin, Runnable { sendSwingPacket(viewer, nmsEntity, entityId) }, 12L)
    }

    private fun startWaveTask(npcId: String, location: Location) {
        val task = object : BukkitRunnable() {
            override fun run() {
                val npc = FancyNpcsPlugin.get().npcManager.getNpc(npcId) ?: return
                val entityId = npc.getEntityId()

                // Get NMS entity directly from the NPC object (ServerPlayer stored in NpcImpl)
                val nmsEntity = getNmsEntityFromNpc(npc)
                if (nmsEntity == null) {
                    plugin.logger.warning("[NPC Wave] Could not get NMS entity from NPC '$npcId' (entityId=$entityId). NPC class: ${npc.javaClass.name}")
                    return
                }

                val world = location.world ?: return
                world.players
                    .filter { it.location.distanceSquared(location) < 10.0 * 10.0 }
                    .forEach { player -> triggerWave(player, nmsEntity, entityId) }
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
