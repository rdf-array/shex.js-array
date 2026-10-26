/** rdf-array: validating sequence terms against the Collection shape expression,
 * `((shapeExpr))[min, max]`.  The data is Turtle-array parsed by N3.js-array, where
 * `(1 2 3)` is one sequence term, not an rdf:first/rdf:rest ladder. */
"use strict";

const expect = require("chai").expect;
const N3 = require("n3");
const ShExParser = require("@shexjs/parser");
const ShExUtil = require("@shexjs/util");
const {ctor: RdfJsDb} = require("@shexjs/neighborhood-rdfjs");
const {ShExValidator} = require("..");
const {RegexpModule: Threaded} = require("@shexjs/eval-threaded-nerr");
const {RegexpModule: Simple} = require("@shexjs/eval-simple-1err");

const base = "http://a.example/";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const int = n => ({value: String(n), type: XSD + "integer"});

function validate (schemaText, dataText, node, engine) {
  const schema = ShExParser.construct(base, {}, {index: true}).parse(`PREFIX : <${base}>\n${schemaText}\n`);
  const graph = new N3.Store();
  graph.addQuads(new N3.Parser({baseIRI: base}).parse(`PREFIX : <${base}>\n${dataText}`));
  return new ShExValidator(schema, RdfJsDb(graph), {regexModule: engine, noCache: true})
    .validateShapeMap([{node: node || base + "x", shape: base + "S"}])[0];
}
const count = (result, type) => (JSON.stringify(result.appinfo).match(new RegExp(`"type":"${type}"`, "g")) || []).length;

[Threaded, Simple].forEach(engine => describe("rdf-array collections, under " + engine.name, function () {

  it("accepts a sequence of the right length whose elements conform", function () {
    const result = validate("<S> { :p ((LITERAL))[3] }", ":x :p (1 2 3) .", null, engine);
    expect(result.status, JSON.stringify(result.appinfo).slice(0, 300)).to.equal("conformant");
    expect(count(result, "CollectionResults"), "one collection result").to.equal(1);
    expect(count(result, "NodeConstraintTest"), "one per element").to.equal(3);
  });

  it("checks the bounds", function () {
    expect(validate("<S> { :p ((LITERAL))[2] }", ":x :p (1 2 3) .", null, engine).status).to.equal("nonconformant");
    expect(validate("<S> { :p ((LITERAL))[2, 3] }", ":x :p (1 2 3) .", null, engine).status).to.equal("conformant");
    expect(validate("<S> { :p ((LITERAL))[4, *] }", ":x :p (1 2 3) .", null, engine).status).to.equal("nonconformant");
    expect(validate("<S> { :p ((LITERAL))[1,] }", ":x :p (1 2 3) .", null, engine).status).to.equal("conformant");
    expect(validate("<S> { :p ((LITERAL)) }", ":x :p (1 2 3) .", null, engine).status).to.equal("conformant");
    const tooMany = validate("<S> { :p ((LITERAL))[2] }", ":x :p (1 2 3) .", null, engine);
    expect(count(tooMany, "CollectionLengthViolation")).to.equal(1);
    expect(JSON.stringify(tooMany.appinfo)).to.include("sequence of 3 elements where 2 expected");
  });

  it("accepts the empty sequence where the bounds allow it", function () {
    expect(validate("<S> { :p ((IRI))[0] }", ":x :p () .", null, engine).status).to.equal("conformant");
    expect(validate("<S> { :p ((IRI)) }", ":x :p () .", null, engine).status).to.equal("conformant");
    expect(validate("<S> { :p ((IRI))[1, *] }", ":x :p () .", null, engine).status).to.equal("nonconformant");
  });

  it("reports the elements that fail, by index", function () {
    const result = validate("<S> { :p ((IRI)) }", ":x :p (:a 1 :b) .", null, engine);
    expect(result.status).to.equal("nonconformant");
    expect(count(result, "CollectionElementFailure")).to.equal(1);
    expect(JSON.stringify(result.appinfo)).to.include('"index":1');
    const text = ShExUtil.errsToSimple(result.appinfo).join("\n");
    expect(text).to.include("as a collection:");
    expect(text).to.include("element 1:");
  });

  it("wants a sequence", function () {
    const result = validate("<S> { :p ((LITERAL)) }", ":x :p 1 .", null, engine);
    expect(result.status).to.equal("nonconformant");
    expect(count(result, "SequenceExpected")).to.equal(1);
    expect(ShExUtil.errsToSimple(result.appinfo).join("\n")).to.include("is not a sequence");
  });

  it("is none of the node kinds, but matches `.`", function () {
    expect(validate("<S> { :p . }", ":x :p (1 2) .", null, engine).status).to.equal("conformant");
    const literal = validate("<S> { :p LITERAL }", ":x :p (1 2) .", null, engine);
    expect(literal.status).to.equal("nonconformant");
    expect(JSON.stringify(literal.appinfo)).to.include('"actual":"sequence"');
    expect(validate("<S> { :p IRI }", ":x :p (1 2) .", null, engine).status).to.equal("nonconformant");
    expect(validate("<S> { :p NONLITERAL }", ":x :p (1 2) .", null, engine).status).to.equal("nonconformant");
    expect(validate("<S> { :p NOT LITERAL }", ":x :p (1 2) .", null, engine).status).to.equal("conformant");
  });

  it("nests", function () {
    expect(validate("<S> { :p ((((LITERAL))[2]))[2] }", ":x :p ((1 2) (3 4)) .", null, engine).status).to.equal("conformant");
    expect(validate("<S> { :p ((((LITERAL))[2]))[2] }", ":x :p ((1 2) (3)) .", null, engine).status).to.equal("nonconformant");
    expect(validate("<S> { :p ((((LITERAL))[2]))[2] }", ":x :p ((1 2) 3) .", null, engine).status).to.equal("nonconformant");
  });

  it("follows shape references from the elements", function () {
    const data = ":x :p (:a :b) . :a :q 1 . :b :q 2 .";
    expect(validate("<S> { :p ((@<T>))[2] }\n<T> { :q LITERAL }", data, null, engine).status).to.equal("conformant");
    expect(validate("<S> { :p ((@<T>))[2] }\n<T> { :q IRI }", data, null, engine).status).to.equal("nonconformant");
  });

  it("takes a sequence as the focus node, written as a JSON array", function () {
    expect(validate("<S> ((LITERAL))[2]", "", [int(1), int(2)], engine).status).to.equal("conformant");
    expect(validate("<S> ((LITERAL))[3]", "", [int(1), int(2)], engine).status).to.equal("nonconformant");
    expect(validate("<S> ((((LITERAL))[1]))", "", [[int(1)], [int(2)]], engine).status).to.equal("conformant");
  });

  it("finds the neighborhood of a sequence subject", function () {
    const result = validate("<S> { :q [:o] }", "(1 2) :q :o .", [int(1), int(2)], engine);
    expect(result.status, JSON.stringify(result.appinfo).slice(0, 300)).to.equal("conformant");
    expect(validate("<S> { :q [:o] }", "(1 2) :q :o .", [int(1), int(3)], engine).status).to.equal("nonconformant");
  });
}));
