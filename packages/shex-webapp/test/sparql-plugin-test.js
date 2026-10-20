/** The SPARQL plugin on the app page, loaded the way its manifest loads it
 * (`plugins: ../doc/ShExSparqlPlugin.js`): a query where the schema is, run
 * over the data pane, answered in a results tab of its own -- a table for
 * a SELECT, Turtle for a CONSTRUCT or DESCRIBE, a green true or a red false
 * for an ASK.
 */
"use strict";

const TEST_browser = require("../../shex-cli/test/testGate.js")("TEST_browser");

const Path = require("path");
const expect = require("chai").expect;
let Harness;

const {testPort} = require("../../../tools/testPorts");
const [[GitRootServer]] = require("../../../tools/testServer")
      .startServer(
        [ { url: `http://localhost:${testPort(9999)}/shex.js/`,
            fromDir: Path.join(__dirname, "../../..") }
        ]
      );

const PAGE = "packages/shex-webapp/doc/shex.html";
const SPARQL_ID = "http://shex.io/extensions/SPARQL/";

if (!TEST_browser) {
  console.warn("Skipping sparql-plugin-tests; to activate these tests, set environment variable TEST_browser=true");
} else {
  Harness = require("./harness");

  describe("the SPARQL plugin", function () {
    this.timeout(30000);
    let dom, $, shared;

    before(async function () {
      ({dom, $, shared} = await Harness.boot(
        PAGE, "?editors=textarea&manifestURL=" + encodeURIComponent(
          "../../extension-sparql/examples/manifest.yaml")));
    });
    after(function () { if (dom) dom.window.close(); });

    /** pick the manifest's entry by its data label */
    async function pick (dataLabel) {
      const schemaLi = $("#inputSchema .manifest li").first();
      if (!schemaLi.hasClass("selected")) {
        schemaLi.trigger("click");
        await shared.promise;
      }
      const dataLi = $("#inputData .passes li")
            .filter((i, li) => $(li).text() === dataLabel).first();
      expect(dataLi.length, `"${dataLabel}" is listed`).to.equal(1);
      dataLi.trigger("click");
      await shared.promise;
    }

    async function run () {
      $("#runSparql").trigger("click");
      await shared.promise;
    }

    it("should load the plugin the entries name, with a screen of its own", async function () {
      await pick("every triple");
      expect(dom.window.ShExPlugins.all().map(e => e.id)).to.deep.equal([SPARQL_ID]);
      expect($("#screenTabs button").map((i, b) => $(b).text()).get().join(" "))
        .to.include("SPARQL");
    });

    it("should put the entry's query in the query pane", async function () {
      await pick("every triple");
      expect($("#sparqlQuery textarea").val()).to.match(/SELECT \?s \?p \?o\s+WHERE \{ \?s \?p \?o \}/);
    });

    it("should answer a SELECT as a table, a sequence being one cell", async function () {
      await pick("every triple");
      await run();
      const cells = $("#sparqlResults table.sparqlTable td").map((i, td) => $(td).text()).get();
      expect(cells).to.include("(255 0 0)");
      expect($("#sparqlResults table.sparqlTable th").map((i, th) => $(th).text()).get())
        .to.deep.equal(["?s", "?p", "?o"]);
    });

    it("should shade a variable a row leaves unbound", async function () {
      await pick("the colours, as a table");
      await run();
      expect($("#sparqlResults td.unbound").length).to.equal(1);
    });

    it("should answer a CONSTRUCT as Turtle", async function () {
      await pick("a CONSTRUCT, as Turtle");
      await run();
      const turtle = $("#sparqlResults pre.sparqlTurtle").text();
      expect(turtle).to.include("(255 0 0)");          // a sequence, not a ladder
      expect(turtle).to.match(/:paint \[\s+:brand "Acme"/);   // the single-use blank node, nested
    });

    it("should answer a DESCRIBE as Turtle", async function () {
      await pick("a DESCRIBE, as Turtle");
      await run();
      expect($("#sparqlResults pre.sparqlTurtle").text()).to.include("(0 255 0)");
    });

    it("should answer an ASK with a green true", async function () {
      await pick("an ASK that is true");
      await run();
      const ask = $("#sparqlResults .sparqlAsk");
      expect(ask.text()).to.equal("true");
      expect(ask.hasClass("sparqlTrue")).to.equal(true);
    });

    it("should answer an ASK with a red false", async function () {
      await pick("an ASK that is false");
      await run();
      const ask = $("#sparqlResults .sparqlAsk");
      expect(ask.text()).to.equal("false");
      expect(ask.hasClass("sparqlFalse")).to.equal(true);
    });
  });

  /* The app's own examples: each RDF- schema has a SPARQL entry that shows
   * exactly which triples the data holds -- sequences as terms, not ladders */
  describe("the RDF- schemas' SPARQL entries", function () {
    this.timeout(30000);
    let dom, $, shared;

    before(async function () {
      ({dom, $, shared} = await Harness.boot(PAGE, "?editors=textarea"));
    });
    after(function () { if (dom) dom.window.close(); });

    [{schemaLabel: "RDF-: a colour is three bytes", ofSequence: /^\(255 0 0\)$/},
     {schemaLabel: "RDF-: a polygon is three or more points", ofSequence: /^\(\(0\.0 0\.0\) \(4\.0 0\.0\) \(0\.0 3\.0\)\)$/},
     {schemaLabel: "RDF-: a playlist of tracks", ofSequence: /^\(<[^>]*\/t1> <[^>]*\/t2>\)$/},
     {schemaLabel: "RDF-: a bag of anything", ofSequence: /^\(\)$/},
    ].forEach(({schemaLabel, ofSequence}) =>
      it(`should list every triple of "${schemaLabel}", its sequence one term`, async function () {
        const schemaLi = $("#inputSchema .manifest li")
              .filter((i, li) => $(li).text() === schemaLabel).first();
        expect(schemaLi.length, "the schema is listed").to.equal(1);
        if (!schemaLi.hasClass("selected")) {
          schemaLi.trigger("click");
          await shared.promise;
        }
        const dataLi = $("#inputData .passes li, #inputData .fails li, #inputData .indeterminant li")
              .filter((i, li) => /every triple \(SPARQL\)$/.test($(li).text())).first();
        expect(dataLi.length, "the SPARQL entry is listed in " + $("#inputData .passes li, #inputData .fails li, #inputData .indeterminant li").map((i, li) => $(li).text()).get().join(" | ")).to.equal(1);
        dataLi.trigger("click");
        await shared.promise;
        expect($("#sparqlQuery textarea").val()).to.include("?s ?p ?o");
        $("#runSparql").trigger("click");
        await shared.promise;
        const cells = $("#sparqlResults table.sparqlTable td").map((i, td) => $(td).text()).get();
        expect(cells.some(c => ofSequence.test(c)), `${ofSequence} in ${JSON.stringify(cells)}`).to.equal(true);
      }));
  });
}
