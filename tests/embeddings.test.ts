import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_EMBED_MODEL,
  EMBEDDING_DIMS,
  TRIGRAM_MODEL,
  getEmbedding,
  getPlaceholderEmbedding,
} from "../src/lib/db";

describe("getPlaceholderEmbedding", () => {
  it(`produces ${EMBEDDING_DIMS} dims`, () => {
    assert.equal(getPlaceholderEmbedding("photosynthesis").length, 384);
  });

  it("is deterministic", () => {
    const a = getPlaceholderEmbedding("cellular respiration");
    const b = getPlaceholderEmbedding("cellular respiration");
    assert.deepEqual(a, b);
  });

  it("is L2-normalized", () => {
    const vec = getPlaceholderEmbedding("mitochondria is the powerhouse");
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    assert.ok(Math.abs(norm - 1) < 1e-9, `norm was ${norm}`);
  });

  it("returns a zero vector for empty input", () => {
    assert.deepEqual(
      getPlaceholderEmbedding("   "),
      new Array(384).fill(0)
    );
  });

  it("separates unrelated texts", () => {
    const a = getPlaceholderEmbedding("photosynthesis converts light energy");
    const b = getPlaceholderEmbedding("photosynthesis converts light energy");
    const c = getPlaceholderEmbedding("quantum chromodynamics quark gluon");
    const dot = (x: number[], y: number[]) =>
      x.reduce((s, v, i) => s + v * y[i], 0);
    assert.ok(dot(a, b) > dot(a, c));
  });
});

describe("getEmbedding", () => {
  it("falls back to trigram without an API key (no network)", async () => {
    const prev = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      const { vector, model } = await getEmbedding("hello lecture");
      assert.equal(model, TRIGRAM_MODEL);
      assert.equal(vector.length, EMBEDDING_DIMS);
    } finally {
      if (prev === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = prev;
    }
  });

  it("exposes the default embedding model id", () => {
    assert.equal(DEFAULT_EMBED_MODEL, "openai/text-embedding-3-small");
  });
});
