ShyFog.Server.decodePacket = data => {
  var packet = null;
  try {
    packet = JSON.parse("[" + pako.inflate(data, {
      "to": "string"
    }) + "]");
  } catch(_) {
    try {
      packet = JSON.parse(`[${data}]`);
    } catch(_) {
      return null;
    }
  }
  if (!Array.isArray(packet) || !packet.length || typeof packet[0] !== "number") {
    return null;
  }
  return packet;
};

ShyFog.Server.handlePacket = async (ws, req, message) => {
  if (typeof message === "string" && message.startsWith("PING")) {
    return ws.send(`PONG${message.slice(4)}`);
  }
  var packet = ShyFog.Server.decodePacket(message);
  if (!packet) {
    return ws.close(1002, "Protocol Error: Received invalid packet.");
  }
  var [op, ...data] = packet;
  if (op == ShyFog.Server.PacketType.JOIN) {
    if (data.length != 1) {
      return ws.close(1002, `Protocol error in Packet[${op}]:\nData length expected 1`);
    }
    if (typeof data[0] !== "object") {
      return ws.close(1002, `Protocol error in Packet[${op}]:\ndata[0] is not an object`);
    }
    if (ShyFog.Server.getPlayers().length >= ShyFog.Server.config.maxPlayers) {
      return ws.close(1000, "Server maximum players limit reached.");
    }
    if (ShyFog.Server.config.onlineMode) {
      if (!data[0].sessionToken) {
        if (data[0].sessionToken === null) {
          ShyFog.Server.log("INFO", `${ws.provisionalName} lost connection: Unable to verify username.`);
          return ws.close(1000, "Unable to verify username.");
        }
        ws.provisionalName = data[0].username;
        return ShyFog.Server.sendPacket(ws, ShyFog.Server.PacketType.REQUIRE_AUTH);
      }
      var result = await fetch(`${ShyFog.Server.config.authServer}/session/verify`, {
        "method": "POST",
        "headers": {
          "Authorization": data[0].sessionToken,
          "Content-Type": "application/json"
        },
        "body": JSON.stringify({
          "servers": ShyFog.Server.config.validIps
        })
      }).then(res => res.json());
      if (!result.success) {
        ShyFog.Server.log("INFO", `${ws.provisionalName} lost connection: Unable to verify username.`);
        return ws.close(1000, "Unable to verify username.");
      }
      var foundBan = (ShyFog.Server.bannedIds.find(ban => ban.player == result.id) || ShyFog.Server.bannedNames.find(ban => ban.player == result.username));
      if (foundBan) {
        return ws.close(1000, `You are banned from this server.\nReason: ${foundBan.reason}`);
      }
      ws.accountId = result.id;
      ws.username = result.username;
      if (ShyFog.Server.config.useOnlineSkins) {
        ws.skin = result.skin;
      } else {
        ws.skin = `data:image/png;base64,${fs.readFileSync(ShyFog.Server.config.offlineSkin).toString("base64")}`;
      }
      if (ShyFog.Server.playerIds[ws.accountId] && ShyFog.Server.playerIds[ws.accountId] != ws.username) {
        ShyFog.Server.log("INFO", `Migrating player data for username change: ${ShyFog.Server.playerIds[ws.accountId]} --> ${ws.username}`);
        ShyFog.Server.players[ws.username] = ShyFog.Server.players[ShyFog.Server.playerIds[ws.accountId]];
        delete ShyFog.Server.players[ShyFog.Server.playerIds[ws.accountId]];
      }
      ShyFog.Server.playerIds[ws.accountId] = ws.username;
    } else {
      if (ShyFog.Server.clients.find(client => client.username == data[0].username)) {
        ShyFog.Server.log("INFO", `${data[0].username} lost connection: Player with this username is already playing on the server.`);
        return ws.close(1000, "Player with this username is already playing on the server.");
      }
      var foundBan = ShyFog.Server.bannedNames.find(ban => ban.player == data[0].username);
      if (foundBan) {
        return ws.close(1000, `You are banned from this server.\nReason: ${foundBan.reason}`);
      }
      ws.username = data[0].username;
      ws.skin = `data:image/png;base64,${fs.readFileSync(ShyFog.Server.config.offlineSkin).toString("base64")}`;
    }
    ShyFog.Server.sendPacket(ws, ShyFog.Server.PacketType.JOIN, {
      "software": ShyFog.Server.software,
      "version": ShyFog.Server.version
    });
    ShyFog.Server.sendWorldData(ws);
    if (!ShyFog.Server.players[ws.username]) {
      ShyFog.Server.players[ws.username] = {
        "dimension": "shyfog:overworld",
        "x": ShyFog.Server.spawn.x,
        "y": ShyFog.Server.spawn.y,
        "z": ShyFog.Server.spawn.z,
        "direction": "none",
        "gamemode": ShyFog.Server.defaultGamemode,
        "selectedHotbarSlot": 0,
        "slots": {},
        "health": ShyFog.Server.config.maxHealth,
        "food": ShyFog.Server.config.maxFood
      };
    }
    ShyFog.Server.broadcastPacket(client => {
      ShyFog.Server.sendPlayerData(ws, client.username);
      ShyFog.Server.sendPlayerData(client, ws.username);
    });
    ShyFog.Server.log("INFO", `ID of player ${ws.username} is ${ws.accountId}`);
    ShyFog.Server.log("INFO", `${ws.username}[/${req.ip}] logged in at (${ShyFog.Server.players[ws.username].x}, ${ShyFog.Server.players[ws.username].y}, ${ShyFog.Server.players[ws.username].z})`);
    ShyFog.Server.log("INFO", `${ws.username} joined the game`);
    ShyFog.Server.broadcastPacket(client => ShyFog.Server.sendPacket(client, ShyFog.Server.PacketType.CHAT_MESSAGE, {
      "content": `${ws.username} joined the game`,
      "color": "#ffff55"
    }));
    var playerChunkX = ShyFog.Server.bigToNumber(ShyFog.Server.bigFloor((new Big(ShyFog.Server.players[ws.username].x)).div(16)));
    var playerChunkY = ShyFog.Server.bigToNumber(ShyFog.Server.bigFloor((new Big(ShyFog.Server.players[ws.username].y)).div(16)));
    var playerChunkZ = ShyFog.Server.bigToNumber(new Big(ShyFog.Server.players[ws.username].z));
    var chunksToSend = [];
    for (var x = playerChunkX - ShyFog.Server.config.generationDistance; x <= playerChunkX + ShyFog.Server.config.generationDistance; x++) {
      for (var y = playerChunkY - ShyFog.Server.config.generationDistance; y <= playerChunkY + ShyFog.Server.config.generationDistance; y++) {
        for (var z = playerChunkZ - ShyFog.Server.config.generationDistance; z <= playerChunkZ + ShyFog.Server.config.generationDistance; z++) {
          ShyFog.Server.generators.overworld(x, y, z);
        }
      }
    }
    for (var x = playerChunkX - ShyFog.Server.config.viewDistance; x <= playerChunkX + ShyFog.Server.config.viewDistance; x++) {
      for (var y = playerChunkY - ShyFog.Server.config.viewDistance; y <= playerChunkY + ShyFog.Server.config.viewDistance; y++) {
        for (var z = playerChunkZ - ShyFog.Server.config.viewDistance; z <= playerChunkZ + ShyFog.Server.config.viewDistance; z++) {
          chunksToSend.push(`${x},${y},${z}`);
        }
      }
    }
    ShyFog.Server.sendChunks(ws, chunksToSend);
    return;
  }
  if (!ws.username) {
    if (ws.provisionalName) {
      ShyFog.Server.log("INFO", `${ws.provisionalName} lost connection due to protocol error`);
    }
    return ws.close(1002, "Sent packet without joining.");
  }
  if (op == ShyFog.Server.PacketType.MOVEMENT) {
    if (data.length != 4) {
      return ws.close(1002, `Protocol error in Packet[${op}]:\nData length expected 4`);
    }
    try {
      new Big(data[0]);
    } catch {
      return ws.close(1002, `Protocol error in Packet[${op}]:\ndata[0] is not a valid Big`);
    }
    try {
      new Big(data[1]);
    } catch {
      return ws.close(1002, `Protocol error in Packet[${op}]:\ndata[1] is not a valid Big`);
    }
    try {
      new Big(data[2]);
    } catch {
      return ws.close(1002, `Protocol error in Packet[${op}]:\ndata[2] is not a valid Big`);
    }
    if (!["none", "left", "right"].includes(data[3])) {
      return ws.close(1002, `Protocol error in Packet[${op}]:\ndata[3] is not none/left/right`);
    }
    var [x, y, z, direction] = data;
    if (ws.currentGUI && (x != ShyFog.Server.players[ws.username].x || z != ShyFog.Server.players[ws.username].z || (new Big(y)).gt(ShyFog.Server.players[ws.username].y))) {
      return ShyFog.Server.sendPlayerData(ws, ws.username);
    }
    var oldPlayerChunkX = ShyFog.Server.bigToNumber(ShyFog.Server.bigFloor((new Big(ShyFog.Server.players[ws.username].x)).div(16)));
    var oldPlayerChunkY = ShyFog.Server.bigToNumber(ShyFog.Server.bigFloor((new Big(ShyFog.Server.players[ws.username].y)).div(16)));
    var oldPlayerChunkZ = ShyFog.Server.bigToNumber((new Big(ShyFog.Server.players[ws.username].z)));
    ShyFog.Server.players[ws.username].x = x;
    ShyFog.Server.players[ws.username].y = y;
    ShyFog.Server.players[ws.username].z = z;
    ShyFog.Server.players[ws.username].direction = direction;
    var playerChunkX = ShyFog.Server.bigToNumber(ShyFog.Server.bigFloor((new Big(ShyFog.Server.players[ws.username].x)).div(16)));
    var playerChunkY = ShyFog.Server.bigToNumber(ShyFog.Server.bigFloor((new Big(ShyFog.Server.players[ws.username].y)).div(16)));
    var playerChunkZ = ShyFog.Server.bigToNumber((new Big(ShyFog.Server.players[ws.username].z)));
    if (oldPlayerChunkX != playerChunkX || oldPlayerChunkY != playerChunkY || oldPlayerChunkZ != playerChunkZ) {
      for (var x = playerChunkX - ShyFog.Server.config.generationDistance; x <= playerChunkX + ShyFog.Server.config.generationDistance; x++) {
        for (var y = playerChunkY - ShyFog.Server.config.generationDistance; y <= playerChunkY + ShyFog.Server.config.generationDistance; y++) {
          for (var z = playerChunkZ - ShyFog.Server.config.generationDistance; z <= playerChunkZ + ShyFog.Server.config.generationDistance; z++) {
            ShyFog.Server.generators.overworld(x, y, z);
          }
        }
      }
      var chunksToSend = [];
      for (var x = playerChunkX - ShyFog.Server.config.viewDistance; x <= playerChunkX + ShyFog.Server.config.viewDistance; x++) {
        for (var y = playerChunkY - ShyFog.Server.config.viewDistance; y <= playerChunkY + ShyFog.Server.config.viewDistance; y++) {
          for (var z = playerChunkZ - ShyFog.Server.config.viewDistance; z <= playerChunkZ + ShyFog.Server.config.viewDistance; z++) {
            chunksToSend.push(`${x},${y},${z}`);
          }
        }
      }
      for (var x = oldPlayerChunkX - ShyFog.Server.config.viewDistance; x <= oldPlayerChunkX + ShyFog.Server.config.viewDistance; x++) {
        for (var y = oldPlayerChunkY - ShyFog.Server.config.viewDistance; y <= oldPlayerChunkY + ShyFog.Server.config.viewDistance; y++) {
          for (var z = oldPlayerChunkZ - ShyFog.Server.config.viewDistance; z <= oldPlayerChunkZ + ShyFog.Server.config.viewDistance; z++) {
            if (chunksToSend.includes(`${x},${y},${z}`)) {
              chunksToSend.splice(chunksToSend.indexOf(`${x},${y},${z}`), 1);
            }
          }
        }
      }
      ShyFog.Server.sendChunks(ws, chunksToSend);
    }
    ShyFog.Server.broadcastPacket(client => {
      if (client === ws) {
        return;
      }
      ShyFog.Server.sendPlayerData(client, ws.username);
    });
    return;
  }
  if (op == ShyFog.Server.PacketType.BLOCK_BREAK) {
    if (data.length != 3) {
      return ws.close(1002, `Protocol error in Packet[${op}]:\nData length expected 3`);
    }
    if (typeof data[0] !== "number") {
      return ws.close(1002, `Protocol error in Packet[${op}]:\ndata[0] is not a number`);
    }
    if (typeof data[1] !== "number") {
      return ws.close(1002, `Protocol error in Packet[${op}]:\ndata[1] is not a number`);
    }
    if (typeof data[2] !== "number") {
      return ws.close(1002, `Protocol error in Packet[${op}]:\ndata[2] is not a number`);
    }
    var [x, y, z] = data;
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
    if (!ShyFog.Server.chunks[`${chunkX},${chunkY},${z}`]) {
      return;
    }
    if (ws.currentGUI) {
      ShyFog.Server.sendChunks(ws, [`${chunkX},${chunkY},${z}`]);
      ShyFog.Server.sendWorldData(ws);
      ShyFog.Server.sendPlayerData(ws, ws.username);
      return;
    }
    if (ShyFog.Server.players[ws.username].gamemode == "adventure" || ShyFog.Server.players[ws.username].gamemode == "spectator") {
      ShyFog.Server.sendChunks(ws, [`${chunkX},${chunkY},${z}`]);
      ShyFog.Server.sendWorldData(ws);
      ShyFog.Server.sendPlayerData(ws, ws.username);
      return;
    }
    var blockId = ShyFog.Server.chunks[`${chunkX},${chunkY},${z}`].findIndex(block => block && block.x == x && block.y == y);
    if (blockId == -1) {
      ShyFog.Server.sendChunks(ws, [`${chunkX},${chunkY},${z}`]);
      ShyFog.Server.sendWorldData(ws);
      ShyFog.Server.sendPlayerData(ws, ws.username);
      return;
    }
    var blockType = ShyFog.Server.items[ShyFog.Server.chunks[`${chunkX},${chunkY},${z}`][blockId].block]({});
    if (blockType.hardness == -1 && ShyFog.Server.players[ws.username].gamemode != "creative") {
      ShyFog.Server.sendChunks(ws, [`${chunkX},${chunkY},${z}`]);
      ShyFog.Server.sendWorldData(ws);
      ShyFog.Server.sendPlayerData(ws, ws.username);
      return;
    }
    var currentItem = ShyFog.Server.players[ws.username].slots[`hotbar.${ShyFog.Server.players[ws.username].selectedHotbarSlot}`];
    if (currentItem) {
      currentItem = ShyFog.Server.items[currentItem.item]({});
    }
    ShyFog.Server.chunks[`${chunkX},${chunkY},${z}`][blockId] = null;
    ShyFog.Server.broadcastPacket(client => {
      if (client === ws) {
        return;
      }
      var playerChunkX = ShyFog.Server.bigToNumber(ShyFog.Server.bigFloor((new Big(ShyFog.Server.players[client.username].x)).div(16)));
      var playerChunkY = ShyFog.Server.bigToNumber(ShyFog.Server.bigFloor((new Big(ShyFog.Server.players[client.username].y)).div(16)));
      if (playerChunkX >= chunkX - ShyFog.Server.config.viewDistance && playerChunkY >= chunkY - ShyFog.Server.config.viewDistance && playerChunkX <= chunkX + ShyFog.Server.config.viewDistance && playerChunkY <= chunkY + ShyFog.Server.config.viewDistance) {
        ShyFog.Server.sendPacket(client, ShyFog.Server.PacketType.BLOCK_BREAK, chunkX, chunkY, z, blockId);
      }
    });
    if (ShyFog.Server.players[ws.username].gamemode == "survival" && (blockType.minMiningLevel < 1 || (currentItem && currentItem.tags.includes(blockType.correctTool) && currentItem.miningLevel >= blockType.minMiningLevel))) {
      blockType.drop({ ws });
    }
    return;
  }
  if (op == ShyFog.Server.PacketType.USE) {
    if (data.length != 3) {
      return ws.close(1002, `Protocol error in Packet[${op}]:\nData length expected 3`);
    }
    if (typeof data[0] !== "number") {
      return ws.close(1002, `Protocol error in Packet[${op}]:\ndata[0] is not a number`);
    }
    if (typeof data[1] !== "number") {
      return ws.close(1002, `Protocol error in Packet[${op}]:\ndata[1] is not a number`);
    }
    if (typeof data[2] !== "number") {
      return ws.close(1002, `Protocol error in Packet[${op}]:\ndata[2] is not a number`);
    }
    var [x, y, z] = data;
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
    if (!ShyFog.Server.chunks[`${chunkX},${chunkY},${z}`]) {
      return;
    }
    if (ws.currentGUI) {
      ShyFog.Server.sendChunks(ws, [`${chunkX},${chunkY},${z}`]);
      ShyFog.Server.sendWorldData(ws);
      ShyFog.Server.sendPlayerData(ws, ws.username);
      return;
    }
    var blockId = ShyFog.Server.chunks[`${chunkX},${chunkY},${z}`].findIndex(block => block && block.x == x && block.y == y);
    if (blockId > -1) {
      var blockType = ShyFog.Server.items[ShyFog.Server.chunks[`${chunkX},${chunkY},${z}`][blockId].block]({});
      if (blockType.blockUse) {
        blockType.blockUse({ ws });
      }
      return;
    }
    if (!ShyFog.Server.config.allowBuildingInVoid && (chunkY * 16) + y <= ShyFog.Server.config.voidY) {
      ShyFog.Server.sendChunks(ws, [`${chunkX},${chunkY},${z}`]);
      ShyFog.Server.sendWorldData(ws);
      ShyFog.Server.sendPlayerData(ws, ws.username);
      return;
    }
    if (ShyFog.Server.config.worldHeight !== null && (chunkY * 16) + y > ShyFog.Server.config.worldHeight) {
      ShyFog.Server.sendChunks(ws, [`${chunkX},${chunkY},${z}`]);
      ShyFog.Server.sendWorldData(ws);
      return;
    }
    if (!ShyFog.Server.players[ws.username].slots[`hotbar.${ShyFog.Server.players[ws.username].selectedHotbarSlot}`]) {
      ShyFog.Server.sendChunks(ws, [`${chunkX},${chunkY},${z}`]);
      ShyFog.Server.sendWorldData(ws);
      ShyFog.Server.sendPlayerData(ws, ws.username);
      return;
    }
    if (!ShyFog.Server.items[ShyFog.Server.players[ws.username].slots[`hotbar.${ShyFog.Server.players[ws.username].selectedHotbarSlot}`].item]({}).placeable) {
      ShyFog.Server.sendChunks(ws, [`${chunkX},${chunkY},${z}`]);
      ShyFog.Server.sendWorldData(ws);
      ShyFog.Server.sendPlayerData(ws, ws.username);
      return;
    }
    if (ShyFog.Server.players[ws.username].gamemode == "adventure" || ShyFog.Server.players[ws.username].gamemode == "spectator") {
      ShyFog.Server.sendChunks(ws, [`${chunkX},${chunkY},${z}`]);
      ShyFog.Server.sendWorldData(ws);
      ShyFog.Server.sendPlayerData(ws, ws.username);
      return;
    }
    var newBlock = {
      "block": ShyFog.Server.players[ws.username].slots[`hotbar.${ShyFog.Server.players[ws.username].selectedHotbarSlot}`].item,
      x, y
    };
    ShyFog.Server.chunks[`${chunkX},${chunkY},${z}`].push(newBlock);
    ShyFog.Server.broadcastPacket(client => {
      if (client === ws) {
        return;
      }
      var playerChunkX = ShyFog.Server.bigToNumber(ShyFog.Server.bigFloor((new Big(ShyFog.Server.players[client.username].x)).div(16)));
      var playerChunkY = ShyFog.Server.bigToNumber(ShyFog.Server.bigFloor((new Big(ShyFog.Server.players[client.username].y)).div(16)));
      if (playerChunkX >= chunkX - ShyFog.Server.config.viewDistance && playerChunkY >= chunkY - ShyFog.Server.config.viewDistance && playerChunkX <= chunkX + ShyFog.Server.config.viewDistance && playerChunkY <= chunkY + ShyFog.Server.config.viewDistance) {
        ShyFog.Server.sendPacket(client, ShyFog.Server.PacketType.BLOCK_PLACE, chunkX, chunkY, z, newBlock);
      }
    });
    if (ShyFog.Server.players[ws.username].gamemode != "creative") {
      if (--ShyFog.Server.players[ws.username].slots[`hotbar.${ShyFog.Server.players[ws.username].selectedHotbarSlot}`].count < 1) {
        ShyFog.Server.players[ws.username].slots[`hotbar.${ShyFog.Server.players[ws.username].selectedHotbarSlot}`] = null;
      }
    }
    return;
  }
  if (op == ShyFog.Server.PacketType.HOTBAR_SWITCH) {
    if (data.length != 1) {
      return ws.close(1002, `Protocol error in Packet[${op}]:\nData length expected 1`);
    }
    if (typeof data[0] !== "number") {
      return ws.close(1002, `Protocol error in Packet[${op}]:\ndata[0] is not a number`);
    }
    if (data[0] < 0 || data[0] > 8) {
      return ws.close(1002, `Protocol error in Packet[${op}]:\ndata[0] is not in range 0-8`);
    }
    ShyFog.Server.players[ws.username].selectedHotbarSlot = data[0];
    ShyFog.Server.getPlayers().forEach(client => {
      if (client === ws) {
        return;
      }
      ShyFog.Server.sendPlayerData(client, ws.username);
    });
    return;
  }
  if (op == ShyFog.Server.PacketType.OPEN_INVENTORY) {
    if (data.length != 0) {
      return ws.close(1002, `Protocol error in Packet[${op}]:\nData length expected 0`);
    }
    ws.currentGUI = {
      "id": "shyfog:inventory",
      "cursorItem": null
    };
    ShyFog.Server.sendPacket(ws, ShyFog.Server.PacketType.PLAYER_METADATA, ws.username, {
      "currentGUI": ws.currentGUI
    });
    return;
  }
  if (op == ShyFog.Server.PacketType.CLOSE_GUI) {
    if (data.length != 0) {
      return ws.close(1002, `Protocol error in Packet[${op}]:\nData length expected 0`);
    }
    if (!ws.currentGUI) {
      return ShyFog.Server.sendPlayerData(ws, ws.username);
    }
    var slotsUpdated = false;
    for (var slot in ShyFog.Server.players[ws.username].slots) {
      if (slot.startsWith("craft.")) {
        if (ShyFog.Server.players[ws.username].slots[slot]) {
          if (slot != "craft.result") {
            ShyFog.Server.giveItem(ShyFog.Server.players[ws.username], ShyFog.Server.players[ws.username].slots[slot].item, ShyFog.Server.players[ws.username].slots[slot].count);
          }
          ShyFog.Server.players[ws.username].slots[slot] = null;
          slotsUpdated = true;
        }
      }
    }
    if (ws.currentGUI.cursorItem) {
      ShyFog.Server.giveItem(ShyFog.Server.players[ws.username], ws.currentGUI.cursorItem.item, ws.currentGUI.cursorItem.count);
      slotsUpdated = true;
    }
    if (slotsUpdated) {
      ShyFog.Server.sendPacket(ws, ShyFog.Server.PacketType.PLAYER_METADATA, ws.username, {
        "slots": ShyFog.Server.players[ws.username].slots
      });
    }
    ws.currentGUI = null;
    return;
  }
  if (op == ShyFog.Server.PacketType.GUI_CLICK) {
    if (data.length != 3) {
      return ws.close(1002, `Protocol error in Packet[${op}]:\nData length expected 3`);
    }
    if (typeof data[0] !== "number") {
      return ws.close(1002, `Protocol error in Packet[${op}]:\ndata[0] is not a number`);
    }
    if (typeof data[1] !== "string") {
      return ws.close(1002, `Protocol error in Packet[${op}]:\ndata[1] is not a string`);
    }
    if (!["player_slot", "block_slot", "world_slot"].includes(data[1])) {
      return ws.close(1002, `Protocol error in Packet[${op}]:\ndata[1] is not player_slot/block_slot/world_slot`);
    }
    if (typeof data[2] !== "string") {
      return ws.close(1002, `Protocol error in Packet[${op}]:\ndata[2] is not a string`);
    }
    if (!ws.currentGUI) {
      return ShyFog.Server.sendPlayerData(ws, ws.username);
    }
    if (data[1] != "player_slot") {
      return;
    }
    var oldItem = Object.assign({}, ShyFog.Server.players[ws.username].slots[data[2]]);
    if (data[0] == 0) {
      // Left click
      if (ws.currentGUI.cursorItem && ShyFog.Server.players[ws.username].slots[data[2]] && ws.currentGUI.cursorItem.item == ShyFog.Server.players[ws.username].slots[data[2]].item) {
        // Both cursor item and slot item are the same, transfer as much as possible into the slot
        var transferringAmount = Math.min(ws.currentGUI.cursorItem.count, ShyFog.Server.items[ws.currentGUI.cursorItem.item]({}).stackSize - ShyFog.Server.players[ws.username].slots[data[2]].count);
        ws.currentGUI.cursorItem.count -= transferringAmount;
        ShyFog.Server.players[ws.username].slots[data[2]].count += transferringAmount;
        if (ws.currentGUI.cursorItem.count < 1) {
          ws.currentGUI.cursorItem = null;
        }
      } else {
        // Swap cursor item with the slot item
        var oldCursorItem = ws.currentGUI.cursorItem;
        ws.currentGUI.cursorItem = ShyFog.Server.players[ws.username].slots[data[2]];
        ShyFog.Server.players[ws.username].slots[data[2]] = oldCursorItem;
      }
    }
    if (data[0] == 2) {
      // Right click
      if (!ws.currentGUI.cursorItem && ShyFog.Server.players[ws.username].slots[data[2]]) {
        // Take half of the items in the slot
        var takingAmount = Math.ceil(ShyFog.Server.players[ws.username].slots[data[2]].count / 2);
        ws.currentGUI.cursorItem = {
          "item": ShyFog.Server.players[ws.username].slots[data[2]].item,
          "count": takingAmount
        };
        ShyFog.Server.players[ws.username].slots[data[2]].count -= takingAmount;
        if (ShyFog.Server.players[ws.username].slots[data[2]].count < 1) {
          ShyFog.Server.players[ws.username].slots[data[2]] = null;
        }
      } else if (ws.currentGUI.cursorItem && !ShyFog.Server.players[ws.username].slots[data[2]]) {
        // Add just 1 item into the empty slot
        ShyFog.Server.players[ws.username].slots[data[2]] = {
          "item": ws.currentGUI.cursorItem.item,
          "count": 1
        };
        if (--ws.currentGUI.cursorItem.count < 1) {
          ws.currentGUI.cursorItem = null;
        }
      } else if (ws.currentGUI.cursorItem && ShyFog.Server.players[ws.username].slots[data[2]] && ws.currentGUI.cursorItem.item == ShyFog.Server.players[ws.username].slots[data[2]].item) {
        // Add just 1 item into the slot
        if (ShyFog.Server.players[ws.username].slots[data[2]].count < ShyFog.Server.items[ws.currentGUI.cursorItem.item]({}).stackSize) {
          ShyFog.Server.players[ws.username].slots[data[2]].count++;
          if (--ws.currentGUI.cursorItem.count < 1) {
            ws.currentGUI.cursorItem = null;
          }
        }
      } else {
        // Swap cursor item with the slot item
        var oldCursorItem = ws.currentGUI.cursorItem;
        ws.currentGUI.cursorItem = ShyFog.Server.players[ws.username].slots[data[2]];
        ShyFog.Server.players[ws.username].slots[data[2]] = oldCursorItem;
      }
    }
    ShyFog.Server.sendPacket(ws, ShyFog.Server.PacketType.PLAYER_METADATA, ws.username, {
      "slots": ShyFog.Server.players[ws.username].slots,
      "currentGUI": ws.currentGUI
    });
    var slot = ShyFog.Server.guis[ws.currentGUI.id].content.find(element => element.type == data[1] && element.slot == data[2]);
    if (slot && slot.update) {
      slot.update({
        ws, oldItem,
        "newItem": ShyFog.Server.players[ws.username].slots[data[2]]
      });
    }
    return;
  }
  ShyFog.Server.handleUnknownPacket(ws, packet);
};

ShyFog.Server.handleUnknownPacket = (ws, packet) => {
  ws.close(1002, `Protocol error in Packet[${packet[0]}]:\nUnknown packet type`);
};