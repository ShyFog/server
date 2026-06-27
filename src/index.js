const software = "Vanilla";
const version = "v" + require("../package.json").version;
const PacketType = {
  "JOIN": 0,
  "REQUIRE_AUTH": 1,
  "WORLD_METADATA": 2,
  "PLAYER_METADATA": 3,
  "CHUNKS": 4,
  "MOVEMENT": 5,
  "BLOCK_BREAK": 6,
  "USE": 7,
  "BLOCK_PLACE": 8,
  "PLAYER_DISCONNECTED": 9,
  "HOTBAR_SWITCH": 10,
  "SERVER_TRANSFER": 11,
  "OPEN_INVENTORY": 12,
  "CLOSE_GUI": 13
};

function saveWorld() {
  log("INFO", "Saving world");
  if (config.compressWorld) {
    fs.writeFileSync(config.world, pako.deflate(JSON.stringify(world)));
  } else {
    fs.writeFileSync(config.world, JSON.stringify(world));
  }
}

function sendChunks(ws, chunks) {
  var chunksToSend = {};
  var biomesToSend = {};
  for (var chunk of chunks) {
    chunksToSend[chunk] = world.chunks[chunk];
    biomesToSend[chunk] = world.biomes[chunk];
  }
  sendPacket(ws, PacketType.CHUNKS, chunksToSend, biomesToSend);
}

function sendWorldData(ws) {
  var { skyColor, void: void_, voidY, allowBuildingInVoid, worldHeight, reducedDebugInfo } = config;
  sendPacket(ws, PacketType.WORLD_METADATA, {
    skyColor,
    "void": void_,
    voidY,
    allowBuildingInVoid,
    worldHeight,
    reducedDebugInfo
  });
}

function sendPlayerData(ws, username) {
  sendPacket(ws, PacketType.PLAYER_METADATA, username, Object.assign({}, world.players[username], {
    "hitboxes": [{
      "x": 0.125,
      "y": 0.9125,
      "width": 0.75,
      "height": 1.9125,
      "rotation": 0
    }],
    "jumpHeight": config.jumpHeight,
    "maximumRange": config.maximumRange,
    "skin": clients.find(client => client.username == username).skin,
    "currentGUI": clients.find(client => client.username == username).currentGUI
  }));
}

// Return clients that are joined
function getPlayers() {
  return clients.filter(client => client.username);
}

function broadcastPacket(send) {
  getPlayers().forEach(client => send(client));
}

