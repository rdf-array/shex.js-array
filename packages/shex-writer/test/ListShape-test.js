/** rdf-array: writing the LIST shape expression: `LIST card x` for one Member with a
 * cardinality, else `LIST ( regex )`, each the shortest form that reads back to the
 * same ShExJ. */
"use strict";

const {expect} = require("chai");
const ShExCWriter = require("@shexjs/writer");
const ShExParser = require("@shexjs/parser");

const BASE = "http://a.example/";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const S = BASE + "S", T = BASE + "T", A = BASE + "A", B = BASE + "B", C = BASE + "C";
const decl = (id, shapeExpr) => ({type: "Schema", shapes: [{type: "ShapeDecl", id, shapeExpr}]});
const list = expression => ({type: "ListShape", expression});
const member = (shapeExpr, card) => Object.assign({type: "Member", shapeExpr}, card);
const eachOf = (expressions, card) => Object.assign({type: "ListEachOf", expressions}, card);
const oneOf = (expressions, card) => Object.assign({type: "ListOneOf", expressions}, card);
const dt = {type: "NodeConstraint", datatype: T};
const int = {type: "NodeConstraint", datatype: XSD + "integer"};

function write (schema) {
  let text = null, error = null;
  new ShExCWriter({simplifyParentheses: true}).writeSchema(schema, (e, t) => { if (e) error = e; else text = t; });
  if (error) throw error;
  return text;
}
const body = text => text.replace(/^<[^>]*> /, "").trim();
const parse = text => ShExParser.construct(BASE, {xsd: XSD}, {}).parse(text, BASE, undefined, "ListShape-test");

