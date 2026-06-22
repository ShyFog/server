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

function pickBiome(noiseValue, biomes) {
  var entries = Object.entries(biomes);
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

module.exports = { generateBlock, pickBiome };