var fs = require("fs");
var babel = require("@babel/core");
var version = "v" + require("./package.json").version;

function wrap(code) {
  return `(() => {\n${code}\n})();`;
}

(async () => {
  // Bundle all files together
  var bundle = wrap(fs.readFileSync("src/main.js").toString("utf-8").split("%SHYFOG_VERSION%").join(version));
  for (var file of fs.readdirSync("src")) {
    if (file == "main.js" || file.startsWith(".")) {
      continue;
    }
    bundle += `\n${wrap(fs.readFileSync(`src/${file}`).toString("utf-8"))}`;
  }
  for (var file of fs.readdirSync("data")) {
    if (file.startsWith(".")) {
      continue;
    }
    bundle += `\n${wrap(fs.readFileSync(`data/${file}`).toString("utf-8"))}`;
  }

  // Minify
  var minified = babel.transformSync(bundle, {
    "presets": ["minify"],
    "comments": false,
    "sourceMaps": (process.env.SHYFOG_DEV == "1") ? "inline" : false,
    "sourceFileName": "shyfog-server.js"
  }).code;
  if (process.env.SHYFOG_DEV != "1") {
    minified = minified.split("\n").join("\\n");
  }

  // Save the result
  fs.writeFileSync("shyfog-server.js", minified);
})();
