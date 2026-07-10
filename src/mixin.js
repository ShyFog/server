ShyFog.Server.Mixin = class {
  constructor() {
    ShyFog.Server.log("INFO", `Mixin created: ${this.constructor.name}`);
  }
  inject(at, method) {
    ShyFog.Server.log("INFO", `Injecting mixin "${this.constructor.name}" into ${at}...`);
    if (!at.includes("@")) {
      return ShyFog.Server.log("ERROR", `Invalid target ${at} to inject`);
    }
    var target = at.split("@");
    at = target.pop();
    target = target.join("@");
    var parent = null;
    var originalTarget = ShyFog.Server;
    var lastPart = null;
    for (var part of target.split(".")) {
      parent = originalTarget;
      originalTarget = originalTarget[part];
      lastPart = part;
    }
    if (typeof originalTarget !== "function") {
      return ShyFog.Server.log("ERROR", `Invalid target ${at} to inject`);
    }
    function fakeTarget(...args) {
      var result = {};
      if (at == "HEAD") {
        result = method(...args) || result;
      }
      if (result.cancel) {
        return result.returnValue;
      }
      var originalResult = originalTarget(...(result.args || args));
      if (at == "TAIL") {
        result = method(originalResult, ...args) || result;
      }
      return (result.returnValue || originalResult);
    }
    parent[lastPart] = fakeTarget;
    ShyFog.Server.log("INFO", "Injection success");
  }
};