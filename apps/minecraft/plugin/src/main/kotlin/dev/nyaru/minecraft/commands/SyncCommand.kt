package dev.nyaru.minecraft.commands

import dev.nyaru.minecraft.cache.PlayerCache
import org.bukkit.command.Command
import org.bukkit.command.CommandExecutor
import org.bukkit.command.CommandSender
import org.bukkit.command.ConsoleCommandSender

class SyncCommand : CommandExecutor {
    override fun onCommand(sender: CommandSender, command: Command, label: String, args: Array<out String>): Boolean {
        // Only allow console/RCON execution
        if (sender !is ConsoleCommandSender) {
            sender.sendMessage("This command can only be executed by console/RCON.")
            return true
        }

        if (args.isEmpty()) {
            sender.sendMessage("Usage: nyaru-invalidate <uuid>")
            return true
        }

        val uuid = args[0]
        val wasPresent = PlayerCache.invalidate(uuid)
        sender.sendMessage(if (wasPresent) "OK: cache invalidated for $uuid" else "OK: $uuid was not cached")
        return true
    }
}