function executeCommand(executorId, executorName, cmd) {
  var args = cmd.split(" ");
  var command = args.shift();
  switch(command) {
    case "ban":
      var player = args[0];
      var reason = args.slice(1).join(" ");
      if (!player) {
        return log("INFO", "Incomplete command.");
      }
      if (!reason) {
        reason = "Banned by an operator.";
      }
      var accountId = Object.keys(world.playerIds).find(id => world.playerIds[id] == player);
      if (accountId) {
        if (world.bannedIds.find(ban => ban.player == accountId)) {
          return log("INFO", "Nothing changed. The player is already banned");
        }
        world.bannedIds.push({
          "player": accountId, executorId, executorName, reason
        });
      } else {
        if (world.bannedNames.find(ban => ban.player == player)) {
          return log("INFO", "Nothing changed. The player is already banned");
        }
        world.bannedNames.push({
          player, reason, executorId, executorName
        });
      }
      log("INFO", `Banned ${player}: ${reason}`);
      var client = getPlayers().find(client => client.username == player);
      if (client) {
        client.close(1000, "You are banned from this server");
      }
      return;
    case "banlist":
      if (args.length) {
        return log("INFO", "Incorrect argument for command");
      }
      if (!world.bannedIds.length && !world.bannedNames.length) {
        return log("INFO", "There are no bans");
      }
      log("INFO", `There are ${world.bannedIds.length + world.bannedNames.length} ban(s):`);
      for (var ban of world.bannedIds) {
        if (ban.executorId > 0) {
          log("INFO", `${world.playerIds[ban.player]} was banned by ${world.playerIds[ban.executorId]}: ${ban.reason}`);
        } else {
          log("INFO", `${world.playerIds[ban.player]} was banned by ${ban.executorName}: ${ban.reason}`);
        }
      }
      for (var ban of world.bannedNames) {
        if (ban.executorId > 0) {
          log("INFO", `${ban.player} was banned by ${world.playerIds[ban.executorId]}: ${ban.reason}`);
        } else {
          log("INFO", `${ban.player} was banned by ${ban.executorName}: ${ban.reason}`);
        }
      }
      return;
    case "defaultgamemode":
      var gamemode = args[0];
      if (!gamemode) {
        return log("INFO", "Incomplete command.");
      }
      if (args.length > 1) {
        return log("INFO", "Incorrect argument for command");
      }
      if (!["survival", "adventure", "creative", "spectator"].includes(gamemode)) {
        return log("INFO", `Unknown game mode: ${gamemode}`);
      }
      world.defaultGamemode = gamemode;
      log("INFO", `The default game mode is now ${gamemode[0].toUpperCase()}${gamemode.slice(1)} Mode`);
      return;
    case "gamemode":
      var gamemode = args[0];
      var player = args[1];
      if (!gamemode) {
        return log("INFO", "Incomplete command.");
      }
      if (!player) {
        if (executorId == -1) {
          return log("INFO", "A player is required to run this command here");
        }
        player = executorName;
      }
      if (args.length > 2) {
        return log("INFO", "Incorrect argument for command");
      }
      if (!world.players[player]) {
        return log("INFO", "No player was found");
      }
      if (!["survival", "adventure", "creative", "spectator"].includes(gamemode)) {
        return log("INFO", `Unknown game mode: ${gamemode}`);
      }
      world.players[player].gamemode = gamemode;
      log("INFO", `Set ${player}'s game mode to ${gamemode[0].toUpperCase()}${gamemode.slice(1)} Mode`);
      var client = getPlayers().find(client => client.username == player);
      if (client) {
        sendPacket(client, PacketType.PLAYER_METADATA, player, { gamemode });
      }
      return;
    case "give":
      var player = args[0];
      var item = args[1];
      var amount = args[2];
      if (!player) {
        return log("INFO", "Incomplete command.");
      }
      if (!item) {
        return log("INFO", "Incomplete command.");
      }
      if (!item.includes(":")) {
        item = `shyfog:${item}`;
      }
      if (!amount) {
        amount = "1";
      }
      amount = parseInt(amount);
      if (args.length > 3) {
        return log("INFO", "Incorrect argument for command");
      }
      if (!world.players[player]) {
        return log("INFO", "No player was found");
      }
      if (!items[item]) {
        return log("INFO", `Unknown item '${item}'`);
      }
      if (isNaN(amount)) {
        return log("INFO", "Expected integer");
      }
      if (amount < 1) {
        return log("INFO", `Integer must not be less than 1: found ${amount}`);
      }
      giveItem(world.players[player], item, amount);
      log("INFO", `Gave ${amount} [${item}] to ${player}`);
      var client = getPlayers().find(client => client.username == player);
      if (client) {
        sendPacket(client, PacketType.PLAYER_METADATA, player, {
          "slots": world.players[player].slots
        });
      }
      return;
    case "kick":
      var player = args[0];
      var reason = args.slice(1).join(" ");
      if (!player) {
        return log("INFO", "Incomplete command.");
      }
      if (!reason) {
        reason = "Kicked by an operator";
      }
      if (!world.players[player]) {
        return log("INFO", "No player was found");
      }
      var client = getPlayers().find(client => client.username == player);
      if (!client) {
        return log("INFO", "Player is not online");
      }
      log("INFO", `Kicked ${player}: ${reason}`);
      client.close(1000, reason);
      return;
    case "pardon":
      var player = args[0];
      if (!player) {
        return log("INFO", "Incomplete command.");
      }
      if (args.length > 1) {
        return log("INFO", "Incorrect argument for command");
      }
      var accountId = Object.keys(world.playerIds).find(id => world.playerIds[id] == player);
      if (accountId) {
        var banIndex = world.bannedIds.findIndex(ban => ban.player == accountId);
        if (banIndex > -1) {
          world.bannedIds.splice(banIndex, 1);
          log("INFO", `Unbanned ${player}`);
          return;
        }
      }
      var banIndex = world.bannedNames.findIndex(ban => ban.player == player);
      if (banIndex == -1) {
        return log("INFO", "Nothing changed. The player isn't banned");
      }
      world.bannedNames.splice(banIndex, 1);
      log("INFO", `Unbanned ${player}`);
      return;
    case "save-all":
      return saveWorld();
    case "seed":
      return log("INFO", `Seed: [${world.seed}]`);
    case "setblock":
      var x = args[0];
      var y = args[1];
      var z = args[2];
      var block = args[3];
      if (!x || !y || !z) {
        return log("INFO", "Incomplete command.");
      }
      x = parseInt(x);
      y = parseInt(y);
      z = parseInt(z);
      if (isNaN(x) || isNaN(y) || isNaN(z)) {
        return log("INFO", "Expected integer");
      }
      if (!block) {
        return log("INFO", "Incomplete command.");
      }
      if (!block.includes(":")) {
        block = `shyfog:${block}`;
      }
      if (args.length > 4) {
        return log("INFO", "Incorrect argument for command");
      }
      // Allow shyfog:air, even though it doesn't actually exist, handle it specially
      if (!items[block] && block != "shyfog:air") {
        return log("INFO", `Unknown block type '${block}'`);
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
      if (!config.allowBuildingInVoid && (chunkY * 16) + y <= config.voidY) {
        return log("INFO", "That position is out of this world!");
      }
      if (config.worldHeight !== null && (chunkY * 16) + y > config.worldHeight) {
        return log("INFO", "That position is out of this world!");
      }
      if (!world.chunks[`${chunkX},${chunkY},${z}`]) {
        return log("INFO", "That position is not generated");
      }
      var blockId = world.chunks[`${chunkX},${chunkY},${z}`].findIndex(block => block && block.x == x && block.y == y);
      if (blockId > -1) {
        world.chunks[`${chunkX},${chunkY},${z}`][blockId] = null;
        broadcastPacket(client => {
          var playerChunkX = bigToNumber(bigFloor((new Big(world.players[client.username].x)).div(16)));
          var playerChunkY = bigToNumber(bigFloor((new Big(world.players[client.username].y)).div(16)));
          if (playerChunkX >= chunkX - config.viewDistance && playerChunkY >= chunkY - config.viewDistance && playerChunkX <= chunkX + config.viewDistance && playerChunkY <= chunkY + config.viewDistance) {
            sendPacket(client, PacketType.BLOCK_BREAK, chunkX, chunkY, z, blockId);
          }
        });
      }
      if (block == "shyfog:air") {
        return log("INFO", `Changed the block at ${x}, ${y}, ${z}`);
      }
      var newBlock = { block, x, y };
      world.chunks[`${chunkX},${chunkY},${z}`].push(newBlock);
      broadcastPacket(client => {
        var playerChunkX = bigToNumber(bigFloor((new Big(world.players[client.username].x)).div(16)));
        var playerChunkY = bigToNumber(bigFloor((new Big(world.players[client.username].y)).div(16)));
        if (playerChunkX >= chunkX - config.viewDistance && playerChunkY >= chunkY - config.viewDistance && playerChunkX <= chunkX + config.viewDistance && playerChunkY <= chunkY + config.viewDistance) {
          sendPacket(client, PacketType.BLOCK_PLACE, chunkX, chunkY, z, newBlock);
        }
      });
      log("INFO", `Changed the block at ${x}, ${y}, ${z}`);
      return;
    case "setworldspawn":
      var x = args[0];
      var y = args[1];
      var z = args[2];
      if (!x || !y || !z) {
        return log("INFO", "Incomplete command.");
      }
      x = parseFloat(x);
      y = parseFloat(y);
      z = parseFloat(z);
      if (isNaN(x) || isNaN(y) || isNaN(z)) {
        return log("INFO", "Expected float");
      }
      if (args.length > 3) {
        return log("INFO", "Incorrect argument for command");
      }
      world.spawn.x = x.toString();
      world.spawn.y = y.toString();
      world.spawn.z = z.toString();
      log("INFO", `Set the world spawn point to ${x}, ${y}, ${z} [${x}, ${z}] in shyfog:overworld`);
      return;
    case "stop":
      return onStop();
    case "transfer":
      var server = args[0];
      var forceSSL = args[1];
      var player = args[2];
      if (!server) {
        return log("INFO", "Incomplete command.");
      }
      if (!forceSSL) {
        forceSSL = "false";
      }
      if (!["false", "true"].includes(forceSSL)) {
        return log("INFO", "Expected boolean");
      }
      forceSSL = (forceSSL == "true");
      if (!player) {
        if (executorId == -1) {
          return log("INFO", "A player is required to run this command here");
        }
        player = executorName;
      }
      if (!world.players[player]) {
        return log("INFO", "No player was found");
      }
      var client = getPlayers().find(client => client.username == player);
      if (!client) {
        return log("INFO", "Player is not online");
      }
      log("INFO", `Transferring ${player} to ${server}`);
      sendPacket(client, PacketType.SERVER_TRANSFER, server, forceSSL);
      return;
    default:
      return log("INFO", "Unknown command.");
  }
}

var serverStartTime = performance.now();
var { pako, Big, log, sendPacket, bigFloor, bigToNumber, giveItem, items, getBlock } = require("./utils.js");
log("INFO", "Loading libraries...");

var express = require("express");
var expressWs = require("express-ws");
var fs = require("fs");
var https = require("https");
var readline = require("readline");
var overworldGenerator = require("./generators/overworld.js");

log("INFO", `Starting ShyFog server version ${version}...`);

if (!fs.existsSync("config.json")) {
  log("WARN", "Config does not exist, creating");
  fs.writeFileSync("config.json", JSON.stringify({
    "port": 6280,
    "ssl": false,
    "sslCert": "",
    "sslKey": "",
    "motd": "A ShyFog server",
    "maxPlayers": 20,
    "icon": "",
    "defaultGamemode": "survival",
    "seed": "",
    "world": "world.sfw",
    "compressWorld": true,
    "autosaveTime": 60,
    "onlineMode": true,
    "authServer": "https://shyfog-auth.topcatto8.workers.dev/api",
    "validIps": ["localhost:6280"],
    "useOnlineSkins": true,
    "offlineSkin": "default.png",
    "viewDistance": 2,
    "generationDistance": 2,
    "skyColor": "#4de7ff",
    "void": true,
    "voidY": -65,
    "allowBuildingInVoid": false,
    "worldHeight": 319,
    "jumpHeight": 1.2522,
    "reducedDebugInfo": false,
    "maximumRange": "4.5"
  }, null, 2));
}

log("INFO", "Loading config");
var config = JSON.parse(fs.readFileSync("config.json").toString("utf-8"));

var app = express();
var sslServer = null;
if (config.ssl) {
  sslServer = https.createServer({
    "cert": fs.readFileSync(config.sslCert),
    "key": fs.readFileSync(config.sslKey)
  }, app);
  expressWs(app, sslServer);
} else {
  expressWs(app);
}
var clients = [];
var consoleInput = readline.createInterface({
  "input": process.stdin,
  "output": process.stdout
});
var world = null;
if (fs.existsSync(config.world)) {
  log("INFO", `Loading "${config.world}"`);
  try {
    if (config.compressWorld) {
      world = JSON.parse(pako.inflate(fs.readFileSync(config.world), {
        "to": "string"
      }));
    } else {
      world = JSON.parse(fs.readFileSync(config.world));
    }
  } catch {
    log("FATAL", "World file is corrupted");
    process.exit(1);
  }
  for (var chunk in world.chunks) {
    world.chunks[chunk] = world.chunks[chunk].filter(block => block);
  }
} else {
  log("INFO", `Preparing level "${config.world}"`);
  var seed = config.seed;
  if (seed === "") {
    seed = Math.floor(Math.random() *Number.MAX_SAFE_INTEGER).toString();
  }
  log("INFO", `Using seed "${seed}"`);
  world = {
    "chunks": {},
    "biomes": {},
    "players": {},
    "playerIds": {},
    "bannedNames": [],
    "bannedIds": [],
    "bannedIps": [],
    "defaultGamemode": config.defaultGamemode,
    version, seed
  };
  var generationStartTime = performance.now();
  for (var x = -config.generationDistance; x <= config.generationDistance; x++) {
    for (var y = 4 - config.generationDistance; y <= 4 + config.generationDistance; y++) {
      for (var z = -config.generationDistance; z <= config.generationDistance; z++) {
        overworldGenerator(world, config, x, y, z);
      }
    }
  }
  log("INFO", "Selecting global world spawn...");
  const transparentBlocks = ["shyfog:short_grass", "shyfog:tall_grass_top", "shyfog:tall_grass_bottom", "shyfog:dandelion", "shyfog:poppy", "shyfog:blue_orchid", "shyfog:allium", "shyfog:azure_bluet", "shyfog:white_tulip", "shyfog:red_tulip", "shyfog:pink_tulip", "shyfog:orange_tulip", "shyfog:oxeye_daisy", "shyfog:cornflower"];
  var safeChunks = [];
  for (var chunk in world.chunks) {
    var [ chunkX, chunkY, chunkZ ] = chunk.split(",").map(part => parseInt(part));
    var spawnBlocks = world.chunks[chunk].filter(block => block && !transparentBlocks.includes(block.block) && (!getBlock(world, (chunkX * 16) + block.x, (chunkY * 16) + block.y + 1, chunkZ) || transparentBlocks.includes(getBlock(world, (chunkX * 16) + block.x, (chunkY * 16) + block.y + 1, chunkZ).block)));
    if (spawnBlocks.length) {
      safeChunks.push(chunk);
    }
  }
  var spawnChunk = safeChunks[Math.floor(Math.random() *safeChunks.length)];
  var [ chunkX, chunkY, chunkZ ] = spawnChunk.split(",").map(part => parseInt(part));
  var spawnBlocks = world.chunks[spawnChunk].filter(block => block && !transparentBlocks.includes(block.block) && (!getBlock(world, (chunkX * 16) + block.x, (chunkY * 16) + block.y + 1, chunkZ) || transparentBlocks.includes(getBlock(world, (chunkX * 16) + block.x, (chunkY * 16) + block.y + 1, chunkZ).block)));
  var spawnBlock = spawnBlocks[Math.floor(Math.random() *spawnBlocks.length)];
  world.spawn = {
    "x": ((chunkX * 16) + spawnBlock.x).toString(),
    "y": ((chunkY * 16) + spawnBlock.y + 1).toString(),
    "z": chunkZ.toString()
  };
  log("INFO", `Time elapsed: ${Math.round(performance.now() - generationStartTime)} ms`);
  saveWorld();
}

// Handle CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});
app.options("*", (req, res) => {
  res.status(204);
  res.end();
});

// Pings
app.get("/api/shyfog/ping", (req, res) => {
  res.json({
    "success": true,
    software, version,
    "onlinePlayers": getPlayers().length,
    "maxPlayers": config.maxPlayers,
    "motd": config.motd,
    "icon": config.icon ? `data:image/png;base64,${fs.readFileSync(config.icon).toString("base64")}` : null
  });
});

// WebSocket
app.ws("/api/shyfog/game", (ws, req) => {
  clients.push(ws);
  ws.on("message", async message => {
    if (typeof message === "string" && message.startsWith("PING")) {
      return ws.send(`PONG${message.slice(4)}`);
    }
    var msg = null;
    try {
      msg = JSON.parse("[" + pako.inflate(message, {
        "to": "string"
      }) + "]");
    } catch(_) {
      try {
        msg = JSON.parse(`[${message}]`);
      } catch(_) {
        return ws.close(1002, "Protocol Error: Received invalid packet.");
      }
    }
    if (!Array.isArray(msg) || !msg.length || typeof msg[0] !== "number") {
      return ws.close(1002, "Protocol Error: Received invalid packet type.");
    }
    var [ op, ...data ] = msg;
    if (op == PacketType.JOIN) {
      if (data.length != 1) {
        return ws.close(1002, `Protocol error in Packet[${op}]:\nData length expected 1`);
      }
      if (typeof data[0] !== "object") {
        return ws.close(1002, `Protocol error in Packet[${op}]:\ndata[0] is not an object`);
      }
      if (clients.filter(client => client.username).length >= config.maxPlayers) {
        return ws.close(1000, "Server maximum players limit reached.");
      }
      if (config.onlineMode) {
        if (!data[0].sessionToken) {
          if (data[0].sessionToken === null) {
            log("INFO", `${ws.provisionalName} lost connection: Unable to verify username.`);
            return ws.close(1000, "Unable to verify username.");
          }
          ws.provisionalName = data[0].username;
          return sendPacket(ws, PacketType.REQUIRE_AUTH);
        }
        var result = await fetch(`${config.authServer}/session/verify`, {
          "method": "POST",
          "headers": {
            "Authorization": data[0].sessionToken,
            "Content-Type": "application/json"
          },
          "body": JSON.stringify({
            "servers": config.validIps
          })
        }).then(res => res.json());
        if (!result.success) {
          log("INFO", `${ws.provisionalName} lost connection: Unable to verify username.`);
          return ws.close(1000, "Unable to verify username.");
        }
        var foundBan = (world.bannedIds.find(ban => ban.player == result.id) || world.bannedNames.find(ban => ban.player == result.username));
        if (foundBan) {
          return ws.close(1000, `You are banned from this server.\nReason: ${foundBan.reason}`);
        }
        ws.accountId = result.id;
        ws.username = result.username;
        if (config.useOnlineSkins) {
          ws.skin = result.skin;
        } else {
          ws.skin = `data:image/png;base64,${fs.readFileSync(config.offlineSkin).toString("base64")}`;
        }
        if (world.playerIds[ws.accountId] && world.playerIds[ws.accountId] != ws.username) {
          log("INFO", `Migrating player data for username change: ${world.playerIds[ws.accountId]} --> ${ws.username}`);
          world.players[ws.username] = world.players[world.playerIds[ws.accountId]];
          delete world.players[world.playerIds[ws.accountId]];
        }
        world.playerIds[ws.accountId] = ws.username;
      } else {
        if (clients.find(client => client.username == data[0].username)) {
          log("INFO", `${data[0].username} lost connection: Player with this username is already playing on the server.`);
          return ws.close(1000, "Player with this username is already playing on the server.");
        }
        var foundBan = world.bannedNames.find(ban => ban.player == data[0].username);
        if (foundBan) {
          return ws.close(1000, `You are banned from this server.\nReason: ${foundBan.reason}`);
        }
        ws.username = data[0].username;
        ws.skin = `data:image/png;base64,${fs.readFileSync(config.offlineSkin).toString("base64")}`;
      }
      sendPacket(ws, PacketType.JOIN, { software, version });
      sendWorldData(ws);
      if (!world.players[ws.username]) {
        world.players[ws.username] = {
          "dimension": "shyfog:overworld",
          "x": world.spawn.x,
          "y": world.spawn.y,
          "z": world.spawn.z,
          "direction": "none",
          "gamemode": world.defaultGamemode,
          "selectedHotbarSlot": 0,
          "slots": {}
        };
      }
      getPlayers().forEach(client => {
        sendPlayerData(ws, client.username);
        sendPlayerData(client, ws.username);
      });
      log("INFO", `ID of player ${ws.username} is ${ws.accountId}`);
      log("INFO", `${ws.username}[/${req.ip}] logged in at (${world.players[ws.username].x}, ${world.players[ws.username].y}, ${world.players[ws.username].z})`);
      log("INFO", `${ws.username} joined the game`);
      var playerChunkX = bigToNumber(bigFloor((new Big(world.players[ws.username].x)).div(16)));
      var playerChunkY = bigToNumber(bigFloor((new Big(world.players[ws.username].y)).div(16)));
      var playerChunkZ = bigToNumber(new Big(world.players[ws.username].z));
      var chunksToSend = [];
      for (var x = playerChunkX - config.generationDistance; x <= playerChunkX + config.generationDistance; x++) {
        for (var y = playerChunkY - config.generationDistance; y <= playerChunkY + config.generationDistance; y++) {
          for (var z = playerChunkZ - config.generationDistance; z <= playerChunkZ + config.generationDistance; z++) {
            overworldGenerator(world, config, x, y, z);
          }
        }
      }
      for (var x = playerChunkX - config.viewDistance; x <= playerChunkX + config.viewDistance; x++) {
        for (var y = playerChunkY - config.viewDistance; y <= playerChunkY + config.viewDistance; y++) {
          for (var z = playerChunkZ - config.viewDistance; z <= playerChunkZ + config.viewDistance; z++) {
            chunksToSend.push(`${x},${y},${z}`);
          }
        }
      }
      sendChunks(ws, chunksToSend);
      return;
    }
    if (!ws.username) {
      if (ws.provisionalName) {
        log("INFO", `${ws.provisionalName} lost connection due to protocol error`);
      }
      return ws.close(1002, "Sent packet without joining.");
    }
    if (op == PacketType.MOVEMENT) {
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
      var [ x, y, z, direction ] = data;
      var oldPlayerChunkX = bigToNumber(bigFloor((new Big(world.players[ws.username].x)).div(16)));
      var oldPlayerChunkY = bigToNumber(bigFloor((new Big(world.players[ws.username].y)).div(16)));
      var oldPlayerChunkZ = bigToNumber((new Big(world.players[ws.username].z)));
      world.players[ws.username].x = x;
      world.players[ws.username].y = y;
      world.players[ws.username].z = z;
      world.players[ws.username].direction = direction;
      var playerChunkX = bigToNumber(bigFloor((new Big(world.players[ws.username].x)).div(16)));
      var playerChunkY = bigToNumber(bigFloor((new Big(world.players[ws.username].y)).div(16)));
      var playerChunkZ = bigToNumber((new Big(world.players[ws.username].z)));
      if (oldPlayerChunkX != playerChunkX || oldPlayerChunkY != playerChunkY || oldPlayerChunkZ != playerChunkZ) {
        for (var x = playerChunkX - config.generationDistance; x <= playerChunkX + config.generationDistance; x++) {
          for (var y = playerChunkY - config.generationDistance; y <= playerChunkY + config.generationDistance; y++) {
            for (var z = playerChunkZ - config.generationDistance; z <= playerChunkZ + config.generationDistance; z++) {
              overworldGenerator(world, config, x, y, z);
            }
          }
        }
        var chunksToSend = [];
        for (var x = playerChunkX - config.viewDistance; x <= playerChunkX + config.viewDistance; x++) {
          for (var y = playerChunkY - config.viewDistance; y <= playerChunkY + config.viewDistance; y++) {
            for (var z = playerChunkZ - config.viewDistance; z <= playerChunkZ + config.viewDistance; z++) {
              chunksToSend.push(`${x},${y},${z}`);
            }
          }
        }
        for (var x = oldPlayerChunkX - config.viewDistance; x <= oldPlayerChunkX + config.viewDistance; x++) {
          for (var y = oldPlayerChunkY - config.viewDistance; y <= oldPlayerChunkY + config.viewDistance; y++) {
            for (var z = oldPlayerChunkZ - config.viewDistance; z <= oldPlayerChunkZ + config.viewDistance; z++) {
              if (chunksToSend.includes(`${x},${y},${z}`)) {
                chunksToSend.splice(chunksToSend.indexOf(`${x},${y},${z}`), 1);
              }
            }
          }
        }
        sendChunks(ws, chunksToSend);
      }
      getPlayers().forEach(client => {
        if (client === ws) {
          return;
        }
        sendPlayerData(client, ws.username);
      });
      return;
    }
    if (op == PacketType.BLOCK_BREAK) {
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
      var [ x, y, z ] = data;
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
      if (world.players[ws.username].gamemode == "adventure" || world.players[ws.username].gamemode == "spectator") {
        sendChunks(ws, [`${chunkX},${chunkY},${z}`]);
        sendWorldData(ws);
        sendPlayerData(ws, ws.username);
        return;
      }
      if (!world.chunks[`${chunkX},${chunkY},${z}`]) {
        return;
      }
      var blockId = world.chunks[`${chunkX},${chunkY},${z}`].findIndex(block => block && block.x == x && block.y == y);
      if (blockId == -1) {
        sendChunks(ws, [`${chunkX},${chunkY},${z}`]);
        sendWorldData(ws);
        sendPlayerData(ws, ws.username);
        return;
      }
      var blockType = world.chunks[`${chunkX},${chunkY},${z}`][blockId].block;
      if (items[blockType].hardness == -1 && world.players[ws.username].gamemode != "creative") {
        sendChunks(ws, [`${chunkX},${chunkY},${z}`]);
        sendWorldData(ws);
        sendPlayerData(ws, ws.username);
        return;
      }
      world.chunks[`${chunkX},${chunkY},${z}`][blockId] = null;
      broadcastPacket(client => {
        if (client === ws) {
          return;
        }
        var playerChunkX = bigToNumber(bigFloor((new Big(world.players[client.username].x)).div(16)));
        var playerChunkY = bigToNumber(bigFloor((new Big(world.players[client.username].y)).div(16)));
        if (playerChunkX >= chunkX - config.viewDistance && playerChunkY >= chunkY - config.viewDistance && playerChunkX <= chunkX + config.viewDistance && playerChunkY <= chunkY + config.viewDistance) {
          sendPacket(client, PacketType.BLOCK_BREAK, chunkX, chunkY, z, blockId);
        }
      });
      if (world.players[ws.username].gamemode == "survival") {
        items[blockType].drop({
          world, ws, giveItem, sendPacket, sendPlayerData, broadcastPacket, PacketType
        });
      }
      return;
    }
    if (op == PacketType.USE) {
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
      var [ x, y, z ] = data;
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
      if (!world.chunks[`${chunkX},${chunkY},${z}`]) {
        return;
      }
      if (!config.allowBuildingInVoid && (chunkY * 16) + y <= config.voidY) {
        sendChunks(ws, [`${chunkX},${chunkY},${z}`]);
        sendWorldData(ws);
        sendPlayerData(ws, ws.username);
        return;
      }
      if (config.worldHeight !== null && (chunkY * 16) + y > config.worldHeight) {
        sendChunks(ws, [`${chunkX},${chunkY},${z}`]);
        return sendWorldData(ws);
      }
      var blockId = world.chunks[`${chunkX},${chunkY},${z}`].findIndex(block => block && block.x == x && block.y == y);
      if (blockId > -1) {
        sendChunks(ws, [`${chunkX},${chunkY},${z}`]);
        sendWorldData(ws);
        sendPlayerData(ws, ws.username);
        return;
      }
      if (!world.players[ws.username].slots[`hotbar.${world.players[ws.username].selectedHotbarSlot}`]) {
        sendChunks(ws, [`${chunkX},${chunkY},${z}`]);
        sendWorldData(ws);
        sendPlayerData(ws, ws.username);
        return;
      }
      if (!items[world.players[ws.username].slots[`hotbar.${world.players[ws.username].selectedHotbarSlot}`].item].placeable) {
        sendChunks(ws, [`${chunkX},${chunkY},${z}`]);
        sendWorldData(ws);
        sendPlayerData(ws, ws.username);
        return;
      }
      if (world.players[ws.username].gamemode == "adventure" || world.players[ws.username].gamemode == "spectator") {
        sendChunks(ws, [`${chunkX},${chunkY},${z}`]);
        sendWorldData(ws);
        sendPlayerData(ws, ws.username);
        return;
      }
      var newBlock = {
        "block": world.players[ws.username].slots[`hotbar.${world.players[ws.username].selectedHotbarSlot}`].item,
        x, y
      };
      world.chunks[`${chunkX},${chunkY},${z}`].push(newBlock);
      broadcastPacket(client => {
        if (client === ws) {
          return;
        }
        var playerChunkX = bigToNumber(bigFloor((new Big(world.players[client.username].x)).div(16)));
        var playerChunkY = bigToNumber(bigFloor((new Big(world.players[client.username].y)).div(16)));
        if (playerChunkX >= chunkX - config.viewDistance && playerChunkY >= chunkY - config.viewDistance && playerChunkX <= chunkX + config.viewDistance && playerChunkY <= chunkY + config.viewDistance) {
          sendPacket(client, PacketType.BLOCK_PLACE, chunkX, chunkY, z, newBlock);
        }
      });
      if (world.players[ws.username].gamemode != "creative") {
        if (--world.players[ws.username].slots[`hotbar.${world.players[ws.username].selectedHotbarSlot}`].count < 1) {
          world.players[ws.username].slots[`hotbar.${world.players[ws.username].selectedHotbarSlot}`] = null;
        }
      }
      return;
    }
    if (op == PacketType.HOTBAR_SWITCH) {
      if (data.length != 1) {
        return ws.close(1002, `Protocol error in Packet[${op}]:\nData length expected 1`);
      }
      if (typeof data[0] !== "number") {
        return ws.close(1002, `Protocol error in Packet[${op}]:\ndata[0] is not a number`);
      }
      if (data[0] < 0 || data[0] > 8) {
        return ws.close(1002, `Protocol error in Packet[${op}]:\ndata[0] is not in range 0-8`);
      }
      world.players[ws.username].selectedHotbarSlot = data[0];
      getPlayers().forEach(client => {
        if (client === ws) {
          return;
        }
        sendPlayerData(client, ws.username);
      });
      return;
    }
    if (op == PacketType.OPEN_INVENTORY) {
      if (data.length != 0) {
        return ws.close(1002, `Protocol error in Packet[${op}]:\nData length expected 0`);
      }
      ws.currentGUI = {
        "id": "shyfog:inventory"
      };
      sendPacket(ws, PacketType.PLAYER_METADATA, ws.username, {
        "currentGUI": ws.currentGUI
      });
      return;
    }
    if (op == PacketType.CLOSE_GUI) {
      if (data.length != 0) {
        return ws.close(1002, `Protocol error in Packet[${op}]:\nData length expected 0`);
      }
      ws.currentGUI = null;
      return;
    }
    ws.close(1002, `Protocol error in Packet[${op}]:\nUnknown packet type`);
  });
  ws.on("close", (code, reason) => {
    clients = clients.filter(client => client !== ws);
    if (ws.username) {
      log("INFO", `${ws.username} lost connection${(code == 1002) ? " due to protocol error" : `: ${reason}`}`);
      log("INFO", `${ws.username} left the game`);
      getPlayers().forEach(client => {
        sendPacket(client, PacketType.PLAYER_DISCONNECTED, ws.username);
      });
    }
  });
});

log("INFO", `Starting ShyFog server on *:${config.port}`);

async function onListen() {
  setInterval(saveWorld, config.autosaveTime *1000);
  log("INFO", `Scheduled autosave every ${config.autosaveTime}s`);
  var startTime = (performance.now() - serverStartTime);
  var startTimeUnit = "ms";
  if (startTime >= 1000) {
    startTime /= 1000;
    startTimeUnit = "s";
  }
  log("INFO", `Done (${startTime.toFixed(3)}${startTimeUnit})!`);

  // Console commands
  while(true) {
    var command = await new Promise(res => {
      consoleInput.question("", res);
    });
    if (command.startsWith("/")) {
      command = command.slice(1);
    }
    executeCommand(-1, "Server", command);
  }
}

if (config.ssl) {
  sslServer.listen(config.port, onListen);
} else {
  app.listen(config.port, onListen);
}

function onStop() {
  log("INFO", "Stopping the server");
  clients.forEach(client => client.close(1000, "Server closed"));
  saveWorld();
  process.exit(0);
};

process.on("SIGINT", onStop);
consoleInput.on("SIGINT", onStop);