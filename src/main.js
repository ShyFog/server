globalThis.ShyFog = (globalThis.ShyFog || {});
ShyFog.clientOnly = code => ShyFog.Client ? code() : null;
ShyFog.serverOnly = code => ShyFog.Server ? code() : null;
ShyFog.Server = {};
ShyFog.Server.software = "Vanilla";
ShyFog.Server.version = "%SHYFOG_VERSION%";
ShyFog.Server.PacketType = {
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
  "CLOSE_GUI": 13,
  "GUI_CLICK": 14,
  "CHAT_MESSAGE": 15
};
ShyFog.Server.generators = {};
ShyFog.Server.mods = [];
ShyFog.Server.serverStartTime = performance.now();
ShyFog.Server.hooks = {
  "afterMods": [],
  "preListen": [],
  "onListen": [],
  "postListen": []
};

ShyFog.Server.log = (type, text) => {
  var date = new Date;
  var methods = {
    "INFO": "log",
    "WARN": "warn",
    "ERROR": "error",
    "FATAL": "error"
  };
  var colors = {
    "INFO": 37,
    "WARN": 33,
    "ERROR": 31,
    "FATAL": 31
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
  console[methods[type]](`\x1b[${colors[type]}m[${hours}:${minutes}:${seconds}]: [server/${type}] ${text}\x1b[0m`);
};

ShyFog.Server.sendPacket = (ws, ...packet) => {
  var uncompressedPacket = JSON.stringify(packet).slice(1, -1);
  var compressedPacket = pako.deflate(uncompressedPacket);
  if (compressedPacket.length < uncompressedPacket.length) {
    ws.send(compressedPacket);
  } else {
    ws.send(uncompressedPacket);
  }
};

ShyFog.Server.log("INFO", "Loading libraries...");

if (typeof require !== "undefined") {
  globalThis.pako = require("pako");
  globalThis.Big = require("big.js");
}

var express = null;
var expressWs = null;
var fs = null;
var https = null;
var readline = null;
if (typeof require !== "undefined") {
  express = require("express");
  expressWs = require("express-ws");
  fs = require("fs");
  https = require("https");
  readline = require("readline");
} else if (typeof ZenFS !== "undefined") {
  fs = ZenFS.fs;
}

ShyFog.Server.log("INFO", `Starting ShyFog server version ${ShyFog.Server.version}...`);

if (!fs.existsSync("config.json")) {
  ShyFog.Server.log("WARN", "Config does not exist, creating");
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
    "world": "world",
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
    "maximumRange": "4.5",
    "maxHealth": 20,
    "maxFood": 20,
    "mods": false
  }, null, 2));
}

ShyFog.Server.log("INFO", "Loading config");
ShyFog.Server.config = JSON.parse(fs.readFileSync("config.json").toString("utf-8"));

if (ShyFog.Server.config.mods) {
  // Load mods
  if (!fs.existsSync("mods")) {
    fs.mkdirSync("mods");
  }
  ShyFog.Server.log("INFO", `Searching ${fs.realpathSync("mods")} for mods`);
  var mods = fs.readdirSync("mods");
  ShyFog.Server.log("INFO", `ShyFog has identified ${mods.length} mods to load`);
  for (var modFile of mods) {
    if (modFile.startsWith(".")) {
      continue;
    }
    var data = fs.readFileSync(`mods/${modFile}`).toString("utf-8");
    try {
      var mod = JSON.parse(decodeURIComponent(escape(atob(data))));
    } catch {
      ShyFog.Server.log("WARN", `Found a non-mod file ${modFile} in your mods directory. It will now be injected. This could severe stability issues, it should be removed if possible.`);
      try {
        eval(data);
        continue;
      } catch(err) {
        console.error(err);
        ShyFog.Server.log("FATAL", `Mod "${modFile}" just crashed!`);
        process.exit(1);
      }
    }
    ShyFog.Server.mods.push(mod);
    try {
      eval(mod.code);
    } catch(err) {
      console.error(err);
      ShyFog.Server.log("FATAL", `Mod "${modFile}" just crashed!`);
      process.exit(1);
    }
  }
}

ShyFog.Server.hooks.afterMods.forEach(hook => hook());

