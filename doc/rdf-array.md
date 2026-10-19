# shex.js-array: ShEx over RDF- (sequences as terms)

RDF- is RDF whose data model has a fifth kind of term, the **sequence**: `(1 2 3)` in Turtle-
is one term holding its elements in order, not a ladder of `rdf:first`/`rdf:rest` blank nodes,
and `()` is the empty sequence, not `rdf:nil`. The sibling forks are listed in the README;
this fork of shex.js is the ShEx- side.

## The Collection shape expression

```shex
((shapeExpr))            # a sequence, of any length, of nodes conforming to shapeExpr
((shapeExpr))[m]         # exactly m elements
((shapeExpr))[m, n]      # from m to n elements
((shapeExpr))[m, *]      # at least m elements  (also written [m,])
```

A Collection is a shape atom: it takes `NOT`, `AND` and `OR`, nests (`((((LITERAL))[2]))` is a
sequence of pairs), is a triple constraint's value or an `EXTENDS` target, and may be the top
of a shape declaration. `((x))` is always a Collection and `(x)` a parenthesised shape
expression, in both the shex.js parser (`packages/shex-parser/lib/ShExJison.jison`) and the
lezer grammar (lezer-shexc-array): at `( ( x ) · )` both shift the Collection's closing paren
rather than reduce the inner `( x )`. To keep the jison grammar LR(1) the optional `NOT` before
a shape atom is spelled out as two alternatives instead of an empty production (otherwise
`((` would need a reduce-or-shift decision on the second paren).

Semantics: the focus node conforms iff it is a sequence, its length is within the bounds, and
every element conforms to `shapeExpr` (each element is a focus node of its own, like a triple
constraint's value). A sequence satisfies no `nodeKind` (`IRI`, `BNODE`, `LITERAL`,
`NONLITERAL` all fail with a `NodeKindMismatch` whose `actual` is `"sequence"`) but does match `.`.

## ShExJ

```json
{ "type": "Collection", "shapeExpr": { "type": "NodeConstraint", "nodeKind": "literal" }, "min": 3, "max": 3 }
```

`min` and `max` are optional (absent: unbounded; `max` is `-1` for `*`). `Collection` is in the
`shapeExpr` union of the forked `@types/shexj` (`types/shexj/`, wired by an `overrides` entry), and
`objectValue` gains `objectValue[]`: a sequence node in a shape map, a result or an error is the
JSON array of its elements, e.g. `[{"value": "1", "type": "…#integer"}, "http://a.example/x"]`.
`@shexjs/term` converts between that, RDF/JS `Sequence` terms (`sequenceTerm(elements)`,
`ld2RdfJsTerm`, `rdfJsTerm2Ld`) and Turtle `( … )`.

## Validation results (shexv)

| type | meaning |
|---|---|
| `CollectionResults` | `{node, solutions}`: one result per element, in order |
| `CollectionFailure` | `{node, errors}`: one of the following |
| `SequenceExpected` | the focus is not a sequence (`actual` is its termType) |
| `CollectionLengthViolation` | `{min, max, length}` |
| `CollectionElementFailure` | `{index, errors}`: the element at `index` failed |

`ShExUtil.errsToSimple` renders them as `validating (…) as a collection:` with the element
failures nested under `element N:`. The proof graph, semantic-action bindings (`walkVal`),
the reduce extension and the SPARQL/predicate walkers descend into collections; the ShExR
reader knows `sx:Collection` with `sx:min`/`sx:max`.

## ShExR: schemas written as RDF

The spec's `ShExR.shex` matches lists as `rdf:first`/`rdf:rest` ladders
(`@<#ShapeDeclList1Plus>` …), which under RDF- match nothing, so this fork's
`packages/shex-util/ShExR.shex` is *derived* from the spec's by
`tools/shexr-rdf-array.js`: every ladder reference becomes a Collection
(`sx:shapes ((@<#ShapeDecl>))[1, *]`, `sx:shapeExprs ((@<#shapeDeclOrExpr>))[2, *]`,
`sx:exclusion ((IRI OR @<#IriStem>))[1, *]` …), the ladder shapes go, `<#Collection>`
joins the shapeExpr union, and `<#objectValue>` admits a sequence of object values (the
spec's own `doc/ShExR.ttl` writes `rdf:nil` as `( )`, which is the empty sequence under
RDF-). `packages/shex-util/test/ShExRSchema-test.js` checks the derivation against the
shexTest checkout. `ShExUtil.walkVal` reads a `CollectionResults` as one list member
per element, so `ShExRtoShExJ` and the reduce-based reader
(`packages/extension-reduce/examples/shexr`) read the shexTest corpus's `.ttl` schemas as
before; the reader's per-list-shape actions are gone (a `CollectionResults` reduces to the
array of its elements' values).

## Dependencies

`package.json`'s `overrides` pin `n3`, `@rdfjs/types`, `lezer-shexc` and `lezer-turtle` to the
rdf-array forks (GitHub branch `rdf-sequences`) and `@types/shexj` to `types/shexj/`. `npm install`
builds N3.js-array from source (its `prepare` script).

## Tests

`npm test` (the ungated suite) passes; `TEST_cli`/`TEST_server` were run too. What is
skipped or expected to differ, each with its reason in the test file:

- **shexTest validation, 6 tests × 2 engines**: `1list0PlusDot`, `1list0PlusIri`,
  `1list1PlusIri` against `In1_Ip1_list_*.ttl` — ladder shapes over data written
  `( ... )`, one sequence term under RDF-. Their ShEx- forms are `((.))`, `((IRI))`,
  `((IRI))[1, *]`; the `manualList` data (explicit `rdf:first` triples) still passes.
- **shexTest ShExR fixtures, 9 files**: `1list0PlusDot.ttl`, `1list0PlusIri.ttl`,
  `1list1PlusIri.ttl` and `doc/ShExR.ttl` write a value-set member `rdf:nil` as `( )`
  (under RDF- the value set then holds the empty sequence, so the ShExJ differs);
  `1val1DECIMAL.ttl`, `1val1DOUBLE.ttl`, `1val1DOUBLElowercase.ttl`, `1val1INTEGER.ttl`,
  `1val1false.ttl` hand-write `sx:values [ rdf:first … ; rdf:rest () ]`, a ladder where
  one sequence is expected. Fixture issues: `( rdf:nil )` would read as intended.
- **shape-path-core's issue example** (`spquery-test`, one README example): its schema
  describes `:discussion` with a ladder shape over `( ... )` data; the example lives in a
  dependency.
- **Known hazard**: a Collection reports every failing element, each with the failures of
  every `OR` alternative, so a failing ShExR document produces a large error tree (the
  validator's cached results are shared, so `JSON.stringify` of it can be very slow).

## Not done

- The ShapeMap parser (`packages/shape-map`) has no syntax for a sequence node selector; give
  the node as a JSON array through the API (`validateShapeMap([{node: [...], shape}])`).
- The materializer (`extension-map`) refuses Collection shape expressions.
- ShExJ → ShExR writing of a Collection (`[ a sx:Collection ; sx:shapeExpr … ; sx:min … ]`) comes
  out of ShExRWriter's generic key table but is not exercised; the ShExR reader is.
- The web app and editor services run with the forked grammars but have no Collection-specific UI.
- `shexTest` has no RDF- tests; the Collection tests are the package-local `Collection-test.js`
  files in shex-parser, shex-writer, shex-validator, plus shex-term's and shex-visitor's.
