/** rdf-array: parsing the LIST shape expression (rdf-array/docs/array-syntax.md §2, §5, §7).
 *
 * A sequence term `(1 2 3)` is one RDF node; `LIST ( regex )` says what its
 * members are, in order, with a regular expression whose atoms are shape
 * expressions: `;` concatenates, `|` chooses, `( )` groups and a cardinality
 * repeats, as in a triple expression.  `LIST card x` is short for
 * `LIST ( x card )`.  ShExJ: a ListShape whose expression is a Member, or a
 * ListEachOf or ListOneOf of them, each with min/max as on triple expressions.
 */
"use strict";

const {expect} = require("chai");
const ShExParser = require("@shexjs/parser");
const {ShExVisitor} = require("@shexjs/visitor");

const BASE = "http://a.example/";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const A = BASE + "A", B = BASE + "B", C = BASE + "C", T = BASE + "T", p = BASE + "p";

const parse = text => ShExParser.construct(BASE, {xsd: XSD}, {}).parse(text, BASE, undefined, "ListShape-test");
const shapeExprOf = text => parse(text).shapes[0].shapeExpr;
const dt = iri => ({type: "NodeConstraint", datatype: iri});
const int = dt(XSD + "integer"), str = dt(XSD + "string");
const iri = {type: "NodeConstraint", nodeKind: "iri"};
const list = expression => ({type: "ListShape", expression});
const member = (shapeExpr, card) => Object.assign({type: "Member", shapeExpr}, card);
const eachOf = (expressions, card) => Object.assign({type: "ListEachOf", expressions}, card);
const oneOf = (expressions, card) => Object.assign({type: "ListOneOf", expressions}, card);
const star = {min: 0, max: -1}, plus = {min: 1, max: -1}, opt = {min: 0, max: 1}, exactly = n => ({min: n, max: n});

