var chalk = require("chalk");
var pako = require("pako");
var Big = require("big.js");

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

function bigFloor(x) {
  return x.lt(0) ? x.round(0, Big.roundDown).minus(x.eq(x.round(0, Big.roundDown)) ? 0 : 1) : x.round(0, Big.roundDown);
}

function bigToNumber(x) {
  return parseFloat(x.toString());
}

function generateBlock(world, chunkX, chunkY, chunkZ, block, x, y, z) {
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
    world.chunks[`${chunkX},${chunkY},${chunkZ}`].push({
      block,
      "x": localX,
      "y": localY
    });
  }
}

function pickWeightedRandom(noiseValue, options) {
  var entries = Object.entries(options);
  var total = entries.reduce((sum, [, w]) => sum + w, 0);
  var t = (noiseValue + 1) / 2;
  t = Math.max(0, Math.min(0.999999, t));
  var acc = 0;
  for (var [name, weight] of entries) {
    acc += weight / total;
    if (t < acc) {
      return name;
    }
  }
  return entries[entries.length - 1][0];
}

module.exports = { pako, Big, log, sendPacket, bigFloor, bigToNumber, generateBlock, pickWeightedRandom };