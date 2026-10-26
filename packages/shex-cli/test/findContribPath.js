var fs = require("fs");
var path = require("path");

// rdf-array: where to look for shexTest-contrib (https://github.com/rdf-array/shexTest-contrib), the
// ShEx-array tests every rdf-array implementation shares: an explicit SHEXTEST_CONTRIB, then
// ../shexTest-contrib and ../../shexTest-contrib from the repo root, then the shex-test-contrib
// devDependency. Returns the corpus root (with a trailing /), or null when there is none.
var ROOT = path.resolve(__dirname, "../../..");
var CANDIDATES = ("SHEXTEST_CONTRIB" in process.env ? [process.env.SHEXTEST_CONTRIB] : []).concat([
  path.resolve(ROOT, "../shexTest-contrib"),
  path.resolve(ROOT, "../../shexTest-contrib"),
]);

module.exports = function () {
  for (var i = 0; i < CANDIDATES.length; ++i) {
    var base = path.resolve(CANDIDATES[i]);
    if (fs.existsSync(path.join(base, "validation-contrib")))
      return base + "/";
  }
  try {
    return path.dirname(require.resolve("shex-test-contrib/package.json")) + "/";
  } catch (e) {
    return null;
  }
};
