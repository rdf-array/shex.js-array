/** RDF-: the Collection shape expression, `((shapeExpr))[min, max]`.
 *
 * A sequence term `(1 2 3)` is one RDF node; a Collection says how many
 * elements it has and what each must conform to.  `[m]` is exactly m
 * elements, `[m, n]` from m to n, `[m, *]` or `[m,]` at least m, no bounds
 * any length.  `((x))` is always a Collection; `(x)` is still a parenthesised
 * shape expression.
 */
"use strict";

const {expect} = require("chai");
const ShExParser = require("@shexjs/parser");
const {ShExVisitor} = require("@shexjs/visitor");

const BASE = "http://a.example/";
const S = BASE + "S", T = BASE + "T", p = BASE + "p";

const parse = text => ShExParser.construct(BASE, null, {}).parse(text, BASE, undefined, "Collection-test");
const shapeExprOf = text => parse(text).shapes[0].shapeExpr;
const dt = {type: "NodeConstraint", datatype: T};
const coll = (shapeExpr, bounds) => Object.assign({type: "Collection", shapeExpr}, bounds);

describe("RDF- collections: ((shapeExpr))[min, max]", function () {

  it("parses ((shapeExpr)) with each form of bounds", function () {
    expect(shapeExprOf("<S> ((<T>))")).to.deep.equal(coll(dt));
    expect(shapeExprOf("<S> ((<T>))[2]")).to.deep.equal(coll(dt, {min: 2, max: 2}));
    expect(shapeExprOf("<S> ((<T>))[2, 3]")).to.deep.equal(coll(dt, {min: 2, max: 3}));
    expect(shapeExprOf("<S> ((<T>))[1, *]")).to.deep.equal(coll(dt, {min: 1, max: -1}));
    expect(shapeExprOf("<S> ((<T>))[1,]")).to.deep.equal(coll(dt, {min: 1, max: -1}));
    expect(shapeExprOf("<S> (( <T> )) [ 0 , 1 ]"), "whitespace").to.deep.equal(coll(dt, {min: 0, max: 1}));
  });

  it("takes a shape expression of any kind, and nests", function () {
    expect(shapeExprOf("<S> ((@<T> OR IRI))[0, 1]")).to.deep.equal(
      coll({type: "ShapeOr", shapeExprs: [T, {type: "NodeConstraint", nodeKind: "iri"}]}, {min: 0, max: 1}));
    expect(shapeExprOf("<S> ((((<T>))[2]))[1, *]"), "a sequence of pairs").to.deep.equal(
      coll(coll(dt, {min: 2, max: 2}), {min: 1, max: -1}));
    expect(shapeExprOf("<S> (({ <p> . }))").shapeExpr.type).to.equal("Shape");
    expect(shapeExprOf("<S> ((.))").shapeExpr.type).to.equal("Shape");
  });

  it("is a shape atom: it takes NOT, AND and OR", function () {
    expect(shapeExprOf("<S> NOT ((<T>))")).to.deep.equal({type: "ShapeNot", shapeExpr: coll(dt)});
    expect(shapeExprOf("<S> ((<T>))[2] OR IRI")).to.deep.equal(
      {type: "ShapeOr", shapeExprs: [coll(dt, {min: 2, max: 2}), {type: "NodeConstraint", nodeKind: "iri"}]});
    expect(shapeExprOf("<S> ((<T>)) AND ((LITERAL))[1, *]")).to.deep.equal(
      {type: "ShapeAnd", shapeExprs: [coll(dt), coll({type: "NodeConstraint", nodeKind: "literal"}, {min: 1, max: -1})]});
  });

  it("is a triple constraint's value", function () {
    expect(shapeExprOf("<S> { <p> ((<T>))[3] ; <p> ((@<T>)) }")).to.deep.equal({
      type: "Shape", expression: {type: "EachOf", expressions: [
        {type: "TripleConstraint", predicate: p, valueExpr: coll(dt, {min: 3, max: 3})},
        {type: "TripleConstraint", predicate: p, valueExpr: coll(T)},
      ]}});
    expect(shapeExprOf("<S> { <p> NOT ((<T>)) {2} }").expression.valueExpr).to.deep.equal({type: "ShapeNot", shapeExpr: coll(dt)});
  });

  it("is an EXTENDS target", function () {
    const shape = shapeExprOf("<S> EXTENDS ((<T>))[2] { <p> . }");
    expect(shape.extends).to.deep.equal([coll(dt, {min: 2, max: 2})]);
  });

  it("leaves (shapeExpr) a parenthesised shape expression", function () {
    const paren = shapeExprOf("<S> (<T>)");
    expect(paren.type).to.equal("NodeConstraint");
    expect(paren.datatype).to.equal(T);
    const or = shapeExprOf("<S> ((<T>) OR BNODE)");
    expect(or.type).to.equal("ShapeOr");
    expect(JSON.stringify(or)).to.not.include("Collection");
    const inner = shapeExprOf("<S> (((<T>)))");
    expect(inner, "parentheses around a Collection").to.deep.equal(coll(dt));
    expect(shapeExprOf("<S> ((<T>))[2] AND (<T>)")).to.deep.equal({type: "ShapeAnd", shapeExprs: [coll(dt, {min: 2, max: 2}), dt]});
  });

  it("rejects malformed bounds", function () {
    ["<S> ((<T>))[*]", "<S> ((<T>))[1 2]", "<S> ((<T>))[,1]", "<S> ((<T>))[1, 2, 3]", "<S> ((<T>))[]", "<S> ((<T>))[1"]
      .forEach(text => expect(() => parse(text), text).to.throw());
  });

  it("round-trips through the visitor", function () {
    const schema = parse("<S> { <p> ((@<T> OR ((<T>))[2]))[1, *] }\n<T> ((LITERAL))");
    expect(new ShExVisitor().visitSchema(schema)).to.deep.equal(schema);
  });
});
