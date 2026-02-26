package dev.nyaru.minecraft.cache

import dev.nyaru.minecraft.model.PlayerInfo
import dev.nyaru.minecraft.model.SkillData
import java.util.concurrent.ConcurrentHashMap

data class CachedPlayer(
    val info: PlayerInfo,
    val skills: SkillData?,
    val fetchedAt: Long = System.currentTimeMillis(),
)

object PlayerCache {
    private const val TTL_MS = 120_000L // 2 minutes

    private val cache = ConcurrentHashMap<String, CachedPlayer>()

    fun get(uuid: String): CachedPlayer? {
        val entry = cache[uuid] ?: return null
        if (System.currentTimeMillis() - entry.fetchedAt > TTL_MS) {
            cache.remove(uuid)
            return null
        }
        return entry
    }

    fun put(uuid: String, info: PlayerInfo, skills: SkillData? = null) {
        cache[uuid] = CachedPlayer(info = info, skills = skills)
    }

    fun invalidate(uuid: String): Boolean = cache.remove(uuid) != null

    fun invalidateAll() = cache.clear()

    fun size(): Int = cache.size
}
