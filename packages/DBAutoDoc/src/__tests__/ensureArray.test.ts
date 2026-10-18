import { describe, it, expect } from "vitest";
import { EnsureArray } from "../utils/ensureArray.js";

describe("ensureArray", () => {
  it("passes through a normal array", () => {
    const input = [{ index: 1, action: "keep" }, { index: 2, action: "remove" }];
    expect(EnsureArray(input)).toEqual(input);
  });

  it("returns empty array for null", () => {
    expect(EnsureArray(null)).toEqual([]);
  });

  it("returns empty array for undefined", () => {
    expect(EnsureArray(undefined)).toEqual([]);
  });

  it("extracts array from wrapper object with single array property", () => {
    const input = { proposals: [{ index: 1, action: "keep" }] };
    expect(EnsureArray(input)).toEqual([{ index: 1, action: "keep" }]);
  });

  it("wraps single object with index/action in array", () => {
    const input = { index: 1, action: "keep", reasoning: "only PK" };
    const result = EnsureArray(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(input);
  });

  it("wraps single object with verdict in array", () => {
    const input = { verdict: "confirm", confidence: 0.9 };
    const result = EnsureArray(input);
    expect(result).toHaveLength(1);
  });

  it("returns empty array for unrecognized object shape", () => {
    const input = { foo: "bar", baz: 42 };
    expect(EnsureArray(input)).toEqual([]);
  });

  it("returns empty array for string input", () => {
    expect(EnsureArray("not an array" as unknown as null)).toEqual([]);
  });

  it("handles empty array", () => {
    expect(EnsureArray([])).toEqual([]);
  });

  it("handles object with multiple array properties (ambiguous)", () => {
    const input = { a: [1, 2], b: [3, 4] };
    // Ambiguous - should return empty rather than guess
    expect(EnsureArray(input)).toEqual([]);
  });
});
