package dev.nyaru.minecraft.skills

import dev.nyaru.minecraft.NyaruPlugin
import dev.nyaru.minecraft.model.SkillData
import kotlinx.coroutines.launch
import org.bukkit.event.EventHandler
import org.bukkit.event.Listener
import org.bukkit.event.player.PlayerJoinEvent
import org.bukkit.event.player.PlayerQuitEvent
import org.bukkit.potion.PotionEffect
import org.bukkit.potion.PotionEffectType
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class SkillManager(private val plugin: NyaruPlugin) : Listener {

    private val skillCache = ConcurrentHashMap<UUID, SkillData>()

    fun getSkills(uuid: UUID): SkillData = skillCache[uuid] ?: SkillData()

    fun updateCache(uuid: UUID, skills: SkillData) {
        skillCache[uuid] = skills
    }

    fun refresh(uuid: UUID) {
        plugin.pluginScope.launch {
            val skills = plugin.apiClient.getSkills(uuid.toString())
            skillCache[uuid] = skills
            val player = plugin.server.getPlayer(uuid) ?: return@launch
            plugin.server.scheduler.runTask(plugin, Runnable {
                applyPassiveEffects(uuid)
            })
        }
    }

    fun applyPassiveEffects(uuid: UUID) {
        val player = plugin.server.getPlayer(uuid) ?: return
        val skills = skillCache[uuid] ?: return
        val hasteLevel = skills.miningSpeedLv
        if (hasteLevel > 0) {
            player.addPotionEffect(PotionEffect(
                PotionEffectType.HASTE,
                Integer.MAX_VALUE,
                hasteLevel - 1,
                false, false, false
            ))
        } else {
            player.removePotionEffect(PotionEffectType.HASTE)
        }
        val resistLevel = skills.stoneSkinLv
        if (resistLevel > 0) {
            player.addPotionEffect(PotionEffect(
                PotionEffectType.RESISTANCE,
                Integer.MAX_VALUE,
                resistLevel - 1,
                false, false, false
            ))
        } else {
            player.removePotionEffect(PotionEffectType.RESISTANCE)
        }
    }

    @EventHandler
    fun onJoin(event: PlayerJoinEvent) {
        plugin.pluginScope.launch {
            val skills = plugin.apiClient.getSkills(event.player.uniqueId.toString())
            skillCache[event.player.uniqueId] = skills
            plugin.server.scheduler.runTask(plugin, Runnable {
                applyPassiveEffects(event.player.uniqueId)
            })
        }
    }

    @EventHandler
    fun onQuit(event: PlayerQuitEvent) {
        skillCache.remove(event.player.uniqueId)
    }
}
