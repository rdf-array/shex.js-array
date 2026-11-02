/** rdf-array: validating sequence terms against the LIST shape expression,
 * `LIST ( regex )` and `LIST card x` (rdf-array/docs/array-syntax.md §2, §4.2, §5).
 * The data is Turtle-array parsed by N3.js-array, where `(1 2 3)` is one sequence
 * term, not an rdf:first/rdf:rest ladder.  Both regex engines are exercised,
 * though the LIST matcher is the validator's own. */
"use strict";

const expect = require("chai").expect;
const N3 = require("n3");
const ShExParser = require("@shexjs/parser");
const ShExUtil = require("@shexjs/util");
const {rdfJsTerm2Ld} = require("@shexjs/term");
const {ctor: RdfJsDb} = require("@shexjs/neighborhood-rdfjs");
const {ShExValidator} = require("..");
const {RegexpModule: Threaded} = require("@shexjs/eval-threaded-nerr");
const {RegexpModule: Simple} = require("@shexjs/eval-simple-1err");

const base = "http://a.example/";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const PRE = `PREFIX : <${base}>\nPREFIX xsd: <${XSD}>\n`;
const int = n => ({value: String(n), type: XSD + "integer"});
const str = s => ({value: s, type: XSD + "string"});

function validatorFor (schemaText, dataText, engine) {
  const schema = ShExParser.construct(base, {}, {index: true}).parse(PRE + schemaText + "\n");
  const graph = new N3.Store();
  graph.addQuads(new N3.Parser({baseIRI: base}).parse(PRE + dataText));
  return new ShExValidator(schema, RdfJsDb(graph), {regexModule: engine, noCache: true});
}
function validate (schemaText, dataText, node, engine, shape = "S") {
  return validatorFor(schemaText, dataText, engine).validateShapeMap([{node: node || base + "x", shape: base + shape}])[0];
}
const count = (result, type) => (JSON.stringify(result.appinfo).match(new RegExp(`"type":"${type}"`, "g")) || []).length;
const simple = result => result.status === "conformant" ? "conformant" : ShExUtil.errsToSimple(result.appinfo).join("\n");

describe("rdf-array LIST: the structure check", function () {
  const check = text => ShExUtil.validateSchema(ShExParser.construct(base, {}, {index: true}).parse(PRE + text + "\n"), {});
  it("allows recursion through a list: a member is another node", function () {
    check(`<Tree> LIST ( xsd:string ; LIST ( @<Tree> * ) )`);
    check(`<L> LIST * @<L>`);
  });
  it("still rejects a same-node cycle beside a list", function () {
    expect(() => check(`<S> LIST * . AND @<S>`)).to.throw(/circular reference/);
  });
});

