#!/usr/bin/env node
/** rdf-array: derive packages/shex-util/ShExR.shex from the spec's ShExR.shex.
 *
 * Under rdf-array a list written `( ... )` is one sequence term, so the spec's
 * rdf:first/rdf:rest ladder shapes (@<#...ListNPlus>) can't match it.  This
 * rewrites every ladder reference as a Collection shape expression,
 * ((@<#X>))[n, *], drops the ladder shapes, and adds the Collection shape
 * expression to the shapeExpr union so a ShExR document can say one.
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
  sub(/sx:imports @<#IriList1Plus> \?/g, "sx:imports ((IRI))[1, *] ?", 1);
  sub(/sx:startActs @<#SemActList1Plus> \?/g, "sx:startActs ((@<#SemAct>))[1, *] ?", 1);
  sub(/sx:shapes @<#ShapeDeclList1Plus> \?/g, "sx:shapes ((@<#ShapeDecl>))[1, *] ?", 1);
  sub(/sx:shapeExprs @<#shapeDeclOrExprList2Plus>/g, "sx:shapeExprs ((@<#shapeDeclOrExpr>))[2, *]", 2);
  sub(/sx:values @<#valueSetValueList1Plus> \?/g, "sx:values ((@<#valueSetValue>))[1, *] ?", 1);
  sub(/sx:semActs @<#SemActList1Plus> \?/g, "sx:semActs ((@<#SemAct>))[1, *] ?", 4);
  sub(/sx:annotation @<#AnnotationList1Plus> \?/g, "sx:annotation ((@<#Annotation>))[1, *] ?", 4);
  sub(/sx:extends @<#shapeDeclOrExprList1Plus>\?/g, "sx:extends ((@<#shapeDeclOrExpr>))[1, *] ?", 1);
  sub(/sx:exclusion @<#IriStemExclusionList1Plus>/g, "sx:exclusion ((IRI OR @<#IriStem>))[1, *]", 1);
  sub(/sx:exclusion @<#LiteralStemExclusionList1Plus>/g, "sx:exclusion ((xsd:string OR @<#LiteralStem>))[1, *]", 1);
  sub(/sx:exclusion @<#LanguageStemExclusionList1Plus>/g, "sx:exclusion ((xsd:string OR @<#LanguageStem>))[1, *]", 1);
  sub(/sx:expressions @<#tripleExpressionList2Plus>/g, "sx:expressions ((@<#tripleExpression>))[2, *]", 2);
  sub(/<#shapeExpr> @<#ShapeOr> OR @<#ShapeAnd> OR @<#ShapeNot> OR @<#NodeConstraint> OR @<#Shape> OR @<#ShapeExternal>\n/,
      "<#shapeExpr> @<#ShapeOr> OR @<#ShapeAnd> OR @<#ShapeNot> OR @<#NodeConstraint> OR @<#Shape> OR @<#ShapeExternal> OR @<#Collection>\n", 1);
  sub(/(<#ShapeNot> CLOSED \{\n  a \[sx:ShapeNot\] ;\n  sx:shapeExpr @<#shapeDeclOrExpr>\n\}\n)/,
      "$1\n# rdf-array: ((shapeExpr))[min, max], a sequence of min to max elements each conforming to shapeExpr\n"
      + "<#Collection> CLOSED {\n  a [sx:Collection] ;\n  sx:shapeExpr @<#shapeDeclOrExpr> ;\n  sx:min xsd:integer ? ;\n  sx:max xsd:integer ?\n}\n", 1);
  // a value-set member or an annotation object may be a sequence, as `( )` -- the
  // spec's own ShExR.ttl writes rdf:nil that way -- is under rdf-array
  sub(/<#objectValue> IRI OR LITERAL( #[^\n]*)?\n/,
      "<#objectValue> IRI OR LITERAL OR ((@<#objectValue>))$1 # rdf-array: or a sequence of them\n", 1);
  const lists = s.indexOf("# RDF Lists");
  if (lists === -1)
    throw Error("shexr-rdf-array: no '# RDF Lists' section in the spec's ShExR.shex");
  s = s.slice(0, lists)
    + "# rdf-array: there are no RDF lists.  A list written `( ... )` is one sequence term,\n"
    + "# matched above by the Collection shape expressions ((@<#X>))[1, *] in place of\n"
    + "# the ListNPlus ladder shapes of shexTest's ShExR.shex.\n";
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
