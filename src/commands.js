ShyFog.Server.executeCommand = (executorId, executorName, cmd) => {
  var args = cmd.split(" ");
  var command = args.shift();
  switch(command) {
    case "ban":
      var player = args[0];
      var reason = args.slice(1).join(" ");
      if (!player) {
        return ShyFog.Server.log("INFO", "Incomplete command.");
      }
      if (!reason) {
        reason = "Banned by an operator.";
      }
      var accountId = Object.keys(ShyFog.Server.playerIds).find(id => ShyFog.Server.playerIds[id] == player);
      if (accountId) {
        if (ShyFog.Server.bannedIds.find(ban => ban.player == accountId)) {
          return ShyFog.Server.log("INFO", "Nothing changed. The player is already banned");
        }
        ShyFog.Server.bannedIds.push({
          "player": accountId, executorId, executorName, reason
        });
      } else {
        if (ShyFog.Server.bannedNames.find(ban => ban.player == player)) {
          return ShyFog.Server.log("INFO", "Nothing changed. The player is already banned");
        }
        ShyFog.Server.bannedNames.push({
          player, reason, executorId, executorName
        });
      }
      ShyFog.Server.log("INFO", `Banned ${player}: ${reason}`);
      var client = ShyFog.Server.clients.find(client => client.username == player);
      if (client) {
        client.close(1000, "You are banned from this server");
      }
      return;
    case "banlist":
      if (args.length) {
        return ShyFog.Server.log("INFO", "Incorrect argument for command");
      }
      if (!ShyFog.Server.bannedIds.length && !ShyFog.Server.bannedNames.length) {
        return ShyFog.Server.log("INFO", "There are no bans");
      }
      ShyFog.Server.log("INFO", `There are ${ShyFog.Server.bannedIds.length + ShyFog.Server.bannedNames.length} ban(s):`);
      for (var ban of ShyFog.Server.bannedIds) {
        if (ban.executorId > 0) {
          ShyFog.Server.log("INFO", `${ShyFog.Server.playerIds[ban.player]} was banned by ${ShyFog.Server.playerIds[ban.executorId]}: ${ban.reason}`);
        } else {
          ShyFog.Server.log("INFO", `${ShyFog.Server.playerIds[ban.player]} was banned by ${ban.executorName}: ${ban.reason}`);
        }
      }
      for (var ban of ShyFog.Server.bannedNames) {
        if (ban.executorId > 0) {
          ShyFog.Server.log("INFO", `${ban.player} was banned by ${ShyFog.Server.playerIds[ban.executorId]}: ${ban.reason}`);
        } else {
          ShyFog.Server.log("INFO", `${ban.player} was banned by ${ban.executorName}: ${ban.reason}`);
        }
      }
      return;
    case "defaultgamemode":
      var gamemode = args[0];
      if (!gamemode) {
        return ShyFog.Server.log("INFO", "Incomplete command.");
      }
      if (args.length > 1) {
        return ShyFog.Server.log("INFO", "Incorrect argument for command");
      }
      if (!["survival", "adventure", "creative", "spectator"].includes(gamemode)) {
        return ShyFog.Server.log("INFO", `Unknown game mode: ${gamemode}`);
      }
      ShyFog.Server.defaultGamemode = gamemode;
      ShyFog.Server.log("INFO", `The default game mode is now ${gamemode[0].toUpperCase()}${gamemode.slice(1)} Mode`);
      return;
    case "gamemode":
      var gamemode = args[0];
      var player = args[1];
      if (!gamemode) {
        return ShyFog.Server.log("INFO", "Incomplete command.");
      }
      if (!player) {
        if (executorId == -1) {
          return ShyFog.Server.log("INFO", "A player is required to run this command here");
        }
        player = executorName;
      }
      if (args.length > 2) {
        return ShyFog.Server.log("INFO", "Incorrect argument for command");
      }
      if (!ShyFog.Server.players.has(player)) {
        return ShyFog.Server.log("INFO", "No player was found");
      }
      if (!["survival", "adventure", "creative", "spectator"].includes(gamemode)) {
        return ShyFog.Server.log("INFO", `Unknown game mode: ${gamemode}`);
      }
      ShyFog.Server.players.get(player).gamemode = gamemode;
      ShyFog.Server.log("INFO", `Set ${player}'s game mode to ${gamemode[0].toUpperCase()}${gamemode.slice(1)} Mode`);
      var client = ShyFog.Server.clients.find(client => client.username == player);
      if (client) {
        ShyFog.Server.sendPacket(client, ShyFog.Server.PacketType.PLAYER_METADATA, player, { gamemode });
      }
      return;
    case "give":
      var player = args[0];
      var item = args[1];
      var amount = args[2];
      if (!player) {
        return ShyFog.Server.log("INFO", "Incomplete command.");
      }
      if (!item) {
        return ShyFog.Server.log("INFO", "Incomplete command.");
      }
      if (!item.includes(":")) {
        item = `shyfog:${item}`;
      }
      if (!amount) {
        amount = "1";
      }
      amount = parseInt(amount);
      if (args.length > 3) {
        return ShyFog.Server.log("INFO", "Incorrect argument for command");
      }
      if (!ShyFog.Server.players.has(player)) {
        return ShyFog.Server.log("INFO", "No player was found");
      }
      if (!ShyFog.Server.items[item]) {
        return ShyFog.Server.log("INFO", `Unknown item '${item}'`);
      }
      if (isNaN(amount)) {
        return ShyFog.Server.log("INFO", "Expected integer");
      }
      if (amount < 1) {
        return ShyFog.Server.log("INFO", `Integer must not be less than 1: found ${amount}`);
      }
      ShyFog.Server.giveItem(ShyFog.Server.players.get(player), item, amount);
      ShyFog.Server.log("INFO", `Gave ${amount} [${item}] to ${player}`);
      var client = ShyFog.Server.clients.find(client => client.username == player);
      if (client) {
        ShyFog.Server.sendPacket(client, ShyFog.Server.PacketType.PLAYER_METADATA, player, {
          "slots": ShyFog.Server.players.get(player).slots
        });
      }
      return;
    case "kick":
      var player = args[0];
      var reason = args.slice(1).join(" ");
      if (!player) {
        return ShyFog.Server.log("INFO", "Incomplete command.");
      }
      if (!reason) {
        reason = "Kicked by an operator";
      }
      if (!ShyFog.Server.players.has(player)) {
        return ShyFog.Server.log("INFO", "No player was found");
      }
      var client = ShyFog.Server.clients.find(client => client.username == player);
      if (!client) {
        return ShyFog.Server.log("INFO", "No player was found");
      }
      ShyFog.Server.log("INFO", `Kicked ${player}: ${reason}`);
      client.close(1000, reason);
      return;
    case "pardon":
      var player = args[0];
      if (!player) {
        return ShyFog.Server.log("INFO", "Incomplete command.");
      }
      if (args.length > 1) {
        return ShyFog.Server.log("INFO", "Incorrect argument for command");
      }
      var accountId = Object.keys(ShyFog.Server.playerIds).find(id => ShyFog.Server.playerIds[id] == player);
      if (accountId) {
        var banIndex = ShyFog.Server.bannedIds.findIndex(ban => ban.player == accountId);
        if (banIndex > -1) {
          ShyFog.Server.bannedIds.splice(banIndex, 1);
          ShyFog.Server.log("INFO", `Unbanned ${player}`);
          return;
        }
      }
      var banIndex = ShyFog.Server.bannedNames.findIndex(ban => ban.player == player);
      if (banIndex == -1) {
        return ShyFog.Server.log("INFO", "Nothing changed. The player isn't banned");
      }
      ShyFog.Server.bannedNames.splice(banIndex, 1);
      ShyFog.Server.log("INFO", `Unbanned ${player}`);
      return;
    case "save-all":
      return ShyFog.Server.saveWorld();
    case "say":
      var content = `[${executorName}] ${args.join(" ")}`;
      ShyFog.Server.log("INFO", content);
      ShyFog.Server.broadcastPacket(client => ShyFog.Server.sendPacket(client, PacketType.CHAT_MESSAGE, { content }));
      return;
    case "seed":
      return ShyFog.Server.log("INFO", `Seed: [${ShyFog.Server.seed}]`);
    case "setblock":
      var x = args[0];
      var y = args[1];
      var z = args[2];
      var block = args[3];
      if (!x || !y || !z) {
        return ShyFog.Server.log("INFO", "Incomplete command.");
      }
      x = parseInt(x);
      y = parseInt(y);
      z = parseInt(z);
      if (isNaN(x) || isNaN(y) || isNaN(z)) {
        return ShyFog.Server.log("INFO", "Expected integer");
      }
      if (!block) {
        return ShyFog.Server.log("INFO", "Incomplete command.");
      }
      if (!block.includes(":")) {
        block = `shyfog:${block}`;
      }
      if (args.length > 4) {
        return ShyFog.Server.log("INFO", "Incorrect argument for command");
      }
      // Allow shyfog:air, even though it doesn't actually exist, handle it specially
      if (!ShyFog.Server.items[block] && block != "shyfog:air") {
        return ShyFog.Server.log("INFO", `Unknown block type '${block}'`);
      }
      var chunkX = Math.floor(x / 16);
      var chunkY = Math.floor(y / 16);
      x = Math.floor(x) % 16;
      y = Math.floor(y) % 16;
      if (x < 0) {
        x += 16;
      }
      if (y < 0) {
        y += 16;
      }
      if (!ShyFog.Server.config.allowBuildingInVoid && (chunkY * 16) + y <= ShyFog.Server.config.voidY) {
        return ShyFog.Server.log("INFO", "That position is out of this world!");
      }
      if (ShyFog.Server.config.worldHeight !== null && (chunkY * 16) + y > ShyFog.Server.config.worldHeight) {
        return ShyFog.Server.log("INFO", "That position is out of this world!");
      }
      if (!ShyFog.Server.chunks[`${chunkX},${chunkY},${z}`]) {
        return ShyFog.Server.log("INFO", "That position is not generated");
      }
      var blockId = ShyFog.Server.chunks[`${chunkX},${chunkY},${z}`].findIndex(block => block && block.x == x && block.y == y);
      if (blockId > -1) {
        ShyFog.Server.chunks[`${chunkX},${chunkY},${z}`][blockId] = null;
        ShyFog.Server.broadcastPacket(client => {
          var playerChunkX = ShyFog.Server.bigToNumber(ShyFog.Server.bigFloor((new Big(ShyFog.Server.players.get(client.username).x)).div(16)));
          var playerChunkY = ShyFog.Server.bigToNumber(ShyFog.Server.bigFloor((new Big(ShyFog.Server.players.get(client.username).y)).div(16)));
          if (playerChunkX >= chunkX - ShyFog.Server.config.viewDistance && playerChunkY >= chunkY - ShyFog.Server.config.viewDistance && playerChunkX <= chunkX + ShyFog.Server.config.viewDistance && playerChunkY <= chunkY + ShyFog.Server.config.viewDistance) {
            ShyFog.Server.sendPacket(client, ShyFog.Server.PacketType.BLOCK_BREAK, chunkX, chunkY, z, blockId);
          }
        });
      }
      if (block == "shyfog:air") {
        return ShyFog.Server.log("INFO", `Changed the block at ${x}, ${y}, ${z}`);
      }
      var newBlock = { block, x, y };
      ShyFog.Server.chunks[`${chunkX},${chunkY},${z}`].push(newBlock);
      ShyFog.Server.broadcastPacket(client => {
        var playerChunkX = ShyFog.Server.bigToNumber(ShyFog.Server.bigFloor((new Big(ShyFog.Server.players.get(client.username).x)).div(16)));
        var playerChunkY = ShyFog.Server.bigToNumber(ShyFog.Server.bigFloor((new Big(ShyFog.Server.players.get(client.username).y)).div(16)));
        if (playerChunkX >= chunkX - ShyFog.Server.config.viewDistance && playerChunkY >= chunkY - ShyFog.Server.config.viewDistance && playerChunkX <= chunkX + ShyFog.Server.config.viewDistance && playerChunkY <= chunkY + ShyFog.Server.config.viewDistance) {
          ShyFog.Server.sendPacket(client, ShyFog.Server.PacketType.BLOCK_PLACE, chunkX, chunkY, z, newBlock);
        }
      });
      ShyFog.Server.log("INFO", `Changed the block at ${x}, ${y}, ${z}`);
      return;
    case "setworldspawn":
      var x = args[0];
      var y = args[1];
      var z = args[2];
      if (!x || !y || !z) {
        return ShyFog.Server.log("INFO", "Incomplete command.");
      }
      x = parseFloat(x);
      y = parseFloat(y);
      z = parseFloat(z);
      if (isNaN(x) || isNaN(y) || isNaN(z)) {
        return ShyFog.Server.log("INFO", "Expected float");
      }
      if (args.length > 3) {
        return ShyFog.Server.log("INFO", "Incorrect argument for command");
      }
      ShyFog.Server.spawn.x = x.toString();
      ShyFog.Server.spawn.y = y.toString();
      ShyFog.Server.spawn.z = z.toString();
      ShyFog.Server.log("INFO", `Set the world spawn point to ${x}, ${y}, ${z} [${x}, ${z}] in shyfog:overworld`);
      return;
    case "stop":
      return ShyFog.Server.stop();
    case "transfer":
      var server = args[0];
      var forceSSL = args[1];
      var player = args[2];
      if (!server) {
        return ShyFog.Server.log("INFO", "Incomplete command.");
      }
      if (!forceSSL) {
        forceSSL = "false";
      }
      if (!["false", "true"].includes(forceSSL)) {
        return ShyFog.Server.log("INFO", "Expected boolean");
      }
      forceSSL = (forceSSL == "true");
      if (!player) {
        if (executorId == -1) {
          return ShyFog.Server.log("INFO", "A player is required to run this command here");
        }
        player = executorName;
      }
      if (!ShyFog.Server.players.has(player)) {
        return ShyFog.Server.log("INFO", "No player was found");
      }
      var client = ShyFog.Server.clients.find(client => client.username == player);
      if (!client) {
        return ShyFog.Server.log("INFO", "No player was found");
      }
      ShyFog.Server.log("INFO", `Transferring ${player} to ${server}`);
      ShyFog.Server.sendPacket(client, ShyFog.Server.PacketType.SERVER_TRANSFER, server, forceSSL);
      return;
    default:
      return ShyFog.Server.log("INFO", "Unknown command.");
  }
};