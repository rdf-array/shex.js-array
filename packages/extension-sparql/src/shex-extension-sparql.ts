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

/**
 * Comunica prefixes the blank nodes of a CONSTRUCT's quads ("bc_0_") but not
 * the ones inside a sequence term, so one node arrives under two labels and
 * the writer can't nest it.  Drop the prefix everywhere.
 */
function unprefixBlanks (term: any): any {
  if (term.termType === "BlankNode")
    return {termType: "BlankNode", value: term.value.replace(/^bc_\d+_/, "")};
  if (term.termType === "Sequence")
    return {termType: "Sequence", value: term.value, elements: [...term.elements].map(unprefixBlanks)};
  return term;
}

/** A graph as readable Turtle. */
export async function toTurtle (quads: Iterable<RdfJs.Quad>, prefixes: Prefixes = {}): Promise<string> {
  const writer = new Writer({format: "Turtle", prefixes});
  topoWrite(writer as any, [...quads].map(q => ({
    subject: unprefixBlanks(q.subject), predicate: q.predicate,
    object: unprefixBlanks(q.object), graph: unprefixBlanks(q.graph),
  })) as any);
  const turtle = await new Promise<string>((resolve, reject) =>
    writer.end((err: any, result: string) => err ? reject(err) : resolve(result)));
  return sparqlStyle(expandLiterals(reindent(breakBlanks(turtle))));
}

/** Apply `fn` to each stretch of Turtle outside string literals and IRIs. */
function outsideStrings (turtle: string, fn: (c: string, i: number, out: string[]) => number): string {
  const out: string[] = [];
  let quote = "";
  for (let i = 0; i < turtle.length;) {
    const c = turtle[i];
    if (quote) {
      if (c === "\\") { out.push(turtle.substr(i, 2)); i += 2; continue; }
      if (turtle.startsWith(quote, i)) { out.push(quote); i += quote.length; quote = ""; continue; }
      out.push(c); ++i; continue;
    }
    if (c === '"' || c === "'") {
      quote = turtle.startsWith(c.repeat(3), i) ? c.repeat(3) : c;
      out.push(quote); i += quote.length; continue;
    }
    if (c === "<") {
      const end = turtle.indexOf(">", i);
      if (end !== -1) { out.push(turtle.slice(i, end + 1)); i = end + 1; continue; }
    }
    i += fn(c, i, out);
  }
  return out.join("");
}

/** `[ :p :o ]` on one line becomes the same block `[` ... `]` that longer ones get. */
function breakBlanks (turtle: string): string {
  return outsideStrings(turtle, (c, i, out) => {
    if (c === "[" && turtle[i + 1] === " ") { out.push("[\n"); return 2; }
    if (c === " " && turtle[i + 1] === "]") { out.push("\n"); return 1; }
    out.push(c); return 1;
  });
}

/** `@prefix p: <i>.` as `PREFIX p: <i>`, and ` .` to end a statement. */
function sparqlStyle (turtle: string): string {
  const prefixed = turtle.replace(/^@prefix (\S*) (<[^>]*>)\.$/gm, "PREFIX $1 $2");
  return outsideStrings(prefixed, (c, i, out) => {
    out.push(c === "." && prefixed[i + 1] === "\n" && prefixed[i - 1] !== " " && /[^\s]/.test(prefixed[i - 1] ?? " ") ? " ." : c);
    return 1;
  });
}