[Threaded, Simple].forEach(engine => describe("rdf-array LIST: validation under " + engine.name, function () {

  describe("LIST card x", function () {
    it("accepts a sequence of the right length whose members conform", function () {
      const result = validate("<S> { :p LIST {3} LITERAL }", ":x :p (1 2 3) .", null, engine);
      expect(result.status, JSON.stringify(result.appinfo).slice(0, 300)).to.equal("conformant");
      expect(count(result, "ListShapeResults"), "one list result").to.equal(1);
      expect(count(result, "NodeConstraintTest"), "one per member").to.equal(3);
    });

    it("counts the members", function () {
      expect(validate("<S> { :p LIST {2} LITERAL }", ":x :p (1 2 3) .", null, engine).status).to.equal("nonconformant");
      expect(validate("<S> { :p LIST {2,3} LITERAL }", ":x :p (1 2 3) .", null, engine).status).to.equal("conformant");
      expect(validate("<S> { :p LIST {4,} LITERAL }", ":x :p (1 2 3) .", null, engine).status).to.equal("nonconformant");
      expect(validate("<S> { :p LIST + LITERAL }", ":x :p (1 2 3) .", null, engine).status).to.equal("conformant");
      expect(validate("<S> { :p LIST * LITERAL }", ":x :p (1 2 3) .", null, engine).status).to.equal("conformant");
      expect(validate("<S> { :p LIST ? LITERAL }", ":x :p (1 2 3) .", null, engine).status).to.equal("nonconformant");
      const tooMany = validate("<S> { :p LIST {2} LITERAL }", ":x :p (1 2 3) .", null, engine);
      expect(count(tooMany, "ListLengthViolation")).to.equal(1);
      expect(JSON.stringify(tooMany.appinfo)).to.include("sequence of 3 members where 2 expected");
      expect(JSON.stringify(validate("<S> { :p LIST {4,} LITERAL }", ":x :p (1 2 3) .", null, engine).appinfo)).to.include("where at least 4 expected");
      expect(JSON.stringify(validate("<S> { :p LIST {4,6} LITERAL }", ":x :p (1 2 3) .", null, engine).appinfo)).to.include("where 4 to 6 expected");
    });

    it("accepts the empty sequence where the cardinality allows it (§5)", function () {
      expect(validate("<S> { :p LIST {0} IRI }", ":x :p () .", null, engine).status).to.equal("conformant");
      expect(validate("<S> { :p LIST * IRI }", ":x :p () .", null, engine).status).to.equal("conformant");
      expect(validate("<S> { :p LIST + IRI }", ":x :p () .", null, engine).status).to.equal("nonconformant");
      expect(validate("<S> { :p LIST ( IRI ? ; LITERAL * ) }", ":x :p () .", null, engine).status).to.equal("conformant");
    });

    it("reports every member that fails, by index", function () {
      const result = validate("<S> { :p LIST * IRI }", ":x :p (:a 1 :b 2) .", null, engine);
      expect(result.status).to.equal("nonconformant");
      expect(count(result, "ListMemberFailure")).to.equal(2);
      expect(JSON.stringify(result.appinfo)).to.include('"index":1').and.to.include('"index":3');
      const text = simple(result);
      expect(text).to.include("as a list:");
      expect(text).to.include("member 1:");
      expect(text).to.include("member 3:");
    });

    it("wants a sequence", function () {
      const result = validate("<S> { :p LIST * LITERAL }", ":x :p 1 .", null, engine);
      expect(result.status).to.equal("nonconformant");
      expect(count(result, "SequenceExpected")).to.equal(1);
      expect(simple(result)).to.include("is not a sequence");
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
      expect(validate("<S> { :p LIST {2} LIST {2} LITERAL }", ":x :p ((1 2) (3 4)) .", null, engine).status).to.equal("conformant");
      expect(validate("<S> { :p LIST {2} LIST {2} LITERAL }", ":x :p ((1 2) (3)) .", null, engine).status).to.equal("nonconformant");
      expect(validate("<S> { :p LIST {2} LIST {2} LITERAL }", ":x :p ((1 2) 3) .", null, engine).status).to.equal("nonconformant");
    });

    it("follows shape references from the members", function () {
      const data = ":x :p (:a :b) . :a :q 1 . :b :q 2 .";
      expect(validate("<S> { :p LIST {2} @<T> }\n<T> { :q LITERAL }", data, null, engine).status).to.equal("conformant");
      expect(validate("<S> { :p LIST {2} @<T> }\n<T> { :q IRI }", data, null, engine).status).to.equal("nonconformant");
    });

    it("takes a sequence as the focus node, written as a JSON array", function () {
      expect(validate("<S> LIST {2} LITERAL", "", [int(1), int(2)], engine).status).to.equal("conformant");
      expect(validate("<S> LIST {3} LITERAL", "", [int(1), int(2)], engine).status).to.equal("nonconformant");
      expect(validate("<S> LIST * LIST {1} LITERAL", "", [[int(1)], [int(2)]], engine).status).to.equal("conformant");
    });

    it("finds the neighborhood of a sequence subject", function () {
      const result = validate("<S> { :q [:o] }", "(1 2) :q :o .", [int(1), int(2)], engine);
      expect(result.status, JSON.stringify(result.appinfo).slice(0, 300)).to.equal("conformant");
      expect(validate("<S> { :q [:o] }", "(1 2) :q :o .", [int(1), int(3)], engine).status).to.equal("nonconformant");
    });
  });

  describe("LIST ( regex )", function () {
    it("matches the members in order: ; is ordered, unlike a triple expression's", function () {
      expect(validate("<S> LIST ( xsd:string ; xsd:integer )", "", [str("a"), int(1)], engine).status).to.equal("conformant");
      expect(validate("<S> LIST ( xsd:string ; xsd:integer )", "", [int(1), str("a")], engine).status).to.equal("nonconformant");
      expect(validate("<S> LIST ( xsd:string ; xsd:integer )", "", [str("a")], engine).status).to.equal("nonconformant");
      expect(validate("<S> LIST ( xsd:string ; xsd:integer )", "", [str("a"), int(1), int(2)], engine).status).to.equal("nonconformant");
      expect(validate("<S> { :p . ; :q . }", ":x :q 1 ; :p 2 .", null, engine).status, "while a shape's ; is not").to.equal("conformant");
    });

    it("chooses with |, and repeats members and groups", function () {
      expect(validate("<S> LIST ( ( xsd:string | xsd:integer ) * )", "", [str("a"), int(1), str("b")], engine).status).to.equal("conformant");
      expect(validate("<S> LIST ( ( xsd:string ; xsd:integer ) * )", "", [str("a"), int(1), str("b"), int(2)], engine).status).to.equal("conformant");
      expect(validate("<S> LIST ( ( xsd:string ; xsd:integer ) * )", "", [str("a"), int(1), str("b")], engine).status, "an odd number").to.equal("nonconformant");
      expect(validate("<S> LIST ( ( xsd:string ; xsd:integer ) {2} )", "", [str("a"), int(1), str("b"), int(2)], engine).status).to.equal("conformant");
      expect(validate("<S> LIST ( ( xsd:string ; xsd:integer ) {2} )", "", [str("a"), int(1)], engine).status).to.equal("nonconformant");
      expect(validate("<S> LIST ( xsd:string + ; xsd:integer )", "", [str("a"), str("b"), int(1)], engine).status).to.equal("conformant");
      expect(validate("<S> LIST ( xsd:string ? ; xsd:integer ; xsd:string ? )", "", [int(1), str("b")], engine).status).to.equal("conformant");
      expect(validate("<S> LIST ( ( xsd:string {2} ) {2} )", "", [str("a"), str("b"), str("c"), str("d")], engine).status, "a doubly counted group").to.equal("conformant");
      expect(validate("<S> LIST ( ( xsd:string {2} ) {2} )", "", [str("a"), str("b"), str("c")], engine).status).to.equal("nonconformant");
    });

    it("backtracks: a member may belong to more than one part", function () {
      expect(validate("<S> LIST ( LITERAL * ; xsd:integer )", "", [int(1), int(2), int(3)], engine).status).to.equal("conformant");
      expect(validate("<S> LIST ( LITERAL * ; xsd:integer )", "", [int(1), int(2), str("a")], engine).status).to.equal("nonconformant");
      expect(validate("<S> LIST ( ( LITERAL * ) * ; xsd:string )", "", [int(1), int(2), str("a")], engine).status, "a star of a star terminates").to.equal("conformant");
      expect(validate("<S> LIST ( ( xsd:integer ? ) {3} ; xsd:string )", "", [str("a")], engine).status, "empty iterations count").to.equal("conformant");
    });

    it("reports the member that matches nothing tried on it, or the count that does not fit", function () {
      const member = validate("<S> LIST ( xsd:string ; xsd:integer )", "", [int(1), str("a")], engine);
      expect(count(member, "ListMemberFailure")).to.equal(1);
      expect(JSON.stringify(member.appinfo)).to.include('"index":0');
      expect(simple(member)).to.include("member 0:");
      const choice = validate("<S> LIST ( ( xsd:string | xsd:integer ) * )", "", [str("a"), { value: "x", type: XSD + "boolean" }], engine);
      expect(count(choice, "ListMemberFailure"), "member 1, with both alternatives' failures").to.equal(1);
      expect(count(choice, "NodeConstraintViolation")).to.equal(2);
      const short = validate("<S> LIST ( xsd:string ; xsd:integer )", "", [str("a")], engine);
      expect(count(short, "ListLengthViolation")).to.equal(1);
      expect(JSON.stringify(short.appinfo)).to.include("sequence of 1 member where 2 expected");
      const long = validate("<S> LIST ( ( xsd:string ; xsd:integer ) * )", "", [str("a"), int(1), str("b")], engine);
      expect(count(long, "ListLengthViolation")).to.equal(1);
      expect(JSON.stringify(long.appinfo)).to.include("sequence of 3 members where the list expression wants more");
      const extra = validate("<S> LIST ( xsd:string ; xsd:integer )", "", [str("a"), int(1), int(2)], engine);
      expect(JSON.stringify(extra.appinfo)).to.include("sequence of 3 members where 2 expected");
    });

    it("reports one result per member, in order, from the alternative that matched it", function () {
      const result = validate("<S> LIST ( ( xsd:string | xsd:integer ) * )", "", [str("a"), int(1)], engine);
      expect(result.status).to.equal("conformant");
      const results = result.appinfo;
      expect(results.type).to.equal("ListShapeResults");
      expect(results.solutions.length).to.equal(2);
      expect(results.solutions.map(s => s.type)).to.deep.equal(["NodeConstraintTest", "NodeConstraintTest"]);
      expect(results.solutions.map(s => s.shapeExpr.datatype)).to.deep.equal([XSD + "string", XSD + "integer"]);
      expect(results.node, "the sequence, as JSON-LD-style terms (xsd:string implied)").to.deep.equal([{value: "a"}, int(1)]);
    });
  });

  describe("the design note's examples (§4.2)", function () {
    const SCHEMA = `
<BP>          LIST + @<Component>
<Component>   LIST ( xsd:string ; xsd:string ; LIST ( xsd:integer ; xsd:string ) )
<Matrix2x3>   LIST ( LIST ( xsd:integer {3} ) {2} )
<Matrix2x3S>  LIST {2} LIST {3} xsd:integer
<Ragged>      LIST ( LIST ( xsd:integer * ) * )
<RaggedS>     LIST * LIST * xsd:integer
<Polyline>    LIST ( LIST ( xsd:integer ; xsd:integer ) {2,} )
<Pairs>       LIST ( ( xsd:string ; xsd:integer ) * )
<IntsOrPairs> LIST ( ( xsd:integer | LIST ( xsd:integer ; xsd:integer ) ) + )
<Tree>        LIST ( xsd:string ; LIST ( @<Tree> * ) )
<Obs>         { :component @<BP> }`;
    const DATA = `
:obs1 :component ( ( "8480-6" "systolic"  ( 120 "mm[Hg]" ) ) ( "8462-4" "diastolic" (  80 "mm[Hg]" ) ) ) .
:obs2 :component ( ( "8480-6" "systolic"  ( 150 "mm[Hg]" ) ) ( "8462-4" "diastolic" (  95 "mm[Hg]" ) ) ) .
:obs3 :component ( ( "8480-6" "systolic"  ( "high" "mm[Hg]" ) ) ) .
:m1   :matrix ( ( 1 2 3 ) ( 4 5 6 ) ) .
:m2   :matrix ( ( 1 2 3 ) ( 4 5 ) ) .
:poly :points ( ( 0 0 ) ( 3 0 ) ( 3 4 ) ) .
:kv   :pairs  ( "a" 1 "b" 2 "c" 3 ) .
:tree :node   ( "root" ( ( "left" ( ) ) ( "right" ( ( "leaf" ( ) ) ) ) ) ) .`;
    const verdicts = [
      ["obs1", "component", "BP", true], ["obs2", "component", "BP", true], ["obs3", "component", "BP", false],
      ["m1", "matrix", "Matrix2x3", true], ["m2", "matrix", "Matrix2x3", false],
      ["m1", "matrix", "Matrix2x3S", true], ["m2", "matrix", "Matrix2x3S", false],
      ["m1", "matrix", "Ragged", true], ["m2", "matrix", "Ragged", true],
      ["m1", "matrix", "RaggedS", true], ["m2", "matrix", "RaggedS", true],
      ["poly", "points", "Polyline", true], ["m1", "matrix", "Polyline", false],
      ["kv", "pairs", "Pairs", true], ["poly", "points", "Pairs", false],
      ["poly", "points", "IntsOrPairs", true], ["m1", "matrix", "IntsOrPairs", false],
      ["tree", "node", "Tree", true], ["m1", "matrix", "Tree", false],
    ];
    const validator = validatorFor(SCHEMA, DATA, engine);
    const graph = new N3.Store(new N3.Parser({baseIRI: base}).parse(PRE + DATA));
    const seqOf = (s, p) => rdfJsTerm2Ld(
      graph.getQuads(N3.DataFactory.namedNode(base + s), N3.DataFactory.namedNode(base + p), null)[0].object);

    verdicts.forEach(([s, p, shape, expected]) => {
      it(`${expected ? "accepts" : "rejects"} :${s} as <${shape}>`, function () {
        const result = validator.validateShapeMap([{node: seqOf(s, p), shape: base + shape}])[0];
        expect(result.status, simple(result)).to.equal(expected ? "conformant" : "nonconformant");
      });
    });

    it("reaches the sequence through a triple constraint, with a result per member at every level", function () {
      const result = validator.validateShapeMap([{node: base + "obs1", shape: base + "Obs"}])[0];
      expect(result.status).to.equal("conformant");
      expect(count(result, "ListShapeResults"), "the components, two 3-tuples, two (value unit) pairs").to.equal(5);
    });

    it("explains :obs3 down to the member that is not an integer", function () {
      const result = validator.validateShapeMap([{node: seqOf("obs3", "component"), shape: base + "BP"}])[0];
      const text = simple(result);
      expect(text).to.include("member 0:");
      expect(text).to.include("member 2:");
      expect(text).to.match(/"high" doesn't satisfy .*integer/);
    });
  });
}));

[Threaded, Simple].forEach(engine => describe("rdf-undef: a slot in a sequence under " + engine.name, function () {
  const verdict = (schemaText, dataText) => validate(schemaText, dataText, undefined, engine).status;
  // the focus is the object of :x :p
  const seq = text => `:x :p ${text} .`;
  const value = (shapeExpr, dataText) => verdict(`<S> { :p ${shapeExpr} }`, dataText);

  it("satisfies no member, . and NOT included", function () {
    expect(value("LIST * xsd:integer", seq("(1 undef)"))).to.equal("nonconformant");
    expect(value("LIST * .", seq("(1 undef)"))).to.equal("nonconformant");
    expect(value("LIST * ( NOT xsd:string )", seq("(1 undef)"))).to.equal("nonconformant");
    expect(value("LIST * LIST * .", seq("((undef))"))).to.equal("nonconformant");
  });
  it("is matched by undef, and nothing else is", function () {
    expect(value("LIST ( ( xsd:integer | undef ) * )", seq("(1 undef 3)"))).to.equal("conformant");
    expect(value("LIST ( ( xsd:integer | undef ) * )", seq("(1 2)"))).to.equal("conformant");
    expect(value("LIST ( xsd:integer ; undef )", seq("(1 undef)"))).to.equal("conformant");
    expect(value("LIST ( xsd:integer ; undef )", seq("(1 2)"))).to.equal("nonconformant");
    expect(value("LIST * undef", seq("(undef undef)"))).to.equal("conformant");
    expect(value("LIST * undef", seq("()"))).to.equal("conformant");
    expect(value("LIST + undef", seq("()"))).to.equal("nonconformant");
  });
  it("counts in the length", function () {
    expect(value("LIST ( undef {2} )", seq("(undef)"))).to.equal("nonconformant");
    expect(value("LIST ( undef {2} )", seq("(undef undef)"))).to.equal("conformant");
  });
  it("leaves a sequence holding one a value like any", function () {
    expect(value(".", seq("(undef)"))).to.equal("conformant");
    expect(value("LIST ( LIST ( undef ) )", seq("((undef))"))).to.equal("conformant");
  });
  it("gives one result per member, and says why it fails", function () {
    const ok = validate("<S> LIST ( xsd:integer ; undef )", seq("(1 undef)"), [int(1), null], engine);
    expect(ok.status).to.equal("conformant");
    expect(count(ok, "UndefResult")).to.equal(1);
    const bad = validate("<S> { :p LIST * xsd:integer }", seq("(1 undef)"), undefined, engine);
    expect(simple(bad)).to.include("member 2 is an empty slot");
    const notSlot = validate("<S> { :p LIST ( undef ) }", seq("(1)"), undefined, engine);
    expect(simple(notSlot)).to.include("member 1 is not an empty slot");
  });
}));
