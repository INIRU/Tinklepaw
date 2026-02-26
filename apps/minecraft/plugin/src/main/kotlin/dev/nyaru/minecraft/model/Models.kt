package dev.nyaru.minecraft.model

data class PlayerInfo(
    val linked: Boolean,
    val discordUserId: String? = null,
    val minecraftName: String? = null,
    val balance: Int = 0,
    val job: String = "miner",
    val level: Int = 1,
    val xp: Int = 0
)

data class MarketItem(
    val symbol: String,
    val displayName: String,
    val category: String,
    val basePrice: Int,
    val minPrice: Int,
    val maxPrice: Int,
    val mcMaterial: String,
    val enabled: Boolean,
    val currentPrice: Int
)

data class QuestInfo(
    val id: Long,
    val questId: String,
    val progress: Int,
    val completed: Boolean,
    val claimed: Boolean,
    val description: String,
    val targetQty: Int,
    val rewardPoints: Int
)

data class P2PListing(
    val id: Long,
    val sellerUuid: String,
    val sellerName: String,
    val symbol: String,
    val qty: Int,
    val pricePerUnit: Int
)

data class SellResult(
    val netPoints: Int,
    val unitPrice: Int,
    val feeAmount: Int
)

data class LinkRequestResult(
    val otp: String,
    val expiresAt: String
)

data class XpResult(
    val level: Int,
    val xp: Int,
    val leveledUp: Boolean,
    val xpToNextLevel: Int
)
