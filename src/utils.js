var fs = null;
if (typeof require !== "undefined") {
  fs = require("fs");
}

ShyFog.Server.saveWorld = () => {
  ShyFog.Server.log("INFO", "Saving world");
  var world = {
    "chunks": ShyFog.Server.chunks,
    "biomes": ShyFog.Server.biomes,
    "players": ShyFog.Server.players,
    "playerIds": ShyFog.Server.playerIds,
    "bannedNames": ShyFog.Server.bannedNames,
    "bannedIds": ShyFog.Server.bannedIds,
    "bannedIps": ShyFog.Server.bannedIps,
    "defaultGamemode": ShyFog.Server.defaultGamemode,
    "worldVersion": ShyFog.Server.worldVersion,
    "seed": ShyFog.Server.seed
  };
  if (ShyFog.Server.config.compressWorld) {
    fs.writeFileSync(ShyFog.Server.config.world, pako.deflate(JSON.stringify(world)));
  } else {
    fs.writeFileSync(ShyFog.Server.config.world, JSON.stringify(world));
  }
};

ShyFog.Server.sendChunks = (ws, chunks) => {
  var chunksToSend = {};
  var biomesToSend = {};
  for (var chunk of chunks) {
    chunksToSend[chunk] = ShyFog.Server.chunks[chunk];
    biomesToSend[chunk] = ShyFog.Server.biomes[chunk];
  }
  ShyFog.Server.sendPacket(ws, ShyFog.Server.PacketType.CHUNKS, chunksToSend, biomesToSend);
};

ShyFog.Server.sendWorldData = ws => {
  var { skyColor, void: void_, voidY, allowBuildingInVoid, worldHeight, reducedDebugInfo } = ShyFog.Server.config;
  ShyFog.Server.sendPacket(ws, ShyFog.Server.PacketType.WORLD_METADATA, {
    skyColor,
    "void": void_,
    voidY,
    allowBuildingInVoid,
    worldHeight,
    reducedDebugInfo
  });
};

ShyFog.Server.sendPlayerData = (ws, username) => {
  ShyFog.Server.sendPacket(ws, ShyFog.Server.PacketType.PLAYER_METADATA, username, Object.assign({}, ShyFog.Server.players[username], {
    "hitboxes": [{
      "x": 0.125,
      "y": 0.9125,
      "width": 0.75,
      "height": 1.9125,
      "rotation": 0
    }],
    "jumpHeight": ShyFog.Server.config.jumpHeight,
    "maximumRange": ShyFog.Server.config.maximumRange,
    "skin": ShyFog.Server.clients.find(client => client.username == username).skin,
    "currentGUI": ShyFog.Server.clients.find(client => client.username == username).currentGUI,
    "maxHealth": ShyFog.Server.config.maxHealth,
    "maxFood": ShyFog.Server.config.maxFood
  }));
};

ShyFog.Server.getPlayers = () => {
  return ShyFog.Server.clients.filter(client => client.username);
};

ShyFog.Server.broadcastPacket = send => {
  ShyFog.Server.getPlayers().forEach(client => send(client));
};

ShyFog.Server.generateBlock = (chunkX, chunkY, chunkZ, block, x, y, z) => {
  var xChunk = Math.floor(x / 16);
  var yChunk = Math.floor(y / 16);
  if (chunkX == xChunk && chunkY == yChunk && chunkZ == z) {
    var localX = x % 16;
    var localY = y % 16;
    if (localX < 0) {
      localX += 16;
    }
    if (localY < 0) {
      localY += 16;
    }
    ShyFog.Server.chunks[`${chunkX},${chunkY},${chunkZ}`].push({
      block,
      "x": localX,
      "y": localY
    });
  }
};

ShyFog.Server.giveItem = (player, item, amount) => {
  var remainingAmount = amount;

  // First, try to find this item in hotbar
  for (var hotbarIndex = 0; hotbarIndex < 9; hotbarIndex++) {
    if (player.slots[`hotbar.${hotbarIndex}`] && player.slots[`hotbar.${hotbarIndex}`].item == item) {
      // Found, give as much as possible up to stack size
      var givingAmount = Math.min(ShyFog.Server.items[item]({}).stackSize - player.slots[`hotbar.${hotbarIndex}`].count, remainingAmount);
      player.slots[`hotbar.${hotbarIndex}`].count += givingAmount;
      remainingAmount -= givingAmount;
      if (remainingAmount < 1) {
        return true;
      }
    }
  }

  // Second, try to find this item in inventory
  for (var inventoryIndex = 0; inventoryIndex < 27; inventoryIndex++) {
    if (player.slots[`inventory.${inventoryIndex}`] && player.slots[`inventory.${inventoryIndex}`].item == item) {
      // Found, give as much as possible up to stack size
      var givingAmount = Math.min(ShyFog.Server.items[item]({}).stackSize - player.slots[`inventory.${inventoryIndex}`].count, remainingAmount);
      player.slots[`inventory.${inventoryIndex}`].count += givingAmount;
      remainingAmount -= givingAmount;
      if (remainingAmount < 1) {
        return true;
      }
    }
  }

  // If we're still here, we need to fill an empty slot to give items

  // Check hotbar first
  for (var hotbarIndex = 0; hotbarIndex < 9; hotbarIndex++) {
    if (!player.slots[`hotbar.${hotbarIndex}`]) {
      // Found an empty slot, give stack size
      var givingAmount = Math.min(ShyFog.Server.items[item]({}).stackSize, remainingAmount);
      player.slots[`hotbar.${hotbarIndex}`] = {
        item,
        "count": givingAmount
      };
      remainingAmount -= givingAmount;
      if (remainingAmount < 1) {
        return true;
      }
    }
  }

  // Then inventory
  for (var inventoryIndex = 0; inventoryIndex < 27; inventoryIndex++) {
    if (!player.slots[`inventory.${inventoryIndex}`]) {
      // Found an empty slot, give stack size
      var givingAmount = Math.min(ShyFog.Server.items[item]({}).stackSize, remainingAmount);
      player.slots[`inventory.${inventoryIndex}`] = {
        item,
        "count": givingAmount
      };
      remainingAmount -= givingAmount;
      if (remainingAmount < 1) {
        return true;
      }
    }
  }

  // If we're still here, the inventory is too full to give items
  return false;
};

ShyFog.Server.getBlock = (x, y, z) => {
  var chunkX = Math.floor(x / 16);
  var chunkY = Math.floor(y / 16);
  var chunkZ = z;
  x = Math.floor(x) % 16;
  y = Math.floor(y) % 16;
  if (x < 0) {
    x += 16;
  }
  if (y < 0) {
    y += 16;
  }
  var chunk = ShyFog.Server.chunks[`${chunkX},${chunkY},${chunkZ}`];
  return chunk.find(block => block && block.x == x && block.y == y);
};