const version = "v0.0.1";
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
  "HOTBAR_SWITCH": 10
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
  var { skyColor, void: void_, voidY, reducedDebugInfo } = config;
  sendPacket(ws, PacketType.WORLD_METADATA, {
    skyColor,
    "void": void_,
    voidY,
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
    "skin": clients.find(client => client.username == username).skin
  }));
}

// Return clients that are joined
function getPlayers() {
  return clients.filter(client => client.username);
}

var serverStartTime = performance.now();
var { pako, Big, log, sendPacket, bigFloor, bigToNumber } = require("./utils.js");
log("INFO", "Loading libraries...");

var express = require("express");
var expressWs = require("express-ws");
var fs = require("fs");
var overworldGenerator = require("./generators/overworld.js");

log("INFO", `Starting ShyFog server version ${version}...`);

if (!fs.existsSync("config.json")) {
  log("WARN", "Config does not exist, creating");
  fs.writeFileSync("config.json", JSON.stringify({
    "port": 6280,
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
    "jumpHeight": 1.2522,
    "reducedDebugInfo": false
  }, null, 2));
}

log("INFO", "Loading config");
var config = JSON.parse(fs.readFileSync("config.json").toString("utf-8"));

var app = express();
expressWs(app);
var clients = [];
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
} else {
  log("INFO", "Generating world");
  var seed = config.seed;
  if (seed === "") {
    seed = Math.floor(Math.random() *Number.MAX_SAFE_INTEGER).toString();
  }
  log("INFO", `Using seed "${seed}"`);
  world = {
    "chunks": {},
    "biomes": {},
    "players": {},
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
    "onlinePlayers": clients.filter(client => client.username).length,
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
    if (!Array.isArray(msg) || !msg.length) {
      return ws.close(1002, "Protocol Error: Received invalid packet type.");
    }
    var [ op, ...data ] = msg;
    if (op == PacketType.JOIN) {
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
        ws.accountId = result.id;
        ws.username = result.username;
        if (config.useOnlineSkins) {
          ws.skin = result.skin;
        } else {
          ws.skin = `data:image/png;base64,${fs.readFileSync(config.offlineSkin).toString("base64")}`;
        }
      } else {
        if (clients.find(client => client.username == data[0].username)) {
          log("INFO", `${data[0].username} lost connection: Player with this username is already playing on the server.`);
          return ws.close(1000, "Player with this username is already playing on the server.");
        }
        ws.username = data[0].username;
        ws.skin = `data:image/png;base64,${fs.readFileSync(config.offlineSkin).toString("base64")}`;
      }
      sendPacket(ws, PacketType.JOIN);
      sendWorldData(ws);
      if (!world.players[ws.username]) {
        var transparentBlocks = ["shyfog:short_grass", "shyfog:tall_grass_top", "shyfog:tall_grass_bottom", "shyfog:dandelion", "shyfog:poppy", "shyfog:blue_orchid", "shyfog:allium", "shyfog:azure_bluet", "shyfog:white_tulip", "shyfog:red_tulip", "shyfog:pink_tulip", "shyfog:orange_tulip", "shyfog:oxeye_daisy", "shyfog:cornflower"];
        var spawnBlocks = world.chunks["0,4,0"].filter(block => block && !transparentBlocks.includes(block.block) && !world.chunks["0,4,0"].find(block2 => block2 && block2.x == block.x && block2.y == block.x + 1 && !transparentBlocks.includes(block2.block)));
        var spawnBlock = spawnBlocks[Math.floor(Math.random() *spawnBlocks.length)];
        if (!spawnBlock) {
          log("WARN", "Unable to find a valid spawn point, falling back to (0, 0, 0)");
          spawnBlock = {
            "x": 0,
            "y": -1
          };
        }
        world.players[ws.username] = {
          "dimension": "shyfog:overworld",
          "x": spawnBlock.x,
          "y": (4 * 16) + spawnBlock.y + 1,
          "z": 0,
          "direction": "none",
          "gamemode": config.defaultGamemode,
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
      var [ x, y, z, direction ] = data;
      var oldPlayerChunkX = parseFloat(bigFloor((new Big(world.players[ws.username].x)).div(16)).toString());
      var oldPlayerChunkY = parseFloat(bigFloor((new Big(world.players[ws.username].y)).div(16)).toString());
      var oldPlayerChunkZ = parseFloat((new Big(world.players[ws.username].z)).toString());
      world.players[ws.username].x = x;
      world.players[ws.username].y = y;
      world.players[ws.username].z = z;
      world.players[ws.username].direction = direction;
      var playerChunkX = parseFloat(bigFloor((new Big(world.players[ws.username].x)).div(16)).toString());
      var playerChunkY = parseFloat(bigFloor((new Big(world.players[ws.username].y)).div(16)).toString());
      var playerChunkZ = parseFloat((new Big(world.players[ws.username].z)).toString());
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
    }
    if (op == PacketType.BLOCK_BREAK) {
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
      var blockId = world.chunks[`${chunkX},${chunkY},${z}`].findIndex(block => block && block.x == x && block.y == y);
      if (blockId == -1) {
        return;
      }
      world.chunks[`${chunkX},${chunkY},${z}`][blockId] = null;
      getPlayers().forEach(client => {
        var playerChunkX = parseFloat(bigFloor((new Big(world.players[client.username].x)).div(16)).toString());
        var playerChunkY = parseFloat(bigFloor((new Big(world.players[client.username].y)).div(16)).toString());
        if (playerChunkX >= chunkX - config.viewDistance && playerChunkY >= chunkY - config.viewDistance && playerChunkX <= chunkX + config.viewDistance && playerChunkY <= chunkY + config.viewDistance) {
          sendPacket(client, PacketType.BLOCK_BREAK, chunkX, chunkY, z, blockId);
        }
      });
    }
    if (op == PacketType.USE) {
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
      var blockId = world.chunks[`${chunkX},${chunkY},${z}`].findIndex(block => block && block.x == x && block.y == y);
      if (blockId > -1) {
        return;
      }
      var newBlock = {
        "block": "shyfog:cobblestone",
        x, y
      };
      world.chunks[`${chunkX},${chunkY},${z}`].push(newBlock);
      getPlayers().forEach(client => {
        var playerChunkX = parseFloat(bigFloor((new Big(world.players[client.username].x)).div(16)).toString());
        var playerChunkY = parseFloat(bigFloor((new Big(world.players[client.username].y)).div(16)).toString());
        if (playerChunkX >= chunkX - config.viewDistance && playerChunkY >= chunkY - config.viewDistance && playerChunkX <= chunkX + config.viewDistance && playerChunkY <= chunkY + config.viewDistance) {
          sendPacket(client, PacketType.BLOCK_PLACE, chunkX, chunkY, z, newBlock);
        }
      });
    }
    if (op == PacketType.HOTBAR_SWITCH) {
      world.players[ws.username].selectedHotbarSlot = data[0];
      getPlayers().forEach(client => {
        if (client === ws) {
          return;
        }
        sendPlayerData(client, ws.username);
      });
    }
  });
  ws.on("close", code => {
    clients = clients.filter(client => client !== ws);
    if (ws.username) {
      log("INFO", `${ws.username} lost connection${(code == 1002) ? " due to protocol error" : ""}`);
      getPlayers().forEach(client => {
        sendPacket(client, PacketType.PLAYER_DISCONNECTED, ws.username);
      });
    }
  });
});

log("INFO", `Starting ShyFog server on *:${config.port}`);
app.listen(config.port, () => {
  setInterval(saveWorld, config.autosaveTime *1000);
  log("INFO", `Scheduled autosave every ${config.autosaveTime}s`);
  var startTime = (performance.now() - serverStartTime);
  var startTimeUnit = "ms";
  if (startTime >= 1000) {
    startTime /= 1000;
    startTimeUnit = "s";
  }
  log("INFO", `Done (${startTime.toFixed(3)}${startTimeUnit})!`);
});

process.on("SIGINT", () => {
  log("INFO", "Stopping the server");
  saveWorld();
  process.exit(0);
});