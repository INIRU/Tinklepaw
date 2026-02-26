package dev.nyaru.minecraft.model

data class PlayerInfo(
    val linked: Boolean,
    val discordUserId: String? = null,
    val minecraftName: String? = null,
    val balance: Int = 0,
    val job: String? = null,   // null = 직업 없음("없음")
    val level: Int = 1,
    val xp: Int = 0,
    val title: String? = null,
    val titleColor: String? = null,
    val titleIconUrl: String? = null
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
    val xpToNextLevel: Int,
    val newSkillPoints: Int? = null
)

data class SkillData(
    val skillPoints: Int = 0,
    val miningSpeedLv: Int = 0,
    val luckyStrikeLv: Int = 0,
    val wideHarvestLv: Int = 0,
    val widePlantLv: Int = 0,
    val freshnessLv: Int = 0,
    val stoneSkinLv: Int = 0,
    val harvestFortuneLv: Int = 0
)
