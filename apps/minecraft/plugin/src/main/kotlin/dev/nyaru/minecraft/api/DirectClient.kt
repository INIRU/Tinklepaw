package dev.nyaru.minecraft.api

import com.google.gson.JsonParser
import dev.nyaru.minecraft.model.MarketItem
import dev.nyaru.minecraft.model.PlayerInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
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

            PlayerInfo(
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
        }
    }

    suspend fun getMarket(): List<MarketItem> = withContext(Dispatchers.IO) {
        val arr = client.newCall(supabaseGet(
            "/mc_market_items?enabled=eq.true&select=symbol,display_name,category,base_price,min_price,max_price,mc_material,enabled,mc_market_prices(current_price)"
        )).execute().use { resp ->
            if (!resp.isSuccessful) return@withContext emptyList()
            JsonParser.parseString(resp.body?.string() ?: "[]").asJsonArray
        }

        arr.map { el ->
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

    private fun enc(v: String): String = URLEncoder.encode(v, "UTF-8")
}
