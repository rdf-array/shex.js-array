#!/usr/bin/env node
/** rdf-array: derive packages/shex-util/ShExR.shex from the spec's ShExR.shex.
 *
 * Under rdf-array a list written `( ... )` is one sequence term, so the spec's
 * rdf:first/rdf:rest ladder shapes (@<#...ListNPlus>) can't match it.  This
 * rewrites every ladder reference as a LIST shape expression, `LIST + @<#X>`
 * or `LIST {2,} @<#X>`, drops the ladder shapes, and adds the LIST shape
 * expression (sx:ListShape over sx:Member, sx:ListEachOf and sx:ListOneOf,
 * rdf-array/docs/array-syntax.md §7) to the shapeExpr union so a ShExR
 * document can say one.
 *
 *   node tools/shexr-rdf-array.js [path/to/spec/doc/ShExR.shex]
 *
 * then `node tools/gen-shexr-schema.js && (cd packages/shex-util && npx tsc)`.
 * packages/shex-util/test/ShExRSchema-test.js checks the derivation.
 */
"use strict";
const Fs = require("fs");
const Path = require("path");

/** the spec's ShExR.shex, read under rdf-array */
function rdfMinusShExR (spec) {
  let s = spec;
  const sub = (re, repl, atLeast) => {
    const n = (s.match(re) || []).length;
    if (n < atLeast)
      throw Error(`shexr-rdf-array: expected ${atLeast} of ${re}, found ${n}`);
    s = s.replace(re, repl);
  };
  sub(/sx:imports @<#IriList1Plus> \?/g, "sx:imports LIST + IRI ?", 1);
  sub(/sx:startActs @<#SemActList1Plus> \?/g, "sx:startActs LIST + @<#SemAct> ?", 1);
  sub(/sx:shapes @<#ShapeDeclList1Plus> \?/g, "sx:shapes LIST + @<#ShapeDecl> ?", 1);
  sub(/sx:shapeExprs @<#shapeDeclOrExprList2Plus>/g, "sx:shapeExprs LIST {2,} @<#shapeDeclOrExpr>", 2);
  sub(/sx:values @<#valueSetValueList1Plus> \?/g, "sx:values LIST + @<#valueSetValue> ?", 1);
  sub(/sx:semActs @<#SemActList1Plus> \?/g, "sx:semActs LIST + @<#SemAct> ?", 4);
  sub(/sx:annotation @<#AnnotationList1Plus> \?/g, "sx:annotation LIST + @<#Annotation> ?", 4);
  sub(/sx:extends @<#shapeDeclOrExprList1Plus>\?/g, "sx:extends LIST + @<#shapeDeclOrExpr> ?", 1);
  sub(/sx:exclusion @<#IriStemExclusionList1Plus>/g, "sx:exclusion LIST + ( IRI OR @<#IriStem> )", 1);
  sub(/sx:exclusion @<#LiteralStemExclusionList1Plus>/g, "sx:exclusion LIST + ( xsd:string OR @<#LiteralStem> )", 1);
  sub(/sx:exclusion @<#LanguageStemExclusionList1Plus>/g, "sx:exclusion LIST + ( xsd:string OR @<#LanguageStem> )", 1);
  sub(/sx:expressions @<#tripleExpressionList2Plus>/g, "sx:expressions LIST {2,} @<#tripleExpression>", 2);
  sub(/<#shapeExpr> @<#ShapeOr> OR @<#ShapeAnd> OR @<#ShapeNot> OR @<#NodeConstraint> OR @<#Shape> OR @<#ShapeExternal>\n/,
      "<#shapeExpr> @<#ShapeOr> OR @<#ShapeAnd> OR @<#ShapeNot> OR @<#NodeConstraint> OR @<#Shape> OR @<#ShapeExternal> OR @<#ListShape>\n", 1);
  sub(/(<#ShapeNot> CLOSED \{\n  a \[sx:ShapeNot\] ;\n  sx:shapeExpr @<#shapeDeclOrExpr>\n\}\n)/,
      "$1\n# rdf-array: the LIST shape expression, LIST ( regex ) over the members of a sequence or LIST card x. Its\n"
      + "# expression is a Member (min..max consecutive members, each matching shapeExpr; max -1: unbounded) or an\n"
      + "# ordered ListEachOf or ListOneOf of list expressions, with min and max as on triple expressions.\n"
      + "<#ListShape> CLOSED {\n  a [sx:ListShape] ;\n  sx:expression @<#listExpr>\n}\n\n"
      + "<#listExpr> @<#Member> OR @<#ListEachOf> OR @<#ListOneOf>\n\n"
      + "<#Member> CLOSED {\n  a [sx:Member] ;\n  sx:shapeExpr @<#shapeDeclOrExpr> ;\n  sx:min xsd:integer ? ;\n  sx:max xsd:integer ?\n}\n\n"
      + "<#ListEachOf> CLOSED {\n  a [sx:ListEachOf] ;\n  sx:expressions LIST + @<#listExpr> ;\n  sx:min xsd:integer ? ;\n  sx:max xsd:integer ?\n}\n\n"
      + "<#ListOneOf> CLOSED {\n  a [sx:ListOneOf] ;\n  sx:expressions LIST {2,} @<#listExpr> ;\n  sx:min xsd:integer ? ;\n  sx:max xsd:integer ?\n}\n", 1);
  // a value-set member or an annotation object may be a sequence, as `( )` -- the
  // spec's own ShExR.ttl writes rdf:nil that way -- is under rdf-array
  sub(/<#objectValue> IRI OR LITERAL( #[^\n]*)?\n/,
      "<#objectValue> IRI OR LITERAL OR LIST * @<#objectValue>$1 # rdf-array: or a sequence of them\n", 1);
  const lists = s.indexOf("# RDF Lists");
  if (lists === -1)
    throw Error("shexr-rdf-array: no '# RDF Lists' section in the spec's ShExR.shex");
  s = s.slice(0, lists)
    + "# rdf-array: there are no RDF lists.  A list written `( ... )` is one sequence term,\n"
    + "# matched above by the LIST shape expressions `LIST + @<#X>` in place of the\n"
    + "# ListNPlus ladder shapes of shexTest's ShExR.shex.\n";
  if (/List[012]Plus|rdf:first|rdf:rest/.test(s))
    throw Error("shexr-rdf-array: a list reference survived the rewrite");
  return s;
}

module.exports = {rdfMinusShExR};

if (require.main === module) {
  const findPath = require("../packages/shex-cli/test/findPath.js");
  const spec = process.argv[2] || findPath("doc") + "ShExR.shex";
  const out = Path.join(__dirname, "..", "packages", "shex-util", "ShExR.shex");
  Fs.writeFileSync(out, rdfMinusShExR(Fs.readFileSync(spec, "utf8")));
  console.log(`${out}: derived from ${spec}`);
}
