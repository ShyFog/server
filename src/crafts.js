ShyFog.Server.getCurrentRecipe = (ws, width, height) => {
  recipesearch:
  for (var recipeId in ShyFog.Server.recipes) {
    var recipe = ShyFog.Server.recipes[recipeId];
    if (recipe.type == "shyfog:crafting_shapeless") {
      var ingredients = recipe.ingredients.map(ingredient => {
        if (typeof ingredient === "string") {
          return {
            "item": ingredient
          };
        }
        return ingredient;
      });
      for (var index = 0; index < width * height; index++) {
        if (!ShyFog.Server.players[ws.username].slots[`craft.${index}`]) {
          continue;
        }
        if (!ingredients.length) {
          continue recipesearch;
        }
        var slotItem = ShyFog.Server.players[ws.username].slots[`craft.${index}`];
        var ingredientIndex = ingredients.findIndex(ingredient => {
          if (ingredient.item.startsWith("#")) {
            return ShyFog.Server.items[slotItem.item]({}).tags.includes(ingredient.item);
          }
          return ingredient.item == slotItem.item;
        });
        if (ingredientIndex == -1) {
          continue recipesearch;
        }
        ingredients.splice(ingredientIndex, 1);
      }
      if (!ingredients.length) {
        return { recipe };
      }
    }
    if (recipe.type == "shyfog:crafting_shaped") {
      if (recipe.pattern[0].length > width || recipe.pattern.length > height) {
        continue;
      }
      for (var offsetX = 0; offsetX <= width - recipe.pattern[0].length; offsetX++) {
        offsetsearch:
        for (var offsetY = 0; offsetY <= height - recipe.pattern.length; offsetY++) {
          for (var x = 0; x < width; x++) {
            for (var y = 0; y < height; y++) {
              var slotItem = ShyFog.Server.players[ws.username].slots[`craft.${((y + offsetY) * height) + x + offsetX}`];
              var recipeKey = recipe.pattern[y] ? recipe.pattern[y][x] : null;
              if (recipeKey && recipeKey != " ") {
                if (!slotItem) {
                  continue offsetsearch;
                }
              } else {
                if (slotItem) {
                  continue offsetsearch;
                }
                continue;
              }
              var recipeItem = recipe.key[recipeKey];
              if (typeof recipeItem === "string") {
                recipeItem = {
                  "item": recipeItem,
                  "count": 1
                };
              }
              if (recipeItem.item.startsWith("#")) {
                if (!ShyFog.Server.items[slotItem.item]({}).tags.includes(recipeItem.item)) {
                  continue offsetsearch;
                }
              } else {
                if (slotItem.item != recipeItem.item) {
                  continue offsetsearch;
                }
              }
              if (slotItem.count < recipeItem.count) {
                continue offsetsearch;
              }
            }
          }
          return { recipe, offsetX, offsetY };
        }
      }
    }
  }
  return null;
};

ShyFog.Server.updateCraft = (ws, width, height) => {
  var result = ShyFog.Server.getCurrentRecipe(ws, width, height);
  if (result) {
    ShyFog.Server.players[ws.username].slots["craft.result"] = {
      "item": result.recipe.result.id,
      "count": (result.recipe.result.count || 1)
    };
  } else {
    ShyFog.Server.players[ws.username].slots["craft.result"] = null;
  }
  ShyFog.Server.sendPacket(ws, ShyFog.Server.PacketType.PLAYER_METADATA, ws.username, {
    "slots": ShyFog.Server.players[ws.username].slots
  });
  return result;
};

ShyFog.Server.finishCraft = (ws, width, height) => {
  var result = ShyFog.Server.getCurrentRecipe(ws, width, height);
  if (result) {
    var { recipe, offsetX, offsetY } = result;
    if (recipe.type == "shyfog:crafting_shapeless") {
      for (var index = 0; index < width * height; index++) {
        if (ShyFog.Server.players[ws.username].slots[`craft.${index}`] && --ShyFog.Server.players[ws.username].slots[`craft.${index}`].count < 1) {
          ShyFog.Server.players[ws.username].slots[`craft.${index}`] = null;
        }
      }
    }
    if (recipe.type == "shyfog:crafting_shaped") {
      for (var x = 0; x < width; x++) {
        for (var y = 0; y < height; y++) {
          var slotItem = ShyFog.Server.players[ws.username].slots[`craft.${((y + offsetY) * height) + x + offsetX}`];
          var recipeKey = recipe.pattern[y] ? recipe.pattern[y][x] : null;
          if (!recipeKey || recipeKey == " ") {
            continue;
          }
          var recipeItem = recipe.key[recipeKey];
          if (typeof recipeItem === "string") {
            recipeItem = {
              "item": recipeItem,
              "count": 1
            };
          }
          slotItem.count -= recipeItem.count;
          if (slotItem.count < 1) {
            ShyFog.Server.players[ws.username].slots[`craft.${((y + offsetY) * height) + x + offsetX}`] = null;
          }
        }
      }
    }
    ShyFog.Server.sendPacket(ws, ShyFog.Server.PacketType.PLAYER_METADATA, ws.username, {
      "slots": ShyFog.Server.players[ws.username].slots
    });
  }
  ShyFog.Server.updateCraft(ws, width, height);
  return result;
};