ShyFog.Server.app = express ? express() : null;
ShyFog.Server.sslServer = null;
if (expressWs && ShyFog.Server.app) {
  if (https && ShyFog.Server.config.ssl) {
    ShyFog.Server.sslServer = https.createServer({
      "cert": fs.readFileSync(ShyFog.Server.config.sslCert),
      "key": fs.readFileSync(ShyFog.Server.config.sslKey)
    }, ShyFog.Server.app);
    ShyFog.Server.expressWsi = expressWs(ShyFog.Server.app, ShyFog.Server.sslServer);
  } else {
    ShyFog.Server.expressWsi = expressWs(ShyFog.Server.app);
  }
}
ShyFog.Server.clients = [];
ShyFog.Server.consoleInput = readline ? readline.createInterface({
  "input": process.stdin,
  "output": process.stdout
}) : null;
if (fs.existsSync(ShyFog.Server.config.world)) {
  ShyFog.Server.log("INFO", `Loading "${ShyFog.Server.config.world}"`);
  try {
    var world = JSON.parse(fs.readFileSync(ShyFog.Server.config.world + "/level.json"));
    ShyFog.Server.chunks = {};
    ShyFog.Server.biomes = {};
    ShyFog.Server.players = new Map;
    ShyFog.Server.playerIds = world.playerIds;
    ShyFog.Server.bannedNames = world.bannedNames;
    ShyFog.Server.bannedIds = world.bannedIds;
    ShyFog.Server.bannedIps = world.bannedIps;
    ShyFog.Server.defaultGamemode = world.defaultGamemode;
    ShyFog.Server.worldVersion = world.worldVersion;
    ShyFog.Server.seed = world.seed;
    ShyFog.Server.spawn = world.spawn;
  } catch(_) {
    ShyFog.Server.log("FATAL", "World file is corrupted");
    process.exit(1);
  }
} else {
  ShyFog.Server.hooks.onListen.unshift(() => {
    ShyFog.Server.log("INFO", `Preparing level "${ShyFog.Server.config.world}"`);
    ShyFog.Server.seed = ShyFog.Server.config.seed;
    if (ShyFog.Server.seed === "") {
      ShyFog.Server.seed = Math.floor(Math.random() *Number.MAX_SAFE_INTEGER).toString();
    }
    ShyFog.Server.log("INFO", `Using seed "${ShyFog.Server.seed}"`);
    ShyFog.Server.chunks = {};
    ShyFog.Server.biomes = {};
    ShyFog.Server.players = new Map;
    ShyFog.Server.playerIds = {};
    ShyFog.Server.bannedNames = [];
    ShyFog.Server.bannedIds = [];
    ShyFog.Server.bannedIps = [];
    ShyFog.Server.defaultGamemode = ShyFog.Server.config.defaultGamemode;
    ShyFog.Server.worldVersion = ShyFog.Server.version;
    var generationStartTime = performance.now();
    for (var x = -ShyFog.Server.config.generationDistance; x <= ShyFog.Server.config.generationDistance; x++) {
      for (var y = 4 - ShyFog.Server.config.generationDistance; y <= 4 + ShyFog.Server.config.generationDistance; y++) {
        for (var z = -ShyFog.Server.config.generationDistance; z <= ShyFog.Server.config.generationDistance; z++) {
          ShyFog.Server.generators.overworld(x, y, z);
        }
      }
    }
    ShyFog.Server.log("INFO", "Selecting global world spawn...");
    const transparentBlocks = ["shyfog:short_grass", "shyfog:tall_grass_top", "shyfog:tall_grass_bottom", "shyfog:dandelion", "shyfog:poppy", "shyfog:blue_orchid", "shyfog:allium", "shyfog:azure_bluet", "shyfog:white_tulip", "shyfog:red_tulip", "shyfog:pink_tulip", "shyfog:orange_tulip", "shyfog:oxeye_daisy", "shyfog:cornflower"];
    var safeChunks = [];
    for (var chunk in ShyFog.Server.chunks) {
      var [ chunkX, chunkY, chunkZ ] = chunk.split(",").map(part => parseInt(part));
      var spawnBlocks = ShyFog.Server.chunks[chunk].filter(block => block && !transparentBlocks.includes(block.block) && (!ShyFog.Server.getBlock((chunkX * 16) + block.x, (chunkY * 16) + block.y + 1, chunkZ) || transparentBlocks.includes(ShyFog.Server.getBlock((chunkX * 16) + block.x, (chunkY * 16) + block.y + 1, chunkZ).block)));
      if (spawnBlocks.length) {
        safeChunks.push(chunk);
      }
    }
    var spawnChunk = safeChunks[Math.floor(Math.random() *safeChunks.length)];
    var [ chunkX, chunkY, chunkZ ] = spawnChunk.split(",").map(part => parseInt(part));
    var spawnBlocks = ShyFog.Server.chunks[spawnChunk].filter(block => block && !transparentBlocks.includes(block.block) && (!ShyFog.Server.getBlock((chunkX * 16) + block.x, (chunkY * 16) + block.y + 1, chunkZ) || transparentBlocks.includes(ShyFog.Server.getBlock((chunkX * 16) + block.x, (chunkY * 16) + block.y + 1, chunkZ).block)));
    var spawnBlock = spawnBlocks[Math.floor(Math.random() *spawnBlocks.length)];
    ShyFog.Server.spawn = {
      "x": ((chunkX * 16) + spawnBlock.x).toString(),
      "y": ((chunkY * 16) + spawnBlock.y + 1).toString(),
      "z": chunkZ.toString()
    };
    ShyFog.Server.log("INFO", `Time elapsed: ${Math.round(performance.now() - generationStartTime)} ms`);
    ShyFog.Server.saveWorld();
  });
}

