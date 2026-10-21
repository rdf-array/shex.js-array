"use strict";
const Assert = require("assert");
const Fs = require("fs");
const Path = require("path");
const N3 = require("n3");
const JsYaml = require("js-yaml");
const ShExParser = require("@shexjs/parser");
const {ctor: RdfJsDb} = require("@shexjs/neighborhood-rdfjs");
const {ShExValidator} = require("@shexjs/validator");
const Sparql = require("..");

const PREFIXES = {"": "http://a.example/"};
const DATA = `
PREFIX : <http://a.example/>
:red :rgb (255 0 0) ; :name "red\\nish" .
:pair :xy ([ :x 1 ] 2) .
`;

function store () {
  return new N3.Store(new N3.Parser({format: "text/turtle"}).parse(DATA));
}

describe("extension-sparql", function () {
  this.timeout(30000);

  it("SELECT answers a table, a sequence being one cell", async () => {
    const a = await Sparql.run(store(), "PREFIX : <http://a.example/> SELECT ?c ?rgb WHERE { ?c :rgb ?rgb }");
    Assert.strictEqual(a.kind, "select");
    Assert.deepStrictEqual(a.vars, ["c", "rgb"]);
    Assert.strictEqual(a.rows.length, 1);
    Assert.strictEqual(a.rows[0][1].termType, "Sequence");
    Assert.strictEqual(Sparql.termToTurtle(a.rows[0][1], PREFIXES), "(255 0 0)");
    Assert.strictEqual(Sparql.termToTurtle(a.rows[0][0], PREFIXES), ":red");
  });

  it("?s ?p ?o shows every triple, sequences intact", async () => {
    const a = await Sparql.run(store(), "SELECT * WHERE { ?s ?p ?o }");
    Assert.strictEqual(a.rows.length, 4);
    const objects = a.rows.map(r => Sparql.termToTurtle(r[a.vars.indexOf("o")], PREFIXES)).sort();
    Assert.ok(objects.includes("(255 0 0)"), objects.join(" | "));
  });

  it("matches a sequence by writing one in a pattern, binding variables from its members", async () => {
    // comunica-array: ( ) in a pattern is a sequence term, not a first/rest ladder
    Assert.deepStrictEqual(await Sparql.run(store(), "PREFIX : <http://a.example/> ASK { ?c :rgb (255 0 0) }"),
                           {kind: "ask", boolean: true});
    const a = await Sparql.run(store(), "PREFIX : <http://a.example/> SELECT ?g WHERE { ?c :rgb (255 ?g 0) }");
    Assert.deepStrictEqual(a.rows.map(r => r[0].value), ["0"]);
  });

  it("leaves a variable a row doesn't bind as null", async () => {
    const a = await Sparql.run(store(),
      "PREFIX : <http://a.example/> SELECT ?c ?n WHERE { ?c :rgb ?x OPTIONAL { ?c :nope ?n } }");
    Assert.strictEqual(a.rows[0][1], null);
  });

  it("ASK answers a boolean", async () => {
    Assert.deepStrictEqual(await Sparql.run(store(), "PREFIX : <http://a.example/> ASK { :red :rgb ?x }"),
                           {kind: "ask", boolean: true});
    Assert.deepStrictEqual(await Sparql.run(store(), "PREFIX : <http://a.example/> ASK { :blue :rgb ?x }"),
                           {kind: "ask", boolean: false});
  });

  it("CONSTRUCT answers a graph, written as Turtle", async () => {
    const text = "PREFIX : <http://a.example/> CONSTRUCT { ?c :rgb ?x } WHERE { ?c :rgb ?x }";
    const a = await Sparql.run(store(), text);
    Assert.strictEqual(a.kind, "graph");
    Assert.strictEqual(a.quads.length, 1);
    const ttl = await Sparql.toTurtle(a.quads, {...PREFIXES, ...Sparql.queryPrefixes(text)});
    Assert.match(ttl, /:red :rgb \(255 0 0\)/);
    // it reads back as the same graph
    const back = new N3.Store(new N3.Parser({format: "text/turtle"}).parse(ttl));
    Assert.strictEqual(back.size, 1);
  });

  it("DESCRIBE answers a graph", async () => {
    const a = await Sparql.run(store(), "DESCRIBE <http://a.example/red>");
    Assert.strictEqual(a.kind, "graph");
    Assert.ok(a.quads.length >= 1);
  });

  it("toTurtle nests single-use blank nodes, including inside a sequence", async () => {
    const quads = store().getQuads(null, null, null, null)
          .filter(q => q.subject.value !== "http://a.example/red");
    const ttl = await Sparql.toTurtle(quads, PREFIXES);
    Assert.doesNotMatch(ttl, /_:/);
    Assert.match(ttl, /\(\[/);
  });

  it("CONSTRUCT's bc_ blank-node prefix doesn't stop a sequence's blank node nesting", async () => {
    const ds = new N3.Store(new N3.Parser({baseIRI: "http://a.example/"})
                            .parse("<red> <http://a.example/rgb> (255 0 [ <http://a.example/p> <http://a.example/o> ]) ."));
    const r = await Sparql.run(ds, "CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }");
    const ttl = await Sparql.toTurtle(r.quads, PREFIXES);
    Assert.doesNotMatch(ttl, /_:/);
    Assert.match(ttl, /^PREFIX : <http:\/\/a\.example\/>$/m);
    Assert.match(ttl, /:rgb \(255 0 \[\n\s+:p :o\n\s*\]\) \.$/m);
  });

  it("toTurtle relativizes IRIs to a base, but not those a prefix names or on other hosts", async () => {
    const f = N3.DataFactory;
    const q = (s, o) => f.quad(f.namedNode(s), f.namedNode("http://a.example/p"), f.namedNode(o));
    const ttl = await Sparql.toTurtle([q("http://h/d/red", "http://a.example/x"), q("http://h/d/blue", "http://other/y")],
                                      PREFIXES, "http://h/d/manifest.json");
    Assert.match(ttl, /^<red> :p :x \.$/m);
    Assert.match(ttl, /^<blue> :p <http:\/\/other\/y> \.$/m);
  });

  it("toTurtle expands multi-line literals", async () => {
    const quads = store().getQuads(null, N3.DataFactory.namedNode("http://a.example/name"), null, null);
    Assert.match(await Sparql.toTurtle(quads, PREFIXES), /"""red\nish"""/);
  });

  it("runs over a data source's querySource: a dataset in place", async () => {
    const source = {kind: "rdfjs", dataset: store()};
    const a = await Sparql.runSource(source, "PREFIX : <http://a.example/> ASK { :red :name ?n }");
    Assert.deepStrictEqual(a, {kind: "ask", boolean: true});
  });

  it("...and an endpoint is sent the query, answering rows or a boolean", async () => {
    const asked = [];
    const rows = {kind: "endpoint", endpoint: "http://e.example/sparql", query: async text => {
      asked.push(text);
      return {vars: ["x"], rows: [[N3.DataFactory.namedNode("http://a.example/red")]]};
    }};
    Assert.deepStrictEqual(await Sparql.runSource(rows, "SELECT ?x WHERE { ?x ?p ?o }"),
                           {kind: "select", vars: ["x"], rows: [[N3.DataFactory.namedNode("http://a.example/red")]]});
    const bool = {kind: "endpoint", endpoint: "http://e.example/sparql", query: async () => ({boolean: false})};
    Assert.deepStrictEqual(await Sparql.runSource(bool, "ASK { ?x ?p ?o }"), {kind: "ask", boolean: false});
    Assert.strictEqual(asked.length, 1);
  });

  it("refuses an update", async () => {
    await Assert.rejects(Sparql.run(store(), "INSERT DATA { <http://a/x> <http://a/p> 1 }"));
  });

  /* what the WebApp shows off: every entry's schema still validates its
   * data, and its query answers the kind of answer the label promises */
  describe("the examples manifest", function () {
    const manifest = JsYaml.load(Fs.readFileSync(Path.join(__dirname, "../examples/manifest.yaml"), "utf8"));
    const KINDS = {
      "every triple": "select",
      "the colours, as a table": "select",
      "a CONSTRUCT, as Turtle": "graph",
      "a DESCRIBE, as Turtle": "graph",
      "an ASK that is true": "ask",
      "an ASK that is false": "ask",
    };
    manifest.forEach(entry => {
      it(`should answer "${entry.dataLabel}" as a ${KINDS[entry.dataLabel]}`, async () => {
        Assert.deepStrictEqual(entry.plugins, ["../doc/ShExSparqlPlugin.js"]);
        const data = new N3.Store(new N3.Parser({format: "text/turtle"}).parse(entry.data));
        // the schema still validates the data (the entry's status)
        const schema = ShExParser.construct("http://a.example/", {}, {index: true}).parse(entry.schema);
        const v = new ShExValidator(schema, RdfJsDb(data), {});
        entry.queryMap.split(",").forEach(pair => {
          const [, node, shape] = pair.trim().match(/^<([^>]+)>@<([^>]+)>$/);
          Assert.strictEqual(v.validateShapeMap([{node, shape}])[0].status, entry.status);
        });
        const answer = await Sparql.run(data, entry.query);
        Assert.strictEqual(answer.kind, KINDS[entry.dataLabel]);
        if (answer.kind === "ask")
          Assert.strictEqual(answer.boolean, entry.dataLabel.endsWith("true"));
        if (answer.kind === "graph")
          Assert.ok(answer.quads.length > 0);
        if (entry.dataLabel === "every triple")
          Assert.ok(answer.rows.some(r => Sparql.termToTurtle(r[2], {"": "http://a.example/"}) === "(255 0 0)"));
      });
    });
  });
});