describe("rdf-array LIST: parsing", function () {

  describe("LIST card x", function () {
    it("takes each cardinality", function () {
      expect(shapeExprOf("<S> LIST * xsd:integer")).to.deep.equal(list(member(int, star)));
      expect(shapeExprOf("<S> LIST + @<T>")).to.deep.equal(list(member(T, plus)));
      expect(shapeExprOf("<S> LIST ? IRI")).to.deep.equal(list(member(iri, opt)));
      expect(shapeExprOf("<S> LIST {3} xsd:integer")).to.deep.equal(list(member(int, exactly(3))));
      expect(shapeExprOf("<S> LIST {2,3} .")).to.deep.equal(list(member({type: "Shape"}, {min: 2, max: 3})));
      expect(shapeExprOf("<S> LIST {2,} <T>")).to.deep.equal(list(member(dt(T), {min: 2, max: -1})));
      expect(shapeExprOf("<S> LIST {2,*} <T>")).to.deep.equal(list(member(dt(T), {min: 2, max: -1})));
    });

    it("is LIST ( x card ): the same ShExJ", function () {
      expect(shapeExprOf("<S> LIST * xsd:integer")).to.deep.equal(shapeExprOf("<S> LIST ( xsd:integer * )"));
      expect(shapeExprOf("<S> LIST {2} LIST {3} xsd:integer")).to.deep.equal(shapeExprOf("<S> LIST ( LIST ( xsd:integer {3} ) {2} )"));
      expect(shapeExprOf("<S> LIST * LIST * xsd:integer")).to.deep.equal(shapeExprOf("<S> LIST ( LIST ( xsd:integer * ) * )"));
    });

    it("takes any inline shape atom, a junction in parentheses", function () {
      expect(shapeExprOf("<S> LIST {2} ( @<A> OR @<B> )")).to.deep.equal(list(member({type: "ShapeOr", shapeExprs: [A, B]}, exactly(2))));
      expect(shapeExprOf("<S> LIST + { <p> . }")).to.deep.equal(list(member({type: "Shape", expression: {type: "TripleConstraint", predicate: p}}, plus)));
      expect(shapeExprOf("<S> LIST {3} xsd:integer MININCLUSIVE 0 MAXINCLUSIVE 255"), "facets belong to the member")
        .to.deep.equal(list(member(Object.assign({}, int, {mininclusive: 0, maxinclusive: 255}), exactly(3))));
      expect(shapeExprOf("<S> LIST * ( NOT @<A> )")).to.deep.equal(list(member({type: "ShapeNot", shapeExpr: A}, star)));
    });

    it("rejects a bare LIST x (§5): no number of members is implied", function () {
      expect(() => parse("<S> LIST xsd:integer")).to.throw(/Expecting '\(', '\*', '\+', '\?', 'REPEAT_RANGE'/);
      expect(() => parse("<S> LIST")).to.throw(/Parse error/);
      expect(() => parse("<S> LIST * NOT @<A>"), "NOT is not an atom").to.throw(/Parse error/);
    });
  });

  describe("LIST ( regex )", function () {
    it("takes one member: exactly one (§5)", function () {
      expect(shapeExprOf("<S> LIST ( xsd:integer )")).to.deep.equal(list(member(int)));
      expect(shapeExprOf("<S> LIST ( . )")).to.deep.equal(list(member({type: "Shape"})));
    });

    it("concatenates with ; (ordered) and chooses with |", function () {
      expect(shapeExprOf("<S> LIST ( xsd:string ; xsd:integer )")).to.deep.equal(list(eachOf([member(str), member(int)])));
      expect(shapeExprOf("<S> LIST ( xsd:string | xsd:integer )")).to.deep.equal(list(oneOf([member(str), member(int)])));
      expect(shapeExprOf("<S> LIST ( @<A> ; @<B> ; @<C> | @<T> )"), "; binds tighter than |")
        .to.deep.equal(list(oneOf([eachOf([member(A), member(B), member(C)]), member(T)])));
    });

    it("gives a member, a group or a nested LIST a cardinality", function () {
      expect(shapeExprOf("<S> LIST ( xsd:integer * )")).to.deep.equal(list(member(int, star)));
      expect(shapeExprOf("<S> LIST ( ( xsd:string ; xsd:integer ) * )"), "a repeated group: pairs flattened into one list")
        .to.deep.equal(list(eachOf([member(str), member(int)], star)));
      expect(shapeExprOf("<S> LIST ( ( xsd:integer | LIST ( xsd:integer ; xsd:integer ) ) + )"))
        .to.deep.equal(list(oneOf([member(int), member(list(eachOf([member(int), member(int)])))], plus)));
      expect(shapeExprOf("<S> LIST ( LIST ( xsd:integer ; xsd:integer ) {2,} )"), "a polyline")
        .to.deep.equal(list(member(list(eachOf([member(int), member(int)])), {min: 2, max: -1})));
    });

    it("keeps a group's nesting, and wraps a doubly counted one in a ListEachOf of one (§7)", function () {
      expect(shapeExprOf("<S> LIST ( ( @<A> ; @<B> ) ; @<C> )")).to.deep.equal(list(eachOf([eachOf([member(A), member(B)]), member(C)])));
      expect(shapeExprOf("<S> LIST ( ( @<A> | @<B> ) | @<C> )")).to.deep.equal(list(oneOf([oneOf([member(A), member(B)]), member(C)])));
      expect(shapeExprOf("<S> LIST ( ( @<A> ) )"), "a group of one is its member").to.deep.equal(list(member(A)));
      expect(shapeExprOf("<S> LIST ( ( @<A> ) {2} )")).to.deep.equal(list(member(A, exactly(2))));
      expect(shapeExprOf("<S> LIST ( ( @<A> {2} ) {3} )")).to.deep.equal(list(eachOf([member(A, exactly(2))], exactly(3))));
      expect(shapeExprOf("<S> LIST ( ( @<A> ; @<B> ) {2} ; @<C> * )")).to.deep.equal(list(eachOf([eachOf([member(A), member(B)], exactly(2)), member(C, star)])));
    });

    it("takes a member of any shape expression, except that its first atom is not parenthesised (§5)", function () {
      expect(shapeExprOf("<S> LIST ( @<B> AND ( @<A> OR @<C> ) )")).to.deep.equal(list(member({type: "ShapeAnd", shapeExprs: [B, {type: "ShapeOr", shapeExprs: [A, C]}]})));
      expect(shapeExprOf("<S> LIST ( ( @<A> OR @<B> ) * )"), "a group of one OR").to.deep.equal(list(member({type: "ShapeOr", shapeExprs: [A, B]}, star)));
      expect(shapeExprOf("<S> LIST ( NOT ( IRI OR BNODE ) ; LITERAL )")).to.deep.equal(list(eachOf([
        member({type: "ShapeNot", shapeExpr: {type: "ShapeOr", shapeExprs: [iri, {type: "NodeConstraint", nodeKind: "bnode"}]}}),
        member({type: "NodeConstraint", nodeKind: "literal"})])));
      expect(shapeExprOf("<S> LIST ( IRI @<T> ; { <p> . } )")).to.deep.equal(list(eachOf([
        member({type: "ShapeAnd", shapeExprs: [iri, T]}),
        member({type: "Shape", expression: {type: "TripleConstraint", predicate: p}})])));
      expect(() => parse("<S> LIST ( ( @<A> ) AND @<B> )"), "that ( opens a group").to.throw(/Expecting '\)', '\|', ';'/);
    });

    it("rejects an empty list expression and stray separators", function () {
      ["<S> LIST ( )", "<S> LIST ( @<A> ; )", "<S> LIST ( ; @<A> )", "<S> LIST ( @<A> | )", "<S> LIST ( @<A> {2} {3} )", "<S> LIST ( @<A>"]
        .forEach(text => expect(() => parse(text), text).to.throw(/Parse error/));
    });
  });

  describe("as a shape atom", function () {
    it("takes NOT, AND and OR, and nests", function () {
      expect(shapeExprOf("<S> NOT LIST * IRI")).to.deep.equal({type: "ShapeNot", shapeExpr: list(member(iri, star))});
      expect(shapeExprOf("<S> LIST {2} <T> OR IRI")).to.deep.equal({type: "ShapeOr", shapeExprs: [list(member(dt(T), exactly(2))), iri]});
      expect(shapeExprOf("<S> LIST * IRI AND LIST ( LITERAL ; LITERAL )"), "AND after LIST card x belongs to the enclosing expression")
        .to.deep.equal({type: "ShapeAnd", shapeExprs: [list(member(iri, star)), list(eachOf([member({type: "NodeConstraint", nodeKind: "literal"}), member({type: "NodeConstraint", nodeKind: "literal"})]))]});
      expect(shapeExprOf("<S> (LIST * IRI)"), "parentheses around a LIST").to.deep.equal(list(member(iri, star)));
      expect(shapeExprOf("<S> ((LIST * IRI))"), "and two pairs of them").to.deep.equal(list(member(iri, star)));
    });

    it("is a triple constraint's value, whose cardinality follows the LIST (§5)", function () {
      expect(shapeExprOf("<S> { <p> LIST ( @<T> + ) {1,2} }").expression).to.deep.equal(
        {type: "TripleConstraint", predicate: p, valueExpr: list(member(T, plus)), min: 1, max: 2});
      expect(shapeExprOf("<S> { <p> LIST * xsd:integer {1,2} }").expression).to.deep.equal(
        {type: "TripleConstraint", predicate: p, valueExpr: list(member(int, star)), min: 1, max: 2});
      expect(shapeExprOf("<S> { <p> LIST {3} <T> ; <p> LIST ( @<T> ) }")).to.deep.equal({
        type: "Shape", expression: {type: "EachOf", expressions: [
          {type: "TripleConstraint", predicate: p, valueExpr: list(member(dt(T), exactly(3)))},
          {type: "TripleConstraint", predicate: p, valueExpr: list(member(T))},
        ]}});
    });

    it("is not an EXTENDS target (§2.3)", function () {
      expect(() => parse("<S> EXTENDS LIST * @<T> { <p> . }")).to.throw(/Parse error/);
      expect(() => parse("<S> EXTENDS LIST ( @<T> ) { <p> . }")).to.throw(/Parse error/);
    });

    it("leaves prefixes and local names spelled list alone", function () {
      expect(shapeExprOf("PREFIX list: <http://l/> <S> { list:p list:T ; <p> @list:S }").expression.expressions.map(tc => tc.predicate))
        .to.deep.equal(["http://l/p", p]);
    });

    it("reads a parenthesised reference as that reference (§5)", function () {
      const decl = text => ShExParser.construct("http://a.example/").parse("<A> {} <B> {} <S> " + text).shapes[2].shapeExpr;
      expect(decl("( @<A> )")).to.equal("http://a.example/A");
      expect(decl("@<B> AND ( @<A> )").shapeExprs).to.deep.equal(["http://a.example/B", "http://a.example/A"]);
      expect(decl("LIST * ( @<A> )").expression.shapeExpr).to.equal("http://a.example/A");
    });
    it("rejects the old ((x))[m, n] spelling; ((x)) is again a doubly parenthesised x", function () {
      ["<S> ((<T>))[2]", "<S> ((@<T>))[1, *]", "<S> { <p> ((.))[0, 1] }"]
        .forEach(text => expect(() => parse(text), text).to.throw(/Parse error/));
      expect(shapeExprOf("<S> ((<T>))")).to.deep.equal(dt(T));
      expect(shapeExprOf("<S> { <p> ((.)) }").expression).to.deep.equal({type: "TripleConstraint", predicate: p});
    });
  });

  describe("the design note's examples (§4.2)", function () {
    it("parse to the ShExJ the note gives", function () {
      const schema = parse(`PREFIX : <${BASE}>
<BP>          LIST + @<Component>
<Component>   LIST ( xsd:string ; xsd:string ; LIST ( xsd:integer ; xsd:string ) )
<Matrix2x3>   LIST ( LIST ( xsd:integer {3} ) {2} )
<Ragged>      LIST * LIST * xsd:integer
<Polyline>    LIST ( LIST ( xsd:integer ; xsd:integer ) {2,} )
<Pairs>       LIST ( ( xsd:string ; xsd:integer ) * )
<IntsOrPairs> LIST ( ( xsd:integer | LIST ( xsd:integer ; xsd:integer ) ) + )
<Tree>        LIST ( xsd:string ; LIST ( @<Tree> * ) )
`);
      const byId = Object.fromEntries(schema.shapes.map(d => [d.id.substr(BASE.length), d.shapeExpr]));
      expect(byId.BP).to.deep.equal(list(member(BASE + "Component", plus)));
      expect(byId.Component).to.deep.equal(list(eachOf([member(str), member(str), member(list(eachOf([member(int), member(str)])))])));
      expect(byId.Matrix2x3).to.deep.equal(list(member(list(member(int, exactly(3))), exactly(2))));
      expect(byId.Ragged).to.deep.equal(list(member(list(member(int, star)), star)));
      expect(byId.Polyline).to.deep.equal(list(member(list(eachOf([member(int), member(int)])), {min: 2, max: -1})));
      expect(byId.Pairs).to.deep.equal(list(eachOf([member(str), member(int)], star)));
      expect(byId.IntsOrPairs).to.deep.equal(list(oneOf([member(int), member(list(eachOf([member(int), member(int)])))], plus)));
      expect(byId.Tree).to.deep.equal(list(eachOf([member(str), member(list(member(BASE + "Tree", star)))])));
      expect(new ShExVisitor().visitSchema(schema), "and survive the visitor").to.deep.equal(schema);
    });
  });
});
