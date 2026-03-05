package dev.nyaru.minecraft.api

import com.google.gson.JsonParser
import dev.nyaru.minecraft.cache.MarketCache
import dev.nyaru.minecraft.cache.PlayerCache
import dev.nyaru.minecraft.model.MarketItem
import dev.nyaru.minecraft.model.PlayerInfo
import dev.nyaru.minecraft.model.SellResult
import dev.nyaru.minecraft.model.XpResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

class DirectClient(
    private val supabaseUrl: String,
    private val supabaseKey: String,
    private val discordToken: String? = null,
    private val discordGuildId: String? = null
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .build()

    @Volatile private var roleCache: Map<String, Pair<String?, String?>>? = null
    @Volatile private var roleCachedAt: Long = 0

    private fun supabaseGet(path: String): Request =
        Request.Builder()
            .url("$supabaseUrl/rest/v1$path")
            .header("apikey", supabaseKey)
            .header("Authorization", "Bearer $supabaseKey")
            .header("Accept-Profile", "nyang")
            .get()
            .build()

    private fun discordGet(url: String): Request =
        Request.Builder()
            .url(url)
            .header("Authorization", "Bot $discordToken")
            .get()
            .build()

    suspend fun getPlayer(uuid: String): PlayerInfo? = withContext(Dispatchers.IO) {
        // Return cached entry if still fresh
        PlayerCache.get(uuid)?.let { return@withContext it.info }

        val playerArr = client.newCall(supabaseGet(
            "/minecraft_players?minecraft_uuid=eq.${enc(uuid)}&select=discord_user_id,minecraft_name&limit=1"
        )).execute().use { resp ->
            if (!resp.isSuccessful) return@withContext null
            JsonParser.parseString(resp.body?.string() ?: "[]").asJsonArray
        }

        if (playerArr.isEmpty) return@withContext PlayerInfo(linked = false)
        val playerObj = playerArr[0].asJsonObject
        val discordId = playerObj.get("discord_user_id")?.takeIf { !it.isJsonNull }?.asString
            ?: return@withContext PlayerInfo(linked = false)

        coroutineScope {
            val balanceD = async {
                client.newCall(supabaseGet(
                    "/point_balances?discord_user_id=eq.${enc(discordId)}&select=balance&limit=1"
                )).execute().use { resp ->
                    if (!resp.isSuccessful) return@async 0
                    val arr = JsonParser.parseString(resp.body?.string() ?: "[]").asJsonArray
                    if (arr.isEmpty) 0 else arr[0].asJsonObject.get("balance")?.asInt ?: 0
                }
            }
            val jobD = async {
                client.newCall(supabaseGet(
                    "/minecraft_jobs?minecraft_uuid=eq.${enc(uuid)}&select=job,level,xp&limit=1"
                )).execute().use { resp ->
                    if (!resp.isSuccessful) return@async null
                    val arr = JsonParser.parseString(resp.body?.string() ?: "[]").asJsonArray
                    if (arr.isEmpty) null else arr[0].asJsonObject
                }
            }
            val equippedD = async {
                client.newCall(supabaseGet(
                    "/equipped?discord_user_id=eq.${enc(discordId)}&select=items(name,discord_role_id)&limit=1"
                )).execute().use { resp ->
                    if (!resp.isSuccessful) return@async null
                    val arr = JsonParser.parseString(resp.body?.string() ?: "[]").asJsonArray
                    if (arr.isEmpty) null else arr[0].asJsonObject
                }
            }

            val balance = balanceD.await()
            val jobObj = jobD.await()
            val equippedObj = equippedD.await()

            val itemsObj = equippedObj?.getAsJsonObject("items")
            val title = itemsObj?.get("name")?.takeIf { !it.isJsonNull }?.asString
            val roleId = itemsObj?.get("discord_role_id")?.takeIf { !it.isJsonNull }?.asString
            val (titleColor, titleIconUrl) = if (roleId != null) getRoleData(roleId) else Pair(null, null)

            val result = PlayerInfo(
                linked = true,
                discordUserId = discordId,
                minecraftName = playerObj.get("minecraft_name")?.takeIf { !it.isJsonNull }?.asString,
                balance = balance,
                job = jobObj?.get("job")?.asString ?: "miner",
                level = jobObj?.get("level")?.asInt ?: 1,
                xp = jobObj?.get("xp")?.asInt ?: 0,
                title = title,
                titleColor = titleColor,
                titleIconUrl = titleIconUrl
            )
            PlayerCache.put(uuid, result)
            result
        }
    }

    suspend fun getMarket(): List<MarketItem> = withContext(Dispatchers.IO) {
        MarketCache.get()?.let { return@withContext it }

        val arr = client.newCall(supabaseGet(
            "/mc_market_items?enabled=eq.true&select=symbol,display_name,category,base_price,min_price,max_price,mc_material,enabled,mc_market_prices(current_price)"
        )).execute().use { resp ->
            if (!resp.isSuccessful) return@withContext emptyList()
            JsonParser.parseString(resp.body?.string() ?: "[]").asJsonArray
        }

        val result = arr.map { el ->
            val obj = el.asJsonObject
            val priceObj = obj.getAsJsonObject("mc_market_prices")
            MarketItem(
                symbol = obj.get("symbol").asString,
                displayName = obj.get("display_name").asString,
                category = obj.get("category").asString,
                basePrice = obj.get("base_price").asInt,
                minPrice = obj.get("min_price").asInt,
                maxPrice = obj.get("max_price").asInt,
                mcMaterial = obj.get("mc_material").asString,
                enabled = obj.get("enabled")?.asBoolean ?: true,
                currentPrice = priceObj?.get("current_price")?.asInt ?: obj.get("base_price").asInt
            )
        }
        MarketCache.put(result)
        result
    }

    private suspend fun getRoleData(roleId: String): Pair<String?, String?> =
        getOrFetchRoles()?.get(roleId) ?: Pair(null, null)

    private suspend fun getOrFetchRoles(): Map<String, Pair<String?, String?>>? {
        val now = System.currentTimeMillis()
        if (roleCache != null && now - roleCachedAt < 60 * 60 * 1000) return roleCache
        if (discordToken == null || discordGuildId == null) return roleCache

        return withContext(Dispatchers.IO) {
            client.newCall(discordGet("https://discord.com/api/v10/guilds/$discordGuildId/roles")).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext roleCache
                val arr = JsonParser.parseString(resp.body?.string() ?: "[]").asJsonArray
                val map = mutableMapOf<String, Pair<String?, String?>>()
                arr.forEach { el ->
                    val obj = el.asJsonObject
                    val id = obj.get("id").asString
                    val color = obj.get("color")?.asInt?.takeIf { it != 0 }
                        ?.let { "#${it.toString(16).padStart(6, '0')}" }
                    val iconHash = obj.get("icon")?.takeIf { !it.isJsonNull }?.asString
                    val icon = iconHash?.let { "https://cdn.discordapp.com/role-icons/$id/$it.png" }
                    map[id] = Pair(color, icon)
                }
                roleCache = map
                roleCachedAt = now
                map
            }
        }
    }

    suspend fun sellItem(uuid: String, symbol: String, qty: Int, freshnessPct: Double?, purityPct: Double?): SellResult? = withContext(Dispatchers.IO) {
        // 1. Get discord_user_id
        val discordId = getDiscordId(uuid) ?: return@withContext null

        // 2. Get current price + item info
        val priceArr = client.newCall(supabaseGet(
            "/mc_market_prices?symbol=eq.${enc(symbol)}&select=current_price&limit=1"
        )).execute().use { resp ->
            if (!resp.isSuccessful) return@withContext null
            JsonParser.parseString(resp.body?.string() ?: "[]").asJsonArray
        }
        val itemArr = client.newCall(supabaseGet(
            "/mc_market_items?symbol=eq.${enc(symbol)}&select=base_price,category&limit=1"
        )).execute().use { resp ->
            if (!resp.isSuccessful) return@withContext null
            JsonParser.parseString(resp.body?.string() ?: "[]").asJsonArray
        }

        if (priceArr.isEmpty || itemArr.isEmpty) return@withContext null
        val currentPrice = priceArr[0].asJsonObject.get("current_price").asInt
        val itemObj = itemArr[0].asJsonObject
        val basePrice = itemObj.get("base_price").asInt
        val category = itemObj.get("category").asString

        // 3. Calculate price with bonus
        var unitPrice = currentPrice
        if (category == "crop" && freshnessPct != null) {
            val freshMult = 0.6 + (freshnessPct / 100.0) * 0.4
            unitPrice = Math.round(unitPrice * freshMult).toInt()
        }
        if (category == "mineral" && purityPct != null) {
            val purityMult = 0.8 + (purityPct / 100.0) * 0.2
            unitPrice = Math.round(unitPrice * purityMult).toInt()
        }

        // 4. Fee calculation (default 5%)
        val cfgArr = client.newCall(supabaseGet(
            "/app_config?id=eq.1&select=mc_market_fee_bps&limit=1"
        )).execute().use { resp ->
            if (!resp.isSuccessful) return@use null
            JsonParser.parseString(resp.body?.string() ?: "[]").asJsonArray
        }
        val feeBps = cfgArr?.takeIf { !it.isEmpty }
            ?.get(0)?.asJsonObject?.get("mc_market_fee_bps")?.asInt ?: 500

        val grossPoints = unitPrice * qty
        val feeAmount = Math.round(grossPoints.toDouble() * feeBps / 10000).toInt()
        val netPoints = grossPoints - feeAmount

        // 5. Insert point_events
        val pointBody = """{"discord_user_id":"$discordId","amount":$netPoints,"kind":"minecraft_sell:$symbol:$qty"}"""
        val pointOk = client.newCall(supabasePost("/point_events", pointBody)).execute().use { it.isSuccessful }
        if (!pointOk) return@withContext null

        // 6. Record trade
        val tradeBody = """{"minecraft_uuid":"$uuid","symbol":"$symbol","qty":$qty,"unit_price":$unitPrice,"base_price":$basePrice,"freshness_pct":${freshnessPct ?: "null"},"purity_pct":${purityPct ?: "null"},"fee_amount":$feeAmount,"net_points":$netPoints,"side":"sell"}"""
        client.newCall(supabasePost("/mc_market_trades", tradeBody)).execute().close()

        PlayerCache.invalidate(uuid)
        SellResult(netPoints = netPoints, unitPrice = unitPrice, feeAmount = feeAmount)
    }

    suspend fun grantXp(uuid: String, xp: Int): XpResult? = withContext(Dispatchers.IO) {
        // 1. Get current job data
        val jobArr = client.newCall(supabaseGet(
            "/minecraft_jobs?minecraft_uuid=eq.${enc(uuid)}&select=level,xp&limit=1"
        )).execute().use { resp ->
            if (!resp.isSuccessful) return@withContext null
            JsonParser.parseString(resp.body?.string() ?: "[]").asJsonArray
        }
        if (jobArr.isEmpty) return@withContext null
        val jobObj = jobArr[0].asJsonObject

        var level = jobObj.get("level").asInt
        var currentXp = jobObj.get("xp").asInt + xp
        var leveledUp = false

        // 2. Level-up loop
        var xpRequired = Math.floor(100.0 * Math.pow(level.toDouble(), 1.6)).toInt()
        while (currentXp >= xpRequired) {
            currentXp -= xpRequired
            level++
            leveledUp = true
            xpRequired = Math.floor(100.0 * Math.pow(level.toDouble(), 1.6)).toInt()
        }

        // 3. Update job
        val updateBody = """{"level":$level,"xp":$currentXp,"updated_at":"${java.time.Instant.now()}"}"""
        client.newCall(supabasePatch("/minecraft_jobs?minecraft_uuid=eq.${enc(uuid)}", updateBody)).execute().close()

        // 4. Skill points on level up
        var newSkillPoints: Int? = null
        if (leveledUp) {
            val skillArr = client.newCall(supabaseGet(
                "/mc_player_skills?minecraft_uuid=eq.${enc(uuid)}&select=skill_points&limit=1"
            )).execute().use { resp ->
                if (!resp.isSuccessful) return@use null
                JsonParser.parseString(resp.body?.string() ?: "[]").asJsonArray
            }
            if (skillArr != null && !skillArr.isEmpty) {
                newSkillPoints = skillArr[0].asJsonObject.get("skill_points").asInt + 1
                val skillBody = """{"skill_points":$newSkillPoints,"updated_at":"${java.time.Instant.now()}"}"""
                client.newCall(supabasePatch("/mc_player_skills?minecraft_uuid=eq.${enc(uuid)}", skillBody)).execute().close()
            } else {
                newSkillPoints = 1
                val skillBody = """{"minecraft_uuid":"$uuid","skill_points":1}"""
                client.newCall(supabasePost("/mc_player_skills", skillBody)).execute().close()
            }
        }

        PlayerCache.invalidate(uuid)
        XpResult(level = level, xp = currentXp, leveledUp = leveledUp, xpToNextLevel = xpRequired, newSkillPoints = newSkillPoints)
    }

    suspend fun buySeed(uuid: String, symbol: String, qty: Int): Boolean = withContext(Dispatchers.IO) {
        val discordId = getDiscordId(uuid) ?: return@withContext false

        // Get price
        val priceArr = client.newCall(supabaseGet(
            "/mc_market_prices?symbol=eq.${enc(symbol)}&select=current_price&limit=1"
        )).execute().use { resp ->
            if (!resp.isSuccessful) return@withContext false
            JsonParser.parseString(resp.body?.string() ?: "[]").asJsonArray
        }
        if (priceArr.isEmpty) return@withContext false
        val totalCost = priceArr[0].asJsonObject.get("current_price").asInt * qty

        // Check balance
        val balArr = client.newCall(supabaseGet(
            "/point_balances?discord_user_id=eq.${enc(discordId)}&select=balance&limit=1"
        )).execute().use { resp ->
            if (!resp.isSuccessful) return@withContext false
            JsonParser.parseString(resp.body?.string() ?: "[]").asJsonArray
        }
        val balance = if (balArr.isEmpty) 0 else balArr[0].asJsonObject.get("balance")?.asInt ?: 0
        if (balance < totalCost) return@withContext false

        // Deduct points
        val body = """{"discord_user_id":"$discordId","amount":${-totalCost},"kind":"minecraft_buy:$symbol:$qty"}"""
        val ok = client.newCall(supabasePost("/point_events", body)).execute().use { it.isSuccessful }
        if (ok) PlayerCache.invalidate(uuid)
        ok
    }

    suspend fun changeJob(uuid: String, job: String): Boolean = withContext(Dispatchers.IO) {
        val discordId = getDiscordId(uuid) ?: return@withContext false

        // Check current job
        val jobArr = client.newCall(supabaseGet(
            "/minecraft_jobs?minecraft_uuid=eq.${enc(uuid)}&select=job&limit=1"
        )).execute().use { resp ->
            if (!resp.isSuccessful) return@withContext false
            JsonParser.parseString(resp.body?.string() ?: "[]").asJsonArray
        }

        if (jobArr.isEmpty) {
            // Initial job selection
            val body = """{"minecraft_uuid":"$uuid","job":"$job","level":1,"xp":0,"updated_at":"${java.time.Instant.now()}"}"""
            val req = okhttp3.Request.Builder()
                .url("${supabaseUrl}/rest/v1/minecraft_jobs")
                .header("apikey", supabaseKey)
                .header("Authorization", "Bearer $supabaseKey")
                .header("Content-Profile", "nyang")
                .header("Content-Type", "application/json")
                .header("Prefer", "resolution=merge-duplicates")
                .post(body.toRequestBody("application/json".toMediaType()))
                .build()
            return@withContext client.newCall(req).execute().use { it.isSuccessful }
        }

        val currentJob = jobArr[0].asJsonObject.get("job").asString
        if (currentJob == job) return@withContext false

        // Job change costs points
        val cfgArr = client.newCall(supabaseGet(
            "/app_config?id=eq.1&select=mc_job_change_cost_points&limit=1"
        )).execute().use { resp ->
            if (!resp.isSuccessful) return@use null
            JsonParser.parseString(resp.body?.string() ?: "[]").asJsonArray
        }
        val changeCost = cfgArr?.takeIf { !it.isEmpty }
            ?.get(0)?.asJsonObject?.get("mc_job_change_cost_points")?.asInt ?: 200

        // Check balance
        val balArr = client.newCall(supabaseGet(
            "/point_balances?discord_user_id=eq.${enc(discordId)}&select=balance&limit=1"
        )).execute().use { resp ->
            if (!resp.isSuccessful) return@withContext false
            JsonParser.parseString(resp.body?.string() ?: "[]").asJsonArray
        }
        val balance = if (balArr.isEmpty) 0 else balArr[0].asJsonObject.get("balance")?.asInt ?: 0
        if (balance < changeCost) return@withContext false

        // Deduct points
        val pointBody = """{"discord_user_id":"$discordId","amount":${-changeCost},"kind":"minecraft_job_change:$job"}"""
        client.newCall(supabasePost("/point_events", pointBody)).execute().close()

        // Reset job
        val updateBody = """{"job":"$job","level":1,"xp":0,"last_job_change":"${java.time.Instant.now()}","updated_at":"${java.time.Instant.now()}"}"""
        client.newCall(supabasePatch("/minecraft_jobs?minecraft_uuid=eq.${enc(uuid)}", updateBody)).execute().close()

        PlayerCache.invalidate(uuid)
        true
    }

    private fun getDiscordId(uuid: String): String? {
        val playerArr = client.newCall(supabaseGet(
            "/minecraft_players?minecraft_uuid=eq.${enc(uuid)}&select=discord_user_id&limit=1"
        )).execute().use { resp ->
            if (!resp.isSuccessful) return null
            JsonParser.parseString(resp.body?.string() ?: "[]").asJsonArray
        }
        if (playerArr.isEmpty) return null
        return playerArr[0].asJsonObject.get("discord_user_id")?.takeIf { !it.isJsonNull }?.asString
    }

    private fun supabasePost(path: String, body: String): Request =
        Request.Builder()
            .url("$supabaseUrl/rest/v1$path")
            .header("apikey", supabaseKey)
            .header("Authorization", "Bearer $supabaseKey")
            .header("Content-Profile", "nyang")
            .header("Content-Type", "application/json")
            .header("Prefer", "return=minimal")
            .post(body.toRequestBody("application/json".toMediaType()))
            .build()

    private fun supabasePatch(path: String, body: String): Request =
        Request.Builder()
            .url("$supabaseUrl/rest/v1$path")
            .header("apikey", supabaseKey)
            .header("Authorization", "Bearer $supabaseKey")
            .header("Content-Profile", "nyang")
            .header("Content-Type", "application/json")
            .header("Prefer", "return=minimal")
            .patch(body.toRequestBody("application/json".toMediaType()))
            .build()

    suspend fun spendPoints(uuid: String, amount: Int, reason: String): Boolean = withContext(Dispatchers.IO) {
        // Get discord_user_id from minecraft_players
        val playerReq = supabaseGet(
            "/minecraft_players?minecraft_uuid=eq.${URLEncoder.encode(uuid, "UTF-8")}&select=discord_user_id&limit=1"
        )
        val discordId = client.newCall(playerReq).execute().use { resp ->
            if (!resp.isSuccessful) return@withContext false
            val arr = com.google.gson.JsonParser.parseString(resp.body?.string()).asJsonArray
            arr.firstOrNull()?.asJsonObject?.get("discord_user_id")?.asString
        } ?: return@withContext false

        // Insert negative point event via Supabase REST POST
        val body = """{"discord_user_id":"$discordId","amount":${-amount},"kind":"minecraft_spawn:$reason"}"""
        val postReq = okhttp3.Request.Builder()
            .url("${supabaseUrl}/rest/v1/point_events")
            .header("apikey", supabaseKey)
            .header("Authorization", "Bearer $supabaseKey")
            .header("Content-Profile", "nyang")
            .header("Content-Type", "application/json")
            .header("Prefer", "return=minimal")
            .post(body.toRequestBody("application/json".toMediaType()))
            .build()

        val ok = client.newCall(postReq).execute().use { it.isSuccessful }
        if (ok) PlayerCache.invalidate(uuid)
        ok
    }

    private fun enc(v: String): String = URLEncoder.encode(v, "UTF-8")
}
