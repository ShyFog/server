if (typeof require !== "undefined") {
  var { createNoise2D } = require("simplex-noise");
  var Alea = require("alea");
} else {
  // Needed in browser environment because of Babel variable renaming
  if (typeof globalThis.createNoise2D !== "undefined") {
    createNoise2D = globalThis.createNoise2D;
  }
  if (typeof globalThis.Alea !== "undefined") {
    Alea = globalThis.Alea;
  }
}

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

ShyFog.Server.generators.overworld = (chunkX, chunkY, chunkZ) => {
  ShyFog.Server.chunks[`${chunkX},${chunkY},${chunkZ}`] = [];
  ShyFog.Server.biomes[`${chunkX},${chunkY},${chunkZ}`] = [];
  if (chunkZ != 0) {
    return;
  }
  var noise = createNoise2D(Alea(ShyFog.Server.seed));
  var biomeNoise = createNoise2D(Alea(ShyFog.Server.seed + "_biome"));
  var rng = Alea(ShyFog.Server.seed + `_rng_${chunkX},${chunkY},${chunkZ}`);
  var biomesList = [];
  for (var localX = 0; localX < 16; localX++) {
    var worldX = (chunkX * 16) + localX;

    // Main terrain
    var height = Math.round(noise(worldX * scale, chunkZ * scale) * weight) + baseHeight;
    var biome = ShyFog.Server.pickWeightedRandom(biomeNoise(worldX * biomeScale, chunkZ * biomeScale), biomes);
    biomesList.push(biome);
    if (biome == "shyfog:plains") {
      ShyFog.Server.generateBlock(chunkX, chunkY, chunkZ, "shyfog:grass_block", worldX, height, chunkZ);
      for (var i = 1; i <= 5; i++) {
        ShyFog.Server.generateBlock(chunkX, chunkY, chunkZ, "shyfog:dirt", worldX, height - i, chunkZ);
      }
    }
    if (biome == "shyfog:desert") {
      ShyFog.Server.generateBlock(chunkX, chunkY, chunkZ, "shyfog:sand", worldX, height, chunkZ);
      for (var i = 1; i <= 5; i++) {
        ShyFog.Server.generateBlock(chunkX, chunkY, chunkZ, "shyfog:sandstone", worldX, height - i, chunkZ);
      }
    }
    for (var y = height - i; y > 0; y--) {
      ShyFog.Server.generateBlock(chunkX, chunkY, chunkZ, "shyfog:stone", worldX, y, chunkZ);
    }
    for (var y2 = y; y2 > ShyFog.Server.config.voidY + 1; y2--) {
      ShyFog.Server.generateBlock(chunkX, chunkY, chunkZ, "shyfog:deepslate", worldX, y2, chunkZ);
    }
    ShyFog.Server.generateBlock(chunkX, chunkY, chunkZ, "shyfog:bedrock", worldX, y2, chunkZ);

    if (biome == "shyfog:plains") {
      // Trees
      var treeNoise = createNoise2D(Alea(ShyFog.Server.seed + "_tree"));
      var tree = treeNoise(worldX, chunkZ);
      if (tree > 1 - treePlainsThreshold) {
        ShyFog.Server.generateBlock(chunkX, chunkY, chunkZ, "shyfog:oak_log", worldX, height + 1, chunkZ);
        ShyFog.Server.generateBlock(chunkX, chunkY, chunkZ, "shyfog:oak_log", worldX, height + 2, chunkZ);
        ShyFog.Server.generateBlock(chunkX, chunkY, chunkZ, "shyfog:oak_log", worldX, height + 3, chunkZ);
        if (Math.floor(rng() * 4)) {
          ShyFog.Server.generateBlock(chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX - 2, height + 4, chunkZ);
        }
        ShyFog.Server.generateBlock(chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX - 1, height + 4, chunkZ);
        ShyFog.Server.generateBlock(chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX, height + 4, chunkZ);
        ShyFog.Server.generateBlock(chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX + 1, height + 4, chunkZ);
        if (Math.floor(rng() * 4)) {
          ShyFog.Server.generateBlock(chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX + 2, height + 4, chunkZ);
        }
        if (Math.floor(rng() * 4)) {
          ShyFog.Server.generateBlock(chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX - 2, height + 5, chunkZ);
        }
        ShyFog.Server.generateBlock(chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX - 1, height + 5, chunkZ);
        ShyFog.Server.generateBlock(chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX, height + 5, chunkZ);
        ShyFog.Server.generateBlock(chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX + 1, height + 5, chunkZ);
        if (Math.floor(rng() * 3)) {
          ShyFog.Server.generateBlock(chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX + 2, height + 5, chunkZ);
        }
        if (Math.floor(rng() * 3)) {
          ShyFog.Server.generateBlock(chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX - 1, height + 6, chunkZ);
        }
        ShyFog.Server.generateBlock(chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX, height + 6, chunkZ);
        if (Math.floor(rng() * 3)) {
          ShyFog.Server.generateBlock(chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX + 1, height + 6, chunkZ);
        }
        if (Math.floor(rng() * 2)) {
          ShyFog.Server.generateBlock(chunkX, chunkY, chunkZ, "shyfog:oak_leaves", worldX, height + 7, chunkZ);
        }
      } else {
        // Grass
        var shortGrassNoise = createNoise2D(Alea(ShyFog.Server.seed + "_short_grass"));
        var shortGrass = shortGrassNoise(worldX, chunkZ);
        var tallGrassNoise = createNoise2D(Alea(ShyFog.Server.seed + "_tall_grass"));
        var tallGrass = tallGrassNoise(worldX, chunkZ);
        if (shortGrass > 1 - shortGrassPlainsThreshold) {
          ShyFog.Server.generateBlock(chunkX, chunkY, chunkZ, "shyfog:short_grass", worldX, height + 1, chunkZ);
        } else if (tallGrass > 1 - tallGrassPlainsThreshold) {
          ShyFog.Server.generateBlock(chunkX, chunkY, chunkZ, "shyfog:tall_grass", worldX, height + 1, chunkZ);
        } else {
          // Flowers
          var flowerNoise = createNoise2D(Alea(ShyFog.Server.seed + "_flower"));
          var flower = flowerNoise(worldX, chunkZ);
          if (flower > 1 - flowerPlainsThreshold) {
            ShyFog.Server.generateBlock(chunkX, chunkY, chunkZ, plainsFlowers[Math.floor(rng() *plainsFlowers.length)], worldX, height + 1, chunkZ);
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
      ShyFog.Server.biomes[`${chunkX},${chunkY},${chunkZ}`].push([biomeStreakStart, biomeStreakStart + biomeStreakLength - 1, biomeStreakType]);
      biomeStreakStart = i;
      biomeStreakType = biomesList[i];
      biomeStreakLength = 1;
    }
  }
};