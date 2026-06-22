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
  "BLOCK_PLACE": 8
};

function log(type, text) {
  var date = new Date;
  var colors = {
    "INFO": "white",
    "WARN": "yellow",
    "ERROR": "red",
    "FATAL": "red"
  };
  var hours = date.getHours().toString();
  var minutes = date.getMinutes().toString();
  var seconds = date.getSeconds().toString();
  if (hours.length < 2) {
    hours = `0${hours}`;
  }
  if (minutes.length < 2) {
    minutes = `0${minutes}`;
  }
  if (seconds.length < 2) {
    seconds = `0${seconds}`;
  }
  console.log(chalk[colors[type]](`[${hours}:${minutes}:${seconds} ${type}]: ${text}`));
}

function sendPacket(ws, ...packet) {
  var uncompressedPacket = JSON.stringify(packet).slice(1, -1);
  var compressedPacket = pako.deflate(uncompressedPacket);
  if (compressedPacket.length < uncompressedPacket.length) {
    ws.send(compressedPacket);
  } else {
    ws.send(uncompressedPacket);
  }
}

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

function sendPlayerData(ws) {
  sendPacket(ws, PacketType.PLAYER_METADATA, ws.username, Object.assign({}, world.players[ws.username], {
    "hitboxes": [{
      "x": 0.125,
      "y": 0.9125,
      "width": 0.75,
      "height": 1.9125,
      "rotation": 0
    }],
    "jumpHeight": config.jumpHeight,
    "skin": ws.skin
  }));
}

function bigFloor(x) {
  return x.lt(0) ? x.round(0, Big.roundDown).minus(x.eq(x.round(0, Big.roundDown)) ? 0 : 1) : x.round(0, Big.roundDown);
}

function bigToNumber(x) {
  return parseFloat(x.toString());
}

var serverStartTime = performance.now();
var chalk = require("chalk");
log("INFO", "Loading libraries...");

var cattojs = require("catto.js");
var pako = require("pako");
var Big = require("big.js");
var fs = require("fs");
var overworldGenerator = require("./generators/overworld.js");

log("INFO", `Starting ShyFog server version ${version}...`);

if (!fs.existsSync("config.json")) {
  log("WARN", "Config does not exist, creating");
  fs.writeFileSync("config.json", JSON.stringify({
    "port": 6280,
    "motd": "A ShyFog server",
    "maxPlayers": 20,
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
var config = require("./config.json");

var server = new cattojs.Server({
  "port": config.port
});
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
    seed
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

server.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

// Workaround
server.app.options("*", (req, res) => {
  res.status(204);
  res.end();
});

server.get("/api/shyfog/ping", (req, res) => {
  res.json({
    "success": true,
    "onlinePlayers": clients.filter(client => client.username).length,
    "maxPlayers": config.maxPlayers,
    "motd": config.motd
  });
}).ws("/api/shyfog/game", (ws, req) => {
  clients.push(ws);
  ws.on("message", async message => {
    if (message == "PING") {
      return ws.send("PONG");
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
        return;
      }
    }
    if (!Array.isArray(msg) || !msg.length) {
      return;
    }
    var [ op, ...data ] = msg;
    if (op == PacketType.JOIN) {
      if (clients.filter(client => client.username).length >= config.maxPlayers) {
        return ws.close(1000, "Server maximum players limit reached.");
      }
      if (config.onlineMode) {
        if (!data[0].sessionToken) {
          if (data[0].sessionToken === null) {
            return ws.close(1000, "Unable to verify username.");
          }
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
          "x": spawnBlock.x,
          "y": (4 * 16) + spawnBlock.y + 1,
          "z": 0,
          "direction": "none",
          "gamemode": config.defaultGamemode,
          "selectedHotbarSlot": 0
        };
      }
      sendPlayerData(ws);
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
      sendPacket(ws, PacketType.BLOCK_BREAK, chunkX, chunkY, z, blockId);
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
      sendPacket(ws, PacketType.BLOCK_PLACE, chunkX, chunkY, z, newBlock);
    }
  });
  ws.on("close", code => {
    if (ws.username) {
      log("INFO", `${ws.username} lost connection${(code == 1002) ? " due to protocol error" : ""}`);
    }
    clients = clients.filter(client => client !== ws);
  });
});

log("INFO", `Starting ShyFog server on *:${config.port}`);
server.run().on("running", () => {
  setInterval(saveWorld, config.autosaveTime *1e3);
  log("INFO", `Scheduled autosave every ${config.autosaveTime}s`);
  var startTime = (performance.now() - serverStartTime);
  var startTimeUnit = "ms";
  if (startTime >= 1e3) {
    startTime /= 1e3;
    startTimeUnit = "s";
  }
  log("INFO", `Done (${startTime.toFixed(3)}${startTimeUnit})!`);
});

process.on("SIGINT", () => {
  log("INFO", "Stopping the server");
  saveWorld();
  process.exit(0);
});