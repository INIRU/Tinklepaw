package dev.nyaru.minecraft.cache

import dev.nyaru.minecraft.model.MarketItem

object MarketCache {
    private const val TTL_MS = 5 * 60 * 1000L // 5 minutes

    @Volatile private var items: List<MarketItem> = emptyList()
    @Volatile private var fetchedAt: Long = 0

    fun get(): List<MarketItem>? {
        if (items.isEmpty() || System.currentTimeMillis() - fetchedAt > TTL_MS) return null
        return items
    }

    fun put(items: List<MarketItem>) {
        this.items = items
        this.fetchedAt = System.currentTimeMillis()
    }

    fun invalidate() {
        fetchedAt = 0
    }
}