describe("rdf-array LIST: writing", function () {

  it("writes one Member with a cardinality as LIST card x", function () {
    expect(body(write(decl(S, list(member(dt, {min: 0, max: -1})))))).to.equal(`LIST * <${T}>`);
    expect(body(write(decl(S, list(member(dt, {min: 1, max: -1})))))).to.equal(`LIST + <${T}>`);
    expect(body(write(decl(S, list(member(dt, {min: 0, max: 1})))))).to.equal(`LIST ? <${T}>`);
    expect(body(write(decl(S, list(member(dt, {min: 2, max: 2})))))).to.equal(`LIST {2} <${T}>`);
    expect(body(write(decl(S, list(member(dt, {min: 2, max: 3})))))).to.equal(`LIST {2,3} <${T}>`);
    expect(body(write(decl(S, list(member(dt, {min: 2, max: -1})))))).to.equal(`LIST {2,*} <${T}>`);
    expect(body(write(decl(S, list(member(T, {min: 1, max: -1})))))).to.equal(`LIST + @<${T}>`);
    expect(body(write(decl(S, list(member({type: "Shape"}, {min: 0, max: -1}))))), "the empty shape is .").to.equal("LIST * .");
    expect(body(write(decl(S, list(member({type: "ShapeOr", shapeExprs: [A, B]}, {min: 2, max: 2}))))), "a junction in parentheses")
      .to.equal(`LIST {2} (@<${A}> OR @<${B}>)`);
    expect(body(write(decl(S, list(member(list(member(int, {min: 3, max: 3})), {min: 2, max: 2}))))), "nested")
      .to.equal(`LIST {2} LIST {3} <${XSD}integer>`);
  });

  it("writes everything else as LIST ( regex )", function () {
    expect(body(write(decl(S, list(member(dt))))), "one member, no cardinality: exactly one").to.equal(`LIST ( <${T}> )`);
    expect(body(write(decl(S, list(member({type: "Shape"})))))).to.equal("LIST ( . )");
    expect(body(write(decl(S, list(eachOf([member(dt), member(int)])))))).to.equal(`LIST ( <${T}> ; <${XSD}integer> )`);
    expect(body(write(decl(S, list(oneOf([member(dt), member(int)])))))).to.equal(`LIST ( <${T}> | <${XSD}integer> )`);
    expect(body(write(decl(S, list(eachOf([member(A), member(B)], {min: 0, max: -1}))))), "a repeated group")
      .to.equal(`LIST ( ( @<${A}> ; @<${B}> ) * )`);
    expect(body(write(decl(S, list(oneOf([eachOf([member(A), member(B)]), member(C)]))))), "; needs no parentheses in |")
      .to.equal(`LIST ( @<${A}> ; @<${B}> | @<${C}> )`);
    expect(body(write(decl(S, list(eachOf([oneOf([member(A), member(B)]), member(C)]))))), "| needs them in ;")
      .to.equal(`LIST ( ( @<${A}> | @<${B}> ) ; @<${C}> )`);
    expect(body(write(decl(S, list(eachOf([eachOf([member(A), member(B)]), member(C)]))))), "nesting is kept")
      .to.equal(`LIST ( ( @<${A}> ; @<${B}> ) ; @<${C}> )`);
    expect(body(write(decl(S, list(eachOf([member(A, {min: 2, max: 2})], {min: 3, max: 3}))))), "a ListEachOf of one")
      .to.equal(`LIST ( ( @<${A}> {2} ) {3} )`);
    expect(body(write(decl(S, list(member({type: "ShapeAnd", shapeExprs: [B, {type: "ShapeOr", shapeExprs: [A, C]}]}))))), "a member's later atoms may be parenthesised")
      .to.equal(`LIST ( @<${B}> AND (@<${A}> OR @<${C}>) )`);
  });

  it("puts an unparenthesised operand first in a member, since a member cannot open with (", function () {
    const and = {type: "ShapeAnd", shapeExprs: [{type: "ShapeOr", shapeExprs: [A, B]}, C]};
    const written = write(decl(S, list(member(and))));
    expect(body(written)).to.equal(`LIST ( @<${C}> AND (@<${A}> OR @<${B}>) )`);
    expect(parse(written).shapes[0].shapeExpr.expression.shapeExpr.shapeExprs, "the same conjunction, reordered")
      .to.have.deep.members(and.shapeExprs);
    expect(() => write(decl(S, list(member({type: "ShapeAnd", shapeExprs: [{type: "ShapeOr", shapeExprs: [A, B]}, {type: "ShapeOr", shapeExprs: [B, C]}]})))))
      .to.throw(/a LIST member may not begin with a parenthesis/);
  });

  it("round-trips through the parser", function () {
    [
      "<S> LIST {2,3} <T>",
      "<S> LIST + ( @<T> OR IRI )",
      "<S> LIST * LIST {2} LITERAL",
      "<S> NOT LIST * <T> AND LIST ? BNODE",
      "<S> { <p> LIST {3} <T> ; <p> LIST ( @<S> ) {2} ; <q> LIST * xsd:integer {1,2} }",
      "<S> LIST * <T> OR (<T> AND LIST + IRI)",
      "<S> LIST ( xsd:string ; xsd:string ; LIST ( xsd:integer ; xsd:string ) )",
      "<S> LIST ( ( xsd:string ; xsd:integer ) * )",
      "<S> LIST ( ( xsd:integer | LIST ( xsd:integer ; xsd:integer ) ) + )",
      "<S> LIST ( xsd:string ; LIST ( @<S> * ) )",
      "<S> LIST ( ( @<A> ; @<B> ) ; @<C> | @<T> ; @<A> )",
      "<S> LIST ( ( @<A> | @<B> ) | @<C> )",
      "<S> LIST ( ( @<A> {2} ) {3} ; ( @<B> ; @<C> ) ? )",
      "<S> LIST ( . ; { <p> . } ; IRI @<T> ; NOT ( IRI OR BNODE ) ; @<B> AND ( @<A> OR @<C> ) )",
      "<S> LIST {3} xsd:integer MININCLUSIVE 0 MAXINCLUSIVE 255",
      "<S> LIST ? .",
      "<S> LIST ( xsd:integer ; undef )", // rdf-undef
      "<S> LIST ( ( xsd:integer | undef ) * )",
      "<S> LIST ( undef {2} ; . )",
      "<S> LIST * undef",
      "<S> { <p> LIST ( xsd:integer | undef ) * }",
    ].forEach(text => {
      const once = parse(`PREFIX xsd: <${XSD}>\n${text}`);
      const written = write(once);
      expect(parse(written), `${text}\n  -> ${written}`).to.deep.equal(once);
    });
  });
});
