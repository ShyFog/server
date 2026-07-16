var fs = null;
if (typeof require !== "undefined") {
  fs = require("fs");
} else if (typeof ZenFS !== "undefined") {
  fs = ZenFS.fs;
}

ShyFog.Server.getRegionByChunk = chunk => {
  var [ x, y, z ] = chunk.split(",").map(part => parseInt(part));
  return [ Math.floor(x / 32), Math.floor(y / 32), Math.floor(z / 32) ];
};

ShyFog.Server.updateRegions = () => {
  var regionsToLoad = new Set;
  var chunksToUnload = new Set(Object.keys(ShyFog.Server.chunks));
  var distance = Math.max(ShyFog.Server.config.viewDistance, ShyFog.Server.config.generationDistance);
  for (var player of ShyFog.Server.players.keys()) {
    var playerChunkX = ShyFog.Server.bigToNumber(ShyFog.Server.bigFloor((new Big(ShyFog.Server.players.get(player).x)).div(16)));
    var playerChunkY = ShyFog.Server.bigToNumber(ShyFog.Server.bigFloor((new Big(ShyFog.Server.players.get(player).y)).div(16)));
    var playerChunkZ = ShyFog.Server.bigToNumber(new Big(ShyFog.Server.players.get(player).z));
    for (var x = playerChunkX - distance; x <= playerChunkX + distance; x++) {
      for (var y = playerChunkY - distance; y <= playerChunkY + distance; y++) {
        for (var z = playerChunkZ - distance; z <= playerChunkZ + distance; z++) {
          var region = ShyFog.Server.getRegionByChunk(`${x},${y},${z}`).join(",");
          if (!regionsToLoad.has(region)) {
            regionsToLoad.add(region);
          }
        }
      }
    }
  }
  for (var chunk of chunksToUnload) {
    if (regionsToLoad.has(ShyFog.Server.getRegionByChunk(chunk).join(","))) {
      chunksToUnload.delete(chunk);
    }
  }
  for (var region of regionsToLoad) {
    if (fs.existsSync(ShyFog.Server.config.world + `/region/${region}.sfr`)) {
      var regionData = null;
      if (ShyFog.Server.config.compressWorld) {
        regionData = JSON.parse(pako.inflate(fs.readFileSync(ShyFog.Server.config.world + `/region/${region}.sfr`), {
          "to": "string"
        }));
      } else {
        regionData = JSON.parse(fs.readFileSync(ShyFog.Server.config.world + `/region/${region}.sfr`).toString("utf-8"));
      }
      for (var chunk in regionData.chunks) {
        if (!ShyFog.Server.chunks[chunk]) {
          ShyFog.Server.chunks[chunk] = regionData.chunks[chunk];
          ShyFog.Server.biomes[chunk] = regionData.biomes[chunk];
        }
      }
    }
  }
  var regionsToSave = {};
  for (var chunk of chunksToUnload) {
    var region = ShyFog.Server.getRegionByChunk(chunk).join(",");
    if (!regionsToSave[region]) {
      regionsToSave[region] = {
        "chunks": {},
        "biomes": {}
      };
    }
    regionsToSave[region].chunks[chunk] = ShyFog.Server.chunks[chunk];
    regionsToSave[region].biomes[chunk] = ShyFog.Server.biomes[chunk];
  }
  for (var region in regionsToSave) {
    if (ShyFog.Server.config.compressWorld) {
      fs.writeFileSync(ShyFog.Server.config.world + `/region/${region}.sfr`, pako.deflate(JSON.stringify(regionsToSave[region])));
    } else {
      fs.writeFileSync(ShyFog.Server.config.world + `/region/${region}.sfr`, JSON.stringify(regionsToSave[region]));
    }
  }
  for (var chunk of chunksToUnload) {
    delete ShyFog.Server.chunks[chunk];
    delete ShyFog.Server.biomes[chunk];
  }
};

ShyFog.Server.saveWorld = () => {
  ShyFog.Server.log("INFO", "Saving world");
  var level = {
    "playerIds": ShyFog.Server.playerIds,
    "bannedNames": ShyFog.Server.bannedNames,
    "bannedIds": ShyFog.Server.bannedIds,
    "bannedIps": ShyFog.Server.bannedIps,
    "defaultGamemode": ShyFog.Server.defaultGamemode,
    "worldVersion": ShyFog.Server.worldVersion,
    "seed": ShyFog.Server.seed,
    "spawn": ShyFog.Server.spawn
  };
  if (!fs.existsSync(ShyFog.Server.config.world)) {
    fs.mkdirSync(ShyFog.Server.config.world);
  }
  if (!fs.existsSync(ShyFog.Server.config.world + "/players")) {
    fs.mkdirSync(ShyFog.Server.config.world + "/players");
  }
  if (!fs.existsSync(ShyFog.Server.config.world + "/region")) {
    fs.mkdirSync(ShyFog.Server.config.world + "/region");
  }
  fs.writeFileSync(ShyFog.Server.config.world + "/level.json", JSON.stringify(level));
  for (var player of ShyFog.Server.players.keys()) {
    fs.writeFileSync(ShyFog.Server.config.world + `/players/${player}.json`, JSON.stringify(ShyFog.Server.players.get(player)));
  }
  var regions = {};
  for (var chunk in ShyFog.Server.chunks) {
    var region = ShyFog.Server.getRegionByChunk(chunk).join(",");
    if (!regions[region]) {
      regions[region] = {
        "chunks": {},
        "biomes": {}
      };
    }
    regions[region].chunks[chunk] = ShyFog.Server.chunks[chunk].filter(block => block),
    regions[region].biomes[chunk] = ShyFog.Server.biomes[chunk];
  }
  for (var region in regions) {
    if (ShyFog.Server.config.compressWorld) {
      fs.writeFileSync(ShyFog.Server.config.world + `/region/${region}.sfr`, pako.deflate(JSON.stringify(regions[region])));
    } else {
      fs.writeFileSync(ShyFog.Server.config.world + `/region/${region}.sfr`, JSON.stringify(regions[region]));
    }
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
  ShyFog.Server.sendPacket(ws, ShyFog.Server.PacketType.PLAYER_METADATA, username, Object.assign({}, ShyFog.Server.players.get(username), {
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
    "maxFood": ShyFog.Server.config.maxFood,
    "walkSpeed": 5,
    "shiftSpeed": 2,
    "sprintSpeed": 7,
    "verticalFlySpeed": 3
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