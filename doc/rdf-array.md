# shex.js-array: ShEx over rdf-array (sequences as terms)

rdf-array is RDF whose data model has a fifth kind of term, the **sequence**: `(1 2 3)` in Turtle-array
is one term holding its members in order, not a ladder of `rdf:first`/`rdf:rest` blank nodes,
and `()` is the empty sequence, not `rdf:nil`. The sibling forks are listed in the README;
this fork of shex.js is the ShEx-array side. The syntax is the one
[array-syntax.md](https://github.com/rdf-array/rdf-array/blob/main/docs/array-syntax.md) proposes (its
variant G, §2); its §7 strawman fixes the ShExJ, ShExR and result names that every fork shares.

## The LIST shape expression

```shex
LIST ( regex )           # a sequence whose members, in order, match the regular expression
LIST card shapeAtom      # short for LIST ( shapeAtom card ): card members, each conforming
```

The regular expression's atoms are shape expressions, and `;` (concatenation), `|` (choice), `( … )`
(a group) and cardinalities (`*`, `+`, `?`, `{m}`, `{m,n}`, `{m,}`) combine them as they combine triple
constraints in a triple expression, with one difference: here `;` is ordered.

```shex
<Ints>      LIST * xsd:integer                                   # any number of integers
<Tracks>    LIST + @<Track>                                      # a non-empty list of tracks
<Matrix>    LIST {2} LIST {3} xsd:integer                        # a 2×3 matrix
<Pair>      LIST ( xsd:string ; xsd:integer )                    # a string, then an integer
<Pairs>     LIST ( ( xsd:string ; xsd:integer ) * )              # pairs flattened into one list
<Component> LIST ( xsd:string ; xsd:string ; LIST ( xsd:integer ; xsd:string ) )
<Tree>      LIST ( xsd:string ; LIST ( @<Tree> * ) )             # a label and its children
<Mixed>     LIST ( ( xsd:integer | LIST ( xsd:integer ; xsd:integer ) ) + )
```

`LIST` is a shape atom: it takes `NOT`, `AND` and `OR`, nests, is a triple constraint's value, and may be
the top of a shape declaration; it is not an `EXTENDS` target (`EXTENDS LIST <S> { … }` would be ambiguous).
The cardinality comes first in `LIST card x` because after the value expression it would count triples:
`:p LIST * xsd:integer {1,2}` and `:p LIST ( xsd:integer * ) {1,2}` both say one or two `:p` triples. A
bare `LIST x` is a syntax error (`(`, `*`, `+`, `?` or `{m,n}` expected). Inside `LIST ( )` a `(` always
opens a group, so a member's first atom is never parenthesised: `LIST ( ( @<A> ) AND @<B> )` is a syntax
error; write `LIST ( @<A> AND @<B> )` or `LIST ( @<B> AND ( @<A> ) )`. The grammar is
`packages/shex-parser/lib/ShExJison.jison` (`listShape` … `listMemberAtom`, with `IT_LIST`), built as
canonical LR(1) by ts-jison with no conflicts.

