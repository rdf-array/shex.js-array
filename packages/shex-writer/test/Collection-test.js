/** RDF-: writing the Collection shape expression, `((shapeExpr))[min, max]`. */
"use strict";

const {expect} = require("chai");
const ShExCWriter = require("@shexjs/writer");
const ShExParser = require("@shexjs/parser");

const BASE = "http://a.example/";
const S = BASE + "S", T = BASE + "T", p = BASE + "p";
const decl = (id, shapeExpr) => ({type: "Schema", shapes: [{type: "ShapeDecl", id, shapeExpr}]});
const coll = (shapeExpr, bounds) => Object.assign({type: "Collection", shapeExpr}, bounds);
const dt = {type: "NodeConstraint", datatype: T};

function write (schema) {
  let text = null, error = null;
  new ShExCWriter({simplifyParentheses: true}).writeSchema(schema, (e, t) => { if (e) error = e; else text = t; });
  if (error) throw error;
  return text;
}
const parse = text => ShExParser.construct(BASE, null, {}).parse(text, BASE, undefined, "Collection-test");

describe("RDF- collections: writing ((shapeExpr))[min, max]", function () {

  it("writes the bounds as they were read", function () {
    const body = text => text.replace(/^<[^>]*> /, "").trim();
    expect(body(write(decl(S, coll(dt))))).to.equal(`((<${T}>))`);
    expect(body(write(decl(S, coll(dt, {min: 2, max: 2}))))).to.equal(`((<${T}>))[2]`);
    expect(body(write(decl(S, coll(dt, {min: 2, max: 3}))))).to.equal(`((<${T}>))[2, 3]`);
    expect(body(write(decl(S, coll(dt, {min: 1, max: -1}))))).to.equal(`((<${T}>))[1, *]`);
    expect(body(write(decl(S, coll(dt, {max: 3})))), "a missing min is 0").to.equal(`((<${T}>))[0, 3]`);
    expect(body(write(decl(S, coll(dt, {min: 1})))), "a missing max is unbounded").to.equal(`((<${T}>))[1, *]`);
  });

  it("round-trips through the parser", function () {
    [
      "<S> ((<T>))[2, 3]",
      "<S> ((@<T> OR IRI))[1, *]",
      "<S> ((((LITERAL))[2]))",
      "<S> NOT ((<T>)) AND ((BNODE))[0, 1]",
      "<S> { <p> ((<T>))[3] ; <p> ((@<S>)) {2} }",
      "<S> EXTENDS ((<T>)) { <p> . }",
      "<S> ((<T>)) OR (<T> AND ((IRI)))",
    ].forEach(text => {
      const once = parse(text);
      const written = write(once);
      expect(parse(written), `${text}\n  -> ${written}`).to.deep.equal(once);
    });
  });
});
