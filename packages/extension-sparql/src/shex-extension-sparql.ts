/**
 * SPARQL queries over RDF data, for the web app's SPARQL screen and for
 * anything else with a dataset in hand.
 *
 *   const answer = await run(dataset, "SELECT * WHERE { ?s ?p ?o }");
 *
 * The answer is one of
 *
 *   - {kind: "select", vars, rows}: a table; a row holds a term, or null for
 *     a variable the row leaves unbound;
 *   - {kind: "ask", boolean};
 *   - {kind: "graph", quads}: what a CONSTRUCT built or a DESCRIBE found.
 *
 * `toTurtle(quads, prefixes)` writes a graph as Turtle with n3writer-wrapper
 * (single-use blank nodes nested as [ ], one indent step at every depth,
 * multi-line literals as """…"""), and `termToTurtle` writes one term for a
 * table cell.  Both go through the RDF- (rdf-sequences) forks of N3.js and
 * n3writer-wrapper, so a sequence term comes out as `(255 0 0)`.
 *
 * Comunica queries a dataset in place, its default graph the union of all
 * its graphs.  An update (INSERT, DELETE, …) is refused: the data is the
 * reader's, and a query does not change it.
 */
import type * as RdfJs from "@rdfjs/types";
import type {QuerySource} from "@shexjs/neighborhood-api";
import {Parser as SparqlParser} from "sparqljs";
import {Writer} from "n3";
import {topoWrite, reindent, expandLiterals} from "n3writer-wrapper-array";

export const SparqlUrl = "http://shex.io/extensions/SPARQL/";
export const name = "SPARQL";

export type Prefixes = {[prefix: string]: string};

export type Answer =
  | {kind: "select", vars: string[], rows: (RdfJs.Term | null)[][]}
  | {kind: "ask", boolean: boolean}
  | {kind: "graph", quads: RdfJs.Quad[]};

let engine: any = null;

/** the prefixes a query declares, to write its answer with */
export function queryPrefixes (text: string): Prefixes {
  return {...(new SparqlParser().parse(text) as any).prefixes};
}

/** Run a query over a dataset (anything Comunica takes as a source: an
 * N3.Store, say). */
export async function run (dataset: any, text: string): Promise<Answer> {
  if (engine === null) {
    const {QueryEngine} = require("@comunica/query-sparql-rdfjs");
    engine = new QueryEngine();
  }
  const result = await engine.query(text, {sources: [dataset], unionDefaultGraph: true});
  switch (result.resultType) {
  case "boolean":
    return {kind: "ask", boolean: await result.execute()};
  case "bindings": {
    const vars: string[] = (await result.metadata()).variables
          .map((v: any) => v.variable !== undefined ? v.variable.value : v.value);
    const rows: (RdfJs.Term | null)[][] = [];
    for await (const binding of await result.execute())
      rows.push(vars.map(v => binding.get(v) || null));
    return {kind: "select", vars, rows};
  }
  case "quads": {
    const quads: RdfJs.Quad[] = [];
    for await (const quad of await result.execute())
      quads.push(quad);
    return {kind: "graph", quads};
  }
  default:
    throw Error(`a ${result.resultType} query changes data; this one only reads it`);
  }
}

/**
 * Run a query over what a data source says it can be queried as
 * (`db.querySource()`, @shexjs/neighborhood-api): a dataset is queried in
 * place; an endpoint is sent the query.  An endpoint answers rows or a
 * boolean, so a CONSTRUCT or DESCRIBE needs a dataset.
 */
export async function runSource (source: QuerySource, text: string): Promise<Answer> {
  if (source.kind === "rdfjs")
    return run(source.dataset, text);
  const answer = await source.query(text);
  return "boolean" in answer
    ? {kind: "ask", boolean: answer.boolean}
    : {kind: "select", vars: answer.vars, rows: answer.rows};
}

/** A term as Turtle, abbreviated with the prefixes.  A sequence is `( … )`. */
export function termFormatter (prefixes: Prefixes = {}): (term: RdfJs.Term) => string {
  const writer: any = new Writer({prefixes});
  return term => writer._encodeObject(term);
}

export function termToTurtle (term: RdfJs.Term, prefixes: Prefixes = {}): string {
  return termFormatter(prefixes)(term);
}

/** A graph as readable Turtle. */
export async function toTurtle (quads: Iterable<RdfJs.Quad>, prefixes: Prefixes = {}): Promise<string> {
  const writer = new Writer({format: "Turtle", prefixes});
  topoWrite(writer as any, quads as any);
  const turtle = await new Promise<string>((resolve, reject) =>
    writer.end((err: any, result: string) => err ? reject(err) : resolve(result)));
  return expandLiterals(reindent(turtle));
}
