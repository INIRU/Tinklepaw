package dev.nyaru.hud

object HudState {
    @Volatile var balance: Int = 0
    @Volatile var job: String = ""
    @Volatile var jobDisplay: String = ""
    @Volatile var level: Int = 1
    @Volatile var xp: Int = 0
    @Volatile var xpToNext: Int = 100
    @Volatile var active: Boolean = false

    fun update(json: String) {
        runCatching {
            val obj = com.google.gson.JsonParser.parseString(json).asJsonObject
            balance = obj.get("balance")?.asInt ?: balance
            job = obj.get("job")?.asString ?: job
            jobDisplay = when (job) {
                "miner" -> "광부"
                "farmer" -> "농부"
                else -> job.ifEmpty { "없음" }
            }
            level = obj.get("level")?.asInt ?: level
            xp = obj.get("xp")?.asInt ?: xp
            xpToNext = obj.get("xpToNext")?.asInt ?: xpToNext
            active = true
        }
    }
}