Semantics: the focus node conforms iff it is a sequence and its members, in order, match the expression,
each member a focus node of its own (like a triple constraint's value). A sequence satisfies no `nodeKind`
(`IRI`, `BNODE`, `LITERAL`, `NONLITERAL` all fail with a `NodeKindMismatch` whose `actual` is
`"sequence"`) but does match `.`; `LIST * .` accepts `()`, `LIST + .` does not.

## ShExJ

```json
{ "type": "ListShape", "expression": listExpr }
listExpr   = Member | ListEachOf | ListOneOf
Member     = { "type": "Member",     "shapeExpr": shapeExpr,        "min": m, "max": n }
ListEachOf = { "type": "ListEachOf", "expressions": [ listExpr… ], "min": m, "max": n }
ListOneOf  = { "type": "ListOneOf",  "expressions": [ listExpr… ], "min": m, "max": n }
```

`min` and `max` are as on triple expressions: absent means 1, `-1` unbounded. `LIST card x` and
`LIST ( x card )` give the same ShExJ, a `Member` with the cardinality. A cardinality on a group sets the
group's `min`/`max`; when the group already has one, `( x {2} ) {3}`, it is wrapped in a `ListEachOf` of
one. A group's nesting is kept (`( a ; b ) ; c` is a `ListEachOf` inside a `ListEachOf`, as a triple
expression's would be), so ShExJ round-trips through ShExC exactly. `ListEachOf`/`ListOneOf` are named
apart from `EachOf`/`OneOf` because the first is ordered. `ListShape` is in the `shapeExpr` union of the
forked `@types/shexj` (`types/shexj/`, wired by an `overrides` entry), with `listExpr`, `Member`,
`ListEachOf` and `ListOneOf`; `objectValue` gains `objectValue[]`: a sequence node in a shape map, a
result or an error is the JSON array of its members. `@shexjs/term` converts between that, RDF/JS
`Sequence` terms and Turtle `( … )`.

## Validation

The validator (`packages/shex-validator/src/shex-validator.ts`, `ListMatcher`) compiles the expression to
an NFA whose transitions each validate one member against one `Member`'s shape expression, and runs the
sequence through it as a set of states: linear in the sequence and the automaton however the expression
nests, each (member, `Member`) pair validated at most once, with a back-pointer per state to recover which
`Member` matched each member. Counted repetitions unroll; `-1` loops. Both regex engines
(`eval-threaded-nerr`, `eval-simple-1err`) see the same code, since it is the validator's own.

| type | meaning |
|---|---|
| `ListShapeResults` | `{node, solutions}`: one result per member, in order, from the `Member` that matched it |
| `ListShapeFailure` | `{node, errors}`: one or more of the following |
| `SequenceExpected` | the focus is not a sequence (`actual` is its termType) |
| `ListMemberFailure` | `{index, errors}`: the member at `index` conforms to none of the `Member`s tried on it (each one's failure is listed); with a single-`Member` expression, every such member is reported |
| `ListLengthViolation` | `{min, max, length, message}`: every member tried passes, but their number or arrangement does not fit; `min`/`max` are the fewest and most members the expression matches, and the message says `… where 2 expected`, `… where the list expression matches only the first N` or `… where the list expression wants more` |

`ShExUtil.errsToSimple` renders them as `validating (…) as a list:` with `member N:` nested. The proof
graph, semantic-action bindings (`walkVal`, which binds through every `Member`), the reduce extension
(a `ListShapeResults` reduces to the array of its members' values) and the SPARQL/predicate walkers
descend into lists.

## ShExR: schemas written as RDF

`sx:ListShape` with `sx:expression`; `sx:Member` with `sx:shapeExpr`, `sx:min`, `sx:max`; `sx:ListEachOf`
and `sx:ListOneOf` with `sx:expressions ( … )`, `sx:min`, `sx:max`. The spec's `ShExR.shex` matches lists
as `rdf:first`/`rdf:rest` ladders (`@<#ShapeDeclList1Plus>` …), which under rdf-array match nothing, so this
fork's `packages/shex-util/ShExR.shex` is *derived* from the spec's by `tools/shexr-rdf-array.js`: every
ladder reference becomes a LIST (`sx:shapes LIST + @<#ShapeDecl>`, `sx:shapeExprs LIST {2,}
@<#shapeDeclOrExpr>`, `sx:exclusion LIST + ( IRI OR @<#IriStem> )` …), the ladder shapes go,
`<#ListShape>`, `<#listExpr>`, `<#Member>`, `<#ListEachOf>` and `<#ListOneOf>` are added, and
`<#objectValue>` admits a sequence of object values. `packages/shex-util/test/ShExRSchema-test.js` checks
the derivation against an unconverted copy of the spec's (`SHEXTEST_UPSTREAM` or `../../shexSpec/shexTest`).
shexTest-array's own `doc/ShExR.shex` says the same with the ladder productions kept as named LIST shapes
(`<#ShapeDeclList1Plus> LIST + @<#ShapeDecl>`); the two read the same documents. `ShExUtil.valuesToSchema`
reads `sx:ListShape` (`listExpr` beside `tripleExpr`), `ShExRWriter` writes it through its generic key
table (`expression`, `expressions`, `shapeExpr`, `min`, `max`), and the reduce-based reader
(`packages/extension-reduce/examples/shexr/shexr-actions.ttl`) has actions for the four classes.

## Dependencies

`package.json`'s `overrides` pin `n3`, `@rdfjs/types`, `lezer-shexc` and `lezer-turtle` to the
rdf-array forks (GitHub branch `rdf-sequences`) and `@types/shexj` to `types/shexj/`. `npm install`
builds N3.js-array from source (its `prepare` script).

## Tests

The corpus is [shexTest-array](https://github.com/rdf-array/shexTest-array) (the `shex-test`
devDependency, a sibling `../shexTest-array`, or `../shexTest`, where CI clones it), whose list schemas
(`1list0PlusDot` …) are `LIST * .`, `LIST * IRI`, `LIST + IRI`; `packages/shex-cli/test/findPath.js` looks
there before an upstream `../../shexSpec/shexTest`. The shared
[shexTest-contrib](https://github.com/rdf-array/shexTest-contrib) tests run beside it (the
`shex-test-contrib` devDependency, or `SHEXTEST_CONTRIB`, or a sibling `../shexTest-contrib`, found by
`findContribPath.js`): its LIST schemas through the parser/writer/ShExR tests (`Parser-Writer-test.js`),
its negative syntax tests, and its validation tests with both engines (`ValidationContrib-test.js`).

The package-local LIST tests are `ListShape-test.js` in shex-parser (the grammar, the design note's
§4.2 parses and §5 edge cases), shex-writer (`LIST card x` / `LIST ( … )`, round trips) and
shex-validator (§4.2's verdicts under both engines, the failure types), plus shex-visitor's and
shex-term's. `packages/shex-validator/test/val/1list*.val` are the corpus's results
(`ListShapeResults`, one solution per member; `REGEN=1` re-records them).

## Not done

- The ShapeMap parser (`packages/shape-map`) has no syntax for a sequence node selector; give
  the node as a JSON array through the API (`validateShapeMap([{node: [...], shape}])`).
- The materializer (`extension-map`) refuses LIST shape expressions.
- The web app and editor services run with the forked grammars but have no LIST-specific UI, and the
  editor grammar ([lezer-shexc-array](https://github.com/rdf-array/lezer-shexc-array)) still parses the
  old `((x))[m, n]`: it has to be rewritten for `LIST`.
- The ShExC writer cannot spell a `Member` whose shape expression is a conjunction or disjunction of
  parenthesised junctions only (`( A OR B ) AND ( B OR C )`), since a member cannot open with `(`; it
  reorders when some operand can lead, and otherwise refuses.
- A `ListMemberFailure` lists the failures of every `Member` tried on that member, so a `|` of many
  alternatives over a long list produces a large error tree.
