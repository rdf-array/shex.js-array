/** The one copy of ShExR.shex, and the text compiled from it. */
"use strict";

const {expect} = require("chai");
const Fs = require("fs");
const Path = require("path");
const ShExUtil = require("..");
const findPath = require("../../shex-cli/test/findPath.js");

const SHEXR = Path.join(__dirname, "..", "ShExR.shex");

describe("ShExR.shex", function () {
  it("should be what ShExUtil.ShExRSchema was generated from", function () {
    expect(ShExUtil.ShExRSchema, "out of date: node tools/gen-shexr-schema.js && npx tsc")
      .to.equal(Fs.readFileSync(SHEXR, "utf8"));
  });

  // rdf-array: the spec's ShExR.shex matches rdf:first/rdf:rest ladders; this fork's
  // reads the same documents under rdf-array, where `( ... )` is one sequence term, so
  // every @<#...ListNPlus> ladder shape is a Collection, ((@<#X>))[n, *], and a
  // Collection shape expression is itself describable in ShExR.
  it("should be the spec's ShExR.shex read under rdf-array (tools/shexr-rdf-array.js)", function () {
    const text = Fs.readFileSync(SHEXR, "utf8");
    expect(text).to.not.match(/rdf:first|rdf:rest|rdf:nil|List[012]Plus/);
    expect(text).to.include("sx:shapes ((@<#ShapeDecl>))[1, *] ?");
    expect(text).to.include("<#Collection> CLOSED {");
    // The spec's own ShExR.shex: shexTest-array, the corpus these tests read, carries an rdf-array
    // version, so look for an unconverted copy (SHEXTEST_UPSTREAM, the corpus, ../../shexSpec/shexTest).
    const candidates = [];
    if ("SHEXTEST_UPSTREAM" in process.env)
      candidates.push(Path.join(process.env.SHEXTEST_UPSTREAM, "doc", "ShExR.shex"));
    try { candidates.push(findPath("doc") + "ShExR.shex"); } catch (e) { /* no corpus */ }
    candidates.push(Path.join(__dirname, "..", "..", "..", "..", "..", "shexSpec", "shexTest", "doc", "ShExR.shex"));
    const spec = candidates.find(f => Fs.existsSync(f) && !/sx:Collection/.test(Fs.readFileSync(f, "utf8")));
    if (!spec) this.skip();
    const {rdfMinusShExR} = require("../../../tools/shexr-rdf-array.js");
    expect(text, "out of date: node tools/shexr-rdf-array.js && node tools/gen-shexr-schema.js")
      .to.equal(rdfMinusShExR(Fs.readFileSync(spec, "utf8")));
  });
});
