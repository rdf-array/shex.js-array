/* SPARQL webapp bundle entry: extends the ShExWebApp global created by
 * ../shex-webapp/doc/webpacks/shex-webapp.js with the SPARQL query runner
 * (Comunica and sparqljs ride along -- the price of running SPARQL over the
 * data in the page; n3 is the page's N3js).
 *
 * In HTML, load n3js.js and shex-webapp.js before this bundle: webpack
 * `externals` (see webpack.config.js) resolve ShExWebApp and N3js at
 * runtime rather than bundling a second copy.
 *
 * Under node, require() resolves normally, so this exports the same
 * superset object.
 */
ShExWebApp = Object.assign(require("@shexjs/webapp"), {
  Sparql: require("."),
})

if (typeof require !== 'undefined' && typeof exports !== 'undefined')
  module.exports = ShExWebApp;
