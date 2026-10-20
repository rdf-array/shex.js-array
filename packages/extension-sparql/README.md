# @shexjs/extension-sparql

SPARQL queries over the web app's data, `http://shex.io/extensions/SPARQL/`.
(Not to be confused with `@shexjs/neighborhood-sparql`, which reads a
*data source* from an endpoint, nor with `@shexjs/extension-shacl-sparql`,
which runs SPARQL *as a ShEx semantic action*.  This one is a screen of the
web app that asks the data a question.)

The plugin adds a **SPARQL** screen to `shex.html`:

- a query pane where the schema usually is, and the data pane beside it,
  borrowed from the validator's screen: the data you were validating;
- `run query (ctl-/)`, which answers in a results tab of its own:

| query form | answer |
|---|---|
| `SELECT` | a table, a column per variable, each term as Turtle (a variable a row leaves unbound is a shaded cell) |
| `CONSTRUCT`, `DESCRIBE` | the graph as Turtle |
| `ASK` | a green **true** or a red **false** |

Turtle is written by [n3writer-wrapper](https://github.com/ericprud/n3writer-wrapper)
over N3.js's `Writer`: single-use blank nodes nested as `[ ]`, one indent step at
every depth, multi-line literals as `"""…"""`.

## RDF- (sequences as terms)

This fork of shex.js reads `(255 0 0)` as **one term**, a sequence, not a ladder of
`rdf:first`/`rdf:rest` blank nodes (see [`doc/rdf-array.md`](../../doc/rdf-array.md)).
The query runner and the writers are the RDF- forks (`n3`, and
[`n3writer-wrapper-array`](https://github.com/rdf-array/n3writer-wrapper-array)),
so `SELECT ?s ?p ?o WHERE { ?s ?p ?o }` shows exactly the triples the data holds,
and a sequence is one cell, `(255 0 0)`, and one `?o`.  Each of the RDF- schemas
in the app's example manifest has a "every triple (SPARQL)" entry that does this.

SPARQL itself doesn't know sequences, which has two consequences:

- a `( … )` in a query pattern is SPARQL's collection syntax, a first/rest ladder,
  so it **doesn't match a sequence** in the data (`ASK { ?c :rgb (255 0 0) }` is
  false); bind the sequence to a variable instead;
- a query can't look *inside* a sequence: its members can't be reached, so a
  `CONSTRUCT` copies a sequence whole (a blank node among its members arrives
  as a dangling `_:` label).

## Using it

```
packages/shex-webapp/doc/shex.html?manifestURL=../../extension-sparql/examples/manifest.yaml
```

or `?plugin=<url of doc/ShExSparqlPlugin.js>` and type a query (`?query=` fills the
pane; a manifest entry's `query:` does too).

The query runs in the page, with [Comunica](https://comunica.dev/) over the data
source's dataset.  A SPARQL data source (an endpoint) is sent the query instead and
answers rows or a boolean, so a `CONSTRUCT` or `DESCRIBE` needs the documents.  An
update (`INSERT`, `DELETE`, …) is refused.  The plugin's bundle
(`doc/webpacks/shexsparql-webapp.js`, built with `npm run webpack`) carries Comunica,
about 3 MB minified.

## As a library

```js
const Sparql = require("@shexjs/extension-sparql");

const answer = await Sparql.run(store, "SELECT * WHERE { ?s ?p ?o }");
// {kind: "select", vars, rows} | {kind: "ask", boolean} | {kind: "graph", quads}

await Sparql.toTurtle(quads, prefixes);      // a graph as readable Turtle
Sparql.termToTurtle(term, prefixes);         // one term, for a table cell
await Sparql.runSource(db.querySource(), text);   // a data source's own view
```
