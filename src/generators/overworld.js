var { createNoise2D } = require("simplex-noise");
var alea = require("alea");
var { generateBlock, pickWeightedRandom } = require("../utils.js");

const scale = (1 / 16);
const weight = 3;
const baseHeight = 64;
const treePlainsThreshold = 0.2;
const shortGrassPlainsThreshold = 0.6;
const tallGrassPlainsThreshold = 0.6;
const flowerPlainsThreshold = 0.2;
const plainsFlowers = ["shyfog:dandelion", "shyfog:poppy", "shyfog:azure_bluet", "shyfog:white_tulip", "shyfog:red_tulip", "shyfog:pink_tulip", "shyfog:orange_tulip", "shyfog:oxeye_daisy", "shyfog:cornflower"];

const biomes = {
  "shyfog:plains": 10,
  "shyfog:desert": 7
};
const biomeScale = (1 / 256);

module.exports = (world, config, chunkX, chunkY, chunkZ) => {
  if (world.chunks[`${chunkX},${chunkY},${chunkZ}`]) {
    return;
  }
  world.chunks[`${chunkX},${chunkY},${chunkZ}`] = [];
  world.biomes[`${chunkX},${chunkY},${chunkZ}`] = {};
  if (chunkZ != 0) {
    return;
  }
  var noise = createNoise2D(alea(world.seed));
  var biomeNoise = createNoise2D(alea(world.seed + "_biome"));
  var rng = alea(world.seed + `_rng_${chunkX},${chunkY},${chunkZ}`);
  var biomesList = [];
  for (var localX = 0; localX < 16; localX++) {
    var worldX = (chunkX * 16) + localX;

    // Main terrain
    var height = Math.round(noise(worldX * scale, chunkZ * scale) * weight) + baseHeight;
    var biome = pickWeightedRandom(biomeNoise(worldX * biomeScale, chunkZ * biomeScale), biomes);
    biomesList.push(biome);
    if (biome == "shyfog:plains") {
      generateBlock(world, chunkX, chunkY, chunkZ, "shyfog:grass_block", worldX, height, chunkZ);
      for (var i = 1; i <= 5; i++) {
        generateBlock(world, chunkX, chunkY, chunkZ, "shyfog:dirt", worldX, height - i, chunkZ);
      }
    }
    if (biome == "shyfog:desert") {
      generateBlock(world, chunkX, chunkY, chunkZ, "shyfog:sand", worldX, height, chunkZ);
      for (var i = 1; i <= 5; i++) {
        generateBlock(world, chunkX, chunkY, chunkZ, "shyfog:sandstone", worldX, height - i, chunkZ);
      }
    }
    for (var y = height - i; y > 0; y--) {
      generateBlock(world, chunkX, chunkY, chunkZ, "shyfog:stone", worldX, y, chunkZ);
    }
    for (var y2 = y; y2 > config.voidY + 1; y2--) {
      generateBlock(world, chunkX, chunkY, chunkZ, "shyfog:deepslate", worldX, y2, chunkZ);
    }
    generateBlock(world, chunkX, chunkY, chunkZ, "shyfog:bedrock", worldX, y2, chunkZ);

    if (biome == "shyfog:plains") {
      // Trees
      var treeNoise = createNoise2D(alea(world.seed + "_tree"));
      var tree = treeNoise(worldX, chunkZ);
      if (tree > 1 - treePlainsThreshold) {
        generateBlock(world, chunkX, chunkY, chunkZ, "shyfog:oak_log", worldX, height + 1, chunkZ);
        generateBlock(world, chunkX, chunkY, chunkZ, "shyfog:oak_log", worldX, height + 2, chunkZ);
        generateBlock(world, chunkX, chunkY, chunkZ, "shyfog:oak_log", worldX, height + 3, chunkZ);
        if (Math.floor(rng() * 4)) {
          generateBlock(world, chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX - 2, height + 4, chunkZ);
        }
        generateBlock(world, chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX - 1, height + 4, chunkZ);
        generateBlock(world, chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX, height + 4, chunkZ);
        generateBlock(world, chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX + 1, height + 4, chunkZ);
        if (Math.floor(rng() * 4)) {
          generateBlock(world, chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX + 2, height + 4, chunkZ);
        }
        if (Math.floor(rng() * 4)) {
          generateBlock(world, chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX - 2, height + 5, chunkZ);
        }
        generateBlock(world, chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX - 1, height + 5, chunkZ);
        generateBlock(world, chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX, height + 5, chunkZ);
        generateBlock(world, chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX + 1, height + 5, chunkZ);
        if (Math.floor(rng() * 3)) {
          generateBlock(world, chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX + 2, height + 5, chunkZ);
        }
        if (Math.floor(rng() * 3)) {
          generateBlock(world, chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX - 1, height + 6, chunkZ);
        }
        generateBlock(world, chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX, height + 6, chunkZ);
        if (Math.floor(rng() * 3)) {
          generateBlock(world, chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX + 1, height + 6, chunkZ);
        }
        if (Math.floor(rng() * 2)) {
          generateBlock(world, chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX, height + 7, chunkZ);
        }
      } else {
        // Grass
        var shortGrassNoise = createNoise2D(alea(world.seed + "_short_grass"));
        var shortGrass = shortGrassNoise(worldX, chunkZ);
        var tallGrassNoise = createNoise2D(alea(world.seed + "_tall_grass"));
        var tallGrass = tallGrassNoise(worldX, chunkZ);
        if (shortGrass > 1 - shortGrassPlainsThreshold) {
          generateBlock(world, chunkX, chunkY, chunkZ, "shyfog:short_grass", worldX, height + 1, chunkZ);
        } else if (tallGrass > 1 - tallGrassPlainsThreshold) {
          generateBlock(world, chunkX, chunkY, chunkZ, "shyfog:tall_grass_bottom", worldX, height + 1, chunkZ);
          generateBlock(world, chunkX, chunkY, chunkZ, "shyfog:tall_grass_top", worldX, height + 2, chunkZ);
        } else {
          // Flowers
          var flowerNoise = createNoise2D(alea(world.seed + "_flower"));
          var flower = flowerNoise(worldX, chunkZ);
          if (flower > 1 - flowerPlainsThreshold) {
            generateBlock(world, chunkX, chunkY, chunkZ, plainsFlowers[Math.floor(rng() *plainsFlowers.length)], worldX, height + 1, chunkZ);
          }
        }
      }
    }
  }
  var biomeStreakStart = 0;
  var biomeStreakType = biomesList[0];
  var biomeStreakLength = 1;
  for (var i = 1; i <= biomesList.length; i++) {
    if (biomesList[i] == biomeStreakType) {
      biomeStreakLength++;
    } else {
      world.biomes[`${chunkX},${chunkY},${chunkZ}`][`${biomeStreakStart},${biomeStreakStart + biomeStreakLength - 1}`] = biomeStreakType;
      biomeStreakStart = i;
      biomeStreakType = biomesList[i];
      biomeStreakLength = 1;
    }
  }
};