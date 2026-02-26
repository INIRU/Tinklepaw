package dev.nyaru.minecraft.api

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import dev.nyaru.minecraft.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class ApiClient(private val baseUrl: String, private val apiKey: String) {

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()
    private val json = "application/json; charset=utf-8".toMediaType()

    private fun buildRequest(path: String): Request.Builder =
        Request.Builder()
            .url("$baseUrl/api/minecraft$path")
            .header("X-API-Key", apiKey)

    private suspend fun get(path: String): JsonObject? = withContext(Dispatchers.IO) {
        val req = buildRequest(path).get().build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) return@withContext null
            resp.body?.string()?.let { JsonParser.parseString(it).asJsonObject }
        }
    }

    private suspend fun post(path: String, body: Any): JsonObject? = withContext(Dispatchers.IO) {
        val reqBody = gson.toJson(body).toRequestBody(json)
        val req = buildRequest(path).post(reqBody).build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) return@withContext null
            resp.body?.string()?.let { JsonParser.parseString(it).asJsonObject }
        }
    }

    suspend fun getPlayer(uuid: String): PlayerInfo? {
        val data = get("/player/$uuid") ?: return null
        return PlayerInfo(
            linked = data.get("linked")?.asBoolean ?: false,
            discordUserId = data.get("discordUserId")?.takeIf { !it.isJsonNull }?.asString,
            minecraftName = data.get("minecraftName")?.takeIf { !it.isJsonNull }?.asString,
            balance = data.get("balance")?.asInt ?: 0,
            job = data.get("job")?.asString ?: "miner",
            level = data.get("level")?.asInt ?: 1,
            xp = data.get("xp")?.asInt ?: 0,
            title = data.get("title")?.takeIf { !it.isJsonNull }?.asString,
            titleColor = data.get("titleColor")?.takeIf { !it.isJsonNull }?.asString,
            titleIconUrl = data.get("titleIconUrl")?.takeIf { !it.isJsonNull }?.asString
        )
    }

    suspend fun requestLink(uuid: String, minecraftName: String): LinkRequestResult? {
        val data = post("/link/request", mapOf(
            "uuid" to uuid,
            "minecraftName" to minecraftName
        )) ?: return null
        return LinkRequestResult(
            otp = data.get("otp").asString,
            expiresAt = data.get("expiresAt").asString
        )
    }

    suspend fun getMarket(): List<MarketItem> {
        val data = get("/market") ?: return emptyList()
        val items = mutableListOf<MarketItem>()
        data.getAsJsonArray("items")?.forEach { el ->
            val obj = el.asJsonObject
            val priceObj = obj.getAsJsonObject("mc_market_prices")
            items.add(MarketItem(
                symbol = obj.get("symbol").asString,
                displayName = obj.get("display_name").asString,
                category = obj.get("category").asString,
                basePrice = obj.get("base_price").asInt,
                minPrice = obj.get("min_price").asInt,
                maxPrice = obj.get("max_price").asInt,
                mcMaterial = obj.get("mc_material").asString,
                enabled = obj.get("enabled")?.asBoolean ?: true,
                currentPrice = priceObj?.get("current_price")?.asInt ?: obj.get("base_price").asInt
            ))
        }
        return items
    }

    suspend fun sellItem(uuid: String, symbol: String, qty: Int, freshnessPct: Double?, purityPct: Double?): SellResult? {
        val payload = mutableMapOf<String, Any>(
            "uuid" to uuid,
            "symbol" to symbol,
            "qty" to qty
        )
        if (freshnessPct != null) payload["freshnessPct"] = freshnessPct
        if (purityPct != null) payload["purityPct"] = purityPct
        val data = post("/market/sell", payload) ?: return null
        return SellResult(
            netPoints = data.get("netPoints").asInt,
            unitPrice = data.get("unitPrice").asInt,
            feeAmount = data.get("feeAmount").asInt
        )
    }

    suspend fun getQuests(uuid: String): List<QuestInfo> {
        val data = get("/quests/$uuid") ?: return emptyList()
        val quests = mutableListOf<QuestInfo>()
        data.getAsJsonArray("quests")?.forEach { el ->
            val obj = el.asJsonObject
            val template = obj.getAsJsonObject("mc_quest_templates")
            quests.add(QuestInfo(
                id = obj.get("id").asLong,
                questId = obj.get("quest_id").asString,
                progress = obj.get("progress").asInt,
                completed = obj.get("completed").asBoolean,
                claimed = obj.get("claimed").asBoolean,
                description = template?.get("description")?.asString ?: "",
                targetQty = template?.get("target_qty")?.asInt ?: 1,
                rewardPoints = template?.get("reward_points")?.asInt ?: 0
            ))
        }
        return quests
    }

    suspend fun claimQuest(uuid: String, questId: String): Int? {
        val data = post("/quests/claim", mapOf("uuid" to uuid, "questId" to questId)) ?: return null
        return data.get("rewardPoints")?.asInt
    }

    suspend fun getP2PListings(symbol: String? = null): List<P2PListing> {
        val path = if (symbol != null) "/p2p?symbol=$symbol" else "/p2p"
        val data = get(path) ?: return emptyList()
        val listings = mutableListOf<P2PListing>()
        data.getAsJsonArray("listings")?.forEach { el ->
            val obj = el.asJsonObject
            val playerObj = obj.getAsJsonObject("minecraft_players")
            listings.add(P2PListing(
                id = obj.get("id").asLong,
                sellerUuid = obj.get("seller_uuid").asString,
                sellerName = playerObj?.get("minecraft_name")?.asString ?: "?",
                symbol = obj.get("symbol").asString,
                qty = obj.get("qty").asInt,
                pricePerUnit = obj.get("price_per_unit").asInt
            ))
        }
        return listings
    }

    suspend fun buyP2P(uuid: String, listingId: Long): Boolean {
        val data = post("/p2p/buy", mapOf("uuid" to uuid, "listingId" to listingId)) ?: return false
        return data.get("success")?.asBoolean ?: false
    }

    suspend fun createP2PListing(uuid: String, symbol: String, qty: Int, pricePerUnit: Int): Long? {
        val data = post("/p2p/list", mapOf(
            "uuid" to uuid,
            "symbol" to symbol,
            "qty" to qty,
            "pricePerUnit" to pricePerUnit
        )) ?: return null
        return data.get("id")?.asLong
    }

    suspend fun cancelP2PListing(uuid: String, listingId: Long): Boolean {
        val data = post("/p2p/cancel", mapOf("uuid" to uuid, "listingId" to listingId)) ?: return false
        return data.get("success")?.asBoolean ?: false
    }

    suspend fun changeJob(uuid: String, job: String): Boolean {
        val data = post("/job", mapOf("uuid" to uuid, "job" to job)) ?: return false
        return data.get("success")?.asBoolean ?: false
    }

    suspend fun grantXp(uuid: String, xp: Int): XpResult? {
        val data = post("/job/xp", mapOf("uuid" to uuid, "xp" to xp)) ?: return null
        return XpResult(
            level = data.get("level").asInt,
            xp = data.get("xp").asInt,
            leveledUp = data.get("leveledUp").asBoolean,
            xpToNextLevel = data.get("xpToNextLevel").asInt
        )
    }

    suspend fun unlinkPlayer(uuid: String): Boolean {
        val data = post("/unlink", mapOf("uuid" to uuid)) ?: return false
        return data.get("success")?.asBoolean ?: false
    }
}
