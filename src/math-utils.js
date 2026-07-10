ShyFog.Server.bigFloor = x => x.lt(0) ? x.round(0, Big.roundDown).minus(x.eq(x.round(0, Big.roundDown)) ? 0 : 1) : x.round(0, Big.roundDown);
ShyFog.Server.bigToNumber = x => parseFloat(x.toString());
ShyFog.Server.pickWeightedRandom = (noiseValue, options) => {
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
};