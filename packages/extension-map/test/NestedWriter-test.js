// rdf-array: sequence terms, and rdf:first and rdf:rest as ordinary triples
const {expect} = require("chai");
const {Parser} = require("n3");
const {Writer} = require("../lib/NestedWriter.js");

const write = (quads) => new Promise((resolve, reject) => {
  const writer = new Writer(null, {format: "text/turtle", version: 1.1, indent: "  "});
  writer.addQuads(quads);
  writer.end((error, result) => error ? reject(error) : resolve(result));
});
const read = (turtle) => new Parser({baseIRI: "http://a/"}).parse(turtle);

describe("NestedWriter", () => {
  it("writes a sequence in place", async () => {
    const out = await write(read('<http://a/s> <http://a/p> ("a" <http://a/m> ("b") ()) .'));
    expect(out).to.include('("a" <http://a/m> ("b") ())');
    expect(read(out)[0].object.termType).to.equal("Sequence");
  });

  it("writes a sequence as a subject", async () => {
    const out = await write(read('("a") <http://a/p> "b" .'));
    expect(read(out)[0].subject.termType).to.equal("Sequence");
  });

  it("keeps rdf:first and rdf:rest triples as triples", async () => {
    const ladder = `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      <http://a/l> rdf:first <http://a/m> ; rdf:rest rdf:nil .`;
    const out = await write(read(ladder));
    expect(read(out)).to.have.length(2);
    expect(out).to.not.include("(");
  });
});
