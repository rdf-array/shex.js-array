/**
 * The SPARQL plugin: a SPARQL query where the schema usually is, run over
 * the data (doc/plugins.md).
 *
 * Its screen (the "SPARQL" tab) puts a query pane on the left, in the
 * schema's place, with the app's data pane beside it, borrowed: one pane,
 * one cache, one editor, so the data is the data you were validating.
 * Running the query (ctl-/) writes into a results tab of its own:
 *
 *   - SELECT: a table, one column per variable, each term written as Turtle
 *     with the data's and the query's prefixes;
 *   - CONSTRUCT, DESCRIBE: the graph as Turtle, as n3writer-wrapper writes
 *     it (single-use blank nodes nested, uniform indent), a sequence as
 *     `(255 0 0)`;
 *   - ASK: a green true or a red false.
 *
 * The query runs in the page, with Comunica over the data source's dataset,
 * or is sent to the endpoint a SPARQL data source names -- which answers
 * rows and booleans, so a CONSTRUCT or DESCRIBE needs the documents.  One
 * file; no worker half, since nothing here validates.
 */
(function () {
  const SPARQL_ID = "http://shex.io/extensions/SPARQL/";
  const BUNDLE = "webpacks/shexsparql-webapp.min.js";  // Comunica: ~3 MB minified
  const RESULTS_TAB = "sparqlResults";

  if (typeof ShExPlugins === "undefined")
    return;

  ShExPlugins.register({
    id: SPARQL_ID,
    label: "SPARQL",
    scripts: ["./" + BUNDLE],

    css: [
      "/* the query, where the schema is */",
      "#sparqlQuery textarea { font-family: monospace; background-color: #f4f8ff; border-color: #1c56fc }",
      "/* ...and what it found */",
      "#" + RESULTS_TAB + " table.sparqlTable { border-collapse: collapse; margin: .5em 0 }",
      "#" + RESULTS_TAB + " table.sparqlTable th, #" + RESULTS_TAB + " table.sparqlTable td {",
      "  border: 1px solid #ccc; padding: .2em .6em; text-align: left; vertical-align: top; font-family: monospace }",
      "#" + RESULTS_TAB + " table.sparqlTable th { background-color: #eef }",
      "#" + RESULTS_TAB + " table.sparqlTable td.unbound { background-color: #f4f4f4 }",
      "#" + RESULTS_TAB + " pre.sparqlTurtle { margin: .5em 0; white-space: pre-wrap }",
      "#" + RESULTS_TAB + " .sparqlAsk { font-size: 200%; font-weight: bold; margin: .3em 0 }",
      "#" + RESULTS_TAB + " .sparqlAsk.sparqlTrue { color: #080 }",
      "#" + RESULTS_TAB + " .sparqlAsk.sparqlFalse { color: #c00 }",
      "#inputarea { overflow-x: auto; }",
    ].join("\n"),

    panes: [
      // the query, in the schema's place on the validator's screen
      {name: "sparqlQuery", id: "sparqlQuery", kind: "text",
       fill: true, rows: 25, className: "schema droparea",
       queryStringParm: "query",
       manifest: {key: "query", spillName: "query.rq"}},
      // ...over the data the validator is looking at
      {name: "inputData", borrow: true},
    ],

    resultsTabs: [{id: RESULTS_TAB, label: "SPARQL"}],

    toolbar: [
      {kind: "button", id: "runSparql", label: "run query (ctl-/)",
       title: "run the query over the data",
       key: {ctrl: true, key: "/"},
       run: app => app.runSparql()},
    ],

    methods: {
      /** run the query in the pane over the data pane's store */
      async runSparql () {
        const Sparql = ShExWebApp.Sparql;
        const text = this.Caches.sparqlQuery.get();
        if (!text.trim())
          throw Error("there is no query to run");
        // the data source's own view: its dataset, or the endpoint it names
        const db = await this.Caches.inputData.refresh();
        if (typeof db.querySource !== "function")
          throw Error("this data source can't be queried (it has no querySource())");
        const source = db.querySource();
        // the data's prefixes, then the query's: what it said wins
        const prefixes = Object.assign({}, this.Caches.inputData.meta.prefixes,
                                       Sparql.queryPrefixes(text));
        const started = Date.now();
        const answer = await Sparql.runSource(source, text);
        const took = Date.now() - started;

        const show = $("<div/>");
        let summary;
        switch (answer.kind) {
        case "ask":
          show.append($("<div/>")
                      .addClass("sparqlAsk " + (answer.boolean ? "sparqlTrue" : "sparqlFalse"))
                      .text(String(answer.boolean)));
          summary = "ASK";
          break;
        case "select": {
          const format = Sparql.termFormatter(prefixes);
          const head = $("<tr/>").append(answer.vars.map(v => $("<th/>").text("?" + v)));
          const body = answer.rows.map(row => $("<tr/>").append(row.map(term =>
            term === null
              ? $("<td/>").addClass("unbound")
              : $("<td/>").text(format(term)))));
          show.append($("<table/>").addClass("sparqlTable")
                      .append($("<thead/>").append(head), $("<tbody/>").append(body)));
          summary = "SELECT: " + answer.rows.length + " row" + (answer.rows.length === 1 ? "" : "s");
          break;
        }
        case "graph": {
          const turtle = await Sparql.toTurtle(answer.quads, prefixes);
          show.append($("<pre/>").addClass("sparqlTurtle").text(turtle));
          summary = "CONSTRUCT/DESCRIBE: " + answer.quads.length
            + " triple" + (answer.quads.length === 1 ? "" : "s");
          break;
        }
        }
        this.showSparqlResults(show, summary + " in " + took + " ms");
      },

      /** Bring the SPARQL tab up with what the query found. */
      showSparqlResults (content, summary) {
        const tabs = $("#resultsTabs");
        if (tabs.find('[href="#' + RESULTS_TAB + '"]').length === 0)
          tabs.find("> ul").append(
            $("<li/>").append($("<a/>", {href: "#" + RESULTS_TAB}).text("SPARQL")));
        const panel = $("#" + RESULTS_TAB);
        panel.show();
        panel.children("div").empty().append(content);
        this.resultsTabStatus(RESULTS_TAB).text(summary);
        if (tabs.data("ui-tabs")) {
          tabs.tabs("refresh");
          this.showResultsTab(RESULTS_TAB);
        }
      },
    },

    /** a validation says nothing about the last query; leave the tab be.
     * The × on the screen tab takes the tab and the panes with the plugin. */
    unload (app) {
      $("#resultsTabs").find('[href="#' + RESULTS_TAB + '"]').closest("li").remove();
    },
  });
})();