if (ShyFog.Server.app) {
  // Handle CORS
  ShyFog.Server.app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    next();
  });
  ShyFog.Server.app.options("*", (req, res) => {
    res.status(204);
    res.end();
  });

  // Pings
  ShyFog.Server.app.get("/api/shyfog/ping", (req, res) => {
    res.json({
      "success": true,
      "software": ShyFog.Server.software,
      "version": ShyFog.Server.version,
      "onlinePlayers": ShyFog.Server.getPlayers().length,
      "maxPlayers": ShyFog.Server.config.maxPlayers,
      "motd": ShyFog.Server.config.motd,
      "icon": ShyFog.Server.config.icon ? `data:image/png;base64,${fs.readFileSync(ShyFog.Server.config.icon).toString("base64")}` : null
    });
  });

  if (expressWs) {
    // WebSocket
    ShyFog.Server.app.ws("/api/shyfog/game", (ws, req) => {
      ShyFog.Server.clients.push(ws);
      ws.on("message", message => ShyFog.Server.handlePacket(ws, req, message));
      ws.on("close", (code, reason) => {
        ShyFog.Server.clients = ShyFog.Server.clients.filter(client => client !== ws);
        if (ws.username) {
          for (var slot in ShyFog.Server.players.get(ws.username).slots) {
            if (slot.startsWith("craft.")) {
              if (ShyFog.Server.players.get(ws.username).slots[slot]) {
                if (slot != "craft.result") {
                  ShyFog.Server.giveItem(ShyFog.Server.players.get(ws.username), ShyFog.Server.players.get(ws.username).slots[slot].item, ShyFog.Server.players.get(ws.username).slots[slot].count);
                }
                ShyFog.Server.players.get(ws.username).slots[slot] = null;
              }
            }
          }
          if (ws.currentGUI && ws.currentGUI.cursorItem) {
            ShyFog.Server.giveItem(ShyFog.Server.players.get(ws.username), ws.currentGUI.cursorItem.item, ws.currentGUI.cursorItem.count);
          }
          ShyFog.Server.log("INFO", `${ws.username} lost connection${(code == 1002) ? " due to protocol error" : `: ${reason}`}`);
          ShyFog.Server.broadcastPacket(client => ShyFog.Server.sendPacket(client, ShyFog.Server.PacketType.CHAT_MESSAGE, {
            "content": `${ws.username} left the game`,
            "color": "#ffff55"
          }));
          fs.writeFileSync(ShyFog.Server.config.world + `/players/${ws.username}.json`, JSON.stringify(ShyFog.Server.players.get(ws.username)));
          ShyFog.Server.players.delete(ws.username);
          ShyFog.Server.broadcastPacket(client => {
            ShyFog.Server.sendPacket(client, ShyFog.Server.PacketType.PLAYER_DISCONNECTED, ws.username);
          });
        }
      });
    });
  }
}

ShyFog.Server.log("INFO", `Starting ShyFog server on *:${ShyFog.Server.config.port}`);

ShyFog.Server.onListen = async () => {
  ShyFog.Server.hooks.onListen.forEach(hook => hook());

  setInterval(ShyFog.Server.saveWorld, ShyFog.Server.config.autosaveTime *1000);
  ShyFog.Server.log("INFO", `Scheduled autosave every ${ShyFog.Server.config.autosaveTime}s`);
  var startTime = (performance.now() - ShyFog.Server.serverStartTime);
  var startTimeUnit = "ms";
  if (startTime >= 1000) {
    startTime /= 1000;
    startTimeUnit = "s";
  }
  ShyFog.Server.log("INFO", `Done (${startTime.toFixed(3)}${startTimeUnit})!`);

  ShyFog.Server.hooks.postListen.forEach(hook => hook());

  // Console commands
  while(ShyFog.Server.consoleInput) {
    var command = await new Promise(res => {
      ShyFog.Server.consoleInput.question("", res);
    });
    if (command.startsWith("/")) {
      command = command.slice(1);
    }
    ShyFog.Server.executeCommand(-1, "Server", command);
  }
}

ShyFog.Server.hooks.preListen.forEach(hook => hook());

if (ShyFog.Server.sslServer) {
  ShyFog.Server.sslServer.listen(ShyFog.Server.config.port, ShyFog.Server.onListen);
} else if (ShyFog.Server.app) {
  ShyFog.Server.app.listen(ShyFog.Server.config.port, ShyFog.Server.onListen);
}

// Server stopping
ShyFog.Server.stop = () => {
  ShyFog.Server.log("INFO", "Stopping the server");
  ShyFog.Server.clients.forEach(client => client.close(1000, "Server closed"));
  ShyFog.Server.saveWorld();
  if (typeof process !== "undefined") {
    process.exit(0);
  }
};
if (typeof process !== "undefined") {
  process.on("SIGINT", ShyFog.Server.stop);
}
if (ShyFog.Server.consoleInput) {
  ShyFog.Server.consoleInput.on("SIGINT", ShyFog.Server.stop);
}